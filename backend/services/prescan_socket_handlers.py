"""
prescan_socket_handlers.py
--------------------------
Registers environment-scan Socket.IO event handlers on the main sio instance.
Call register_prescan_socket_handlers(sio) once during startup.
"""
from __future__ import annotations

import json
import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)
from datetime import datetime, timezone
from typing import Dict, Optional

from services.prescan_socket_manager import PrescanSocketIOManager
from services.prescan_db import get_prescan_db
from services.groq_vision import groq_service
from services.scan_aggregator import scan_aggregator, FrameResultPayload, ScanCompletePayload
from services.angle_tracker import AngleTracker
from services.prescan_session_service import (
    create_room_scan,
    get_active_scan,
    get_session_by_token,
    update_session_status,
)

logger = LogConfig.get_logger(__name__)

# Module-level state
_prescan_manager: Optional[PrescanSocketIOManager] = None
_angle_trackers: Dict[int, AngleTracker] = {}


def get_prescan_manager() -> Optional[PrescanSocketIOManager]:
    return _prescan_manager


def get_prescan_disconnect_handler():
    """Return the prescan disconnect cleanup coroutine (or None if not initialized)."""
    if _prescan_manager is None:
        return None
    return _handle_prescan_disconnect


async def _handle_prescan_disconnect(sid: str) -> None:
    """Called by main disconnect handler for prescan cleanup."""
    if _prescan_manager is None:
        return
    meta = _prescan_manager.get_sid_meta(sid)
    if meta is None:
        return
    session_token = meta.get("session_token", "")
    role = meta.get("role", "unknown")
    if role == "mobile" and session_token:
        # Clean up angle tracker for this scan to prevent memory leak
        room_scan_id = meta.get("room_scan_id")
        if room_scan_id is not None:
            _angle_trackers.pop(room_scan_id, None)
        try:
            await _prescan_manager.emit_to_desktop(
                session_token,
                "mobile_disconnected",
                {"session_token": session_token, "message": "Mobile device disconnected"},
            )
        except Exception as exc:
            logger.error("Error notifying desktop of mobile disconnect: %s", exc)
    await _prescan_manager.leave_session(sid)


def _utcnow_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_or_create_tracker(room_scan_id: int) -> AngleTracker:
    if room_scan_id not in _angle_trackers:
        _angle_trackers[room_scan_id] = AngleTracker()
    return _angle_trackers[room_scan_id]


