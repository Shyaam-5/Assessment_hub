"""Global test routes: CRUD for tests, questions, submissions, and AI reports."""

import json
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from pydantic import BaseModel

import pymysql.cursors
from database import get_pool, get_primary_pool
from routes.auth import _has_any_permission as _auth_has_any_permission, assert_assessment_limit_for_actor
from config import settings
from services.ai_service import cerebras_chat
from audit_logger import get_audit_logger, AuditEventType
from services.otp_delivery import send_exam_allocated_email

router = APIRouter(prefix="/api", tags=["global-tests"])
audit_logger = get_audit_logger()

PISTON_URL = "https://emkc.org/api/v2/piston/execute"
SECTIONS = ["aptitude", "verbal", "logical", "coding", "sql"]
_global_agent_counter: dict[str, int] = {}
_GLOBAL_AGENT_COUNTER_MAX = 1000
_GLOBAL_AGENT_INTERVAL = 5
LEGACY_EXAM_TAKER_PERMISSIONS = {
    "tests.view_allocated",
    "tests.attempt",
    "aptitude.attempt",
    "coding.attempt",
    "communication.attempt",
    "results.view_own",
}


async def _insert_unified_proctor_event(
    *,
    test_id: str,
    user_id: str,
    session_id: str,
    event_type: str,
    severity: str,
    details: str,
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
                ("global", test_id or None, None, user_id, session_id, event_type, severity, details),
            )
        await conn.commit()


async def _maybe_trigger_global_agent(session_id: str, user_id: str = ""):
    try:
        from services.proctor_agent import agent_analyze_session, save_analysis
        result = await agent_analyze_session(session_id, "global", user_id=user_id)
        if result.get("fraud_score", 0) > 0:
            await save_analysis({**result, "source": "global"})
            if result.get("recommended_action") == "terminate" or result.get("risk_level") == "terminate":
                try:
                    from main import sio
                    payload = {
                        "session_id": session_id,
                        "reason": "Proctoring Intelligence Agent detected critical integrity violations.",
                        "fraud_score": result.get("fraud_score"),
                        "risk_level": result.get("risk_level"),
                    }
                    await sio.emit("agent_terminate", payload, room=f"session_{session_id}")
                    if user_id:
                        await sio.emit("agent_terminate", payload, room=f"student_{user_id}")
                except Exception:
                    pass
    except Exception:
        pass


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
        resource_type="global_tests_read",
        query_params={"path": request.url.path, "query": request.url.query},
    )


router.dependencies.append(Depends(_log_read_access))


async def _require_test_permission(request: Request, permissions: list[str]) -> str:
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, permissions):
        raise HTTPException(403, "Permission denied")
    return actor


def _sanitize_question_for_student(item: dict) -> dict:
    clean = dict(item)
    clean.pop("correctAnswer", None)
    clean.pop("explanation", None)
    clean.pop("solutionCode", None)
    return clean

LANGUAGE_MAP = {
    "Python": {"language": "python", "version": "3.10.0"},
    "JavaScript": {"language": "javascript", "version": "18.15.0"},
    "Java": {"language": "java", "version": "15.0.2"},
    "C": {"language": "c", "version": "10.2.0"},
    "C++": {"language": "cpp", "version": "10.2.0"},
    "SQL": {"language": "sqlite3", "version": "3.36.0"},
}


# â"€â"€â"€ Request Bodies â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

class GlobalTestCreate(BaseModel):
    title: str = "Untitled"
    type: str = "comprehensive"
    difficulty: Optional[str] = None
    duration: int = 180
    passingScore: int = 60
    description: str = ""
    startTime: Optional[str] = None
    deadline: Optional[str] = None
    maxAttempts: int = 1
    maxTabSwitches: int = 3
    status: str = "draft"
    createdBy: Optional[str] = None
    sectionConfig: Optional[dict] = None
    proctoring: Optional[dict] = None
    resultVisibility: str = "immediate"


class GlobalTestUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    difficulty: Optional[str] = None
    duration: Optional[int] = None
    passingScore: Optional[int] = None
    description: Optional[str] = None
    startTime: Optional[str] = None
    deadline: Optional[str] = None
    maxAttempts: Optional[int] = None
    maxTabSwitches: Optional[int] = None
    status: Optional[str] = None
    sectionConfig: Optional[dict] = None
    proctoring: Optional[dict] = None
    resultVisibility: Optional[str] = None


class QuestionBatch(BaseModel):
    section: str
    questions: List[dict]


class GlobalTestSubmit(BaseModel):
    studentId: str
    answers: Optional[Dict[str, Any]] = None
    selectedLanguages: Optional[Dict[str, str]] = None
    sectionScores: Optional[dict] = None
    timeSpent: int = 0
    tabSwitches: int = 0
    copyPasteAttempts: int = 0
    cameraBlockedCount: int = 0
    phoneDetectionCount: int = 0
    faceMissingCount: int = 0
    totalViolations: int = 0
    multipleMonitorCount: int = 0
    proctoringEnabled: Optional[bool] = None
    behaviorSessionId: Optional[str] = None
    submissionType: Optional[str] = None
    terminationReason: Optional[str] = None


# â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

def _fmt_dt(iso: Optional[str]) -> Optional[str]:
    if not iso or not iso.strip():
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return iso.replace("T", " ")[:19] if iso else None


def _safe_json(val) -> Any:
    if val is None:
        return None
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return None
    return val


async def _get_table_columns(cur, table_name: str) -> set[str]:
    await cur.execute(
        """SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s""",
        (table_name,),
    )
    rows = await cur.fetchall()
    if not rows:
        return set()

    if isinstance(rows[0], dict):
        return {r["COLUMN_NAME"] for r in rows}
    return {r[0] for r in rows}


def _to_bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on")
    return default


def _normalize_proctoring_config(raw: Any, fallback_max_tab: int = 3) -> dict:
    cfg = raw if isinstance(raw, dict) else {}
    enabled = _to_bool(cfg.get("enabled"), False)
    track_tab = _to_bool(cfg.get("trackTabSwitches"), False) if enabled else False

    max_tab = cfg.get("maxTabSwitches", fallback_max_tab)
    try:
        max_tab = int(max_tab)
    except Exception:
        max_tab = fallback_max_tab
    max_tab = max(0, max_tab)
    if not enabled or not track_tab:
        max_tab = 0

    enable_video = _to_bool(cfg.get("enableVideoAudio", cfg.get("videoAudio")), False) if enabled else False
    enable_microphone = _to_bool(cfg.get("enableMicrophone"), False) if enabled else False
    disable_copy = _to_bool(cfg.get("disableCopyPaste"), False) if enabled else False
    detect_block = _to_bool(cfg.get("detectCameraBlocking", cfg.get("enableFaceDetection")), False) if enabled else False
    detect_phone = _to_bool(cfg.get("detectPhoneUsage"), False) if enabled else False
    fullscreen = _to_bool(cfg.get("enforceFullscreen"), False) if enabled else False
    enable_face = _to_bool(cfg.get("enableFaceDetection", cfg.get("detectCameraBlocking")), False) if enabled else False
    detect_multiple = _to_bool(cfg.get("detectMultipleFaces", cfg.get("multiplePeopleDetection")), False) if enabled else False
    auto_submit = _to_bool(cfg.get("autoSubmitOnViolation"), False) if enabled else False

    return {
        "enabled": enabled,
        "trackTabSwitches": track_tab,
        "maxTabSwitches": max_tab,
        "enableVideoAudio": enable_video,
        "enableMicrophone": enable_microphone,
        "disableCopyPaste": disable_copy,
        "detectCameraBlocking": detect_block,
        "detectPhoneUsage": detect_phone,
        "enforceFullscreen": fullscreen,
        "enableFaceDetection": enable_face,
        "detectMultipleFaces": detect_multiple,
        "autoSubmitOnViolation": auto_submit,
        # Compatibility keys for consumers that still use problem-style naming.
        "videoAudio": enable_video,
        "multiplePeopleDetection": detect_multiple,
    }


