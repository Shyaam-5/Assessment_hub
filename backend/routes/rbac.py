"""Multi-tenant RBAC routes for organizations, roles, and user-role assignments."""

from __future__ import annotations

import re
import uuid
from typing import Any
from urllib.parse import urlparse
import ssl as _ssl
import asyncio

import pymysql.cursors
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from database import get_primary_pool
from routes.auth import _hash_password
from config import settings
from services.otp_delivery import send_notification_email

router = APIRouter(prefix="/api", tags=["rbac"])


PERMISSION_CATALOG: dict[str, list[str]] = {
    "user_mgmt": ["users.create", "users.view", "users.update", "users.delete"],
    "roles": ["roles.create", "roles.view", "roles.update", "roles.delete"],
    "tests": ["tests.create", "tests.view", "tests.update", "tests.delete", "tests.assign", "tests.view_allocated", "tests.attempt"],
    "coding": ["coding.create", "coding.assign", "coding.evaluate", "coding.attempt"],
    "communication": ["communication.create", "communication.assign", "communication.evaluate", "communication.attempt"],
    "aptitude": ["aptitude.create", "aptitude.assign", "aptitude.evaluate", "aptitude.attempt"],
    "analytics": ["analytics.view", "analytics.export"],
    "proctoring": ["proctoring.view", "proctoring.override"],
    "results": ["results.view_own"],
}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug[:120] or "role"


def _request_user_id(request: Request) -> str:
    return (request.headers.get("x-user-id") or "").strip()


def _connect_mysql_from_url(db_url: str):
    parsed = urlparse(db_url)
    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE
    return pymysql.connect(
        host=parsed.hostname,
        port=int(parsed.port or 3306),
        user=parsed.username or "root",
        password=parsed.password or "",
        database=(parsed.path or "/").lstrip("/"),
        ssl=ssl_ctx,
        charset="utf8mb4",
        connect_timeout=15,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _connect_primary_db():
    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE
    return pymysql.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        ssl=ssl_ctx,
        charset="utf8mb4",
        connect_timeout=15,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _bootstrap_tenant_schema_from_primary(tenant_db_url: str) -> dict[str, int]:
    """Clone current primary DB table schema into tenant DB (DDL only)."""
    primary_conn = _connect_primary_db()
    tenant_conn = _connect_mysql_from_url(tenant_db_url)
    created = 0
    existing = 0

    try:
        with primary_conn.cursor() as pcur, tenant_conn.cursor() as tcur:
            pcur.execute("SHOW TABLES")
            table_rows = pcur.fetchall() or []
            if not table_rows:
                return {"created": 0, "existing": 0}

            # Column name from SHOW TABLES depends on DB name; use first value in each row.
            table_names = [next(iter(r.values())) for r in table_rows]

            tcur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table_name in table_names:
                tcur.execute(
                    """
                    SELECT 1 FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
                    """,
                    (table_name,),
                )
                if tcur.fetchone():
                    existing += 1
                    continue

                pcur.execute(f"SHOW CREATE TABLE `{table_name}`")
                ddl_row = pcur.fetchone() or {}
                create_sql = ddl_row.get("Create Table")
                if not create_sql:
                    continue
                tcur.execute(create_sql)
                created += 1
            tcur.execute("SET FOREIGN_KEY_CHECKS = 1")
    finally:
        try:
            primary_conn.close()
        except Exception:
            pass
        try:
            tenant_conn.close()
        except Exception:
            pass

    return {"created": created, "existing": existing}


def _check_tenant_db_readiness(tenant_db_url: str) -> dict[str, Any]:
    """
    Validate tenant DB before organization provisioning.

    Checks:
    - URL format + non-system database
    - connectivity
    - CREATE TABLE privilege (best effort)
    - presence of `users` table after bootstrap (or beforehand)
    """
    parsed = urlparse(tenant_db_url)
    db_name = (parsed.path or "/").lstrip("/")
    if not parsed.scheme or not parsed.hostname or not db_name:
        return {"ok": False, "reason": "Invalid DB URL format"}
    if db_name.lower() in {"sys", "mysql", "information_schema", "performance_schema"}:
        return {"ok": False, "reason": f"Database '{db_name}' is a system schema; use a dedicated app database"}

    conn = None
    try:
        conn = _connect_mysql_from_url(tenant_db_url)
        with conn.cursor() as cur:
            # Best-effort DDL check.
            ddl_ok = True
            ddl_error = None
            probe_name = f"_tenant_probe_{uuid.uuid4().hex[:8]}"
            try:
                cur.execute(f"CREATE TABLE `{probe_name}` (id INT PRIMARY KEY)")
                cur.execute(f"DROP TABLE `{probe_name}`")
            except Exception as exc:
                ddl_ok = False
                ddl_error = str(exc)

            cur.execute(
                """
                SELECT 1
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                LIMIT 1
                """
            )
            has_users = bool(cur.fetchone())

        return {
            "ok": True,
            "database": db_name,
            "ddlOk": ddl_ok,
            "ddlError": ddl_error,
            "hasUsersTable": has_users,
        }
    except Exception as exc:
        return {"ok": False, "reason": f"Unable to connect: {exc}"}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def _provision_user_in_tenant_db(
    tenant_db_url: str,
    *,
    user_id: str,
    name: str,
    email: str,
    password_hash: str,
    role: str,
    organization_id: str,
    phone: str | None = None,
    batch: str | None = None,
    must_change_password: int = 1,
) -> None:
    conn = _connect_mysql_from_url(tenant_db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, name, email, password, role, organization_id, phone, batch, status, must_change_password, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, NOW())
                ON DUPLICATE KEY UPDATE
                    name=VALUES(name),
                    email=VALUES(email),
                    password=VALUES(password),
                    role=VALUES(role),
                    organization_id=VALUES(organization_id),
                    phone=VALUES(phone),
                    batch=VALUES(batch),
                    status='active',
                    must_change_password=VALUES(must_change_password)
                """,
                (user_id, name, email, password_hash, role, organization_id, phone, batch, must_change_password),
            )
    finally:
        try:
            conn.close()
        except Exception:
            pass


async def _is_platform_super_admin(user_id: str) -> bool:
    if not user_id:
        return False
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            row = await cur.fetchone()
    return bool(row and (row.get("role") == "admin"))


async def _has_org_permission(user_id: str, org_id: str, permission: str) -> bool:
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT 1
                FROM user_role_assignments ura
                JOIN role_permissions rp ON rp.role_id = ura.role_id
                WHERE ura.user_id = %s AND ura.organization_id = %s AND rp.permission_key = %s
                LIMIT 1
                """,
                (user_id, org_id, permission),
            )
            return bool(await cur.fetchone())


