"""
scan_aggregator.py
------------------
Aggregates frame verdicts and computes the final scan verdict.
Adapted from preScan/backend/services/scan_aggregator.py.
"""
from __future__ import annotations

import json
import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings
from services.prescan_db import PrescanDB
from services.groq_vision import FrameVerdict

logger = LogConfig.get_logger(__name__)

MAX_DEVICE_FLAGGED_FRAMES = 1
MAX_BOOK_FLAGGED_FRAMES = 3


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


@dataclass
class FinalVerdict:
    verdict: str  # approved | rejected | incomplete
    reason: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FrameResultPayload:
    room_scan_id: int
    frame_index: int
    captured_at: str
    angle_label: str
    device_orientation: Dict[str, float]
    thumbnail_b64: str
    processing_ms: int = 0


@dataclass
class ScanCompletePayload:
    room_scan_id: int
    total_frames: int
    angles_covered: Dict[str, bool]
    duration_s: float


class ScanAggregator:
    """Aggregates frame verdicts and writes the final scan verdict."""

    async def process_frame(
        self,
        db: PrescanDB,
        room_scan_id: int,
        frame_payload: FrameResultPayload,
        frame_verdict: FrameVerdict,
    ) -> Optional[str]:
        """
        Persist frame to DB, update counters.
        Returns "immediate_rejection:<reason>" if the scan should terminate, else None.
        """
        try:
            captured_at = datetime.fromisoformat(frame_payload.captured_at.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            captured_at = _utcnow()

        detections_json = json.dumps([
            {"class_name": d.class_name, "confidence": d.confidence, "location": d.location}
            for d in frame_verdict.detections
        ])
        flag_reasons_json = json.dumps(frame_verdict.flag_reasons)
        orientation_json = json.dumps(frame_payload.device_orientation)
        is_flagged = 1 if frame_verdict.is_flagged else 0

        try:
            await db.execute_lastrowid(
                """
                INSERT INTO prescan_scan_frames
                  (room_scan_id, frame_index, captured_at, angle_label,
                   device_orientation, detections, is_flagged, flag_reasons, processing_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    room_scan_id,
                    frame_payload.frame_index,
                    captured_at.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                    frame_payload.angle_label,
                    orientation_json,
                    detections_json,
                    is_flagged,
                    flag_reasons_json,
                    frame_payload.processing_ms,
                ),
            )
        except Exception as exc:
            logger.error("Failed to insert scan frame %d: %s", frame_payload.frame_index, exc)
            raise

        # Update running counters
        try:
            if frame_verdict.is_flagged:
                await db.execute(
                    "UPDATE prescan_room_scans SET total_frames = total_frames + 1, flagged_frames = flagged_frames + 1 WHERE id = %s",
                    (room_scan_id,),
                )
            else:
                await db.execute(
                    "UPDATE prescan_room_scans SET total_frames = total_frames + 1 WHERE id = %s",
                    (room_scan_id,),
                )
        except Exception as exc:
            logger.error("Failed to update room_scan counters: %s", exc)

        # Audit log
        try:
            await db.execute(
                """
                INSERT INTO prescan_scan_audit_log (room_scan_id, event_type, actor, payload, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    room_scan_id,
                    "frame_processed",
                    "system",
                    json.dumps({"frame_index": frame_payload.frame_index, "is_flagged": frame_verdict.is_flagged}),
                    _utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                ),
            )
        except Exception as exc:
            logger.warning("Audit log insert failed: %s", exc)

        # Immediate rejection: multiple people
        if frame_verdict.people_count > 1:
            reason = f"Multiple people detected in frame {frame_payload.frame_index} ({frame_verdict.people_count} people)"
            logger.warning("Immediate rejection: %s", reason)
            await self._write_verdict(db, room_scan_id, "rejected", reason)
            return f"immediate_rejection:{reason}"

        return None

    async def compute_final_verdict(
        self,
        db: PrescanDB,
        room_scan_id: int,
        payload: ScanCompletePayload,
    ) -> FinalVerdict:
        scan = await db.fetchone("SELECT * FROM prescan_room_scans WHERE id = %s", (room_scan_id,))
        if scan is None:
            return FinalVerdict(verdict="incomplete", reason="Scan record not found")

        total_frames: int = scan.get("total_frames", 0)
        flagged_frames: int = scan.get("flagged_frames", 0)

        frames = await db.fetchall(
            "SELECT is_flagged, flag_reasons FROM prescan_scan_frames WHERE room_scan_id = %s",
            (room_scan_id,),
        )

        # Duration
        duration_s = payload.duration_s
        if duration_s == 0 and scan.get("scan_start_time"):
            start = scan["scan_start_time"]
            if isinstance(start, str):
                try:
                    start = datetime.fromisoformat(start)
                except ValueError:
                    start = _utcnow()
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            duration_s = (datetime.now(tz=timezone.utc) - start).total_seconds()

        angles_covered: Dict[str, bool] = payload.angles_covered or {}
        covered_count = sum(1 for v in angles_covered.values() if v)

        device_flagged_count = 0
        book_flagged_count = 0
        multiple_people_count = 0

        for frame in frames:
            try:
                reasons = (
                    json.loads(frame["flag_reasons"])
                    if isinstance(frame["flag_reasons"], str)
                    else (frame["flag_reasons"] or [])
                )
            except (json.JSONDecodeError, TypeError):
                reasons = []
            for reason in reasons:
                r = reason.lower()
                if "unauthorized_device" in r or "cell phone" in r:
                    device_flagged_count += 1
                if "study_material" in r or "book" in r:
                    book_flagged_count += 1
                if "multiple_people" in r:
                    multiple_people_count += 1

        details: Dict[str, Any] = {
            "total_frames": total_frames,
            "flagged_frames": flagged_frames,
            "angles_covered": angles_covered,
            "covered_count": covered_count,
            "duration_s": round(duration_s, 1),
            "device_flagged_frames": device_flagged_count,
            "book_flagged_frames": book_flagged_count,
            "multiple_people_frames": multiple_people_count,
        }

        # Decision logic
        if multiple_people_count > 0:
            verdict, reason = "rejected", f"Multiple people detected in {multiple_people_count} frame(s)"
        elif device_flagged_count > MAX_DEVICE_FLAGGED_FRAMES:
            verdict, reason = "rejected", f"Unauthorized device detected in {device_flagged_count} frames"
        elif book_flagged_count > MAX_BOOK_FLAGGED_FRAMES:
            verdict, reason = "rejected", f"Study materials detected in {book_flagged_count} frames"
        elif covered_count < 4:
            uncovered = [a for a, v in angles_covered.items() if not v]
            verdict, reason = "incomplete", f"Not all angles covered. Missing: {', '.join(uncovered) if uncovered else 'unknown'}"
        elif total_frames < settings.MIN_TOTAL_FRAMES:
            verdict, reason = "incomplete", f"Insufficient frames ({total_frames} < {settings.MIN_TOTAL_FRAMES} required)"
        elif duration_s < settings.MIN_SCAN_DURATION_S:
            verdict, reason = "incomplete", f"Scan too short ({duration_s:.0f}s < {settings.MIN_SCAN_DURATION_S}s required)"
        else:
            verdict, reason = "approved", "Room scan passed all checks"

        await self._write_verdict(db, room_scan_id, verdict, reason, angles_covered)
        return FinalVerdict(verdict=verdict, reason=reason, details=details)

    async def _write_verdict(
        self,
        db: PrescanDB,
        room_scan_id: int,
        verdict: str,
        reason: str,
        angles_covered: Any = None,
    ) -> None:
        now_str = _utcnow().strftime("%Y-%m-%d %H:%M:%S")
        angles_json = json.dumps(angles_covered) if angles_covered is not None else None
        try:
            if angles_json:
                await db.execute(
                    "UPDATE prescan_room_scans SET final_verdict=%s, verdict_reason=%s, scan_end_time=%s, angles_covered=%s WHERE id=%s",
                    (verdict, reason, now_str, angles_json, room_scan_id),
                )
            else:
                await db.execute(
                    "UPDATE prescan_room_scans SET final_verdict=%s, verdict_reason=%s, scan_end_time=%s WHERE id=%s",
                    (verdict, reason, now_str, room_scan_id),
                )
        except Exception as exc:
            logger.error("Failed to write verdict for scan %d: %s", room_scan_id, exc)
            raise

        try:
            await db.execute(
                """
                INSERT INTO prescan_scan_audit_log (room_scan_id, event_type, actor, payload, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    room_scan_id,
                    "verdict_issued",
                    "system",
                    json.dumps({"verdict": verdict, "reason": reason}),
                    _utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                ),
            )
        except Exception as exc:
            logger.warning("Audit log for verdict failed: %s", exc)


# Module-level singleton
scan_aggregator = ScanAggregator()

