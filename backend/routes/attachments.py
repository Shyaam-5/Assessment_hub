"""Lightweight file uploads for chat attachments (DirectMessaging.jsx)."""

import os
import uuid
import logging
from logging_config import LogConfig

from fastapi import APIRouter, File, Form, UploadFile, Request, HTTPException
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/attachments", tags=["attachments"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()

_MAX_BYTES = 15 * 1024 * 1024  # 15 MiB
_ALLOWED_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".pdf", ".txt", ".md", ".csv",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".rar", ".7z",
}
_ALLOWED_MIME_PREFIXES = ("image/", "text/")
_ALLOWED_MIMES = {
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
}


def _is_allowed_signature(ext: str, chunk: bytes) -> bool:
    head = chunk[:16]
    if ext in {".png"}:
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in {".jpg", ".jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if ext in {".gif"}:
        return head.startswith(b"GIF87a") or head.startswith(b"GIF89a")
    if ext in {".webp"}:
        return head.startswith(b"RIFF") and b"WEBP" in chunk[:32]
    if ext in {".pdf"}:
        return head.startswith(b"%PDF-")
    if ext in {".zip", ".docx", ".xlsx", ".pptx"}:
        return head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08")
    if ext in {".rar"}:
        return head.startswith(b"Rar!\x1a\x07")
    if ext in {".7z"}:
        return head.startswith(b"7z\xbc\xaf\x27\x1c")
    if ext in {".txt", ".md", ".csv"}:
        try:
            chunk.decode("utf-8")
            return True
        except UnicodeDecodeError:
            return False
    if ext in {".doc", ".xls", ".ppt"}:
        return head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    return False


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
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="File type not allowed")
    content_type = (file.content_type or "").lower().strip()
    if not (content_type.startswith(_ALLOWED_MIME_PREFIXES) or content_type in _ALLOWED_MIMES):
        raise HTTPException(status_code=400, detail="MIME type not allowed")
    logger.info("Attachment upload start filename=%s uploadedBy=%s", file.filename, uploadedBy)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    base_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "messages")
    os.makedirs(base_dir, exist_ok=True)
    dest = os.path.join(base_dir, safe_name)

    total = 0
    first_checked = False
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            if not first_checked:
                first_checked = True
                if not _is_allowed_signature(ext, chunk):
                    out.close()
                    try:
                        os.remove(dest)
                    except OSError:
                        pass
                    raise HTTPException(status_code=400, detail="File content signature not allowed")
            total += len(chunk)
            if total > _MAX_BYTES:
                out.close()
                try:
                    os.remove(dest)
                except OSError:
                    pass
                raise HTTPException(status_code=413, detail="File too large")
            out.write(chunk)

    rel = f"/uploads/messages/{safe_name}"
    audit_logger.log_event(
        AuditEventType.RESOURCE_ACCESSED,
        user_id=actor,
        resource_id=safe_name,
        resource_type="attachment",
        action="Message attachment uploaded",
        details={"entityType": entityType, "entityId": entityId, "size_bytes": total},
    )
    return {
        "success": True,
        "data": {"file_url": rel, "entityType": entityType, "entityId": entityId, "uploadedBy": actor},
    }

