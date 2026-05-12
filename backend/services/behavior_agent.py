import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

"""Behavior Analysis Agent â€” AI-powered student behavior profiling engine.

Analyzes *how* a student works during an exam to produce a Trust Score (0â€“100):
  1. Typing patterns  â€” keystroke velocity, rhythm, bursts vs pauses
  2. Code progression â€” organic growth vs bulk-paste jumps
  3. Focus/engagement â€” active vs idle time, interaction density
  4. Anomaly detection â€” sudden skill jumps, timing anomalies
  5. AI reasoning     â€” Cerebras-generated behavioral narrative

Works alongside the existing ProctorAgent (which detects violations)
to provide a holistic integrity picture.
"""

import json
import math
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

from services.ai_service import cerebras_chat, parse_json
from database import get_pool


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Constants & Weights
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# Trust score component weights (must sum to 1.0)
WEIGHT_TYPING    = 0.25
WEIGHT_PROGRESS  = 0.25
WEIGHT_ENGAGE    = 0.25
WEIGHT_ANOMALY   = 0.25

# Typing naturalness thresholds
NATURAL_WPM_MIN = 15          # Minimum natural typing speed (words per min)
NATURAL_WPM_MAX = 120         # Maximum realistic typing speed
BURST_THRESHOLD_MS = 50       # Keypresses faster than this = likely paste
IDLE_THRESHOLD_SEC = 30       # Seconds of no activity = idle gap
LONG_IDLE_SEC = 120           # Very long idle

# Code progression thresholds
SUSPICIOUS_JUMP_LINES = 15    # Adding 15+ lines in one snapshot = suspicious
HEALTHY_BACKTRACK_RATIO = 0.3 # Up to 30% deletions is normal

# Engagement
MIN_ENGAGEMENT_RATIO = 0.4    # At least 40% active time expected


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Analysis Tools
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def analyze_typing_patterns(events: list[dict]) -> dict:
    """Analyze keystroke events for naturalness.

    Expects events with: type='keystroke', timestamp (ISO), gap_ms (int)
    """
    keystrokes = [e for e in events if e.get("type") == "keystroke"]
    if len(keystrokes) < 5:
        return {
            "score": 70,  # Neutral â€” not enough data
            "total_keystrokes": len(keystrokes),
            "avg_wpm": 0,
            "rhythm_consistency": 0,
            "burst_count": 0,
            "idle_gaps": 0,
            "assessment": "insufficient_data",
        }

    # Collect inter-keystroke intervals
    intervals = [k.get("gap_ms", 200) for k in keystrokes if k.get("gap_ms") is not None]
    if not intervals:
        intervals = [200]

    # Typing speed estimate (characters / minute â†’ WPM)
    total_time_ms = sum(intervals)
    total_time_min = max(total_time_ms / 60000, 0.1)
    chars_per_min = len(keystrokes) / total_time_min
    wpm = chars_per_min / 5  # Standard: 5 chars = 1 word

    # Rhythm consistency â€” lower StdDev = more robotic/paste-like
    rhythm_std = statistics.stdev(intervals) if len(intervals) >= 2 else 0
    rhythm_mean = statistics.mean(intervals) if intervals else 200
    cv = rhythm_std / rhythm_mean if rhythm_mean > 0 else 0  # Coefficient of variation

    # Burst detection (very fast sequences)
    burst_count = sum(1 for gap in intervals if gap < BURST_THRESHOLD_MS)
    burst_ratio = burst_count / len(intervals) if intervals else 0

    # Idle gap detection
    idle_gaps = sum(1 for gap in intervals if gap > IDLE_THRESHOLD_SEC * 1000)
    long_idles = sum(1 for gap in intervals if gap > LONG_IDLE_SEC * 1000)

    # â”€â”€ Score calculation â”€â”€
    score = 100.0

    # Penalize unnatural speed
    if wpm < NATURAL_WPM_MIN:
        score -= 15  # Suspiciously slow
    elif wpm > NATURAL_WPM_MAX:
        score -= 25  # Suspiciously fast (paste-like)

    # Penalize too-uniform rhythm (robotic)
    if cv < 0.2 and len(intervals) > 20:
        score -= 20  # Very uniform = likely automated

    # Penalize high burst ratio (paste events)
    if burst_ratio > 0.3:
        score -= min(burst_ratio * 50, 30)

    # Penalize excessive idle
    if long_idles > 3:
        score -= min(long_idles * 5, 15)

    # Reward natural variation
    if 0.4 < cv < 1.2 and NATURAL_WPM_MIN <= wpm <= NATURAL_WPM_MAX:
        score = min(score + 10, 100)

    score = max(0, min(100, round(score)))

    assessment = "natural"
    if score < 40:
        assessment = "highly_suspicious"
    elif score < 60:
        assessment = "suspicious"
    elif score < 75:
        assessment = "slightly_unusual"

    return {
        "score": score,
        "total_keystrokes": len(keystrokes),
        "avg_wpm": round(wpm, 1),
        "rhythm_consistency": round(cv, 3),
        "burst_count": burst_count,
        "burst_ratio": round(burst_ratio, 3),
        "idle_gaps": idle_gaps,
        "long_idles": long_idles,
        "avg_interval_ms": round(rhythm_mean, 1),
        "interval_stddev_ms": round(rhythm_std, 1),
        "assessment": assessment,
    }