def _normalize_section_config(raw: Any, fallback_duration: int) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None

    sections = raw.get("sections")
    if not isinstance(sections, list):
        return None

    normalized_sections = []
    seen = set()
    default_order = {s: i + 1 for i, s in enumerate(SECTIONS)}
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        sid = str(sec.get("id", "")).strip().lower()
        if sid not in SECTIONS or sid in seen:
            continue
        seen.add(sid)

        enabled = _to_bool(sec.get("enabled"), True)
        try:
            q_count = max(0, int(sec.get("questionsCount", 0)))
        except Exception:
            q_count = 0
        try:
            time_minutes = max(0, int(sec.get("timeMinutes", 0)))
        except Exception:
            time_minutes = 0
        try:
            order = int(sec.get("order", default_order[sid]))
        except Exception:
            order = default_order[sid]

        normalized_sections.append({
            "id": sid,
            "enabled": enabled,
            "order": order,
            "questionsCount": q_count,
            "timeMinutes": time_minutes,
        })

    normalized_sections.sort(key=lambda s: s["order"])

    section_time_mode = raw.get("sectionTimeMode") or "fixed"
    if section_time_mode not in ("fixed", "free"):
        section_time_mode = "fixed"

    try:
        total_duration = int(raw.get("totalDurationMinutes", fallback_duration))
    except Exception:
        total_duration = fallback_duration
    total_duration = max(1, total_duration)

    return {
        "sections": normalized_sections,
        "totalDurationMinutes": total_duration,
        "sectionTimeMode": section_time_mode,
    }


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _validate_schedule(start: Optional[str], end: Optional[str]):
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if start and not start_dt:
        raise HTTPException(400, "Invalid startTime format")
    if end and not end_dt:
        raise HTTPException(400, "Invalid deadline format")
    if start_dt and end_dt and start_dt >= end_dt:
        raise HTTPException(400, "startTime must be earlier than deadline")


def _normalize_result_visibility(value: Optional[str]) -> str:
    visibility = (value or "immediate").strip().lower()
    if visibility not in {"immediate", "after_deadline", "manual"}:
        raise HTTPException(400, "resultVisibility must be immediate, after_deadline, or manual")
    return visibility


def _as_utc(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = _parse_dt(str(value))
    if not parsed:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _result_visibility_status(test_row: dict, *, can_manage: bool = False) -> dict:
    visibility = _normalize_result_visibility(test_row.get("result_visibility") or "immediate")
    if can_manage or visibility == "immediate":
        return {"visible": True, "visibility": visibility, "reason": None}
    if visibility == "after_deadline":
        deadline = _as_utc(test_row.get("deadline"))
        if deadline and datetime.now(timezone.utc) >= deadline:
            return {"visible": True, "visibility": visibility, "reason": None}
        return {
            "visible": False,
            "visibility": visibility,
            "reason": "Results will be released after the test deadline.",
        }
    return {
        "visible": False,
        "visibility": visibility,
        "reason": "Results are pending admin release.",
    }


def _mask_global_submission(row: dict, visibility_state: dict) -> dict:
    if visibility_state.get("visible"):
        return row
    locked = dict(row)
    for key in (
        "aptitudeScore",
        "verbalScore",
        "logicalScore",
        "codingScore",
        "sqlScore",
        "totalScore",
        "overallPercentage",
        "sectionResults",
        "questionResults",
    ):
        if key in locked:
            locked[key] = [] if key.endswith("Results") else None
    locked["resultsVisible"] = False
    locked["resultVisibility"] = visibility_state.get("visibility")
    locked["resultVisibilityReason"] = visibility_state.get("reason")
    return locked


def _clean_global_test(t: dict) -> dict:
    proctoring = _normalize_proctoring_config(
        _safe_json(t.get("proctoring_config")),
        fallback_max_tab=t.get("max_tab_switches") or 3,
    )
    section_cfg = _normalize_section_config(
        _safe_json(t.get("section_config")),
        fallback_duration=t.get("duration") or 180,
    )
    return {
        "id": t["id"],
        "title": t["title"],
        "type": t.get("type"),
        "difficulty": t.get("difficulty"),
        "duration": t.get("duration"),
        "totalQuestions": t.get("total_questions"),
        "passingScore": t.get("passing_score"),
        "status": t.get("status"),
        "createdBy": t.get("created_by"),
        "createdAt": str(t.get("created_at", "")),
        "description": t.get("description") or "",
        "startTime": str(t["start_time"]) if t.get("start_time") else None,
        "deadline": str(t["deadline"]) if t.get("deadline") else None,
        "maxAttempts": t.get("max_attempts") or 1,
        "maxTabSwitches": proctoring.get("maxTabSwitches", t.get("max_tab_switches") or 0),
        "sectionConfig": section_cfg,
        "proctoring": proctoring,
        "resultVisibility": t.get("result_visibility") or "immediate",
    }


def _normalize_sql(s: str) -> str:
    return "\n".join(l.strip() for l in s.split("\n") if l.strip())


def _compare_sql_data_only(actual: str, expected: str) -> bool:
    try:
        def _extract(s: str):
            normalised = s.replace("|", "\n").replace("\r", "")
            lines = [l.strip() for l in normalised.split("\n") if l.strip()]
            data_lines = [l for l in lines if re.search(r"\d", l) or "|" in l]
            all_vals = sorted(
                v.strip().lower()
                for l in lines
                for v in re.split(r"[|\s]+", l)
                if v.strip()
            )
            return "|".join(data_lines).lower(), "|".join(all_vals)

        ad, av = _extract(actual)
        ed, ev = _extract(expected)
        if ad == ed:
            return True
        if av == ev:
            return True
        an = sorted(re.findall(r"[\d.]+", actual))
        en = sorted(re.findall(r"[\d.]+", expected))
        return an == en and len(an) > 0
    except Exception:
        return False


async def _run_inline_coding_tests(code: str, language: str, test_cases: list) -> dict:
    """Run code against test cases using Piston API."""
    if not test_cases or not isinstance(test_cases, list) or len(test_cases) == 0:
        return {"passedCount": 0, "total": 0, "percentage": 0, "isCorrect": False}

    runtime = LANGUAGE_MAP.get(language, {"language": "python", "version": "3.10.0"})
    passed = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for tc in test_cases:
            stdin = str(tc.get("input") or "")
            expected = str(tc.get("expected_output") or tc.get("expectedOutput") or "").strip()
            try:
                resp = await client.post(PISTON_URL, json={
                    "language": runtime["language"],
                    "version": runtime["version"],
                    "files": [{"content": code}],
                    "stdin": stdin,
                })
                data = resp.json()
                actual = (data.get("run", {}).get("output") or "").strip()
                if actual == expected:
                    passed += 1
            except Exception:
                pass

    total = len(test_cases)
    pct = round((passed / total) * 100) if total else 0
    return {"passedCount": passed, "total": total, "percentage": pct, "isCorrect": passed == total}


async def _run_sql_and_compare(schema: str, query: str, expected_output: str) -> dict:
    """Run SQL via Piston and compare output."""
    expected = (expected_output or "").strip().replace("\r", "")
    try:
        full_q = f"{schema}\n\n{query}" if schema else query
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(PISTON_URL, json={
                "language": "sqlite3",
                "version": "3.36.0",
                "files": [{"content": full_q}],
            })
        data = resp.json()
        actual = (data.get("run", {}).get("output") or "").strip().replace("\r", "")
        is_correct = False
        if data.get("run", {}).get("code") == 0:
            is_correct = (
                actual == expected
                or _normalize_sql(actual) == _normalize_sql(expected)
                or _compare_sql_data_only(actual, expected)
            )
        return {"isCorrect": is_correct, "output": actual}
    except Exception as e:
        return {"isCorrect": False, "output": str(e)}


# â"€â"€â"€ CRUD Routes â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

_ALLOC_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS global_test_allocations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        test_id VARCHAR(64) NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_global_alloc (test_id, student_id)
    )
"""

_GLOBAL_TESTS_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS global_tests (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        difficulty VARCHAR(20) NULL,
        duration INT NULL,
        total_questions INT NULL,
        passing_score INT NULL DEFAULT 60,
        status VARCHAR(20) NULL DEFAULT 'draft',
        created_by VARCHAR(50) NULL,
        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        description TEXT NULL,
        start_time DATETIME NULL,
        deadline DATETIME NULL,
        max_attempts INT NULL DEFAULT 1,
        max_tab_switches INT NULL DEFAULT 3,
        section_config JSON NULL,
        proctoring_config JSON NULL,
        result_visibility VARCHAR(32) NULL DEFAULT 'immediate',
        INDEX idx_global_tests_created_by (created_by),
        INDEX idx_global_tests_status (status)
    )
"""

