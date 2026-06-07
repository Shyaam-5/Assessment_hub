"""FastAPI application entry-point with CORS, Socket.io, and all route modules.

Logical platform flow (admin -> content -> student -> monitoring):

1. **Admin**
   - Users: ``POST/GET /api/admin/users``; sign-in ``POST /api/auth/login`` or ``POST /api/auth/google`` (Google only for admin-provisioned emails).
   - Content: problems/tasks ``/api/problems``, ``/api/tasks``; skill tests
     ``/api/skill-tests/create``; aptitude ``/api/aptitude``; global tests
     ``/api/global-tests``; communication tests ``/api/communication/tests/create``.
   - Analytics: ``/api/analytics/admin``, extended insights ``/api/analytics/topics``,
     ``/plagiarism``, ``/time-to-solve``, exports ``/api/analytics/export/*``.
   - Integrity: Proctor agent ``/api/proctor-agent/*``, behavior ``/api/behavior/*``.
   - **Sockets:** ``join_monitoring`` (role admin -> ``admin_room``) receives
     ``live_update`` / ``live_alert`` from students (see ``socketService.js``).

2. **Tests (types)**
   - **Skill:** start/attempt under ``/api/skill-tests/*`` (MCQ, coding, SQL,
     interview); proctor logs ``POST /api/skill-tests/proctoring/log``.
   - **Aptitude:** ``/api/aptitude`` + ``/api/aptitude/{id}/submit``.
   - **Global:** ``/api/global-tests`` + submit/report routes.
   - **Communication:** ``/api/communication/*`` modules A–D and proctoring log.
   - **Environment scan:** REST ``/api/prescan/*``; **Sockets:**
     ``join_scan_session``, ``frame_result``, ``angle_update``, ``scan_complete``,
     ``request_scan_status`` (see ``prescan_socket_handlers.py``).

3. **Student**
   - Sign-in ``/api/auth/login`` or ``/api/auth/google`` (provisioned users only); listings: e.g. ``/api/skill-tests/student/available``,
     ``/api/students/{id}/problems``, aptitude allocate routes.
   - Submissions: ``POST /api/submissions``, skill finish endpoints, aptitude submit.
   - Messaging: ``GET/POST /api/messages``.
   - **Sockets:** ``join_student_session`` so ``agent_terminate`` from the proctor
     agent reaches the right room; emit ``submission_*``, ``proctoring_violation``,
     etc., for live dashboards.

4. **Mentor**
   - Same socket pattern with ``mentor_{mentorId}`` rooms; analytics scoped with
     ``?mentorId=`` on several ``/api/analytics/*`` routes.
"""

import os
import logging
import socketio
from datetime import datetime, timezone, timedelta
import pymysql.cursors
import pymysql
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from security import decode_access_token
from database import (
    init_db,
    close_db,
    create_prescan_tables,
    ensure_auth_login_schema,
    ensure_rbac_schema,
    ensure_proctoring_tables,
    ensure_default_super_admins,
    ensure_core_domain_tables,
    run_startup_db_preflight,
    reconcile_active_tenant_schemas,
    get_pool,
    get_primary_pool,
    get_tenant_pool_by_org_id,
    set_request_pool,
    clear_request_pool,
)
from logging_config import setup_logging
from logging_middleware import LoggingMiddleware, SecurityHeadersMiddleware, RateLimitMiddleware
from audit_schema import create_audit_tables
from audit_logger import get_audit_logger

logger = logging.getLogger("app")
audit_logger = get_audit_logger()


def _socket_ip(environ) -> str:
    if not isinstance(environ, dict):
        return "UNKNOWN"
    forwarded = environ.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return str(forwarded).split(",")[0].strip()
    cf_ip = environ.get("HTTP_CF_CONNECTING_IP")
    if cf_ip:
        return str(cf_ip).strip()
    return str(environ.get("REMOTE_ADDR", "UNKNOWN"))

# ─── Socket.io ──────────────────────────────────────────────────

def _cors_origins_for_runtime(origins: list[str]) -> list[str] | str:
    if origins:
        return origins
    if settings.APP_ENV in {"production", "prod"}:
        return []
    return "*"


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_cors_origins_for_runtime(settings.SOCKET_ALLOWED_ORIGINS),
)

# Register prescan socket handlers (must happen before any @sio.event decorators
# that conflict, so we do it right after sio is created)
from services.prescan_socket_handlers import (
    register_prescan_socket_handlers,
    get_prescan_disconnect_handler,
)
register_prescan_socket_handlers(sio)

# Connected monitoring clients
monitors: dict[str, dict] = {"admins": {}, "mentors": {}, "students": {}}


