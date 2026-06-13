"""Authentication and user management routes."""

import asyncio
import logging
import os
from logging_config import LogConfig
import secrets
import string
import uuid

import bcrypt
import pymysql.cursors
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from config import settings
from database import get_primary_pool, get_pool
from services.otp_delivery import send_login_otp_email
from services.subscription_access import (
    DEFAULT_SUBSCRIPTION_TYPE,
    normalized_subscription_type,
    allowed_permissions_for_subscription,
    plan_limit,
)
from audit_logger import get_audit_logger, AuditEventType
from security import create_access_token

router = APIRouter(prefix="/api", tags=["auth"])

logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()

LEGACY_EXAM_TAKER_PERMISSIONS = {
    "tests.view_allocated",
    "tests.attempt",
    "aptitude.attempt",
    "coding.attempt",
    "communication.attempt",
    "results.view_own",
}


# ---------- Helpers ----------

def _hash_password(plain: str) -> str:
    """Hash a password with bcrypt. Use this for all new/reset passwords."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verification.

    Returns False (instead of raising) when either input is missing/malformed,
    so a corrupted row or a missing password can't be bypassed by sending the
    raw hash as the plaintext password â€” which the previous fallback allowed.
    """
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError, AttributeError):
        logger.warning("Invalid bcrypt hash encountered during login; failing closed.")
        return False


def _mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if len(local) <= 1:
        masked = "*"
    else:
        masked = local[0] + "*" * max(1, len(local) - 1)
    return f"{masked}@{domain}"


def _generate_otp_plain() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


async def _start_otp_challenge(user_id: str, email: str, auth_method: str) -> dict:
    """Create a login challenge, email the OTP, return metadata for the client."""
    challenge_id = str(uuid.uuid4())
    plain = _generate_otp_plain()
    otp_hash = _hash_password(plain)
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "UPDATE auth_login_challenges SET consumed = 1 WHERE user_id = %s AND consumed = 0",
                (user_id,),
            )
            await cur.execute(
                """
                INSERT INTO auth_login_challenges
                    (id, user_id, otp_hash, expires_at, consumed, failed_attempts, auth_method)
                VALUES (%s, %s, %s, DATE_ADD(NOW(), INTERVAL %s MINUTE), 0, 0, %s)
                """,
                (challenge_id, user_id, otp_hash, settings.OTP_EXPIRY_MINUTES, auth_method),
            )
        await conn.commit()

    await asyncio.to_thread(
        send_login_otp_email,
        email,
        plain,
        settings.OTP_EXPIRY_MINUTES,
    )
    return {
        "challengeId": challenge_id,
        "expiresIn": settings.OTP_EXPIRY_MINUTES * 60,
        "emailMasked": _mask_email(email),
    }


def _client_ip_from_request(request: Request | None) -> str:
    if request is None:
        return "UNKNOWN"
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


def _issue_user_token(user: dict) -> str:
    return create_access_token(
        {
            "sub": user.get("id"),
            "role": user.get("role"),
            "organization_id": user.get("organizationId"),
            "email": user.get("email"),
        },
        settings.SECRET_KEY,
        settings.JWT_ACCESS_TOKEN_EXPIRES_MINUTES,
    )


# ---------- Request / Response models ----------

class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyRequest(BaseModel):
    userId: str


class GoogleLoginRequest(BaseModel):
    """Credential is the JWT `credential` string from Google Identity Services (One Tap / Sign-In button)."""

    credential: str


class VerifyOtpBody(BaseModel):
    challengeId: str
    otp: str = Field(..., min_length=4, max_length=12)


class CompleteFirstLoginBody(BaseModel):
    setupToken: str
    newPassword: str = Field(..., min_length=1)


def _clean_user(row: dict) -> dict:
    """Strip password and normalise keys for the frontend."""
    u = dict(row)
    u.pop("password", None)
    u["mentorId"] = u.pop("mentor_id", None)
    u["createdAt"] = str(u.pop("created_at", ""))
    u.setdefault("batch", None)
    u.setdefault("phone", None)
    u.setdefault("status", None)
    mc = u.pop("must_change_password", None)
    if mc is None:
        u["mustChangePassword"] = False
    else:
        u["mustChangePassword"] = bool(int(mc)) if str(mc).isdigit() else bool(mc)
    u["organizationId"] = u.pop("organization_id", None)
    return u


