"""AI-powered hint generation route."""

import logging
from logging_config import LogConfig
from fastapi import APIRouter, Request
from pydantic import BaseModel
from services.ai_service import cerebras_chat
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["hints"])
logger = LogConfig.get_logger(__name__)
audit_logger = get_audit_logger()


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


class HintRequest(BaseModel):
    problemTitle: str | None = ""
    problemDescription: str | None = ""
    language: str | None = "javascript"
    currentCode: str | None = ""
    difficulty: str | None = "medium"


@router.post("/hints")
async def generate_hint(body: HintRequest, request: Request):
    logger.info("Hint generation request language=%s difficulty=%s", body.language, body.difficulty)
    prompt = f"""You are a helpful coding tutor. A student is stuck on a problem.

Problem: {body.problemTitle}
Description: {body.problemDescription}
Language: {body.language}
Difficulty: {body.difficulty}

Their current code:
{body.currentCode or '(no code written yet)'}

Give a helpful hint WITHOUT giving the full solution. Guide them toward the right approach.
Keep the hint concise (2-4 sentences). Focus on the conceptual approach, not the exact code."""

    try:
        resp = await cerebras_chat(
            [
                {"role": "system", "content": "You are a coding tutor. Give hints, not solutions."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        hint = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        audit_logger.log_event(
            AuditEventType.RESOURCE_ACCESSED,
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_type="hints",
            action="Hint generated",
        )
        return {"hint": hint, "success": True}
    except Exception as e:
        return {"hint": "Sorry, hint generation failed. Try breaking the problem into smaller parts.", "success": False, "error": str(e)}

