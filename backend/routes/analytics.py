"""Analytics routes for Admin, Mentor, and Student dashboards."""

from datetime import datetime, timedelta, timezone

import csv
import io
import json

import pymysql.cursors
import pymysql.err
from fastapi import APIRouter, Query, Request, Depends, HTTPException
from fastapi.responses import Response
from database import get_pool, get_primary_pool
from routes.auth import _has_any_permission
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
audit_logger = get_audit_logger()
_submission_plagiarism_filter_cache: str | None = None


def _is_missing_table_error(exc: Exception) -> bool:
    return isinstance(exc, pymysql.err.ProgrammingError) and len(exc.args) > 0 and exc.args[0] == 1146


async def _resolve_submission_plagiarism_filter(conn) -> str:
    global _submission_plagiarism_filter_cache
    if _submission_plagiarism_filter_cache:
        return _submission_plagiarism_filter_cache

    async with conn.cursor(pymysql.cursors.DictCursor) as cur:
        await cur.execute("SHOW COLUMNS FROM submissions")
        rows = await cur.fetchall()

    columns = {str(row.get("Field") or "").strip().lower() for row in (rows or [])}
    has_flagged_submission = "flagged_submission" in columns
    has_plagiarism_detected = "plagiarism_detected" in columns

    filters: list[str] = []
    if has_flagged_submission:
        filters.append("s.flagged_submission = 1")
    if has_plagiarism_detected:
        filters.append("LOWER(COALESCE(s.plagiarism_detected,''))='true'")

    if not filters:
        _submission_plagiarism_filter_cache = "1=0"
    elif len(filters) == 1:
        _submission_plagiarism_filter_cache = filters[0]
    else:
        _submission_plagiarism_filter_cache = "(" + " OR ".join(filters) + ")"
    return _submission_plagiarism_filter_cache


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


async def _log_read_access(request: Request):
    if request.method != "GET":
        return
    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="analytics_read",
        query_params={"path": request.url.path, "query": request.url.query},
    )


router.dependencies.append(Depends(_log_read_access))


async def _require_actor(request: Request):
    user_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM users WHERE id = %s LIMIT 1", (user_id,))
            if not await cur.fetchone():
                raise HTTPException(status_code=401, detail="Invalid user context")


router.dependencies.append(Depends(_require_actor))


# --- Helpers ---
async def _require_admin(request: Request) -> None:
    user_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    if not await _has_any_permission(user_id, ["analytics.view"]):
        raise HTTPException(status_code=403, detail="Admin access required")


async def _require_export(request: Request) -> str:
    user_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    if not await _has_any_permission(user_id, ["analytics.export"]):
        raise HTTPException(status_code=403, detail="Analytics export requires a Pro subscription")
    return user_id


async def _get_actor_user(request: Request) -> dict:
    user_id = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, role FROM users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            user = await cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="Invalid user context")
            return user


async def _can_view_all_analytics(user_id: str) -> bool:
    return await _has_any_permission(user_id, ["analytics.view"])


async def _allocated_student_ids(conn, mentor_id: str | None) -> list[str]:
    """Return the list of student ids visible to a given mentor.

    If mentor_id is None we treat it as admin scope (every student).
    """
    async with conn.cursor(pymysql.cursors.DictCursor) as cur:
        if mentor_id:
            try:
                await cur.execute(
                    "SELECT student_id FROM mentor_student_allocations WHERE mentor_id=%s",
                    (mentor_id,),
                )
                rows = await cur.fetchall()
                return [r["student_id"] for r in rows]
            except Exception as exc:
                if _is_missing_table_error(exc):
                    return []
                raise
        await cur.execute("SELECT id FROM users WHERE role='student'")
        rows = await cur.fetchall()
        return [r["id"] for r in rows]


def _difficulty_from_score(score, status) -> str:
    """Derive a difficulty bucket when problems table doesn't expose one."""
    if status == "passed":
        return "easy"
    if score is None:
        return "medium"
    return "hard" if score < 40 else "medium"


# --- Admin Dashboard ---
async def admin_analytics():
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Total students
            await cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE role = 'student'")
            total_students = (await cur.fetchone())["cnt"]

            # Total submissions (code + aptitude)
            await cur.execute("SELECT COUNT(*) AS cnt FROM submissions")
            code_sub_count = (await cur.fetchone())["cnt"]
            await cur.execute("SELECT COUNT(*) AS cnt FROM aptitude_submissions")
            apt_sub_count = (await cur.fetchone())["cnt"]
            total_submissions = code_sub_count + apt_sub_count

            # Total content (tasks + problems + aptitude tests)
            await cur.execute("SELECT COUNT(*) AS cnt FROM tasks")
            task_count = (await cur.fetchone())["cnt"]
            await cur.execute("SELECT COUNT(*) AS cnt FROM problems")
            prob_count = (await cur.fetchone())["cnt"]
            await cur.execute("SELECT COUNT(*) AS cnt FROM aptitude_tests")
            test_count = (await cur.fetchone())["cnt"]
            total_content = task_count + prob_count + test_count

            # Success rate (code passed + aptitude passed)
            await cur.execute("SELECT COUNT(*) AS cnt FROM submissions WHERE score >= 60")
            passed_code = (await cur.fetchone())["cnt"]
            await cur.execute("SELECT COUNT(*) AS cnt FROM aptitude_submissions WHERE status = 'passed'")
            passed_apt = (await cur.fetchone())["cnt"]
            success_rate = round(((passed_code + passed_apt) / total_submissions) * 100) if total_submissions > 0 else 0

            # Submission trends (last 7 days)
            await cur.execute(
                """SELECT DATE(submitted_at) AS date, COUNT(*) AS count
                   FROM submissions
                   WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                   GROUP BY DATE(submitted_at)
                   ORDER BY date ASC"""
            )
            trends = await cur.fetchall()
            submission_trends = [
                {"date": t["date"].strftime("%b %d") if hasattr(t["date"], "strftime") else str(t["date"]), "count": t["count"]}
                for t in trends
            ]

            # Language stats
            await cur.execute(
                "SELECT language, COUNT(*) AS value FROM submissions GROUP BY language"
            )
            lang_rows = await cur.fetchall()
            language_stats = [
                {"name": r["language"] or "Unknown", "value": r["value"]} for r in lang_rows
            ]

            # Recent submissions
            await cur.execute(
                """SELECT s.id, u.name AS studentName, s.score, s.status, s.submitted_at AS time
                   FROM submissions s
                   JOIN users u ON s.student_id = u.id
                   ORDER BY s.submitted_at DESC LIMIT 5"""
            )
            recent_rows = await cur.fetchall()
            recent_submissions = [
                {
                    "id": r["id"],
                    "studentName": r["studentName"],
                    "score": r["score"],
                    "status": r["status"],
                    "time": str(r["time"]) if r["time"] else "",
                }
                for r in recent_rows
            ]

            # Student performance (Top 5)
            await cur.execute(
                """SELECT u.name, COUNT(s.id) AS count, AVG(s.score) AS score
                   FROM users u
                   JOIN submissions s ON u.id = s.student_id
                   GROUP BY u.id
                   ORDER BY score DESC, count DESC
                   LIMIT 5"""
            )
            perf_rows = await cur.fetchall()
            student_performance = [
                {"name": r["name"], "count": r["count"], "score": round(r["score"] or 0)}
                for r in perf_rows
            ]

    return {
        "totalStudents": total_students,
        "totalSubmissions": total_submissions,
        "successRate": success_rate,
        "totalContent": total_content,
        "submissionTrends": submission_trends,
        "languageStats": language_stats,
        "recentSubmissions": recent_submissions,
        "studentPerformance": student_performance,
    }