def _socket_payload_token(data) -> str:
    if not isinstance(data, dict):
        return ""
    return str(data.get("token") or "").strip()


async def _verify_socket_actor(data, required_user_key: str) -> dict | None:
    token = _socket_payload_token(data)
    try:
        claims = decode_access_token(token, settings.SECRET_KEY)
    except Exception:
        return None
    claimed_user = str((data or {}).get(required_user_key) or "").strip()
    if not claimed_user or claimed_user != str(claims.get("sub") or ""):
        return None
    return claims


def _org_admin_room(org_id: str) -> str:
    return f"admin_room:{org_id}"


def _org_mentor_room(org_id: str, mentor_id: str) -> str:
    return f"mentor:{org_id}:{mentor_id}"


async def _validated_mentor_room(student_id: str, claimed_mentor_id: str | None, org_id: str | None) -> str | None:
    mentor_id = (claimed_mentor_id or "").strip()
    if not mentor_id or not org_id:
        return None
    try:
        pool = await get_primary_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT mentor_id, organization_id FROM users WHERE id = %s", (student_id,))
                row = await cur.fetchone()
        real_mentor_id = str((row or {}).get("mentor_id") or "").strip()
        real_org_id = str((row or {}).get("organization_id") or "").strip()
        if real_mentor_id and real_mentor_id == mentor_id and real_org_id == str(org_id):
            return _org_mentor_room(str(org_id), mentor_id)
    except Exception:
        return None
    return None


@sio.event
async def connect(sid, environ):
    logger.info("Socket connected: %s", sid)
    audit_logger.log_socket_event("connect", sid, ip_address=_socket_ip(environ))


@sio.event
async def disconnect(sid):
    logger.info("Socket disconnected: %s", sid)
    audit_logger.log_socket_event("disconnect", sid)
    prescan_disconnect = get_prescan_disconnect_handler()
    if prescan_disconnect is not None:
        await prescan_disconnect(sid)


@sio.event
async def join_monitoring(sid, data):
    token = (data.get("token") or "").strip()
    try:
        claims = decode_access_token(token, settings.SECRET_KEY)
    except Exception:
        await sio.emit("monitoring_error", {"detail": "Invalid token"}, to=sid)
        return
    user_id = (data.get("userId") or "").strip()
    role = (data.get("role") or "").strip()
    if user_id != str(claims.get("sub") or ""):
        await sio.emit("monitoring_error", {"detail": "User mismatch"}, to=sid)
        return
    if role != str(claims.get("role") or ""):
        await sio.emit("monitoring_error", {"detail": "Role mismatch"}, to=sid)
        return
    mentor_id = data.get("mentorId")
    if not user_id:
        await sio.emit("monitoring_error", {"detail": "Missing user context"}, to=sid)
        return
    try:
        pool = await get_primary_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
                row = await cur.fetchone()
        if not row:
            await sio.emit("monitoring_error", {"detail": "Invalid user"}, to=sid)
            return
        db_role = (row.get("role") or "").strip()
    except Exception:
        await sio.emit("monitoring_error", {"detail": "Authorization unavailable"}, to=sid)
        return
    if role != db_role:
        await sio.emit("monitoring_error", {"detail": "Role mismatch"}, to=sid)
        return
    can_view_monitoring = False
    try:
        from routes.auth import _has_any_permission
        can_view_monitoring = await _has_any_permission(user_id, ["proctoring.view"])
    except Exception:
        can_view_monitoring = role == "admin"

    org_id = str(claims.get("organization_id") or "").strip()
    if role in {"organization_admin"} and can_view_monitoring and org_id:
        await sio.enter_room(sid, _org_admin_room(org_id))
    elif role == "admin" and can_view_monitoring:
        await sio.enter_room(sid, "admin_room:platform")
    elif role == "mentor" and mentor_id and can_view_monitoring and org_id:
        await sio.enter_room(sid, _org_mentor_room(org_id, str(mentor_id)))
    else:
        await sio.emit("monitoring_error", {"detail": "Permission denied"}, to=sid)
        return
    await sio.emit("monitoring_connected", {"userId": user_id, "role": role}, to=sid)
    audit_logger.log_socket_event(
        "join_monitoring",
        sid,
        user_id=user_id,
        payload={"role": role, "mentorId": mentor_id},
    )


