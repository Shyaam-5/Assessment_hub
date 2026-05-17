"""Proctoring Intelligence Agent â€” API routes.

Endpoints for admins to trigger analysis, view results, generate reports,
and detect collusion. Also exposes a real-time hook so the existing
proctoring log endpoints can trigger incremental analysis.
"""

import logging
import json
from logging_config import LogConfig
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import pymysql.cursors

from audit_logger import get_audit_logger, AuditEventType
from services.proctor_agent import (
    agent_analyze_session,
    agent_generate_integrity_report,
    agent_batch_analyze,
    agent_detect_collusion,
    save_analysis,
    save_report,
    get_recent_analyses,
    _ensure_agent_tables,
)
from database import get_pool

logger = LogConfig.get_logger(__name__)
_audit = get_audit_logger()

router = APIRouter(prefix="/api/proctor-agent", tags=["proctor-agent"])


# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
#  Request / Response models
# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

class AnalyzeRequest(BaseModel):
    session_id: str
    source: str = "comm"          # "comm" | "skill" | "global"
    user_id: str = ""
    exam_title: str = ""


class BatchAnalyzeRequest(BaseModel):
    session_ids: list[str]
    source: str = "comm"          # "comm" | "skill" | "global"


class ReportRequest(BaseModel):
    session_id: str
    source: str = "comm"          # "comm" | "skill" | "global"
    user_id: str = ""
    exam_title: str = ""
    candidate_name: str = ""


class CollusionRequest(BaseModel):
    session_ids: list[str]
    source: str = "comm"          # "comm" | "skill" | "global"


class TerminateRequest(BaseModel):
    session_id: str
    user_id: str = ""
    reason: str = "Terminated by proctoring agent."


class WarnRequest(BaseModel):
    session_id: str
    user_id: str = ""
    message: str = "Warning: Suspicious behavior detected. Please follow exam rules."


class ClearFlagRequest(BaseModel):
    session_id: str
    user_id: str = ""
    note: str = ""


# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
#  Endpoints
# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


async def _log_read_access(request: Request):
    if request.method == "GET":
        _audit.log_data_access(
            user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
            ip_address=_client_ip(request),
            resource_type="proctor_agent_read",
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


async def _require_proctor_view(request: Request) -> dict:
    actor = await _get_actor(request)
    role = (actor.get("role") or "").lower()
    if role in {"admin", "organization_admin", "mentor", "org_user"}:
        return actor
    raise HTTPException(status_code=403, detail="Permission denied")


async def _require_proctor_manage(request: Request) -> dict:
    actor = await _get_actor(request)
    role = (actor.get("role") or "").lower()
    if role in {"admin", "organization_admin", "mentor"}:
        return actor
    raise HTTPException(status_code=403, detail="Proctoring permission required")


def _safe_json(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _json_row(row: dict) -> dict:
    result = dict(row)
    for field in ("patterns_json", "ai_analysis_json", "full_result_json"):
        result[field] = _safe_json(result.get(field))
    if isinstance(result.get("created_at"), datetime):
        result["created_at"] = result["created_at"].isoformat()
    return result


async def _dashboard_stats() -> dict:
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT COUNT(*) AS total, AVG(fraud_score) AS avg_score FROM proctor_agent_analyses")
            totals = await cur.fetchone() or {}
            await cur.execute("SELECT risk_level, COUNT(*) AS count FROM proctor_agent_analyses GROUP BY risk_level")
            dist_rows = await cur.fetchall()
            await cur.execute(
                "SELECT id, session_id, source, user_id, exam_title, fraud_score, risk_level, "
                "recommended_action, created_at FROM proctor_agent_analyses "
                "WHERE fraud_score >= 35 OR risk_level IN ('suspicious','high','critical','terminate') "
                "ORDER BY created_at DESC LIMIT 10"
            )
            flagged = await cur.fetchall()

    return {
        "total_analyses": int(totals.get("total") or 0),
        "average_fraud_score": round(float(totals.get("avg_score") or 0), 1),
        "risk_distribution": {str(r.get("risk_level") or "unknown"): int(r.get("count") or 0) for r in dist_rows},
        "recent_flagged": [
            {
                **r,
                "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", "")),
            }
            for r in flagged
        ],
    }


@router.get("/dashboard")
async def dashboard(request: Request):
    await _require_proctor_view(request)
    try:
        return await _dashboard_stats()
    except Exception as exc:
        logger.exception("Proctor agent dashboard failed")
        raise HTTPException(500, detail=f"Dashboard stats failed: {exc}")


@router.get("/analyses")
async def list_analyses(request: Request, limit: int = Query(50, ge=1, le=200)):
    await _require_proctor_view(request)
    try:
        analyses = await get_recent_analyses(limit)
        return {"analyses": analyses, "total": len(analyses)}
    except Exception as exc:
        logger.exception("Proctor analyses fetch failed")
        raise HTTPException(500, detail=f"Failed to fetch analyses: {exc}")


@router.post("/analyze")
async def analyze_session(req: AnalyzeRequest, request: Request):
    actor = await _require_proctor_view(request)
    try:
        result = await agent_analyze_session(
            req.session_id,
            req.source,
            user_id=req.user_id,
            exam_title=req.exam_title,
        )
        result["source"] = req.source
        result.setdefault("user_id", req.user_id)
        result.setdefault("exam_title", req.exam_title)
        result["analysis_id"] = await save_analysis(result)
        _audit.log_event(
            AuditEventType.RESOURCE_ACCESSED,
            user_id=actor["id"],
            ip_address=_client_ip(request),
            resource_id=req.session_id,
            resource_type="proctor_agent_analysis",
            action="Proctor agent analysis triggered",
            details={"source": req.source, "targetUserId": req.user_id},
        )
        return result
    except Exception as exc:
        logger.exception("Proctor analysis failed")
        raise HTTPException(500, detail=f"Analysis failed: {exc}")


