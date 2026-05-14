"""Proctoring Intelligence Agent â€” API routes.

Endpoints for admins to trigger analysis, view results, generate reports,
and detect collusion. Also exposes a real-time hook so the existing
proctoring log endpoints can trigger incremental analysis.
"""

import logging
from logging_config import LogConfig
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

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


# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
#  Endpoints
# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

@router.post("/analyze")
async def analyze_session(req: AnalyzeRequest):
    """Trigger the agent to analyze a single exam session.

    Returns fraud score, detected patterns, AI reasoning, and recommended action.
    If the AI recommends 'terminate', automatically sends a socket terminate signal
    to the student's session and alerts admins - no manual admin action required.
    """
    try:
        result = await agent_analyze_session(
            req.session_id,
            req.source,
            user_id=req.user_id,
            exam_title=req.exam_title,
        )
        # Persist the analysis
        row_id = await save_analysis({**result, "source": req.source})
        result["analysis_id"] = row_id

        # Ã¢"â‚¬Ã¢"â‚¬ Auto-terminate: if AI recommends terminate, emit socket events immediately Ã¢"â‚¬Ã¢"â‚¬
        if result.get("recommended_action") == "terminate":
            try:
                from main import sio
                ai = result.get("ai_analysis", {})
                evidence = ai.get("evidence_summary", "") or ", ".join(ai.get("key_findings", [])[:2])
                terminate_payload = {
                    "session_id": req.session_id,
                    "reason": f"Auto-terminated by Proctoring Agent: fraud_score={result.get('fraud_score')}/100. {evidence}",
                    "fraud_score": result.get("fraud_score"),
                    "risk_level": "terminate",
                    "key_findings": ai.get("key_findings", []),
                    "manual": False,
                    "auto_terminated": True,
                }
                # Notify student to end their session
                await sio.emit("agent_terminate", terminate_payload, room=f"session_{req.session_id}")
                if req.user_id:
                    await sio.emit("agent_terminate", terminate_payload, room=f"student_{req.user_id}")
                # Alert all admins
                await sio.emit("agent_alert", {
                    "type": "auto_terminate",
                    "session_id": req.session_id,
                    "user_id": req.user_id,
                    "risk_level": "terminate",
                    "recommended_action": "terminate",
                    "fraud_score": result.get("fraud_score"),
                    "reason": "Auto-terminated by Proctoring Intelligence Agent",
                }, room="admin_room")
                result["auto_terminated"] = True
            except Exception as te:
                print(f"[ProctorAgent] Auto-terminate emit failed: {te}")
                result["auto_terminated"] = False

        _audit.log_proctor_event(
            event_type=AuditEventType.PROCTOR_ACTION_TAKEN,
            student_id=req.user_id or "UNKNOWN",
            ip_address=None,
            session_id=req.session_id,
            violation_type=result.get("risk_level"),
            details={"fraud_score": result.get("fraud_score"), "recommended_action": result.get("recommended_action"), "auto_terminated": result.get("auto_terminated", False)},
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent analysis failed: {str(e)}")


@router.post("/analyze/batch")
async def batch_analyze(req: BatchAnalyzeRequest):
    """Analyze multiple sessions at once. Returns sorted by fraud score (descending)."""
    try:
        results = await agent_batch_analyze(req.session_ids, req.source)
        # Persist each analysis
        for r in results:
            if "error" not in r:
                row_id = await save_analysis({**r, "source": req.source})
                r["analysis_id"] = row_id
        return {"count": len(results), "analyses": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch analysis failed: {str(e)}")


@router.post("/report")
async def generate_report(req: ReportRequest):
    """Generate a comprehensive integrity report for a completed exam."""
    try:
        report = await agent_generate_integrity_report(
            req.session_id,
            req.source,
            user_id=req.user_id,
            exam_title=req.exam_title,
            candidate_name=req.candidate_name,
        )
        row_id = await save_report({**report, "source": req.source})
        report["report_id"] = row_id
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.post("/collusion")
async def detect_collusion(req: CollusionRequest):
    """Detect potential collusion between multiple exam sessions."""
    try:
        result = await agent_detect_collusion(req.session_ids, req.source)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Collusion detection failed: {str(e)}")


class TerminateRequest(BaseModel):
    session_id: str
    user_id: str = ""
    reason: str = "Manually terminated by admin via Proctoring Intelligence Agent."


@router.post("/terminate")
async def terminate_session(req: TerminateRequest):
    """Admin manually terminates a student's test session via the Proctoring Agent.

    Sends a real-time socket event to the student, forcing their test to end.
    """
    try:
        from main import sio
        terminate_payload = {
            "session_id": req.session_id,
            "reason": req.reason,
            "fraud_score": None,
            "risk_level": "terminate",
            "key_findings": ["Manually terminated by administrator."],
            "manual": True,
        }
        # Emit to both session room and student room for maximum coverage
        await sio.emit("agent_terminate", terminate_payload, room=f"session_{req.session_id}")
        if req.user_id:
            await sio.emit("agent_terminate", terminate_payload, room=f"student_{req.user_id}")
        # Notify other admins
        await sio.emit("agent_alert", {
            "type": "manual_terminate",
            "session_id": req.session_id,
            "user_id": req.user_id,
            "risk_level": "terminate",
            "recommended_action": "terminate",
            "reason": req.reason,
        }, room="admin_room")
        _audit.log_proctor_event(
            event_type=AuditEventType.PROCTOR_ACTION_TAKEN,
            student_id=req.user_id or "UNKNOWN",
            ip_address=None,
            session_id=req.session_id,
            violation_type="manual_terminate",
            details={"reason": req.reason, "manual": True},
        )
        return {"success": True, "message": f"Terminate signal sent for session {req.session_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terminate failed: {str(e)}")


@router.get("/analyses")
async def list_analyses(limit: int = Query(50, ge=1, le=200)):
    """List recent agent analyses for the admin dashboard."""
    try:
        analyses = await get_recent_analyses(limit)
        return {"count": len(analyses), "analyses": analyses}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch analyses: {str(e)}")


@router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: int):
    """Get a single analysis result by ID, including full details."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM proctor_agent_analyses WHERE id=%s", (analysis_id,)
            )
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")

    import json
    from datetime import datetime
    return {
        **row,
        "patterns_json": json.loads(row["patterns_json"]) if row.get("patterns_json") else [],
        "ai_analysis_json": json.loads(row["ai_analysis_json"]) if row.get("ai_analysis_json") else {},
        "full_result_json": json.loads(row["full_result_json"]) if row.get("full_result_json") else {},
        "created_at": row["created_at"].isoformat() if isinstance(row.get("created_at"), datetime) else str(row.get("created_at", "")),
    }


@router.get("/report/{report_id}")
async def get_report(report_id: int):
    """Get a single integrity report by ID."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM proctor_integrity_reports WHERE id=%s", (report_id,)
            )
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    import json
    from datetime import datetime
    return {
        **row,
        "report_json": json.loads(row["report_json"]) if row.get("report_json") else {},
        "created_at": row["created_at"].isoformat() if isinstance(row.get("created_at"), datetime) else str(row.get("created_at", "")),
    }


