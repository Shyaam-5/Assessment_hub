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
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database import (
    init_db,
    close_db,
    create_prescan_tables,
    ensure_auth_login_schema,
    ensure_rbac_schema,
    ensure_default_super_admins,
    get_pool,
    get_primary_pool,
    get_tenant_pool_by_org_id,
    set_request_pool,
    clear_request_pool,
)
from logging_config import setup_logging
from logging_middleware import LoggingMiddleware, SecurityHeadersMiddleware
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

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
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
    user_id = data.get("userId")
    role = data.get("role")
    mentor_id = data.get("mentorId")
    if role == "admin":
        await sio.enter_room(sid, "admin_room")
    elif role == "mentor" and mentor_id:
        await sio.enter_room(sid, f"mentor_{mentor_id}")
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
    student_id = data.get("studentId")
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
    mentor_id = data.get("mentorId")
    await sio.emit("live_update", {**data, "type": "submission_started"}, room="admin_room")
    if mentor_id:
        await sio.emit("live_update", {**data, "type": "submission_started"}, room=f"mentor_{mentor_id}")
    audit_logger.log_socket_event("submission_started", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def submission_completed(sid, data):
    mentor_id = data.get("mentorId")
    await sio.emit("live_update", {**data, "type": "submission_completed"}, room="admin_room")
    if mentor_id:
        await sio.emit("live_update", {**data, "type": "submission_completed"}, room=f"mentor_{mentor_id}")
    audit_logger.log_socket_event("submission_completed", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def proctoring_violation(sid, data):
    mentor_id = data.get("mentorId")
    await sio.emit("live_alert", {**data, "type": "proctoring_violation"}, room="admin_room")
    if mentor_id:
        await sio.emit("live_alert", {**data, "type": "proctoring_violation"}, room=f"mentor_{mentor_id}")
    audit_logger.log_socket_event("proctoring_violation", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def progress_update(sid, data):
    mentor_id = data.get("mentorId")
    await sio.emit("live_update", {**data, "type": "progress_update"}, room="admin_room")
    if mentor_id:
        await sio.emit("live_update", {**data, "type": "progress_update"}, room=f"mentor_{mentor_id}")
    audit_logger.log_socket_event("progress_update", sid, user_id=data.get("studentId"), payload=data)


@sio.event
async def test_failed(sid, data):
    mentor_id = data.get("mentorId")
    await sio.emit("live_alert", {**data, "type": "test_failed"}, room="admin_room")
    if mentor_id:
        await sio.emit("live_alert", {**data, "type": "test_failed"}, room=f"mentor_{mentor_id}")
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
    await ensure_default_super_admins()
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
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(LoggingMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(getattr(request, "state", object()), "request_id", None)
    logger.exception("Unhandled exception on %s %s | request_id=%s", request.method, request.url.path, req_id)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "requestId": req_id,
        },
    )

# CORS — use explicit origins when configured, fall back to "*" for local dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["*"],
    allow_credentials=bool(settings.ALLOWED_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_corp_header(request, call_next):
    # Resolve tenant DB context per request (fallback: primary DB).
    path = request.url.path or ""
    tenant_exempt_prefixes = (
        "/api/auth/login",
        "/api/auth/google",
        "/api/auth/verify-otp",
        "/api/auth/complete-first-login",
        "/api/platform/",
        "/api/rbac/",
        "/api/orgs/",
        "/docs",
        "/openapi.json",
    )
    should_resolve_tenant = not any(path.startswith(p) for p in tenant_exempt_prefixes)
    tenant_pool = None

    if should_resolve_tenant:
        org_id = (request.headers.get("x-org-id") or "").strip()
        user_id = (request.headers.get("x-user-id") or "").strip()
        try:
            user_org_id = ""
            if user_id:
                primary = await get_primary_pool()
                async with primary.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("SELECT organization_id FROM users WHERE id = %s", (user_id,))
                        u = await cur.fetchone()
                        user_org_id = (u or {}).get("organization_id") or ""
                if user_org_id:
                    if org_id and org_id != user_org_id:
                        from fastapi.responses import JSONResponse
                        return JSONResponse({"detail": "Organization context mismatch"}, status_code=403)
                    org_id = user_org_id

            if org_id:
                primary = await get_primary_pool()
                async with primary.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("SELECT is_active FROM organizations WHERE id = %s", (org_id,))
                        o = await cur.fetchone()
                if not o or int(o.get("is_active") or 0) != 1:
                    from fastapi.responses import JSONResponse
                    return JSONResponse({"detail": "Organization is inactive. Contact the super admin."}, status_code=403)
                tenant_pool = await get_tenant_pool_by_org_id(org_id)
        except Exception as exc:
            logger.warning("Tenant context resolution failed; using primary DB. path=%s err=%s", path, exc)

    try:
        set_request_pool(tenant_pool)
        response = await call_next(request)
    finally:
        clear_request_pool()

    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response

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
