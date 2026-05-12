import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

"""Proctoring Intelligence Agent â€” ReAct-based fraud reasoning engine.

Replaces dumb violation counting with an AI agent that:
  1. Observes the event stream for a session
  2. Correlates signals into fraud patterns
  3. Reasons about intent using Cerebras AI
  4. Decides on action: monitor / warn / flag / terminate
  5. Generates auditable integrity reports

Tools available to the agent:
  - get_event_timeline     â†’ fetch all events for a session
  - get_event_summary      â†’ aggregate counts by type/severity
  - correlate_events       â†’ detect compound fraud patterns
  - calculate_fraud_score  â†’ compute weighted composite score
  - generate_integrity_report â†’ produce final exam integrity report
"""

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from services.ai_service import cerebras_chat, parse_json
from database import get_pool

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Constants & Weights
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# Severity weights for fraud score calculation
SEVERITY_WEIGHTS = {
    "critical": 10,
    "high": 6,
    "medium": 3,
    "low": 1,
}

# Event type risk multipliers â€” higher = more suspicious
EVENT_RISK = {
    # Camera / visual
    "camera_blocked":       8,
    "camera_denied":        7,
    "no_person":            6,
    "multiple_people":      9,
    # Devices
    "phone_detected":       9,
    "suspicious_object":    5,
    # Navigation / focus
    "tab_switch":           4,
    "window_blur":          4,
    "fullscreen_exit":      5,
    # Integrity
    "copy_paste":           6,
    "devtools_attempt":     10,
    "multiple_monitors":    7,
    # Aliases for frontend event names
    "face_not_detected":    6,
    "no_face":              6,
    "multiple_faces":       9,
    "face_lookaway":        5,
    "window_switch":        4,
    "copy_attempt":         6,
    # Camera status
    "camera_started":       0,
}

# Compound pattern definitions â€” combinations that indicate specific fraud types
COMPOUND_PATTERNS = {
    "external_source_copy": {
        "description": "Tab switch followed by content paste â€” likely copying from external source",
        "events": ["tab_switch", "window_switch", "copy_paste", "copy_attempt"],
        "window_seconds": 10,
        "severity": "critical",
        "confidence": 0.85,
    },
    "impersonation": {
        "description": "No person detected while activity continues â€” possible remote access or impersonation",
        "events": ["no_person", "face_not_detected"],
        "min_count": 3,
        "window_seconds": 120,
        "severity": "critical",
        "confidence": 0.70,
    },
    "receiving_answers": {
        "description": "Phone/device detected repeatedly â€” may be receiving answers",
        "events": ["phone_detected"],
        "min_count": 2,
        "window_seconds": 300,
        "severity": "critical",
        "confidence": 0.80,
    },
    "assisted_test": {
        "description": "Multiple people detected with camera blocks â€” someone else may be assisting",
        "events": ["multiple_people", "multiple_faces", "camera_blocked"],
        "window_seconds": 180,
        "severity": "critical",
        "confidence": 0.75,
    },
    "devtools_cheating": {
        "description": "DevTools access attempted â€” trying to inspect or modify exam content",
        "events": ["devtools_attempt"],
        "min_count": 1,
        "severity": "critical",
        "confidence": 0.95,
    },
    "multi_monitor_leak": {
        "description": "External display detected â€” exam content may be visible to others or reference material in use",
        "events": ["multiple_monitors", "tab_switch", "window_switch"],
        "window_seconds": 60,
        "severity": "high",
        "confidence": 0.70,
    },
    "camera_avoidance": {
        "description": "Repeated camera blocks â€” deliberately avoiding monitoring",
        "events": ["camera_blocked"],
        "min_count": 3,
        "window_seconds": 300,
        "severity": "high",
        "confidence": 0.75,
    },
}