@router.get("/session/{session_id}/analyses")
async def get_session_analyses(session_id: str):
    """Get all analyses for a specific session."""
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, session_id, source, user_id, exam_title, fraud_score, "
                "risk_level, recommended_action, created_at "
                "FROM proctor_agent_analyses WHERE session_id=%s ORDER BY created_at DESC",
                (session_id,),
            )
            rows = await cur.fetchall()

    from datetime import datetime
    return {
        "session_id": session_id,
        "count": len(rows),
        "analyses": [
            {**r, "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", ""))}
            for r in rows
        ],
    }


@router.get("/dashboard")
async def agent_dashboard():
    """Aggregate stats for the admin proctoring dashboard.

    Returns: total analyses, risk level distribution, recent flagged sessions.
    """
    await _ensure_agent_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Total count
            await cur.execute("SELECT COUNT(*) as total FROM proctor_agent_analyses")
            total_row = await cur.fetchone()
            total = total_row["total"] if total_row else 0

            # Risk distribution
            await cur.execute(
                "SELECT risk_level, COUNT(*) as cnt "
                "FROM proctor_agent_analyses GROUP BY risk_level"
            )
            dist_rows = await cur.fetchall()
            risk_distribution = {r["risk_level"]: r["cnt"] for r in dist_rows}

            # Recent flagged / critical
            await cur.execute(
                "SELECT id, session_id, user_id, exam_title, fraud_score, risk_level, "
                "recommended_action, created_at FROM proctor_agent_analyses "
                "WHERE risk_level IN ('flag_for_review', 'critical', 'terminate') "
                "ORDER BY created_at DESC LIMIT 20"
            )
            flagged_rows = await cur.fetchall()

            # Average fraud score
            await cur.execute("SELECT AVG(fraud_score) as avg_score FROM proctor_agent_analyses")
            avg_row = await cur.fetchone()
            avg_score = round(avg_row["avg_score"], 1) if avg_row and avg_row["avg_score"] else 0

    from datetime import datetime
    return {
        "total_analyses": total,
        "average_fraud_score": avg_score,
        "risk_distribution": risk_distribution,
        "recent_flagged": [
            {**r, "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", ""))}
            for r in flagged_rows
        ],
    }