def register_prescan_socket_handlers(sio) -> PrescanSocketIOManager:
    """Register all environment-scan socket event handlers. Returns the manager."""
    global _prescan_manager
    _prescan_manager = PrescanSocketIOManager(sio)
    manager = _prescan_manager

    # â"€â"€ join_scan_session â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("join_scan_session")
    async def handle_join_session(sid: str, data: dict) -> None:
        session_token = data.get("session_token")
        role = data.get("role", "desktop")
        device_info = data.get("device_info", {})

        if not session_token:
            await sio.emit("scan_error", {"error": "session_token required"}, to=sid)
            return

        db = get_prescan_db()
        session = await get_session_by_token(db, session_token)
        if session is None:
            await sio.emit("scan_error", {"error": "Session not found or invalid token"}, to=sid)
            return

        room_scan_id = None

        if role == "mobile":
            try:
                existing = await get_active_scan(db, session["id"])
                if existing:
                    scan = existing
                else:
                    scan = await create_room_scan(db, session["id"])
                room_scan_id = scan["id"]
                _get_or_create_tracker(room_scan_id)
            except Exception as exc:
                logger.error("Failed to initialise room_scan: %s", exc)
                await sio.emit("scan_error", {"error": "Failed to initialise scan session"}, to=sid)
                return

        joined = await manager.join_session(sid, session_token, role, room_scan_id)
        if not joined:
            return

        await sio.emit(
            "session_joined",
            {
                "session_token": session_token,
                "role": role,
                "room_scan_id": room_scan_id,
                "session_id": session["id"],
                "status": session.get("status", "pending"),
                "joined_at": _utcnow_str(),
            },
            to=sid,
        )

        if role == "mobile":
            await manager.emit_to_desktop(
                session_token,
                "mobile_connected",
                {
                    "session_token": session_token,
                    "room_scan_id": room_scan_id,
                    "device_info": device_info,
                    "connected_at": _utcnow_str(),
                },
            )

    # â"€â"€ frame_result â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("frame_result")
    async def handle_frame_result(sid: str, data: dict) -> None:
        meta = manager.get_sid_meta(sid)
        if meta is None or meta.get("role") != "mobile":
            await sio.emit("scan_error", {"error": "Only mobile clients can send frames"}, to=sid)
            return

        try:
            payload = FrameResultPayload(
                room_scan_id=int(data["room_scan_id"]),
                frame_index=int(data["frame_index"]),
                captured_at=str(data.get("captured_at", _utcnow_str())),
                angle_label=str(data.get("angle_label", "front")),
                device_orientation=data.get("device_orientation", {"alpha": 0, "beta": 0, "gamma": 0}),
                thumbnail_b64=str(data.get("thumbnail_b64", "")),
                processing_ms=int(data.get("processing_ms", 0)),
            )
        except Exception as exc:
            await sio.emit("scan_error", {"error": f"Invalid frame payload: {exc}"}, to=sid)
            return

        session_token = meta["session_token"]
        room_scan_id = meta.get("room_scan_id")

        if room_scan_id is None or room_scan_id != payload.room_scan_id:
            await sio.emit("scan_error", {"error": "room_scan_id mismatch"}, to=sid)
            return

        db = get_prescan_db()

        # Analyze frame
        try:
            verdict = await groq_service.analyze_frame(payload.thumbnail_b64, payload.frame_index)
        except Exception as exc:
            logger.error("Groq analysis error: %s", exc)
            await sio.emit("scan_error", {"error": "Frame analysis failed"}, to=sid)
            return

        # Persist and aggregate
        try:
            immediate_result = await scan_aggregator.process_frame(db, room_scan_id, payload, verdict)
        except Exception as exc:
            logger.error("Aggregator error: %s", exc)
            await sio.emit("scan_error", {"error": "Frame processing error"}, to=sid)
            return

        # ACK to mobile
        await sio.emit(
            "frame_ack",
            {
                "frame_index": payload.frame_index,
                "is_flagged": verdict.is_flagged,
                "flag_reasons": verdict.flag_reasons,
                "received_at": _utcnow_str(),
            },
            to=sid,
        )

        # Notify desktop on flagged or every 3rd frame
        if (payload.frame_index % 3 == 0) or verdict.is_flagged:
            progress_data = {
                "room_scan_id": room_scan_id,
                "frame_index": payload.frame_index,
                "angle_label": payload.angle_label,
                "is_flagged": verdict.is_flagged,
                "flag_reasons": verdict.flag_reasons,
                "people_count": verdict.people_count,
                "detections": [{"class_name": d.class_name, "confidence": d.confidence, "location": d.location} for d in verdict.detections],
                "timestamp": _utcnow_str(),
            }
            if verdict.is_flagged:
                progress_data["thumbnail_b64"] = payload.thumbnail_b64
            await manager.emit_to_desktop(session_token, "scan_progress_update", progress_data)

        # Handle immediate rejection
        if immediate_result and immediate_result.startswith("immediate_rejection:"):
            reason = immediate_result.split(":", 1)[1]
            verdict_data = {
                "room_scan_id": room_scan_id,
                "verdict": "rejected",
                "reason": reason,
                "details": {},
                "issued_at": _utcnow_str(),
                "is_immediate": True,
            }
            await manager.emit_to_all(session_token, "verdict_issued", verdict_data)
            try:
                session = await get_session_by_token(db, session_token)
                if session:
                    await update_session_status(db, session["id"], "rejected")
            except Exception as exc:
                logger.error("Failed to update session after rejection: %s", exc)
            _angle_trackers.pop(room_scan_id, None)

    # â"€â"€ angle_update â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("angle_update")
    async def handle_angle_update(sid: str, data: dict) -> None:
        meta = manager.get_sid_meta(sid)
        if meta is None or meta.get("role") != "mobile":
            return

        room_scan_id = data.get("room_scan_id")
        device_orientation = data.get("device_orientation", {"alpha": 0, "beta": 0, "gamma": 0})

        if room_scan_id is None:
            return

        tracker = _get_or_create_tracker(int(room_scan_id))
        current_angle = tracker.update(device_orientation)

        coverage_data = {
            "room_scan_id": room_scan_id,
            "current_angle": current_angle,
            "angles_covered": tracker.covered,
            "dwell_counts": tracker.dwell_counts,
            "coverage_percent": tracker.coverage_percent(),
            "all_covered": tracker.all_covered(),
            "timestamp": _utcnow_str(),
        }
        await manager.emit_to_desktop(meta["session_token"], "angle_coverage_update", coverage_data)

    # â"€â"€ scan_complete â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("scan_complete")
    async def handle_scan_complete(sid: str, data: dict) -> None:
        meta = manager.get_sid_meta(sid)
        if meta is None or meta.get("role") != "mobile":
            await sio.emit("scan_error", {"error": "Only mobile clients can complete a scan"}, to=sid)
            return

        try:
            payload = ScanCompletePayload(
                room_scan_id=int(data["room_scan_id"]),
                total_frames=int(data.get("total_frames", 0)),
                angles_covered=data.get("angles_covered", {}),
                duration_s=float(data.get("duration_s", 0)),
            )
        except Exception as exc:
            await sio.emit("scan_error", {"error": f"Invalid scan_complete payload: {exc}"}, to=sid)
            return

        session_token = meta["session_token"]
        room_scan_id = payload.room_scan_id
        meta_room_scan_id = meta.get("room_scan_id")

        if meta_room_scan_id is None or meta_room_scan_id != room_scan_id:
            await sio.emit("scan_error", {"error": "room_scan_id mismatch"}, to=sid)
            return

        # Use tracker's coverage (authoritative)
        tracker = _angle_trackers.get(room_scan_id)
        if tracker:
            payload.angles_covered = dict(tracker.covered)

        db = get_prescan_db()
        try:
            final_verdict = await scan_aggregator.compute_final_verdict(db, room_scan_id, payload)
        except Exception as exc:
            logger.error("compute_final_verdict error: %s", exc)
            await sio.emit("scan_error", {"error": "Failed to compute final verdict"}, to=sid)
            return

        try:
            session = await get_session_by_token(db, session_token)
            if session:
                await update_session_status(db, session["id"], final_verdict.verdict)
        except Exception as exc:
            logger.error("Failed to update session status: %s", exc)

        verdict_data = {
            "room_scan_id": room_scan_id,
            "verdict": final_verdict.verdict,
            "reason": final_verdict.reason,
            "details": final_verdict.details,
            "issued_at": _utcnow_str(),
            "is_immediate": False,
        }
        await manager.emit_to_all(session_token, "verdict_issued", verdict_data)
        _angle_trackers.pop(room_scan_id, None)
        logger.info("Scan %d completed: %s - %s", room_scan_id, final_verdict.verdict, final_verdict.reason)

    # â"€â"€ request_scan_status â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("request_scan_status")
    async def handle_request_status(sid: str, data: dict) -> None:
        meta = manager.get_sid_meta(sid)
        if meta is None:
            return

        session_token = meta.get("session_token", "")
        db = get_prescan_db()

        try:
            session = await db.fetchone(
                "SELECT * FROM prescan_exam_sessions WHERE session_token = %s", (session_token,)
            )
            if session is None:
                return

            scan = await db.fetchone(
                """
                SELECT * FROM prescan_room_scans
                WHERE exam_session_id = %s ORDER BY created_at DESC LIMIT 1
                """,
                (session["id"],),
            )

            response: dict = {
                "session_token": session_token,
                "session_status": session.get("status"),
                "scan": None,
                "mobile_connected": manager.is_mobile_connected(session_token),
                "timestamp": _utcnow_str(),
            }

            if scan:
                angles_covered = scan.get("angles_covered")
                if isinstance(angles_covered, str):
                    try:
                        angles_covered = json.loads(angles_covered)
                    except json.JSONDecodeError:
                        angles_covered = {}

                response["scan"] = {
                    "id": scan["id"],
                    "total_frames": scan.get("total_frames", 0),
                    "flagged_frames": scan.get("flagged_frames", 0),
                    "final_verdict": scan.get("final_verdict"),
                    "verdict_reason": scan.get("verdict_reason"),
                    "angles_covered": angles_covered,
                }

            await sio.emit("scan_status_response", response, to=sid)
        except Exception as exc:
            logger.error("handle_request_status error: %s", exc)

    # â"€â"€ proctor_override â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    @sio.on("proctor_override")
    async def handle_proctor_override(sid: str, data: dict) -> None:
        """Allow admin/mentor to override a scan verdict. Uses main backend users table."""
        user_id = data.get("user_id")
        room_scan_id = data.get("room_scan_id")
        override_verdict = data.get("override_verdict")
        reason = data.get("reason", "Manual proctor override")

        if not all([user_id, room_scan_id, override_verdict]):
            await sio.emit("scan_error", {"error": "user_id, room_scan_id, and override_verdict are required"}, to=sid)
            return

        if override_verdict not in ("approved", "rejected"):
            await sio.emit("scan_error", {"error": "override_verdict must be 'approved' or 'rejected'"}, to=sid)
            return

        # Validate user in main backend's users table
        from database import get_pool
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT id, name, role FROM users WHERE id = %s", (user_id,))
                    user = await cur.fetchone()
        except Exception as exc:
            logger.error("Failed to fetch user for override: %s", exc)
            await sio.emit("scan_error", {"error": "Database error"}, to=sid)
            return

        if user is None or user.get("role") not in ("admin", "mentor"):
            await sio.emit("scan_error", {"error": "Access denied: admin or mentor role required"}, to=sid)
            return

        db = get_prescan_db()
        scan = await db.fetchone(
            """
            SELECT rs.*, es.session_token, es.id AS session_id
            FROM prescan_room_scans rs
            JOIN prescan_exam_sessions es ON es.id = rs.exam_session_id
            WHERE rs.id = %s
            """,
            (room_scan_id,),
        )

        if scan is None:
            await sio.emit("scan_error", {"error": f"Scan {room_scan_id} not found"}, to=sid)
            return

        original_verdict = scan.get("final_verdict") or "unknown"
        session_token = scan["session_token"]
        session_id = scan["session_id"]
        now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        # Write override
        try:
            await db.execute_lastrowid(
                """
                INSERT INTO prescan_scan_overrides
                  (room_scan_id, proctor_id, original_verdict, override_verdict, reason, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  proctor_id=VALUES(proctor_id),
                  original_verdict=VALUES(original_verdict),
                  override_verdict=VALUES(override_verdict),
                  reason=VALUES(reason),
                  created_at=VALUES(created_at)
                """,
                (room_scan_id, user["id"], original_verdict, override_verdict, reason, now_str),
            )
        except Exception as exc:
            logger.error("Failed to write scan_override: %s", exc)
            await sio.emit("scan_error", {"error": "Database error writing override"}, to=sid)
            return

        await db.execute(
            "UPDATE prescan_room_scans SET final_verdict=%s, verdict_reason=%s WHERE id=%s",
            (override_verdict, f"[PROCTOR OVERRIDE by {user['name']}] {reason}", room_scan_id),
        )
        await db.execute(
            "UPDATE prescan_exam_sessions SET status=%s WHERE id=%s",
            (override_verdict, session_id),
        )

        override_data = {
            "room_scan_id": room_scan_id,
            "original_verdict": original_verdict,
            "override_verdict": override_verdict,
            "reason": reason,
            "overridden_by": user["name"],
            "overridden_at": _utcnow_str(),
        }
        await manager.emit_to_desktop(session_token, "verdict_overridden", override_data)
        logger.info("Proctor %s overrode scan %d: %s â†’ %s", user["id"], room_scan_id, original_verdict, override_verdict)

    logger.info("[OK] Prescan socket handlers registered.")
    return manager