_TEST_QUESTIONS_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS test_questions (
        question_id VARCHAR(50) NOT NULL PRIMARY KEY,
        test_id VARCHAR(50) NULL,
        section VARCHAR(32) NOT NULL,
        question_type VARCHAR(32) NULL DEFAULT 'mcq',
        question TEXT NOT NULL,
        option_1 TEXT NULL,
        option_2 TEXT NULL,
        option_3 TEXT NULL,
        option_4 TEXT NULL,
        correct_answer TEXT NULL,
        test_cases JSON NULL,
        starter_code TEXT NULL,
        solution_code TEXT NULL,
        explanation TEXT NULL,
        category VARCHAR(100) NULL,
        difficulty VARCHAR(20) NULL,
        points INT NULL DEFAULT 1,
        time_limit INT NULL,
        INDEX idx_test_questions_test_id (test_id),
        INDEX idx_test_questions_section (section)
    )
"""


async def _ensure_global_test_tables(cur) -> None:
    await cur.execute(_GLOBAL_TESTS_TABLE_DDL)
    await cur.execute(_TEST_QUESTIONS_TABLE_DDL)
    await cur.execute(_ALLOC_TABLE_DDL)


@router.get("/global-tests/org-students")
async def list_org_students(request: Request):
    """Return exam takers available for test allocation (requires tests.assign)."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["tests.assign"]):
        raise HTTPException(403, "Permission denied")
    pool = await get_primary_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT role, organization_id FROM users WHERE id = %s LIMIT 1", (actor,))
                actor_row = await cur.fetchone() or {}
                actor_role = str(actor_row.get("role") or "").strip().lower()
                actor_org_id = actor_row.get("organization_id")
                params: list[Any] = []
                org_filter = ""
                if actor_role != "admin" and actor_org_id:
                    org_filter = " AND u.organization_id = %s"
                    params.append(actor_org_id)
                await cur.execute(
                    f"""
                    SELECT DISTINCT u.id, u.name, u.email, u.batch
                    FROM users u
                    LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
                    LEFT JOIN roles r ON r.id = ura.role_id
                    WHERE (
                        u.role = 'student'
                        OR (
                            u.role = 'org_user'
                            AND (
                                LOWER(TRIM(COALESCE(r.slug, ''))) = 'exam-taker'
                                OR LOWER(TRIM(COALESCE(r.name, ''))) = 'exam taker'
                            )
                        )
                    )
                    {org_filter}
                    ORDER BY u.name
                    """,
                    tuple(params),
                )
                rows = await cur.fetchall()
        return [{"id": r["id"], "name": r["name"], "email": r["email"], "batch": r.get("batch")} for r in rows]
    except Exception as e:
        if "doesn't exist" in str(e):
            return []
        raise HTTPException(500, "Failed to fetch students")


