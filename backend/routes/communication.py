"""Communication Skills API routes â€“ integrated from the standalone coms module.

Prefix: /api/communication
Tag: communication

Provides endpoints for four English communication training modules:
  A â€“ Read & Speak
  B â€“ Listen & Repeat (with TTS audio)
  C â€“ Topic Speaking
  D â€“ Grammar Quiz
Plus a performance report endpoint and admin test management.
"""

import asyncio
import json
import os
import random

from fastapi import APIRouter, HTTPException, Request, Body, Depends
from fastapi.responses import JSONResponse

from database import get_pool, get_primary_pool
from services.comm_service import (
    SENTENCES_A,
    SENTENCES_B,
    TOPICS,
    QUESTIONS_BANK,
    run_module_a,
    run_module_b,
    run_module_c,
    get_quiz,
    submit_quiz_answers,
    generate_tts_audio,
)
from services.ai_service import cerebras_chat, parse_json
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/communication", tags=["communication"])
audit_logger = get_audit_logger()
LEGACY_EXAM_TAKER_PERMISSIONS = {
    "tests.view_allocated",
    "tests.attempt",
    "aptitude.attempt",
    "coding.attempt",
    "communication.attempt",
    "results.view_own",
}


async def _insert_unified_proctor_event(
    test_type: str,
    user_id: str,
    session_id: str,
    event_type: str,
    severity: str,
    details: str,
    test_id: str | None = None,
    attempt_id: str | None = None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO proctoring_events_unified
                (test_type, test_id, attempt_id, user_id, session_id, event_type, severity, details)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (test_type, test_id, attempt_id, user_id, session_id, event_type, severity, details),
            )
        await conn.commit()


async def _has_any_permission(user_id: str, permissions: list[str]) -> bool:
    if not user_id:
        return False
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            u = await cur.fetchone()
            if u and u.get("role") == "admin":
                return True
            if u and u.get("role") in ("student", "learner"):
                return any(p in LEGACY_EXAM_TAKER_PERMISSIONS for p in permissions)
            fmt = ",".join(["%s"] * len(permissions))
            await cur.execute(
                f"""
                SELECT 1
                FROM user_role_assignments ura
                JOIN role_permissions rp ON rp.role_id = ura.role_id
                WHERE ura.user_id = %s AND rp.permission_key IN ({fmt})
                LIMIT 1
                """,
                [user_id, *permissions],
            )
            return bool(await cur.fetchone())


async def _require_comm_permission(request: Request, permissions: list[str]) -> str:
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, permissions):
        raise HTTPException(status_code=403, detail="Permission denied")
    return actor


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


async def _log_read_access(request: Request):
    if request.method != "GET":
        return
    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="communication_read",
        query_params={"path": request.url.path, "query": request.url.query},
    )


router.dependencies.append(Depends(_log_read_access))

# â”€â”€â”€ DB helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS comm_performance (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(50)  NOT NULL,
    session_id  VARCHAR(100) NOT NULL DEFAULT 'default',
    module      VARCHAR(60)  NOT NULL,
    question_number INT,
    score       FLOAT        DEFAULT 0,
    max_score   FLOAT        DEFAULT 100,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


