"""Behavior Analysis Agent â€” API routes.

Endpoints for logging behavior events, triggering analysis,
viewing results, and generating behavioral reports.
"""

import json
import logging
from logging_config import LogConfig
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from pydantic import BaseModel
from routes.auth import _has_any_permission

from services.behavior_agent import (
    save_behavior_events,
    agent_analyze_behavior,
    agent_generate_behavior_report,
    get_recent_behavior_analyses,
    get_behavior_dashboard_stats,
    get_behavior_sessions,
    clear_behavior_data,
)
from database import get_pool
import pymysql.cursors
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/behavior", tags=["behavior-agent"])
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
            resource_type="behavior_read",
            query_params={"path": request.url.path, "query": request.url.query},
        )


router.dependencies.append(Depends(_log_read_access))


async def _get_actor(request: Request) -> dict:
    actor_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id, role FROM users WHERE id = %s LIMIT 1", (actor_id,))
            actor = await cur.fetchone()
            if not actor:
                raise HTTPException(status_code=401, detail="Invalid user context")
            return actor


async def _require_behavior_view(request: Request) -> dict:
    actor = await _get_actor(request)
    if await _has_any_permission(str(actor.get("id") or ""), ["proctoring.view"]):
        return actor
    raise HTTPException(status_code=403, detail="Permission denied")


async def _require_behavior_manage(request: Request) -> dict:
    actor = await _get_actor(request)
    if await _has_any_permission(str(actor.get("id") or ""), ["proctoring.manage"]):
        return actor
    raise HTTPException(status_code=403, detail="Proctoring manage permission required")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Request / Response models
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class LogEventsRequest(BaseModel):
    session_id: str
    user_id: str
    events: list[dict]


class AnalyzeRequest(BaseModel):
    session_id: str
    user_id: str = ""
    exam_title: str = ""
    problem_difficulty: str = "medium"


class ReportRequest(BaseModel):
    session_id: str
    user_id: str = ""
    exam_title: str = ""
    candidate_name: str = ""


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Endpoints
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.post("/log-events")
async def log_behavior_events(req: LogEventsRequest, request: Request):
    """Receive a batch of behavior events from the frontend.

    Called periodically (every ~15s) by the ProctoredCodeEditor.
    """
    actor = await _get_actor(request)
    actor_id = str(actor.get("id") or "")
    privileged = await _has_any_permission(actor_id, ["proctoring.view"])
    requested_user_id = (req.user_id or "").strip()
    if requested_user_id and requested_user_id != actor_id and not privileged:
        raise HTTPException(status_code=403, detail="Cannot log behavior events for another user")
    effective_user_id = requested_user_id if privileged and requested_user_id else actor_id
    try:
        count = await save_behavior_events(req.session_id, effective_user_id, req.events)
        logger.info("Behavior events logged session=%s count=%d", req.session_id, count)
        audit_logger.log_event(
            AuditEventType.RESOURCE_ACCESSED,
            user_id=effective_user_id,
            ip_address=_client_ip(request),
            resource_id=req.session_id,
            resource_type="behavior_session",
            action="Behavior events logged",
            details={"count": count},
        )
        return {"status": "ok", "events_saved": count}
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to save behavior events: {e}")


@router.post("/analyze")
async def analyze_session_behavior(req: AnalyzeRequest, request: Request):
    """Trigger behavior analysis on a session.

    Returns trust score, component scores, anomalies, and AI insights.
    """
    await _require_behavior_view(request)
    try:
        result = await agent_analyze_behavior(
            req.session_id,
            user_id=req.user_id,
            exam_title=req.exam_title,
            problem_difficulty=req.problem_difficulty,
        )
        audit_logger.log_event(
            AuditEventType.RESOURCE_ACCESSED,
            user_id=req.user_id or getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_id=req.session_id,
            resource_type="behavior_analysis",
            action="Behavior analysis triggered",
        )
        return result
    except Exception as e:
        raise HTTPException(500, detail=f"Behavior analysis failed: {e}")


@router.post("/report")
async def generate_behavior_report(req: ReportRequest, request: Request):
    """Generate a comprehensive AI-powered behavior report."""
    await _require_behavior_view(request)
    try:
        report = await agent_generate_behavior_report(
            req.session_id,
            user_id=req.user_id,
            exam_title=req.exam_title,
            candidate_name=req.candidate_name,
        )
        return report
    except Exception as e:
        raise HTTPException(500, detail=f"Report generation failed: {e}")


@router.get("/sessions")
async def list_behavior_sessions(request: Request, limit: int = Query(50, ge=1, le=200)):
    """List sessions with behavior events. Admin can select one to analyze."""
    await _require_behavior_view(request)
    try:
        sessions = await get_behavior_sessions(limit)
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to fetch sessions: {e}")


@router.get("/dashboard")
async def behavior_dashboard(request: Request):
    """Aggregate stats for the admin behavior analysis dashboard.

    Returns: total analyses, trust distribution, avg score, recently flagged.
    """
    await _require_behavior_view(request)
    try:
        stats = await get_behavior_dashboard_stats()
        return stats
    except Exception as e:
        raise HTTPException(500, detail=f"Dashboard stats failed: {e}")


@router.get("/analyses")
async def list_behavior_analyses(request: Request, limit: int = Query(50, ge=1, le=200)):
    """List recent behavior analyses."""
    await _require_behavior_view(request)
    try:
        analyses = await get_recent_behavior_analyses(limit)
        return {"analyses": analyses, "total": len(analyses)}
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to fetch analyses: {e}")

@router.delete("/clear")
async def clear_all_behavior_data(request: Request):
    """Clear all behavior events and analyses (admin only)."""
    await _require_behavior_manage(request)
    try:
        await clear_behavior_data()
        return {"status": "ok", "message": "All behavior data cleared."}
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to clear data: {e}")


@router.get("/analysis/{analysis_id}")
async def get_behavior_analysis(analysis_id: int, request: Request):
    """Get a single behavior analysis by ID with full details."""
    await _require_behavior_view(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM behavior_analyses WHERE id = %s", (analysis_id,)
            )
            row = await cur.fetchone()

    if not row:
        raise HTTPException(404, detail="Analysis not found")

    # Parse JSON fields
    result = dict(row)
    for field in ("typing_json", "progression_json", "engagement_json",
                  "anomalies_json", "ai_insights_json", "full_result_json"):
        val = result.get(field)
        if isinstance(val, str):
            try:
                result[field] = json.loads(val)
            except Exception:
                pass
    if isinstance(result.get("created_at"), datetime):
        result["created_at"] = result["created_at"].isoformat()

    return result


@router.get("/session/{session_id}")
async def get_session_behavior(session_id: str, request: Request):
    """Get all behavior analyses for a specific session."""
    await _require_behavior_view(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, session_id, user_id, exam_title, trust_score, "
                "trust_level, created_at "
                "FROM behavior_analyses WHERE session_id = %s "
                "ORDER BY created_at DESC",
                (session_id,),
            )
            rows = await cur.fetchall()

    return {
        "session_id": session_id,
        "analyses": [
            {
                **r,
                "created_at": (
                    r["created_at"].isoformat()
                    if isinstance(r.get("created_at"), datetime)
                    else str(r.get("created_at", ""))
                ),
            }
            for r in rows
        ],
    }

