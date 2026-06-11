"""
environment_scan.py
-------------------
REST API router for the environment scan (preScan) feature.
Adapted from preScan/backend/routers/{sessions,scans,mobile_link}.py.

Auth pattern is JWT-backed via middleware in ``main.py``.
Client-supplied ``userId`` is treated as optional legacy input and is validated
against the authenticated actor to prevent IDOR.
"""
from __future__ import annotations

import json
import logging
from logging_config import LogConfig
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from routes.auth import _has_any_permission

from audit_logger import get_audit_logger, AuditEventType
from config import settings
from services.prescan_db import get_prescan_db
from services.prescan_session_service import (
    create_exam_session,
    create_room_scan,
    get_session_by_token,
)
from services.prescan_token_service import (
    generate_mobile_token,
    validate_mobile_token,
)

logger = LogConfig.get_logger(__name__)
_audit = get_audit_logger()

router = APIRouter(prefix="/api/prescan", tags=["environment_scan"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_dt(value) -> Optional[str]:
    """Convert a datetime (or string) to an ISO-8601 string, or None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value)


def _public_app_base(request: Request) -> str:
    """
    Base URL for the SPA in the browser (QR code, mobile scan page, WebSocket via dev proxy).

    Prefer ``FRONTEND_URL`` when set so links work on a phone while the desktop session
    runs on localhost or a different host. Otherwise use the request Origin, then LAN fallback.
    """
    if settings.FRONTEND_URL:
        return settings.FRONTEND_URL.rstrip("/")
    origin = (request.headers.get("origin") or "").strip()
    if origin:
        return origin.rstrip("/")
    return f"http://{settings.SERVER_LAN_IP}:{settings.PORT}".rstrip("/")


def _serialize_scan(scan: dict) -> dict:
    s = dict(scan)
    for k in ("created_at", "scan_start_time", "scan_end_time"):
        s[k] = _fmt_dt(s.get(k))
    for k in ("angles_covered", "raw_summary"):
        if isinstance(s.get(k), str):
            try:
                s[k] = json.loads(s[k])
            except (json.JSONDecodeError, TypeError):
                pass
    return s


async def _get_user(user_id: str) -> Optional[dict]:
    """Look up a user from the main 'users' table."""
    db = get_prescan_db()
    row = await db.fetchone("SELECT id, role, name, email FROM users WHERE id = %s", (user_id,))
    return dict(row) if row else None


async def _effective_user(request: Request, requested_user_id: str | None = None) -> dict:
    """Resolve actor identity from JWT middleware and block userId spoofing."""
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authenticated user")
    user = await _get_user(actor_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    requested = (requested_user_id or "").strip()
    role = str(user.get("role") or "").strip().lower()
    can_view_proctor = role in {"admin", "organization_admin", "mentor"}
    if not can_view_proctor:
        try:
            can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])
        except RuntimeError:
            can_view_proctor = False
    if requested and requested != actor_id and not can_view_proctor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User mismatch")
    return user


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreateSessionBody(BaseModel):
    exam_id: int
    userId: str  # main backend session userId


class RetryBody(BaseModel):
    userId: str


# ---------------------------------------------------------------------------
# Exams
# ---------------------------------------------------------------------------

@router.get("/exams")
async def list_exams(request: Request, userId: str | None = Query(default=None)):
    """Return all active exams."""
    await _effective_user(request, userId)
    db = get_prescan_db()
    rows = await db.fetchall("SELECT * FROM prescan_exams WHERE is_active = 1 ORDER BY title")
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(body: CreateSessionBody, request: Request):
    """
    Create a new exam session for the candidate identified by userId.
    Automatically creates an initial room_scan and returns a mobile scan URL.
    """
    db = get_prescan_db()

    user = await _effective_user(request, body.userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    # Verify exam exists and is active
    exam = await db.fetchone(
        "SELECT * FROM prescan_exams WHERE id = %s AND is_active = 1", (body.exam_id,)
    )
    if exam is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exam {body.exam_id} not found or not active",
        )

    try:
        session = await create_exam_session(db, actor_id, body.exam_id)
    except Exception as exc:
        logger.error("Failed to create exam session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create exam session",
        )

    session_token = session["session_token"]

    try:
        scan = await create_room_scan(db, session["id"])
    except Exception as exc:
        logger.error("Failed to create room_scan: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialise room scan",
        )

    mobile_token = generate_mobile_token(session_token, settings.PRESCAN_SECRET_KEY)
    frontend_base = _public_app_base(request)
    mobile_url = f"{frontend_base}/scan/mobile?token={mobile_token}"
    websocket_base = _public_app_base(request)

    logger.info(
        "Exam session created: id=%d candidate=%s exam=%d scan=%d",
        session["id"], actor_id, body.exam_id, scan["id"],
    )
    _audit.log_proctor_event(
        event_type=AuditEventType.PROCTOR_SESSION_STARTED,
        student_id=actor_id,
        ip_address=request.client.host if request.client else None,
        session_id=str(session["id"]),
        details={"exam_id": body.exam_id, "room_scan_id": scan["id"]},
    )

    return {
        "id": session["id"],
        "candidate_id": actor_id,
        "exam_id": body.exam_id,
        "session_token": session_token,
        "mobile_token": mobile_token,
        "mobile_url": mobile_url,
        "websocket_url": websocket_base,
        "room_scan_id": scan["id"],
        "status": session.get("status", "scanning"),
        "exam_title": dict(exam).get("title", ""),
        "created_at": _fmt_dt(session.get("created_at")),
    }


@router.get("/sessions")
async def list_sessions(request: Request, userId: str | None = Query(default=None)):
    """List exam sessions for the given user."""
    db = get_prescan_db()

    user = await _effective_user(request, userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])

    # NOTE: TiDB rejects subqueries in JOIN ON clauses ("ON condition doesn't
    # support subqueries yet"), so we pre-aggregate the latest scan per
    # session into a derived table and join against that.
    latest_scan_cte = (
        "(SELECT exam_session_id, MAX(id) AS max_id "
        " FROM prescan_room_scans GROUP BY exam_session_id) latest"
    )
    if can_view_proctor:
        rows = await db.fetchall(
            f"""
            SELECT es.*, u.name AS candidate_name, u.email AS candidate_email,
                   e.title AS exam_title,
                   rs.final_verdict, rs.total_frames
            FROM prescan_exam_sessions es
            JOIN users u ON u.id = es.candidate_id
            JOIN prescan_exams e ON e.id = es.exam_id
            LEFT JOIN {latest_scan_cte}
                ON latest.exam_session_id = es.id
            LEFT JOIN prescan_room_scans rs
                ON rs.id = latest.max_id
            ORDER BY es.created_at DESC
            LIMIT 200
            """
        )
    else:
        rows = await db.fetchall(
            f"""
            SELECT es.*, e.title AS exam_title,
                   rs.final_verdict, rs.total_frames
            FROM prescan_exam_sessions es
            JOIN prescan_exams e ON e.id = es.exam_id
            LEFT JOIN {latest_scan_cte}
                ON latest.exam_session_id = es.id
            LEFT JOIN prescan_room_scans rs
                ON rs.id = latest.max_id
            WHERE es.candidate_id = %s
            ORDER BY es.created_at DESC
            """,
            (actor_id,),
        )

    result = []
    for row in rows:
        r = dict(row)
        for k in ("created_at", "updated_at"):
            r[k] = _fmt_dt(r.get(k))
        result.append(r)
    return result


@router.get("/sessions/{session_id}")
async def get_session(request: Request, session_id: int, userId: str | None = Query(default=None)):
    """Get session status and the latest scan result."""
    db = get_prescan_db()

    user = await _effective_user(request, userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    session = await db.fetchone(
        """
        SELECT es.*, e.title AS exam_title
        FROM prescan_exam_sessions es
        JOIN prescan_exams e ON e.id = es.exam_id
        WHERE es.id = %s
        """,
        (session_id,),
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found")

    can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])
    if not can_view_proctor and str(session["candidate_id"]) != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    scan = await db.fetchone(
        "SELECT * FROM prescan_room_scans WHERE exam_session_id = %s ORDER BY id DESC LIMIT 1",
        (session_id,),
    )

    session_dict = dict(session)
    for k in ("created_at", "updated_at"):
        session_dict[k] = _fmt_dt(session_dict.get(k))

    result = {**session_dict, "latest_scan": None}
    if scan:
        result["latest_scan"] = _serialize_scan(dict(scan))

    return result


# ---------------------------------------------------------------------------
# Scans
# ---------------------------------------------------------------------------

@router.get("/scans/{scan_id}")
async def get_scan(request: Request, scan_id: int, userId: str | None = Query(default=None)):
    """Get scan details including per-angle frame summary."""
    db = get_prescan_db()

    user = await _effective_user(request, userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    scan = await db.fetchone(
        """
        SELECT rs.*, es.candidate_id, es.session_token, es.exam_id,
               e.title AS exam_title
        FROM prescan_room_scans rs
        JOIN prescan_exam_sessions es ON es.id = rs.exam_session_id
        JOIN prescan_exams e ON e.id = es.exam_id
        WHERE rs.id = %s
        """,
        (scan_id,),
    )
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Scan {scan_id} not found")

    can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])
    if not can_view_proctor and str(scan["candidate_id"]) != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    scan_dict = _serialize_scan(dict(scan))

    angle_summary = await db.fetchall(
        """
        SELECT angle_label, COUNT(*) AS total, SUM(is_flagged) AS flagged
        FROM prescan_scan_frames WHERE room_scan_id = %s GROUP BY angle_label
        """,
        (scan_id,),
    )
    scan_dict["angle_summary"] = [dict(r) for r in angle_summary]

    override = await db.fetchone(
        """
        SELECT so.*, u.name AS proctor_name
        FROM prescan_scan_overrides so
        JOIN users u ON u.id = so.proctor_id
        WHERE so.room_scan_id = %s
        """,
        (scan_id,),
    )
    if override:
        o = dict(override)
        o["created_at"] = _fmt_dt(o.get("created_at"))
        scan_dict["override"] = o
    else:
        scan_dict["override"] = None

    return scan_dict


@router.post("/scans/{scan_id}/retry", status_code=status.HTTP_201_CREATED)
async def retry_scan(scan_id: int, body: RetryBody, request: Request):
    """Create a new room_scan for the same session (only if previous was incomplete/rejected)."""
    db = get_prescan_db()

    user = await _effective_user(request, body.userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    old_scan = await db.fetchone(
        """
        SELECT rs.*, es.candidate_id, es.id AS session_id, es.session_token
        FROM prescan_room_scans rs
        JOIN prescan_exam_sessions es ON es.id = rs.exam_session_id
        WHERE rs.id = %s
        """,
        (scan_id,),
    )
    if old_scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Scan {scan_id} not found")

    can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])
    if not can_view_proctor and str(old_scan["candidate_id"]) != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    allowed_verdicts = {"incomplete", "rejected", None}
    if old_scan.get("final_verdict") not in allowed_verdicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot retry a scan with verdict '{old_scan.get('final_verdict')}'. "
                   "Only incomplete or rejected scans may be retried.",
        )

    try:
        new_scan = await create_room_scan(db, old_scan["session_id"])
    except Exception as exc:
        logger.error("Failed to create retry scan: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create new scan")

    logger.info("Scan retry: old_scan=%d new_scan=%d session=%d", scan_id, new_scan["id"], old_scan["session_id"])
    return _serialize_scan(new_scan)


@router.get("/scans/{scan_id}/frames")
async def list_frames(
    request: Request,
    scan_id: int,
    userId: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    flagged_only: bool = Query(False),
):
    """Paginated frame list for proctor review."""
    db = get_prescan_db()

    user = await _effective_user(request, userId)
    actor_id = str(getattr(request.state, "auth_user_id", "")).strip()

    scan = await db.fetchone(
        """
        SELECT rs.id, es.candidate_id
        FROM prescan_room_scans rs
        JOIN prescan_exam_sessions es ON es.id = rs.exam_session_id
        WHERE rs.id = %s
        """,
        (scan_id,),
    )
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Scan {scan_id} not found")

    can_view_proctor = await _has_any_permission(actor_id, ["proctoring.view"])
    if not can_view_proctor and str(scan["candidate_id"]) != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    offset = (page - 1) * page_size
    where_extra = " AND is_flagged = 1" if flagged_only else ""

    total_row = await db.fetchone(
        f"SELECT COUNT(*) AS cnt FROM prescan_scan_frames WHERE room_scan_id = %s{where_extra}",
        (scan_id,),
    )
    frames = await db.fetchall(
        f"""
        SELECT id, frame_index, captured_at, angle_label,
               device_orientation, detections, is_flagged, flag_reasons, processing_ms
        FROM prescan_scan_frames
        WHERE room_scan_id = %s{where_extra}
        ORDER BY frame_index ASC
        LIMIT %s OFFSET %s
        """,
        (scan_id, page_size, offset),
    )

    total = total_row["cnt"] if total_row else 0

    serialised_frames = []
    for frame in frames:
        f = dict(frame)
        f["captured_at"] = _fmt_dt(f.get("captured_at"))
        for k in ("detections", "flag_reasons", "device_orientation"):
            if isinstance(f.get(k), str):
                try:
                    f[k] = json.loads(f[k])
                except (json.JSONDecodeError, TypeError):
                    pass
        serialised_frames.append(f)

    return {
        "scan_id": scan_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "frames": serialised_frames,
    }


# ---------------------------------------------------------------------------
# Mobile link validation (public - no userId required)
# ---------------------------------------------------------------------------

@router.get("/mobile/{token}")
async def validate_mobile_link(token: str, request: Request):
    """
    Validate a mobile scan token and return session configuration.
    Called by the mobile page on load to retrieve scan parameters.
    """
    db = get_prescan_db()

    session_token = validate_mobile_token(token, settings.PRESCAN_SECRET_KEY)
    if session_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mobile scan link is invalid or has expired. Please request a new link.",
        )

    session = await get_session_by_token(db, session_token)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found")

    if session.get("status") in ("approved", "completed"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This exam session has already been completed and approved",
        )

    candidate = await db.fetchone(
        "SELECT id, name, email FROM users WHERE id = %s",
        (session["candidate_id"],),
    )

    if candidate is None:
        candidate = await db.fetchone(
            "SELECT CAST(id AS CHAR) AS id, full_name AS name, email FROM prescan_users WHERE CAST(id AS CHAR) = %s",
            (str(session["candidate_id"]),),
        )

    exam = await db.fetchone(
        "SELECT id, title, description, duration_minutes FROM prescan_exams WHERE id = %s",
        (session["exam_id"],),
    )
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    scan = await db.fetchone(
        """
        SELECT id, scan_start_time, total_frames, final_verdict
        FROM prescan_room_scans
        WHERE exam_session_id = %s
        ORDER BY id DESC LIMIT 1
        """,
        (session["id"],),
    )

    room_scan_id = scan["id"] if scan else None

    # Count how many room_scans already exist for this session (used by frontend to enforce retry limit)
    scan_count_row = await db.fetchone(
        "SELECT COUNT(*) AS cnt FROM prescan_room_scans WHERE exam_session_id = %s",
        (session["id"],),
    )
    scan_count = int(scan_count_row["cnt"]) if scan_count_row else 1

    websocket_base = _public_app_base(request)

    return {
        "session_token": session_token,
        "room_scan_id": room_scan_id,
        "candidate_id": session["candidate_id"],
        "scan_count": scan_count,
        "candidate_name": candidate["name"] if candidate else "Unknown",
        "exam_title": dict(exam).get("title", ""),
        "exam_description": dict(exam).get("description", ""),
        "session_status": session.get("status", "pending"),
        "config": {
            "frame_interval_ms": settings.FRAME_INTERVAL_MS,
            "required_angles": ["front", "left", "back", "right"],
            "min_frames_per_angle": settings.MIN_FRAMES_PER_ANGLE,
            "max_scan_duration_s": settings.MAX_SCAN_DURATION_S,
            "min_total_frames": settings.MIN_TOTAL_FRAMES,
            "min_scan_duration_s": settings.MIN_SCAN_DURATION_S,
        },
        "websocket_url": websocket_base,
    }