async def _ensure_table():
    """Create the table if it does not exist (idempotent)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_CREATE_TABLE_SQL)
        await conn.commit()


async def _save_performance(user_id: str, session_id: str, module: str, question_number: int, score: float, max_score: float = 100):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO comm_performance (user_id, session_id, module, question_number, score, max_score) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (user_id, session_id, module, question_number, score, max_score),
            )
        await conn.commit()


async def _get_completed(user_id: str, module: str) -> list[int]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT DISTINCT question_number FROM comm_performance WHERE user_id=%s AND module=%s",
                (user_id, module),
            )
            rows = await cur.fetchall()
    return [r["question_number"] for r in rows]


# â”€â”€â”€ Lifecycle: create table on first request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_table_ready = False


async def _maybe_init():
    global _table_ready
    if not _table_ready:
        await _ensure_table()
        _table_ready = True


# â”€â”€â”€ GET content endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/moduleA/sentence")
async def get_sentence_a(userId: str | None = None):
    """Get a random sentence for Read & Speak, excluding completed ones."""
    await _maybe_init()
    available = list(range(len(SENTENCES_A)))
    if userId:
        completed = await _get_completed(userId, "Module A - Read & Speak")
        filtered = [i for i in available if i not in completed]
        if filtered:
            available = filtered
    sid = random.choice(available)
    return {"success": True, "sentence_id": sid, "sentence": SENTENCES_A[sid]}


@router.get("/moduleB/sentence")
async def get_sentence_b(userId: str | None = None):
    """Get a random sentence + TTS audio for Listen & Repeat."""
    await _maybe_init()
    available = list(range(len(SENTENCES_B)))
    if userId:
        completed = await _get_completed(userId, "Module B - Listen & Repeat")
        filtered = [i for i in available if i not in completed]
        if filtered:
            available = filtered
    sid = random.choice(available)

    # Generate TTS audio â€” pass the actual sentence text to edge-tts
    tts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "tts")
    audio_url = await generate_tts_audio(SENTENCES_B[sid], sid, tts_dir)

    return {"success": True, "sentence_id": sid, "sentence": SENTENCES_B[sid], "audio_url": audio_url}


@router.get("/moduleC/topic")
async def get_topic(userId: str | None = None):
    """Get a random topic for Topic Speaking."""
    await _maybe_init()
    available = list(range(len(TOPICS)))
    if userId:
        completed = await _get_completed(userId, "Module C - Topic Speaking")
        filtered = [i for i in available if i not in completed]
        if filtered:
            available = filtered
    tid = random.choice(available)
    return {"success": True, "topic_id": tid, "topic": TOPICS[tid]}


@router.get("/moduleD/quiz")
async def get_quiz_endpoint(userId: str | None = None):
    """Get a 5-question grammar quiz, excluding completed ones."""
    await _maybe_init()
    excluded: list[int] = []
    if userId:
        excluded = await _get_completed(userId, "Module D - Grammar Quiz")
    return get_quiz(num_questions=5, excluded_indices=excluded)


# â”€â”€â”€ POST submission endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/moduleA")
async def submit_module_a(request: Request):
    """Submit Read & Speak transcription for AI evaluation."""
    await _maybe_init()
    data = await request.json()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    user_id = data.get("userId") or actor
    session_id = data.get("sessionId", "default")
    sentence_id = data.get("sentenceId")
    transcribed = data.get("transcribedText", "")
    duration = float(data.get("duration", 0))

    if not user_id:
        raise HTTPException(400, "userId is required")
    if user_id != actor:
        raise HTTPException(403, "Permission denied")

    target_sentence = data.get("targetSentence")
    result = await run_module_a(transcribed, duration, sentence_id, target_sentence=target_sentence)

    await _save_performance(
        user_id, session_id, "Module A - Read & Speak",
        sentence_id, result.get("pronunciation_score", 0), 100,
    )
    result["success"] = True
    return result


@router.post("/moduleB")
async def submit_module_b(request: Request):
    """Submit Listen & Repeat transcription for AI evaluation."""
    await _maybe_init()
    data = await request.json()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    user_id = data.get("userId") or actor
    session_id = data.get("sessionId", "default")
    sentence_id = data.get("sentenceId")
    transcribed = data.get("transcribedText", "")
    duration = float(data.get("duration", 0))

    if not user_id:
        raise HTTPException(400, "userId is required")
    if user_id != actor:
        raise HTTPException(403, "Permission denied")

    target_sentence = data.get("targetSentence")
    result = await run_module_b(transcribed, sentence_id, duration, target_sentence=target_sentence)

    await _save_performance(
        user_id, session_id, "Module B - Listen & Repeat",
        sentence_id, result.get("score", 0), 100,
    )
    result["success"] = True
    return result


@router.post("/moduleC")
async def submit_module_c(request: Request):
    """Submit Topic Speaking transcription for AI evaluation."""
    await _maybe_init()
    data = await request.json()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    user_id = data.get("userId") or actor
    session_id = data.get("sessionId", "default")
    topic_id = data.get("topicId")
    transcribed = data.get("transcribedText", "")

    if not user_id:
        raise HTTPException(400, "userId is required")
    if user_id != actor:
        raise HTTPException(403, "Permission denied")

    result = await run_module_c(transcribed, topic_id)
    result["topic_id"] = topic_id

    await _save_performance(
        user_id, session_id, "Module C - Topic Speaking",
        topic_id, result.get("score", 0), 100,
    )
    result["success"] = True
    return result


@router.post("/moduleD/submit")
async def submit_module_d(request: Request):
    """Submit Grammar Quiz answers for evaluation."""
    await _maybe_init()
    data = await request.json()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    user_id = data.get("userId") or actor
    session_id = data.get("sessionId", "default")
    answers = data.get("answers", [])

    if not user_id:
        raise HTTPException(400, "userId is required")
    if user_id != actor:
        raise HTTPException(403, "Permission denied")
    if not answers:
        raise HTTPException(400, "answers are required")

    result = submit_quiz_answers(answers)

    for item in result.get("review", []):
        await _save_performance(
            user_id, session_id, "Module D - Grammar Quiz",
            item.get("question_id", 0),
            100 if item.get("correct") else 0,
            100,
        )
    result["success"] = True
    return result


# â”€â”€â”€ Report endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/report")
async def get_report(request: Request, userId: str, sessionId: str = "default"):
    """Get aggregated performance report per module."""
    await _maybe_init()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT module, AVG(score) AS avg_score, AVG(max_score) AS max_score, COUNT(*) AS attempts "
                "FROM comm_performance WHERE user_id=%s AND session_id=%s GROUP BY module ORDER BY module",
                (userId, sessionId),
            )
            rows = await cur.fetchall()

    modules = []
    total_pct = 0
    count = 0
    total_q = 0

    for r in rows:
        avg_s = float(r["avg_score"] or 0)
        max_s = float(r["max_score"] or 100)
        pct = round((avg_s / max_s * 100) if max_s > 0 else 0, 1)
        modules.append({
            "name": r["module"],
            "average_score": round(avg_s, 2),
            "max_score": round(max_s, 2),
            "percentage": pct,
            "questions_completed": r["attempts"],
        })
        total_pct += pct
        count += 1
        total_q += r["attempts"]

    return {
        "modules": modules,
        "overall_score": round(total_pct / count if count else 0, 1),
        "total_questions": total_q,
    }


# â”€â”€â”€ History endpoint (for the report chart) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/history")
async def get_history(request: Request, userId: str):
    """Get all performance records for a user (for charts)."""
    await _maybe_init()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT module, question_number, score, max_score, created_at "
                "FROM comm_performance WHERE user_id=%s ORDER BY created_at DESC LIMIT 100",
                (userId,),
            )
            rows = await cur.fetchall()

    return {"success": True, "records": rows}


# â”€â”€â”€ Proctoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_PROCTORING_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS comm_proctoring_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(50)   NOT NULL,
    session_id  VARCHAR(100)  NOT NULL DEFAULT 'default',
    event_type  VARCHAR(60)   NOT NULL,
    severity    VARCHAR(20)   DEFAULT 'low',
    details     TEXT,
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_proctor_table_ready = False


async def _ensure_proctor_table():
    global _proctor_table_ready
    if not _proctor_table_ready:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_PROCTORING_TABLE_SQL)
            await conn.commit()
        _proctor_table_ready = True


# â”€â”€ Agent analysis event counter (per session, in-memory) â”€â”€
_agent_event_counter: dict[str, int] = {}
_AGENT_COUNTER_MAX = 1000  # Prevent unbounded growth
_AGENT_TRIGGER_INTERVAL = 5  # run agent every N events
_AGENT_TRIGGER_SEVERITIES = {"high", "critical"}  # always trigger on these


async def _maybe_trigger_agent(session_id: str, severity: str, user_id: str = ""):
    """Fire-and-forget agent analysis on accumulated events."""
    try:
        from services.proctor_agent import agent_analyze_session, save_analysis
        result = await agent_analyze_session(session_id, "comm", user_id=user_id)
        if result.get("fraud_score", 0) > 0:
            await save_analysis({**result, "source": "comm"})
            # Emit real-time alert to admins if score is concerning
            if result.get("fraud_score", 0) >= 35:
                try:
                    from main import sio
                    await sio.emit("agent_alert", {
                        "type": "agent_analysis",
                        "session_id": session_id,
                        "user_id": user_id,
                        "fraud_score": result["fraud_score"],
                        "risk_level": result.get("risk_level"),
                        "recommended_action": result.get("recommended_action"),
                    }, room="admin_room")
                except Exception:
                    pass

            # AUTO-TERMINATE: If agent recommends termination, notify the student
            if result.get("recommended_action") == "terminate" or result.get("risk_level") == "terminate":
                try:
                    from main import sio
                    terminate_payload = {
                        "session_id": session_id,
                        "reason": "Proctoring Intelligence Agent detected critical integrity violations.",
                        "fraud_score": result["fraud_score"],
                        "risk_level": result.get("risk_level"),
                        "key_findings": result.get("ai_analysis", {}).get("key_findings", []),
                    }
                    await sio.emit("agent_terminate", terminate_payload, room=f"session_{session_id}")
                    if user_id:
                        await sio.emit("agent_terminate", terminate_payload, room=f"student_{user_id}")
                    # Also notify admins about the termination
                    await sio.emit("agent_alert", {
                        "type": "auto_terminate",
                        "session_id": session_id,
                        "user_id": user_id,
                        "fraud_score": result["fraud_score"],
                        "risk_level": "terminate",
                        "recommended_action": "terminate",
                    }, room="admin_room")
                    print(f"[ProctorAgent] AUTO-TERMINATE sent for session {session_id} (score: {result['fraud_score']})")
                except Exception as e:
                    print(f"[ProctorAgent] terminate emit error: {e}")
    except Exception as e:
        print(f"[ProctorAgent] background analysis error: {e}")


@router.post("/proctoring/log")
async def proctoring_log(request: Request):
    """Log a proctoring violation event."""
    await _require_comm_permission(request, ["communication.attempt", "communication.assign"])
    await _ensure_proctor_table()
    data = await request.json()
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    user_id = data.get("userId", "") or actor
    if not (can_assign or user_id == actor):
        raise HTTPException(403, "Permission denied")
    session_id = data.get("sessionId", "default")
    event_type = data.get("eventType", "unknown")
    severity = data.get("severity", "low")
    details = data.get("details", "")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO comm_proctoring_logs (user_id, session_id, event_type, severity, details) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user_id, session_id, event_type, severity, str(details)),
            )
        await conn.commit()

    await _insert_unified_proctor_event(
        test_type="communication",
        test_id=str(data.get("testId") or "") or None,
        attempt_id=str(data.get("attemptId") or "") or None,
        user_id=str(user_id or ""),
        session_id=str(session_id or "default"),
        event_type=str(event_type or "unknown"),
        severity=str(severity or "low"),
        details=str(details or ""),
    )

    # â”€â”€ Trigger Proctor Intelligence Agent (background, non-blocking) â”€â”€
    # Evict old entries if counter grows too large
    if len(_agent_event_counter) > _AGENT_COUNTER_MAX:
        oldest_keys = sorted(_agent_event_counter, key=_agent_event_counter.get)[:_AGENT_COUNTER_MAX // 2]
        for k in oldest_keys:
            _agent_event_counter.pop(k, None)
    _agent_event_counter[session_id] = _agent_event_counter.get(session_id, 0) + 1
    should_trigger = (
        severity in _AGENT_TRIGGER_SEVERITIES
        or _agent_event_counter[session_id] % _AGENT_TRIGGER_INTERVAL == 0
    )
    if should_trigger:
        task = asyncio.create_task(_maybe_trigger_agent(session_id, severity, user_id))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)

    audit_logger.log_event(
        AuditEventType.TEST_PROCTORING_LOG,
        user_id=user_id or None,
        ip_address=_client_ip(request),
        resource_id=session_id,
        resource_type="communication_session",
        action=f"Communication proctoring: {event_type}",
        details={"severity": severity},
    )
    return {"success": True}


@router.get("/proctoring/status")
async def proctoring_status(request: Request, userId: str, sessionId: str = "default"):
    """Get proctoring violation counts for the current session."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
    await _ensure_proctor_table()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT event_type, COUNT(*) as count FROM comm_proctoring_logs "
                "WHERE user_id=%s AND session_id=%s GROUP BY event_type",
                (userId, sessionId),
            )
            rows = await cur.fetchall()
    violations = {r["event_type"]: r["count"] for r in rows}
    return {"success": True, "violations": violations}


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ADMIN: Communication Test Management
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