@sio.event
async def join_student_session(sid, data):
    """Student joins their personal room for receiving agent commands (e.g. terminate)."""
    token = (data.get("token") or "").strip()
    try:
        claims = decode_access_token(token, settings.SECRET_KEY)
    except Exception:
        return
    student_id = data.get("studentId")
    if str(student_id or "") != str(claims.get("sub") or ""):
        return
    session_id = data.get("sessionId")
    if student_id:
        await sio.enter_room(sid, f"student_{student_id}")
    if session_id:
        await sio.enter_room(sid, f"session_{session_id}")
    logger.info("Socket student joined session room | student_id=%s session_id=%s", student_id, session_id)
    audit_logger.log_socket_event(
        "join_student_session",
        sid,
        user_id=student_id,
        payload={"sessionId": session_id},
    )


@sio.event
async def submission_started(sid, data):
    claims = await _verify_socket_actor(data, "studentId")
    if not claims:
        return
    org_id = str(claims.get("organization_id") or "").strip()
    mentor_room = await _validated_mentor_room(str(data.get("studentId") or ""), data.get("mentorId"), org_id)
    if org_id:
        await sio.emit("live_update", {**data, "type": "submission_started"}, room=_org_admin_room(org_id))
    if mentor_room:
        await sio.emit("live_update", {**data, "type": "submission_started"}, room=mentor_room)
    audit_logger.log_socket_event("submission_started", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def submission_completed(sid, data):
    claims = await _verify_socket_actor(data, "studentId")
    if not claims:
        return
    org_id = str(claims.get("organization_id") or "").strip()
    mentor_room = await _validated_mentor_room(str(data.get("studentId") or ""), data.get("mentorId"), org_id)
    if org_id:
        await sio.emit("live_update", {**data, "type": "submission_completed"}, room=_org_admin_room(org_id))
    if mentor_room:
        await sio.emit("live_update", {**data, "type": "submission_completed"}, room=mentor_room)
    audit_logger.log_socket_event("submission_completed", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def proctoring_violation(sid, data):
    claims = await _verify_socket_actor(data, "studentId")
    if not claims:
        return
    org_id = str(claims.get("organization_id") or "").strip()
    mentor_room = await _validated_mentor_room(str(data.get("studentId") or ""), data.get("mentorId"), org_id)
    if org_id:
        await sio.emit("live_alert", {**data, "type": "proctoring_violation"}, room=_org_admin_room(org_id))
    if mentor_room:
        await sio.emit("live_alert", {**data, "type": "proctoring_violation"}, room=mentor_room)
    audit_logger.log_socket_event("proctoring_violation", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def progress_update(sid, data):
    claims = await _verify_socket_actor(data, "studentId")
    if not claims:
        return
    org_id = str(claims.get("organization_id") or "").strip()
    mentor_room = await _validated_mentor_room(str(data.get("studentId") or ""), data.get("mentorId"), org_id)
    if org_id:
        await sio.emit("live_update", {**data, "type": "progress_update"}, room=_org_admin_room(org_id))
    if mentor_room:
        await sio.emit("live_update", {**data, "type": "progress_update"}, room=mentor_room)
    audit_logger.log_socket_event("progress_update", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def test_failed(sid, data):
    claims = await _verify_socket_actor(data, "studentId")
    if not claims:
        return
    org_id = str(claims.get("organization_id") or "").strip()
    mentor_room = await _validated_mentor_room(str(data.get("studentId") or ""), data.get("mentorId"), org_id)
    if org_id:
        await sio.emit("live_alert", {**data, "type": "test_failed"}, room=_org_admin_room(org_id))
    if mentor_room:
        await sio.emit("live_alert", {**data, "type": "test_failed"}, room=mentor_room)
    audit_logger.log_socket_event("test_failed", sid, user_id=data.get("studentId"), payload=data)


# ─── FastAPI lifespan ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging(os.getenv("LOG_LEVEL", "INFO"))
    logger.info("Startup DB target | DATABASE_URL=%s | DB_NAME=%s", settings.DATABASE_URL, settings.DB_NAME)
    await init_db()
    await create_prescan_tables()
    await ensure_auth_login_schema()
    await ensure_rbac_schema()
    await ensure_core_domain_tables()
    if settings.STARTUP_TENANT_SCHEMA_RECONCILE:
        tenant_fix = await reconcile_active_tenant_schemas()
        failed = [r for r in tenant_fix if not r.get("ok")]
        fixed = [r for r in tenant_fix if r.get("ok") and int(r.get("created") or 0) > 0]
        if fixed:
            logger.info("Tenant schema reconcile created missing tables for orgs=%s", fixed)
        if failed:
            logger.warning("Tenant schema reconcile failed for orgs=%s", failed)
    await ensure_proctoring_tables()
    await ensure_default_super_admins()
    if settings.STARTUP_DB_PREFLIGHT:
        preflight = await run_startup_db_preflight(check_tenants=settings.STARTUP_DB_PREFLIGHT_TENANTS)
        if preflight.get("primary_ok"):
            logger.info("DB preflight (primary): OK")
        else:
            logger.error(
                "DB preflight (primary) failed | missing_tables=%s missing_columns=%s",
                (preflight.get("primary") or {}).get("missing_tables"),
                (preflight.get("primary") or {}).get("missing_columns"),
            )
            raise RuntimeError("Primary DB preflight failed. Fix schema/permissions before startup.")
        if settings.STARTUP_DB_PREFLIGHT_TENANTS:
            bad_tenants = [t for t in (preflight.get("tenants") or []) if not t.get("ok")]
            if bad_tenants:
                logger.warning("DB preflight (tenants) failures=%s", bad_tenants)
            else:
                logger.info("DB preflight (tenants): OK")
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await create_audit_tables(conn)
    except Exception as exc:
        logger.error("Audit schema initialization failed: %s", exc)
    logger.info("FastAPI server started.")
    yield
    # Shutdown
    await close_db()
    logger.info("FastAPI server shut down.")


# ─── Create App ─────────────────────────────────────────────────

app = FastAPI(title="AI Assessment Hub API", version="1.0.0", lifespan=lifespan)
app.state.sio = sio
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(getattr(request, "state", object()), "request_id", None)
    logger.exception("Unhandled exception on %s %s | request_id=%s", request.method, request.url.path, req_id)
    if isinstance(exc, pymysql.err.ProgrammingError) and len(exc.args) >= 2 and int(exc.args[0]) == 1146:
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Tenant database schema is incomplete. Contact organization admin/super admin to run schema sync.",
                "requestId": req_id,
            },
        )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "requestId": req_id,
        },
    )