def analyze_code_progression(snapshots: list[dict]) -> dict:
    """Analyze code snapshots for organic growth patterns.

    Expects snapshots with: timestamp (ISO), line_count (int), char_count (int)
    """
    if len(snapshots) < 2:
        return {
            "score": 70,
            "total_snapshots": len(snapshots),
            "growth_rate_lpm": 0,
            "max_jump": 0,
            "suspicious_jumps": 0,
            "backtrack_ratio": 0,
            "assessment": "insufficient_data",
        }

    # Sort by timestamp
    sorted_snaps = sorted(snapshots, key=lambda s: s.get("timestamp", ""))

    # Calculate deltas
    deltas = []
    jumps = []
    backtracks = 0
    total_additions = 0

    for i in range(1, len(sorted_snaps)):
        prev_lines = sorted_snaps[i - 1].get("line_count", 0)
        curr_lines = sorted_snaps[i].get("line_count", 0)
        delta = curr_lines - prev_lines
        deltas.append(delta)

        if delta > 0:
            total_additions += delta
        if delta < 0:
            backtracks += abs(delta)
        if delta >= SUSPICIOUS_JUMP_LINES:
            jumps.append({
                "snapshot_index": i,
                "lines_added": delta,
                "timestamp": sorted_snaps[i].get("timestamp", ""),
            })

    # Growth rate (lines per minute)
    first_ts = _parse_ts(sorted_snaps[0].get("timestamp", ""))
    last_ts = _parse_ts(sorted_snaps[-1].get("timestamp", ""))
    duration_min = 1.0
    if first_ts and last_ts:
        duration_min = max((last_ts - first_ts).total_seconds() / 60, 1.0)

    final_lines = sorted_snaps[-1].get("line_count", 0)
    growth_rate = final_lines / duration_min

    # Backtrack ratio
    backtrack_ratio = backtracks / max(total_additions, 1)

    max_jump = max(deltas) if deltas else 0

    # â”€â”€ Score â”€â”€
    score = 100.0

    # Penalize suspicious jumps
    if len(jumps) > 0:
        score -= min(len(jumps) * 15, 40)

    # Penalize very large single jumps
    if max_jump >= 30:
        score -= 20
    elif max_jump >= SUSPICIOUS_JUMP_LINES:
        score -= 10

    # Penalize zero backtracking (too perfect â€” likely pasted)
    if backtrack_ratio < 0.05 and final_lines > 10:
        score -= 15

    # Penalize very high backtrack (struggling or undoing pastes)
    if backtrack_ratio > 0.6:
        score -= 10

    # Reward healthy iterative pattern
    if 0.05 <= backtrack_ratio <= HEALTHY_BACKTRACK_RATIO and len(jumps) == 0:
        score = min(score + 10, 100)

    score = max(0, min(100, round(score)))

    assessment = "organic"
    if score < 40:
        assessment = "highly_suspicious"
    elif score < 60:
        assessment = "suspicious"
    elif score < 75:
        assessment = "slightly_unusual"

    return {
        "score": score,
        "total_snapshots": len(snapshots),
        "growth_rate_lpm": round(growth_rate, 2),
        "max_jump": max_jump,
        "suspicious_jumps": len(jumps),
        "jump_details": jumps[:5],  # Top 5
        "backtrack_ratio": round(backtrack_ratio, 3),
        "final_line_count": final_lines,
        "duration_minutes": round(duration_min, 1),
        "assessment": assessment,
    }