class CreateOrganizationBody(BaseModel):
    name: str
    code: str
    type: str = Field(default="institutional")
    dbUrl: str
    adminName: str
    adminEmail: str
    adminPassword: str


class CreateRoleBody(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)


class CreateOrgUserBody(BaseModel):
    name: str
    email: str
    password: str
    roleId: str
    phone: str | None = None
    batch: str | None = None


class OrganizationStatusBody(BaseModel):
    isActive: bool


@router.get("/rbac/permissions")
async def list_permissions():
    return PERMISSION_CATALOG


@router.get("/platform/organizations")
async def list_organizations(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can list organizations")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, type, is_active, created_by, created_at FROM organizations ORDER BY created_at DESC"
            )
            rows = await cur.fetchall()
    return rows


@router.post("/platform/organizations")
async def create_organization(body: CreateOrganizationBody, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can create organizations")

    db_url = (body.dbUrl or "").strip()
    if not db_url:
        raise HTTPException(status_code=400, detail="DB URL is required for each organization")

    readiness = _check_tenant_db_readiness(db_url)
    if not readiness.get("ok"):
        raise HTTPException(status_code=400, detail=readiness.get("reason") or "Tenant DB is not ready")
    if not readiness.get("ddlOk", False):
        raise HTTPException(
            status_code=400,
            detail=(
                "Tenant DB user does not have CREATE/DROP privilege required for bootstrap. "
                f"Details: {readiness.get('ddlError')}"
            ),
        )

    # Bootstrap all current table structures into tenant DB before registering org.
    try:
        bootstrap_stats = _bootstrap_tenant_schema_from_primary(db_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Tenant DB bootstrap failed: {exc}")

    post_bootstrap = _check_tenant_db_readiness(db_url)
    if not post_bootstrap.get("ok"):
        raise HTTPException(status_code=400, detail=post_bootstrap.get("reason") or "Tenant DB post-check failed")
    if not post_bootstrap.get("hasUsersTable", False):
        raise HTTPException(
            status_code=400,
            detail="Tenant DB bootstrap incomplete: missing required 'users' table",
        )

    org_id = str(uuid.uuid4())
    org_admin_id = f"orgadmin-{uuid.uuid4().hex[:8]}"
    org_admin_password_hash = _hash_password(body.adminPassword)

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM organizations WHERE code = %s", (body.code,))
            if await cur.fetchone():
                raise HTTPException(status_code=409, detail="Organization code already exists")

            await cur.execute("SELECT id FROM users WHERE email = %s", (body.adminEmail,))
            if await cur.fetchone():
                raise HTTPException(status_code=409, detail="Organization admin email already exists")

            await cur.execute(
                """
                INSERT INTO organizations (id, name, code, type, db_url, is_active, created_by)
                VALUES (%s, %s, %s, %s, %s, 1, %s)
                """,
                (org_id, body.name, body.code, body.type, db_url, actor or None),
            )

            # Seed default organization admin role with broad permissions.
            role_id = str(uuid.uuid4())
            await cur.execute(
                """
                INSERT INTO roles (id, organization_id, name, slug, description, is_system)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (role_id, org_id, "Organization Admin", "organization-admin", "Default organization super role", 1),
            )
            role_perms = [p for module in PERMISSION_CATALOG.values() for p in module]
            for perm in role_perms:
                await cur.execute(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                    (role_id, perm),
                )

            # Seed default learner template role: exam_taker (minimal permissions).
            exam_taker_role_id = str(uuid.uuid4())
            await cur.execute(
                """
                INSERT INTO roles (id, organization_id, name, slug, description, is_system)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (
                    exam_taker_role_id,
                    org_id,
                    "Exam Taker",
                    "exam-taker",
                    "Minimal learner role for assigned exams only",
                ),
            )
            exam_taker_perms = [
                "tests.view_allocated",
                "tests.attempt",
                "aptitude.attempt",
                "coding.attempt",
                "communication.attempt",
                "results.view_own",
            ]
            for perm in exam_taker_perms:
                await cur.execute(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                    (exam_taker_role_id, perm),
                )

            await cur.execute(
                """
                INSERT INTO users (id, name, email, password, role, organization_id, status, must_change_password, created_at)
                VALUES (%s, %s, %s, %s, 'organization_admin', %s, 'active', 1, NOW())
                """,
                (org_admin_id, body.adminName, body.adminEmail, org_admin_password_hash, org_id),
            )

            await cur.execute(
                """
                INSERT INTO user_role_assignments (user_id, organization_id, role_id, is_primary)
                VALUES (%s, %s, %s, 1)
                """,
                (org_admin_id, org_id, role_id),
            )
        await conn.commit()

    # Keep tenant DB's users table in sync for runtime joins on tenant-scoped modules.
    _provision_user_in_tenant_db(
        db_url,
        user_id=org_admin_id,
        name=body.adminName,
        email=body.adminEmail,
        password_hash=org_admin_password_hash,
        role="organization_admin",
        organization_id=org_id,
        must_change_password=1,
    )
    try:
        await asyncio.to_thread(
            send_notification_email,
            body.adminEmail,
            f"Organization Admin Access - {body.name}",
            (
                f"Hello {body.adminName},\n\n"
                f"You have been registered as Organization Admin for '{body.name}'.\n"
                f"Login Email: {body.adminEmail}\n"
                f"Temporary Password: {body.adminPassword}\n\n"
                "Please login and change your password immediately.\n"
            ),
        )
    except Exception:
        pass

    return {
        "success": True,
        "organizationId": org_id,
        "organizationAdminId": org_admin_id,
        "tenantSchema": bootstrap_stats,
    }


@router.patch("/platform/organizations/{org_id}/status")
async def update_organization_status(org_id: str, body: OrganizationStatusBody, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can change organization status")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("UPDATE organizations SET is_active = %s WHERE id = %s", (1 if body.isActive else 0, org_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Organization not found")
        await conn.commit()
    return {"success": True, "organizationId": org_id, "isActive": body.isActive}


@router.get("/platform/organizations/analytics")
async def organization_analytics(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view organization analytics")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, type, is_active, created_at FROM organizations ORDER BY created_at DESC"
            )
            orgs = await cur.fetchall() or []

            await cur.execute(
                """
                SELECT organization_id, COUNT(*) AS user_count
                FROM users
                WHERE organization_id IS NOT NULL
                GROUP BY organization_id
                """
            )
            user_rows = await cur.fetchall() or []
            users_by_org = {r["organization_id"]: int(r.get("user_count") or 0) for r in user_rows}

            # API usage count per org from audit table via users table join.
            api_by_org: dict[str, int] = {}
            try:
                await cur.execute(
                    """
                    SELECT u.organization_id, COUNT(*) AS api_count
                    FROM api_request_audit a
                    JOIN users u ON u.id = a.user_id
                    WHERE u.organization_id IS NOT NULL
                    GROUP BY u.organization_id
                    """
                )
                api_rows = await cur.fetchall() or []
                api_by_org = {r["organization_id"]: int(r.get("api_count") or 0) for r in api_rows}
            except Exception:
                api_by_org = {}

            # Test conducted counts (best-effort, sum available submission/attempt tables).
            tests_by_org: dict[str, int] = {}
            test_sources = [
                ("global_test_submissions", "student_id"),
                ("aptitude_submissions", "student_id"),
                ("skill_test_attempts", "student_id"),
                ("comm_test_attempts", "student_id"),
            ]
            for table_name, user_col in test_sources:
                try:
                    await cur.execute(
                        f"""
                        SELECT u.organization_id, COUNT(*) AS cnt
                        FROM {table_name} t
                        JOIN users u ON u.id = t.{user_col}
                        WHERE u.organization_id IS NOT NULL
                        GROUP BY u.organization_id
                        """
                    )
                    rows = await cur.fetchall() or []
                    for row in rows:
                        org_id = row["organization_id"]
                        tests_by_org[org_id] = tests_by_org.get(org_id, 0) + int(row.get("cnt") or 0)
                except Exception:
                    continue

    result = []
    for org in orgs:
        oid = org["id"]
        result.append(
            {
                "id": oid,
                "name": org.get("name"),
                "code": org.get("code"),
                "type": org.get("type"),
                "is_active": org.get("is_active"),
                "created_at": org.get("created_at"),
                "total_users": users_by_org.get(oid, 0),
                "total_tests_conducted": tests_by_org.get(oid, 0),
                "total_api_requests_used": api_by_org.get(oid, 0),
            }
        )
    return result


@router.get("/orgs/{org_id}/analytics")
async def single_org_analytics(org_id: str, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "analytics.view")):
        raise HTTPException(status_code=403, detail="Permission denied")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, type, is_active, created_at FROM organizations WHERE id = %s",
                (org_id,),
            )
            org = await cur.fetchone()
            if not org:
                raise HTTPException(status_code=404, detail="Organization not found")

            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE organization_id = %s",
                (org_id,),
            )
            total_users = int((await cur.fetchone() or {}).get("cnt") or 0)

            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE organization_id = %s AND LOWER(COALESCE(status, 'active')) = 'active'",
                (org_id,),
            )
            active_users = int((await cur.fetchone() or {}).get("cnt") or 0)

            tests_count = 0
            for table_name, user_col in [
                ("global_test_submissions", "student_id"),
                ("aptitude_submissions", "student_id"),
                ("skill_test_attempts", "student_id"),
                ("comm_test_attempts", "student_id"),
            ]:
                try:
                    await cur.execute(
                        f"""
                        SELECT COUNT(*) AS cnt
                        FROM {table_name} t
                        JOIN users u ON u.id = t.{user_col}
                        WHERE u.organization_id = %s
                        """,
                        (org_id,),
                    )
                    tests_count += int((await cur.fetchone() or {}).get("cnt") or 0)
                except Exception:
                    continue

            api_count = 0
            try:
                await cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM api_request_audit a
                    JOIN users u ON u.id = a.user_id
                    WHERE u.organization_id = %s
                    """,
                    (org_id,),
                )
                api_count = int((await cur.fetchone() or {}).get("cnt") or 0)
            except Exception:
                api_count = 0

            await cur.execute(
                """
                SELECT id, name, role, status, created_at
                FROM users
                WHERE organization_id = %s
                ORDER BY created_at DESC
                LIMIT 10
                """,
                (org_id,),
            )
            recent_users = await cur.fetchall() or []

    return {
        "id": org.get("id"),
        "name": org.get("name"),
        "code": org.get("code"),
        "type": org.get("type"),
        "is_active": org.get("is_active"),
        "created_at": org.get("created_at"),
        "total_users": total_users,
        "total_active_users": active_users,
        "total_tests_conducted": tests_count,
        "total_api_requests_used": api_count,
        "recent_users": [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "role": r.get("role"),
                "status": r.get("status"),
                "created_at": r.get("created_at"),
            }
            for r in recent_users
        ],
    }


@router.get("/orgs/{org_id}/roles")
async def list_org_roles(org_id: str, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "roles.view")):
        raise HTTPException(status_code=403, detail="Permission denied")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT r.id, r.organization_id, r.name, r.slug, r.description, r.is_system, r.created_at,
                       GROUP_CONCAT(rp.permission_key ORDER BY rp.permission_key) AS permissions
                FROM roles r
                LEFT JOIN role_permissions rp ON rp.role_id = r.id
                WHERE r.organization_id = %s
                GROUP BY r.id
                ORDER BY r.created_at DESC
                """,
                (org_id,),
            )
            rows = await cur.fetchall()
    for row in rows:
        row["permissions"] = [p for p in (row.get("permissions") or "").split(",") if p]
    return rows


