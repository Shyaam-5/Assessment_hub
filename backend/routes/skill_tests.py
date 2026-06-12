"""Skill Test & Assessment routes â€” ported from Node.js skill_test_routes.js.

Covers: test CRUD, student access, MCQ / Coding / SQL / Interview stages,
proctoring, reports, and admin operations (28 endpoints total).
"""

from __future__ import annotations
import asyncio, json, re, datetime as _dt, uuid
from datetime import datetime, timezone
from typing import Any
import pymysql.err
from fastapi import APIRouter, HTTPException, Query, Body, Request, Depends
from database import get_pool, get_primary_pool
from routes.auth import _has_any_permission as _auth_has_any_permission, assert_assessment_limit_for_actor
from services.otp_delivery import send_exam_allocated_email
from services.ai_service import (
    generate_mcq_questions, generate_coding_problems, generate_sql_problems,
    generate_interview_question, evaluate_interview_answer, evaluate_sql_query,
    generate_final_report,
)
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/skill-tests", tags=["skill-tests"])
audit_logger = get_audit_logger()
LEGACY_EXAM_TAKER_PERMISSIONS = {
    "tests.view_allocated",
    "tests.attempt",
    "aptitude.attempt",
    "coding.attempt",
    "communication.attempt",
    "results.view_own",
}


def _is_missing_table_error(exc: Exception) -> bool:
    return isinstance(exc, pymysql.err.ProgrammingError) and len(exc.args) > 0 and exc.args[0] == 1146


async def _insert_unified_proctor_event(
    *,
    user_id: str,
    attempt_id: str,
    event_type: str,
    severity: str,
    details: str,
    test_stage: str,
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
                ("skill", None, attempt_id, user_id, attempt_id, event_type, severity, _json_str({"stage": test_stage, "details": details})),
            )
        await conn.commit()


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
        resource_type="skill_tests_read",
        query_params={"path": request.url.path, "query": request.url.query},
    )