def analyze_engagement(events: list[dict], session_duration_sec: int = 0) -> dict:
    """Analyze focus and engagement patterns.

    Expects events with: type (keystroke|mouse|scroll|focus|blur|idle), timestamp
    """
    if not events:
        return {
            "score": 70,
            "active_ratio": 0,
            "interaction_density": 0,
            "focus_switches": 0,
            "idle_periods": 0,
            "assessment": "insufficient_data",
        }

    # Parse timestamps
    timestamps = []
    for e in events:
        ts = _parse_ts(e.get("timestamp", ""))
        if ts:
            timestamps.append(ts)

    if not timestamps:
        return {
            "score": 70, "active_ratio": 0, "interaction_density": 0,
            "focus_switches": 0, "idle_periods": 0, "assessment": "insufficient_data",
        }

    timestamps.sort()
    first_ts = timestamps[0]
    last_ts = timestamps[-1]
    total_sec = max((last_ts - first_ts).total_seconds(), 1)
    if session_duration_sec > 0:
        total_sec = max(total_sec, session_duration_sec)

    # Count event types
    active_events = [e for e in events if e.get("type") in ("keystroke", "mouse", "scroll")]
    blur_events = [e for e in events if e.get("type") == "blur"]
    focus_events = [e for e in events if e.get("type") == "focus"]
    idle_events = [e for e in events if e.get("type") == "idle"]

    # Interaction density (active events per minute)
    total_min = total_sec / 60
    interaction_density = len(active_events) / max(total_min, 0.5)

    # Estimate active time: total - idle periods
    idle_total_sec = len(idle_events) * IDLE_THRESHOLD_SEC
    active_sec = max(total_sec - idle_total_sec, 0)
    active_ratio = active_sec / total_sec

    # Focus switches (blur â†’ focus pairs)
    focus_switches = min(len(blur_events), len(focus_events))

    # â”€â”€ Score â”€â”€
    score = 100.0

    if active_ratio < MIN_ENGAGEMENT_RATIO:
        score -= 25

    if interaction_density < 5:  # Very few interactions per minute
        score -= 15
    elif interaction_density > 300:  # Unrealistically high
        score -= 20

    if focus_switches > 10:
        score -= min(focus_switches * 2, 20)

    if len(idle_events) > 5:
        score -= min(len(idle_events) * 3, 15)

    score = max(0, min(100, round(score)))

    assessment = "engaged"
    if score < 40:
        assessment = "disengaged"
    elif score < 60:
        assessment = "partially_engaged"
    elif score < 75:
        assessment = "inconsistent"

    return {
        "score": score,
        "active_ratio": round(active_ratio, 3),
        "interaction_density": round(interaction_density, 1),
        "focus_switches": focus_switches,
        "idle_periods": len(idle_events),
        "total_events": len(events),
        "active_events": len(active_events),
        "session_duration_sec": round(total_sec),
        "assessment": assessment,
    }


