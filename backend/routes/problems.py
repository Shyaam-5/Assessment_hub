"""Problem CRUD routes with proctoring settings."""

import asyncio
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from database import get_pool, get_primary_pool
from routes.auth import _has_any_permission, assert_assessment_limit_for_actor
from services.pagination import paginated_response
from services.otp_delivery import send_exam_allocated_email
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["problems"])
audit_logger = get_audit_logger()

DEFAULT_SQL_SCHEMA = (
    "CREATE TABLE employees (\n"
    "  id INT PRIMARY KEY,\n"
    "  name VARCHAR(100),\n"
    "  department VARCHAR(100),\n"
    "  salary DECIMAL(10,2),\n"
    "  hire_date DATE,\n"
    "  manager_id INT\n"
    ");\n"
    "INSERT INTO employees VALUES\n"
    "(1,'Alice Johnson','Engineering',95000,'2020-03-15',NULL),\n"
    "(2,'Bob Smith','Engineering',88000,'2021-07-01',1),\n"
    "(3,'Carol Williams','Marketing',72000,'2019-11-20',NULL),\n"
    "(4,'David Brown','Marketing',68000,'2022-01-10',3),\n"
    "(5,'Eve Davis','Sales',76000,'2020-06-25',NULL);\n\n"
    "CREATE TABLE departments (\n"
    "  id INT PRIMARY KEY,\n"
    "  name VARCHAR(100),\n"
    "  budget DECIMAL(12,2),\n"
    "  location VARCHAR(100)\n"
    ");\n"
    "INSERT INTO departments VALUES\n"
    "(1,'Engineering',500000,'New York'),\n"
    "(2,'Marketing',300000,'San Francisco'),\n"
    "(3,'Sales',350000,'Chicago');\n\n"
    "CREATE TABLE projects (\n"
    "  id INT PRIMARY KEY,\n"
    "  name VARCHAR(100),\n"
    "  department_id INT,\n"
    "  start_date DATE,\n"
    "  end_date DATE,\n"
    "  status VARCHAR(50)\n"
    ");\n"
    "INSERT INTO projects VALUES\n"
    "(1,'Website Redesign',1,'2024-01-15','2024-06-30','completed'),\n"
    "(2,'Mobile App',1,'2024-03-01','2024-12-31','in_progress'),\n"
    "(3,'Q1 Campaign',2,'2024-01-01','2024-03-31','completed');\n\n"
    "CREATE TABLE orders (\n"
    "  id INT PRIMARY KEY,\n"
    "  customer_name VARCHAR(100),\n"
    "  product VARCHAR(100),\n"
    "  quantity INT,\n"
    "  price DECIMAL(10,2),\n"
    "  order_date DATE\n"
    ");\n"
    "INSERT INTO orders VALUES\n"
    "(1,'John Doe','Laptop',2,1200,'2024-01-15'),\n"
    "(2,'Jane Smith','Keyboard',5,75,'2024-01-20'),\n"
    "(3,'Bob Johnson','Monitor',3,450,'2024-02-10');"
)


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


class ProblemCreate(BaseModel):
    mentorId: str
    title: str
    description: str
    sampleInput: str | None = None
    expectedOutput: str | None = None
    difficulty: str = "medium"
    type: str = "coding"
    language: str | None = "javascript"
    status: str = "live"
    deadline: str | None = None
    # SQL-specific
    sqlSchema: str | None = None
    expectedQueryResult: str | None = None
    # Proctoring
    enableProctoring: bool | None = False
    enableVideoAudio: bool | None = False
    enableMicrophone: bool | None = False
    disableCopyPaste: bool | None = False
    trackTabSwitches: bool | None = False
    maxTabSwitches: int | None = 3
    detectPhoneUsage: bool | None = False
    detectCameraBlocking: bool | None = False
    enforceFullscreen: bool | None = False
    enableFaceDetection: bool | None = False
    detectMultipleFaces: bool | None = False
    trackFaceLookaway: bool | None = False
    autoSubmitOnViolation: bool | None = False