@router.get("/global-tests/{test_id}/allocations")
async def get_test_allocations(test_id: str, request: Request):
    """List students currently allocated to a test."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["tests.assign"]):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(_ALLOC_TABLE_DDL)
                await cur.execute(
                    """SELECT a.student_id, u.name, u.email
                       FROM global_test_allocations a
                       JOIN users u ON u.id = a.student_id
                       WHERE a.test_id = %s ORDER BY u.name""",
                    (test_id,),
                )
                rows = await cur.fetchall()
        return [{"studentId": r["student_id"], "name": r["name"], "email": r["email"]} for r in rows]
    except Exception as e:
        if "doesn't exist" in str(e):
            return []
        raise HTTPException(500, "Failed to fetch allocations")


@router.post("/global-tests/{test_id}/allocations")
async def set_test_allocations(test_id: str, request: Request):
    """Replace allocations for a test with the given student list."""
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["tests.assign"]):
        raise HTTPException(403, "Permission denied")
    body = await request.json()
    student_ids: list = body.get("studentIds", [])
    if not isinstance(student_ids, list):
        raise HTTPException(400, "studentIds must be a list")
    student_ids = [str(sid or "").strip() for sid in student_ids if str(sid or "").strip()]
    pool = await get_pool()
    primary_pool = await get_primary_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await _ensure_global_test_tables(cur)
                await cur.execute(_ALLOC_TABLE_DDL)
                if student_ids:
                    placeholders = ",".join(["%s"] * len(student_ids))
                    async with primary_pool.acquire() as primary_conn:
                        async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
                            await primary_cur.execute(
                        f"""
                        SELECT DISTINCT u.id
                        FROM users u
                        LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
                        LEFT JOIN roles r ON r.id = ura.role_id
                        WHERE u.id IN ({placeholders})
                          AND (
                            u.role = 'student'
                            OR (
                              u.role = 'org_user'
                              AND (
                                LOWER(TRIM(COALESCE(r.slug, ''))) = 'exam-taker'
                                OR LOWER(TRIM(COALESCE(r.name, ''))) = 'exam taker'
                              )
                            )
                          )
                        """,
                        student_ids,
                    )
                    allowed_ids = {str(r["id"]) for r in (await primary_cur.fetchall() or [])}
                    invalid_ids = [sid for sid in student_ids if sid not in allowed_ids]
                    if invalid_ids:
                        raise HTTPException(400, "Only student or exam-taker users can be allocated")
                await cur.execute("SELECT title FROM global_tests WHERE id = %s", (test_id,))
                test_row = await cur.fetchone()
                test_title = (test_row[0] if test_row else None) or "Global Assessment"

                await cur.execute("DELETE FROM global_test_allocations WHERE test_id = %s", (test_id,))
                for sid in student_ids:
                    await cur.execute(
                        "INSERT IGNORE INTO global_test_allocations (id, test_id, student_id) VALUES (%s, %s, %s)",
                        (str(uuid.uuid4()), test_id, sid),
                    )

                emails: list[tuple[str, str]] = []
                if student_ids:
                    placeholders2 = ",".join(["%s"] * len(student_ids))
                    await cur.execute(
                        f"SELECT name, email FROM users WHERE id IN ({placeholders2})", student_ids
                    )
                    emails = [
                        (r[0] or "User", r[1] or "")
                        for r in (await cur.fetchall() or [])
                        if (r[1] or "").strip()
                    ]
            await conn.commit()

        for name, email in emails:
            try:
                await asyncio.to_thread(
                    send_exam_allocated_email,
                    email, name, test_title, "Global Assessment",
                )
            except Exception:
                pass

        audit_logger.log_event(
            AuditEventType.ADMIN_TEST_MODIFIED,
            user_id=actor,
            ip_address=_client_ip(request),
            resource_id=test_id,
            resource_type="global_test",
            action="Global test allocations updated",
            details={"studentCount": len(student_ids)},
        )
        return {"allocated": len(student_ids)}
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Failed to save allocations")


@router.get("/global-tests")
async def list_global_tests(
    request: Request,
    status: Optional[str] = None,
    type: Optional[str] = None,
    studentId: Optional[str] = None,
):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_manage = await _has_any_permission(actor, ["tests.create", "tests.update", "tests.assign", "tests.delete"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or can_attempt):
        raise HTTPException(403, "Permission denied")
    if can_attempt and not can_manage:
        studentId = actor
    pool = await get_pool()
    query = "SELECT * FROM global_tests WHERE 1=1"
    params: list = []
    if status:
        query += " AND status = %s"
        params.append(status)
    if type:
        query += " AND type = %s"
        params.append(type)
    if studentId:
        query += """
            AND id IN (
                SELECT test_id FROM global_test_allocations WHERE student_id = %s
            )
        """
        params.append(studentId)
    query += " ORDER BY created_at DESC"

    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await _ensure_global_test_tables(cur)
                await cur.execute(query, params)
                rows = await cur.fetchall()
                test_ids = [str(t.get("id")) for t in (rows or []) if t.get("id")]
                alloc_counts: dict[str, int] = {}
                if test_ids:
                    placeholders = ",".join(["%s"] * len(test_ids))
                    await cur.execute(
                        f"""SELECT test_id, COUNT(*) AS cnt
                            FROM global_test_allocations
                            WHERE test_id IN ({placeholders})
                            GROUP BY test_id""",
                        test_ids,
                    )
                    for row in (await cur.fetchall()) or []:
                        alloc_counts[str(row.get("test_id"))] = int(row.get("cnt") or 0)
        cleaned = []
        for t in rows:
            item = _clean_global_test(t)
            item["allocatedCount"] = alloc_counts.get(str(t.get("id")), 0)
            cleaned.append(item)
        return cleaned
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Failed to list global tests")


@router.get("/global-tests/{test_id}")
async def get_global_test(test_id: str, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_manage = await _has_any_permission(actor, ["tests.create", "tests.update", "tests.assign", "tests.delete"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or can_attempt):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await _ensure_global_test_tables(cur)
                await cur.execute("SELECT * FROM global_tests WHERE id = %s", (test_id,))
                t = await cur.fetchone()
                if not t:
                    raise HTTPException(404, "Test not found")

                await cur.execute(
                    "SELECT * FROM test_questions WHERE test_id = %s ORDER BY section, question_id",
                    (test_id,),
                )
                questions = await cur.fetchall()

        by_section: dict = {s: [] for s in SECTIONS}
        for q in questions:
            item = {
                "id": q["question_id"],
                "question": q["question"],
                "options": [q["option_1"], q["option_2"], q["option_3"], q["option_4"]],
                "correctAnswer": q["correct_answer"],
                "explanation": q.get("explanation"),
                "category": q.get("category"),
                "questionType": q.get("question_type"),
                "section": q["section"],
                "testCases": _safe_json(q.get("test_cases")),
                "starterCode": q.get("starter_code"),
                "solutionCode": q.get("solution_code"),
                "points": q.get("points") or 1,
                "timeLimit": q.get("time_limit"),
            }
            sec = q["section"]
            if sec in by_section:
                by_section[sec].append(item)

        result = _clean_global_test(t)
        if can_attempt and not can_manage:
            async with pool.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    await cur.execute(
                        "SELECT 1 FROM global_test_allocations WHERE test_id=%s AND student_id=%s LIMIT 1",
                        (test_id, actor),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(403, "This test is not assigned to this user")
        result["questionsBySection"] = by_section
        result["questions"] = [
            {
                "id": q["question_id"],
                "section": q["section"],
                "question": q["question"],
                "options": [q["option_1"], q["option_2"], q["option_3"], q["option_4"]],
                "correctAnswer": q["correct_answer"],
                "questionType": q.get("question_type"),
                "explanation": q.get("explanation"),
                "category": q.get("category"),
            }
            for q in questions
        ]
        if can_attempt and not can_manage:
            result["questionsBySection"] = {
                k: [_sanitize_question_for_student(i) for i in v]
                for k, v in result["questionsBySection"].items()
            }
            result["questions"] = [_sanitize_question_for_student(i) for i in result["questions"]]
        return result
    except HTTPException:
        raise
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.post("/global-tests")
async def create_global_test(body: GlobalTestCreate, request: Request):
    actor = await _require_test_permission(request, ["tests.create"])
    await assert_assessment_limit_for_actor(actor)
    pool = await get_pool()
    test_id = str(uuid.uuid4())
    if body.duration <= 0:
        raise HTTPException(400, "duration must be greater than 0")
    if body.passingScore < 0 or body.passingScore > 100:
        raise HTTPException(400, "passingScore must be between 0 and 100")
    if body.maxAttempts == 0 or body.maxAttempts < -1:
        raise HTTPException(400, "maxAttempts must be greater than 0, or -1 for unlimited")
    _validate_schedule(body.startTime, body.deadline)
    result_visibility = _normalize_result_visibility(body.resultVisibility)

    normalized_section_cfg = _normalize_section_config(body.sectionConfig, body.duration)
    normalized_proctoring = _normalize_proctoring_config(body.proctoring, body.maxTabSwitches or 3)

    sc_json = json.dumps(normalized_section_cfg) if normalized_section_cfg else None
    pc_json = json.dumps(normalized_proctoring)
    total_q = 0
    if normalized_section_cfg and normalized_section_cfg.get("sections"):
        total_q = sum(
            s.get("questionsCount", 0)
            for s in normalized_section_cfg["sections"]
            if s.get("enabled")
        )

    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await _ensure_global_test_tables(cur)
                await cur.execute(
                    """INSERT INTO global_tests
                       (id, title, type, difficulty, duration, total_questions,
                        passing_score, status, created_by, description,
                        start_time, deadline, max_attempts, max_tab_switches,
                        section_config, proctoring_config, result_visibility)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        test_id, body.title, body.type, body.difficulty,
                        body.duration, total_q, body.passingScore,
                        body.status, body.createdBy, body.description,
                        _fmt_dt(body.startTime), _fmt_dt(body.deadline),
                        body.maxAttempts, normalized_proctoring.get("maxTabSwitches", 0),
                        sc_json, pc_json, result_visibility,
                    ),
                )
            await conn.commit()

        audit_logger.log_event(
            AuditEventType.ADMIN_TEST_CREATED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_id=test_id,
            resource_type="global_test",
            action="Global test created",
            details={"title": body.title, "type": body.type},
        )
        return {
            "id": test_id,
            "title": body.title,
            "type": body.type,
            "duration": body.duration,
            "totalQuestions": total_q,
            "passingScore": body.passingScore,
            "status": body.status,
            "sectionConfig": normalized_section_cfg,
            "proctoring": normalized_proctoring,
            "resultVisibility": result_visibility,
        }
    except HTTPException:
        raise
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.put("/global-tests/{test_id}")
async def update_global_test(test_id: str, body: GlobalTestUpdate, request: Request):
    await _require_test_permission(request, ["tests.update", "tests.create"])
    pool = await get_pool()
    if body.duration is not None and body.duration <= 0:
        raise HTTPException(400, "duration must be greater than 0")
    if body.passingScore is not None and (body.passingScore < 0 or body.passingScore > 100):
        raise HTTPException(400, "passingScore must be between 0 and 100")
    if body.maxAttempts is not None and (body.maxAttempts == 0 or body.maxAttempts < -1):
        raise HTTPException(400, "maxAttempts must be greater than 0, or -1 for unlimited")
    _validate_schedule(body.startTime, body.deadline)

    updates: list[str] = []
    params: list = []

    field_map = {
        "title": "title", "type": "type", "difficulty": "difficulty",
        "duration": "duration", "passingScore": "passing_score",
        "description": "description", "maxAttempts": "max_attempts",
        "maxTabSwitches": "max_tab_switches", "status": "status",
        "resultVisibility": "result_visibility",
    }
    for attr, col in field_map.items():
        val = getattr(body, attr, None)
        if val is not None:
            if attr == "resultVisibility":
                val = _normalize_result_visibility(val)
            updates.append(f"{col} = %s")
            params.append(val)

    if body.startTime is not None:
        updates.append("start_time = %s")
        params.append(_fmt_dt(body.startTime))
    if body.deadline is not None:
        updates.append("deadline = %s")
        params.append(_fmt_dt(body.deadline))

    if body.sectionConfig is not None:
        duration_for_sections = body.duration if body.duration is not None else 180
        normalized_section_cfg = _normalize_section_config(body.sectionConfig, duration_for_sections)
        updates.append("section_config = %s")
        params.append(json.dumps(normalized_section_cfg))
        total_q = sum(
            s.get("questionsCount", 0)
            for s in (normalized_section_cfg or {}).get("sections", [])
            if s.get("enabled")
        )
        updates.append("total_questions = %s")
        params.append(total_q)

    if body.proctoring is not None:
        fallback_tab = body.maxTabSwitches if body.maxTabSwitches is not None else 3
        normalized_proctoring = _normalize_proctoring_config(body.proctoring, fallback_tab)
        updates.append("proctoring_config = %s")
        params.append(json.dumps(normalized_proctoring))
        updates.append("max_tab_switches = %s")
        params.append(normalized_proctoring.get("maxTabSwitches", 0))

    if not updates:
        raise HTTPException(400, "No fields to update")

    params.append(test_id)
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"UPDATE global_tests SET {', '.join(updates)} WHERE id = %s", params
                )
            await conn.commit()
        audit_logger.log_event(
            AuditEventType.ADMIN_TEST_MODIFIED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_id=test_id,
            resource_type="global_test",
            action="Global test updated",
            details=body.model_dump(exclude_none=True),
        )
        return {"success": True}
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.delete("/global-tests/{test_id}")
async def delete_global_test(test_id: str, request: Request):
    await _require_test_permission(request, ["tests.delete", "tests.update", "tests.create"])
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT id FROM global_test_submissions WHERE test_id = %s", (test_id,))
                subs = await cur.fetchall()
                sub_ids = [s["id"] for s in subs]

                if sub_ids:
                    ph = ",".join(["%s"] * len(sub_ids))
                    await cur.execute(f"DELETE FROM question_results WHERE submission_id IN ({ph})", sub_ids)
                    await cur.execute(f"DELETE FROM section_results WHERE submission_id IN ({ph})", sub_ids)
                    await cur.execute(f"DELETE FROM personalized_reports WHERE submission_id IN ({ph})", sub_ids)

                await cur.execute("DELETE FROM global_test_allocations WHERE test_id = %s", (test_id,))
                await cur.execute("DELETE FROM global_test_submissions WHERE test_id = %s", (test_id,))
                await cur.execute("DELETE FROM test_questions WHERE test_id = %s", (test_id,))
                await cur.execute("DELETE FROM global_tests WHERE id = %s", (test_id,))
                if cur.rowcount == 0:
                    raise HTTPException(404, "Test not found")
            await conn.commit()
        audit_logger.log_event(
            AuditEventType.ADMIN_TEST_DELETED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_id=test_id,
            resource_type="global_test",
            action="Global test deleted",
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


# â"€â"€â"€ Question routes â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

@router.post("/global-tests/{test_id}/questions")
async def add_questions(test_id: str, body: QuestionBatch, request: Request):
    await _require_test_permission(request, ["tests.update", "tests.create"])
    if body.section not in SECTIONS:
        raise HTTPException(400, f"Invalid section. Use: {', '.join(SECTIONS)}")
    if not body.questions:
        raise HTTPException(400, "questions array required")

    pool = await get_pool()
    inserted: list[str] = []
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                for q in body.questions:
                    qid = str(uuid.uuid4())
                    opts = q.get("options", [])
                    opts += [""] * (4 - len(opts))
                    ca = str(q.get("correctAnswer", q.get("correct_answer", "")))
                    qt = q.get("questionType", "mcq")
                    tc_json = None
                    raw_tc = q.get("testCases")
                    if raw_tc:
                        tc_json = json.dumps(raw_tc) if not isinstance(raw_tc, str) else raw_tc
                    pts = q.get("points", 10 if qt in ("coding", "sql") else 1)
                    try:
                        time_limit = int(q.get("timeLimit") or q.get("time_limit") or 0)
                    except Exception:
                        time_limit = 0
                    if time_limit < 0:
                        time_limit = 0

                    await cur.execute(
                        """INSERT INTO test_questions
                           (question_id, test_id, section, question_type, question,
                            option_1, option_2, option_3, option_4,
                            correct_answer, explanation, category,
                            test_cases, starter_code, solution_code, points, time_limit)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (
                            qid, test_id, body.section, qt,
                            q.get("question", ""),
                            opts[0], opts[1], opts[2], opts[3],
                            ca, q.get("explanation", ""), q.get("category", "general"),
                            tc_json, q.get("starterCode"), q.get("solutionCode"), pts, time_limit,
                        ),
                    )
                    inserted.append(qid)

                # Update total
                await cur.execute("SELECT COUNT(*) AS c FROM test_questions WHERE test_id = %s", (test_id,))
                cnt = (await cur.fetchone())["c"]
                await cur.execute("UPDATE global_tests SET total_questions = %s WHERE id = %s", (cnt, test_id))
            await conn.commit()

        return {"added": len(inserted), "questionIds": inserted}
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.delete("/global-tests/{test_id}/questions")
async def delete_questions(test_id: str, request: Request, section: Optional[str] = None):
    await _require_test_permission(request, ["tests.update", "tests.create"])
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                q = "DELETE FROM test_questions WHERE test_id = %s"
                p: list = [test_id]
                if section and section in SECTIONS:
                    q += " AND section = %s"
                    p.append(section)
                await cur.execute(q, p)
                deleted = cur.rowcount

                await cur.execute("SELECT COUNT(*) AS c FROM test_questions WHERE test_id = %s", (test_id,))
                cnt = (await cur.fetchone())["c"]
                await cur.execute("UPDATE global_tests SET total_questions = %s WHERE id = %s", (cnt, test_id))
            await conn.commit()
        return {"deleted": deleted}
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.get("/global-tests/{test_id}/questions")
async def get_questions(test_id: str, request: Request, section: Optional[str] = None):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_manage = await _has_any_permission(actor, ["tests.create", "tests.update", "tests.assign", "tests.delete"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or can_attempt):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    try:
        q = "SELECT * FROM test_questions WHERE test_id = %s"
        p: list = [test_id]
        if section and section in SECTIONS:
            q += " AND section = %s"
            p.append(section)
        q += " ORDER BY section, question_id"

        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(q, p)
                rows = await cur.fetchall()

        payload = [
            {
                "id": r["question_id"],
                "testId": r["test_id"],
                "section": r["section"],
                "questionType": r.get("question_type"),
                "question": r["question"],
                "options": [r["option_1"], r["option_2"], r["option_3"], r["option_4"]],
                "correctAnswer": r["correct_answer"],
                "explanation": r.get("explanation"),
                "category": r.get("category"),
                "testCases": _safe_json(r.get("test_cases")),
                "starterCode": r.get("starter_code"),
                "solutionCode": r.get("solution_code"),
                "points": r.get("points") or 1,
                "timeLimit": r.get("time_limit"),
            }
            for r in rows
        ]
        if can_attempt and not can_manage:
            async with pool.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    await cur.execute(
                        "SELECT 1 FROM global_test_allocations WHERE test_id=%s AND student_id=%s LIMIT 1",
                        (test_id, actor),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(403, "This test is not assigned to this user")
            for item in payload:
                item.pop("correctAnswer", None)
                item.pop("explanation", None)
                item.pop("solutionCode", None)
        return payload
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


@router.post("/global-tests/proctoring/log")
async def global_proctoring_log(request: Request):
    data = await request.json()
    user_id = str(data.get("userId") or data.get("user_id") or "")
    session_id = str(data.get("sessionId") or data.get("session_id") or "default")
    event_type = str(data.get("eventType") or data.get("event_type") or "unknown")
    severity = str(data.get("severity") or "low")
    details = data.get("details", "")
    test_id = str(data.get("testId") or data.get("test_id") or "")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO global_test_proctoring_logs
                (test_id, user_id, session_id, event_type, severity, details)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                (test_id or None, user_id, session_id, event_type, severity, json.dumps(details, ensure_ascii=True) if not isinstance(details, str) else details),
            )
        await conn.commit()

    await _insert_unified_proctor_event(
        test_id=test_id,
        user_id=user_id,
        session_id=session_id,
        event_type=event_type,
        severity=severity,
        details=json.dumps(details, ensure_ascii=True) if not isinstance(details, str) else details,
    )

    if len(_global_agent_counter) > _GLOBAL_AGENT_COUNTER_MAX:
        for k in sorted(_global_agent_counter, key=_global_agent_counter.get)[: _GLOBAL_AGENT_COUNTER_MAX // 2]:
            _global_agent_counter.pop(k, None)
    _global_agent_counter[session_id] = _global_agent_counter.get(session_id, 0) + 1
    if severity in ("high", "critical") or _global_agent_counter[session_id] % _GLOBAL_AGENT_INTERVAL == 0:
        task = asyncio.create_task(_maybe_trigger_global_agent(session_id, user_id))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)

    audit_logger.log_event(
        AuditEventType.TEST_PROCTORING_LOG,
        user_id=user_id or None,
        ip_address=_client_ip(request),
        resource_id=session_id,
        resource_type="global_test_session",
        action=f"Global test proctoring: {event_type}",
        details={"severity": severity, "testId": test_id or None},
    )
    return {"success": True}


# â"€â"€â"€ Submit â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

@router.post("/global-tests/{test_id}/submit")
async def submit_global_test(test_id: str, body: GlobalTestSubmit, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["tests.assign"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_assign or (can_attempt and actor == body.studentId)):
        raise HTTPException(403, "Permission denied")
    if not body.studentId:
        raise HTTPException(400, "studentId required")

    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS global_test_allocations (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    test_id VARCHAR(64) NOT NULL,
                    student_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_global_alloc (test_id, student_id)
                )
                """
            )
            await cur.execute("SELECT * FROM global_tests WHERE id = %s", (test_id,))
            test = await cur.fetchone()
            if not test:
                raise HTTPException(404, "Test not found")

            if test.get("status") != "live":
                raise HTTPException(400, "This test is not active")

            now = datetime.now(timezone.utc)
            if test.get("start_time") and now < test["start_time"]:
                raise HTTPException(400, "This test has not started yet")
            if test.get("deadline") and now > test["deadline"]:
                raise HTTPException(400, "This test has ended")

            await cur.execute(
                "SELECT COUNT(*) AS c FROM global_test_submissions WHERE test_id = %s AND student_id = %s",
                (test_id, body.studentId),
            )
            prior_attempts = (await cur.fetchone())["c"]
            await cur.execute(
                "SELECT 1 FROM global_test_allocations WHERE test_id = %s AND student_id = %s LIMIT 1",
                (test_id, body.studentId),
            )
            allocation_row = await cur.fetchone()
            if not allocation_row:
                raise HTTPException(403, "This test is not assigned to this user")
            max_attempts = test.get("max_attempts") or 1
            if max_attempts != -1 and prior_attempts >= max_attempts:
                raise HTTPException(400, "Maximum attempts reached for this test")

            await cur.execute("SELECT * FROM test_questions WHERE test_id = %s", (test_id,))
            questions = await cur.fetchall()

    answers = body.answers or {}

    # Score per section
    section_correct = {s: 0 for s in SECTIONS}
    section_total = {s: 0 for s in SECTIONS}
    section_pts_earned = {s: 0 for s in SECTIONS}
    section_pts_total = {s: 0 for s in SECTIONS}

    for q in questions:
        sec = q["section"]
        section_total[sec] += 1
        section_pts_total[sec] += (q.get("points") or 1)

    question_results: list[dict] = []

    for q in questions:
        user_ans = str(answers.get(q["question_id"], "")).strip() if answers.get(q["question_id"]) is not None else ""
        options = [q["option_1"], q["option_2"], q["option_3"], q["option_4"]]
        options = [o for o in options if o]
        is_correct = False
        pts_earned = 0
        correct_text = ""

        qt = q.get("question_type", "mcq")
        pts = q.get("points") or (10 if qt in ("coding", "sql") else 1)

        if qt == "coding":
            tc_raw = _safe_json(q.get("test_cases"))
            lang = (tc_raw.get("language") if isinstance(tc_raw, dict) else None) or "Python"
            cases = tc_raw if isinstance(tc_raw, list) else (tc_raw.get("cases", []) if isinstance(tc_raw, dict) else [])
            result = await _run_inline_coding_tests(user_ans, lang, cases)
            is_correct = result["isCorrect"]
            pts_earned = pts if is_correct else round((result["percentage"] / 100) * pts)
            correct_text = f"{result['passedCount']}/{result['total']} test cases passed" if result["total"] else "N/A"

        elif qt == "sql":
            schema = q.get("starter_code") or ""
            tc_raw = _safe_json(q.get("test_cases"))
            exp_out = ""
            if isinstance(tc_raw, dict):
                exp_out = tc_raw.get("expectedOutput", "")
            result = await _run_sql_and_compare(schema, user_ans, exp_out)
            is_correct = result["isCorrect"]
            pts_earned = pts if is_correct else 0
            if is_correct:
                correct_text = f"Correct! Expected: {exp_out[:200]}"
            else:
                correct_text = f"Expected: {exp_out[:200]} | User Output: {(result.get('output') or 'Error')[:150]}"

        else:  # mcq
            ca = q["correct_answer"]
            if options:
                try:
                    idx = int(ca)
                    is_correct = user_ans == ca or (idx < len(options) and user_ans == options[idx])
                except (ValueError, IndexError):
                    is_correct = user_ans == ca
            else:
                is_correct = user_ans == ca
            pts_earned = pts if is_correct else 0
            try:
                correct_text = options[int(ca)] if options and int(ca) < len(options) else ca
            except (ValueError, IndexError):
                correct_text = ca

        sec = q["section"]
        if is_correct:
            section_correct[sec] += 1
        section_pts_earned[sec] += pts_earned

        question_results.append({
            "questionId": q["question_id"],
            "section": sec,
            "userAnswer": (user_ans[:500] + "..." if len(user_ans) > 500 else user_ans) if user_ans else "Not Answered",
            "correctAnswer": correct_text,
            "isCorrect": is_correct,
            "pointsEarned": pts_earned,
            "explanation": q.get("explanation"),
        })

    # Compute section %
    section_scores = {}
    for s in SECTIONS:
        if section_total[s] > 0:
            if section_pts_total[s] > 0:
                section_scores[s] = round((section_pts_earned[s] / section_pts_total[s]) * 100)
            else:
                section_scores[s] = round((section_correct[s] / section_total[s]) * 100)
        else:
            section_scores[s] = 0

    total_q = len(questions)
    total_correct = sum(1 for r in question_results if r["isCorrect"])
    total_pts_possible = sum(section_pts_total.values())
    total_pts_earned = sum(section_pts_earned.values())
    overall_pct = round((total_pts_earned / total_pts_possible) * 100) if total_pts_possible else 0
    total_score = overall_pct
    status = "passed" if overall_pct >= test["passing_score"] else "failed"
    sub_id = f"gts-{str(uuid.uuid4())[:12]}"
    submitted_at = datetime.now(timezone.utc)

    # Persist
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            submission_values = {
                "id": sub_id,
                "test_id": test_id,
                "test_title": test["title"],
                "student_id": body.studentId,
                "aptitude_score": section_scores.get("aptitude", 0),
                "verbal_score": section_scores.get("verbal", 0),
                "logical_score": section_scores.get("logical", 0),
                "coding_score": section_scores.get("coding", 0),
                "sql_score": section_scores.get("sql", 0),
                "total_score": total_score,
                "overall_percentage": overall_pct,
                "status": status,
                "time_spent": body.timeSpent,
                "tab_switches": body.tabSwitches,
                "copy_paste_attempts": body.copyPasteAttempts,
                "camera_blocked_count": body.cameraBlockedCount,
                "phone_detection_count": body.phoneDetectionCount,
                "face_missing_count": body.faceMissingCount,
                "total_violations": body.totalViolations,
                "multiple_monitor_count": body.multipleMonitorCount,
                "proctoring_enabled": 1 if body.proctoringEnabled else 0,
                "behavior_session_id": body.behaviorSessionId,
                "submission_type": body.submissionType or "manual",
                "termination_reason": body.terminationReason,
                "submitted_at": submitted_at,
            }

            existing_columns = await _get_table_columns(cur, "global_test_submissions")
            insert_columns = [c for c in submission_values.keys() if c in existing_columns]
            insert_values = [submission_values[c] for c in insert_columns]
            placeholders = ",".join(["%s"] * len(insert_columns))
            columns_sql = ", ".join(insert_columns)

            await cur.execute(
                f"INSERT INTO global_test_submissions ({columns_sql}) VALUES ({placeholders})",
                insert_values,
            )

            for sr in SECTIONS:
                if section_total[sr] == 0:
                    continue
                pct = round((section_correct[sr] / section_total[sr]) * 100) if section_total[sr] else 0
                await cur.execute(
                    """INSERT INTO section_results
                       (id, submission_id, section, correct_count, total_questions,
                        score, percentage, time_spent)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        f"sr-{uuid.uuid4().hex[:16]}", sub_id, sr,
                        section_correct[sr], section_total[sr],
                        section_scores[sr], pct,
                        (body.timeSpent or 0) // 5,
                    ),
                )

            for qr in question_results:
                await cur.execute(
                    """INSERT INTO question_results
                       (id, submission_id, question_id, section, user_answer,
                        correct_answer, is_correct, points_earned, time_taken, explanation)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        f"qr-{uuid.uuid4().hex[:16]}", sub_id, qr["questionId"],
                        qr["section"], qr["userAnswer"], qr["correctAnswer"],
                        1 if qr["isCorrect"] else 0, qr["pointsEarned"],
                        None, qr.get("explanation") or "",
                    ),
                )

        await conn.commit()

    audit_logger.log_event(
        AuditEventType.TEST_COMPLETED,
        user_id=body.studentId,
        ip_address=_client_ip(request),
        resource_id=sub_id,
        resource_type="global_test_submission",
        action="Global test submitted",
        details={"testId": test_id, "status": status, "overallPercentage": overall_pct},
    )
    visibility_state = _result_visibility_status(test, can_manage=can_assign)
    submission_payload = {
        "id": sub_id,
        "score": overall_pct,
        "totalScore": total_score,
        "status": status,
        "sectionScores": section_scores,
        "correctCount": total_correct,
        "totalQuestions": total_q,
        "tabSwitches": body.tabSwitches,
        "timeSpent": body.timeSpent,
        "copyPasteAttempts": body.copyPasteAttempts,
        "cameraBlockedCount": body.cameraBlockedCount,
        "phoneDetectionCount": body.phoneDetectionCount,
        "faceMissingCount": body.faceMissingCount,
        "totalViolations": body.totalViolations,
        "multipleMonitorCount": body.multipleMonitorCount,
        "proctoringEnabled": bool(body.proctoringEnabled),
        "behaviorSessionId": body.behaviorSessionId,
        "submissionType": body.submissionType or "manual",
        "terminationReason": body.terminationReason,
        "questionResults": question_results,
    }
    if not visibility_state["visible"]:
        submission_payload.update(
            {
                "score": None,
                "totalScore": None,
                "sectionScores": {},
                "correctCount": None,
                "questionResults": [],
                "resultsVisible": False,
                "resultVisibility": visibility_state["visibility"],
                "resultVisibilityReason": visibility_state["reason"],
            }
        )
    else:
        submission_payload["resultsVisible"] = True
        submission_payload["resultVisibility"] = visibility_state["visibility"]
    return {
        "submission": submission_payload,
        "message": (
            "Your response was submitted. Results will be released by your organization."
            if not visibility_state["visible"]
            else ("Congratulations! You passed the test!" if status == "passed" else "Keep practicing!")
        ),
    }


