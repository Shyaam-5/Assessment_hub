"""
prescan_session_service.py
--------------------------
Session and room-scan lifecycle helpers for environment scan.
Adapted from preScan/backend/services/session_service.py.
"""
from __future__ import annotations

import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')
import secrets
from datetime import datetime, timezone
from typing import Dict, Optional

from services.prescan_db import PrescanDB

logger = logging.getLogger(__name__)


def _utcnow_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _generate_session_token() -> str:
    return secrets.token_hex(32)


async def create_exam_session(db: PrescanDB, candidate_id: str, exam_id: int) -> Dict:
    """Create a new exam session with a unique session token."""
    token = _generate_session_token()
    now_str = _utcnow_str()
    session_id = await db.execute_lastrowid(
        """
        INSERT INTO prescan_exam_sessions (candidate_id, exam_id, session_token, status, created_at, updated_at)
        VALUES (%s, %s, %s, 'pending', %s, %s)
        """,
        (candidate_id, exam_id, token, now_str, now_str),
    )
    session = await db.fetchone("SELECT * FROM prescan_exam_sessions WHERE id = %s", (session_id,))
    return dict(session) if session else {}


async def get_session_by_token(db: PrescanDB, token: str) -> Optional[Dict]:
    row = await db.fetchone(
        "SELECT * FROM prescan_exam_sessions WHERE session_token = %s", (token,)
    )
    return dict(row) if row else None


async def update_session_status(db: PrescanDB, session_id: int, status: str) -> None:
    await db.execute(
        "UPDATE prescan_exam_sessions SET status = %s WHERE id = %s",
        (status, session_id),
    )
    logger.debug("Session %d â†’ '%s'", session_id, status)


async def create_room_scan(db: PrescanDB, exam_session_id: int) -> Dict:
    """Create a new room_scan record and set the session to 'scanning'."""
    now_str = _utcnow_str()
    scan_id = await db.execute_lastrowid(
        """
        INSERT INTO prescan_room_scans (exam_session_id, scan_start_time, total_frames, flagged_frames)
        VALUES (%s, %s, 0, 0)
        """,
        (exam_session_id, now_str),
    )
    await db.execute(
        "UPDATE prescan_exam_sessions SET status = 'scanning' WHERE id = %s",
        (exam_session_id,),
    )
    scan = await db.fetchone("SELECT * FROM prescan_room_scans WHERE id = %s", (scan_id,))
    return dict(scan) if scan else {}


async def get_active_scan(db: PrescanDB, exam_session_id: int) -> Optional[Dict]:
    """Return the most recent room_scan without a final verdict, or None."""
    row = await db.fetchone(
        """
        SELECT * FROM prescan_room_scans
        WHERE exam_session_id = %s AND final_verdict IS NULL
        ORDER BY created_at DESC LIMIT 1
        """,
        (exam_session_id,),
    )
    return dict(row) if row else None

