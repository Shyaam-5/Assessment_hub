"""Submission routes with AI evaluation, plagiarism detection, and SQL execution."""

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Form, File, UploadFile, Request, Depends
from pydantic import BaseModel

import pymysql.cursors
from database import get_pool
from config import settings
from services.ai_service import cerebras_chat
from services.pagination import paginated_response
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["submissions"])
audit_logger = get_audit_logger()

PISTON_URL = "https://emkc.org/api/v2/piston/execute"


async def _require_actor(request: Request):
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id FROM users WHERE id = %s LIMIT 1", (actor,))
            if not await cur.fetchone():
                raise HTTPException(status_code=401, detail="Invalid user context")


router.dependencies.append(Depends(_require_actor))


async def _get_actor_user(request: Request) -> dict[str, Any]:
    actor = (getattr(request.state, "auth_user_id", None) or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Missing user context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT id, role, mentor_id FROM users WHERE id = %s LIMIT 1",
                (actor,),
            )
            user = await cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="Invalid user context")
            return user


async def _can_manage_all_submissions(user_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """
                SELECT 1
                FROM user_role_assignments ura
                JOIN role_permissions rp ON rp.role_id = ura.role_id
                WHERE ura.user_id = %s
                  AND rp.permission_key IN ('submissions.manage', 'submissions.view_all')
                LIMIT 1
                """,
                (user_id,),
            )
            return bool(await cur.fetchone())


def _client_ip(request: Request) -> str:
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "cf-connecting-ip" in request.headers:
        return request.headers["cf-connecting-ip"]
    return request.client.host if request.client else "UNKNOWN"


# â”€â”€â”€ Request Bodies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SubmissionCreate(BaseModel):
    studentId: str
    problemId: str | None = None
    taskId: str | None = None
    language: str
    code: str
    submissionType: str | None = "editor"
    fileName: str | None = None
    tabSwitches: int | None = 0


class MLTaskSubmission(BaseModel):
    studentId: str
    taskId: str
    submissionType: str  # 'file' | 'github'
    code: str | None = None
    githubUrl: str | None = None
    taskTitle: str | None = None
    taskDescription: str | None = None
    taskRequirements: str | None = None
    fileName: str | None = None


class ProctoredSubmission(BaseModel):
    studentId: str
    problemId: str
    language: str
    code: str
    submissionType: str | None = "editor"
    tabSwitches: int | None = 0
    copyPasteAttempts: int | None = 0
    cameraBlockedCount: int | None = 0
    phoneDetectionCount: int | None = 0
    timeSpent: int | None = 0
    faceNotDetectedCount: int | None = 0
    multipleFacesDetectionCount: int | None = 0
    faceLookawayCount: int | None = 0
    proctored: bool | None = False


# â”€â”€â”€ SQL helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _parse_sql_output(output: str) -> list[list[str]] | None:
    if not output or not output.strip():
        return None
    lines = [
        l for l in output.strip().split("\n")
        if l.strip() and not re.match(r"^[\-\+\|\=\s]+$", l.strip())
    ]
    if not lines:
        return None
    rows: list[list[str]] = []
    for line in lines:
        if "|" in line:
            values = [v.strip() for v in line.split("|") if v.strip()]
        else:
            values = [v.strip() for v in re.split(r"\s{2,}", line.strip()) if v.strip()]
        if values:
            rows.append(values)
    return rows


def _normalise(val: str) -> str:
    return re.sub(r'\s+', ' ', val.lower().strip()) if val else ""


def _compare_sql_outputs(actual: list | None, expected: list | None) -> bool:
    if actual is None or expected is None:
        return False
    if len(actual) != len(expected):
        return False
    sort_key = lambda rows: sorted(["|".join(_normalise(v) for v in r) for r in rows])
    return sort_key(actual) == sort_key(expected)


async def _run_sql_via_piston(schema: str, code: str) -> dict:
    full_query = f".headers on\n.mode list\n{schema}\n\n{code}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(PISTON_URL, json={
            "language": "sqlite3",
            "version": "3.36.0",
            "files": [{"content": full_query}],
        })
    return resp.json()