@router.post("/analyze/batch")
async def batch_analyze(req: BatchAnalyzeRequest, request: Request):
    await _require_proctor_view(request)
    if not req.session_ids:
        raise HTTPException(400, detail="session_ids required")
    try:
        results = await agent_batch_analyze(req.session_ids, req.source)
        saved = 0
        for result in results:
            if result.get("error"):
                continue
            result["source"] = req.source
            result["analysis_id"] = await save_analysis(result)
            saved += 1
        return {"analyses": results, "count": len(results), "saved": saved}
    except Exception as exc:
        logger.exception("Proctor batch analysis failed")
        raise HTTPException(500, detail=f"Batch analysis failed: {exc}")


@router.post("/report")
async def generate_report(req: ReportRequest, request: Request):
    await _require_proctor_view(request)
    try:
        report = await agent_generate_integrity_report(
            req.session_id,
            req.source,
            user_id=req.user_id,
            exam_title=req.exam_title,
            candidate_name=req.candidate_name,
        )
        report["source"] = req.source
        report["report_id"] = await save_report(report)
        return report
    except Exception as exc:
        logger.exception("Proctor report generation failed")
        raise HTTPException(500, detail=f"Report generation failed: {exc}")


@router.post("/collusion")
async def detect_collusion(req: CollusionRequest, request: Request):
    await _require_proctor_view(request)
    if len(req.session_ids) < 2:
        raise HTTPException(400, detail="At least two session IDs are required")
    try:
        return await agent_detect_collusion(req.session_ids, req.source)
    except Exception as exc:
        logger.exception("Collusion analysis failed")
        raise HTTPException(500, detail=f"Collusion detection failed: {exc}")


@router.post("/terminate")
async def terminate_session(req: TerminateRequest, request: Request):
    actor = await _require_proctor_manage(request)
    if not req.session_id:
        raise HTTPException(400, detail="session_id required")

    payload = {
        "sessionId": req.session_id,
        "userId": req.user_id,
        "reason": req.reason,
        "terminatedBy": actor["id"],
        "terminatedAt": datetime.utcnow().isoformat() + "Z",
    }
    emitted_rooms: list[str] = []
    sio = getattr(request.app.state, "sio", None)
    if sio is not None:
        await sio.emit("agent_terminate", payload, room=f"session_{req.session_id}")
        emitted_rooms.append(f"session_{req.session_id}")
        if req.user_id:
            await sio.emit("agent_terminate", payload, room=f"student_{req.user_id}")
            emitted_rooms.append(f"student_{req.user_id}")

    _audit.log_event(
        AuditEventType.PROCTOR_ACTION_TAKEN,
        user_id=actor["id"],
        ip_address=_client_ip(request),
        resource_id=req.session_id,
        resource_type="proctor_session",
        action="Proctor agent termination issued",
        details={"targetUserId": req.user_id, "reason": req.reason, "rooms": emitted_rooms},
    )
    return {"status": "ok", "emitted": bool(emitted_rooms), "rooms": emitted_rooms}


@router.post("/warn")
async def warn_student(req: WarnRequest, request: Request):
    actor = await _require_proctor_manage(request)
    if not req.session_id:
        raise HTTPException(400, detail="session_id required")

    payload = {
        "sessionId": req.session_id,
        "userId": req.user_id,
        "message": req.message,
        "warnedBy": actor["id"],
        "warnedAt": datetime.utcnow().isoformat() + "Z",
    }
    emitted_rooms: list[str] = []
    sio = getattr(request.app.state, "sio", None)
    if sio is not None:
        await sio.emit("agent_warn", payload, room=f"session_{req.session_id}")
        emitted_rooms.append(f"session_{req.session_id}")
        if req.user_id:
            await sio.emit("agent_warn", payload, room=f"student_{req.user_id}")
            emitted_rooms.append(f"student_{req.user_id}")

    _audit.log_event(
        AuditEventType.PROCTOR_ACTION_TAKEN,
        user_id=actor["id"],
        ip_address=_client_ip(request),
        resource_id=req.session_id,
        resource_type="proctor_session",
        action="Proctor warning issued",
        details={"targetUserId": req.user_id, "message": req.message, "rooms": emitted_rooms},
    )
    return {"status": "ok", "emitted": bool(emitted_rooms), "rooms": emitted_rooms}


@router.post("/clear-flag")
async def clear_flag(req: ClearFlagRequest, request: Request):
    actor = await _require_proctor_manage(request)
    if not req.session_id:
        raise HTTPException(400, detail="session_id required")

    _audit.log_event(
        AuditEventType.PROCTOR_ACTION_TAKEN,
        user_id=actor["id"],
        ip_address=_client_ip(request),
        resource_id=req.session_id,
        resource_type="proctor_session",
        action="Proctor flag cleared",
        details={"targetUserId": req.user_id, "note": req.note},
    )
    return {"status": "ok", "session_id": req.session_id, "cleared_by": actor["id"]}


@router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: int, request: Request):
    await _require_proctor_view(request)
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM proctor_agent_analyses WHERE id = %s", (analysis_id,))
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, detail="Analysis not found")
    return _json_row(row)
