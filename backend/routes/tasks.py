"""Task CRUD routes."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from database import get_pool
from services.pagination import paginated_response
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["tasks"])
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


class TaskCreate(BaseModel):
    mentorId: str
    title: str
    description: str
    requirements: str | None = None
    difficulty: str | None = "medium"
    type: str | None = "general"


@router.get("/tasks")
async def list_tasks(
    request: Request,
    mentorId: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    pool = await get_pool()
    offset = (page - 1) * limit
    params: list = []

    where_clauses: list[str] = []
    if mentorId:
        where_clauses.append("t.mentor_id = %s")
        params.append(mentorId)
    if status:
        where_clauses.append("t.status = %s")
        params.append(status)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(f"SELECT COUNT(*) AS total FROM tasks t{where_sql}", params)
            total = (await cur.fetchone())["total"]

            await cur.execute(
                f"""
                SELECT t.*,
                       GROUP_CONCAT(DISTINCT tc.student_id) AS completed_by_students
                FROM tasks t
                LEFT JOIN task_completions tc ON t.id = tc.task_id
                {where_sql}
                GROUP BY t.id
                ORDER BY t.created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = await cur.fetchall()

    tasks = []
    for t in rows:
        t["mentorId"] = t.pop("mentor_id", None)
        t["createdAt"] = str(t.pop("created_at", ""))
        cbs = t.pop("completed_by_students", None)
        t["completedBy"] = [s for s in cbs.split(",") if s] if cbs else []
        tasks.append(t)

    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="tasks",
        query_params={"mentorId": mentorId, "status": status, "page": page, "limit": limit},
        record_count=len(tasks),
    )
    return paginated_response(data=tasks, total=total, page=page, limit=limit)


@router.get("/students/{student_id}/tasks")
async def student_tasks(student_id: str, request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT mentor_id FROM users WHERE id = %s", (student_id,))
            stu = await cur.fetchone()
            if not stu:
                raise HTTPException(404, "Student not found")

            mentor_id = stu["mentor_id"]
            await cur.execute(
                "SELECT * FROM tasks WHERE mentor_id = %s ORDER BY created_at DESC",
                (mentor_id,),
            )
            tasks = await cur.fetchall()

            enriched = []
            for t in tasks:
                await cur.execute(
                    "SELECT student_id FROM task_completions WHERE task_id = %s",
                    (t["id"],),
                )
                completions = await cur.fetchall()
                t["mentorId"] = t.pop("mentor_id", None)
                t["createdAt"] = str(t.pop("created_at", ""))
                t["completedBy"] = [c["student_id"] for c in completions]
                enriched.append(t)

    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="student_tasks",
        query_params={"studentId": student_id},
        record_count=len(enriched),
    )
    return enriched


@router.post("/tasks")
async def create_task(body: TaskCreate, request: Request):
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO tasks (id, mentor_id, title, description, requirements,
                   difficulty, type, status, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s)""",
                (
                    task_id,
                    body.mentorId,
                    body.title,
                    body.description,
                    body.requirements,
                    body.difficulty,
                    body.type,
                    now,
                ),
            )

    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_TEST_CREATED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=task_id,
        resource_type="task",
        action="Task created",
        details=body.model_dump(),
    )
    return {
        "id": task_id,
        "mentorId": body.mentorId,
        "title": body.title,
        "description": body.description,
        "requirements": body.requirements,
        "difficulty": body.difficulty,
        "type": body.type,
        "completedBy": [],
        "createdAt": str(now),
    }


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM task_completions WHERE task_id = %s", (task_id,))
            await cur.execute("DELETE FROM submissions WHERE task_id = %s", (task_id,))
            await cur.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_TEST_DELETED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_id=task_id,
        resource_type="task",
        action="Task deleted",
    )
    return {"success": True}