def _evaluate_sql(data: dict, expected_result: str) -> dict:
    actual_output = (data.get("run", {}).get("output", "") or "").strip()
    executed_ok = data.get("run", {}).get("code") == 0
    actual_parsed = _parse_sql_output(actual_output)
    expected_parsed = _parse_sql_output(expected_result.strip())
    is_correct = _compare_sql_outputs(actual_parsed, expected_parsed)

    if executed_ok and is_correct:
        return {
            "score": 100, "status": "accepted",
            "feedback": "Excellent! Your SQL query is correct and produces the expected output.",
            "aiExplanation": "Query executed successfully and output matches expected result exactly.",
            "analysis": {"correctness": "Excellent", "efficiency": "Good", "codeStyle": "Good", "bestPractices": "Good"},
        }
    elif executed_ok:
        return {
            "score": 30, "status": "rejected",
            "feedback": "Your query executes but does not produce the expected output.",
            "aiExplanation": "Query executed but output does not match.",
            "analysis": {"correctness": "Poor", "efficiency": "Fair", "codeStyle": "Fair", "bestPractices": "Fair"},
        }
    else:
        return {
            "score": 0, "status": "rejected",
            "feedback": "Your SQL query has syntax errors or fails to execute.",
            "aiExplanation": f"SQL execution failed: {actual_output[:200]}",
            "analysis": {"correctness": "Poor", "efficiency": "N/A", "codeStyle": "Poor", "bestPractices": "Poor"},
        }


# â”€â”€â”€ Penalty helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _apply_penalties(
    score: int,
    feedback: str,
    language: str,
    tab_switches: int = 0,
    plagiarism_detected: bool = False,
    copy_paste: int = 0,
    camera_blocked: int = 0,
    phone_detected: int = 0,
    face_not_detected: int = 0,
    multiple_faces: int = 0,
    face_lookaway: int = 0,
) -> tuple[int, str, bool]:
    """Return (final_score, updated_feedback, integrity_violation)."""
    integrity = False
    if language == "SQL":
        return score, feedback, False

    if tab_switches > 0:
        pen = min(tab_switches * 5, 25)
        score = max(0, score - pen)
        # OR-accumulate so reordering the penalty checks below can't ever
        # silently flip integrity from True back to False.
        integrity = integrity or (tab_switches >= 3)
        feedback += f"\n\nâš ï¸ Penalty: -{pen} points for {tab_switches} tab switches."

    if plagiarism_detected:
        score = max(0, int(score * 0.3))
        integrity = True
        feedback += "\n\nâš ï¸ Academic Integrity Warning: Plagiarism detected. Score reduced by 70%."

    if copy_paste > 0:
        pen = min(copy_paste * 3, 15)
        score = max(0, score - pen)
        feedback += f"\n\nâš ï¸ Penalty: -{pen} points for copy/paste attempts."

    if camera_blocked > 0:
        pen = min(camera_blocked * 10, 30)
        score = max(0, score - pen)
        if camera_blocked >= 2:
            integrity = True
        feedback += f"\n\nâš ï¸ High Penalty: -{pen} points for camera obstruction."

    if phone_detected > 0:
        pen = min(phone_detected * 15, 45)
        score = max(0, score - pen)
        integrity = True
        feedback += f"\n\nâ›” Severe Penalty: -{pen} points for phone detection."

    if face_not_detected > 0:
        pen = min(face_not_detected * 5, 25)
        score = max(0, score - pen)
        feedback += f"\n\nâš ï¸ Penalty: -{pen} points for face not detected ({face_not_detected} times)."

    if multiple_faces > 0:
        pen = min(20 * multiple_faces, 60)
        score = max(0, score - pen)
        integrity = True
        feedback += f"\n\nâ›” Severe Penalty: -{pen} points for multiple people detected."

    if face_lookaway > 0:
        pen = min(face_lookaway * 3, 15)
        score = max(0, score - pen)
        feedback += f"\n\nâš ï¸ Penalty: -{pen} points for looking away from screen ({face_lookaway} times)."

    return score, feedback, integrity


def _final_status(score: int) -> str:
    if score >= 70:
        return "accepted"
    if score >= 40:
        return "partial"
    return "rejected"