async def _require_actor(request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT id FROM users WHERE id = %s LIMIT 1", (actor,))
            if not await cur.fetchone():
                raise HTTPException(status_code=401, detail="Invalid user context")
    return actor


async def _require_skill_permission(request: Request, permissions: list[str]) -> str:
    actor = await _require_actor(request)
    if not await _has_any_permission(actor, permissions):
        raise HTTPException(status_code=403, detail="Permission denied")
    return actor


async def _load_attempt_for_actor(request: Request, attempt_id: int) -> dict:
    actor = await _require_actor(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM skill_test_attempts WHERE id=%s", (attempt_id,))
            attempt = await cur.fetchone()
            if not attempt:
                raise HTTPException(404, "Attempt not found")
    can_assign = await _has_any_permission(actor, ["coding.assign"])
    can_attempt = await _has_any_permission(actor, ["coding.attempt"])
    if not (can_assign or (can_attempt and actor == (attempt.get("student_id") or ""))):
        raise HTTPException(403, "Permission denied")
    return attempt


router.dependencies.append(Depends(_log_read_access))
router.dependencies.append(Depends(_require_actor))

# â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BASE_TABLES = ["employees", "departments", "projects", "orders"]
_ALLOC_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS skill_test_allocations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        test_id INT NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_skill_alloc (test_id, student_id)
    )
"""

def _sandbox_names(test_id: int) -> dict[str, str]:
    return {t: f"st{test_id}_{t}" for t in BASE_TABLES}


def _rewrite_sql_to_sandbox(sql_query: str, sandbox_names: dict[str, str]) -> str:
    rewritten = sql_query
    for base_name, sandbox_name in sandbox_names.items():
        rewritten = re.sub(rf"\b{re.escape(base_name)}\b", sandbox_name, rewritten, flags=re.IGNORECASE)
    return rewritten


def _normalize_sql_problem(problem: dict, sandbox_names: dict[str, str]) -> dict:
    normalized = dict(problem or {})
    for key, value in list(normalized.items()):
        if not isinstance(value, str):
            continue
        updated = value
        for base_name, sandbox_name in sandbox_names.items():
            updated = re.sub(rf"\b{re.escape(sandbox_name)}\b", base_name, updated, flags=re.IGNORECASE)
        normalized[key] = updated
    return normalized

def _safe_json(val: Any) -> Any:
    if val is None: return None
    return json.loads(val) if isinstance(val, str) else val

def _json_str(val: Any) -> str:
    return json.dumps(val, default=str)


def _normalize_excluded_violation_types(config: Any) -> list[str]:
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except Exception:
            config = {}
    if not isinstance(config, dict):
        return ["window_blur"]
    excluded = config.get("excluded_violation_types")
    if not isinstance(excluded, list):
        return ["window_blur"]
    return [str(item).strip() for item in excluded if str(item).strip()]

async def _create_sandbox(test_id: int):
    t = _sandbox_names(test_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"CREATE TABLE IF NOT EXISTS {t['employees']} (id INT PRIMARY KEY,name VARCHAR(100),department VARCHAR(100),salary DECIMAL(10,2),hire_date DATE,manager_id INT)")
            await cur.execute(f"CREATE TABLE IF NOT EXISTS {t['departments']} (id INT PRIMARY KEY,name VARCHAR(100),budget DECIMAL(12,2),location VARCHAR(100))")
            await cur.execute(f"CREATE TABLE IF NOT EXISTS {t['projects']} (id INT PRIMARY KEY,name VARCHAR(100),department_id INT,start_date DATE,end_date DATE,status VARCHAR(50))")
            await cur.execute(f"CREATE TABLE IF NOT EXISTS {t['orders']} (id INT PRIMARY KEY,customer_name VARCHAR(100),product VARCHAR(100),quantity INT,price DECIMAL(10,2),order_date DATE)")
            await cur.execute(f"SELECT COUNT(*) as cnt FROM {t['employees']}")
            row = await cur.fetchone()
            if row["cnt"] == 0:
                await cur.execute(f"INSERT INTO {t['departments']} VALUES (1,'Engineering',500000,'New York'),(2,'Marketing',300000,'San Francisco'),(3,'Sales',350000,'Chicago'),(4,'HR',200000,'New York'),(5,'Finance',400000,'Boston')")
                await cur.execute(f"INSERT INTO {t['employees']} VALUES (1,'Alice Johnson','Engineering',95000,'2020-03-15',NULL),(2,'Bob Smith','Engineering',88000,'2021-07-01',1),(3,'Carol Williams','Marketing',72000,'2019-11-20',NULL),(4,'David Brown','Marketing',68000,'2022-01-10',3),(5,'Eve Davis','Sales',76000,'2020-06-25',NULL),(6,'Frank Miller','Sales',71000,'2021-09-14',5),(7,'Grace Wilson','HR',65000,'2018-04-03',NULL),(8,'Henry Taylor','HR',62000,'2023-02-18',7),(9,'Ivy Anderson','Finance',90000,'2019-08-12',NULL),(10,'Jack Thomas','Finance',85000,'2020-12-01',9),(11,'Karen Martinez','Engineering',92000,'2021-03-22',1),(12,'Leo Garcia','Engineering',78000,'2023-06-15',1),(13,'Mia Robinson','Sales',74000,'2022-04-10',5),(14,'Noah Clark','Marketing',70000,'2023-09-01',3),(15,'Olivia Lewis','Finance',88000,'2021-11-05',9)")
                await cur.execute(f"INSERT INTO {t['projects']} VALUES (1,'Website Redesign',1,'2024-01-15','2024-06-30','completed'),(2,'Mobile App',1,'2024-03-01','2024-12-31','in_progress'),(3,'Q1 Campaign',2,'2024-01-01','2024-03-31','completed'),(4,'Brand Refresh',2,'2024-06-01','2024-09-30','in_progress'),(5,'Sales Portal',3,'2024-02-15','2024-08-15','completed'),(6,'CRM Integration',3,'2024-07-01','2025-01-31','in_progress'),(7,'Employee Portal',4,'2024-04-01','2024-10-31','completed'),(8,'Budget System',5,'2024-05-01',NULL,'planned')")
                await cur.execute(f"INSERT INTO {t['orders']} VALUES (1,'John Doe','Laptop',2,1200,'2024-01-15'),(2,'Jane Smith','Keyboard',5,75,'2024-01-20'),(3,'Bob Johnson','Monitor',3,450,'2024-02-10'),(4,'Alice Brown','Mouse',10,25,'2024-02-14'),(5,'Charlie Wilson','Laptop',1,1200,'2024-03-01'),(6,'Diana Taylor','Headphones',4,150,'2024-03-15'),(7,'John Doe','Monitor',1,450,'2024-04-02'),(8,'Jane Smith','Laptop',1,1200,'2024-04-18'),(9,'Eve Martinez','Keyboard',3,75,'2024-05-05'),(10,'Frank Garcia','Mouse',8,25,'2024-05-20'),(11,'Grace Lee','Laptop',2,1200,'2024-06-10'),(12,'Bob Johnson','Headphones',2,150,'2024-06-25'),(13,'Alice Brown','Monitor',1,450,'2024-07-08'),(14,'Charlie Wilson','Keyboard',6,75,'2024-07-22'),(15,'Diana Taylor','Laptop',1,1200,'2024-08-05')")
            await conn.commit()

async def _drop_sandbox(test_id: int):
    t = _sandbox_names(test_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            for name in t.values():
                await cur.execute(f"DROP TABLE IF EXISTS {name}")
        await conn.commit()

def _mcq_answer_index(answer) -> int:
    if isinstance(answer, str) and len(answer) == 1 and answer.isalpha():
        return ord(answer.upper()) - 65
    if isinstance(answer, (int, float)):
        return int(answer)
    return -1

def _calc_mcq_stats(attempt: dict) -> dict:
    questions = _safe_json(attempt.get("mcq_questions")) or []
    answers = _safe_json(attempt.get("mcq_answers")) or {}
    correct = 0
    details = []
    for q in questions:
        sa = answers.get(str(q.get("id"))) or answers.get(q.get("id"))
        si = _mcq_answer_index(sa)
        ci = _mcq_answer_index(q.get("correct_answer", -2))
        ok = si == ci
        if ok: correct += 1
        details.append({"question": q.get("question",""), "skill": q.get("skill","General"), "correct": ok, "student_answer": sa or "Not answered", "correct_answer_index": ci, "explanation": q.get("explanation","")})
    total = len(questions)
    score = (correct / total * 100) if total else 0
    passed = attempt.get("mcq_status") == "completed" or score >= (attempt.get("mcq_passing_score") or 0)
    return {"score": score, "correct": correct, "total": total, "passed": passed, "questionDetails": details}

def _calc_coding_stats(attempt: dict) -> dict:
    problems = _safe_json(attempt.get("coding_problems")) or []
    subs = _safe_json(attempt.get("coding_submissions")) or {}
    solved = sum(1 for p in problems if (subs.get(str(p.get("id"))) or {}).get("passed"))
    if solved == 0 and subs: solved = len(subs)
    total = len(problems)
    score = (solved / total * 100) if total else 0
    passed = attempt.get("coding_status") == "completed" or score >= (attempt.get("coding_passing_score") or 0)
    return {"score": score, "solved": solved, "total": total, "passed": passed, "problemDetails": [{"title": p.get("title",""), "solved": bool((subs.get(str(p.get("id"))) or {}).get("passed"))} for p in problems]}

def _calc_sql_stats(attempt: dict) -> dict:
    problems = _safe_json(attempt.get("sql_problems")) or []
    subs = _safe_json(attempt.get("sql_submissions")) or {}
    solved = sum(1 for p in problems if (subs.get(str(p.get("id"))) or {}).get("passed"))
    total = len(problems)
    score = (solved / total * 100) if total else 0
    passed = attempt.get("sql_status") == "completed" or score >= (attempt.get("sql_passing_score") or 0)
    return {"score": score, "solved": solved, "total": total, "passed": passed, "problemDetails": [{"title": p.get("title",""), "solved": bool((subs.get(str(p.get("id"))) or {}).get("passed"))} for p in problems]}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ADMIN: CREATE / MANAGE
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.get("/org-students")
async def list_skill_org_students(request: Request):
    """Return exam takers available for skill test allocation (requires coding.assign)."""
    await _require_skill_permission(request, ["coding.assign"])
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
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


@router.get("/{test_id}/allocations")
async def get_skill_test_allocations(test_id: int, request: Request):
    """List students currently allocated to a skill test."""
    await _require_skill_permission(request, ["coding.assign"])
    pool = await get_pool()
    primary_pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(_ALLOC_TABLE_DDL)
            await cur.execute(
                """SELECT a.student_id
                   FROM skill_test_allocations a
                   WHERE a.test_id = %s""",
                (test_id,),
            )
            rows = await cur.fetchall()
    student_ids = [str(r["student_id"]) for r in (rows or []) if r.get("student_id")]
    if not student_ids:
        return []
    placeholders = ",".join(["%s"] * len(student_ids))
    async with primary_pool.acquire() as primary_conn:
        async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
            await primary_cur.execute(
                f"SELECT id, name, email FROM users WHERE id IN ({placeholders})",
                tuple(student_ids),
            )
            users = await primary_cur.fetchall()
    by_id = {str(row["id"]): row for row in (users or [])}
    return [{"studentId": sid, "name": (by_id.get(sid) or {}).get("name"), "email": (by_id.get(sid) or {}).get("email")} for sid in student_ids]


@router.post("/{test_id}/allocations")
async def set_skill_test_allocations(test_id: int, request: Request):
    """Replace all student allocations for a skill test."""
    actor = await _require_skill_permission(request, ["coding.assign"])
    data = await request.json()
    student_ids = data.get("studentIds", [])
    if not isinstance(student_ids, list):
        raise HTTPException(400, "studentIds must be a list")
    student_ids = [str(sid or "").strip() for sid in student_ids if str(sid or "").strip()]

    pool = await get_pool()
    primary_pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
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
                                u.role IN ('student', 'learner')
                                OR (
                                    u.role = 'org_user'
                                    AND (
                                        LOWER(TRIM(COALESCE(r.slug, ''))) = 'exam-taker'
                                        OR LOWER(TRIM(COALESCE(r.name, ''))) = 'exam taker'
                                    )
                                )
                            )
                            """,
                            tuple(student_ids),
                        )
                        allowed_ids = {str(r["id"]) for r in (await primary_cur.fetchall() or [])}
                invalid_ids = [sid for sid in student_ids if sid not in allowed_ids]
                if invalid_ids:
                    raise HTTPException(400, "Only student, learner, or exam-taker users can be allocated")
            await cur.execute("DELETE FROM skill_test_allocations WHERE test_id = %s", (test_id,))
            for sid in student_ids:
                await cur.execute(
                    "INSERT IGNORE INTO skill_test_allocations (id, test_id, student_id) VALUES (%s, %s, %s)",
                    (str(uuid.uuid4()), test_id, sid),
                )
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_MODIFIED,
        user_id=actor,
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="skill_test",
        action="Skill test allocations updated",
        details={"studentCount": len(student_ids)},
    )

    if student_ids:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    await cur.execute("SELECT title FROM skill_tests WHERE id = %s", (test_id,))
                    trow = await cur.fetchone()
                    test_title = (trow.get("title") if trow else None) or "Skill Test"
                    placeholders = ",".join(["%s"] * len(student_ids))
            async with primary_pool.acquire() as primary_conn:
                async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
                    await primary_cur.execute(
                        f"SELECT name, email FROM users WHERE id IN ({placeholders})",
                        tuple(student_ids),
                    )
                    recipients = [(r.get("name") or "User", r.get("email") or "") for r in (await primary_cur.fetchall() or []) if (r.get("email") or "").strip()]
            for name, email in recipients:
                try:
                    await asyncio.to_thread(send_exam_allocated_email, email, name, test_title, "Skill Test")
                except Exception:
                    pass
        except Exception:
            pass

    return {"allocated": len(student_ids)}