@router.get("/admin")
async def get_admin_analytics(request: Request):
    """Platform-wide dashboard figures for AdminPortal."""
    await _require_admin(request)
    data = await admin_analytics()
    audit_logger.log_data_access(getattr(request.state, "auth_user_id", None) or "anonymous", _client_ip(request), "analytics_admin", record_count=1)
    return data


@router.get("/admin/proctoring-behavior-summary")
async def admin_proctoring_behavior_summary(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    await _require_admin(request)
    pool = await get_pool()

    cards = {
        "totalProctorEvents": 0,
        "criticalProctorEvents": 0,
        "uniqueSessions": 0,
        "avgBehaviorTrustScore": 0,
        "lowTrustAnalyses": 0,
    }
    by_test_type = []
    by_severity = []
    daily_trend = []
    behavior_trust_distribution = []
    recent_behavior_analyses = []

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            try:
                await cur.execute(
                    """
                    SELECT COUNT(*) AS c
                    FROM proctoring_events_unified
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    """,
                    (days,),
                )
                cards["totalProctorEvents"] = int((await cur.fetchone() or {}).get("c") or 0)

                await cur.execute(
                    """
                    SELECT COUNT(*) AS c
                    FROM proctoring_events_unified
                    WHERE severity IN ('critical','high')
                      AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    """,
                    (days,),
                )
                cards["criticalProctorEvents"] = int((await cur.fetchone() or {}).get("c") or 0)

                await cur.execute(
                    """
                    SELECT COUNT(DISTINCT session_id) AS c
                    FROM proctoring_events_unified
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    """,
                    (days,),
                )
                cards["uniqueSessions"] = int((await cur.fetchone() or {}).get("c") or 0)

                await cur.execute(
                    """
                    SELECT test_type AS name, COUNT(*) AS value
                    FROM proctoring_events_unified
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    GROUP BY test_type
                    ORDER BY value DESC
                    """,
                    (days,),
                )
                by_test_type = [{"name": r["name"], "value": int(r["value"] or 0)} for r in (await cur.fetchall() or [])]

                await cur.execute(
                    """
                    SELECT severity AS name, COUNT(*) AS value
                    FROM proctoring_events_unified
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    GROUP BY severity
                    ORDER BY value DESC
                    """,
                    (days,),
                )
                by_severity = [{"name": r["name"], "value": int(r["value"] or 0)} for r in (await cur.fetchall() or [])]

                await cur.execute(
                    """
                    SELECT DATE(created_at) AS d, COUNT(*) AS c
                    FROM proctoring_events_unified
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    GROUP BY DATE(created_at)
                    ORDER BY d ASC
                    """,
                    (days,),
                )
                daily_trend = [
                    {
                        "date": r["d"].strftime("%b %d") if hasattr(r.get("d"), "strftime") else str(r.get("d")),
                        "proctorEvents": int(r.get("c") or 0),
                    }
                    for r in (await cur.fetchall() or [])
                ]
            except Exception:
                pass

            try:
                await cur.execute(
                    """
                    SELECT COALESCE(AVG(trust_score),0) AS avg_score
                    FROM behavior_analyses
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    """,
                    (days,),
                )
                cards["avgBehaviorTrustScore"] = round(float((await cur.fetchone() or {}).get("avg_score") or 0), 2)

                await cur.execute(
                    """
                    SELECT COUNT(*) AS c
                    FROM behavior_analyses
                    WHERE trust_score < 60
                      AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    """,
                    (days,),
                )
                cards["lowTrustAnalyses"] = int((await cur.fetchone() or {}).get("c") or 0)

                await cur.execute(
                    """
                    SELECT trust_level AS name, COUNT(*) AS value
                    FROM behavior_analyses
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    GROUP BY trust_level
                    ORDER BY value DESC
                    """,
                    (days,),
                )
                behavior_trust_distribution = [
                    {"name": r["name"] or "unknown", "value": int(r["value"] or 0)}
                    for r in (await cur.fetchall() or [])
                ]

                await cur.execute(
                    """
                    SELECT id, session_id, user_id, trust_score, trust_level, created_at
                    FROM behavior_analyses
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                    ORDER BY created_at DESC
                    LIMIT 10
                    """,
                    (days,),
                )
                recent_behavior_analyses = [
                    {
                        "id": r["id"],
                        "sessionId": r["session_id"],
                        "userId": r["user_id"],
                        "trustScore": float(r.get("trust_score") or 0),
                        "trustLevel": r.get("trust_level"),
                        "createdAt": str(r.get("created_at") or ""),
                    }
                    for r in (await cur.fetchall() or [])
                ]
            except Exception:
                pass

    return {
        "days": days,
        "cards": cards,
        "charts": {
            "byTestType": by_test_type,
            "bySeverity": by_severity,
            "dailyTrend": daily_trend,
            "behaviorTrustDistribution": behavior_trust_distribution,
        },
        "recentBehaviorAnalyses": recent_behavior_analyses,
    }


# --- Student Dashboard ---

@router.get("/student/{student_id}")
async def student_analytics(student_id: str, request: Request):
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student" and student_id != actor_id:
        raise HTTPException(status_code=403, detail="Students can only view their own analytics")
    if actor_role == "mentor" and not can_view_all:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                try:
                    await cur.execute(
                        """
                        SELECT 1 FROM mentor_student_allocations
                        WHERE mentor_id = %s AND student_id = %s
                        LIMIT 1
                        """,
                        (actor_id, student_id),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(status_code=403, detail="Student is not allocated to this mentor")
                except Exception as exc:
                    if _is_missing_table_error(exc):
                        raise HTTPException(status_code=403, detail="Mentor allocation data is unavailable")
                    raise
    if actor_role not in ("admin", "organization_admin", "mentor", "student") and not can_view_all:
        if student_id != actor_id:
            raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Get student's mentor from allocation table
            try:
                await cur.execute(
                    """SELECT m.id AS mentor_id, m.name AS mentor_name, m.email AS mentor_email
                       FROM mentor_student_allocations msa
                       JOIN users m ON msa.mentor_id = m.id
                       WHERE msa.student_id = %s
                       LIMIT 1""",
                    (student_id,),
                )
                alloc_row = await cur.fetchone()
            except Exception as exc:
                if _is_missing_table_error(exc):
                    alloc_row = None
                else:
                    raise
            mentor_info = None
            mentor_id = None
            if alloc_row:
                mentor_info = {
                    "id": alloc_row["mentor_id"],
                    "name": alloc_row["mentor_name"],
                    "email": alloc_row["mentor_email"],
                }
                mentor_id = alloc_row["mentor_id"]

            # Average problem score
            await cur.execute(
                "SELECT COALESCE(AVG(score), 0) AS avg FROM submissions WHERE student_id = %s AND problem_id IS NOT NULL",
                (student_id,),
            )
            avg_problem_score = round((await cur.fetchone())["avg"] or 0)

            avg_task_score = 0  # tasks tracked via task_completions, not submissions

            # Total submissions
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM submissions WHERE student_id = %s",
                (student_id,),
            )
            total_submissions = (await cur.fetchone())["cnt"]

            # Tasks - total available (from mentor or admin) and completed
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM tasks WHERE (mentor_id = %s OR mentor_id = 'admin-001') AND status = 'live'",
                (mentor_id,),
            )
            total_tasks = (await cur.fetchone())["cnt"]
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM task_completions WHERE student_id = %s",
                (student_id,),
            )
            completed_tasks = (await cur.fetchone())["cnt"]

            # Problems - total available and completed
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM problems WHERE (mentor_id = %s OR mentor_id = 'admin-001') AND status = 'live'",
                (mentor_id,),
            )
            total_problems = (await cur.fetchone())["cnt"]
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM problem_completions WHERE student_id = %s",
                (student_id,),
            )
            completed_problems = (await cur.fetchone())["cnt"]

            # Aptitude tests
            await cur.execute("SELECT COUNT(*) AS cnt FROM aptitude_tests WHERE status = 'live'")
            total_aptitude = (await cur.fetchone())["cnt"]
            await cur.execute(
                "SELECT COUNT(*) AS cnt FROM student_completed_aptitude WHERE student_id = %s",
                (student_id,),
            )
            completed_aptitude = (await cur.fetchone())["cnt"]

            # Submission trends (last 7 days)
            await cur.execute(
                """SELECT DATE(submitted_at) AS date, COUNT(*) AS count
                   FROM submissions
                   WHERE student_id = %s AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                   GROUP BY DATE(submitted_at)
                   ORDER BY date ASC""",
                (student_id,),
            )
            trends = await cur.fetchall()
            submission_trends = [
                {"date": t["date"].strftime("%b %d") if hasattr(t["date"], "strftime") else str(t["date"]), "count": t["count"]}
                for t in trends
            ]

            # Recent submissions with problem title
            await cur.execute(
                """SELECT s.id, s.score, s.status, s.language, s.submitted_at AS time,
                          p.title AS problemTitle
                   FROM submissions s
                   LEFT JOIN problems p ON s.problem_id = p.id
                   WHERE s.student_id = %s
                   ORDER BY s.submitted_at DESC LIMIT 5""",
                (student_id,),
            )
            recent_rows = await cur.fetchall()
            recent_submissions = [
                {
                    "id": r["id"],
                    "title": r["problemTitle"] or "Unknown",
                    "score": r["score"],
                    "status": r["status"],
                    "language": r["language"],
                    "time": str(r["time"]) if r["time"] else "",
                }
                for r in recent_rows
            ]

            # Leaderboard
            await cur.execute(
                """SELECT u.id AS studentId, u.name,
                          COUNT(DISTINCT tc.task_id) AS taskCount,
                          COUNT(DISTINCT pc.problem_id) AS codeCount,
                          COUNT(DISTINCT sca.aptitude_test_id) AS aptitudeCount,
                          COALESCE(AVG(sub.score), 0) AS avgScore
                   FROM users u
                   LEFT JOIN task_completions tc ON u.id = tc.student_id
                   LEFT JOIN problem_completions pc ON u.id = pc.student_id
                   LEFT JOIN student_completed_aptitude sca ON u.id = sca.student_id
                   LEFT JOIN submissions sub ON u.id = sub.student_id
                   WHERE u.role = 'student'
                   GROUP BY u.id
                   ORDER BY avgScore DESC, (taskCount + codeCount + aptitudeCount) DESC
                   LIMIT 10"""
            )
            lb_rows = await cur.fetchall()
            leaderboard = [
                {
                    "rank": idx + 1,
                    "studentId": r["studentId"],
                    "name": r["name"],
                    "taskCount": int(r["taskCount"] or 0),
                    "codeCount": int(r["codeCount"] or 0),
                    "aptitudeCount": int(r["aptitudeCount"] or 0),
                    "avgScore": round(float(r["avgScore"] or 0)),
                }
                for idx, r in enumerate(lb_rows)
            ]

    return {
        "mentorInfo": mentor_info,
        "avgProblemScore": avg_problem_score,
        "avgTaskScore": avg_task_score,
        "totalSubmissions": total_submissions,
        "totalTasks": total_tasks,
        "completedTasks": completed_tasks,
        "totalProblems": total_problems,
        "completedProblems": completed_problems,
        "totalAptitude": total_aptitude,
        "completedAptitude": completed_aptitude,
        "submissionTrends": submission_trends,
        "recentSubmissions": recent_submissions,
        "leaderboard": leaderboard,
    }