async def _attach_rbac_context(user: dict) -> dict:
    """Attach primary role and permission list for dynamic UI authorization."""
    pool = await get_primary_pool()
    org_subscription_type = DEFAULT_SUBSCRIPTION_TYPE
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT ura.organization_id, r.id AS role_id, r.name AS role_name, r.slug AS role_slug
                FROM user_role_assignments ura
                JOIN roles r ON r.id = ura.role_id
                WHERE ura.user_id = %s
                ORDER BY ura.is_primary DESC, ura.id ASC
                LIMIT 1
                """,
                (user.get("id"),),
            )
            primary = await cur.fetchone()

            permissions: list[str] = []
            if primary:
                await cur.execute(
                    "SELECT permission_key FROM role_permissions WHERE role_id = %s ORDER BY permission_key",
                    (primary["role_id"],),
                )
                permissions = [r["permission_key"] for r in (await cur.fetchall() or [])]
                org_id = primary.get("organization_id")
                if org_id:
                    await cur.execute("SELECT subscription_type FROM organizations WHERE id = %s", (org_id,))
                    org_row = await cur.fetchone() or {}
                    org_subscription_type = normalized_subscription_type(org_row.get("subscription_type"))

    allowed = allowed_permissions_for_subscription(org_subscription_type)
    user["permissions"] = [p for p in permissions if p in allowed]
    user["roleId"] = primary.get("role_id") if primary else None
    user["roleName"] = primary.get("role_name") if primary else None
    user["roleSlug"] = primary.get("role_slug") if primary else None
    if primary and primary.get("organization_id"):
        user["organizationId"] = primary.get("organization_id")
    return user


async def _has_any_permission(user_id: str, permissions: list[str]) -> bool:
    if not user_id:
        return False
    if not permissions:
        return False
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role, organization_id FROM users WHERE id = %s", (user_id,))
            row = await cur.fetchone() or {}
            if row and row.get("role") == "admin":
                return True

            org_subscription_type = DEFAULT_SUBSCRIPTION_TYPE
            if row.get("organization_id"):
                await cur.execute("SELECT subscription_type FROM organizations WHERE id = %s", (row.get("organization_id"),))
                org_row = await cur.fetchone() or {}
                org_subscription_type = normalized_subscription_type(org_row.get("subscription_type"))
            allowed = allowed_permissions_for_subscription(org_subscription_type)
            filtered_permissions = [p for p in permissions if p in allowed]
            if not filtered_permissions:
                return False

            if row.get("role") in ("student", "learner"):
                return any(p in LEGACY_EXAM_TAKER_PERMISSIONS for p in filtered_permissions)

            fmt = ",".join(["%s"] * len(filtered_permissions))
            await cur.execute(
                f"""
                SELECT 1
                FROM user_role_assignments ura
                JOIN role_permissions rp ON rp.role_id = ura.role_id
                WHERE ura.user_id = %s AND rp.permission_key IN ({fmt})
                LIMIT 1
                """,
                [user_id, *filtered_permissions],
            )
            return bool(await cur.fetchone())


async def _actor_scope(user_id: str) -> dict:
    """Return actor role + org for tenant-scoped authorization."""
    if not user_id:
        return {"role": "", "organization_id": None}
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role, organization_id FROM users WHERE id = %s", (user_id,))
            row = await cur.fetchone() or {}
            org_id = row.get("organization_id")
            if not org_id:
                await cur.execute(
                    """
                    SELECT organization_id
                    FROM user_role_assignments
                    WHERE user_id = %s
                    ORDER BY is_primary DESC, id ASC
                    LIMIT 1
                    """,
                    (user_id,),
                )
                primary = await cur.fetchone() or {}
                org_id = primary.get("organization_id")
    return {"role": row.get("role") or "", "organization_id": org_id}


async def assert_assessment_limit_for_actor(actor_id: str) -> None:
    """Raise HTTP 402 if the actor's org has reached its plan's assessment creation limit."""
    if not actor_id:
        return
    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT role, organization_id FROM users WHERE id = %s", (actor_id,))
            user_row = await cur.fetchone() or {}
            if user_row.get("role") == "admin":
                return  # platform admins are never throttled
            org_id = user_row.get("organization_id")
            if not org_id:
                return  # no org context → no plan limit
            await cur.execute("SELECT subscription_type FROM organizations WHERE id = %s", (org_id,))
            org_row = await cur.fetchone() or {}
            subscription_type = normalized_subscription_type(org_row.get("subscription_type"))

    cap = plan_limit(subscription_type, "max_tests")
    if cap is None:
        return  # unlimited

    tenant = await get_pool()
    total = 0
    async with tenant.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            for table in ("aptitude_tests", "comm_tests", "skill_tests", "global_tests", "problems"):
                try:
                    await cur.execute(f"SELECT COUNT(*) AS cnt FROM `{table}`")
                    total += int((await cur.fetchone() or {}).get("cnt") or 0)
                except Exception:
                    pass

    if total >= cap:
        raise HTTPException(
            status_code=402,
            detail=f"Assessment limit reached ({total}/{cap}) for your plan. Please upgrade your subscription.",
        )


# ---------- Routes ----------

@router.post("/auth/login")
async def login(body: LoginRequest, request: Request):
    """Validate password, then require email OTP before returning a session."""
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT * FROM users WHERE email = %s",
                (body.email,),
            )
            row = await cur.fetchone()

    client_ip = _client_ip_from_request(request)

    if not row:
        audit_logger.log_authentication(
            event_type=AuditEventType.AUTH_LOGIN_FAILURE,
            user_id=None,
            ip_address=client_ip,
            success=False,
            error_message="Unknown email",
            auth_method="password",
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not _verify_password(body.password, row.get("password", "")):
        audit_logger.log_authentication(
            event_type=AuditEventType.AUTH_LOGIN_FAILURE,
            user_id=row.get("id"),
            ip_address=client_ip,
            success=False,
            error_message="Invalid password",
            auth_method="password",
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    status_val = row.get("status") or "active"
    if str(status_val).lower() not in ("active", "enabled", "1", "true"):
        audit_logger.log_authentication(
            event_type=AuditEventType.AUTH_LOGIN_FAILURE,
            user_id=row.get("id"),
            ip_address=client_ip,
            success=False,
            error_message="Inactive account",
            auth_method="password",
        )
        raise HTTPException(status_code=403, detail="Your account is not active. Contact your administrator.")

    org_id = row.get("organization_id")
    if org_id:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT is_active FROM organizations WHERE id = %s", (org_id,))
                org = await cur.fetchone()
        if not org or int(org.get("is_active") or 0) != 1:
            raise HTTPException(status_code=403, detail="Organization is inactive. Contact the super admin.")

    meta = await _start_otp_challenge(row["id"], row["email"], "password")
    audit_logger.log_authentication(
        event_type=AuditEventType.AUTH_LOGIN_SUCCESS,
        user_id=row.get("id"),
        ip_address=client_ip,
        success=True,
        auth_method="password",
    )
    return {"requiresOtp": True, **meta}


def _verify_google_credential_jwt(credential: str) -> dict:
    """Blocking call: validate OIDC token and return claims (email, email_verified, sub, ...)."""
    if "GOOGLE_OAUTH_CLIENT_ID" in os.environ:
        google_client_id = (os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    else:
        google_client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not google_client_id:
        raise HTTPException(
            status_code=503,
            detail="Google Sign-In is not configured on this server (missing GOOGLE_OAUTH_CLIENT_ID).",
        )
    try:
        return google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            google_client_id,
            clock_skew_in_seconds=settings.GOOGLE_OAUTH_CLOCK_SKEW_SECONDS,
        )
    except ValueError as e:
        logger.warning("Google token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired Google credential") from e


@router.post("/auth/google")
async def login_with_google(body: GoogleLoginRequest, request: Request):
    """Validate Google token for an already-provisioned user, then issue a session."""
    client_ip = _client_ip_from_request(request)
    if not body.credential or not body.credential.strip():
        raise HTTPException(status_code=400, detail="Missing Google credential")

    claims = await asyncio.to_thread(_verify_google_credential_jwt, body.credential.strip())
    email = (claims.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=401, detail="Google did not return an email for this account")

    if not claims.get("email_verified"):
        raise HTTPException(
            status_code=403,
            detail="Google email is not verified. Use a verified Google account or sign in with email and password.",
        )

    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(%s))",
                (email,),
            )
            row = await cur.fetchone()

    if not row:
        audit_logger.log_authentication(
            event_type=AuditEventType.AUTH_LOGIN_FAILURE,
            user_id=None,
            ip_address=client_ip,
            success=False,
            error_message="Google account not provisioned",
            auth_method="google",
        )
        raise HTTPException(
            status_code=403,
            detail="No account exists for this Google email. Ask an administrator to create your user first.",
        )

    status_val = row.get("status") or "active"
    if str(status_val).lower() not in ("active", "enabled", "1", "true"):
        audit_logger.log_authentication(
            event_type=AuditEventType.AUTH_LOGIN_FAILURE,
            user_id=row.get("id"),
            ip_address=client_ip,
            success=False,
            error_message="Inactive account",
            auth_method="google",
        )
        raise HTTPException(status_code=403, detail="Your account is not active. Contact your administrator.")

    org_id = row.get("organization_id")
    if org_id:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT is_active FROM organizations WHERE id = %s", (org_id,))
                org = await cur.fetchone()
        if not org or int(org.get("is_active") or 0) != 1:
            raise HTTPException(status_code=403, detail="Organization is inactive. Contact the super admin.")

    # Google already verified email ownership — no OTP needed.
    user = await _attach_rbac_context(_clean_user(row))
    must_change = str(row.get("must_change_password") or "0").strip().lower() in ("1", "true", "yes")

    audit_logger.log_authentication(
        event_type=AuditEventType.AUTH_GOOGLE_SIGNIN,
        user_id=row.get("id"),
        ip_address=client_ip,
        success=True,
        auth_method="google",
    )

    if must_change:
        setup_token = str(uuid.uuid4())
        setup_mins = max(settings.OTP_EXPIRY_MINUTES, 15)
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    "UPDATE auth_password_setup_tokens SET consumed = 1 WHERE user_id = %s AND consumed = 0",
                    (row["id"],),
                )
                await cur.execute(
                    """
                    INSERT INTO auth_password_setup_tokens (token, user_id, expires_at, consumed)
                    VALUES (%s, %s, DATE_ADD(NOW(), INTERVAL %s MINUTE), 0)
                    """,
                    (setup_token, row["id"], setup_mins),
                )
            await conn.commit()
        return {
            "success": True,
            "mustChangePassword": True,
            "setupToken": setup_token,
            "user": user,
            "accessToken": _issue_user_token(user),
            "tokenType": "Bearer",
        }

    return {
        "success": True,
        "mustChangePassword": False,
        "user": user,
        "accessToken": _issue_user_token(user),
        "tokenType": "Bearer",
    }


@router.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtpBody, request: Request):
    """Verify the emailed code; optionally issue a setup token for first-time password change."""
    code = (body.otp or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Please enter the verification code")

    pool = await get_primary_pool()
    client_ip = _client_ip_from_request(request)
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT * FROM auth_login_challenges
                WHERE id = %s AND consumed = 0 AND expires_at > NOW()
                """,
                (body.challengeId,),
            )
            ch = await cur.fetchone()
            if not ch:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification session. Start sign-in again.",
                )

            if not _verify_password(code, ch["otp_hash"]):
                attempts = int(ch["failed_attempts"] or 0) + 1
                if attempts >= settings.OTP_MAX_FAILED_ATTEMPTS:
                    await cur.execute(
                        "UPDATE auth_login_challenges SET consumed = 1, failed_attempts = %s WHERE id = %s",
                        (attempts, body.challengeId),
                    )
                    await conn.commit()
                    audit_logger.log_event(
                        event_type=AuditEventType.AUTH_OTP_FAILED,
                        user_id=ch.get("user_id"),
                        ip_address=client_ip,
                        resource_type="AUTH",
                        action="OTP verify failed too many times",
                        status="FAILURE",
                    )
                    raise HTTPException(
                        status_code=401,
                        detail="Too many incorrect attempts. Start sign-in again.",
                    )
                await cur.execute(
                    "UPDATE auth_login_challenges SET failed_attempts = %s WHERE id = %s",
                    (attempts, body.challengeId),
                )
                await conn.commit()
                audit_logger.log_event(
                    event_type=AuditEventType.AUTH_OTP_FAILED,
                    user_id=ch.get("user_id"),
                    ip_address=client_ip,
                    resource_type="AUTH",
                    action="OTP verify failed",
                    status="FAILURE",
                )
                raise HTTPException(status_code=401, detail="Invalid verification code")

            await cur.execute(
                "UPDATE auth_login_challenges SET consumed = 1 WHERE id = %s",
                (body.challengeId,),
            )
            await cur.execute("SELECT * FROM users WHERE id = %s", (ch["user_id"],))
            row = await cur.fetchone()
        await conn.commit()

    if not row:
        raise HTTPException(status_code=500, detail="User missing after verification")

    user = await _attach_rbac_context(_clean_user(row))
    audit_logger.log_event(
        event_type=AuditEventType.AUTH_OTP_VERIFIED,
        user_id=row.get("id"),
        ip_address=client_ip,
        resource_type="AUTH",
        action="OTP verified",
        status="SUCCESS",
    )
    must_change = user.get("mustChangePassword") or str(row.get("must_change_password") or "0").strip().lower() in ("1", "true", "yes")

    if must_change:
        setup_token = str(uuid.uuid4())
        setup_mins = max(settings.OTP_EXPIRY_MINUTES, 15)
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    "UPDATE auth_password_setup_tokens SET consumed = 1 WHERE user_id = %s AND consumed = 0",
                    (row["id"],),
                )
                await cur.execute(
                    """
                    INSERT INTO auth_password_setup_tokens (token, user_id, expires_at, consumed)
                    VALUES (%s, %s, DATE_ADD(NOW(), INTERVAL %s MINUTE), 0)
                    """,
                    (setup_token, row["id"], setup_mins),
                )
            await conn.commit()
        token = _issue_user_token(user)
        return {
            "success": True,
            "mustChangePassword": True,
            "setupToken": setup_token,
            "user": user,
            "accessToken": token,
            "tokenType": "Bearer",
        }

    token = _issue_user_token(user)
    return {
        "success": True,
        "mustChangePassword": False,
        "user": user,
        "accessToken": token,
        "tokenType": "Bearer",
    }