@router.post("/create")
async def create_test(request: Request, body: dict = Body(...)):
    actor = await _require_skill_permission(request, ["coding.create", "coding.assign"])
    await assert_assessment_limit_for_actor(actor)
    mcq_count = max(0, int(body.get("mcq_count", 10) or 0))
    coding_count = max(0, int(body.get("coding_count", 3) or 0))
    sql_count = max(0, int(body.get("sql_count", 3) or 0))
    interview_count = max(0, int(body.get("interview_count", 5) or 0))
    proctoring_enabled = bool(body.get("proctoring_enabled", True))
    proctoring_config = body.get("proctoring_config") or {
        "camera": True,
        "mic": True,
        "fullscreen": True,
        "tab_switch": True,
        "max_tab_switches": 3,
        "paste_disabled": True,
        "face_detection": True,
        "camera_block_detect": True,
        "phone_detect": True,
        "multiple_people_detect": True,
        "multi_monitor_detect": True,
        "auto_submit_on_violation": True,
        "excluded_violation_types": ["window_blur"],
    }
    total_questions = mcq_count + coding_count + sql_count + interview_count
    if total_questions <= 0:
        raise HTTPException(status_code=400, detail="Add at least one question or problem before creating a skill test")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO skill_tests (title,description,skills,mcq_count,coding_count,sql_count,interview_count,attempt_limit,mcq_duration_minutes,coding_duration_minutes,sql_duration_minutes,interview_duration_minutes,mcq_passing_score,coding_passing_score,sql_passing_score,interview_passing_score,proctoring_enabled,proctoring_config) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (body.get("title"), body.get("description"), _json_str(body.get("skills",[])), mcq_count, coding_count, sql_count, interview_count, body.get("attempt_limit",3), body.get("mcq_duration_minutes",30), body.get("coding_duration_minutes",60), body.get("sql_duration_minutes",30), body.get("interview_duration_minutes",30), body.get("mcq_passing_score",60), body.get("coding_passing_score",60), body.get("sql_passing_score",60), body.get("interview_passing_score",5), proctoring_enabled, _json_str(proctoring_config))
            )
            test_id = cur.lastrowid
        await conn.commit()
    if sql_count and int(sql_count) > 0:
        try: await _create_sandbox(test_id)
        except Exception as e: print(f"Sandbox creation warning: {e}")
    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_CREATED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="skill_test",
        action="Skill test created",
        details={"title": body.get("title")},
    )
    return {"success": True, "id": test_id}

@router.get("/all")
async def get_all_tests(request: Request):
    await _require_skill_permission(request, ["coding.create", "coding.assign", "coding.evaluate"])
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM skill_tests ORDER BY created_at DESC")
                rows = await cur.fetchall()
                test_ids = [str(r.get("id")) for r in (rows or []) if r.get("id")]
                alloc_counts: dict[str, int] = {}
                if test_ids:
                    await cur.execute(_ALLOC_TABLE_DDL)
                    placeholders = ",".join(["%s"] * len(test_ids))
                    await cur.execute(
                        f"""SELECT test_id, COUNT(*) AS cnt
                            FROM skill_test_allocations
                            WHERE test_id IN ({placeholders})
                            GROUP BY test_id""",
                        test_ids,
                    )
                    for row in (await cur.fetchall()) or []:
                        alloc_counts[str(row.get("test_id"))] = int(row.get("cnt") or 0)
    except Exception as exc:
        if _is_missing_table_error(exc):
            return []
        raise
    return [
        dict(
            r,
            skills=_safe_json(r.get("skills")),
            proctoring_config=_safe_json(r.get("proctoring_config")),
            allocatedCount=alloc_counts.get(str(r.get("id")), 0),
        )
        for r in rows
    ]