# â"€â"€â"€ Submission listing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

@router.get("/global-test-submissions")
async def list_global_submissions(
    request: Request,
    testId: Optional[str] = None,
    studentId: Optional[str] = None,
    mentorId: Optional[str] = None,
):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["tests.assign"])
    can_manage = can_assign or await _has_any_permission(actor, ["tests.create", "tests.update"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or (can_attempt and studentId and actor == studentId)):
        raise HTTPException(403, "Permission denied")
    if can_attempt and not can_manage:
        studentId = actor
    if can_manage and not can_assign:
        # creators/updaters can only query their own student results unless they also have assign permission
        studentId = actor
        mentorId = None
    pool = await get_pool()
    query = """SELECT s.*, u.name AS student_name,
                      g.result_visibility AS test_result_visibility,
                      g.deadline AS test_deadline
               FROM global_test_submissions s
               JOIN users u ON s.student_id = u.id
               LEFT JOIN global_tests g ON g.id = s.test_id
               WHERE 1=1"""
    params: list = []
    if testId:
        query += " AND s.test_id = %s"; params.append(testId)
    if studentId:
        query += " AND s.student_id = %s"; params.append(studentId)
    if mentorId:
        query += " AND u.mentor_id = %s"; params.append(mentorId)
    query += " ORDER BY s.submitted_at DESC"

    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(query, params)
                rows = await cur.fetchall()
        output = []
        for s in rows:
            visibility_state = _result_visibility_status(
                {
                    "result_visibility": s.get("test_result_visibility"),
                    "deadline": s.get("test_deadline"),
                },
                can_manage=can_manage,
            )
            item = {
                "id": s["id"],
                "testId": s["test_id"],
                "testTitle": s["test_title"],
                "studentId": s["student_id"],
                "studentName": s["student_name"],
                "aptitudeScore": s.get("aptitude_score"),
                "verbalScore": s.get("verbal_score"),
                "logicalScore": s.get("logical_score"),
                "codingScore": s.get("coding_score"),
                "sqlScore": s.get("sql_score"),
                "totalScore": s.get("total_score"),
                "overallPercentage": float(s.get("overall_percentage") or 0),
                "status": s["status"],
                "timeSpent": s.get("time_spent"),
                "tabSwitches": s.get("tab_switches"),
                "copyPasteAttempts": s.get("copy_paste_attempts") or 0,
                "cameraBlockedCount": s.get("camera_blocked_count") or 0,
                "phoneDetectionCount": s.get("phone_detection_count") or 0,
                "faceMissingCount": s.get("face_missing_count") or 0,
                "totalViolations": s.get("total_violations") or 0,
                "multipleMonitorCount": s.get("multiple_monitor_count") or 0,
                "proctoringEnabled": bool(s.get("proctoring_enabled")) if s.get("proctoring_enabled") is not None else None,
                "behaviorSessionId": s.get("behavior_session_id"),
                "submissionType": s.get("submission_type"),
                "terminationReason": s.get("termination_reason"),
                "submittedAt": str(s.get("submitted_at", "")),
            }
            if visibility_state["visible"]:
                item["resultsVisible"] = True
                item["resultVisibility"] = visibility_state["visibility"]
            else:
                item = _mask_global_submission(item, visibility_state)
            output.append(item)
        return output
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Failed to list global submissions")


@router.get("/global-test-submissions/{submission_id}")
async def get_global_submission(submission_id: str, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_manage = await _has_any_permission(actor, ["tests.assign", "tests.create", "tests.update"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or can_attempt):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    """SELECT s.*, u.name AS student_name,
                              g.result_visibility AS test_result_visibility,
                              g.deadline AS test_deadline
                       FROM global_test_submissions s
                       JOIN users u ON s.student_id = u.id
                       LEFT JOIN global_tests g ON g.id = s.test_id
                       WHERE s.id = %s""",
                    (submission_id,),
                )
                s = await cur.fetchone()
                if not s:
                    raise HTTPException(404, "Submission not found")
                if not (can_manage or (can_attempt and actor == (s.get("student_id") or ""))):
                    raise HTTPException(403, "Permission denied")

                await cur.execute("SELECT * FROM question_results WHERE submission_id = %s", (submission_id,))
                qr = await cur.fetchall()
                await cur.execute("SELECT * FROM section_results WHERE submission_id = %s", (submission_id,))
                sec = await cur.fetchall()

        visibility_state = _result_visibility_status(
            {
                "result_visibility": s.get("test_result_visibility"),
                "deadline": s.get("test_deadline"),
            },
            can_manage=can_manage,
        )
        item = {
            "id": s["id"],
            "testId": s["test_id"],
            "testTitle": s["test_title"],
            "studentId": s["student_id"],
            "studentName": s["student_name"],
            "aptitudeScore": s.get("aptitude_score"),
            "verbalScore": s.get("verbal_score"),
            "logicalScore": s.get("logical_score"),
            "codingScore": s.get("coding_score"),
            "sqlScore": s.get("sql_score"),
            "totalScore": s.get("total_score"),
            "overallPercentage": float(s.get("overall_percentage") or 0),
            "status": s["status"],
            "timeSpent": s.get("time_spent"),
            "tabSwitches": s.get("tab_switches"),
            "copyPasteAttempts": s.get("copy_paste_attempts") or 0,
            "cameraBlockedCount": s.get("camera_blocked_count") or 0,
            "phoneDetectionCount": s.get("phone_detection_count") or 0,
            "faceMissingCount": s.get("face_missing_count") or 0,
            "totalViolations": s.get("total_violations") or 0,
            "multipleMonitorCount": s.get("multiple_monitor_count") or 0,
            "proctoringEnabled": bool(s.get("proctoring_enabled")) if s.get("proctoring_enabled") is not None else None,
            "behaviorSessionId": s.get("behavior_session_id"),
            "submissionType": s.get("submission_type"),
            "terminationReason": s.get("termination_reason"),
            "submittedAt": str(s.get("submitted_at", "")),
            "questionResults": [
                {
                    "questionId": r["question_id"],
                    "section": r["section"],
                    "userAnswer": r["user_answer"],
                    "correctAnswer": r["correct_answer"],
                    "isCorrect": bool(r["is_correct"]),
                    "explanation": r.get("explanation"),
                }
                for r in qr
            ],
            "sectionResults": [
                {
                    "section": r["section"],
                    "correctCount": r["correct_count"],
                    "totalQuestions": r["total_questions"],
                    "score": r["score"],
                    "percentage": float(r.get("percentage") or 0),
                }
                for r in sec
            ],
        }
        if visibility_state["visible"]:
            item["resultsVisible"] = True
            item["resultVisibility"] = visibility_state["visibility"]
            return item
        return _mask_global_submission(item, visibility_state)
    except HTTPException:
        raise
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")


# â"€â"€â"€ Personalized report â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

@router.get("/global-test-submissions/{submission_id}/report")
async def get_submission_report(submission_id: str, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_manage = await _has_any_permission(actor, ["tests.assign", "tests.create", "tests.update"])
    can_attempt = await _has_any_permission(actor, ["tests.attempt"])
    if not (can_manage or can_attempt):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    """SELECT s.*, u.name AS student_name, u.email AS student_email,
                              g.result_visibility AS test_result_visibility,
                              g.deadline AS test_deadline
                       FROM global_test_submissions s
                       JOIN users u ON s.student_id = u.id
                       LEFT JOIN global_tests g ON g.id = s.test_id
                       WHERE s.id = %s""",
                    (submission_id,),
                )
                s = await cur.fetchone()
                if not s:
                    raise HTTPException(404, "Submission not found")
                if not (can_manage or (can_attempt and actor == (s.get("student_id") or ""))):
                    raise HTTPException(403, "Permission denied")
                visibility_state = _result_visibility_status(
                    {
                        "result_visibility": s.get("test_result_visibility"),
                        "deadline": s.get("test_deadline"),
                    },
                    can_manage=can_manage,
                )
                if not visibility_state["visible"]:
                    raise HTTPException(403, visibility_state["reason"] or "Results are not released yet")

                await cur.execute("SELECT * FROM personalized_reports WHERE submission_id = %s", (submission_id,))
                existing = await cur.fetchall()
                await cur.execute("SELECT * FROM section_results WHERE submission_id = %s", (submission_id,))
                sec_rows = await cur.fetchall()
                await cur.execute("SELECT * FROM question_results WHERE submission_id = %s", (submission_id,))
                qr_rows = await cur.fetchall()

        section_results: dict = {}
        for r in sec_rows:
            section_results[r["section"]] = {
                "score": r["score"],
                "percentage": float(r.get("percentage") or 0),
                "correctCount": r["correct_count"],
                "totalQuestions": r["total_questions"],
            }

        by_section: dict = {sec: [] for sec in SECTIONS}
        for r in qr_rows:
            if r["section"] in by_section:
                by_section[r["section"]].append(r)

        # Check cached report
        existing_data = None
        needs_regen = False
        if existing:
            existing_data = _safe_json(existing[0].get("report_data"))
            if existing_data and (not existing_data.get("questionInsights") or "Q1" not in existing_data.get("questionInsights", {})):
                needs_regen = True

        if existing_data and not needs_regen:
            ai_analysis = existing_data
        else:
            # Generate AI report
            try:
                perf_summary = ", ".join(
                    f"{sec.upper()}: {section_results.get(sec, {}).get('percentage', 0)}% "
                    f"({section_results.get(sec, {}).get('correctCount', 0)}/{section_results.get(sec, {}).get('totalQuestions', 0)})"
                    for sec in SECTIONS
                )
                q_context = "\n\n".join(
                    f"Q{i+1} [{r['section']}]: "
                    f"{'NOT ANSWERED' if not r.get('user_answer') or r['user_answer'] == 'Not Answered' else ('CORRECT' if r['is_correct'] else 'INCORRECT')} "
                    f"({r.get('points_earned', 0)} points). "
                    f"Student Response: {r.get('user_answer', 'No Answer')}. "
                    f"Correct Answer/Solution: {r.get('correct_answer', 'N/A')}"
                    for i, r in enumerate(qr_rows)
                )

                system_prompt = f"""You are an elite educational consultant. Analyze a student's global assessment.
Student: {s['student_name']}
Overall: {s['overall_percentage']}%
Sections: {perf_summary}

Generate a deeply personalized JSON report:
{{
    "summary": "Overall interpretation",
    "strengths": ["..."],
    "weaknesses": ["..."],
    "actionPlan": ["Step 1", "Step 2"],
    "sectionAnalysis": {{"aptitude": "...", "verbal": "...", "logical": "...", "coding": "...", "sql": "..."}},
    "focusAreas": ["Topic A"],
    "questionInsights": {{
        "Q1": {{"diagnosis": "...", "misstep": "...", "recommendation": "..."}},
        "Q2": {{...}}
    }}
}}

Provide insights for EVERY question. For NOT ANSWERED questions note they were unattempted.
For CORRECT coding/SQL suggest optimizations. For INCORRECT diagnose the logic gap."""

                ai_resp = await cerebras_chat(
                    [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Analyze:\n\n{q_context}"},
                    ],
                    model=settings.GROQ_MODEL,
                    temperature=0.7,
                    max_tokens=4000,
                    response_format={"type": "json_object"},
                )
                content = ai_resp.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                ai_analysis = json.loads(content)

                # Save
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        if needs_regen:
                            await cur.execute(
                                "UPDATE personalized_reports SET report_data = %s WHERE submission_id = %s",
                                (json.dumps(ai_analysis), submission_id),
                            )
                        else:
                            await cur.execute(
                                "INSERT INTO personalized_reports (id, student_id, test_id, submission_id, report_data) VALUES (%s,%s,%s,%s,%s)",
                                (f"pr-{str(uuid.uuid4())[:12]}", s["student_id"], s["test_id"], submission_id, json.dumps(ai_analysis)),
                            )
                    await conn.commit()

            except Exception as ai_err:
                print(f"AI Report Error: {ai_err}")
                strong = [sec for sec in SECTIONS if section_results.get(sec, {}).get("percentage", 0) >= 75]
                weak = [sec for sec in SECTIONS if section_results.get(sec, {}).get("percentage", 0) < 60]
                ai_analysis = {
                    "summary": f"You achieved {s['overall_percentage']}%. Strong in {', '.join(strong) or 'some areas'}.",
                    "strengths": [f"Good performance in {sec}" for sec in strong],
                    "weaknesses": [f"Needs improvement in {sec}" for sec in weak],
                    "actionPlan": ["Review incorrect answers", "Practice more mock tests", "Focus on time management"],
                    "sectionAnalysis": {},
                    "focusAreas": [],
                    "questionInsights": {},
                }

        return {
            "studentInfo": {"id": s["student_id"], "name": s["student_name"], "email": s.get("student_email")},
            "testInfo": {"id": s["test_id"], "title": s["test_title"], "date": str(s.get("submitted_at", ""))},
            "overallPerformance": {
                "totalScore": s.get("total_score"),
                "percentage": float(s.get("overall_percentage") or 0),
                "status": s["status"],
            },
            "sectionWisePerformance": section_results,
            "strengths": ai_analysis.get("strengths", []),
            "weaknesses": ai_analysis.get("weaknesses", []),
            "questionResultsBySection": {sec: [dict(r) for r in rows] for sec, rows in by_section.items()},
            "recommendations": ai_analysis.get("actionPlan", []),
            "personalizedAnalysis": ai_analysis,
        }
    except HTTPException:
        raise
    except Exception as e:
        if "doesn't exist" in str(e):
            raise HTTPException(503, "Global tests not set up.")
        raise HTTPException(500, "Internal server error")
async def _has_any_permission(user_id: str, permissions: list[str]) -> bool:
    return await _auth_has_any_permission(user_id, permissions)