# --- Mentor Dashboard ---

@router.get("/mentor/{mentor_id}")
async def mentor_analytics(mentor_id: str, request: Request):
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "mentor" and mentor_id != actor_id and not can_view_all:
        raise HTTPException(status_code=403, detail="Mentors can only view their own analytics")
    if actor_role == "student":
        raise HTTPException(status_code=403, detail="Students cannot view mentor analytics")
    if actor_role not in ("admin", "organization_admin", "mentor") and not can_view_all:
        raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Allocated students with details
            await cur.execute(
                """SELECT u.id, u.name, u.email, u.created_at,
                          (SELECT COUNT(*) FROM submissions WHERE student_id = u.id) AS submissionCount,
                          (SELECT AVG(score) FROM submissions WHERE student_id = u.id) AS avgScore,
                          (SELECT COUNT(*) FROM task_completions WHERE student_id = u.id) AS tasksCompleted,
                          (SELECT COUNT(*) FROM problem_completions WHERE student_id = u.id) AS problemsCompleted,
                          (SELECT submitted_at FROM submissions WHERE student_id = u.id ORDER BY submitted_at DESC LIMIT 1) AS lastActive
                   FROM users u
                   JOIN mentor_student_allocations msa ON u.id = msa.student_id
                   WHERE msa.mentor_id = %s
                   ORDER BY u.name ASC""",
                (mentor_id,),
            )
            allocations = await cur.fetchall()

            student_ids = [a["id"] for a in allocations]
            allocated_students = [
                {
                    "id": s["id"],
                    "name": s["name"],
                    "email": s["email"],
                    "submissionCount": s["submissionCount"] or 0,
                    "avgScore": round(float(s["avgScore"] or 0)),
                    "tasksCompleted": s["tasksCompleted"] or 0,
                    "problemsCompleted": s["problemsCompleted"] or 0,
                    "lastActive": str(s["lastActive"]) if s["lastActive"] else None,
                    "joinedAt": str(s["created_at"]) if s["created_at"] else None,
                }
                for s in allocations
            ]

            if not student_ids:
                return {
                    "totalStudents": 0,
                    "totalSubmissions": 0,
                    "avgScore": 0,
                    "totalTasks": 0,
                    "totalProblems": 0,
                    "submissionTrends": [],
                    "languageStats": [],
                    "recentActivity": [],
                    "studentPerformance": [],
                    "allocatedStudents": [],
                }

            total_students = len(student_ids)
            ph = ",".join(["%s"] * len(student_ids))

            # Submission counts broken down
            await cur.execute(
                f"SELECT COUNT(*) AS cnt FROM task_completions WHERE student_id IN ({ph})",
                student_ids,
            )
            task_submissions = (await cur.fetchone())["cnt"]

            await cur.execute(
                f"SELECT COUNT(*) AS cnt FROM submissions WHERE student_id IN ({ph})",
                student_ids,
            )
            code_submissions = (await cur.fetchone())["cnt"]

            await cur.execute(
                f"SELECT COUNT(*) AS cnt FROM student_completed_aptitude WHERE student_id IN ({ph})",
                student_ids,
            )
            aptitude_submissions = (await cur.fetchone())["cnt"]

            total_submissions = task_submissions + code_submissions + aptitude_submissions

            # Average score
            await cur.execute(
                f"SELECT AVG(score) AS avg FROM submissions WHERE student_id IN ({ph})",
                student_ids,
            )
            avg_score = round(float((await cur.fetchone())["avg"] or 0))

            # Total content by mentor
            await cur.execute("SELECT COUNT(*) AS cnt FROM tasks WHERE mentor_id = %s", (mentor_id,))
            task_count = (await cur.fetchone())["cnt"]
            await cur.execute("SELECT COUNT(*) AS cnt FROM problems WHERE mentor_id = %s", (mentor_id,))
            prob_count = (await cur.fetchone())["cnt"]

            # Submission trends (last 7 days)
            await cur.execute(
                f"""SELECT DATE(submitted_at) AS date, COUNT(*) AS count
                    FROM submissions
                    WHERE student_id IN ({ph}) AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(submitted_at)
                    ORDER BY date ASC""",
                student_ids,
            )
            trends = await cur.fetchall()
            submission_trends = [
                {"date": t["date"].strftime("%b %d") if hasattr(t["date"], "strftime") else str(t["date"]), "count": t["count"]}
                for t in trends
            ]

            # Language stats
            await cur.execute(
                f"SELECT language, COUNT(*) AS value FROM submissions WHERE student_id IN ({ph}) GROUP BY language",
                student_ids,
            )
            lang_rows = await cur.fetchall()
            language_stats = [
                {"name": r["language"] or "Unknown", "value": r["value"]} for r in lang_rows
            ]

            # Recent activity
            await cur.execute(
                f"""SELECT s.id, u.name AS studentName, s.score, s.status, s.submitted_at AS time
                    FROM submissions s
                    JOIN users u ON s.student_id = u.id
                    WHERE s.student_id IN ({ph})
                    ORDER BY s.submitted_at DESC LIMIT 5""",
                student_ids,
            )
            recent_rows = await cur.fetchall()
            recent_activity = [
                {
                    "id": r["id"],
                    "studentName": r["studentName"],
                    "score": r["score"],
                    "status": r["status"],
                    "time": str(r["time"]) if r["time"] else "",
                }
                for r in recent_rows
            ]

            # Student performance (mentee performance)
            await cur.execute(
                f"""SELECT u.name, COUNT(s.id) AS count, AVG(s.score) AS score
                    FROM users u
                    JOIN submissions s ON u.id = s.student_id
                    WHERE u.id IN ({ph})
                    GROUP BY u.id
                    ORDER BY score DESC, count DESC
                    LIMIT 5""",
                student_ids,
            )
            perf_rows = await cur.fetchall()
            student_performance = [
                {"name": r["name"], "count": r["count"], "score": round(float(r["score"] or 0))}
                for r in perf_rows
            ]

    return {
        "totalStudents": total_students,
        "totalSubmissions": total_submissions,
        "taskSubmissions": task_submissions,
        "codeSubmissions": code_submissions,
        "aptitudeSubmissions": aptitude_submissions,
        "avgScore": avg_score,
        "totalTasks": task_count,
        "totalProblems": prob_count,
        "submissionTrends": submission_trends,
        "languageStats": language_stats,
        "recentActivity": recent_activity,
        "menteePerformance": student_performance,
        "allocatedStudents": allocated_students,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Topic / Plagiarism / Time-to-Solve / Learning-Path / Peer-Comparison
#  These are consumed by the StudentPortal "Insights" tabs and the
#  Admin/Mentor Analytics dashboards. They were missing from the
#  backend, causing 6 different 404s in the browser console.
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


@router.get("/topics")
async def topic_analysis(
    request: Request,
    studentId: str | None = Query(None),
    mentorId: str | None = Query(None),
):
    """Topic breakdowns by type / difficulty / language / problem.

    Scope:
      - studentId set    -> only that student's submissions
      - mentorId set     -> only the mentor's allocated students
      - neither          -> platform-wide (admin)
    """
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student":
        if mentorId:
            raise HTTPException(status_code=403, detail="Students cannot use mentor scope")
        if studentId and studentId != actor_id:
            raise HTTPException(status_code=403, detail="Students can only view own analytics")
        studentId = actor_id
    elif actor_role == "mentor" and not can_view_all:
        if mentorId and mentorId != actor_id:
            raise HTTPException(status_code=403, detail="Mentors can only use own mentor scope")
        if studentId:
            raise HTTPException(status_code=403, detail="Mentors must use own mentor scope")
        mentorId = actor_id
    elif actor_role not in ("admin", "organization_admin") and not can_view_all:
        raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            scope_sql = ""
            params: list = []
            if studentId:
                scope_sql = " AND s.student_id = %s"
                params = [studentId]
            elif mentorId:
                ids = await _allocated_student_ids(conn, mentorId)
                if not ids:
                    return {"byType": [], "byDifficulty": [], "byLanguage": [], "topProblems": []}
                ph = ",".join(["%s"] * len(ids))
                scope_sql = f" AND s.student_id IN ({ph})"
                params = ids

            # By type (problem vs task)
            await cur.execute(
                f"""SELECT
                       CASE WHEN s.problem_id IS NOT NULL THEN 'problem'
                            WHEN s.task_id    IS NOT NULL THEN 'task'
                            ELSE 'other' END                       AS type,
                       COUNT(*)                                    AS submissions,
                       COUNT(DISTINCT s.student_id)                AS uniqueStudents,
                       AVG(s.score)                                AS avgScore,
                       SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed,
                       SUM(CASE WHEN s.status='failed' THEN 1 ELSE 0 END) AS failed
                  FROM submissions s
                 WHERE 1=1 {scope_sql}
                 GROUP BY type""",
                params,
            )
            type_rows = await cur.fetchall()
            by_type = []
            for r in type_rows:
                total = max(int(r["submissions"] or 0), 1)
                by_type.append({
                    "type": r["type"],
                    "submissions": int(r["submissions"] or 0),
                    "uniqueStudents": int(r["uniqueStudents"] or 0),
                    "avgScore": round(float(r["avgScore"] or 0)),
                    "passRate": round((int(r["passed"] or 0) / total) * 100),
                    "failRate": round((int(r["failed"] or 0) / total) * 100),
                })

            # By difficulty (heuristic where the problems table doesn't
            # expose a difficulty column â€” use score buckets as a proxy).
            await cur.execute(
                f"""SELECT
                       CASE
                         WHEN s.score >= 70 THEN 'easy'
                         WHEN s.score >= 40 THEN 'medium'
                         ELSE 'hard'
                       END AS difficulty,
                       COUNT(*) AS submissions,
                       AVG(s.score) AS avgScore,
                       SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed
                  FROM submissions s
                 WHERE s.score IS NOT NULL {scope_sql}
                 GROUP BY difficulty
                 ORDER BY FIELD(difficulty,'easy','medium','hard')""",
                params,
            )
            diff_rows = await cur.fetchall()
            by_difficulty = []
            for r in diff_rows:
                total = max(int(r["submissions"] or 0), 1)
                by_difficulty.append({
                    "difficulty": r["difficulty"],
                    "submissions": int(r["submissions"] or 0),
                    "avgScore": round(float(r["avgScore"] or 0)),
                    "passRate": round((int(r["passed"] or 0) / total) * 100),
                })

            # By language
            await cur.execute(
                f"""SELECT s.language,
                          COUNT(*)                                          AS submissions,
                          AVG(s.score)                                      AS avgScore,
                          SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed
                     FROM submissions s
                    WHERE s.language IS NOT NULL {scope_sql}
                    GROUP BY s.language
                    ORDER BY submissions DESC""",
                params,
            )
            lang_rows = await cur.fetchall()
            by_language = []
            for r in lang_rows:
                total = max(int(r["submissions"] or 0), 1)
                by_language.append({
                    "language": r["language"] or "Unknown",
                    "submissions": int(r["submissions"] or 0),
                    "avgScore": round(float(r["avgScore"] or 0)),
                    "passRate": round((int(r["passed"] or 0) / total) * 100),
                })

            # Top problems (most attempted)
            await cur.execute(
                f"""SELECT p.title,
                          'problem'                            AS type,
                          'medium'                             AS difficulty,
                          COUNT(*)                             AS attempts,
                          AVG(s.score)                         AS avgScore,
                          SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed
                     FROM submissions s
                     JOIN problems p ON p.id = s.problem_id
                    WHERE s.problem_id IS NOT NULL {scope_sql}
                    GROUP BY p.id, p.title
                    ORDER BY attempts DESC
                    LIMIT 10""",
                params,
            )
            tp_rows = await cur.fetchall()
            top_problems = []
            for r in tp_rows:
                total = max(int(r["attempts"] or 0), 1)
                top_problems.append({
                    "title": r["title"],
                    "type": r["type"],
                    "difficulty": r["difficulty"],
                    "attempts": int(r["attempts"] or 0),
                    "avgScore": round(float(r["avgScore"] or 0)),
                    "passRate": round((int(r["passed"] or 0) / total) * 100),
                })

    return {
        "byType": by_type,
        "byDifficulty": by_difficulty,
        "byLanguage": by_language,
        "topProblems": top_problems,
    }


@router.get("/plagiarism")
async def plagiarism_analytics(
    request: Request,
    mentorId: str | None = Query(None),
):
    """Aggregate plagiarism flags across the platform / mentor's students."""
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student":
        raise HTTPException(status_code=403, detail="Students cannot access plagiarism analytics")
    if actor_role == "mentor" and not can_view_all:
        if mentorId and mentorId != actor_id:
            raise HTTPException(status_code=403, detail="Mentors can only use own mentor scope")
        mentorId = actor_id
    elif actor_role not in ("admin", "organization_admin", "mentor") and not can_view_all:
        raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()
    async with pool.acquire() as conn:
        plagiarism_filter = await _resolve_submission_plagiarism_filter(conn)
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            scope_sql = ""
            params: list = []
            if mentorId:
                ids = await _allocated_student_ids(conn, mentorId)
                if not ids:
                    return {
                        "stats": {"totalSubmissions": 0, "plagiarismCount": 0,
                                  "plagiarismRate": 0},
                        "repeatOffenders": [],
                        "byProblem": [],
                        "flaggedSubmissions": [],
                    }
                ph = ",".join(["%s"] * len(ids))
                scope_sql = f" AND s.student_id IN ({ph})"
                params = ids

            # Totals
            await cur.execute(
                f"SELECT COUNT(*) AS cnt FROM submissions s WHERE 1=1 {scope_sql}",
                params,
            )
            total_subs = (await cur.fetchone())["cnt"]
            await cur.execute(
                f"SELECT COUNT(*) AS cnt FROM submissions s "
                f"WHERE {plagiarism_filter} {scope_sql}",
                params,
            )
            plag_count = (await cur.fetchone())["cnt"]
            stats = {
                "totalSubmissions": int(total_subs or 0),
                "plagiarismCount": int(plag_count or 0),
                "plagiarismRate": round((plag_count / total_subs) * 100) if total_subs else 0,
            }

            # Repeat offenders
            await cur.execute(
                f"""SELECT u.id, u.name, COUNT(*) AS count,
                          GROUP_CONCAT(DISTINCT p.title) AS copiedFrom
                    FROM submissions s
                     JOIN users u    ON u.id = s.student_id
                LEFT JOIN problems p ON p.id = s.problem_id
                    WHERE {plagiarism_filter} {scope_sql}
                    GROUP BY u.id, u.name
                    ORDER BY count DESC
                    LIMIT 10""",
                params,
            )
            offender_rows = await cur.fetchall()
            offenders = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "count": int(r["count"] or 0),
                    "copiedFrom": (r["copiedFrom"] or "").split(",") if r["copiedFrom"] else [],
                }
                for r in offender_rows
            ]

            # Most-copied problems
            await cur.execute(
                f"""SELECT p.id, p.title, 'medium' AS difficulty,
                          COUNT(*) AS flaggedCount
                     FROM submissions s
                     JOIN problems p ON p.id = s.problem_id
                    WHERE {plagiarism_filter} {scope_sql}
                    GROUP BY p.id, p.title
                    ORDER BY flaggedCount DESC
                    LIMIT 10""",
                params,
            )
            by_problem = [
                {
                    "id": r["id"],
                    "title": r["title"],
                    "difficulty": r["difficulty"],
                    "flaggedCount": int(r["flaggedCount"] or 0),
                }
                for r in (await cur.fetchall())
            ]

            # Flagged submissions list
            await cur.execute(
                f"""SELECT s.id, u.name AS studentName, p.title AS problemTitle,
                          s.language, s.score, s.submitted_at AS time,
                          s.copied_from_name
                     FROM submissions s
                     JOIN users u    ON u.id = s.student_id
                LEFT JOIN problems p ON p.id = s.problem_id
                    WHERE {plagiarism_filter} {scope_sql}
                    ORDER BY s.submitted_at DESC
                    LIMIT 50""",
                params,
            )
            flagged = [
                {
                    "id": r["id"],
                    "studentName": r["studentName"],
                    "problemTitle": r["problemTitle"] or "â€”",
                    "language": r["language"],
                    "score": r["score"],
                    "copiedFrom": r.get("copied_from_name") or "",
                    "time": str(r["time"]) if r["time"] else "",
                }
                for r in (await cur.fetchall())
            ]

    return {
        "stats": stats,
        "repeatOffenders": offenders,
        "byProblem": by_problem,
        "flaggedSubmissions": flagged,
    }