def _enrich_problem(p: dict) -> dict:
    """Normalise column names and attach proctoring settings."""
    p["mentorId"] = p.pop("mentor_id", None)
    p["sampleInput"] = p.pop("sample_input", None)
    p["expectedOutput"] = p.pop("expected_output", None)
    p["sqlSchema"] = p.pop("sql_schema", None)
    p["expectedQueryResult"] = p.pop("expected_query_result", None)
    raw_test_cases = p.pop("test_cases", None)
    if isinstance(raw_test_cases, str):
        try:
            raw_test_cases = __import__("json").loads(raw_test_cases)
        except Exception:
            raw_test_cases = []
    p["testCases"] = raw_test_cases if isinstance(raw_test_cases, list) else []
    is_sql_problem = str(p.get("type") or "").upper() == "SQL" or str(p.get("language") or "").upper() == "SQL"
    if is_sql_problem and not p["sqlSchema"]:
        p["sqlSchema"] = DEFAULT_SQL_SCHEMA
    p["createdAt"] = str(p.pop("created_at", ""))

    # Proctoring settings mapped to what frontend expects for code editor
    enable_proc = p.pop("enable_proctoring", None) == "true"
    p["proctoring"] = {
        "enabled": enable_proc,
        "videoAudio": p.pop("enable_video_audio", None) == "true",
        "enableMicrophone": p.pop("enable_microphone", None) == "true",
        "disableCopyPaste": p.pop("disable_copy_paste", None) == "true",
        "trackTabSwitches": p.pop("track_tab_switches", None) == "true",
        "maxTabSwitches": int(p.pop("max_tab_switches", 3) or 3),
        "detectPhoneUsage": p.pop("detect_phone_usage", None) == "true",
        "detectCameraBlocking": p.pop("detect_camera_blocking", None) == "true",
        "enforceFullscreen": p.pop("enforce_fullscreen", None) == "true",
        "enableFaceDetection": p.pop("enable_face_detection", None) == "true",
        "detectMultipleFaces": p.pop("detect_multiple_faces", None) == "true",
        "trackFaceLookaway": p.pop("track_face_lookaway", None) == "true",
        "autoSubmitOnViolation": p.pop("auto_submit_on_violation", None) == "true",
    }
    return p