_COMM_TESTS_TABLE = """
CREATE TABLE IF NOT EXISTS comm_tests (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(255)   NOT NULL,
    description         TEXT,
    module_a_sentences  JSON,
    module_b_sentences  JSON,
    module_c_topics     JSON,
    module_d_questions  JSON,
    module_a_count      INT DEFAULT 5,
    module_b_count      INT DEFAULT 5,
    module_c_count      INT DEFAULT 3,
    module_d_count      INT DEFAULT 5,
    duration_minutes    INT DEFAULT 60,
    proctoring_enabled  BOOLEAN DEFAULT TRUE,
    proctoring_config   JSON,
    attempt_limit       INT DEFAULT 3,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_COMM_ATTEMPTS_TABLE = """
CREATE TABLE IF NOT EXISTS comm_test_attempts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    test_id         INT NOT NULL,
    student_id      VARCHAR(50) NOT NULL,
    student_name    VARCHAR(100),
    attempt_number  INT DEFAULT 1,
    module_a_data   JSON,
    module_b_data   JSON,
    module_c_data   JSON,
    module_d_data   JSON,
    module_a_score  FLOAT DEFAULT 0,
    module_b_score  FLOAT DEFAULT 0,
    module_c_score  FLOAT DEFAULT 0,
    module_d_score  FLOAT DEFAULT 0,
    overall_score   FLOAT DEFAULT 0,
    current_module  VARCHAR(20) DEFAULT 'A',
    status          VARCHAR(20) DEFAULT 'in_progress',
    proctoring_violations INT DEFAULT 0,
    violation_details   JSON,
    auto_terminated     TINYINT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP NULL,
    FOREIGN KEY (test_id) REFERENCES comm_tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