def detect_anomalies(
    typing: dict, progression: dict, engagement: dict,
    time_spent_sec: int = 0, problem_difficulty: str = "medium",
) -> dict:
    """Detect behavioral anomalies across all metrics."""
    anomalies: list[dict] = []

    # 1. Speed anomaly â€” finished too fast for difficulty
    expected_min = {"easy": 5, "medium": 15, "hard": 30}.get(problem_difficulty, 15)
    if time_spent_sec > 0 and time_spent_sec < expected_min * 60 * 0.3:
        anomalies.append({
            "type": "speed_anomaly",
            "severity": "high",
            "description": f"Completed in {time_spent_sec // 60}m â€” unusually fast for {problem_difficulty} difficulty",
        })

    # 2. Typing-code mismatch â€” lots of code, few keystrokes
    final_lines = progression.get("final_line_count", 0)
    total_keys = typing.get("total_keystrokes", 0)
    if final_lines > 15 and total_keys < final_lines * 5:
        anomalies.append({
            "type": "typing_code_mismatch",
            "severity": "critical",
            "description": f"{final_lines} lines of code with only {total_keys} keystrokes â€” likely pasted from external source",
        })

    # 3. Burst-paste pattern
    if typing.get("burst_ratio", 0) > 0.4:
        anomalies.append({
            "type": "burst_paste_pattern",
            "severity": "high",
            "description": f"{typing.get('burst_ratio', 0) * 100:.0f}% of keystrokes in rapid bursts â€” indicates pasting",
        })

    # 4. Suspicious code jumps
    if progression.get("suspicious_jumps", 0) > 0:
        anomalies.append({
            "type": "code_jump",
            "severity": "high",
            "description": f"{progression['suspicious_jumps']} sudden code jumps detected (â‰¥{SUSPICIOUS_JUMP_LINES} lines added at once)",
        })

    # 5. Disengagement
    if engagement.get("active_ratio", 1) < 0.3:
        anomalies.append({
            "type": "low_engagement",
            "severity": "medium",
            "description": f"Only {engagement.get('active_ratio', 0) * 100:.0f}% active time â€” possible unfocused or away from screen",
        })

    # 6. Zero-backtrack perfection
    if progression.get("backtrack_ratio", 0) < 0.02 and final_lines > 15:
        anomalies.append({
            "type": "zero_backtrack",
            "severity": "medium",
            "description": "Code written with virtually no corrections â€” unusually perfect for live coding",
        })

    # â”€â”€ Score: start at 100, deduct per anomaly â”€â”€
    penalty = 0
    for a in anomalies:
        if a["severity"] == "critical":
            penalty += 30
        elif a["severity"] == "high":
            penalty += 20
        elif a["severity"] == "medium":
            penalty += 10
        else:
            penalty += 5

    score = max(0, min(100, 100 - penalty))

    return {
        "score": score,
        "anomalies": anomalies,
        "anomaly_count": len(anomalies),
        "critical_count": sum(1 for a in anomalies if a["severity"] == "critical"),
        "high_count": sum(1 for a in anomalies if a["severity"] == "high"),
    }


