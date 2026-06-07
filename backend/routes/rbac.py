"""Multi-tenant RBAC routes for organizations, roles, and user-role assignments."""

from __future__ import annotations

import re
import uuid
import os
from typing import Any
from urllib.parse import urlparse
import ssl as _ssl
import asyncio

import pymysql.cursors
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from database import get_primary_pool, resolve_tenant_db_url
from routes.auth import _hash_password
from config import settings
from services.otp_delivery import send_notification_email, send_account_created_email, send_password_reset_email
from services.subscription_access import (
    PERMISSION_CATALOG,
    VALID_PERMISSIONS,
    SUBSCRIPTION_PLANS,
    DEFAULT_SUBSCRIPTION_TYPE,
    normalized_subscription_type,
    allowed_permissions_for_subscription,
    plan_limit,
)
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["rbac"])
audit_logger = get_audit_logger()


VALID_USER_STATUSES = {"active", "inactive", "suspended"}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug[:120] or "role"


def _normalized_permissions(permissions: list[str] | None) -> list[str]:
    normalized = sorted(set(p.strip() for p in (permissions or []) if p and p.strip()))
    unknown = [p for p in normalized if p not in VALID_PERMISSIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permission(s): {', '.join(unknown)}")
    return normalized


def _normalized_subscription_type(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if raw and raw not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid subscription type: {raw}")
    st = normalized_subscription_type(raw)
    return st


def _allowed_permissions_for_subscription(subscription_type: str) -> set[str]:
    return allowed_permissions_for_subscription(subscription_type)


def _validate_permissions_for_subscription(permissions: list[str], subscription_type: str) -> list[str]:
    allowed = _allowed_permissions_for_subscription(subscription_type)
    blocked = [p for p in permissions if p not in allowed]
    if blocked:
        raise HTTPException(
            status_code=400,
            detail=f"Permissions not allowed for subscription '{subscription_type}': {', '.join(blocked)}",
        )
    return permissions


async def _get_org_subscription_type(org_id: str) -> str:
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT subscription_type FROM organizations WHERE id = %s", (org_id,))
            row = await cur.fetchone() or {}
    return _normalized_subscription_type(row.get("subscription_type"))


def _request_user_id(request: Request) -> str:
    return (getattr(request.state, "auth_user_id", None) or "").strip()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


def _connect_mysql_from_url(db_url: str):
    parsed = urlparse(db_url)
    ssl_ctx = _ssl.create_default_context()
    if os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes"):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)
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
    if os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes"):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)
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


def _update_user_in_tenant_db(
    tenant_db_url: str,
    *,
    user_id: str,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    batch: str | None = None,
    status: str | None = None,
    password_hash: str | None = None,
    must_change_password: int | None = None,
) -> None:
    updates = []
    params: list[Any] = []
    for column, value in {
        "name": name,
        "email": email,
        "phone": phone,
        "batch": batch,
        "status": status,
        "password": password_hash,
        "must_change_password": must_change_password,
    }.items():
        if value is not None:
            updates.append(f"{column}=%s")
            params.append(value)
    if not updates:
        return

    conn = _connect_mysql_from_url(tenant_db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = %s",
                [*params, user_id],
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


async def _is_org_admin(user_id: str, org_id: str) -> bool:
    """True if the user is the organization_admin of this specific org (by user record role column)."""
    if not user_id or not org_id:
        return False
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT 1 FROM users WHERE id = %s AND organization_id = %s AND role = 'organization_admin' LIMIT 1",
                (user_id, org_id),
            )
            return bool(await cur.fetchone())


async def _has_org_permission(user_id: str, org_id: str, permission: str) -> bool:
    subscription_type = await _get_org_subscription_type(org_id)
    if permission not in _allowed_permissions_for_subscription(subscription_type):
        return False
    # Organization admins implicitly hold all subscription-allowed permissions.
    # This avoids stale role_permissions rows when the subscription plan expands.
    if await _is_org_admin(user_id, org_id):
        return True
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
    adminName: str
    adminEmail: str
    adminPassword: str
    subscriptionType: str = DEFAULT_SUBSCRIPTION_TYPE


class ConfigureTenantDbBody(BaseModel):
    dbUrl: str
    activate: bool = True


class CreateRoleBody(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)


class UpdateRoleBody(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None


class CreateOrgUserBody(BaseModel):
    name: str
    email: str
    password: str
    roleId: str
    phone: str | None = None
    batch: str | None = None


class UpdateOrgUserBody(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    batch: str | None = None
    status: str | None = None
    roleId: str | None = None


class ResetOrgUserPasswordBody(BaseModel):
    newPassword: str
    sendEmail: bool = True


class BulkOrgUserItem(BaseModel):
    name: str
    email: str
    password: str
    roleId: str
    phone: str | None = None
    batch: str | None = None


class BulkOrgUsersBody(BaseModel):
    users: list[BulkOrgUserItem] = Field(default_factory=list)


class OrganizationStatusBody(BaseModel):
    isActive: bool


class SubscriptionChangeBody(BaseModel):
    subscriptionType: str


class UsageLimitsBody(BaseModel):
    maxUsers: int | None = None
    maxActiveUsers: int | None = None
    maxTests: int | None = None
    maxSubmissions: int | None = None
    maxApiRequestsMonthly: int | None = None
    maxStorageMb: int | None = None


def _limit_value(value: int | None) -> int | None:
    if value is None:
        return None
    value = int(value)
    if value < 0:
        raise HTTPException(status_code=400, detail="Usage limits must be zero or greater")
    return value


async def _ensure_platform_ops_schema() -> None:
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tenant_db_connection_events (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    organization_id CHAR(36) NOT NULL,
                    event_source VARCHAR(32) NOT NULL,
                    status VARCHAR(16) NOT NULL,
                    db_mode VARCHAR(32) NULL,
                    db_ready TINYINT(1) NULL DEFAULT 0,
                    has_users_table TINYINT(1) NULL DEFAULT 0,
                    can_bootstrap TINYINT(1) NULL DEFAULT 0,
                    message TEXT NULL,
                    checked_by VARCHAR(64) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant_db_events_org_created (organization_id, created_at),
                    INDEX idx_tenant_db_events_status (status)
                )
                """
            )
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS organization_usage_limits (
                    organization_id CHAR(36) NOT NULL PRIMARY KEY,
                    max_users INT NULL,
                    max_active_users INT NULL,
                    max_tests INT NULL,
                    max_submissions INT NULL,
                    max_api_requests_monthly INT NULL,
                    max_storage_mb INT NULL,
                    updated_by VARCHAR(64) NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
                """
            )


async def _record_tenant_db_event(
    org_id: str,
    *,
    actor: str | None,
    source: str,
    db_mode: str,
    readiness: dict[str, Any],
) -> None:
    await _ensure_platform_ops_schema()
    status = "SUCCESS" if readiness.get("ok") else "FAILED"
    message = readiness.get("reason") or readiness.get("ddlError") or ("Healthy" if readiness.get("ok") else "DB check failed")
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO tenant_db_connection_events
                (id, organization_id, event_source, status, db_mode, db_ready,
                 has_users_table, can_bootstrap, message, checked_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    str(uuid.uuid4()),
                    org_id,
                    source,
                    status,
                    db_mode,
                    1 if readiness.get("ok") else 0,
                    1 if readiness.get("hasUsersTable") else 0,
                    1 if readiness.get("ddlOk") else 0,
                    str(message or "")[:2000],
                    actor or None,
                ),
            )
        await conn.commit()


async def _get_org_db_readiness(org_id: str, *, actor: str | None, source: str, record: bool = True) -> dict[str, Any]:
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, is_active, db_url, db_secret_ref, created_at FROM organizations WHERE id = %s",
                (org_id,),
            )
            org = await cur.fetchone()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    db_secret_ref = org.get("db_secret_ref")
    db_url = org.get("db_url")
    db_mode = "secret_ref" if db_secret_ref else ("direct_url" if db_url else "missing")
    readiness: dict[str, Any] = {"ok": False, "reason": "Tenant DB is not configured"}
    if db_secret_ref or db_url:
        try:
            resolved_url = resolve_tenant_db_url(db_url=db_url, db_secret_ref=db_secret_ref)
            readiness = _check_tenant_db_readiness(resolved_url) if resolved_url else {"ok": False, "reason": "Unable to resolve tenant DB URL"}
        except Exception as exc:
            readiness = {"ok": False, "reason": str(exc)}
    if record:
        await _record_tenant_db_event(org_id, actor=actor, source=source, db_mode=db_mode, readiness=readiness)
    return {
        "id": org.get("id"),
        "name": org.get("name"),
        "code": org.get("code"),
        "is_active": bool(org.get("is_active")),
        "dbConfigured": bool(db_secret_ref or db_url),
        "dbMode": db_mode,
        "ok": bool(readiness.get("ok")) and bool(org.get("is_active")),
        "dbReady": bool(readiness.get("ok")),
        "hasUsersTable": bool(readiness.get("hasUsersTable")),
        "canBootstrap": bool(readiness.get("ddlOk")),
        "reason": readiness.get("reason") or ("Healthy" if readiness.get("ok") else "DB check failed"),
        "created_at": org.get("created_at"),
    }


async def _get_usage_limits(org_id: str) -> dict[str, Any]:
    await _ensure_platform_ops_schema()
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM organization_usage_limits WHERE organization_id = %s", (org_id,))
            row = await cur.fetchone() or {}
    return {
        "maxUsers": row.get("max_users"),
        "maxActiveUsers": row.get("max_active_users"),
        "maxTests": row.get("max_tests"),
        "maxSubmissions": row.get("max_submissions"),
        "maxApiRequestsMonthly": row.get("max_api_requests_monthly"),
        "maxStorageMb": row.get("max_storage_mb"),
        "updatedBy": row.get("updated_by"),
        "updatedAt": row.get("updated_at"),
    }


async def _collect_org_usage(org_id: str) -> dict[str, int]:
    primary = await get_primary_pool()
    usage = {
        "users": 0,
        "activeUsers": 0,
        "tests": 0,
        "submissions": 0,
        "apiRequestsMonthly": 0,
        "storageMb": 0,
    }

    # --- User counts (always in primary DB) ---
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE organization_id = %s", (org_id,))
            usage["users"] = int((await cur.fetchone() or {}).get("cnt") or 0)
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE organization_id = %s AND LOWER(COALESCE(status, 'active')) = 'active'",
                (org_id,),
            )
            usage["activeUsers"] = int((await cur.fetchone() or {}).get("cnt") or 0)
            try:
                await cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM api_request_audit a
                    JOIN users u ON u.id = a.user_id
                    WHERE u.organization_id = %s
                      AND a.timestamp >= DATE_FORMAT(NOW(), '%%Y-%%m-01')
                    """,
                    (org_id,),
                )
                usage["apiRequestsMonthly"] = int((await cur.fetchone() or {}).get("cnt") or 0)
            except Exception:
                usage["apiRequestsMonthly"] = 0

    # --- Assessment + submission counts (in tenant DB, not primary) ---
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,)
            )
            org_row = await cur.fetchone() or {}
    tenant_db_url = resolve_tenant_db_url(
        db_url=org_row.get("db_url"), db_secret_ref=org_row.get("db_secret_ref")
    )
    if tenant_db_url:
        try:
            tenant_conn = _connect_mysql_from_url(tenant_db_url)
            try:
                with tenant_conn.cursor(pymysql.cursors.DictCursor) as cur:
                    for table_name in ("global_tests", "aptitude_tests", "skill_tests", "comm_tests", "problems"):
                        try:
                            cur.execute(f"SELECT COUNT(*) AS cnt FROM `{table_name}`")
                            usage["tests"] += int((cur.fetchone() or {}).get("cnt") or 0)
                        except Exception:
                            continue
                    for table_name in ("global_test_submissions", "aptitude_submissions",
                                       "skill_test_attempts", "comm_test_attempts", "submissions"):
                        try:
                            cur.execute(f"SELECT COUNT(*) AS cnt FROM `{table_name}`")
                            usage["submissions"] += int((cur.fetchone() or {}).get("cnt") or 0)
                        except Exception:
                            continue
            finally:
                try:
                    tenant_conn.close()
                except Exception:
                    pass
        except Exception:
            pass  # tenant DB unreachable — leave counts at 0

    return usage


def _build_usage_limit_status(usage: dict[str, int], limits: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "users": "maxUsers",
        "activeUsers": "maxActiveUsers",
        "tests": "maxTests",
        "submissions": "maxSubmissions",
        "apiRequestsMonthly": "maxApiRequestsMonthly",
        "storageMb": "maxStorageMb",
    }
    items = []
    for usage_key, limit_key in mapping.items():
        limit = limits.get(limit_key)
        used = int(usage.get(usage_key) or 0)
        pct = None if limit in (None, "") else round((used / max(1, int(limit))) * 100)
        status = "unlimited"
        if limit not in (None, ""):
            status = "over" if used > int(limit) else ("warning" if pct is not None and pct >= 80 else "ok")
        items.append({"key": usage_key, "used": used, "limit": limit, "percent": pct, "status": status})
    return {"items": items, "overLimit": any(i["status"] == "over" for i in items)}


async def _usage_payload_for_org(org_id: str) -> dict[str, Any]:
    usage = await _collect_org_usage(org_id)
    limits = await _get_usage_limits(org_id)
    return {"organizationId": org_id, "usage": usage, "limits": limits, "status": _build_usage_limit_status(usage, limits)}


async def _assert_usage_limit_available(org_id: str, resource: str, increment: int = 1) -> None:
    payload = await _usage_payload_for_org(org_id)
    usage = payload["usage"]
    limits = payload["limits"]
    subscription_type = await _get_org_subscription_type(org_id)

    # (usage_key, custom-limit key, plan-limit resource name)
    checks: list[tuple[str, str, str]] = []
    if resource == "users":
        checks = [("users", "maxUsers", "max_users"), ("activeUsers", "maxActiveUsers", "max_users")]
    elif resource == "tests":
        checks = [("tests", "maxTests", "max_tests")]
    elif resource == "submissions":
        checks = [("submissions", "maxSubmissions", "")]

    for usage_key, limit_key, plan_key in checks:
        # Custom limit set by super admin takes precedence; fall back to plan limit
        limit = limits.get(limit_key)
        if limit is None and plan_key:
            limit = plan_limit(subscription_type, plan_key)
        if limit is not None and int(usage.get(usage_key) or 0) + increment > int(limit):
            raise HTTPException(
                status_code=402,
                detail=f"Plan limit reached for {usage_key}: {usage.get(usage_key, 0)}/{limit}. Please upgrade your subscription.",
            )


@router.get("/rbac/permissions")
async def list_permissions():
    return PERMISSION_CATALOG


@router.get("/rbac/subscription-plans")
async def list_subscription_plans():
    return {
        plan: {
            "label": meta["label"],
            "allowedPermissions": sorted(meta["allowed_permissions"]),
        }
        for plan, meta in SUBSCRIPTION_PLANS.items()
    }


@router.get("/platform/organizations")
async def list_organizations(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can list organizations")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, subscription_type, is_active, created_by, created_at FROM organizations ORDER BY created_at DESC"
            )
            rows = await cur.fetchall()
    return rows


@router.get("/platform/organizations/health")
async def organization_health(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view organization health")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT id
                FROM organizations
                ORDER BY created_at DESC
                """
            )
            orgs = await cur.fetchall() or []

    health = []
    for org in orgs:
        health.append(await _get_org_db_readiness(org.get("id"), actor=actor, source="health_check", record=True))
    return health