_comm_tables_ready = False


async def _ensure_comm_tables():
    global _comm_tables_ready
    if not _comm_tables_ready:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_COMM_TESTS_TABLE)
                await cur.execute(_COMM_ATTEMPTS_TABLE)
            await conn.commit()
        _comm_tables_ready = True


def _json_str(val) -> str:
    return json.dumps(val, default=str)


def _safe_json(val):
    if val is None:
        return None
    return json.loads(val) if isinstance(val, str) else val


# â”€â”€â”€ AI Generation for Communication Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def _ai_generate_sentences(count: int, difficulty: str = "mixed") -> list[str]:
    """Generate sentences for Read & Speak / Listen & Repeat using AI."""
    diff_hint = ""
    if difficulty == "easy":
        diff_hint = "Use simple, short sentences (5-10 words) with basic vocabulary."
    elif difficulty == "hard":
        diff_hint = "Use complex, longer sentences (15-25 words) with advanced vocabulary and varied structure."
    else:
        diff_hint = "Mix easy (5-10 words), medium (10-15 words), and hard (15-25 words) sentences."

    messages = [
        {"role": "system", "content": "You are an English language teaching expert. Generate sentences for pronunciation and reading practice. Return ONLY a valid JSON array of strings."},
        {"role": "user", "content": (
            f"Generate {count} unique English sentences for a speaking/pronunciation practice exercise.\n"
            f"{diff_hint}\n"
            "The sentences should cover diverse topics: science, technology, daily life, nature, business, health.\n"
            "Make them natural and conversational.\n"
            "Return ONLY a valid JSON array of strings, nothing else.\n"
            f'Example: ["The sun rises in the east.", "Python is a powerful language."]'
        )}
    ]
    try:
        result = await cerebras_chat(messages, temperature=0.9, max_tokens=2048)
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        sentences = parse_json(content)
        if sentences and isinstance(sentences, list) and all(isinstance(s, str) for s in sentences):
            return sentences[:count]
    except Exception as e:
        print(f"AI sentence generation error: {e}")
    # Fallback
    return SENTENCES_A[:count]