def _extract_json(text: str) -> dict:
    """Extract the first complete JSON object from text (non-greedy)."""
    # Try direct parse first
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass
    # Find JSON block in markdown
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Fallback: find first { ... } pair (non-greedy at inner level)
    m = re.search(r'(\{[\s\S]*\})', text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


# â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/submissions")
async def list_submissions(
    request: Request,
    studentId: str | None = None,
    mentorId: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    actor_user = await _get_actor_user(request)
    actor_id = actor_user["id"]
    actor_role = (actor_user.get("role") or "").lower()
    has_manage_all = await _can_manage_all_submissions(actor_id)

    # Student scope: only self
    if actor_role == "student":
        if mentorId:
            raise HTTPException(status_code=403, detail="Students cannot query mentor scope")
        if studentId and studentId != actor_id:
            raise HTTPException(status_code=403, detail="Students can only view own submissions")
        studentId = actor_id

    # Mentor scope: only allocated students unless privileged
    if actor_role == "mentor" and not has_manage_all:
        if mentorId and mentorId != actor_id:
            raise HTTPException(status_code=403, detail="Mentors can only query their own mentees")
        mentorId = actor_id
        if studentId:
            pool = await get_pool()
            async with pool.acquire() as conn:
                async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                    await cur.execute(
                        """
                        SELECT 1 FROM mentor_student_allocations
                        WHERE mentor_id = %s AND student_id = %s
                        LIMIT 1
                        """,
                        (actor_id, studentId),
                    )
                    if not await cur.fetchone():
                        raise HTTPException(status_code=403, detail="Student is not allocated to this mentor")

    # Non-admin/non-mentor roles: self only
    if actor_role not in ("admin", "organization_admin", "mentor", "student") and not has_manage_all:
        if mentorId:
            raise HTTPException(status_code=403, detail="Forbidden scope")
        if studentId and studentId != actor_id:
            raise HTTPException(status_code=403, detail="Forbidden scope")
        studentId = actor_id

    # Admin-like users can query freely.
    pool = await get_pool()
    offset = (page - 1) * limit
    params: list = []
    where: list[str] = []

    if studentId:
        where.append("s.student_id = %s")
        params.append(studentId)
    if mentorId:
        where.append("u.mentor_id = %s")
        params.append(mentorId)

    where_sql = (" AND " + " AND ".join(where)) if where else ""

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                f"SELECT COUNT(*) AS total FROM submissions s JOIN users u ON s.student_id = u.id WHERE 1=1{where_sql}",
                params,
            )
            total = (await cur.fetchone())["total"]

            await cur.execute(
                f"""
                SELECT s.*, u.name AS studentName, u.mentor_id,
                       p.title AS problemTitle, t.title AS taskTitle
                FROM submissions s
                JOIN users u ON s.student_id = u.id
                LEFT JOIN problems p ON s.problem_id = p.id
                LEFT JOIN tasks t ON s.task_id = t.id
                WHERE 1=1{where_sql}
                ORDER BY s.submitted_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = await cur.fetchall()

    data = []
    for s in rows:
        data.append({
            "id": s["id"],
            "studentId": s["student_id"],
            "studentName": s.get("studentName"),
            "problemId": s.get("problem_id"),
            "taskId": s.get("task_id"),
            "itemTitle": s.get("problemTitle") or s.get("taskTitle") or "Unknown",
            "code": s.get("code"),
            "submissionType": s.get("submission_type"),
            "isMLTask": (s.get("submission_type") or "").startswith("ml-"),
            "fileName": s.get("file_name"),
            "language": s.get("language"),
            "score": s.get("score"),
            "status": s.get("status"),
            "feedback": s.get("feedback"),
            "aiExplanation": s.get("ai_explanation"),
            "analysis": {
                "correctness": s.get("analysis_correctness"),
                "efficiency": s.get("analysis_efficiency"),
                "codeStyle": s.get("analysis_code_style"),
                "bestPractices": s.get("analysis_best_practices"),
            },
            "plagiarism": {
                "detected": s.get("plagiarism_detected") == "true",
                "copiedFrom": s.get("copied_from"),
                "copiedFromName": s.get("copied_from_name"),
            },
            "integrity": {
                "tabSwitches": s.get("tab_switches"),
                "integrityViolation": s.get("integrity_violation") == "true",
            },
            "tabSwitches": s.get("tab_switches") or 0,
            "copyPasteAttempts": s.get("copy_paste_attempts") or 0,
            "cameraBlockedCount": s.get("camera_blocked_count") or 0,
            "phoneDetectionCount": s.get("phone_detection_count") or 0,
            "proctoringVideo": s.get("proctoring_video"),
            "submittedAt": str(s.get("submitted_at", "")),
        })

    audit_logger.log_data_access(
        user_id=getattr(request.state, "auth_user_id", None) or "anonymous",
        ip_address=_client_ip(request),
        resource_type="submissions",
        query_params={"studentId": studentId, "mentorId": mentorId, "page": page, "limit": limit},
        record_count=len(data),
    )
    return paginated_response(data=data, total=total, page=page, limit=limit)


@router.post("/submissions")
async def create_submission(body: SubmissionCreate, request: Request):
    actor_user = await _get_actor_user(request)
    actor_id = actor_user["id"]
    actor_role = (actor_user.get("role") or "").lower()
    if actor_role in ("student", "learner") and body.studentId != actor_id:
        raise HTTPException(status_code=403, detail="Students can submit only for themselves")

    pool = await get_pool()
    submission_id = str(uuid.uuid4())
    submitted_at = datetime.now(timezone.utc)

    # 1. Get problem context
    problem_context = ""
    if body.problemId:
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT * FROM problems WHERE id = %s", (body.problemId,))
                prob = await cur.fetchone()
        if prob:
            problem_context = (
                f"Problem: {prob['title']}\nDescription: {prob['description']}\n"
                f"Difficulty: {prob['difficulty']}\nSample Input: {prob.get('sample_input','N/A')}\n"
                f"Expected Output: {prob.get('expected_output','N/A')}"
            )

    # 2. Plagiarism check (skip SQL)
    plagiarism = {"detected": False, "copiedFrom": None, "copiedFromName": None, "similarity": 0}
    if body.problemId and body.language != "SQL":
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute(
                    """SELECT s.id, s.student_id, s.code, u.name AS student_name
                       FROM submissions s JOIN users u ON s.student_id = u.id
                       WHERE s.problem_id = %s AND s.student_id != %s
                       ORDER BY s.submitted_at DESC LIMIT 20""",
                    (body.problemId, body.studentId),
                )
                other_subs = await cur.fetchall()

        if other_subs:
            others_text = "\n\n".join(
                f"--- Submission {i+1} by {s['student_name']} ---\n{s['code']}"
                for i, s in enumerate(other_subs)
            )
            try:
                plag_resp = await cerebras_chat(
                    [
                        {"role": "system", "content": "You are a plagiarism detection system. Analyze code for copying."},
                        {"role": "user", "content": f"Submitted Code:\n{body.code}\n\nOther Submissions:\n{others_text}\n\nRespond JSON: {{\"detected\":bool,\"similarity\":0-100,\"matchedSubmissionIndex\":null or int,\"explanation\":\"\"}}. Only detected if >80%."},
                    ],
                    model=settings.GROQ_MODEL, temperature=0.1, max_tokens=300,
                    response_format={"type": "json_object"},
                )
                pr = json.loads(plag_resp.get("choices", [{}])[0].get("message", {}).get("content", "{}"))
                idx = pr.get("matchedSubmissionIndex")
                # Guard against negative/None indices: AI sometimes returns -1 or
                # an out-of-range int, and Python's negative indexing would
                # otherwise pick the wrong student from the end of the list.
                if (
                    pr.get("detected")
                    and isinstance(idx, int)
                    and 0 <= idx < len(other_subs)
                ):
                    matched = other_subs[idx]
                    plagiarism = {"detected": True, "copiedFrom": matched["student_id"], "copiedFromName": matched["student_name"], "similarity": pr.get("similarity", 85)}
            except Exception as e:
                print(f"Plagiarism check error: {e}")

    # 3. Evaluate
    eval_result: dict[str, Any] = {"score": 0, "status": "rejected", "feedback": "Evaluation pending...", "aiExplanation": "", "analysis": {}}

    if body.language == "SQL" and body.problemId:
        # Fetch problem for schema
        async with pool.acquire() as conn:
            async with conn.cursor(pymysql.cursors.DictCursor) as cur:
                await cur.execute("SELECT * FROM problems WHERE id = %s", (body.problemId,))
                prob = await cur.fetchone()
        if prob and prob.get("sql_schema") and prob.get("expected_query_result"):
            try:
                data = await _run_sql_via_piston(prob["sql_schema"], body.code)
                eval_result = _evaluate_sql(data, prob["expected_query_result"])
            except Exception as e:
                eval_result = {"score": 0, "status": "rejected", "feedback": f"SQL Eval Error: {e}", "analysis": {}}
    else:
        # AI evaluation for non-SQL
        prompt = f"""You are an expert code evaluator.

{problem_context}

Language: {body.language}
Tab Switches: {body.tabSwitches or 0}

Student's Code:
{body.code}

Evaluate: correctness, efficiency, code style, best practices.
Respond JSON: {{"score":0-100,"status":"accepted|partial|rejected","feedback":"...","aiExplanation":"...","analysis":{{"correctness":"...","efficiency":"...","codeStyle":"...","bestPractices":"..."}}}}"""
        try:
            ai = await cerebras_chat(
                [{"role": "system", "content": "You are an expert code evaluator."}, {"role": "user", "content": prompt}],
                model=settings.GROQ_MODEL, temperature=0.2, max_tokens=800,
                response_format={"type": "json_object"},
            )
            eval_result = _extract_json(ai.get("choices", [{}])[0].get("message", {}).get("content", "{}"))
        except Exception as e:
            print(f"AI Eval error: {e}")

    # 4. Apply penalties
    final_score, feedback, integrity_violation = _apply_penalties(
        eval_result.get("score", 0),
        eval_result.get("feedback", ""),
        body.language,
        tab_switches=body.tabSwitches or 0,
        plagiarism_detected=plagiarism["detected"],
    )
    final_status = _final_status(final_score)
    analysis = eval_result.get("analysis", {})

    # 5. Save to DB
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO submissions (
                    id, student_id, problem_id, task_id, code, submission_type, file_name, language,
                    score, status, feedback, ai_explanation,
                    analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                    plagiarism_detected, copied_from, copied_from_name,
                    tab_switches, integrity_violation, submitted_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    submission_id, body.studentId, body.problemId, body.taskId, body.code,
                    body.submissionType, body.fileName, body.language,
                    final_score, final_status, feedback,
                    eval_result.get("aiExplanation", ""),
                    analysis.get("correctness"), analysis.get("efficiency"),
                    analysis.get("codeStyle"), analysis.get("bestPractices"),
                    "true" if plagiarism["detected"] else "false",
                    plagiarism.get("copiedFrom"), plagiarism.get("copiedFromName"),
                    body.tabSwitches or 0,
                    "true" if integrity_violation else "false",
                    submitted_at,
                ),
            )

            # Mark completion if score >= 70
            if body.problemId and final_score >= 70:
                try:
                    await cur.execute(
                        "INSERT IGNORE INTO problem_completions (problem_id, student_id, completed_at) VALUES (%s,%s,%s)",
                        (body.problemId, body.studentId, submitted_at),
                    )
                except Exception:
                    pass

    audit_logger.log_event(
        event_type=AuditEventType.SUBMISSION_CREATED,
        user_id=actor_id,
        ip_address=_client_ip(request),
        resource_id=submission_id,
        resource_type="submission",
        action="Standard submission created",
        details={
            "problemId": body.problemId,
            "taskId": body.taskId,
            "language": body.language,
            "score": final_score,
            "status": final_status,
            "plagiarism": plagiarism["detected"],
            "integrity_violation": integrity_violation,
        },
    )
    return {
        "id": submission_id,
        "score": final_score,
        "status": final_status,
        "feedback": feedback,
        "aiExplanation": eval_result.get("aiExplanation", ""),
        "analysis": analysis,
        "plagiarism": {
            "detected": plagiarism["detected"],
            "warning": "Similarity detected with another submission." if plagiarism["detected"] else None,
        },
        "integrity": {
            "tabSwitches": body.tabSwitches or 0,
            "violation": integrity_violation,
        },
        "submittedAt": str(submitted_at),
    }


@router.post("/submissions/ml-task")
async def ml_task_submission(body: MLTaskSubmission, request: Request):
    actor_user = await _get_actor_user(request)
    actor_id = actor_user["id"]
    actor_role = (actor_user.get("role") or "").lower()
    if actor_role in ("student", "learner") and body.studentId != actor_id:
        raise HTTPException(status_code=403, detail="Students can submit only for themselves")

    if not body.studentId or not body.taskId:
        raise HTTPException(400, "Missing studentId or taskId")

    content = ""
    if body.submissionType == "file":
        if not body.code:
            raise HTTPException(400, "Code missing for file submission")
        content = body.code
    elif body.submissionType == "github":
        if not body.githubUrl:
            raise HTTPException(400, "GitHub URL missing")
        content = f"GitHub Repository: {body.githubUrl}"
    else:
        raise HTTPException(400, "Invalid submission type")

    prompt = f"""You are an expert ML Mentor. Evaluate this submission.

Task: {body.taskTitle}
Description: {body.taskDescription}
Requirements: {body.taskRequirements}

Student Submission ({body.submissionType}):
{content[:50000]}

Return strict JSON:
{{"score":0-100,"status":"accepted|rejected","summary":"...","strengths":["..."],"suggestion_points":["..."],
  "metrics":{{"Correctness":0-100,"Code Quality":0-100,"Documentation":0-100,"Model Performance":0-100}},
  "detailed_feedback":"...","next_steps":"..."}}"""

    try:
        ai = await cerebras_chat(
            [{"role": "system", "content": "You are an AI evaluator for ML tasks. Respond with valid JSON only."},
             {"role": "user", "content": prompt}],
            temperature=0.2, max_tokens=4000,
            response_format={"type": "json_object"},
        )
        ai_result = _extract_json(ai.get("choices", [{}])[0].get("message", {}).get("content", "{}"))
        ai_result.setdefault("score", 0)
        ai_result["breakdown"] = ai_result.get("metrics", {})
        ai_result["feedback"] = ai_result.get("detailed_feedback", "")
    except Exception as e:
        ai_result = {
            "score": 50, "status": "error",
            "summary": "AI Evaluation Service Error.",
            "feedback": str(e),
            "metrics": {"Availability": 0},
        }

    # Save to DB (background â€” don't block response)
    try:
        pool = await get_pool()
        sub_id = str(uuid.uuid4())
        ml_type = "ml-file" if body.submissionType == "file" else "ml-github"
        code_content = body.code if body.submissionType == "file" else body.githubUrl

        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO submissions (
                        id, student_id, problem_id, task_id, code, submission_type, file_name, language,
                        score, status, feedback, ai_explanation,
                        analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                        plagiarism_detected, tab_switches, integrity_violation, submitted_at
                    ) VALUES (%s,%s,NULL,%s,%s,%s,%s,'ML',%s,%s,%s,%s,%s,%s,%s,%s,'false',0,'false',NOW())""",
                    (
                        sub_id, body.studentId, body.taskId, code_content, ml_type, body.fileName,
                        ai_result.get("score", 0), ai_result.get("status", "accepted"),
                        ai_result.get("feedback", ""), ai_result.get("summary", ""),
                        f"{ai_result.get('metrics',{}).get('Correctness','N/A')}/100",
                        f"{ai_result.get('metrics',{}).get('Code Quality','N/A')}/100",
                        f"{ai_result.get('metrics',{}).get('Documentation','N/A')}/100",
                        f"{ai_result.get('metrics',{}).get('Model Performance','N/A')}/100",
                    ),
                )
                if (ai_result.get("score", 0) >= 60) or ai_result.get("status") == "accepted":
                    try:
                        await cur.execute(
                            "INSERT IGNORE INTO task_completions (student_id, task_id) VALUES (%s,%s)",
                            (body.studentId, body.taskId),
                        )
                    except Exception:
                        pass
    except Exception as e:
        print(f"Could not save ML submission: {e}")

    audit_logger.log_event(
        event_type=AuditEventType.SUBMISSION_CREATED,
        user_id=actor_id,
        ip_address=_client_ip(request),
        resource_type="submission",
        action="ML task submission created",
        details={
            "taskId": body.taskId,
            "submissionType": body.submissionType,
            "score": ai_result.get("score", 0),
            "status": ai_result.get("status", "unknown"),
        },
    )
    return ai_result


@router.post("/submissions/proctored")
async def proctored_submission(body: ProctoredSubmission, request: Request):
    actor_user = await _get_actor_user(request)
    actor_id = actor_user["id"]
    actor_role = (actor_user.get("role") or "").lower()
    if actor_role in ("student", "learner") and body.studentId != actor_id:
        raise HTTPException(status_code=403, detail="Students can submit only for themselves")

    pool = await get_pool()
    submission_id = str(uuid.uuid4())
    submitted_at = datetime.now(timezone.utc)

    # Extract fields from body
    studentId = body.studentId
    problemId = body.problemId
    language = body.language
    code = body.code
    submissionType = body.submissionType or "editor"
    tabSwitches = body.tabSwitches or 0
    copyPasteAttempts = body.copyPasteAttempts or 0
    cameraBlockedCount = body.cameraBlockedCount or 0
    phoneDetectionCount = body.phoneDetectionCount or 0
    faceNotDetectedCount = body.faceNotDetectedCount or 0
    multipleFacesDetectionCount = body.multipleFacesDetectionCount or 0
    faceLookawayCount = body.faceLookawayCount or 0

    # Get problem details
    problem = None
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM problems WHERE id = %s", (problemId,))
            problem = await cur.fetchone()

    # Evaluate
    eval_result: dict[str, Any] = {"score": 0, "status": "rejected", "feedback": "Evaluation pending...", "analysis": {}}

    if language == "SQL" and problem:
        schema = problem.get("sql_schema")
        expected = problem.get("expected_query_result")
        if schema and expected:
            try:
                data = await _run_sql_via_piston(schema, code)
                eval_result = _evaluate_sql(data, expected)
            except Exception as e:
                eval_result["feedback"] = f"SQL Eval Error: {e}"
    else:
        # Construct prompt for AI
        prompt = f"""Evaluate this {language} code submission.

Problem: {problem.get('title','Unknown') if problem else 'Unknown'}
Description: {problem.get('description','') if problem else ''}
Expected Output: {problem.get('expected_output','') if problem else ''}

Student's Code:
```{language}
{code}
```

Respond JSON: {{"score":0-100,"status":"accepted|partial|rejected","feedback":"...","analysis":{{"correctness":0-40,"efficiency":0-25,"codeStyle":0-20,"bestPractices":0-15}}}}"""

        try:
            ai = await cerebras_chat(
                [{"role": "user", "content": prompt}],
                model=settings.GROQ_MODEL, temperature=0.3, max_tokens=1000,
                response_format={"type": "json_object"},
            )
            eval_result = _extract_json(ai.get("choices", [{}])[0].get("message", {}).get("content", "{}"))
        except Exception as e:
            print(f"AI eval error: {e}")

    # Apply all proctoring penalties
    final_score, feedback, integrity_violation = _apply_penalties(
        eval_result.get("score", 0),
        eval_result.get("feedback", ""),
        language,
        tab_switches=tabSwitches,
        copy_paste=copyPasteAttempts,
        camera_blocked=cameraBlockedCount,
        phone_detected=phoneDetectionCount,
        face_not_detected=faceNotDetectedCount,
        multiple_faces=multipleFacesDetectionCount,
        face_lookaway=faceLookawayCount,
    )
    final_status = _final_status(final_score)
    analysis = eval_result.get("analysis", {})

    # Save to DB
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO submissions (
                    id, student_id, problem_id, code, submission_type, language,
                    score, status, feedback, ai_explanation,
                    analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                    tab_switches, copy_paste_attempts, camera_blocked_count, phone_detection_count,
                    face_not_detected_count, multiple_faces_count, face_lookaway_count,
                    integrity_violation, submitted_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    submission_id, studentId, problemId, code,
                    submissionType or "editor", language,
                    final_score, final_status, feedback,
                    eval_result.get("aiExplanation", ""),
                    str(analysis.get("correctness", "")), str(analysis.get("efficiency", "")),
                    str(analysis.get("codeStyle", "")), str(analysis.get("bestPractices", "")),
                    tabSwitches, copyPasteAttempts,
                    cameraBlockedCount, phoneDetectionCount,
                    faceNotDetectedCount, multipleFacesDetectionCount,
                    faceLookawayCount,
                    "true" if integrity_violation else "false",
                    submitted_at,
                ),
            )

            if final_score >= 70:
                try:
                    await cur.execute(
                        "INSERT IGNORE INTO problem_completions (problem_id, student_id, completed_at) VALUES (%s,%s,%s)",
                        (problemId, studentId, submitted_at),
                    )
                except Exception:
                    pass

    audit_logger.log_event(
        event_type=AuditEventType.TEST_PROCTORING_LOG,
        user_id=actor_id,
        ip_address=_client_ip(request),
        resource_id=submission_id,
        resource_type="submission",
        action="Proctored submission created",
        details={
            "problemId": problemId,
            "language": language,
            "score": final_score,
            "status": final_status,
            "tabSwitches": tabSwitches,
            "copyPasteAttempts": copyPasteAttempts,
            "cameraBlockedCount": cameraBlockedCount,
            "phoneDetectionCount": phoneDetectionCount,
            "multipleFacesDetectionCount": multipleFacesDetectionCount,
            "integrity_violation": integrity_violation,
        },
    )
    return {
        "id": submission_id,
        "score": final_score,
        "status": final_status,
        "feedback": feedback,
        "analysis": analysis,
        "integrity": {
            "tabSwitches": tabSwitches,
            "copyPasteAttempts": copyPasteAttempts,
            "cameraBlockedCount": cameraBlockedCount,
            "phoneDetectionCount": phoneDetectionCount,
            "violation": integrity_violation,
        },
        "submittedAt": str(submitted_at),
    }