@router.post("/orgs/{org_id}/roles")
async def create_org_role(org_id: str, body: CreateRoleBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "roles.create")):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_id = str(uuid.uuid4())
    slug = _slugify(body.name)
    permissions = sorted(set(p.strip() for p in body.permissions if p and p.strip()))

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                INSERT INTO roles (id, organization_id, name, slug, description, is_system)
                VALUES (%s, %s, %s, %s, %s, 0)
                """,
                (role_id, org_id, body.name.strip(), slug, body.description or None),
            )
            for perm in permissions:
                await cur.execute(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                    (role_id, perm),
                )
        await conn.commit()

    return {"success": True, "roleId": role_id}


@router.get("/orgs/{org_id}/users")
async def list_org_users(org_id: str, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.view")):
        raise HTTPException(status_code=403, detail="Permission denied")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT u.id, u.name, u.email, u.status, u.phone, u.batch, u.created_at,
                       r.id AS role_id, r.name AS role_name, r.slug AS role_slug
                FROM users u
                JOIN user_role_assignments ura ON ura.user_id = u.id AND ura.organization_id = %s
                JOIN roles r ON r.id = ura.role_id
                WHERE u.organization_id = %s
                ORDER BY u.created_at DESC
                """,
                (org_id, org_id),
            )
            rows = await cur.fetchall()
    return rows