async def _ai_generate_topics(count: int) -> list[str]:
    """Generate speaking topics using AI."""
    messages = [
        {"role": "system", "content": "You are an English language teaching expert. Generate discussion topics for speaking practice. Return ONLY a valid JSON array of strings."},
        {"role": "user", "content": (
            f"Generate {count} unique discussion topics for an English-speaking practice exercise.\n"
            "Topics should be thought-provoking but accessible, covering: technology, society, education, environment, career, health, culture.\n"
            "Each topic should be 5-15 words, phrased as a statement or prompt.\n"
            "Return ONLY a valid JSON array of strings.\n"
            f'Example: ["The importance of renewable energy in today\'s world", "How technology is changing education"]'
        )}
    ]
    try:
        result = await cerebras_chat(messages, temperature=0.9, max_tokens=2048)
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        topics = parse_json(content)
        if topics and isinstance(topics, list) and all(isinstance(t, str) for t in topics):
            return topics[:count]
    except Exception as e:
        print(f"AI topic generation error: {e}")
    return TOPICS[:count]


async def _ai_generate_grammar(count: int) -> list[dict]:
    """Generate grammar fill-in-the-blank questions using AI."""
    messages = [
        {"role": "system", "content": (
            "You are an English grammar expert. Generate fill-in-the-blank grammar questions.\n"
            "Return ONLY a valid JSON array of objects, each with:\n"
            '- "sentence": string with ___ blank and hint in parentheses\n'
            '- "answer": the correct word/phrase\n'
            '- "category": one of tenses_past_simple, tenses_present_continuous, tenses_past_continuous, '
            'tenses_present_perfect, prepositions_time, prepositions_place, prepositions_movement, articles, adverbs'
        )},
        {"role": "user", "content": (
            f"Generate {count} unique English grammar fill-in-the-blank questions.\n"
            "Cover these categories proportionally: tenses (past simple, present continuous, past continuous, present perfect), "
            "prepositions (time, place, movement), articles (a/an/the), adverbs.\n"
            "Each question should have a clear single correct answer.\n"
            "Return ONLY a valid JSON array.\n"
            'Example: [{"sentence": "I ___ (go) to school yesterday.", "answer": "went", "category": "tenses_past_simple"}]'
        )}
    ]
    try:
        result = await cerebras_chat(messages, temperature=0.8, max_tokens=4096)
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        questions = parse_json(content)
        if questions and isinstance(questions, list):
            valid = []
            for q in questions:
                if q.get("sentence") and q.get("answer") and q.get("category"):
                    valid.append(q)
            if valid:
                return valid[:count]
    except Exception as e:
        print(f"AI grammar generation error: {e}")
    return QUESTIONS_BANK[:count]


# â”€â”€â”€ Admin CRUD Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/tests/create")
async def create_comm_test(request: Request):
    """Create a new communication test (admin)."""
    await _require_comm_permission(request, ["communication.assign"])
    await _ensure_comm_tables()
    data = await request.json()

    title = data.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Title is required")

    description = data.get("description", "")
    generation_method = data.get("generation_method", "ai")  # ai | manual | mixed
    difficulty = data.get("difficulty", "mixed")

    module_a_count = int(data.get("module_a_count", 5))
    module_b_count = int(data.get("module_b_count", 5))
    module_c_count = int(data.get("module_c_count", 3))
    module_d_count = int(data.get("module_d_count", 5))

    # Generate or accept manual content
    module_a_sentences = data.get("module_a_sentences")
    module_b_sentences = data.get("module_b_sentences")
    module_c_topics = data.get("module_c_topics")
    module_d_questions = data.get("module_d_questions")

    if generation_method in ("ai", "mixed"):
        if not module_a_sentences or len(module_a_sentences) < module_a_count:
            ai_a = await _ai_generate_sentences(module_a_count, difficulty)
            module_a_sentences = (module_a_sentences or []) + ai_a
            module_a_sentences = module_a_sentences[:module_a_count]

        if not module_b_sentences or len(module_b_sentences) < module_b_count:
            ai_b = await _ai_generate_sentences(module_b_count, difficulty)
            module_b_sentences = (module_b_sentences or []) + ai_b
            module_b_sentences = module_b_sentences[:module_b_count]

        if not module_c_topics or len(module_c_topics) < module_c_count:
            ai_c = await _ai_generate_topics(module_c_count)
            module_c_topics = (module_c_topics or []) + ai_c
            module_c_topics = module_c_topics[:module_c_count]

        if not module_d_questions or len(module_d_questions) < module_d_count:
            ai_d = await _ai_generate_grammar(module_d_count)
            module_d_questions = (module_d_questions or []) + ai_d
            module_d_questions = module_d_questions[:module_d_count]

    # Use defaults if still empty
    module_a_sentences = module_a_sentences or SENTENCES_A[:module_a_count]
    module_b_sentences = module_b_sentences or SENTENCES_B[:module_b_count]
    module_c_topics = module_c_topics or TOPICS[:module_c_count]
    module_d_questions = module_d_questions or QUESTIONS_BANK[:module_d_count]

    proctoring_config = data.get("proctoring_config", {
        "camera": True, "fullscreen": True,
        "tab_switch": True, "copy_paste": True
    })

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO comm_tests (title, description, module_a_sentences, module_b_sentences, "
                "module_c_topics, module_d_questions, module_a_count, module_b_count, module_c_count, "
                "module_d_count, duration_minutes, proctoring_enabled, proctoring_config, attempt_limit) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    title, description,
                    _json_str(module_a_sentences), _json_str(module_b_sentences),
                    _json_str(module_c_topics), _json_str(module_d_questions),
                    module_a_count, module_b_count, module_c_count, module_d_count,
                    int(data.get("duration_minutes", 60)),
                    data.get("proctoring_enabled", True),
                    _json_str(proctoring_config),
                    int(data.get("attempt_limit", 3)),
                )
            )
            test_id = cur.lastrowid
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_CREATED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="communication_test",
        action="Communication test created",
        details={"title": title},
    )
    return {"success": True, "id": test_id}


