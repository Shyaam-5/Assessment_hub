"""Direct messaging routes."""

import uuid
import logging
from logging_config import LogConfig
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel, Field
from database import get_pool
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["messaging"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


async def _log_read_access(request: Request):
    if request.method == "GET":
        audit_logger.log_data_access(
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_type="messaging_read",
            query_params={"path": request.url.path, "query": request.url.query},
        )


router.dependencies.append(Depends(_log_read_access))


class MessageSend(BaseModel):
    """Payload for POST /api/messages.

    The frontend (DirectMessaging.jsx) sends `message`. We also accept
    `content` as an alias for older callers, and forward `fileUrl` /
    `messageType` to match the actual `direct_messages` schema.
    """
    senderId: str
    receiverId: str
    message: str | None = None
    content: str | None = None  # legacy alias
    messageType: str = Field(default="text")
    fileUrl: str | None = None

    @property
    def text(self) -> str:
        return (self.message if self.message is not None else self.content) or ""


@router.get("/messages/{user_id}")
async def get_conversations(user_id: str):
    """Get all unique conversations for a user."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT DISTINCT
                    CASE WHEN sender_id = %s THEN receiver_id ELSE sender_id END AS other_user_id
                FROM direct_messages
                WHERE sender_id = %s OR receiver_id = %s
                """,
                (user_id, user_id, user_id),
            )
            conversations = await cur.fetchall()

            result = []
            for c in conversations:
                other_id = c["other_user_id"]
                await cur.execute("SELECT id, name, email, role FROM users WHERE id = %s", (other_id,))
                user = await cur.fetchone()

                await cur.execute(
                    """SELECT * FROM direct_messages
                       WHERE (sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s)
                       ORDER BY created_at DESC LIMIT 1""",
                    (user_id, other_id, other_id, user_id),
                )
                last_msg = await cur.fetchone()

                await cur.execute(
                    "SELECT COUNT(*) AS cnt FROM direct_messages WHERE sender_id = %s AND receiver_id = %s AND is_read = 0",
                    (other_id, user_id),
                )
                unread = (await cur.fetchone())["cnt"]

                result.append({
                    "userId": other_id,
                    "id": other_id,
                    "other_user_id": other_id,
                    "name": user["name"] if user else "Unknown",
                    "role": user["role"] if user else "",
                    "lastMessage": last_msg["message"] if last_msg else "",
                    "last_message": last_msg["message"] if last_msg else "",
                    "lastMessageAt": str(last_msg["created_at"]) if last_msg else "",
                    "last_message_time": str(last_msg["created_at"]) if last_msg else "",
                    "last_message_at": str(last_msg["created_at"]) if last_msg else "",
                    "unreadCount": unread,
                    "unread_count": unread,
                })

    return result


@router.get("/messages/{user_id}/{other_user_id}")
async def get_messages(user_id: str, other_user_id: str):
    """Get messages between two users."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Mark messages as read
            await cur.execute(
                "UPDATE direct_messages SET is_read = 1 WHERE sender_id = %s AND receiver_id = %s AND is_read = 0",
                (other_user_id, user_id),
            )

            await cur.execute(
                """SELECT dm.*, u.name AS sender_name FROM direct_messages dm
                   JOIN users u ON dm.sender_id = u.id
                   WHERE (dm.sender_id = %s AND dm.receiver_id = %s) OR (dm.sender_id = %s AND dm.receiver_id = %s)
                   ORDER BY dm.created_at ASC LIMIT 100""",
                (user_id, other_user_id, other_user_id, user_id),
            )
            rows = await cur.fetchall()

    return [
        {
            "id": m["id"],
            "senderId": m["sender_id"],
            "senderName": m["sender_name"],
            "receiverId": m["receiver_id"],
            # Frontend reads msg.message; we also expose `content` for
            # any legacy callers.
            "message": m["message"],
            "content": m["message"],
            "messageType": m.get("message_type") or "text",
            "fileUrl": m.get("file_url"),
            "isRead": bool(m["is_read"]),
            "createdAt": str(m["created_at"]),
        }
        for m in rows
    ]


@router.post("/messages")
async def send_message(body: MessageSend, request: Request):
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO direct_messages "
                "(id, sender_id, receiver_id, message, message_type, file_url, is_read, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,0,%s)",
                (
                    msg_id,
                    body.senderId,
                    body.receiverId,
                    body.text,
                    body.messageType or "text",
                    body.fileUrl,
                    now,
                ),
            )
        await conn.commit()

    logger.info("Direct message sent from=%s to=%s", body.senderId, body.receiverId)
    audit_logger.log_event(
        AuditEventType.RESOURCE_ACCESSED,
        user_id=body.senderId,
        ip_address=_client_ip(request),
        resource_id=msg_id,
        resource_type="direct_message",
        action="Direct message sent",
        details={"receiverId": body.receiverId, "messageType": body.messageType or "text"},
    )
    return {
        "id": msg_id,
        "senderId": body.senderId,
        "receiverId": body.receiverId,
        "message": body.text,
        "content": body.text,
        "messageType": body.messageType or "text",
        "fileUrl": body.fileUrl,
        "createdAt": str(now),
    }