# Fraud score thresholds for decisions
THRESHOLD_WARN = 15
THRESHOLD_FLAG = 35
THRESHOLD_CRITICAL = 60
THRESHOLD_TERMINATE = 65

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Tools â€” standalone functions the agent can call
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def tool_get_event_timeline(session_id: str, source: str = "comm") -> list[dict]:
    """Fetch all proctoring events for a session, ordered by time."""
    if source not in ("comm", "skill", "global"):
        raise ValueError(f"Invalid source: {source}. Must be 'comm', 'skill', or 'global'.")
    table_map = {
        "comm": ("comm_proctoring_logs", "session_id"),
        "skill": ("skill_proctoring_logs", "attempt_id"),
        "global": ("global_proctoring_logs", "session_id"),
    }
    table, id_col = table_map[source]

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT * FROM {table} WHERE {id_col}=%s ORDER BY created_at ASC",
                (session_id,),
            )
            rows = await cur.fetchall()
    return [
        {**r, "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", ""))}
        for r in rows
    ]


async def tool_get_event_summary(session_id: str, source: str = "comm") -> dict:
    """Aggregate event counts by type and severity."""
    events = await tool_get_event_timeline(session_id, source)
    if not events:
        return {"total_events": 0, "by_type": {}, "by_severity": {}, "timeline_minutes": 0}

    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}

    for e in events:
        et = e.get("event_type", "unknown")
        sv = e.get("severity", "low")
        by_type[et] = by_type.get(et, 0) + 1
        by_severity[sv] = by_severity.get(sv, 0) + 1

    first = events[0].get("created_at", "")
    last = events[-1].get("created_at", "")

    return {
        "total_events": len(events),
        "by_type": by_type,
        "by_severity": by_severity,
        "first_event": first,
        "last_event": last,
        "timeline_minutes": _minutes_between(first, last),
    }


def tool_correlate_events(events: list[dict]) -> list[dict]:
    """Detect compound fraud patterns from an event timeline."""
    if not events:
        return []

    detected: list[dict] = []
    timestamps: dict[str, list[str]] = {}

    for e in events:
        et = e.get("event_type", "unknown")
        ts = e.get("created_at", "")
        if et not in timestamps:
            timestamps[et] = []
        timestamps[et].append(ts)

    for pattern_name, pattern in COMPOUND_PATTERNS.items():
        required_events = pattern["events"]
        window = pattern.get("window_seconds", 600)
        min_count = pattern.get("min_count")

        if min_count:
            # Single event type that needs to be repeated
            for req in required_events:
                if timestamps.get(req) and len(timestamps[req]) >= min_count:
                    # Check if enough events fall within the window
                    times = sorted(timestamps[req])
                    for i in range(len(times) - min_count + 1):
                        t_start = _parse_ts(times[i])
                        t_end = _parse_ts(times[i + min_count - 1])
                        if t_start and t_end and (t_end - t_start).total_seconds() <= window:
                            detected.append({
                                "pattern": pattern_name,
                                "description": pattern["description"],
                                "severity": pattern["severity"],
                                "confidence": pattern["confidence"],
                                "evidence_count": len(timestamps[req]),
                                "window_start": times[i],
                                "window_end": times[i + min_count - 1],
                            })
                            break
        else:
            # Multiple event types that need to co-occur within a window
            all_present = all(timestamps.get(req) for req in required_events)
            if not all_present:
                continue

            # Check if any combination falls within the time window
            first_type_times = timestamps[required_events[0]]
            for t1_str in first_type_times:
                t1 = _parse_ts(t1_str)
                if not t1:
                    continue
                for other_type in required_events[1:]:
                    for t2_str in timestamps[other_type]:
                        t2 = _parse_ts(t2_str)
                        if t2 and abs((t2 - t1).total_seconds()) <= window:
                            detected.append({
                                "pattern": pattern_name,
                                "description": pattern["description"],
                                "severity": pattern["severity"],
                                "confidence": pattern["confidence"],
                                "evidence": {et: len(timestamps.get(et, [])) for et in required_events},
                                "window_start": min(t1_str, t2_str),
                                "window_end": max(t1_str, t2_str),
                            })
                            break
                    else:
                        continue
                    break

    return detected