@router.post("/platform/organizations")
async def create_organization(body: CreateOrganizationBody, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can create organizations")

    subscription_type = _normalized_subscription_type(body.subscriptionType)

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
                INSERT INTO organizations (id, name, code, subscription_type, is_active, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (org_id, body.name, body.code, subscription_type, 1, actor or None),
            )

            # Seed default organization admin role with broad permissions.
            role_id = str(uuid.uuid4())
            await cur.execute(
                """
                INSERT INTO roles (id, organization_id, name, slug, description, is_system)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (role_id, org_id, "Organization Admin", "organization-admin", "Default organization super role"),
            )
            role_perms = sorted(_allowed_permissions_for_subscription(subscription_type))
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
                )
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
                if perm not in _allowed_permissions_for_subscription(subscription_type):
                    continue
                await cur.execute(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                    (exam_taker_role_id, perm),
                )

            # Seed default content creator role for test/exam management.
            content_creator_role_id = str(uuid.uuid4())
            await cur.execute(
                """
                INSERT INTO roles (id, organization_id, name, slug, description, is_system)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (
                    content_creator_role_id,
                    org_id,
                    "Content Creator",
                    "content-creator",
                    "Staff role for creating and assigning tests",
                ),
            )
            content_creator_perms = [
                "tests.create",
                "tests.view",
                "tests.update",
                "tests.assign",
                "tests.view_allocated",
                "tests.attempt",
                "aptitude.create",
                "aptitude.assign",
                "aptitude.attempt",
                "coding.create",
                "coding.assign",
                "coding.attempt",
                "communication.create",
                "communication.assign",
                "communication.attempt",
            ]
            for perm in content_creator_perms:
                if perm not in _allowed_permissions_for_subscription(subscription_type):
                    continue
                await cur.execute(
                    "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                    (content_creator_role_id, perm),
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

    try:
        await asyncio.to_thread(
            send_account_created_email,
            body.adminEmail,
            body.adminName,
            body.adminEmail,
            body.adminPassword,
            "Organization Admin",
            f"You are the admin for <strong>{body.name}</strong>. After logging in, go to "
            "Admin &rarr; Tenant Database to configure your organization database.",
        )
    except Exception:
        pass

    return {
        "success": True,
        "organizationId": org_id,
        "organizationAdminId": org_admin_id,
        "subscriptionType": subscription_type,
    }


@router.post("/orgs/{org_id}/tenant-db")
async def configure_tenant_db(org_id: str, body: ConfigureTenantDbBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _is_org_admin(actor, org_id)):
        raise HTTPException(status_code=403, detail="Permission denied")

    db_url = (body.dbUrl or "").strip()
    if not db_url:
        raise HTTPException(status_code=400, detail="Tenant DB URL is required")
    try:
        resolved_db_url = resolve_tenant_db_url(db_url=db_url, db_secret_ref=None)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not resolved_db_url:
        raise HTTPException(status_code=400, detail="Unable to resolve tenant DB URL")

    readiness = _check_tenant_db_readiness(resolved_db_url)
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
    try:
        bootstrap_stats = _bootstrap_tenant_schema_from_primary(resolved_db_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Tenant DB bootstrap failed: {exc}")

    post_bootstrap = _check_tenant_db_readiness(resolved_db_url)
    if not post_bootstrap.get("ok") or not post_bootstrap.get("hasUsersTable", False):
        raise HTTPException(status_code=400, detail="Tenant DB bootstrap incomplete")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "UPDATE organizations SET db_url = %s, db_secret_ref = NULL, is_active = %s WHERE id = %s",
                (db_url, 1 if body.activate else 0, org_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Organization not found")
            await cur.execute(
                """
                SELECT id, name, email, password, role, organization_id, phone, batch, must_change_password
                FROM users
                WHERE organization_id = %s
                """,
                (org_id,),
            )
            existing_users = await cur.fetchall() or []
        await conn.commit()
    for existing_user in existing_users:
        _provision_user_in_tenant_db(
            resolved_db_url,
            user_id=existing_user["id"],
            name=existing_user.get("name") or "",
            email=existing_user.get("email") or "",
            password_hash=existing_user.get("password") or "",
            role=existing_user.get("role") or "org_user",
            organization_id=org_id,
            phone=existing_user.get("phone"),
            batch=existing_user.get("batch"),
            must_change_password=int(existing_user.get("must_change_password") or 0),
        )
    await _record_tenant_db_event(
        org_id,
        actor=actor,
        source="configure",
        db_mode="direct_url",
        readiness=post_bootstrap,
    )
    return {"success": True, "organizationId": org_id, "tenantSchema": bootstrap_stats, "organizationActive": bool(body.activate)}


@router.get("/orgs/{org_id}/tenant-db/status")
async def get_tenant_db_status(org_id: str, request: Request):
    """Org admins can check their own tenant DB connection status without recording an event."""
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _is_org_admin(actor, org_id)):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await _get_org_db_readiness(org_id, actor=actor, source="status_check", record=False)


@router.post("/platform/organizations/{org_id}/tenant-db/retry")
async def retry_tenant_db_connection(org_id: str, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can retry tenant DB connections")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    db_url = org.get("db_url")
    db_secret_ref = org.get("db_secret_ref")
    db_mode = "secret_ref" if db_secret_ref else ("direct_url" if db_url else "missing")
    bootstrap_stats = {"created": 0, "existing": 0}
    if not db_url and not db_secret_ref:
        readiness = {"ok": False, "reason": "Tenant DB is not configured"}
        await _record_tenant_db_event(org_id, actor=actor, source="manual_retry", db_mode=db_mode, readiness=readiness)
        return {"success": False, "organizationId": org_id, "readiness": readiness, "tenantSchema": bootstrap_stats}

    try:
        resolved_db_url = resolve_tenant_db_url(db_url=db_url, db_secret_ref=db_secret_ref)
        readiness = _check_tenant_db_readiness(resolved_db_url) if resolved_db_url else {"ok": False, "reason": "Unable to resolve tenant DB URL"}
        if readiness.get("ok") and readiness.get("ddlOk"):
            try:
                bootstrap_stats = _bootstrap_tenant_schema_from_primary(resolved_db_url)
                readiness = _check_tenant_db_readiness(resolved_db_url)
            except Exception as exc:
                readiness = {"ok": False, "reason": f"Tenant DB bootstrap failed: {exc}"}
    except Exception as exc:
        readiness = {"ok": False, "reason": str(exc)}

    await _record_tenant_db_event(org_id, actor=actor, source="manual_retry", db_mode=db_mode, readiness=readiness)
    return {
        "success": bool(readiness.get("ok")),
        "organizationId": org_id,
        "readiness": readiness,
        "tenantSchema": bootstrap_stats,
    }


@router.get("/platform/organizations/{org_id}/tenant-db/history")
async def tenant_db_connection_history(org_id: str, request: Request, limit: int = 20):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view tenant DB history")
    await _ensure_platform_ops_schema()
    safe_limit = max(1, min(int(limit or 20), 100))
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM organizations WHERE id = %s", (org_id,))
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="Organization not found")
            await cur.execute(
                """
                SELECT id, organization_id, event_source, status, db_mode, db_ready,
                       has_users_table, can_bootstrap, message, checked_by, created_at
                FROM tenant_db_connection_events
                WHERE organization_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (org_id, safe_limit),
            )
            return await cur.fetchall() or []


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


@router.patch("/platform/organizations/{org_id}/subscription")
async def change_organization_subscription(org_id: str, body: SubscriptionChangeBody, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can change subscription plan")

    new_type = _normalized_subscription_type(body.subscriptionType)

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT subscription_type FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone()
            if not org:
                raise HTTPException(status_code=404, detail="Organization not found")
            old_type = (org.get("subscription_type") or DEFAULT_SUBSCRIPTION_TYPE)
            await cur.execute(
                "UPDATE organizations SET subscription_type = %s WHERE id = %s",
                (new_type, org_id),
            )
        await conn.commit()

    get_audit_logger().log_admin_action(
        admin_id=actor,
        ip_address=getattr(request.state, "ip_address", "UNKNOWN") or "UNKNOWN",
        event_type=AuditEventType.ADMIN_USER_MODIFIED,
        resource_id=org_id,
        resource_type="organization",
        changes={"subscription_type": {"from": old_type, "to": new_type}},
    )
    return {"success": True, "organizationId": org_id, "subscriptionType": new_type}


@router.get("/platform/organizations/analytics")
async def organization_analytics(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view organization analytics")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, code, is_active, created_at FROM organizations ORDER BY created_at DESC"
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
                "is_active": org.get("is_active"),
                "created_at": org.get("created_at"),
                "total_users": users_by_org.get(oid, 0),
                "total_tests_conducted": tests_by_org.get(oid, 0),
                "total_api_requests_used": api_by_org.get(oid, 0),
            }
        )
    return result


@router.get("/platform/organizations/usage-summary")
async def platform_usage_summary(request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view usage summary")
    await _ensure_platform_ops_schema()
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id, name, code, is_active FROM organizations ORDER BY created_at DESC")
            orgs = await cur.fetchall() or []
    summary = []
    for org in orgs:
        payload = await _usage_payload_for_org(org["id"])
        summary.append({**org, **payload})
    return summary


@router.get("/platform/organizations/{org_id}/usage-limits")
async def get_organization_usage_limits(org_id: str, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can view usage limits")
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT 1 FROM organizations WHERE id = %s", (org_id,))
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="Organization not found")
    return await _usage_payload_for_org(org_id)


@router.put("/platform/organizations/{org_id}/usage-limits")
async def update_organization_usage_limits(org_id: str, body: UsageLimitsBody, request: Request):
    actor = _request_user_id(request)
    if not await _is_platform_super_admin(actor):
        raise HTTPException(status_code=403, detail="Only platform super admin can update usage limits")
    await _ensure_platform_ops_schema()
    limits = {
        "max_users": _limit_value(body.maxUsers),
        "max_active_users": _limit_value(body.maxActiveUsers),
        "max_tests": _limit_value(body.maxTests),
        "max_submissions": _limit_value(body.maxSubmissions),
        "max_api_requests_monthly": _limit_value(body.maxApiRequestsMonthly),
        "max_storage_mb": _limit_value(body.maxStorageMb),
    }
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT 1 FROM organizations WHERE id = %s", (org_id,))
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="Organization not found")
            await cur.execute(
                """
                INSERT INTO organization_usage_limits
                (organization_id, max_users, max_active_users, max_tests, max_submissions,
                 max_api_requests_monthly, max_storage_mb, updated_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                    max_users = VALUES(max_users),
                    max_active_users = VALUES(max_active_users),
                    max_tests = VALUES(max_tests),
                    max_submissions = VALUES(max_submissions),
                    max_api_requests_monthly = VALUES(max_api_requests_monthly),
                    max_storage_mb = VALUES(max_storage_mb),
                    updated_by = VALUES(updated_by),
                    updated_at = NOW()
                """,
                (
                    org_id,
                    limits["max_users"],
                    limits["max_active_users"],
                    limits["max_tests"],
                    limits["max_submissions"],
                    limits["max_api_requests_monthly"],
                    limits["max_storage_mb"],
                    actor or None,
                ),
            )
        await conn.commit()
    audit_logger.log_event(
        AuditEventType.CONFIG_CHANGED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=org_id,
        resource_type="organization_usage_limits",
        action="Platform usage limits updated",
        details=body.model_dump(),
    )
    return await _usage_payload_for_org(org_id)


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
                "SELECT id, name, code, subscription_type, is_active, created_at FROM organizations WHERE id = %s",
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
        "subscription_type": org.get("subscription_type") or DEFAULT_SUBSCRIPTION_TYPE,
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


@router.get("/orgs/{org_id}/audit-events")
async def list_org_audit_events(org_id: str, request: Request, limit: int = 50):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (
        await _is_platform_super_admin(actor)
        or await _has_org_permission(actor, org_id, "users.view")
        or await _has_org_permission(actor, org_id, "roles.view")
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    safe_limit = max(1, min(int(limit or 50), 100))
    pool = await get_primary_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    """
                    SELECT id, timestamp, event_type, user_id, ip_address, resource_id,
                           resource_type, action, status, error_message, details
                    FROM audit_events
                    WHERE organization_id = %s
                       OR user_id IN (SELECT id FROM users WHERE organization_id = %s)
                    ORDER BY timestamp DESC
                    LIMIT %s
                    """,
                    (org_id, org_id, safe_limit),
                )
                rows = await cur.fetchall() or []
    except Exception:
        return []
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
    permissions = _normalized_permissions(body.permissions)
    if not permissions:
        raise HTTPException(status_code=400, detail="Select at least one permission")
    subscription_type = await _get_org_subscription_type(org_id)
    _validate_permissions_for_subscription(permissions, subscription_type)

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

    audit_logger.log_event(
        AuditEventType.ADMIN_USER_ROLE_CHANGED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=role_id,
        resource_type="role",
        action="Role created",
        details={"name": body.name.strip(), "permissions": permissions},
    )
    return {"success": True, "roleId": role_id}


@router.put("/orgs/{org_id}/roles/{role_id}")
async def update_org_role(org_id: str, role_id: str, body: UpdateRoleBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "roles.update")):
        raise HTTPException(status_code=403, detail="Permission denied")

    permissions = _normalized_permissions(body.permissions) if body.permissions is not None else None
    subscription_type = await _get_org_subscription_type(org_id)
    if permissions is not None:
        _validate_permissions_for_subscription(permissions, subscription_type)
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, name, slug, is_system FROM roles WHERE id = %s AND organization_id = %s",
                (role_id, org_id),
            )
            role = await cur.fetchone()
            if not role:
                raise HTTPException(status_code=404, detail="Role not found")
            if role.get("slug") == "organization-admin":
                raise HTTPException(status_code=403, detail="Organization Admin role cannot be edited")

            updates = []
            params: list[Any] = []
            if body.name is not None and not int(role.get("is_system") or 0):
                name = body.name.strip()
                if not name:
                    raise HTTPException(status_code=400, detail="Role name is required")
                updates.extend(["name = %s", "slug = %s"])
                params.extend([name, _slugify(name)])
            if body.description is not None:
                updates.append("description = %s")
                params.append(body.description or None)
            if updates:
                await cur.execute(
                    f"UPDATE roles SET {', '.join(updates)} WHERE id = %s AND organization_id = %s",
                    [*params, role_id, org_id],
                )

            if permissions is not None:
                if not permissions:
                    raise HTTPException(status_code=400, detail="Select at least one permission")
                await cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
                for perm in permissions:
                    await cur.execute(
                        "INSERT INTO role_permissions (role_id, permission_key) VALUES (%s, %s)",
                        (role_id, perm),
                    )
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_USER_ROLE_CHANGED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=role_id,
        resource_type="role",
        action="Role updated",
        details={"name": body.name, "permissionsChanged": permissions is not None},
    )
    return {"success": True, "roleId": role_id}


@router.delete("/orgs/{org_id}/roles/{role_id}")
async def delete_org_role(org_id: str, role_id: str, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "roles.delete")):
        raise HTTPException(status_code=403, detail="Permission denied")

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, is_system FROM roles WHERE id = %s AND organization_id = %s",
                (role_id, org_id),
            )
            role = await cur.fetchone()
            if not role:
                raise HTTPException(status_code=404, detail="Role not found")
            if int(role.get("is_system") or 0):
                raise HTTPException(status_code=403, detail="System roles cannot be deleted")
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM user_role_assignments WHERE role_id = %s AND organization_id = %s",
                (role_id, org_id),
            )
            assigned = int((await cur.fetchone() or {}).get("cnt") or 0)
            if assigned:
                raise HTTPException(status_code=409, detail="Move users to another role before deleting this role")
            await cur.execute("DELETE FROM role_permissions WHERE role_id = %s", (role_id,))
            await cur.execute("DELETE FROM roles WHERE id = %s AND organization_id = %s", (role_id, org_id))
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_USER_ROLE_CHANGED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=role_id,
        resource_type="role",
        action="Role deleted",
    )
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
                SELECT u.id, u.name, u.email, u.status, u.phone, u.batch, u.must_change_password, u.created_at,
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
            user_ids = [row.get("id") for row in rows if row.get("id")]
            activity_by_user: dict[str, dict[str, Any]] = {}
            if user_ids:
                placeholders = ",".join(["%s"] * len(user_ids))
                try:
                    await cur.execute(
                        f"""
                        SELECT user_id,
                               COUNT(*) AS activity_count,
                               MAX(timestamp) AS last_activity_at,
                               MAX(CASE WHEN event_type IN ('LOGIN_SUCCESS', 'OTP_VERIFIED') THEN timestamp ELSE NULL END) AS last_login_at
                        FROM audit_events
                        WHERE user_id IN ({placeholders})
                        GROUP BY user_id
                        """,
                        user_ids,
                    )
                    for item in await cur.fetchall() or []:
                        activity_by_user[item["user_id"]] = dict(item)
                    await cur.execute(
                        f"""
                        SELECT ae.user_id, ae.event_type AS last_activity_type, ae.action AS last_activity_action
                        FROM audit_events ae
                        JOIN (
                            SELECT user_id, MAX(timestamp) AS last_activity_at
                            FROM audit_events
                            WHERE user_id IN ({placeholders})
                            GROUP BY user_id
                        ) latest
                          ON latest.user_id = ae.user_id
                         AND latest.last_activity_at = ae.timestamp
                        """,
                        user_ids,
                    )
                    for item in await cur.fetchall() or []:
                        activity_by_user.setdefault(item["user_id"], {}).update(dict(item))
                except Exception:
                    activity_by_user = {}
            for row in rows:
                row.update(activity_by_user.get(row.get("id"), {}))
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
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone()
    tenant_db_url = resolve_tenant_db_url(
        db_url=(org or {}).get("db_url"),
        db_secret_ref=(org or {}).get("db_secret_ref"),
    )
    if not tenant_db_url:
        raise HTTPException(status_code=400, detail="Organization DB URL missing; cannot provision user")

    await _assert_usage_limit_available(org_id, "users", 1)

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
            send_account_created_email,
            body.email,
            body.name,
            body.email,
            body.password,
        )
    except Exception:
        pass
    audit_logger.log_event(
        AuditEventType.ADMIN_USER_CREATED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=user_id,
        resource_type="user",
        action="Organization user created",
        details={"email": body.email, "roleId": body.roleId},
    )
    return {"success": True, "userId": user_id}


@router.post("/orgs/{org_id}/users/bulk")
async def bulk_create_org_users(org_id: str, body: BulkOrgUsersBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.create")):
        raise HTTPException(status_code=403, detail="Permission denied")
    if not body.users:
        raise HTTPException(status_code=400, detail="No users provided")
    if len(body.users) > 500:
        raise HTTPException(status_code=400, detail="Bulk import is limited to 500 users")

    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone() or {}
    tenant_db_url = resolve_tenant_db_url(db_url=org.get("db_url"), db_secret_ref=org.get("db_secret_ref"))
    if not tenant_db_url:
        raise HTTPException(status_code=400, detail="Organization DB URL missing; cannot provision users")

    await _assert_usage_limit_available(org_id, "users", len(body.users))

    results: list[dict[str, Any]] = []
    created = 0
    for index, item in enumerate(body.users, start=1):
        try:
            if not item.name.strip() or not item.email.strip() or not item.password or not item.roleId:
                raise ValueError("name, email, password, and roleId are required")
            user_id = f"user-{uuid.uuid4().hex[:8]}"
            password_hash = _hash_password(item.password)
            async with primary.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    await cur.execute("SELECT id FROM users WHERE email = %s", (item.email.strip(),))
                    if await cur.fetchone():
                        raise ValueError("Email already exists")
                    await cur.execute("SELECT id FROM roles WHERE id = %s AND organization_id = %s", (item.roleId, org_id))
                    if not await cur.fetchone():
                        raise ValueError("Role not found for organization")
                    await cur.execute(
                        """
                        INSERT INTO users (id, name, email, password, role, organization_id, phone, batch, status, must_change_password, created_at)
                        VALUES (%s, %s, %s, %s, 'org_user', %s, %s, %s, 'active', 1, NOW())
                        """,
                        (user_id, item.name.strip(), item.email.strip(), password_hash, org_id, item.phone, item.batch),
                    )
                    await cur.execute(
                        """
                        INSERT INTO user_role_assignments (user_id, organization_id, role_id, is_primary)
                        VALUES (%s, %s, %s, 1)
                        """,
                        (user_id, org_id, item.roleId),
                    )
                await conn.commit()
            _provision_user_in_tenant_db(
                tenant_db_url,
                user_id=user_id,
                name=item.name.strip(),
                email=item.email.strip(),
                password_hash=password_hash,
                role="org_user",
                organization_id=org_id,
                phone=item.phone,
                batch=item.batch,
                must_change_password=1,
            )
            created += 1
            results.append({"row": index, "email": item.email, "success": True, "userId": user_id})
        except Exception as exc:
            results.append({"row": index, "email": item.email, "success": False, "error": str(exc)})

    audit_logger.log_event(
        AuditEventType.BULK_OPERATION,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_type="user",
        action="Bulk user import",
        details={"created": created, "failed": len(results) - created},
    )
    return {"success": True, "created": created, "failed": len(results) - created, "results": results}


@router.put("/orgs/{org_id}/users/{user_id}")
async def update_org_user(org_id: str, user_id: str, body: UpdateOrgUserBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.update")):
        raise HTTPException(status_code=403, detail="Permission denied")

    status = body.status.strip().lower() if body.status is not None else None
    if status is not None and status not in VALID_USER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid user status")

    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s AND organization_id = %s", (user_id, org_id))
            target = await cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found")
            if target.get("role") == "organization_admin" and not await _is_platform_super_admin(actor):
                raise HTTPException(status_code=403, detail="Organization admin accounts cannot be edited here")

            if body.email is not None and body.email.strip() and body.email.strip() != target.get("email"):
                await cur.execute("SELECT id FROM users WHERE email = %s AND id <> %s", (body.email.strip(), user_id))
                if await cur.fetchone():
                    raise HTTPException(status_code=409, detail="Email already exists")

            role_id = body.roleId.strip() if body.roleId else None
            if role_id:
                await cur.execute("SELECT id FROM roles WHERE id = %s AND organization_id = %s", (role_id, org_id))
                if not await cur.fetchone():
                    raise HTTPException(status_code=404, detail="Role not found for organization")

            updates = []
            params: list[Any] = []
            for column, value in {
                "name": body.name.strip() if body.name is not None else None,
                "email": body.email.strip() if body.email is not None else None,
                "phone": body.phone if body.phone is not None else None,
                "batch": body.batch if body.batch is not None else None,
                "status": status,
            }.items():
                if value is not None:
                    updates.append(f"{column} = %s")
                    params.append(value)
            if updates:
                await cur.execute(
                    f"UPDATE users SET {', '.join(updates)} WHERE id = %s AND organization_id = %s",
                    [*params, user_id, org_id],
                )
            if role_id:
                await cur.execute(
                    """
                    INSERT INTO user_role_assignments (user_id, organization_id, role_id, is_primary)
                    VALUES (%s, %s, %s, 1)
                    ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1
                    """,
                    (user_id, org_id, role_id),
                )
        await conn.commit()

    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone() or {}
    tenant_db_url = resolve_tenant_db_url(db_url=org.get("db_url"), db_secret_ref=org.get("db_secret_ref"))
    if tenant_db_url:
        _update_user_in_tenant_db(
            tenant_db_url,
            user_id=user_id,
            name=body.name.strip() if body.name is not None else None,
            email=body.email.strip() if body.email is not None else None,
            phone=body.phone if body.phone is not None else None,
            batch=body.batch if body.batch is not None else None,
            status=status,
        )
    audit_logger.log_event(
        AuditEventType.ADMIN_USER_MODIFIED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=user_id,
        resource_type="user",
        action="Organization user updated",
        details={"roleChanged": bool(body.roleId), "status": status},
    )
    return {"success": True, "userId": user_id}


@router.delete("/orgs/{org_id}/users/{user_id}")
async def delete_org_user(org_id: str, user_id: str, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if actor == user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.delete")):
        raise HTTPException(status_code=403, detail="Permission denied")

    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role FROM users WHERE id = %s AND organization_id = %s", (user_id, org_id))
            target = await cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found")
            if target.get("role") == "organization_admin" and not await _is_platform_super_admin(actor):
                raise HTTPException(status_code=403, detail="Organization admin accounts cannot be deactivated here")
            await cur.execute("UPDATE users SET status = 'inactive' WHERE id = %s AND organization_id = %s", (user_id, org_id))
        await conn.commit()

    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone() or {}
    tenant_db_url = resolve_tenant_db_url(db_url=org.get("db_url"), db_secret_ref=org.get("db_secret_ref"))
    if tenant_db_url:
        _update_user_in_tenant_db(tenant_db_url, user_id=user_id, status="inactive")
    audit_logger.log_event(
        AuditEventType.ADMIN_USER_DELETED,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=user_id,
        resource_type="user",
        action="Organization user deactivated",
    )
    return {"success": True, "userId": user_id, "status": "inactive"}


@router.post("/orgs/{org_id}/users/{user_id}/reset-password")
async def reset_org_user_password(org_id: str, user_id: str, body: ResetOrgUserPasswordBody, request: Request):
    actor = _request_user_id(request)
    if not actor:
        raise HTTPException(status_code=401, detail="Missing actor identity")
    if not (await _is_platform_super_admin(actor) or await _has_org_permission(actor, org_id, "users.update")):
        raise HTTPException(status_code=403, detail="Permission denied")
    if len(body.newPassword or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    password_hash = _hash_password(body.newPassword)
    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id, name, email, role FROM users WHERE id = %s AND organization_id = %s", (user_id, org_id))
            target = await cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found")
            if target.get("role") == "organization_admin" and not await _is_platform_super_admin(actor):
                raise HTTPException(status_code=403, detail="Organization admin passwords cannot be reset here")
            await cur.execute(
                "UPDATE users SET password = %s, must_change_password = 1, status = 'active' WHERE id = %s AND organization_id = %s",
                (password_hash, user_id, org_id),
            )
        await conn.commit()

    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s", (org_id,))
            org = await cur.fetchone() or {}
    tenant_db_url = resolve_tenant_db_url(db_url=org.get("db_url"), db_secret_ref=org.get("db_secret_ref"))
    if tenant_db_url:
        _update_user_in_tenant_db(
            tenant_db_url,
            user_id=user_id,
            status="active",
            password_hash=password_hash,
            must_change_password=1,
        )

    if body.sendEmail:
        try:
            await asyncio.to_thread(
                send_password_reset_email,
                target.get("email"),
                target.get("name") or "there",
                body.newPassword,
            )
        except Exception:
            pass
    audit_logger.log_event(
        AuditEventType.AUTH_PASSWORD_RESET,
        user_id=actor,
        organization_id=org_id,
        ip_address=_client_ip(request),
        resource_id=user_id,
        resource_type="user",
        action="Organization user password reset/reinvite",
    )
    return {"success": True, "userId": user_id}