@router.post("/auth/complete-first-login")
async def complete_first_login(body: CompleteFirstLoginBody, request: Request):
    """After OTP, allow a provisioned user to replace the admin-issued temporary password."""
    if len(body.newPassword) < settings.FIRST_LOGIN_PASSWORD_MIN_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.FIRST_LOGIN_PASSWORD_MIN_LEN} characters",
        )

    pool = await get_primary_pool()
    client_ip = _client_ip_from_request(request)
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT * FROM auth_password_setup_tokens
                WHERE token = %s AND consumed = 0 AND expires_at > NOW()
                """,
                (body.setupToken,),
            )
            tok = await cur.fetchone()
            if not tok:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired password setup session. Start sign-in again.",
                )

            await cur.execute("SELECT * FROM users WHERE id = %s", (tok["user_id"],))
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            if not int(row.get("must_change_password") or 0):
                raise HTTPException(
                    status_code=400,
                    detail="Password change is not required for this account.",
                )

            hashed = _hash_password(body.newPassword)
            await cur.execute(
                "UPDATE users SET password = %s, must_change_password = 0 WHERE id = %s",
                (hashed, tok["user_id"]),
            )
            await cur.execute(
                "UPDATE auth_password_setup_tokens SET consumed = 1 WHERE token = %s",
                (body.setupToken,),
            )
        await conn.commit()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s", (tok["user_id"],))
            row = await cur.fetchone()

    audit_logger.log_event(
        event_type=AuditEventType.AUTH_PASSWORD_CHANGED,
        user_id=tok.get("user_id"),
        ip_address=client_ip,
        resource_type="AUTH",
        action="Completed first login password change",
        status="SUCCESS",
    )
    user = await _attach_rbac_context(_clean_user(row))
    token = _issue_user_token(user)
    return {"success": True, "user": user, "accessToken": token, "tokenType": "Bearer"}


@router.post("/auth/verify")
async def verify_login(body: VerifyRequest, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor or actor != body.userId:
        raise HTTPException(status_code=401, detail="Invalid session")
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s", (body.userId,))
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="User not found or invalid session")

    user = await _attach_rbac_context(_clean_user(row))
    if user.get("organizationId"):
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT is_active FROM organizations WHERE id = %s", (user["organizationId"],))
                org = await cur.fetchone()
        if not org or int(org.get("is_active") or 0) != 1:
            raise HTTPException(status_code=403, detail="Organization is inactive. Contact the super admin.")
    if user.get("mustChangePassword"):
        raise HTTPException(
            status_code=401,
            detail="Password change required. Sign in again to finish setup.",
        )

    token = _issue_user_token(user)
    return {"success": True, "user": user, "accessToken": token, "tokenType": "Bearer"}


@router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["users.view"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    actor_scope = await _actor_scope(actor)
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if actor_scope["role"] != "admin":
        if not actor_scope["organization_id"] or row.get("organization_id") != actor_scope["organization_id"]:
            raise HTTPException(status_code=403, detail="Cross-organization user access denied")

    return await _attach_rbac_context(_clean_user(row))


@router.get("/users")
async def list_users(request: Request, role: str | None = None):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["users.view"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    actor_scope = await _actor_scope(actor)
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            where_clauses = []
            params: list = []
            if role:
                where_clauses.append("u.role = %s")
                params.append(role)
            if actor_scope["role"] != "admin":
                if not actor_scope["organization_id"]:
                    raise HTTPException(status_code=403, detail="Missing actor organization scope")
                where_clauses.append("u.organization_id = %s")
                params.append(actor_scope["organization_id"])
            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
            if role:
                await cur.execute(
                    f"""
                    SELECT u.*, GROUP_CONCAT(msa.student_id) AS allocated_students
                    FROM users u
                    LEFT JOIN mentor_student_allocations msa ON u.id = msa.mentor_id
                    {where_sql}
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                    """,
                    tuple(params),
                )
            else:
                await cur.execute(
                    f"""
                    SELECT u.*, GROUP_CONCAT(msa.student_id) AS allocated_students
                    FROM users u
                    LEFT JOIN mentor_student_allocations msa ON u.id = msa.mentor_id
                    {where_sql}
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                    """,
                    tuple(params),
                )
            rows = await cur.fetchall()

    users = []
    for r in rows:
        u = await _attach_rbac_context(_clean_user(r))
        alloc = r.get("allocated_students")
        if role == "mentor" and alloc:
            u["allocatedStudents"] = [s for s in alloc.split(",") if s]
        users.append(u)

    return users


@router.get("/mentors/{mentor_id}/students")
async def get_mentor_students(mentor_id: str, request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not await _has_any_permission(actor, ["users.view"]):
        raise HTTPException(status_code=403, detail="Permission denied")
    actor_scope = await _actor_scope(actor)
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            if actor_scope["role"] == "admin":
                await cur.execute(
                    'SELECT * FROM users WHERE role = "student" AND mentor_id = %s',
                    (mentor_id,),
                )
            else:
                if not actor_scope["organization_id"]:
                    raise HTTPException(status_code=403, detail="Missing actor organization scope")
                await cur.execute(
                    'SELECT * FROM users WHERE role = "student" AND mentor_id = %s AND organization_id = %s',
                    (mentor_id, actor_scope["organization_id"]),
                )
            rows = await cur.fetchall()

    return [_clean_user(r) for r in rows]