@router.put("/{test_id}/toggle")
async def toggle_test(test_id: int, request: Request):
    await _require_skill_permission(request, ["coding.create", "coding.assign"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_tests SET is_active = NOT is_active WHERE id = %s", (test_id,))
        await conn.commit()
    return {"success": True}

@router.delete("/{test_id}")
async def delete_test(test_id: int, request: Request):
    await _require_skill_permission(request, ["coding.create", "coding.assign"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT sql_count FROM skill_tests WHERE id = %s", (test_id,))
            row = await cur.fetchone()
            had_sql = row and (row.get("sql_count") or 0) > 0
            await cur.execute("DELETE FROM skill_test_allocations WHERE test_id = %s", (test_id,))
            await cur.execute("DELETE FROM skill_test_attempts WHERE test_id = %s", (test_id,))
            await cur.execute("DELETE FROM skill_tests WHERE id = %s", (test_id,))
        await conn.commit()
    if had_sql:
        try: await _drop_sandbox(test_id)
        except Exception as e: print(f"Drop sandbox warning: {e}")
    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_DELETED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=str(test_id),
        resource_type="skill_test",
        action="Skill test deleted",
    )
    return {"success": True}

@router.get("/{test_id}/attempts")
async def get_test_attempts(test_id: int, request: Request):
    await _require_skill_permission(request, ["coding.assign", "coding.evaluate"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM skill_test_attempts WHERE test_id = %s ORDER BY started_at DESC", (test_id,))
            return await cur.fetchall()

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STUDENT: DISCOVER & START
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.get("/student/available")
async def student_available(studentId: str = Query(...), request: Request = None):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip() if request else ""
    can_assign = await _has_any_permission(actor, ["coding.assign"])
    can_attempt = await _has_any_permission(actor, ["coding.attempt"])
    if not (can_assign or (can_attempt and actor == studentId)):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_test_allocations (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    test_id INT NOT NULL,
                    student_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_skill_alloc (test_id, student_id)
                )
                """
            )
            await cur.execute(
                """
                SELECT *
                FROM skill_tests
                WHERE is_active = TRUE
                  AND id IN (SELECT test_id FROM skill_test_allocations WHERE student_id = %s)
                ORDER BY created_at DESC
                """,
                (studentId,),
            )
            tests = await cur.fetchall()
            enriched = []
            for t in tests:
                await cur.execute("SELECT id,attempt_number,overall_status,current_stage,mcq_score,started_at FROM skill_test_attempts WHERE test_id=%s AND student_id=%s ORDER BY attempt_number DESC", (t["id"], studentId))
                attempts = await cur.fetchall()
                enriched.append({
                    **t,
                    "skills": _safe_json(t.get("skills")),
                    "proctoring_config": _safe_json(t.get("proctoring_config")),
                    "attempts_used": len(attempts),
                    "can_attempt": len(attempts) < t["attempt_limit"] and not any(a["overall_status"] == "completed" for a in attempts),
                    "my_attempts": attempts
                })
    return enriched

@router.post("/{test_id}/start")
async def start_attempt(test_id: int, request: Request, body: dict = Body(...)):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    can_assign = await _has_any_permission(actor, ["coding.assign"])
    can_attempt = await _has_any_permission(actor, ["coding.attempt"])
    if not (can_assign or (can_attempt and actor == body.get("studentId"))):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_test_allocations (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    test_id INT NOT NULL,
                    student_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_skill_alloc (test_id, student_id)
                )
                """
            )
            await cur.execute("SELECT * FROM skill_tests WHERE id = %s", (test_id,))
            test = await cur.fetchone()
            if not test: raise HTTPException(404, "Test not found")
            await cur.execute(
                "SELECT 1 FROM skill_test_allocations WHERE test_id=%s AND student_id=%s LIMIT 1",
                (test_id, body["studentId"]),
            )
            if not await cur.fetchone():
                raise HTTPException(403, "This test is not assigned to this user")
            await cur.execute("SELECT id FROM skill_test_attempts WHERE test_id=%s AND student_id=%s", (test_id, body["studentId"]))
            attempts = await cur.fetchall()
            if len(attempts) >= test["attempt_limit"]:
                raise HTTPException(400, "Attempt limit reached for this test")
            await cur.execute("INSERT INTO skill_test_attempts (test_id,student_id,student_name,attempt_number) VALUES (%s,%s,%s,%s)", (test_id, body["studentId"], body.get("studentName",""), len(attempts)+1))
            aid = cur.lastrowid
        await conn.commit()
    audit_logger.log_event(
        AuditEventType.TEST_STARTED,
        user_id=body.get("studentId"),
        ip_address=_client_ip(request),
        resource_id=str(aid),
        resource_type="skill_test_attempt",
        action="Skill test attempt started",
        details={"testId": test_id},
    )
    return {"success": True, "attemptId": aid}

@router.get("/attempt/{attempt_id}")
async def get_attempt(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.title as test_title,t.skills as test_skills,t.proctoring_enabled,t.proctoring_config FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            a = await cur.fetchone()
    if not a: raise HTTPException(404, "Attempt not found")
    return {
        **a,
        "test_skills": _safe_json(a.get("test_skills")),
        "proctoring_config": _safe_json(a.get("proctoring_config")),
        "mcq_questions": _safe_json(a.get("mcq_questions")),
        "coding_problems": _safe_json(a.get("coding_problems")),
        "sql_problems": _safe_json(a.get("sql_problems")),
        "interview_qa": _safe_json(a.get("interview_qa"))
    }

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STAGE 1: MCQ
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/mcq/start/{attempt_id}")
async def mcq_start(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.mcq_count,t.mcq_duration_minutes FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    dur = attempt.get("mcq_duration_minutes") or 30
    if attempt.get("mcq_questions"):
        start = attempt.get("mcq_start_time") or datetime.now(timezone.utc)
        if isinstance(start, str):
            start = datetime.fromisoformat(start)
        end = start + _dt.timedelta(minutes=dur)
        return {"questions": _safe_json(attempt["mcq_questions"]), "end_time": end.isoformat(), "existing_answers": _safe_json(attempt.get("mcq_answers")) or {}}
    skills = _safe_json(attempt.get("skills")) or []
    questions = await generate_mcq_questions(skills, attempt.get("mcq_count") or 10)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET mcq_questions=%s, mcq_start_time=CURRENT_TIMESTAMP WHERE id=%s", (_json_str(questions), attempt_id))
        await conn.commit()
    end = datetime.now(timezone.utc) + _dt.timedelta(minutes=dur)
    return {"questions": questions, "end_time": end.isoformat()}

@router.post("/mcq/submit")
async def mcq_submit(request: Request, body: dict = Body(...)):
    attempt_id = body["attemptId"]
    answers = body.get("answers", {})
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.mcq_passing_score,t.title,t.skills FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    questions = _safe_json(attempt.get("mcq_questions")) or []
    # Already completed?
    if attempt.get("mcq_status") == "completed" or (attempt.get("current_stage") and attempt.get("current_stage") != "mcq"):
        correct_count = round((attempt.get("mcq_score", 0) / 100) * len(questions))
        is_passed = (attempt.get("mcq_score", 0) >= attempt.get("mcq_passing_score", 60))
        return {"success": True, "score": attempt.get("mcq_score", 0), "passed": is_passed, "correct": correct_count, "total": len(questions), "nextStage": "coding" if is_passed else None}
    # Score
    correct_count = 0
    for q in questions:
        sa = answers.get(str(q.get("id"))) or answers.get(q.get("id"))
        si = _mcq_answer_index(sa)
        ci = _mcq_answer_index(q.get("correct_answer", -2))
        if si == ci:
            correct_count += 1
    score = (correct_count / len(questions) * 100) if questions else 0
    passed = score >= (attempt.get("mcq_passing_score") or 60)
    # Build question details for report
    q_details = []
    for q in questions:
        sa = answers.get(str(q.get("id"))) or answers.get(q.get("id"))
        si = _mcq_answer_index(sa)
        ci = _mcq_answer_index(q.get("correct_answer", -2))
        q_details.append({"question": q.get("question",""), "skill": q.get("skill","General"), "correct": si == ci, "student_answer": sa or "Not answered", "correct_answer_index": ci, "explanation": q.get("explanation","")})
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if not passed:
                report = None
                try:
                    skills = _safe_json(attempt.get("skills")) or []
                    report = await generate_final_report(attempt.get("title","Skill Test"), skills, {"score": score, "correct": correct_count, "total": len(questions), "passed": False, "questionDetails": q_details}, {"score": 0, "solved": 0, "total": 0, "passed": False, "problemDetails": []}, {"score": 0, "solved": 0, "total": 0, "passed": False, "problemDetails": []}, {"avgScore": 0, "answered": 0, "total": 0, "passed": False, "highlights": []}, attempt.get("mcq_violations") or 0)
                except Exception:
                    report = {"overall_rating": "Not Recommended", "summary": f"MCQ score {round(score)}% ({correct_count}/{len(questions)}). Below passing."}
                await cur.execute("UPDATE skill_test_attempts SET mcq_answers=%s,mcq_score=%s,mcq_status='failed',mcq_end_time=CURRENT_TIMESTAMP,current_stage='mcq',overall_status='failed',report=%s WHERE id=%s", (_json_str(answers), score, _json_str(report), attempt_id))
            else:
                await cur.execute("UPDATE skill_test_attempts SET mcq_answers=%s,mcq_score=%s,mcq_status='completed',mcq_end_time=CURRENT_TIMESTAMP,current_stage='coding',overall_status='in_progress' WHERE id=%s", (_json_str(answers), score, attempt_id))
        await conn.commit()
    return {"success": True, "score": score, "passed": passed, "correct": correct_count, "total": len(questions), "nextStage": "coding" if passed else None}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STAGE 2: CODING
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/coding/start/{attempt_id}")
async def coding_start(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.coding_count,t.coding_duration_minutes FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    existing_subs = _safe_json(attempt.get("coding_submissions")) or {}
    if attempt.get("coding_problems"):
        return {"problems": _safe_json(attempt["coding_problems"]), "existing_submissions": existing_subs, "duration_minutes": attempt.get("coding_duration_minutes")}
    skills = _safe_json(attempt.get("skills")) or []
    problems = await generate_coding_problems(skills, attempt.get("coding_count") or 3)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET coding_problems=%s WHERE id=%s", (_json_str(problems), attempt_id))
        await conn.commit()
    return {"problems": problems, "existing_submissions": {}, "duration_minutes": attempt.get("coding_duration_minutes")}

@router.post("/coding/regenerate/{attempt_id}")
async def coding_regenerate(attempt_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.coding_count FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    skills = _safe_json(attempt.get("skills")) or []
    problems = await generate_coding_problems(skills, attempt.get("coding_count") or 3)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET coding_problems=%s WHERE id=%s", (_json_str(problems), attempt_id))
        await conn.commit()
    return {"success": True, "problems": problems}

@router.post("/coding/run")
async def coding_run(body: dict = Body(...)):
    """Execute code using the Piston API (same as /api/run)."""
    import httpx as _httpx
    code = body.get("code", "")
    language = body.get("language", "")
    input_data = body.get("input_data", "")
    if not code or not language:
        return {"success": False, "error": "Code and language are required"}
    lang_map = {"python": "3.10.0", "javascript": "18.15.0", "java": "15.0.2", "cpp": "10.2.0", "c": "10.2.0", "typescript": "5.0.3"}
    version = lang_map.get(language.lower(), "")
    if not version:
        return {"success": True, "output": f"[Note: {language} execution not available. Code saved for evaluation.]"}
    piston_lang = "c++" if language.lower() == "cpp" else language.lower()
    try:
        async with _httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://emkc.org/api/v2/piston/execute", json={"language": piston_lang, "version": version, "files": [{"content": code}], "stdin": input_data})
        data = resp.json()
        run = data.get("run", {})
        return {"success": run.get("code", 1) == 0, "output": run.get("stdout", ""), "error": run.get("stderr", "")}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/coding/submit")
async def coding_submit(request: Request, body: dict = Body(...)):
    actor = await _require_actor(request)
    attempt_id = body.get("attemptId")
    problem_id = body.get("problemId")
    if not attempt_id or not problem_id:
        raise HTTPException(400, "attemptId and problemId are required")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM skill_test_attempts WHERE id=%s", (attempt_id,))
            attempt = await cur.fetchone()
            if not attempt:
                raise HTTPException(404, "Attempt not found")
            can_assign = await _has_any_permission(actor, ["coding.assign"])
            can_attempt = await _has_any_permission(actor, ["coding.attempt"])
            if not (can_assign or (can_attempt and actor == (attempt.get("student_id") or ""))):
                raise HTTPException(403, "Permission denied")
            subs = _safe_json(attempt.get("coding_submissions")) or {}
            test_results = body.get("test_results") or []
            all_passed = bool(test_results) and all(bool(r.get("passed")) for r in test_results if isinstance(r, dict))
            subs[str(problem_id)] = {
                "code": body.get("code", ""),
                "language": body.get("language", ""),
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "passed": bool(all_passed),
                "test_results": test_results,
            }
            await cur.execute("UPDATE skill_test_attempts SET coding_submissions=%s WHERE id=%s", (_json_str(subs), attempt_id))
        await conn.commit()
    return {"success": True, "all_passed": bool(all_passed), "test_results": test_results}

@router.post("/coding/finish/{attempt_id}")
async def coding_finish(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.coding_passing_score,t.title as test_title,t.skills as test_skills FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    subs = _safe_json(attempt.get("coding_submissions")) or {}
    problems = _safe_json(attempt.get("coding_problems")) or []
    num = len(problems)
    submitted = len(subs)
    score = (submitted / num * 100) if num else 0
    passed = score >= (attempt.get("coding_passing_score") or 60)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if not passed:
                report = None
                try:
                    skills = _safe_json(attempt.get("test_skills")) or []
                    mcq_s = _calc_mcq_stats(attempt)
                    report = await generate_final_report(attempt.get("test_title","Skill Test"), skills, mcq_s, {"score": score, "solved": submitted, "total": num, "passed": False, "problemDetails": [{"title": p.get("title",""), "solved": bool(subs.get(str(p.get("id"))))} for p in problems]}, {"score": 0, "solved": 0, "total": 0, "passed": False, "problemDetails": []}, {"avgScore": 0, "answered": 0, "total": 0, "passed": False, "highlights": []}, attempt.get("mcq_violations") or 0)
                except Exception:
                    report = {"overall_rating": "Needs Improvement", "summary": f"Coding {round(score)}% ({submitted}/{num} solved)."}
                await cur.execute("UPDATE skill_test_attempts SET coding_score=%s,coding_status='failed',current_stage='coding',overall_status='failed',report=%s WHERE id=%s", (score, _json_str(report), attempt_id))
            else:
                await cur.execute("UPDATE skill_test_attempts SET coding_score=%s,coding_status='completed',current_stage='sql' WHERE id=%s", (score, attempt_id))
        await conn.commit()
    return {"success": True, "score": score, "passed": passed, "solved": submitted, "total": num, "nextStage": "sql" if passed else None}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STAGE 3: SQL
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/sql/start/{attempt_id}")
async def sql_start(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.sql_count,t.sql_duration_minutes,t.id as tid FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    test_id = attempt.get("test_id") or attempt.get("tid")
    existing_subs = _safe_json(attempt.get("sql_submissions")) or {}
    table_names = _sandbox_names(test_id)
    if attempt.get("sql_problems"):
        problems = [
            _normalize_sql_problem(problem, table_names)
            for problem in (_safe_json(attempt["sql_problems"]) or [])
        ]
        return {"problems": problems, "existing_submissions": existing_subs, "duration_minutes": attempt.get("sql_duration_minutes")}
    try:
        await _create_sandbox(test_id)
    except Exception as e:
        print(f"Sandbox creation skipped: {e}")
    skills = _safe_json(attempt.get("skills")) or []
    problems = await generate_sql_problems(skills, attempt.get("sql_count") or 3, table_names)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET sql_problems=%s WHERE id=%s", (_json_str(problems), attempt_id))
        await conn.commit()
    visible_problems = [_normalize_sql_problem(problem, table_names) for problem in problems]
    return {"problems": visible_problems, "existing_submissions": {}, "duration_minutes": attempt.get("sql_duration_minutes")}

@router.post("/sql/regenerate/{attempt_id}")
async def sql_regenerate(attempt_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.sql_count,t.id as tid FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    test_id = attempt.get("test_id") or attempt.get("tid")
    table_names = _sandbox_names(test_id)
    skills = _safe_json(attempt.get("skills")) or []
    problems = await generate_sql_problems(skills, attempt.get("sql_count") or 3, table_names)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET sql_problems=%s WHERE id=%s", (_json_str(problems), attempt_id))
        await conn.commit()
    return {"success": True, "problems": problems}

@router.post("/sql/run")
async def sql_run(request: Request, body: dict = Body(...)):
    sql_query = (body.get("query") or "").strip()
    attempt_id = body.get("attemptId")
    if not sql_query:
        return {"success": False, "error": "Empty query"}
    if not sql_query.upper().startswith("SELECT"):
        return {"success": False, "error": "Only SELECT queries are allowed in this test environment."}
    allowed: list[str] = []
    sandbox_names: dict[str, str] = {}
    if attempt_id:
        await _load_attempt_for_actor(request, int(attempt_id))
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT test_id FROM skill_test_attempts WHERE id=%s", (attempt_id,))
                row = await cur.fetchone()
                if row:
                    sandbox_names = _sandbox_names(row["test_id"])
                    allowed = list(sandbox_names.values())
    if not allowed:
        return {"success": False, "error": "Could not determine test context. Please refresh."}
    normalized_query = _rewrite_sql_to_sandbox(sql_query, sandbox_names)
    referenced = [m.group(1).lower() for m in re.finditer(r"(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)", normalized_query, re.IGNORECASE)]
    bad = [t for t in referenced if t not in allowed]
    if bad:
        return {"success": False, "error": f"Access denied. Allowed: {', '.join(allowed)}. Blocked: {', '.join(bad)}"}
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(normalized_query)
                rows = await cur.fetchall()
        columns = list(rows[0].keys()) if rows else []
        return {"success": True, "columns": columns, "rows": rows[:100], "message": "Query returned 0 rows" if not rows else None}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/sql/evaluate")
async def sql_evaluate_ep(request: Request, body: dict = Body(...)):
    attempt_id = body.get("attemptId")
    problem_id = body.get("problemId")
    sql_query = (body.get("query") or "").strip()
    if not attempt_id or not problem_id:
        raise HTTPException(400, "attemptId and problemId are required")
    await _load_attempt_for_actor(request, int(attempt_id))
    if not sql_query:
        raise HTTPException(400, "Query is required")
    if not sql_query.upper().startswith("SELECT"):
        return {"success": True, "passed": False, "feedback": "Only SELECT queries are allowed."}
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM skill_test_attempts WHERE id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    problems = _safe_json(attempt.get("sql_problems")) or []
    problem = next((p for p in problems if str(p.get("id")) == str(problem_id)), None)
    if not problem:
        raise HTTPException(404, "Problem not found")
    test_id = attempt.get("test_id")
    visible_problem = _normalize_sql_problem(problem, _sandbox_names(test_id)) if test_id else problem
    evaluation = await evaluate_sql_query(visible_problem, sql_query)
    passed = evaluation.get("passed", False)
    feedback = evaluation.get("feedback", "âœ… Correct!" if passed else "âŒ Incorrect query.")
    subs = _safe_json(attempt.get("sql_submissions")) or {}
    subs[str(problem_id)] = {"query": sql_query, "submitted_at": datetime.now(timezone.utc).isoformat(), "passed": passed}
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE skill_test_attempts SET sql_submissions=%s WHERE id=%s", (_json_str(subs), attempt_id))
        await conn.commit()
    return {"success": True, "passed": passed, "feedback": feedback}

@router.post("/sql/finish/{attempt_id}")
async def sql_finish(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.sql_passing_score,t.title as test_title,t.skills as test_skills FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    subs = _safe_json(attempt.get("sql_submissions")) or {}
    problems = _safe_json(attempt.get("sql_problems")) or []
    num = len(problems)
    submitted = len(subs)
    score = (submitted / num * 100) if num else 0
    passed = score >= (attempt.get("sql_passing_score") or 60)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if not passed:
                report = None
                try:
                    skills = _safe_json(attempt.get("test_skills")) or []
                    mcq_s = _calc_mcq_stats(attempt)
                    cod_s = _calc_coding_stats(attempt)
                    report = await generate_final_report(attempt.get("test_title","Skill Test"), skills, mcq_s, cod_s, {"score": score, "solved": submitted, "total": num, "passed": False, "problemDetails": [{"title": p.get("title",""), "solved": bool(subs.get(str(p.get("id"))))} for p in problems]}, {"avgScore": 0, "answered": 0, "total": 0, "passed": False, "highlights": []}, attempt.get("mcq_violations") or 0)
                except Exception:
                    report = {"overall_rating": "Needs Improvement", "summary": f"SQL {round(score)}% ({submitted}/{num} solved)."}
                await cur.execute("UPDATE skill_test_attempts SET sql_score=%s,sql_status='failed',current_stage='sql',overall_status='failed',report=%s WHERE id=%s", (score, _json_str(report), attempt_id))
            else:
                await cur.execute("UPDATE skill_test_attempts SET sql_score=%s,sql_status='completed',current_stage='interview' WHERE id=%s", (score, attempt_id))
        await conn.commit()
    return {"success": True, "score": score, "passed": passed, "solved": submitted, "total": num, "nextStage": "interview" if passed else None}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  STAGE 4: AI INTERVIEW
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/interview/start/{attempt_id}")
async def interview_start(attempt_id: int, request: Request):
    await _load_attempt_for_actor(request, attempt_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.interview_count,t.interview_duration_minutes,t.interview_passing_score FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    skills = _safe_json(attempt.get("skills")) or []
    existing_qa = _safe_json(attempt.get("interview_qa")) or []
    total = attempt.get("interview_count") or 5
    if len(existing_qa) >= total:
        return {"finished": True, "qa": existing_qa, "total": total}
    question_data = await generate_interview_question(skills, existing_qa, len(existing_qa) + 1, total)
    return {"finished": False, "question": question_data, "current": len(existing_qa) + 1, "total": total, "previous_qa": existing_qa, "duration_minutes": attempt.get("interview_duration_minutes")}

@router.post("/interview/answer")
async def interview_answer(request: Request, body: dict = Body(...)):
    attempt_id = body.get("attemptId")
    answer = body.get("answer", "")
    question = body.get("question", "")
    key_points = body.get("key_points", [])
    if attempt_id:
        await _load_attempt_for_actor(request, int(attempt_id))
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.skills,t.interview_count,t.interview_passing_score,t.title,t.skills as test_skills FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            attempt = await cur.fetchone()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    evaluation = await evaluate_interview_answer(question, answer, key_points)
    qa_list = _safe_json(attempt.get("interview_qa")) or []
    qa_list.append({"question": question, "answer": answer, "evaluation": evaluation, "score": evaluation.get("score", 5)})
    total = attempt.get("interview_count") or 5
    is_last = len(qa_list) >= total
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if is_last:
                avg_score = sum(q.get("score", 0) for q in qa_list) / len(qa_list) if qa_list else 0
                passed = avg_score >= (attempt.get("interview_passing_score") or 5)
                if passed:
                    report = None
                    try:
                        skills = _safe_json(attempt.get("test_skills")) or []
                        mcq_s = _calc_mcq_stats(attempt)
                        cod_s = _calc_coding_stats(attempt)
                        sql_s = _calc_sql_stats(attempt)
                        highlights = [{"question": q["question"], "score": q.get("score",0), "feedback": q.get("evaluation",{}).get("feedback","")} for q in qa_list]
                        report = await generate_final_report(attempt.get("title","Skill Test"), skills, mcq_s, cod_s, sql_s, {"avgScore": avg_score, "answered": len(qa_list), "total": total, "passed": True, "highlights": highlights}, attempt.get("mcq_violations") or 0)
                    except Exception:
                        report = {"overall_rating": "Good", "summary": "Assessment completed successfully."}
                    await cur.execute("UPDATE skill_test_attempts SET interview_qa=%s,interview_score=%s,interview_status='completed',current_stage='completed',overall_status='completed',report=%s WHERE id=%s", (_json_str(qa_list), avg_score, _json_str(report), attempt_id))
                else:
                    report = None
                    try:
                        skills = _safe_json(attempt.get("test_skills")) or []
                        mcq_s = _calc_mcq_stats(attempt)
                        cod_s = _calc_coding_stats(attempt)
                        sql_s = _calc_sql_stats(attempt)
                        highlights = [{"question": q["question"], "score": q.get("score",0), "feedback": q.get("evaluation",{}).get("feedback","")} for q in qa_list]
                        report = await generate_final_report(attempt.get("title","Skill Test"), skills, mcq_s, cod_s, sql_s, {"avgScore": avg_score, "answered": len(qa_list), "total": total, "passed": False, "highlights": highlights}, attempt.get("mcq_violations") or 0)
                    except Exception:
                        report = {"overall_rating": "Needs Improvement", "summary": f"Interview avg {round(avg_score,1)}/10, below passing."}
                    await cur.execute("UPDATE skill_test_attempts SET interview_qa=%s,interview_score=%s,interview_status='failed',current_stage='interview',overall_status='failed',report=%s WHERE id=%s", (_json_str(qa_list), avg_score, _json_str(report), attempt_id))
            else:
                await cur.execute("UPDATE skill_test_attempts SET interview_qa=%s WHERE id=%s", (_json_str(qa_list), attempt_id))
        await conn.commit()
    if is_last:
        avg_score_val = sum(q.get("score", 0) for q in qa_list) / len(qa_list) if qa_list else 0
        return {"success": True, "evaluation": evaluation, "finished": True, "avgScore": avg_score_val, "passed": avg_score_val >= (attempt.get("interview_passing_score") or 5)}
    skills = _safe_json(attempt.get("skills")) or []
    next_q = await generate_interview_question(skills, qa_list, len(qa_list) + 1, total)
    return {"success": True, "evaluation": evaluation, "finished": False, "nextQuestion": next_q, "current": len(qa_list) + 1, "total": total}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  PROCTORING
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

# â”€â”€ Agent analysis trigger (per attempt, in-memory) â”€â”€
_skill_agent_counter: dict[str, int] = {}
_SKILL_AGENT_COUNTER_MAX = 1000  # Prevent unbounded growth
_SKILL_AGENT_INTERVAL = 5


async def _maybe_trigger_skill_agent(attempt_id: str, severity: str, user_id: str = ""):
    """Fire-and-forget agent analysis on skill test proctoring events."""
    try:
        from services.proctor_agent import agent_analyze_session, save_analysis
        excluded_event_types: list[str] = ["window_blur"]
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT t.proctoring_config
                    FROM skill_test_attempts a
                    JOIN skill_tests t ON t.id = a.test_id
                    WHERE a.id = %s
                    LIMIT 1
                    """,
                    (attempt_id,),
                )
                row = await cur.fetchone()
                if row:
                    excluded_event_types = _normalize_excluded_violation_types(row.get("proctoring_config"))
        result = await agent_analyze_session(
            str(attempt_id),
            "skill",
            user_id=user_id,
            excluded_event_types=excluded_event_types,
        )
        if result.get("fraud_score", 0) > 0:
            await save_analysis({**result, "source": "skill"})
            if result.get("fraud_score", 0) >= 35:
                try:
                    from main import sio
                    await sio.emit("agent_alert", {
                        "type": "agent_analysis",
                        "session_id": str(attempt_id),
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
                        "session_id": str(attempt_id),
                        "reason": "Proctoring Intelligence Agent detected critical integrity violations.",
                        "fraud_score": result["fraud_score"],
                        "risk_level": result.get("risk_level"),
                        "key_findings": result.get("ai_analysis", {}).get("key_findings", []),
                    }
                    await sio.emit("agent_terminate", terminate_payload, room=f"session_{attempt_id}")
                    if user_id:
                        await sio.emit("agent_terminate", terminate_payload, room=f"student_{user_id}")
                    # Also notify admins about the termination
                    await sio.emit("agent_alert", {
                        "type": "auto_terminate",
                        "session_id": str(attempt_id),
                        "fraud_score": result["fraud_score"],
                        "risk_level": "terminate",
                        "recommended_action": "terminate",
                    }, room="admin_room")
                    print(f"[ProctorAgent] AUTO-TERMINATE sent for attempt {attempt_id} (score: {result['fraud_score']})")
                except Exception as e:
                    print(f"[ProctorAgent] terminate emit error: {e}")
    except Exception as e:
        print(f"[ProctorAgent] skill analysis error: {e}")


@router.post("/proctoring/log")
async def proctoring_log(request: Request, body: dict = Body(...)):
    await _require_skill_permission(request, ["coding.attempt", "coding.assign"])
    attempt_id = body.get("attemptId")
    event_type = body.get("eventType") or body.get("event_type", "unknown")
    severity = body.get("severity", "low")
    user_id = str(body.get("userId") or body.get("user_id", ""))
    # `test_stage` is NOT NULL in skill_proctoring_logs; default to "general"
    # if the frontend didn't send one (older clients).
    test_stage = (
        body.get("testStage")
        or body.get("test_stage")
        or body.get("stage")
        or "general"
    )
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO skill_proctoring_logs "
                "(attempt_id, test_stage, event_type, severity, details) "
                "VALUES (%s,%s,%s,%s,%s)",
                (
                    attempt_id,
                    test_stage,
                    event_type,
                    severity,
                    _json_str(body.get("details", {})),
                ),
            )
            if severity == "high":
                await cur.execute("UPDATE skill_test_attempts SET mcq_violations = COALESCE(mcq_violations,0)+1 WHERE id=%s", (attempt_id,))
        await conn.commit()

    await _insert_unified_proctor_event(
        user_id=user_id or "",
        attempt_id=str(attempt_id or ""),
        event_type=str(event_type or "unknown"),
        severity=str(severity or "low"),
        details=str(body.get("details", "")),
        test_stage=str(test_stage or "general"),
    )

    # â”€â”€ Trigger Proctor Intelligence Agent (background, non-blocking) â”€â”€
    aid = str(attempt_id) if attempt_id else ""
    if len(_skill_agent_counter) > _SKILL_AGENT_COUNTER_MAX:
        oldest = sorted(_skill_agent_counter, key=_skill_agent_counter.get)[:_SKILL_AGENT_COUNTER_MAX // 2]
        for k in oldest:
            _skill_agent_counter.pop(k, None)
    _skill_agent_counter[aid] = _skill_agent_counter.get(aid, 0) + 1
    if severity in ("high", "critical") or _skill_agent_counter[aid] % _SKILL_AGENT_INTERVAL == 0:
        task = asyncio.create_task(_maybe_trigger_skill_agent(attempt_id, severity, user_id))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)

    audit_logger.log_event(
        AuditEventType.TEST_PROCTORING_LOG,
        user_id=user_id or None,
        ip_address=_client_ip(request),
        resource_id=str(attempt_id),
        resource_type="skill_test_attempt",
        action=f"Skill proctoring event: {event_type}",
        details={"severity": severity, "test_stage": test_stage},
    )
    return {"success": True}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  REPORTS & STUDENT SUBMISSIONS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.get("/report/{attempt_id}")
async def get_report(attempt_id: int, request: Request):
    actor = await _require_actor(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.title as test_title,t.skills as test_skills FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.id=%s", (attempt_id,))
            a = await cur.fetchone()
    if not a:
        raise HTTPException(404, "Attempt not found")
    can_assign = await _has_any_permission(actor, ["coding.assign"])
    can_attempt = await _has_any_permission(actor, ["coding.attempt"])
    if not (can_assign or (can_attempt and actor == (a.get("student_id") or ""))):
        raise HTTPException(403, "Permission denied")
    return {"attempt": {**a, "test_skills": _safe_json(a.get("test_skills")), "report": _safe_json(a.get("report")), "mcq_questions": _safe_json(a.get("mcq_questions")), "mcq_answers": _safe_json(a.get("mcq_answers")), "coding_problems": _safe_json(a.get("coding_problems")), "coding_submissions": _safe_json(a.get("coding_submissions")), "sql_problems": _safe_json(a.get("sql_problems")), "sql_submissions": _safe_json(a.get("sql_submissions")), "interview_qa": _safe_json(a.get("interview_qa"))}}

@router.get("/student/submissions")
async def student_submissions(request: Request, studentId: str = Query(...)):
    actor = await _require_actor(request)
    can_assign = await _has_any_permission(actor, ["coding.assign"])
    can_attempt = await _has_any_permission(actor, ["coding.attempt"])
    if not (can_assign or (can_attempt and actor == studentId)):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.title as test_title FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id WHERE a.student_id=%s ORDER BY a.started_at DESC", (studentId,))
            rows = await cur.fetchall()
    return [dict(r, report=_safe_json(r.get("report"))) for r in rows]

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  TERMINATE ATTEMPT (auto-terminate from proctoring violations)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/attempt/{attempt_id}/terminate")
async def terminate_attempt(attempt_id: int, request: Request, body: dict = Body(...)):
    actor = await _require_actor(request)
    if not await _has_any_permission(actor, ["coding.assign", "coding.attempt"]):
        raise HTTPException(403, "Permission denied")
    reason = body.get("reason", "Terminated due to proctoring violations")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT id, overall_status FROM skill_test_attempts WHERE id=%s", (attempt_id,))
            attempt = await cur.fetchone()
            if not attempt:
                raise HTTPException(404, "Attempt not found")
            if attempt["overall_status"] in ("completed", "failed"):
                return {"success": True, "message": "Attempt already finalized"}
            await cur.execute(
                "UPDATE skill_test_attempts SET overall_status='failed', report=%s WHERE id=%s",
                (_json_str({"terminated": True, "reason": reason, "terminated_at": datetime.now(timezone.utc).isoformat()}), attempt_id)
            )
        await conn.commit()
    return {"success": True, "message": "Attempt terminated"}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ADMIN: SUBMISSIONS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.get("/admin/all-submissions")
async def admin_all_submissions(request: Request):
    await _require_skill_permission(request, ["coding.assign", "coding.evaluate"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT a.*,t.title as test_title FROM skill_test_attempts a JOIN skill_tests t ON a.test_id=t.id ORDER BY a.started_at DESC")
            rows = await cur.fetchall()
    return [dict(r, report=_safe_json(r.get("report"))) for r in rows]

@router.delete("/admin/reset-all-submissions")
async def admin_reset_all(request: Request):
    await _require_skill_permission(request, ["coding.assign"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM skill_proctoring_logs")
            await cur.execute("DELETE FROM skill_test_attempts")
        await conn.commit()
    return {"success": True, "message": "All submissions and proctoring logs deleted"}

@router.delete("/admin/submission/{attempt_id}")
async def admin_delete_submission(attempt_id: int, request: Request):
    await _require_skill_permission(request, ["coding.assign"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM skill_proctoring_logs WHERE attempt_id=%s", (attempt_id,))
            await cur.execute("DELETE FROM skill_test_attempts WHERE id=%s", (attempt_id,))
        await conn.commit()
    return {"success": True}
async def _has_any_permission(user_id: str, permissions: list[str]) -> bool:
    return await _auth_has_any_permission(user_id, permissions)