@router.get("/time-to-solve")
async def time_to_solve(
    request: Request,
    mentorId: str | None = Query(None),
):
    """Approximate time-to-solve per problem & difficulty bucket.

    The submissions table doesn't store per-attempt wall-clock, so we
    approximate by measuring the *span* between a student's first and
    last submission for each problem. That gives a "time spent
    iterating until they got it right" estimate which is what the UI
    visualises.
    """
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student":
        raise HTTPException(status_code=403, detail="Students cannot access mentor/platform analytics")
    if actor_role == "mentor" and not can_view_all:
        if mentorId and mentorId != actor_id:
            raise HTTPException(status_code=403, detail="Mentors can only use own mentor scope")
        mentorId = actor_id
    elif actor_role not in ("admin", "organization_admin", "mentor") and not can_view_all:
        raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            scope_sql = ""
            params: list = []
            if mentorId:
                ids = await _allocated_student_ids(conn, mentorId)
                if not ids:
                    return {"problems": [], "difficultySummary": []}
                ph = ",".join(["%s"] * len(ids))
                scope_sql = f" AND s.student_id IN ({ph})"
                params = ids

            # Per-problem, per-student time span (only count students with
            # 2+ attempts so we have a real span to report).
            await cur.execute(
                f"""SELECT p.id, p.title, spans.span_seconds, spans.attempts
                     FROM (
                          SELECT s.problem_id,
                                 s.student_id,
                                 TIMESTAMPDIFF(SECOND, MIN(s.submitted_at), MAX(s.submitted_at)) AS span_seconds,
                                 COUNT(*) AS attempts
                            FROM submissions s
                           WHERE s.problem_id IS NOT NULL {scope_sql}
                           GROUP BY s.problem_id, s.student_id
                          HAVING COUNT(*) >= 2
                     ) spans
                     JOIN problems p ON p.id = spans.problem_id""",
                params,
            )
            rows = list(await cur.fetchall())

    # Aggregate per-problem in Python so we can also build difficultySummary
    # in one pass.
    by_problem: dict[str, dict] = {}
    for r in rows:
        secs = int(r["span_seconds"] or 0)
        if secs <= 0:
            continue
        slot = by_problem.setdefault(r["id"], {
            "id": r["id"], "title": r["title"], "difficulty": "medium",
            "_times": [], "_attempts": 0,
        })
        slot["_times"].append(secs)
        slot["_attempts"] += int(r["attempts"] or 0)

    problems = []
    for slot in by_problem.values():
        times = slot["_times"]
        if not times:
            continue
        problems.append({
            "id": slot["id"],
            "title": slot["title"],
            "difficulty": slot["difficulty"],
            "avgTime": round(sum(times) / len(times)),
            "minTime": min(times),
            "maxTime": max(times),
            "attempts": slot["_attempts"],
        })
    problems.sort(key=lambda x: -x["avgTime"])
    problems = problems[:20]

    # Difficulty summary derived from per-problem averages
    diff_buckets: dict[str, list[int]] = {"easy": [], "medium": [], "hard": []}
    for p in problems:
        diff_buckets[p["difficulty"]].append(p["avgTime"])
    difficulty_summary = [
        {
            "difficulty": d,
            "avgTime": round(sum(vals) / len(vals)) if vals else 0,
            "attempts": len(vals),
        }
        for d, vals in diff_buckets.items()
        if vals
    ]

    return {"problems": problems, "difficultySummary": difficulty_summary}