# ---------------------------------------------------------------------------
# Mentor feedback and escalation
# ---------------------------------------------------------------------------

class FeedbackBody(BaseModel):
    mentor_id: str
    comment: str
    rating: int | None = None  # optional 1-5


class EscalateBody(BaseModel):
    mentor_id: str
    reason: str = ""


@router.post("/submissions/{submission_id}/feedback")
async def add_submission_feedback(submission_id: str, body: FeedbackBody, request: Request):
    actor_user = await _get_actor_user(request)
    role = (actor_user.get("role") or "").lower()
    if role not in ("admin", "organization_admin", "mentor", "org_user"):
        raise HTTPException(status_code=403, detail="Mentor/Admin permission required")

    pool = await get_pool()
    feedback_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            try:
                await cur.execute(
                    """CREATE TABLE IF NOT EXISTS submission_feedback (
                        id VARCHAR(36) PRIMARY KEY,
                        submission_id VARCHAR(36) NOT NULL,
                        mentor_id VARCHAR(36) NOT NULL,
                        comment TEXT NOT NULL,
                        rating TINYINT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_sub_fb (submission_id)
                    )"""
                )
                await cur.execute(
                    "INSERT INTO submission_feedback (id, submission_id, mentor_id, comment, rating, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (feedback_id, submission_id, body.mentor_id, body.comment, body.rating, now),
                )
                await conn.commit()
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to save feedback: {exc}")

    audit_logger.log_event(
        AuditEventType.SUBMISSION_MODIFIED,
        user_id=actor_user["id"],
        ip_address=_client_ip(request),
        resource_id=submission_id,
        resource_type="submission_feedback",
        action="Mentor feedback added",
        details={"mentor_id": body.mentor_id, "rating": body.rating},
    )
    return {"id": feedback_id, "submission_id": submission_id, "created_at": now.isoformat()}