@router.post("/tests/generate-preview")
async def generate_preview(request: Request):
    """Generate AI content preview without saving (for admin preview)."""
    await _require_comm_permission(request, ["communication.assign"])
    data = await request.json()
    module = data.get("module", "A")
    count = int(data.get("count", 5))
    difficulty = data.get("difficulty", "mixed")

    if module == "A" or module == "B":
        content = await _ai_generate_sentences(count, difficulty)
        return {"success": True, "content": content}
    elif module == "C":
        content = await _ai_generate_topics(count)
        return {"success": True, "content": content}
    elif module == "D":
        content = await _ai_generate_grammar(count)
        return {"success": True, "content": content}
    else:
        raise HTTPException(400, "Invalid module (A, B, C, D)")


@router.get("/tests/all")
async def get_all_comm_tests(request: Request):
    """Get all communication tests (admin)."""
    await _require_comm_permission(request, ["communication.assign"])
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM comm_tests ORDER BY created_at DESC")
            rows = await cur.fetchall()

    result = []
    for r in rows:
        result.append({
            **r,
            "module_a_sentences": _safe_json(r.get("module_a_sentences")),
            "module_b_sentences": _safe_json(r.get("module_b_sentences")),
            "module_c_topics": _safe_json(r.get("module_c_topics")),
            "module_d_questions": _safe_json(r.get("module_d_questions")),
            "proctoring_config": _safe_json(r.get("proctoring_config")),
        })
    return result


@router.put("/tests/{test_id}/toggle")
async def toggle_comm_test(test_id: int, request: Request):
    """Toggle active state of a communication test."""
    await _require_comm_permission(request, ["communication.assign"])
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE comm_tests SET is_active = NOT is_active WHERE id = %s", (test_id,))
        await conn.commit()
    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_MODIFIED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="communication_test",
        action="Communication test toggled active",
    )
    return {"success": True}


@router.delete("/tests/{test_id}")
async def delete_comm_test(test_id: int, request: Request):
    """Delete a communication test and all its attempts."""
    await _require_comm_permission(request, ["communication.assign"])
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM comm_test_attempts WHERE test_id = %s", (test_id,))
            await cur.execute("DELETE FROM comm_tests WHERE id = %s", (test_id,))
        await conn.commit()
    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_DELETED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="communication_test",
        action="Communication test deleted",
    )
    return {"success": True}


@router.get("/tests/{test_id}/attempts")
async def get_comm_test_attempts(test_id: int, request: Request):
    """Get all attempts for a communication test (admin)."""
    await _require_comm_permission(request, ["communication.assign"])
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM comm_test_attempts WHERE test_id = %s ORDER BY created_at DESC",
                (test_id,),
            )
            rows = await cur.fetchall()
    return [
        {**r,
         "module_a_data": _safe_json(r.get("module_a_data")),
         "module_b_data": _safe_json(r.get("module_b_data")),
         "module_c_data": _safe_json(r.get("module_c_data")),
         "module_d_data": _safe_json(r.get("module_d_data")),
         "violation_details": _safe_json(r.get("violation_details")),
         "auto_terminated": bool(r.get("auto_terminated", 0))}
        for r in rows
    ]