@router.get("/learning-path/{student_id}")
async def learning_path(student_id: str, request: Request):
    """Personalised insights: weak areas, strengths, language proficiency,
    and a short list of recommended problems.
    """
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student" and student_id != actor_id:
        raise HTTPException(status_code=403, detail="Students can only view own learning path")
    if actor_role == "mentor" and not can_view_all:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                try:
                    await cur.execute(
                        "SELECT 1 FROM mentor_student_allocations WHERE mentor_id=%s AND student_id=%s LIMIT 1",
                        (actor_id, student_id),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(status_code=403, detail="Student is not allocated to this mentor")
                except Exception as exc:
                    if _is_missing_table_error(exc):
                        raise HTTPException(status_code=403, detail="Mentor allocation data is unavailable")
                    raise
    if actor_role not in ("admin", "organization_admin", "mentor", "student") and not can_view_all:
        if student_id != actor_id:
            raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT COUNT(*) AS total,
                          SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) AS passed
                     FROM submissions WHERE student_id=%s""",
                (student_id,),
            )
            row = await cur.fetchone() or {}
            total = int(row.get("total") or 0)
            passed = int(row.get("passed") or 0)
            overall_pass_rate = round((passed / total) * 100) if total else 0

            # By category (we treat language as the category proxy since we
            # don't store an explicit topic taxonomy).
            await cur.execute(
                """SELECT s.language AS category,
                          COUNT(*) AS attempts,
                          AVG(s.score) AS avgScore,
                          SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed
                     FROM submissions s
                    WHERE s.student_id=%s AND s.language IS NOT NULL
                    GROUP BY s.language""",
                (student_id,),
            )
            cat_rows = await cur.fetchall()

    weak, strong, lang_prof = [], [], []
    for r in cat_rows:
        attempts = int(r["attempts"] or 0)
        if attempts == 0:
            continue
        avg = round(float(r["avgScore"] or 0))
        passed_n = int(r["passed"] or 0)
        pass_rate = round((passed_n / attempts) * 100)
        item = {
            "category": r["category"] or "Unknown",
            "attempts": attempts,
            "avgScore": avg,
            "passRate": pass_rate,
        }
        if avg < 50:
            weak.append(item)
        elif avg >= 70 and attempts >= 2:
            strong.append(item)
        level = "Advanced" if avg >= 80 else "Intermediate" if avg >= 50 else "Beginner"
        lang_prof.append({
            "language": r["category"] or "Unknown",
            "level": level,
            "avgScore": avg,
            "attempts": attempts,
        })

    # Recommendations: easiest problems the student hasn't solved yet.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT p.id, p.title, 'medium' AS difficulty, p.language
                     FROM problems p
                    WHERE p.id NOT IN (
                       SELECT s.problem_id FROM submissions s
                        WHERE s.student_id=%s AND s.problem_id IS NOT NULL AND s.status='passed'
                    )
                    ORDER BY p.created_at DESC
                    LIMIT 8""",
                (student_id,),
            )
            rec_rows = await cur.fetchall()

    recommendations = [
        {
            "id": r["id"],
            "title": r["title"],
            "difficulty": r["difficulty"],
            "language": r["language"],
            "priority": 5 if any(w["category"] == r["language"] for w in weak) else 2,
            "reason": (
                "Strengthen a weak area"
                if any(w["category"] == r["language"] for w in weak)
                else "Try something new"
            ),
        }
        for r in rec_rows
    ]

    return {
        "overallPassRate": overall_pass_rate,
        "totalPassed": passed,
        "totalAttempts": total,
        "weakAreas": sorted(weak, key=lambda w: w["avgScore"])[:5],
        "strengths": sorted(strong, key=lambda s: -s["avgScore"])[:5],
        "languageProficiency": lang_prof,
        "recommendations": recommendations,
    }