@router.get("/problems")
async def list_problems(
    request: Request,
    mentorId: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    pool = await get_pool()
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["tests.view"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    offset = (page - 1) * limit
    params: list = []
    where: list[str] = []

    if mentorId:
        where.append("p.mentor_id = %s")
        params.append(mentorId)
    if status:
        where.append("p.status = %s")
        params.append(status)

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(f"SELECT COUNT(*) AS total FROM problems p{where_sql}", params)
            total = (await cur.fetchone())["total"]

            await cur.execute(
                f"""
                SELECT p.*,
                       GROUP_CONCAT(DISTINCT pc.student_id) AS completed_by_students
                FROM problems p
                LEFT JOIN problem_completions pc ON p.id = pc.problem_id
                {where_sql}
                GROUP BY p.id
                ORDER BY p.created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = await cur.fetchall()

            problem_ids = [r["id"] for r in rows if r.get("id")]
            alloc_counts: dict[str, int] = {}
            if problem_ids:
                placeholders = ",".join(["%s"] * len(problem_ids))
                await cur.execute(
                    f"SELECT problem_id, COUNT(*) AS cnt FROM problem_student_allocations "
                    f"WHERE problem_id IN ({placeholders}) GROUP BY problem_id",
                    problem_ids,
                )
                for row in (await cur.fetchall()) or []:
                    alloc_counts[str(row["problem_id"])] = int(row["cnt"] or 0)

    problems = []
    for r in rows:
        cbs = r.pop("completed_by_students", None)
        p = _enrich_problem(r)
        p["completedBy"] = [s for s in cbs.split(",") if s] if cbs else []
        p["allocatedCount"] = alloc_counts.get(str(p["id"]), 0)
        problems.append(p)

    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="problems",
        query_params={"mentorId": mentorId, "status": status, "page": page, "limit": limit},
        record_count=len(problems),
    )
    return paginated_response(data=problems, total=total, page=page, limit=limit)


@router.get("/students/{student_id}/problems")
async def student_problems(student_id: str, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor_id:
        raise HTTPException(401, "Missing user context")

    pool = await get_pool()
    primary_pool = await get_primary_pool()

    if actor_id != student_id:
        async with primary_pool.acquire() as primary_conn:
            async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
                await primary_cur.execute("SELECT role FROM users WHERE id = %s", (actor_id,))
                actor = await primary_cur.fetchone()
                if not actor:
                    raise HTTPException(401, "Invalid user context")

                await primary_cur.execute("SELECT mentor_id FROM users WHERE id = %s", (student_id,))
                stu = await primary_cur.fetchone()
                if not stu:
                    raise HTTPException(404, "Student not found")

        actor_role = (actor.get("role") or "").lower()
        can_view = await _has_any_permission(actor_id, ["tests.view"])
        if can_view and actor_role in {"admin", "organization_admin"}:
            pass
        elif can_view and actor_role == "mentor":
            if stu.get("mentor_id") != actor_id:
                raise HTTPException(403, "Student is not allocated to this mentor")
        else:
            raise HTTPException(403, "Forbidden scope")

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT p.* FROM problems p
                JOIN problem_student_allocations psa ON psa.problem_id = p.id
                WHERE psa.student_id = %s AND p.status = 'live'
                ORDER BY p.created_at DESC
                """,
                (student_id,),
            )
            problems = await cur.fetchall()

            enriched = []
            for p in problems:
                await cur.execute(
                    "SELECT student_id FROM problem_completions WHERE problem_id = %s",
                    (p["id"],),
                )
                completions = await cur.fetchall()
                ep = _enrich_problem(p)
                ep["completedBy"] = [c["student_id"] for c in completions]
                enriched.append(ep)

    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="student_problems",
        query_params={"studentId": student_id},
        record_count=len(enriched),
    )
    return enriched


@router.post("/problems")
async def create_problem(body: ProblemCreate, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["coding.create"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    await assert_assessment_limit_for_actor(actor_id)
    sql_schema = body.sqlSchema
    if (body.type or "").upper() == "SQL" or (body.language or "").upper() == "SQL":
        sql_schema = sql_schema or DEFAULT_SQL_SCHEMA
    problem_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    normalized_deadline = body.deadline or None
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO problems (
                    id, mentor_id, title, description, sample_input, expected_output,
                    difficulty, type, language, status, deadline,
                    sql_schema, expected_query_result,
                    enable_proctoring, enable_video_audio, enable_microphone, disable_copy_paste,
                    track_tab_switches, max_tab_switches,
                    detect_phone_usage, detect_camera_blocking, enforce_fullscreen,
                    enable_face_detection, detect_multiple_faces, track_face_lookaway, auto_submit_on_violation,
                    created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    problem_id, body.mentorId, body.title, body.description,
                    body.sampleInput, body.expectedOutput,
                    body.difficulty, body.type, body.language, body.status, normalized_deadline,
                    sql_schema, body.expectedQueryResult,
                    str(body.enableProctoring).lower(),
                    str(body.enableVideoAudio).lower(),
                    str(body.enableMicrophone).lower(),
                    str(body.disableCopyPaste).lower(),
                    str(body.trackTabSwitches).lower(), body.maxTabSwitches,
                    str(body.detectPhoneUsage).lower(),
                    str(body.detectCameraBlocking).lower(),
                    str(body.enforceFullscreen).lower(),
                    str(body.enableFaceDetection).lower(),
                    str(body.detectMultipleFaces).lower(),
                    str(body.trackFaceLookaway).lower(),
                    str(body.autoSubmitOnViolation).lower(),
                    now,
                ),
            )
        await conn.commit()

    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_TEST_CREATED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=problem_id,
        resource_type="problem",
        action="Problem created",
        details={"title": body.title, "type": body.type, "difficulty": body.difficulty, "mentorId": body.mentorId},
    )
    payload = body.model_dump()
    payload["sqlSchema"] = sql_schema
    return {"id": problem_id, **payload, "completedBy": [], "createdAt": str(now)}


@router.delete("/problems/{problem_id}")
async def delete_problem(problem_id: str, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["coding.create", "coding.assign"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM problem_student_allocations WHERE problem_id = %s", (problem_id,))
            await cur.execute("DELETE FROM problem_completions WHERE problem_id = %s", (problem_id,))
            await cur.execute("DELETE FROM submissions WHERE problem_id = %s", (problem_id,))
            await cur.execute("DELETE FROM problems WHERE id = %s", (problem_id,))
    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_TEST_DELETED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=problem_id,
        resource_type="problem",
        action="Problem deleted",
    )
    return {"success": True}


# ─── Allocation endpoints ──────────────────────────────────────────────────

@router.get("/problems/{problem_id}/allocations")
async def get_problem_allocations(problem_id: str, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["coding.assign", "coding.create"]):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    primary_pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT a.student_id
                   FROM problem_student_allocations a
                   WHERE a.problem_id = %s""",
                (problem_id,),
            )
            rows = await cur.fetchall()
    student_ids = [str(r["student_id"]) for r in (rows or []) if r.get("student_id")]
    if not student_ids:
        return []

    async with primary_pool.acquire() as primary_conn:
        async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
            placeholders = ",".join(["%s"] * len(student_ids))
            await primary_cur.execute(
                f"""SELECT id, name, email
                    FROM users
                    WHERE id IN ({placeholders})
                    ORDER BY name""",
                student_ids,
            )
            user_rows = await primary_cur.fetchall()
    return [{"studentId": str(r["id"]), "name": r["name"], "email": r["email"]} for r in (user_rows or [])]


@router.post("/problems/{problem_id}/allocations")
async def set_problem_allocations(problem_id: str, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["tests.assign"]):
        raise HTTPException(403, "Permission denied")
    body = await request.json()
    student_ids: list = body.get("studentIds", [])
    if not isinstance(student_ids, list):
        raise HTTPException(400, "studentIds must be a list")
    student_ids = [str(sid or "").strip() for sid in student_ids if str(sid or "").strip()]

    pool = await get_pool()
    primary_pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT title FROM problems WHERE id = %s", (problem_id,))
            prob = await cur.fetchone()
            if not prob:
                raise HTTPException(404, "Problem not found")
            problem_title = prob.get("title") or "Coding Problem"

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

            await cur.execute(
                "DELETE FROM problem_student_allocations WHERE problem_id = %s", (problem_id,)
            )
            for sid in student_ids:
                await cur.execute(
                    "INSERT IGNORE INTO problem_student_allocations (id, problem_id, student_id) "
                    "VALUES (%s, %s, %s)",
                    (str(uuid.uuid4()), problem_id, sid),
                )

            emails: list[tuple[str, str]] = []
            if student_ids:
                placeholders = ",".join(["%s"] * len(student_ids))
                async with primary_pool.acquire() as primary_conn:
                    async with primary_conn.cursor(pymysql.cursors.DictCursor) as primary_cur:
                        await primary_cur.execute(
                            f"SELECT name, email FROM users WHERE id IN ({placeholders})",
                            tuple(student_ids),
                        )
                        emails = [
                            (r.get("name") or "User", r.get("email") or "")
                            for r in (await primary_cur.fetchall() or [])
                            if (r.get("email") or "").strip()
                        ]
        await conn.commit()

    for name, email in emails:
        try:
            await asyncio.to_thread(
                send_exam_allocated_email,
                email, name, problem_title, "Coding Problem",
            )
        except Exception:
            pass

    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_TEST_MODIFIED,
        user_id=actor_id,
        ip_address=_client_ip(request),
        resource_id=problem_id,
        resource_type="problem",
        action="Problem allocations updated",
        details={"studentCount": len(student_ids)},
    )
    return {"success": True, "allocatedCount": len(student_ids)}


@router.get("/problems/{problem_id}/allocated-students")
async def get_allocated_students(problem_id: str, request: Request):
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor_id, ["coding.assign", "coding.create"]):
        raise HTTPException(403, "Permission denied")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT student_id FROM problem_student_allocations WHERE problem_id = %s",
                (problem_id,),
            )
            rows = await cur.fetchall()
    return {"problemId": problem_id, "studentIds": [r["student_id"] for r in rows], "count": len(rows)}