def tool_calculate_fraud_score(events: list[dict], patterns: list[dict]) -> dict:
    """Compute a weighted composite fraud score (0â€“100).

    Components:
      - Event-based score: sum of (severity_weight Ã— event_risk) per event
      - Pattern-based score: sum of (pattern_confidence Ã— 30) per pattern
      - Velocity bonus: higher score if events cluster in short windows
    Final score is capped at 100.
    """
    if not events:
        return {"fraud_score": 0, "risk_level": "clean", "components": {}}

    # 1. Event-based score
    event_score = 0.0
    for e in events:
        et = e.get("event_type", "unknown")
        sv = e.get("severity", "low")
        risk = EVENT_RISK.get(et, 2)
        weight = SEVERITY_WEIGHTS.get(sv, 1)
        event_score += risk * weight * 0.25  # Scale factor

    # 2. Pattern-based score
    pattern_score = 0.0
    for p in patterns:
        confidence = p.get("confidence", 0.5)
        if p.get("severity") == "critical":
            pattern_score += confidence * 35
        elif p.get("severity") == "high":
            pattern_score += confidence * 20
        else:
            pattern_score += confidence * 10

    # 3. Velocity â€” how clustered are events?
    velocity_score = 0.0
    if len(events) >= 3:
        first = _parse_ts(events[0].get("created_at", ""))
        last = _parse_ts(events[-1].get("created_at", ""))
        if first and last:
            duration_min = max((last - first).total_seconds() / 60, 1)
            events_per_min = len(events) / duration_min
            if events_per_min > 2:
                velocity_score = min(events_per_min * 3, 15)

    raw_score = event_score + pattern_score + velocity_score
    fraud_score = min(round(raw_score, 1), 100)

    if fraud_score >= THRESHOLD_TERMINATE:
        risk_level = "terminate"
    elif fraud_score >= THRESHOLD_CRITICAL:
        risk_level = "critical"
    elif fraud_score >= THRESHOLD_FLAG:
        risk_level = "flag_for_review"
    elif fraud_score >= THRESHOLD_WARN:
        risk_level = "warn"
    else:
        risk_level = "clean"

    return {
        "fraud_score": fraud_score,
        "risk_level": risk_level,
        "components": {
            "event_based": round(event_score, 1),
            "pattern_based": round(pattern_score, 1),
            "velocity": round(velocity_score, 1),
        },
        "thresholds": {
            "warn": THRESHOLD_WARN,
            "flag": THRESHOLD_FLAG,
            "critical": THRESHOLD_CRITICAL,
            "terminate": THRESHOLD_TERMINATE,
        },
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ReAct Agent â€” the reasoning core
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

AGENT_SYSTEM_PROMPT = """You are the Proctoring Intelligence Agent for an exam assessment platform.
Your job is to analyze proctoring event data from a live exam session and determine
whether the candidate is behaving honestly or committing fraud.

You operate in a ReAct loop: Thought â†’ Action â†’ Observation â†’ Thought â†’ ...

Available tools:
1. analyze_events â€” Given event summary and detected patterns, reason about what happened
2. recommend_action â€” Based on your analysis, recommend: "monitor" | "warn" | "flag_for_review" | "terminate"

IMPORTANT CONTEXT:
- This is a HIGH-STAKES proctored exam (university exam or HR hiring assessment)
- Fraud undermines exam integrity for ALL candidates â€” act decisively when evidence is clear.
- For clear patterns (repeated phone detections, camera blocks, multiple people), recommend termination.
- A single accidental tab switch or brief camera glitch can be forgiven, but repeated violations cannot.

When analyzing, consider:
- Are events isolated incidents or a coordinated pattern?
- Could there be an innocent explanation? (e.g., a single tab switch might be accidental)
- How confident are the detected patterns?
- What is the severity and velocity of violations?

Your response must be valid JSON:
{
    "reasoning": "Step-by-step analysis of the evidence...",
    "fraud_assessment": "clean | suspicious | likely_fraud | confirmed_fraud",
    "confidence": 0.0 to 1.0,
    "recommended_action": "monitor | warn | flag_for_review | terminate",
    "warning_message": "Message to show student if warning (null otherwise)",
    "key_findings": ["Finding 1", "Finding 2"],
    "evidence_summary": "Brief summary for the admin/examiner"
}"""


async def agent_analyze_session(
    session_id: str,
    source: str = "comm",
    *,
    user_id: str = "",
    exam_title: str = "",
) -> dict:
    """Run the ReAct agent on a single session's proctoring data.

    Returns the full analysis including fraud score, patterns, and AI reasoning.
    """
    # â”€â”€ Step 1: Observe â€” gather all data â”€â”€
    events = await tool_get_event_timeline(session_id, source)
    summary = await tool_get_event_summary(session_id, source)

    if not events:
        return {
            "session_id": session_id,
            "fraud_score": 0,
            "risk_level": "clean",
            "patterns": [],
            "ai_reasoning": None,
            "recommended_action": "monitor",
            "message": "No proctoring events recorded for this session.",
        }

    # â”€â”€ Step 2: Correlate â€” detect compound patterns â”€â”€
    patterns = tool_correlate_events(events)

    # â”€â”€ Step 3: Calculate â€” compute fraud score â”€â”€
    score_result = tool_calculate_fraud_score(events, patterns)

    # â”€â”€ Step 4: Reason â€” AI analysis via Cerebras â”€â”€
    ai_analysis = await _ai_reason(
        summary=summary,
        patterns=patterns,
        fraud_score=score_result,
        user_id=user_id,
        exam_title=exam_title,
        event_sample=events[-20:],  # Last 20 events for context
    )

    # â”€â”€ Step 5: Compose result â”€â”€
    return {
        "session_id": session_id,
        "user_id": user_id,
        "exam_title": exam_title,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "total_events": summary["total_events"],
        "event_summary": summary["by_type"],
        "severity_breakdown": summary["by_severity"],
        "fraud_score": score_result["fraud_score"],
        "risk_level": score_result["risk_level"],
        "score_components": score_result["components"],
        "patterns_detected": patterns,
        "ai_analysis": ai_analysis,
        "recommended_action": ai_analysis.get("recommended_action", score_result["risk_level"]),
    }


async def agent_generate_integrity_report(
    session_id: str,
    source: str = "comm",
    *,
    user_id: str = "",
    exam_title: str = "",
    candidate_name: str = "",
) -> dict:
    """Generate a comprehensive, auditable integrity report for a completed exam.

    This is the post-exam report for examiners / HR reviewers.
    """
    # Gather full data
    analysis = await agent_analyze_session(session_id, source, user_id=user_id, exam_title=exam_title)

    # Generate narrative report via AI
    report_prompt = f"""Generate a professional exam integrity report based on this analysis data.

Candidate: {candidate_name or user_id}
Exam: {exam_title or "Assessment"}
Session: {session_id}

Analysis Data:
{json.dumps(analysis, indent=2, default=str)}

Write a professional integrity report with these sections:
1. EXECUTIVE SUMMARY â€” 2-3 sentence overview
2. SESSION OVERVIEW â€” exam duration, total events, timeline
3. VIOLATION ANALYSIS â€” detailed breakdown of each violation category
4. PATTERN ANALYSIS â€” any compound fraud patterns detected and their significance
5. RISK ASSESSMENT â€” fraud score explanation with confidence level
6. RECOMMENDATION â€” clear recommendation for the examiner/HR
7. EVIDENCE LOG â€” key events with timestamps (from the data)

The report should be:
- Factual and evidence-based (cite specific event counts and timestamps)
- Professional tone suitable for university exam boards or HR compliance
- Balanced â€” note both incriminating and potentially innocent explanations
- Actionable â€” clear recommendation at the end

Return as JSON:
{{
    "executive_summary": "...",
    "session_overview": "...",
    "violation_analysis": "...",
    "pattern_analysis": "...",
    "risk_assessment": "...",
    "recommendation": "...",
    "evidence_log": "...",
    "overall_verdict": "clean | minor_concerns | needs_review | integrity_violated",
    "confidence": 0.0 to 1.0
}}"""

    try:
        result = await cerebras_chat(
            [
                {"role": "system", "content": "You are a professional exam integrity analyst. Generate detailed, evidence-based reports. Respond ONLY with valid JSON."},
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
                "fraud_score": analysis["fraud_score"],
                "risk_level": analysis["risk_level"],
                "report": report,
                "raw_analysis": analysis,
            }
    except Exception as e:
        print(f"Integrity report generation error: {e}")

    # Fallback: return analysis without AI narrative
    return {
        "session_id": session_id,
        "user_id": user_id,
        "candidate_name": candidate_name,
        "exam_title": exam_title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "fraud_score": analysis["fraud_score"],
        "risk_level": analysis["risk_level"],
        "report": {
            "executive_summary": f"Session recorded {analysis['total_events']} proctoring events with a fraud score of {analysis['fraud_score']}/100 ({analysis['risk_level']}).",
            "recommendation": analysis["recommended_action"],
            "overall_verdict": analysis["risk_level"],
            "confidence": 0.5,
        },
        "raw_analysis": analysis,
    }


async def agent_batch_analyze(
    session_ids: list[str],
    source: str = "comm",
) -> list[dict]:
    """Analyze multiple sessions in parallel â€” useful for post-exam batch review."""
    async def _safe_analyze(sid: str) -> dict:
        try:
            return await agent_analyze_session(sid, source)
        except Exception as e:
            return {"session_id": sid, "error": str(e)}

    results = await asyncio.gather(*[_safe_analyze(sid) for sid in session_ids])
    results = list(results)
    # Sort by fraud score descending
    results.sort(key=lambda x: x.get("fraud_score", 0), reverse=True)
    return results


async def agent_detect_collusion(
    session_ids: list[str],
    source: str = "comm",
) -> dict:
    """Detect potential collusion between exam sessions.

    Looks for:
    - Clusters of identical violation timing
    - Suspicious similarity in event patterns
    - Groups that triggered the same violations simultaneously
    """
    all_events: dict[str, list[dict]] = {}
    for sid in session_ids:
        try:
            events = await tool_get_event_timeline(sid, source)
            all_events[sid] = events
        except Exception:
            all_events[sid] = []

    # Find temporal clusters â€” sessions with violations at the same time
    clusters: list[dict] = []
    event_times: dict[str, list[tuple[str, str]]] = {}  # session â†’ [(event_type, timestamp)]

    for sid, events in all_events.items():
        for e in events:
            et = e.get("event_type", "")
            ts = e.get("created_at", "")
            if et in ("tab_switch", "copy_paste", "phone_detected"):
                if sid not in event_times:
                    event_times[sid] = []
                event_times[sid].append((et, ts))

    # Compare every pair of sessions for timing overlap
    sids = list(event_times.keys())
    for i in range(len(sids)):
        for j in range(i + 1, len(sids)):
            sid_a, sid_b = sids[i], sids[j]
            coincidences = 0
            for (et_a, ts_a) in event_times[sid_a]:
                t_a = _parse_ts(ts_a)
                if not t_a:
                    continue
                for (et_b, ts_b) in event_times[sid_b]:
                    t_b = _parse_ts(ts_b)
                    if t_b and et_a == et_b and abs((t_b - t_a).total_seconds()) <= 30:
                        coincidences += 1
                        break

            if coincidences >= 2:
                clusters.append({
                    "sessions": [sid_a, sid_b],
                    "coincident_events": coincidences,
                    "suspicion_level": "high" if coincidences >= 4 else "medium",
                    "description": f"{coincidences} violation(s) occurred within 30s of each other across these sessions",
                })

    return {
        "sessions_analyzed": len(session_ids),
        "collusion_clusters": clusters,
        "total_suspicious_pairs": len(clusters),
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  DB persistence â€” store agent analysis results
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

_AGENT_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS proctor_agent_analyses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL,
    source          VARCHAR(20)  DEFAULT 'comm',
    user_id         VARCHAR(50),
    exam_title      VARCHAR(200),
    fraud_score     FLOAT        DEFAULT 0,
    risk_level      VARCHAR(30),
    recommended_action VARCHAR(30),
    patterns_json   JSON,
    ai_analysis_json JSON,
    full_result_json JSON,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_user (user_id),
    INDEX idx_risk (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_REPORT_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS proctor_integrity_reports (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(100) NOT NULL,
    source          VARCHAR(20)  DEFAULT 'comm',
    user_id         VARCHAR(50),
    candidate_name  VARCHAR(100),
    exam_title      VARCHAR(200),
    fraud_score     FLOAT        DEFAULT 0,
    risk_level      VARCHAR(30),
    report_json     JSON,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_agent_tables_ready = False


async def _ensure_agent_tables():
    global _agent_tables_ready
    if _agent_tables_ready:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_AGENT_TABLE_SQL)
            await cur.execute(_REPORT_TABLE_SQL)
        await conn.commit()
    _agent_tables_ready = True


async def save_analysis(result: dict) -> int:
    """Persist an agent analysis result to the database. Returns the row ID."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO proctor_agent_analyses "
                "(session_id, source, user_id, exam_title, fraud_score, risk_level, "
                "recommended_action, patterns_json, ai_analysis_json, full_result_json) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    result.get("session_id"),
                    result.get("source", "comm"),
                    result.get("user_id"),
                    result.get("exam_title"),
                    result.get("fraud_score", 0),
                    result.get("risk_level"),
                    result.get("recommended_action"),
                    json.dumps(result.get("patterns_detected", []), default=str),
                    json.dumps(result.get("ai_analysis", {}), default=str),
                    json.dumps(result, default=str),
                ),
            )
            row_id = cur.lastrowid
        await conn.commit()
    return row_id


async def save_report(report_data: dict) -> int:
    """Persist an integrity report to the database. Returns the row ID."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO proctor_integrity_reports "
                "(session_id, source, user_id, candidate_name, exam_title, "
                "fraud_score, risk_level, report_json) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    report_data.get("session_id"),
                    report_data.get("source", "comm"),
                    report_data.get("user_id"),
                    report_data.get("candidate_name"),
                    report_data.get("exam_title"),
                    report_data.get("fraud_score", 0),
                    report_data.get("risk_level"),
                    json.dumps(report_data, default=str),
                ),
            )
            row_id = cur.lastrowid
        await conn.commit()
    return row_id


async def get_recent_analyses(limit: int = 50) -> list[dict]:
    """Get recent agent analyses for the admin dashboard."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, session_id, source, user_id, exam_title, fraud_score, "
                "risk_level, recommended_action, created_at "
                "FROM proctor_agent_analyses ORDER BY created_at DESC LIMIT %s",
                (limit,),
            )
            rows = await cur.fetchall()
    return [
        {**r, "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", ""))}
        for r in rows
    ]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Internal helpers
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def _ai_reason(
    *,
    summary: dict,
    patterns: list[dict],
    fraud_score: dict,
    user_id: str,
    exam_title: str,
    event_sample: list[dict],
) -> dict:
    """Use Cerebras AI to reason about the proctoring data in a ReAct step."""
    user_prompt = f"""Analyze this exam session's proctoring data:

Candidate: {user_id}
Exam: {exam_title or "Assessment"}

EVENT SUMMARY:
{json.dumps(summary, indent=2, default=str)}

DETECTED FRAUD PATTERNS:
{json.dumps(patterns, indent=2, default=str) if patterns else "None detected"}

COMPUTED FRAUD SCORE:
{json.dumps(fraud_score, indent=2, default=str)}

RECENT EVENTS (last 20):
{json.dumps(event_sample, indent=2, default=str)}

Based on this evidence, provide your analysis. Consider:
1. What story do these events tell? Is there a pattern of deliberate cheating?
2. Could any of these be innocent (accidental tab switch, brief camera glitch)?
3. How confident are you in your assessment?
4. What action should be taken?

Respond with the JSON format specified in your instructions."""

    try:
        result = await cerebras_chat(
            [
                {"role": "system", "content": AGENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = parse_json(content)
        if parsed:
            return parsed
    except Exception as e:
        print(f"Agent AI reasoning error: {e}")

    # Fallback: rule-based reasoning
    action = fraud_score.get("risk_level", "monitor")
    return {
        "reasoning": "AI reasoning unavailable â€” using rule-based assessment.",
        "fraud_assessment": "suspicious" if fraud_score.get("fraud_score", 0) > THRESHOLD_FLAG else "clean",
        "confidence": 0.5,
        "recommended_action": action,
        "warning_message": None,
        "key_findings": [f"{len(patterns)} fraud pattern(s) detected"] if patterns else ["No significant patterns"],
        "evidence_summary": f"Session had {summary.get('total_events', 0)} events with fraud score {fraud_score.get('fraud_score', 0)}/100.",
    }


def _parse_ts(ts_str: str) -> datetime | None:
    """Parse an ISO timestamp string."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        try:
            return datetime.strptime(str(ts_str), "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            return None


def _minutes_between(ts1: str, ts2: str) -> float:
    """Calculate minutes between two timestamp strings."""
    t1, t2 = _parse_ts(ts1), _parse_ts(ts2)
    if t1 and t2:
        return round(abs((t2 - t1).total_seconds()) / 60, 1)
    return 0