# â”€â”€â”€ Student: Discover & Take Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/tests/student/available")
async def student_available_comm_tests(studentId: str, request: Request):
    """Get available communication tests for a student."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    can_attempt = await _has_any_permission(actor, ["communication.attempt"])
    if not (can_assign or (can_attempt and actor == studentId)):
        raise HTTPException(status_code=403, detail="Permission denied")
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS comm_test_allocations (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    test_id INT NOT NULL,
                    student_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_comm_alloc (test_id, student_id)
                )
                """
            )
            await cur.execute(
                """
                SELECT *
                FROM comm_tests
                WHERE is_active = TRUE
                  AND id IN (SELECT test_id FROM comm_test_allocations WHERE student_id = %s)
                ORDER BY created_at DESC
                """,
                (studentId,),
            )
            tests = await cur.fetchall()

            enriched = []
            for t in tests:
                await cur.execute(
                    "SELECT id, attempt_number, status, overall_score, created_at "
                    "FROM comm_test_attempts WHERE test_id=%s AND student_id=%s ORDER BY attempt_number DESC",
                    (t["id"], studentId),
                )
                attempts = await cur.fetchall()
                enriched.append({
                    **t,
                    "module_a_sentences": _safe_json(t.get("module_a_sentences")),
                    "module_b_sentences": _safe_json(t.get("module_b_sentences")),
                    "module_c_topics": _safe_json(t.get("module_c_topics")),
                    "module_d_questions": _safe_json(t.get("module_d_questions")),
                    "proctoring_config": _safe_json(t.get("proctoring_config")),
                    "attempts_used": len(attempts),
                    "can_attempt": len(attempts) < t["attempt_limit"],
                    "my_attempts": attempts,
                })
    return enriched


@router.post("/tests/{test_id}/start")
async def start_comm_test(test_id: int, request: Request):
    """Start a communication test attempt."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    can_attempt = await _has_any_permission(actor, ["communication.attempt"])
    if not (can_assign or can_attempt):
        raise HTTPException(status_code=403, detail="Permission denied")
    await _ensure_comm_tables()
    data = await request.json()
    student_id = data.get("studentId")
    student_name = ""

    if not student_id:
        raise HTTPException(400, "studentId is required")
    if not (can_assign or (can_attempt and actor == student_id)):
        raise HTTPException(status_code=403, detail="Permission denied")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS comm_test_allocations (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    test_id INT NOT NULL,
                    student_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_comm_alloc (test_id, student_id)
                )
                """
            )
            await cur.execute("SELECT * FROM comm_tests WHERE id = %s", (test_id,))
            test = await cur.fetchone()
            if not test:
                raise HTTPException(404, "Test not found")
            await cur.execute(
                "SELECT 1 FROM comm_test_allocations WHERE test_id=%s AND student_id=%s LIMIT 1",
                (test_id, student_id),
            )
            if not await cur.fetchone():
                raise HTTPException(status_code=403, detail="This test is not assigned to this user")

            await cur.execute(
                "SELECT id FROM comm_test_attempts WHERE test_id=%s AND student_id=%s",
                (test_id, student_id),
            )
            existing = await cur.fetchall()
            if len(existing) >= test["attempt_limit"]:
                raise HTTPException(400, "Attempt limit reached")

            await cur.execute("SELECT name FROM users WHERE id = %s", (student_id,))
            urow = await cur.fetchone()
            student_name = (urow or {}).get("name") or ""
            await cur.execute(
                "INSERT INTO comm_test_attempts (test_id, student_id, student_name, attempt_number) "
                "VALUES (%s, %s, %s, %s)",
                (test_id, student_id, student_name, len(existing) + 1),
            )
            attempt_id = cur.lastrowid
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.TEST_STARTED,
        user_id=student_id,
        ip_address=_client_ip(request),
        resource_id=str(attempt_id),
        resource_type="communication_attempt",
        action="Communication test attempt started",
        details={"testId": test_id},
    )
    return {
        "success": True,
        "attemptId": attempt_id,
        "test": {
            **test,
            "module_a_sentences": _safe_json(test.get("module_a_sentences")),
            "module_b_sentences": _safe_json(test.get("module_b_sentences")),
            "module_c_topics": _safe_json(test.get("module_c_topics")),
            "module_d_questions": _safe_json(test.get("module_d_questions")),
            "proctoring_config": _safe_json(test.get("proctoring_config")),
        },
    }


