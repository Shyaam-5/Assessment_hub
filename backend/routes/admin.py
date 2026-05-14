"""Admin routes – user management CRUD (mirrors the legacy server.js endpoints)."""

import uuid
import asyncio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from database import get_pool
from routes.auth import _hash_password
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType
from services.otp_delivery import send_notification_email

router = APIRouter(prefix="/api/admin", tags=["admin"])
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


# ─── Models ─────────────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    name: str
    email: str
    password: str
    role: str
    mentorId: Optional[str] = None
    batch: Optional[str] = None
    phone: Optional[str] = None


class UpdateUserBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    mentorId: Optional[str] = None
    batch: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None


class ResetPasswordBody(BaseModel):
    newPassword: str


class StatusBody(BaseModel):
    status: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _clean(row: dict) -> dict:
    u = dict(row)
    u.pop("password", None)
    alloc = u.pop("allocated_students", None)
    u["mentorId"] = u.pop("mentor_id", None)
    u["createdAt"] = str(u.pop("created_at", ""))
    u["allocatedStudents"] = [s for s in alloc.split(",") if s] if alloc else []
    mc = u.pop("must_change_password", None)
    if mc is None:
        u["mustChangePassword"] = False
    else:
        u["mustChangePassword"] = bool(int(mc)) if str(mc).isdigit() else bool(mc)
    return u


# ─── GET /api/admin/users ─────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    request: Request,
    role: Optional[str] = None,
    status: Optional[str] = None,
    batch: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
):
    page = max(1, page)
    limit = min(100, max(1, limit))
    offset = (page - 1) * limit

    base = (
        "FROM users u "
        "LEFT JOIN mentor_student_allocations msa ON u.id = msa.mentor_id "
        "WHERE 1=1"
    )
    conditions: list[str] = []
    params: list = []
    count_conditions: list[str] = []
    count_params: list = []

    if role:
        conditions.append("u.role = %s")
        params.append(role)
        count_conditions.append("role = %s")
        count_params.append(role)
    if status:
        conditions.append("u.status = %s")
        params.append(status)
        count_conditions.append("status = %s")
        count_params.append(status)
    if batch:
        conditions.append("u.batch = %s")
        params.append(batch)
        count_conditions.append("batch = %s")
        count_params.append(batch)
    if search:
        s = f"%{search}%"
        conditions.append("(u.name LIKE %s OR u.email LIKE %s OR u.id LIKE %s)")
        params.extend([s, s, s])
        count_conditions.append("(name LIKE %s OR email LIKE %s OR id LIKE %s)")
        count_params.extend([s, s, s])

    where_clause = (" AND " + " AND ".join(conditions)) if conditions else ""
    count_where = (" AND " + " AND ".join(count_conditions)) if count_conditions else ""

    count_sql = f"SELECT COUNT(*) AS total FROM users WHERE 1=1{count_where}"
    data_sql = (
        f"SELECT u.*, GROUP_CONCAT(msa.student_id) AS allocated_students "
        f"{base}{where_clause} "
        f"GROUP BY u.id ORDER BY u.created_at DESC LIMIT %s OFFSET %s"
    )

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(count_sql, count_params)
            total = (await cur.fetchone())["total"]

            await cur.execute(data_sql, params + [limit, offset])
            rows = await cur.fetchall()

    users = [_clean(r) for r in rows]
    pages = (total + limit - 1) // limit
    audit_logger.log_data_access(
        user_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        resource_type="users",
        query_params={"role": role, "status": status, "batch": batch, "search": search, "page": page, "limit": limit},
        record_count=len(users),
    )
    return {"data": users, "pagination": {"page": page, "limit": limit, "total": total, "pages": pages}}


# ─── POST /api/admin/users ────────────────────────────────────────────────