@router.post("/orgs/{org_id}/users")
async def create_org_user(org_id: str, body: CreateOrgUserBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.create")):
        raise HTTPException(status_code=403, detail="Permission denied")

    user_id = f"user-{uuid.uuid4().hex[:8]}"
    password_hash = _hash_password(body.password)

    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone()
    tenant_db_url = (org or {}).get("db_url")
    if not tenant_db_url:
        raise HTTPException(status_code=400, detail="Organization DB URL missing; cannot provision user")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
            if await cur.fetchone():
                raise HTTPException(status_code=409, detail="Email already exists")

            await cur.execute("SELECT id FROM roles WHERE id = %s AND organization_id = %s", (body.roleId, org_id))
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="Role not found for organization")

            await cur.execute(
                """
                INSERT INTO users (id, name, email, password, role, organization_id, phone, batch, status, must_change_password, created_at)
                VALUES (%s, %s, %s, %s, 'org_user', %s, %s, %s, 'active', 1, NOW())
                """,
                (user_id, body.name, body.email, password_hash, org_id, body.phone, body.batch),
            )
            await cur.execute(
                """
                INSERT INTO user_role_assignments (user_id, organization_id, role_id, is_primary)
                VALUES (%s, %s, %s, 1)
                """,
                (user_id, org_id, body.roleId),
            )
        await conn.commit()

    _provision_user_in_tenant_db(
        tenant_db_url,
        user_id=user_id,
        name=body.name,
        email=body.email,
        password_hash=password_hash,
        role="org_user",
        organization_id=org_id,
        phone=body.phone,
        batch=body.batch,
        must_change_password=1,
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
    return {"success": True, "userId": user_id}