@router.get("/tests/attempt/{attempt_id}")
async def get_comm_attempt(attempt_id: int, request: Request):
    """Get a specific attempt with test data."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["communication.attempt", "communication.assign"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    await _ensure_comm_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT a.*, t.title as test_title, t.module_a_sentences as t_a, t.module_b_sentences as t_b, "
                "t.module_c_topics as t_c, t.module_d_questions as t_d, t.proctoring_config as t_proctor, "
                "t.duration_minutes "
                "FROM comm_test_attempts a JOIN comm_tests t ON a.test_id=t.id WHERE a.id=%s",
                (attempt_id,),
            )
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Attempt not found")
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == (row.get("student_id") or "")):
        raise HTTPException(status_code=403, detail="Permission denied")
    return {
        **row,
        "module_a_data": _safe_json(row.get("module_a_data")),
        "module_b_data": _safe_json(row.get("module_b_data")),
        "module_c_data": _safe_json(row.get("module_c_data")),
        "module_d_data": _safe_json(row.get("module_d_data")),
        "module_a_sentences": _safe_json(row.get("t_a")),
        "module_b_sentences": _safe_json(row.get("t_b")),
        "module_c_topics": _safe_json(row.get("t_c")),
        "module_d_questions": _safe_json(row.get("t_d")),
        "proctoring_config": _safe_json(row.get("t_proctor")),
    }


@router.post("/tests/attempt/{attempt_id}/submit-module")
async def submit_comm_module(attempt_id: int, request: Request):
    """Submit results for a single module within an attempt."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["communication.attempt", "communication.assign"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    await _ensure_comm_tables()
    data = await request.json()
    module = data.get("module", "").upper()  # A, B, C, D
    score = float(data.get("score", 0))
    module_data = data.get("data", {})

    if module not in ("A", "B", "C", "D"):
        raise HTTPException(400, "Invalid module (A, B, C, D)")

    col_data = f"module_{module.lower()}_data"
    col_score = f"module_{module.lower()}_score"
    next_modules = {"A": "B", "B": "C", "C": "D"}
    next_module = next_modules.get(module)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("START TRANSACTION")
            await cur.execute(
                "SELECT id, student_id, current_module, module_a_score, module_b_score, module_c_score "
                "FROM comm_test_attempts WHERE id=%s FOR UPDATE",
                (attempt_id,),
            )
            locked = await cur.fetchone()
            if not locked:
                raise HTTPException(404, "Attempt not found")
            if not (await _has_any_permission(actor, ["communication.assign"]) or actor == (locked.get("student_id") or "")):
                raise HTTPException(status_code=403, detail="Permission denied")
            current_module = (locked.get("current_module") or "").upper()
            if not current_module and module != "A":
                raise HTTPException(409, "Must start with module A")
            if current_module == "DONE":
                raise HTTPException(409, "Attempt already completed")
            if current_module and current_module != module:
                raise HTTPException(409, f"Module out of order. Expected {current_module}, got {module}")
            if next_module:
                await cur.execute(
                    f"UPDATE comm_test_attempts SET {col_data}=%s, {col_score}=%s, "
                    f"current_module=%s WHERE id=%s",
                    (_json_str(module_data), score, next_module, attempt_id),
                )
            else:
                # Module D = last, calculate overall and complete
                a_s = float(locked.get("module_a_score", 0) or 0)
                b_s = float(locked.get("module_b_score", 0) or 0)
                c_s = float(locked.get("module_c_score", 0) or 0)
                overall = (a_s + b_s + c_s + score) / 4

                await cur.execute(
                    f"UPDATE comm_test_attempts SET {col_data}=%s, {col_score}=%s, "
                    f"overall_score=%s, status='completed', current_module='done', "
                    f"completed_at=CURRENT_TIMESTAMP WHERE id=%s",
                    (_json_str(module_data), score, overall, attempt_id),
                )
        await conn.commit()

    return {
        "success": True,
        "next_module": next_module,
        "completed": module == "D",
    }


@router.post("/tests/attempt/{attempt_id}/finish")
async def finish_comm_attempt(attempt_id: int, request: Request, payload: dict = Body(default={})):
    """Finalize an attempt (mark complete) and store proctoring violations."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["communication.attempt", "communication.assign"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    await _ensure_comm_tables()
    pool = await get_pool()
    proctoring_violations = payload.get("proctoring_violations", 0)
    violation_details = payload.get("violation_details", {})
    auto_terminated = 1 if payload.get("auto_terminated") else 0
    violation_json = json.dumps(violation_details) if violation_details else None
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT student_id, module_a_score, module_b_score, module_c_score, module_d_score "
                "FROM comm_test_attempts WHERE id=%s",
                (attempt_id,),
            )
            row = await cur.fetchone()
            if not row:
                raise HTTPException(404, "Attempt not found")
            can_assign = await _has_any_permission(actor, ["communication.assign"])
            if not (can_assign or actor == (row.get("student_id") or "")):
                raise HTTPException(status_code=403, detail="Permission denied")
            scores = [float(row.get(f"module_{m}_score", 0)) for m in "abcd"]
            filled = [s for s in scores if s > 0]
            overall = sum(filled) / len(filled) if filled else 0
            await cur.execute(
                "UPDATE comm_test_attempts SET overall_score=%s, status=%s, "
                "proctoring_violations=%s, violation_details=%s, auto_terminated=%s, "
                "completed_at=CURRENT_TIMESTAMP WHERE id=%s",
                (overall, 'terminated' if auto_terminated else 'completed',
                 proctoring_violations, violation_json, auto_terminated, attempt_id),
            )
        await conn.commit()
    audit_logger.log_event(
        AuditEventType.TEST_COMPLETED,
        user_id=actor,
        ip_address=_client_ip(request),
        resource_id=str(attempt_id),
        resource_type="communication_attempt",
        action="Communication test attempt finished",
        details={"overall_score": overall, "auto_terminated": bool(auto_terminated)},
    )
    return {"success": True, "overall_score": overall,
            "proctoring_violations": proctoring_violations,
            "auto_terminated": bool(auto_terminated)}

    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["communication.assign"])
    if not (can_assign or actor == userId):
        raise HTTPException(403, "Permission denied")