@router.post("/users")
async def create_user(body: CreateUserBody, request: Request):
    if not body.name or not body.email or not body.password or not body.role:
        raise HTTPException(status_code=400, detail="name, email, password, and role are required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Check duplicate email
            await cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
            if await cur.fetchone():
                raise HTTPException(status_code=409, detail="Email already exists")

            # Generate unique ID using UUID suffix (avoids race conditions)
            short_uid = uuid.uuid4().hex[:8]
            user_id = f"{body.role}-{short_uid}"

            hashed_pw = _hash_password(body.password)
            await cur.execute(
                "INSERT INTO users (id, name, email, password, role, mentor_id, batch, phone, status, must_change_password, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', 1, NOW())",
                (user_id, body.name, body.email, hashed_pw, body.role,
                 body.mentorId or None, body.batch or None, body.phone or None),
            )

            if body.role == "student" and body.mentorId:
                await cur.execute(
                    "INSERT IGNORE INTO mentor_student_allocations (mentor_id, student_id) VALUES (%s, %s)",
                    (body.mentorId, user_id),
                )
        await conn.commit()

    audit_logger.log_admin_action(
        admin_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        event_type=AuditEventType.ADMIN_USER_CREATED,
        resource_id=user_id,
        resource_type="user",
        changes={"role": body.role, "mentorId": body.mentorId, "batch": body.batch},
    )
    try:
        await asyncio.to_thread(
            send_notification_email,
            body.email,
            "Your Account Has Been Created",
            (
                f"Hello {body.name},\n\n"
                "Your account has been created.\n"
                f"Login Email: {body.email}\n"
                f"Temporary Password: {body.password}\n\n"
                "Please login and change your password.\n"
            ),
        )
    except Exception:
        pass
    return {"success": True, "user": {"id": user_id, "name": body.name, "email": body.email,
                                       "role": body.role, "mentorId": body.mentorId,
                                       "batch": body.batch, "phone": body.phone, "status": "active",
                                       "mustChangePassword": True}}


# ─── PUT /api/admin/users/:id ─────────────────────────────────────────────

@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserBody, request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            existing = await cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")

            updates, params = [], []
            if body.name is not None:     updates.append("name = %s");      params.append(body.name)
            if body.email is not None:    updates.append("email = %s");     params.append(body.email)
            if body.role is not None:     updates.append("role = %s");      params.append(body.role)
            if body.mentorId is not None: updates.append("mentor_id = %s"); params.append(body.mentorId or None)
            if body.batch is not None:    updates.append("batch = %s");     params.append(body.batch or None)
            if body.phone is not None:    updates.append("phone = %s");     params.append(body.phone or None)
            if body.status is not None:   updates.append("status = %s");    params.append(body.status)

            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")

            params.append(user_id)
            await cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", params)

            # Keep allocations in sync when mentor changes for a student
            if body.mentorId is not None and existing.get("role") == "student":
                await cur.execute(
                    "DELETE FROM mentor_student_allocations WHERE student_id = %s", (user_id,)
                )
                if body.mentorId:
                    await cur.execute(
                        "INSERT IGNORE INTO mentor_student_allocations (mentor_id, student_id) VALUES (%s, %s)",
                        (body.mentorId, user_id),
                    )

            await cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            updated = await cur.fetchone()
        await conn.commit()

    audit_logger.log_admin_action(
        admin_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        event_type=AuditEventType.ADMIN_USER_MODIFIED,
        resource_id=user_id,
        resource_type="user",
        changes=body.model_dump(exclude_none=True),
    )
    return {"success": True, "user": _clean(updated)}


# ─── DELETE /api/admin/users/:id ─────────────────────────────────────────

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            existing = await cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")

            await cur.execute(
                "DELETE FROM mentor_student_allocations WHERE mentor_id = %s OR student_id = %s",
                (user_id, user_id),
            )
            await cur.execute(
                "DELETE FROM direct_messages WHERE sender_id = %s OR receiver_id = %s",
                (user_id, user_id),
            )
            await cur.execute(
                "DELETE FROM code_feedback WHERE mentor_id = %s OR student_id = %s",
                (user_id, user_id),
            )
            if existing["role"] == "student":
                for tbl in ("submissions", "task_completions", "problem_completions",
                            "aptitude_submissions", "student_completed_aptitude"):
                    await cur.execute(f"DELETE FROM {tbl} WHERE student_id = %s", (user_id,))

            await cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        await conn.commit()

    audit_logger.log_admin_action(
        admin_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        event_type=AuditEventType.ADMIN_USER_DELETED,
        resource_id=user_id,
        resource_type="user",
        changes={"role": existing.get("role")},
    )
    return {"success": True, "message": f"User {user_id} deleted"}


# ─── POST /api/admin/users/:id/reset-password ─────────────────────────────

@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPasswordBody, request: Request):
    if not body.newPassword:
        raise HTTPException(status_code=400, detail="newPassword is required")
    if len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    hashed_pw = _hash_password(body.newPassword)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
            await cur.execute(
                "UPDATE users SET password = %s, must_change_password = 0 WHERE id = %s",
                (hashed_pw, user_id),
            )
        await conn.commit()

    audit_logger.log_event(
        event_type=AuditEventType.AUTH_PASSWORD_RESET,
        user_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        resource_id=user_id,
        resource_type="user",
        action="Admin reset user password",
    )
    return {"success": True, "message": "Password reset successfully"}


# ─── PATCH /api/admin/users/:id/status ───────────────────────────────────

@router.patch("/users/{user_id}/status")
async def toggle_status(user_id: str, body: StatusBody, request: Request):
    if body.status not in ("active", "inactive", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("UPDATE users SET status = %s WHERE id = %s", (body.status, user_id))
        await conn.commit()

    audit_logger.log_admin_action(
        admin_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        event_type=AuditEventType.ADMIN_USER_MODIFIED,
        resource_id=user_id,
        resource_type="user",
        changes={"status": body.status},
    )
    return {"success": True, "message": f"User status changed to {body.status}"}


# ─── GET /api/admin/batches ───────────────────────────────────────────────

@router.get("/batches")
async def get_batches(request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                'SELECT DISTINCT batch FROM users WHERE batch IS NOT NULL AND batch != "" ORDER BY batch'
            )
            rows = await cur.fetchall()
    batches = [r["batch"] for r in rows]
    audit_logger.log_data_access(
        user_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        resource_type="batches",
        record_count=len(batches),
    )
    return batches