def compute_trust_score(
    typing: dict, progression: dict, engagement: dict, anomaly: dict,
) -> dict:
    """Compute weighted composite Trust Score (0â€“100)."""
    t = typing.get("score", 70)
    p = progression.get("score", 70)
    e = engagement.get("score", 70)
    a = anomaly.get("score", 100)

    raw = (
        t * WEIGHT_TYPING +
        p * WEIGHT_PROGRESS +
        e * WEIGHT_ENGAGE +
        a * WEIGHT_ANOMALY
    )
    trust_score = max(0, min(100, round(raw)))

    if trust_score >= 80:
        level = "trusted"
        color = "#10b981"  # green
    elif trust_score >= 60:
        level = "moderate"
        color = "#f59e0b"  # amber
    elif trust_score >= 40:
        level = "suspicious"
        color = "#f97316"  # orange
    else:
        level = "untrusted"
        color = "#ef4444"  # red

    return {
        "trust_score": trust_score,
        "trust_level": level,
        "color": color,
        "components": {
            "typing_naturalness": t,
            "code_progression": p,
            "engagement": e,
            "anomaly_score": a,
        },
        "weights": {
            "typing": WEIGHT_TYPING,
            "progression": WEIGHT_PROGRESS,
            "engagement": WEIGHT_ENGAGE,
            "anomaly": WEIGHT_ANOMALY,
        },
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Main Agent â€” orchestrates the full analysis
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def agent_analyze_behavior(
    session_id: str,
    *,
    user_id: str = "",
    exam_title: str = "",
    problem_difficulty: str = "medium",
) -> dict:
    """Run the behavior analysis agent on a session.

    Gathers behavior events from DB, runs all analyzers,
    computes trust score, and optionally reasons via AI.
    """
    # â”€â”€ Step 1: Fetch behavior events â”€â”€
    events = await _fetch_behavior_events(session_id)
    if not events:
        return {
            "session_id": session_id,
            "trust_score": 0,
            "trust_level": "no_data",
            "message": "No behavior events recorded for this session.",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

    # Separate event types
    keystroke_events = [e for e in events if e.get("type") == "keystroke"]
    snapshot_events = [e for e in events if e.get("type") == "code_snapshot"]
    all_engagement = events  # All events contribute to engagement

    # Session duration
    time_spent = 0
    ts_list = [_parse_ts(e.get("timestamp", "")) for e in events]
    ts_list = [t for t in ts_list if t]
    if len(ts_list) >= 2:
        time_spent = int((max(ts_list) - min(ts_list)).total_seconds())

    # â”€â”€ Step 2: Run each analyzer â”€â”€
    typing = analyze_typing_patterns(events)
    progression = analyze_code_progression(snapshot_events)
    engagement = analyze_engagement(all_engagement, time_spent)
    anomaly = detect_anomalies(
        typing, progression, engagement,
        time_spent_sec=time_spent,
        problem_difficulty=problem_difficulty,
    )

    # â”€â”€ Step 3: Compute trust score â”€â”€
    trust = compute_trust_score(typing, progression, engagement, anomaly)

    # â”€â”€ Step 4: AI reasoning â”€â”€
    ai_insights = await _ai_behavior_reason(
        typing=typing,
        progression=progression,
        engagement=engagement,
        anomaly=anomaly,
        trust=trust,
        user_id=user_id,
        exam_title=exam_title,
    )

    # â”€â”€ Step 5: Compose result â”€â”€
    result = {
        "session_id": session_id,
        "user_id": user_id,
        "exam_title": exam_title,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "trust_score": trust["trust_score"],
        "trust_level": trust["trust_level"],
        "trust_color": trust["color"],
        "score_components": trust["components"],
        "typing_analysis": typing,
        "code_progression": progression,
        "engagement_metrics": engagement,
        "anomalies": anomaly,
        "ai_insights": ai_insights,
        "total_events": len(events),
        "session_duration_sec": time_spent,
    }

    # Persist
    try:
        result["analysis_id"] = await save_behavior_analysis(result)
    except Exception as e:
        print(f"[BehaviorAgent] Save error: {e}")

    return result


async def agent_generate_behavior_report(
    session_id: str,
    *,
    user_id: str = "",
    exam_title: str = "",
    candidate_name: str = "",
) -> dict:
    """Generate a detailed AI behavior report for an exam session."""
    analysis = await agent_analyze_behavior(
        session_id, user_id=user_id, exam_title=exam_title,
    )

    report_prompt = f"""Generate a professional behavioral analysis report for this exam session.

Candidate: {candidate_name or user_id}
Exam: {exam_title or "Assessment"}
Session: {session_id}

Behavioral Analysis Data:
{json.dumps(analysis, indent=2, default=str)}

Write a report with these sections:
1. EXECUTIVE SUMMARY â€” 2-3 sentences on the candidate's behavior profile
2. TYPING BEHAVIOR â€” Was typing natural? Any paste patterns?
3. CODE DEVELOPMENT â€” Was code built iteratively or pasted in chunks?
4. ENGAGEMENT PROFILE â€” Was the candidate actively engaged throughout?
5. ANOMALIES â€” Any suspicious behavioral patterns?
6. TRUST ASSESSMENT â€” Overall trust score explanation
7. RECOMMENDATION â€” For the examiner

Return as JSON:
{{
    "executive_summary": "...",
    "typing_behavior": "...",
    "code_development": "...",
    "engagement_profile": "...",
    "anomalies": "...",
    "trust_assessment": "...",
    "recommendation": "...",
    "overall_verdict": "trusted | moderate_concern | needs_review | integrity_concern",
    "confidence": 0.0 to 1.0
}}"""

    try:
        result = await cerebras_chat(
            [
                {"role": "system", "content": "You are a behavioral analysis expert for exam integrity. Generate evidence-based reports. Respond ONLY with valid JSON."},
                {"role": "user", "content": report_prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        report = parse_json(content)
        if report:
            return {
                "session_id": session_id,
                "user_id": user_id,
                "candidate_name": candidate_name,
                "exam_title": exam_title,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "trust_score": analysis["trust_score"],
                "trust_level": analysis["trust_level"],
                "report": report,
                "raw_analysis": analysis,
            }
    except Exception as e:
        print(f"[BehaviorAgent] Report generation error: {e}")

    # Fallback
    return {
        "session_id": session_id,
        "user_id": user_id,
        "candidate_name": candidate_name,
        "exam_title": exam_title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "trust_score": analysis.get("trust_score", 0),
        "trust_level": analysis.get("trust_level", "unknown"),
        "report": {
            "executive_summary": f"Session analyzed with trust score {analysis.get('trust_score', 0)}/100 ({analysis.get('trust_level', 'unknown')}).",
            "recommendation": "Review session data manually.",
            "overall_verdict": analysis.get("trust_level", "unknown"),
            "confidence": 0.5,
        },
        "raw_analysis": analysis,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  DB Persistence
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

_BEHAVIOR_EVENTS_SQL = """
CREATE TABLE IF NOT EXISTS behavior_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL,
    user_id         VARCHAR(50),
    event_type      VARCHAR(30)  NOT NULL,
    event_data      JSON,
    timestamp       TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_session (session_id),
    INDEX idx_user (user_id),
    INDEX idx_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_BEHAVIOR_ANALYSIS_SQL = """
CREATE TABLE IF NOT EXISTS behavior_analyses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL,
    user_id         VARCHAR(50),
    exam_title      VARCHAR(200),
    trust_score     FLOAT        DEFAULT 0,
    trust_level     VARCHAR(30),
    typing_json     JSON,
    progression_json JSON,
    engagement_json JSON,
    anomalies_json  JSON,
    ai_insights_json JSON,
    full_result_json JSON,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_user (user_id),
    INDEX idx_trust (trust_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_behavior_tables_ready = False


async def _ensure_behavior_tables():
    global _behavior_tables_ready
    if _behavior_tables_ready:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_BEHAVIOR_EVENTS_SQL)
            await cur.execute(_BEHAVIOR_ANALYSIS_SQL)
        await conn.commit()
    _behavior_tables_ready = True


def _to_db_timestamp(value) -> datetime:
    """Coerce a frontend-supplied timestamp into a TIMESTAMP(3) value.

    The frontend (ProctoredCodeEditor) stamps events with `Date.now()`, so
    the value arrives as Unix epoch in **milliseconds**. TiDB rejects that
    when fed straight into a TIMESTAMP column (error 1292). Accept ints
    (ms or seconds), ISO strings, datetime objects, or fall back to "now".
    """
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        # Heuristic: anything bigger than 10^12 is milliseconds, otherwise
        # seconds. Date.now() is ~1.7e12, time.time() is ~1.7e9.
        seconds = value / 1000.0 if value > 1e12 else float(value)
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return datetime.now(timezone.utc)
    if isinstance(value, str) and value:
        # Try ISO first, then numeric string.
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            try:
                return _to_db_timestamp(int(value))
            except (TypeError, ValueError):
                pass
    return datetime.now(timezone.utc)


async def save_behavior_events(session_id: str, user_id: str, events: list[dict]) -> int:
    """Batch-insert behavior events. Returns count inserted."""
    if not events:
        return 0
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                "INSERT INTO behavior_events (session_id, user_id, event_type, event_data, timestamp) "
                "VALUES (%s, %s, %s, %s, %s)",
                [
                    (
                        session_id,
                        user_id,
                        e.get("type", "unknown"),
                        json.dumps(e, default=str),
                        _to_db_timestamp(e.get("timestamp")),
                    )
                    for e in events
                ],
            )
        await conn.commit()
    return len(events)


async def _fetch_behavior_events(session_id: str) -> list[dict]:
    """Fetch all behavior events for a session."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM behavior_events WHERE session_id=%s ORDER BY timestamp ASC",
                (session_id,),
            )
            rows = await cur.fetchall()

    results = []
    for r in rows:
        data = r.get("event_data")
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {}
        elif data is None:
            data = {}
        data["db_id"] = r.get("id")
        data["timestamp"] = (
            r["timestamp"].isoformat()
            if isinstance(r.get("timestamp"), datetime)
            else str(r.get("timestamp", ""))
        )
        data["type"] = r.get("event_type", data.get("type", "unknown"))
        results.append(data)
    return results


async def save_behavior_analysis(result: dict) -> int:
    """Persist a behavior analysis result. Returns the row ID."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO behavior_analyses "
                "(session_id, user_id, exam_title, trust_score, trust_level, "
                "typing_json, progression_json, engagement_json, anomalies_json, "
                "ai_insights_json, full_result_json) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    result.get("session_id"),
                    result.get("user_id"),
                    result.get("exam_title"),
                    result.get("trust_score", 0),
                    result.get("trust_level"),
                    json.dumps(result.get("typing_analysis", {}), default=str),
                    json.dumps(result.get("code_progression", {}), default=str),
                    json.dumps(result.get("engagement_metrics", {}), default=str),
                    json.dumps(result.get("anomalies", {}), default=str),
                    json.dumps(result.get("ai_insights", {}), default=str),
                    json.dumps(result, default=str),
                ),
            )
            row_id = cur.lastrowid
        await conn.commit()
    return row_id


async def get_recent_behavior_analyses(limit: int = 50) -> list[dict]:
    """Get recent behavior analyses for the admin dashboard."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, session_id, user_id, exam_title, trust_score, "
                "trust_level, created_at "
                "FROM behavior_analyses ORDER BY created_at DESC LIMIT %s",
                (limit,),
            )
            rows = await cur.fetchall()
    return [
        {
            **r,
            "created_at": (
                r["created_at"].isoformat()
                if isinstance(r.get("created_at"), datetime)
                else str(r.get("created_at", ""))
            ),
        }
        for r in rows
    ]


async def get_behavior_sessions(limit: int = 50) -> list[dict]:
    """List sessions that have behavior events (for admin to select and analyze)."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT e.session_id, e.user_id,
                       COUNT(e.id) AS event_count,
                       MIN(e.timestamp) AS first_event,
                       MAX(e.timestamp) AS last_event
                FROM behavior_events e
                LEFT JOIN behavior_analyses a ON e.session_id = a.session_id
                WHERE a.session_id IS NULL
                GROUP BY e.session_id, e.user_id
                ORDER BY MAX(e.timestamp) DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = await cur.fetchall()

    return [
        {
            "session_id": r.get("session_id"),
            "user_id": r.get("user_id"),
            "event_count": r.get("event_count", 0),
            "first_event": (
                r["first_event"].isoformat()
                if isinstance(r.get("first_event"), datetime)
                else str(r.get("first_event", ""))
            ),
            "last_event": (
                r["last_event"].isoformat()
                if isinstance(r.get("last_event"), datetime)
                else str(r.get("last_event", ""))
            ),
        }
        for r in rows
    ]


async def get_behavior_dashboard_stats() -> dict:
    """Aggregate stats for the admin behavior dashboard."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Total analyses
            await cur.execute("SELECT COUNT(*) AS total FROM behavior_analyses")
            total = (await cur.fetchone()).get("total", 0)

            # Trust level distribution
            await cur.execute(
                "SELECT trust_level, COUNT(*) AS count FROM behavior_analyses "
                "GROUP BY trust_level"
            )
            dist_rows = await cur.fetchall()
            distribution = {r["trust_level"]: r["count"] for r in dist_rows}

            # Average trust score
            await cur.execute("SELECT AVG(trust_score) AS avg_score FROM behavior_analyses")
            avg_row = await cur.fetchone()
            avg_score = round(avg_row.get("avg_score") or 0, 1)

            # Recent flagged (trust_score < 60)
            await cur.execute(
                "SELECT id, session_id, user_id, exam_title, trust_score, trust_level, created_at "
                "FROM behavior_analyses WHERE trust_score < 60 "
                "ORDER BY created_at DESC LIMIT 10"
            )
            flagged = await cur.fetchall()
            flagged = [
                {
                    **r,
                    "created_at": (
                        r["created_at"].isoformat()
                        if isinstance(r.get("created_at"), datetime)
                        else str(r.get("created_at", ""))
                    ),
                }
                for r in flagged
            ]

    return {
        "total_analyses": total,
        "average_trust_score": avg_score,
        "trust_distribution": distribution,
        "recent_flagged": flagged,
    }


async def clear_behavior_data() -> bool:
    """Clear all behavior events and analyses from the database."""
    await _ensure_behavior_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("TRUNCATE TABLE behavior_events")
            await cur.execute("TRUNCATE TABLE behavior_analyses")
        await conn.commit()
    return True


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Internal helpers
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def _ai_behavior_reason(
    *,
    typing: dict,
    progression: dict,
    engagement: dict,
    anomaly: dict,
    trust: dict,
    user_id: str,
    exam_title: str,
) -> dict:
    """Use Cerebras AI to reason about behavioral patterns."""
    prompt = f"""Analyze this exam session's behavioral data and provide insights.

Candidate: {user_id}
Exam: {exam_title or "Assessment"}

TYPING PATTERNS:
{json.dumps(typing, indent=2, default=str)}

CODE PROGRESSION:
{json.dumps(progression, indent=2, default=str)}

ENGAGEMENT METRICS:
{json.dumps(engagement, indent=2, default=str)}

ANOMALIES DETECTED:
{json.dumps(anomaly, indent=2, default=str)}

TRUST SCORE:
{json.dumps(trust, indent=2, default=str)}

Based on this behavioral data:
1. What does the typing pattern reveal about how the code was produced?
2. Does the code progression look like natural development or external pasting?
3. Was the student genuinely engaged throughout the session?
4. Are the anomalies concerning or explainable?

Respond with JSON:
{{
    "behavioral_summary": "2-3 sentence summary of observed behavior",
    "typing_insight": "What the typing pattern reveals",
    "development_insight": "How the code was likely produced",
    "engagement_insight": "Level and quality of engagement",
    "risk_factors": ["factor1", "factor2"],
    "mitigating_factors": ["factor1", "factor2"],
    "confidence": 0.0 to 1.0,
    "recommendation": "trust | review | flag | investigate"
}}"""

    try:
        result = await cerebras_chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a behavioral analysis AI for exam proctoring. "
                        "Analyze patterns objectively. Be fair â€” consider innocent explanations. "
                        "Respond ONLY with valid JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = parse_json(content)
        if parsed:
            return parsed
    except Exception as e:
        print(f"[BehaviorAgent] AI reasoning error: {e}")

    # Fallback: rule-based
    return {
        "behavioral_summary": f"Session trust score is {trust.get('trust_score', 0)}/100. "
                              f"Typing assessment: {typing.get('assessment', 'unknown')}. "
                              f"Code progression: {progression.get('assessment', 'unknown')}.",
        "typing_insight": typing.get("assessment", "unknown"),
        "development_insight": progression.get("assessment", "unknown"),
        "engagement_insight": engagement.get("assessment", "unknown"),
        "risk_factors": [a["description"] for a in anomaly.get("anomalies", [])],
        "mitigating_factors": [],
        "confidence": 0.5,
        "recommendation": "review" if trust.get("trust_score", 100) < 60 else "trust",
    }


def _parse_ts(ts_str: str) -> datetime | None:
    """Parse an ISO timestamp string."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        try:
            return datetime.strptime(ts_str[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None