@router.get("/peer-comparison/{student_id}")
async def peer_comparison(student_id: str, request: Request):
    """Where the student stands relative to their cohort."""
    actor = await _get_actor_user(request)
    actor_id = actor["id"]
    actor_role = (actor.get("role") or "").lower()
    can_view_all = await _can_view_all_analytics(actor_id)
    if actor_role == "student" and student_id != actor_id:
        raise HTTPException(status_code=403, detail="Students can only view own peer comparison")
    if actor_role == "mentor" and not can_view_all:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                try:
                    await cur.execute(
                        "SELECT 1 FROM mentor_student_allocations WHERE mentor_id=%s AND student_id=%s LIMIT 1",
                        (actor_id, student_id),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(status_code=403, detail="Student is not allocated to this mentor")
                except Exception as exc:
                    if _is_missing_table_error(exc):
                        raise HTTPException(status_code=403, detail="Mentor allocation data is unavailable")
                    raise
    if actor_role not in ("admin", "organization_admin", "mentor", "student") and not can_view_all:
        if student_id != actor_id:
            raise HTTPException(status_code=403, detail="Forbidden scope")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            # Aggregates per student
            await cur.execute(
                """SELECT u.id, u.name,
                          COUNT(s.id) AS subs,
                          AVG(s.score) AS avgScore,
                          SUM(CASE WHEN s.status='passed' THEN 1 ELSE 0 END) AS passed,
                          (SELECT COUNT(DISTINCT problem_id) FROM submissions
                           WHERE student_id=u.id AND problem_id IS NOT NULL AND status='passed') AS problemsSolved,
                          (SELECT COUNT(*) FROM task_completions WHERE student_id=u.id) AS tasksDone
                     FROM users u
                LEFT JOIN submissions s ON s.student_id = u.id
                    WHERE u.role='student'
                    GROUP BY u.id, u.name"""
            )
            rows = list(await cur.fetchall())

    if not rows:
        return {
            "you": {"rank": 0, "totalStudents": 0, "percentile": 0,
                    "avgScore": 0, "passRate": 0, "totalSubmissions": 0,
                    "problemsSolved": 0, "tasksDone": 0},
            "classAverage": {"avgScore": 0, "avgPassRate": 0, "avgSubmissions": 0,
                             "avgProblemsSolved": 0, "avgTasksDone": 0},
            "scoreDistribution": [],
            "languageComparison": [],
        }

    enriched = []
    for r in rows:
        subs = int(r["subs"] or 0)
        passed = int(r["passed"] or 0)
        enriched.append({
            "id": r["id"],
            "name": r["name"],
            "avgScore": round(float(r["avgScore"] or 0)),
            "passRate": round((passed / subs) * 100) if subs else 0,
            "totalSubmissions": subs,
            "problemsSolved": int(r["problemsSolved"] or 0),
            "tasksDone": int(r["tasksDone"] or 0),
        })
    enriched.sort(key=lambda x: -x["avgScore"])
    total_students = len(enriched)
    me = next((s for s in enriched if s["id"] == student_id), None)
    if not me:
        me = {"id": student_id, "name": "You", "avgScore": 0, "passRate": 0,
              "totalSubmissions": 0, "problemsSolved": 0, "tasksDone": 0}
        enriched.append(me)
    rank = enriched.index(me) + 1
    percentile = round((1 - (rank - 1) / max(total_students, 1)) * 100)

    def avg(field: str) -> float:
        vals = [s[field] for s in enriched if s["id"] != student_id]
        return round(sum(vals) / len(vals), 1) if vals else 0

    class_avg = {
        "avgScore": avg("avgScore"),
        "avgPassRate": avg("passRate"),
        "avgSubmissions": avg("totalSubmissions"),
        "avgProblemsSolved": avg("problemsSolved"),
        "avgTasksDone": avg("tasksDone"),
    }

    # Score distribution (10-point buckets)
    buckets = [{"range": f"{i}-{i+9}", "count": 0, "isYou": False} for i in range(0, 100, 10)]
    for s in enriched:
        idx = min(s["avgScore"] // 10, 9)
        buckets[idx]["count"] += 1
        if s["id"] == student_id:
            buckets[idx]["isYou"] = True

    # Language comparison
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT language, AVG(score) AS yourScore
                     FROM submissions
                    WHERE student_id=%s AND language IS NOT NULL
                    GROUP BY language""",
                (student_id,),
            )
            your_langs = {r["language"]: round(float(r["yourScore"] or 0)) for r in await cur.fetchall()}

            await cur.execute(
                """SELECT language, AVG(score) AS classAvg
                     FROM submissions s
                     JOIN users u ON u.id = s.student_id
                    WHERE u.role='student' AND s.language IS NOT NULL AND u.id <> %s
                    GROUP BY language""",
                (student_id,),
            )
            class_langs = {r["language"]: round(float(r["classAvg"] or 0)) for r in await cur.fetchall()}

    languages = []
    for lang in set(your_langs) | set(class_langs):
        you_v = your_langs.get(lang, 0)
        class_v = class_langs.get(lang, 0)
        languages.append({
            "language": lang,
            "yourScore": you_v,
            "classAvg": class_v,
            "difference": you_v - class_v,
        })
    languages.sort(key=lambda x: -x["yourScore"])

    return {
        "you": {
            "rank": rank,
            "totalStudents": total_students,
            "percentile": percentile,
            **{k: me[k] for k in ("avgScore", "passRate", "totalSubmissions",
                                  "problemsSolved", "tasksDone")},
        },
        "classAverage": class_avg,
        "scoreDistribution": buckets,
        "languageComparison": languages,
    }


# --- Export (admin platform-wide, or mentor-scoped via mentorId) ---


async def _export_bundle(request: Request, mentor_id: str | None) -> dict:
    """Snapshot of dashboard + the same insight endpoints the portals load."""
    topics = await topic_analysis(request=request, studentId=None, mentorId=mentor_id)
    plag = await plagiarism_analytics(request=request, mentorId=mentor_id)
    tts = await time_to_solve(request=request, mentorId=mentor_id)
    if mentor_id:
        dashboard = await mentor_analytics(mentor_id, request=request)
    else:
        await _require_admin(request)
        dashboard = await admin_analytics()
    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "mentor" if mentor_id else "platform",
        "mentorId": mentor_id,
        "dashboard": dashboard,
        "topics": topics,
        "plagiarism": plag,
        "timeToSolve": tts,
    }


def _csv_write_scalar_block(writer: csv.writer, title: str, data: dict) -> None:
    writer.writerow([f"=== {title} (scalars) ==="])
    writer.writerow(["key", "value"])
    for k, v in sorted(data.items(), key=lambda x: x[0]):
        if isinstance(v, (list, dict)):
            continue
        writer.writerow([k, v])


def _csv_write_table(writer: csv.writer, title: str, rows: list) -> None:
    if not rows or not isinstance(rows, list):
        return
    writer.writerow([f"=== {title} ==="])
    if not isinstance(rows[0], dict):
        writer.writerow(rows)
        return
    headers = list(rows[0].keys())
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h, "") for h in headers])


def _bundle_to_csv(bundle: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["exportedAt", bundle["exportedAt"]])
    w.writerow(["scope", bundle["scope"]])
    if bundle.get("mentorId"):
        w.writerow(["mentorId", bundle["mentorId"]])
    w.writerow([])

    dash = bundle.get("dashboard") or {}
    _csv_write_scalar_block(w, "dashboard", dash)
    for list_key in (
        "submissionTrends",
        "languageStats",
        "recentSubmissions",
        "studentPerformance",
        "recentActivity",
        "menteePerformance",
        "allocatedStudents",
    ):
        if list_key in dash and isinstance(dash[list_key], list):
            _csv_write_table(w, f"dashboard.{list_key}", dash[list_key])
    w.writerow([])

    topics = bundle.get("topics") or {}
    for sub in ("byType", "byDifficulty", "byLanguage", "topProblems"):
        if isinstance(topics.get(sub), list):
            _csv_write_table(w, f"topics.{sub}", topics[sub])
    w.writerow([])

    plag = bundle.get("plagiarism") or {}
    if isinstance(plag.get("stats"), dict):
        _csv_write_scalar_block(w, "plagiarism.stats", plag["stats"])
    for sub, title in (
        ("repeatOffenders", "plagiarism.repeatOffenders"),
        ("byProblem", "plagiarism.byProblem"),
        ("flaggedSubmissions", "plagiarism.flaggedSubmissions"),
    ):
        if isinstance(plag.get(sub), list):
            _csv_write_table(w, title, plag[sub])
    w.writerow([])

    tts = bundle.get("timeToSolve") or {}
    if isinstance(tts.get("problems"), list):
        _csv_write_table(w, "timeToSolve.problems", tts["problems"])
    if isinstance(tts.get("difficultySummary"), list):
        _csv_write_table(w, "timeToSolve.difficultySummary", tts["difficultySummary"])

    return buf.getvalue()


@router.get("/export/json")
async def export_analytics_json(request: Request, mentorId: str | None = Query(None)):
    """Download full analytics snapshot as JSON (platform or mentor-scoped)."""
    await _require_export(request)
    bundle = await _export_bundle(request, mentorId)
    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_ANALYTICS_EXPORTED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="analytics",
        action="Export analytics JSON",
        details={"mentorId": mentorId},
    )
    return bundle


@router.get("/export/csv")
async def export_analytics_csv(request: Request, mentorId: str | None = Query(None)):
    """Download analytics snapshot as CSV sections (platform or mentor-scoped)."""
    await _require_export(request)
    bundle = await _export_bundle(request, mentorId)
    payload = _bundle_to_csv(bundle)
    audit_logger.log_event(
        event_type=AuditEventType.ADMIN_ANALYTICS_EXPORTED,
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="analytics",
        action="Export analytics CSV",
        details={"mentorId": mentorId},
    )
    return Response(
        content="\ufeff" + payload,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="analytics_export.csv"',
        },
    )


@router.get("/audit-logs")
async def get_audit_logs(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    event_type: str | None = Query(None),
    user_id_filter: str | None = Query(None, alias="userId"),
):
    """Return paginated audit log entries. Org-admin or super-admin only."""
    auth_role = getattr(request.state, "auth_role", "") or ""
    actor = getattr(request.state, "auth_user_id", None) or ""
    org_id = getattr(request.state, "organization_id", None) or ""
    is_org_admin = auth_role == "organization_admin"
    is_super_admin = auth_role == "admin"
    if not (is_org_admin or is_super_admin):
        raise HTTPException(status_code=403, detail="Admin permission required")

    # Audit events are written to the primary DB — always read from there.
    pool = await get_primary_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            conditions = []
            params: list = []
            # Org admins see only their own org's events.
            if is_org_admin and org_id:
                conditions.append("organization_id = %s")
                params.append(org_id)
            if event_type:
                conditions.append("event_type = %s")
                params.append(event_type)
            if user_id_filter:
                conditions.append("user_id = %s")
                params.append(user_id_filter)
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            try:
                await cur.execute(
                    f"SELECT id, event_type, user_id, ip_address, resource_type, resource_id, action, details, created_at "
                    f"FROM audit_events {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
                    [*params, limit, offset],
                )
                rows = await cur.fetchall()
                await cur.execute(f"SELECT COUNT(*) AS total FROM audit_events {where}", params)
                count_row = await cur.fetchone()
            except Exception:
                rows = []
                count_row = {"total": 0}

    def _fmt(row):
        r = dict(row)
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("details"), str):
            try:
                r["details"] = json.loads(r["details"])
            except Exception:
                pass
        return r

    return {
        "logs": [_fmt(r) for r in rows],
        "total": int((count_row or {}).get("total") or 0),
        "limit": limit,
        "offset": offset,
    }


@router.get("/system-errors")
async def get_system_errors(
    request: Request,
    hours: int = Query(24, ge=1, le=168),
):
    """Return system error counts and recent errors for the error monitoring dashboard. Admin only."""
    auth_role = getattr(request.state, "auth_role", "") or ""
    org_id = getattr(request.state, "organization_id", None) or ""
    is_org_admin = auth_role == "organization_admin"
    is_super_admin = auth_role == "admin"
    if not (is_org_admin or is_super_admin):
        raise HTTPException(status_code=403, detail="Admin permission required")

    org_clause = "AND organization_id = %s" if (is_org_admin and org_id) else ""
    org_param = [org_id] if (is_org_admin and org_id) else []

    pool = await get_primary_pool()
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            try:
                await cur.execute(
                    f"SELECT event_type, COUNT(*) AS count FROM audit_events "
                    f"WHERE event_type IN ('SYSTEM_ERROR','DATABASE_QUERY_ERROR','ACCESS_DENIED','PERMISSION_DENIED') "
                    f"AND created_at >= %s {org_clause} GROUP BY event_type ORDER BY count DESC",
                    [since, *org_param],
                )
                summary = await cur.fetchall()
                await cur.execute(
                    f"SELECT id, event_type, user_id, ip_address, resource_type, action, details, created_at "
                    f"FROM audit_events "
                    f"WHERE event_type IN ('SYSTEM_ERROR','DATABASE_QUERY_ERROR','ACCESS_DENIED','PERMISSION_DENIED') "
                    f"AND created_at >= %s {org_clause} ORDER BY created_at DESC LIMIT 50",
                    [since, *org_param],
                )
                recent = await cur.fetchall()
            except Exception:
                summary = []
                recent = []

    def _fmt(row):
        r = dict(row)
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("details"), str):
            try:
                r["details"] = json.loads(r["details"])
            except Exception:
                pass
        return r

    return {
        "hours": hours,
        "summary": [dict(r) for r in summary],
        "recent_errors": [_fmt(r) for r in recent],
        "total_errors": sum(int(r.get("count") or 0) for r in summary),
    }