def _read_auth_token(request: Request) -> str:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _override_scope_header(scope: dict, name: str, value: str) -> None:
    key = name.lower().encode("latin-1")
    val = value.encode("latin-1")
    headers = []
    found = False
    for k, v in scope.get("headers", []):
        if k == key:
            if not found:
                headers.append((k, val))
                found = True
        else:
            headers.append((k, v))
    if not found:
        headers.append((key, val))
    scope["headers"] = headers


@app.middleware("http")
async def add_corp_header(request, call_next):
    # Resolve tenant DB context per request (fallback: primary DB).
    path = request.url.path or ""
    auth_exempt_prefixes = (
        "/api/auth/login",
        "/api/auth/google",
        "/api/auth/verify-otp",
        "/api/auth/complete-first-login",
        "/api/health",
        "/api/public/",
        "/api/prescan/mobile/",
        "/docs",
        "/openapi.json",
    )
    tenant_exempt_prefixes = (
        "/api/auth/login",
        "/api/auth/google",
        "/api/auth/verify-otp",
        "/api/auth/complete-first-login",
        "/api/platform/",
        "/api/rbac/",
        "/api/orgs/",
        "/api/health",
        "/api/public/",
        "/api/prescan/mobile/",
        "/docs",
        "/openapi.json",
    )
    auth_exempt = any(path.startswith(p) for p in auth_exempt_prefixes)
    if path.startswith("/api") and not auth_exempt and request.method != "OPTIONS":
        token = _read_auth_token(request)
        if not token:
            return JSONResponse({"detail": "Missing bearer token"}, status_code=401)
        try:
            claims = decode_access_token(token, settings.SECRET_KEY)
        except Exception:
            return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)
        auth_user_id = str(claims.get("sub") or "").strip()
        auth_org_id = str(claims.get("organization_id") or "").strip()
        if not auth_user_id:
            return JSONResponse({"detail": "Invalid token payload"}, status_code=401)
        request.state.auth_user_id = auth_user_id
        request.state.auth_role = str(claims.get("role") or "")
        _override_scope_header(request.scope, "x-user-id", auth_user_id)
        if auth_org_id:
            _override_scope_header(request.scope, "x-org-id", auth_org_id)

    should_resolve_tenant = not any(path.startswith(p) for p in tenant_exempt_prefixes)
    tenant_pool = None
    resolved_org_id = (request.headers.get("x-org-id") or "").strip()

    if should_resolve_tenant:
        org_id = resolved_org_id
        user_id = (getattr(request.state, "auth_user_id", None) or "").strip()
        try:
            o = None
            primary = await get_primary_pool()
            async with primary.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    if user_id:
                        # Resolve user's org and fetch org details in one query
                        await cur.execute(
                            """
                            SELECT u.organization_id,
                                   o.is_active, o.subscription_type, o.created_at
                            FROM users u
                            LEFT JOIN organizations o ON o.id = u.organization_id
                            WHERE u.id = %s
                            """,
                            (user_id,),
                        )
                        row = await cur.fetchone() or {}
                        user_org_id = row.get("organization_id") or ""
                        if user_org_id:
                            if org_id and org_id != user_org_id:
                                return JSONResponse({"detail": "Organization context mismatch"}, status_code=403)
                            org_id = user_org_id
                            resolved_org_id = user_org_id
                            o = row  # org columns already fetched
                    if org_id and o is None:
                        # org_id came from header with no user — fetch org directly
                        await cur.execute(
                            "SELECT is_active, subscription_type, created_at FROM organizations WHERE id = %s",
                            (org_id,),
                        )
                        o = await cur.fetchone()

            if org_id:
                if not o or int(o.get("is_active") or 0) != 1:
                    return JSONResponse({"detail": "Organization is inactive. Contact the super admin."}, status_code=403)
                if (o.get("subscription_type") or "free_trial") == "free_trial":
                    org_created = o.get("created_at")
                    if org_created:
                        if not isinstance(org_created, datetime):
                            try:
                                org_created = datetime.fromisoformat(str(org_created))
                            except Exception:
                                org_created = None
                    if org_created:
                        if org_created.tzinfo is None:
                            org_created = org_created.replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) > org_created + timedelta(days=7):
                            return JSONResponse(
                                {"detail": "Your 7-day free trial has expired. Please upgrade your subscription."},
                                status_code=402,
                            )
                tenant_pool = await get_tenant_pool_by_org_id(org_id)
                if tenant_pool is None:
                    return JSONResponse({"detail": "Tenant database is not configured for this organization"}, status_code=503)
                resolved_org_id = org_id
        except Exception as exc:
            logger.error("Tenant context resolution failed; rejecting request. path=%s err=%s", path, exc)
            return JSONResponse({"detail": "Tenant database context unavailable"}, status_code=503)

    try:
        request.state.organization_id = resolved_org_id or None
        set_request_pool(tenant_pool)
        response = await call_next(request)
    finally:
        clear_request_pool()

    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response

