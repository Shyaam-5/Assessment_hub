"""
prescan_socket_manager.py
-------------------------
Socket.IO room manager for environment scan sessions.
Adapted from preScan/backend/websocket/manager.py.
"""
from __future__ import annotations

import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class PrescanSocketIOManager:
    """
    Manages Socket.IO rooms for environment scan sessions.
    Rooms are named "scan:<session_token>".
    """

    def __init__(self, sio) -> None:
        self.sio = sio
        self.session_rooms: Dict[str, Set[str]] = {}
        self.sid_meta: Dict[str, dict] = {}

    async def join_session(
        self,
        sid: str,
        session_token: str,
        role: str,
        room_scan_id: Optional[int] = None,
    ) -> bool:
        room_name = f"scan:{session_token}"
        try:
            await self.sio.enter_room(sid, room_name)
        except KeyError:
            logger.info("Stale sid=%s for session=%s role=%s â€” skipping join", sid, session_token, role)
            return False

        if session_token not in self.session_rooms:
            self.session_rooms[session_token] = set()
        self.session_rooms[session_token].add(sid)

        self.sid_meta[sid] = {
            "role": role,
            "session_token": session_token,
            "room_scan_id": room_scan_id,
            "room_name": room_name,
        }
        logger.info("SID %s joined scan session %s as %s (scan=%s)", sid, session_token, role, room_scan_id)
        return True

    async def leave_session(self, sid: str) -> None:
        meta = self.sid_meta.pop(sid, None)
        if meta is None:
            return
        session_token = meta["session_token"]
        room_name = meta["room_name"]
        try:
            await self.sio.leave_room(sid, room_name)
        except Exception:
            pass
        sids = self.session_rooms.get(session_token)
        if sids:
            sids.discard(sid)
            if not sids:
                del self.session_rooms[session_token]

    async def emit_to_desktop(self, session_token: str, event: str, data: dict) -> None:
        for desk_sid in self.get_desktop_sids(session_token):
            await self.sio.emit(event, data, to=desk_sid)

    async def emit_to_mobile(self, session_token: str, event: str, data: dict) -> None:
        mobile_sid = self.get_mobile_sid(session_token)
        if mobile_sid:
            await self.sio.emit(event, data, to=mobile_sid)

    async def emit_to_all(self, session_token: str, event: str, data: dict) -> None:
        await self.sio.emit(event, data, room=f"scan:{session_token}")

    def get_mobile_sid(self, session_token: str) -> Optional[str]:
        for sid, meta in self.sid_meta.items():
            if meta["session_token"] == session_token and meta["role"] == "mobile":
                return sid
        return None

    def get_desktop_sids(self, session_token: str) -> List[str]:
        return [
            sid for sid, meta in self.sid_meta.items()
            if meta["session_token"] == session_token and meta["role"] in ("desktop", "proctor")
        ]

    def is_mobile_connected(self, session_token: str) -> bool:
        return self.get_mobile_sid(session_token) is not None

    def get_sid_meta(self, sid: str) -> Optional[dict]:
        return self.sid_meta.get(sid)

    def update_room_scan_id(self, sid: str, room_scan_id: int) -> None:
        if sid in self.sid_meta:
            self.sid_meta[sid]["room_scan_id"] = room_scan_id

