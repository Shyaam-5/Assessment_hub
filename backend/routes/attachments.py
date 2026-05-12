"""Lightweight file uploads for chat attachments (DirectMessaging.jsx)."""

import os
import uuid
import logging

from fastapi import APIRouter, File, Form, UploadFile, Request
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/attachments", tags=["attachments"])
logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()

_MAX_BYTES = 15 * 1024 * 1024  # 15 MiB


@router.post("/upload")
async def upload_message_attachment(
    request: Request,
    file: UploadFile = File(...),
    entityType: str = Form(""),
    entityId: str = Form(""),
    uploadedBy: str = Form(""),
):
    """Store a binary under ``uploads/messages/`` and return a URL under ``/uploads/``.

    Form fields are accepted for client compatibility; they are not validated
    beyond size limits.
    """
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    logger.info("Attachment upload start filename=%s uploadedBy=%s", file.filename, uploadedBy)
    if len(ext) > 12:
        ext = ".bin"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    base_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "messages")
    os.makedirs(base_dir, exist_ok=True)
    dest = os.path.join(base_dir, safe_name)

    total = 0
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_BYTES:
                out.close()
                try:
                    os.remove(dest)
                except OSError:
                    pass
                return {"success": False, "error": "File too large", "data": None}
            out.write(chunk)

    rel = f"/uploads/messages/{safe_name}"
    audit_logger.log_event(
        AuditEventType.RESOURCE_ACCESSED,
        user_id=uploadedBy or request.headers.get("x-user-id", "anonymous"),
        resource_id=safe_name,
        resource_type="attachment",
        action="Message attachment uploaded",
        details={"entityType": entityType, "entityId": entityId, "size_bytes": total},
    )
    return {
        "success": True,
        "data": {"file_url": rel, "entityType": entityType, "entityId": entityId, "uploadedBy": uploadedBy},
    }