# CORS — keep this outermost so early middleware responses still include CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ([] if settings.APP_ENV in {"production", "prod"} else ["*"]),
    allow_credentials=bool(settings.ALLOWED_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register routes ────────────────────────────────────────────

from routes.auth import router as auth_router
from routes.tasks import router as tasks_router
from routes.problems import router as problems_router
from routes.submissions import router as submissions_router
from routes.code_execution import router as code_exec_router
from routes.hints import router as hints_router
from routes.chat import router as chat_router
from routes.messaging import router as messaging_router
from routes.analytics import router as analytics_router
from routes.skill_tests import router as skill_tests_router
from routes.aptitude import router as aptitude_router
from routes.global_tests import router as global_tests_router
from routes.admin import router as admin_router
from routes.communication import router as comm_router
from routes.proctor_agent import router as proctor_agent_router
from routes.behavior_agent import router as behavior_agent_router
from routes.ai import router as ai_router
from routes.environment_scan import router as environment_scan_router
from routes.attachments import router as attachments_router
from routes.rbac import router as rbac_router
from routes.public import router as public_router

app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(problems_router)
app.include_router(submissions_router)
app.include_router(code_exec_router)
app.include_router(hints_router)
app.include_router(chat_router)
app.include_router(messaging_router)
app.include_router(analytics_router)
app.include_router(skill_tests_router)
app.include_router(aptitude_router)
app.include_router(global_tests_router)
app.include_router(admin_router)
app.include_router(comm_router)
app.include_router(proctor_agent_router)
app.include_router(behavior_agent_router)
app.include_router(ai_router)
app.include_router(environment_scan_router)
app.include_router(attachments_router)
app.include_router(rbac_router)
app.include_router(public_router)


# ─── Health check ────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "AI Assessment Hub FastAPI is running"}


# ─── Uploads static files ───────────────────────────────────────

uploads_dir = os.path.join(os.path.dirname(__file__), "uploads", "proctoring")
os.makedirs(uploads_dir, exist_ok=True)
tts_dir = os.path.join(os.path.dirname(__file__), "uploads", "tts")
os.makedirs(tts_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "uploads")), name="uploads")


# ─── Wrap with Socket.io ASGI app ──────────────────────────────

socket_app = socketio.ASGIApp(sio, app)


# ─── Entry-point ─────────────────────────────────────────────────

if __name__ == "__main__": # Trigger reload 2
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:socket_app", host="0.0.0.0", port=port, reload=True)
