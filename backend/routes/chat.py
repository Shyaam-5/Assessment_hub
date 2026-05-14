"""AI chatbot route."""

import logging
from logging_config import LogConfig
from fastapi import APIRouter, Request
from pydantic import BaseModel
from services.ai_service import cerebras_chat
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["chat"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


class ChatRequest(BaseModel):
    message: str
    context: str | None = ""
    history: list[dict] | None = None


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    logger.info("Chat request received history=%d", len(body.history or []))
    messages = [
        {
            "role": "system",
            "content": (
                "You are an AI coding assistant for a mentoring platform. "
                "Help students with programming concepts, debugging, and best practices. "
                "Be encouraging and educational. If the student shares code, provide constructive feedback."
            ),
        }
    ]

    if body.history:
        messages.extend(body.history[-10:])  # keep last 10 messages for context

    if body.context:
        messages.append({"role": "user", "content": f"Context: {body.context}"})

    messages.append({"role": "user", "content": body.message})

    try:
        resp = await cerebras_chat(messages, temperature=0.7, max_tokens=1024)
        reply = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        audit_logger.log_event(
            AuditEventType.RESOURCE_ACCESSED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_type="chat",
            action="AI chat response generated",
        )
        return {"reply": reply, "success": True}
    except Exception as e:
        return {"reply": "Sorry, I'm having trouble responding right now.", "success": False, "error": str(e)}