@router.get("/submissions/{submission_id}/feedback")
async def get_submission_feedback(submission_id: str, request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            try:
                await cur.execute(
                    "SELECT sf.*, u.name AS mentor_name FROM submission_feedback sf "
                    "LEFT JOIN users u ON u.id = sf.mentor_id "
                    "WHERE sf.submission_id = %s ORDER BY sf.created_at DESC",
                    (submission_id,),
                )
                rows = await cur.fetchall()
            except Exception:
                rows = []

    def _fmt(r):
        d = dict(r)
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        return d

    return {"feedback": [_fmt(r) for r in rows]}


@router.post("/submissions/{submission_id}/escalate")
async def escalate_submission(submission_id: str, body: EscalateBody, request: Request):
    actor_user = await _get_actor_user(request)
    role = (actor_user.get("role") or "").lower()
    if role not in ("admin", "organization_admin", "mentor", "org_user"):
        raise HTTPException(status_code=403, detail="Mentor/Admin permission required")

    pool = await get_pool()
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            try:
                await cur.execute(
                    """CREATE TABLE IF NOT EXISTS submission_escalations (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        submission_id VARCHAR(36) NOT NULL,
                        mentor_id VARCHAR(36) NOT NULL,
                        reason TEXT,
                        escalated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        resolved TINYINT(1) DEFAULT 0,
                        INDEX idx_sub_esc (submission_id)
                    )"""
                )
                await cur.execute(
                    "INSERT INTO submission_escalations (submission_id, mentor_id, reason, escalated_at) "
                    "VALUES (%s, %s, %s, %s)",
                    (submission_id, body.mentor_id, body.reason, now),
                )
                await conn.commit()
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to escalate: {exc}")

    audit_logger.log_event(
        AuditEventType.PROCTOR_ACTION_TAKEN,
        user_id=actor_user["id"],
        ip_address=_client_ip(request),
        resource_id=submission_id,
        resource_type="submission_escalation",
        action="Submission escalated to admin",
        details={"mentor_id": body.mentor_id, "reason": body.reason},
    )
    return {"status": "escalated", "submission_id": submission_id, "escalated_at": now.isoformat()}

