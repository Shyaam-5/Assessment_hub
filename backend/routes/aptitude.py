"""Aptitude test routes: CRUD for tests, submissions, and student allocations."""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from pydantic import BaseModel

import pymysql.cursors
from database import get_pool
from audit_logger import get_audit_logger, AuditEventType

router = APIRouter(prefix="/api", tags=["aptitude"])
logger = logging.getLogger(__name__)
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
            user_id=request.headers.get("x-user-id", "anonymous"),
            ip_address=_client_ip(request),
            resource_type="aptitude_read",
            query_params={"path": request.url.path, "query": request.url.query},
        )


router.dependencies.append(Depends(_log_read_access))


# ─── Request Bodies ────────────────────────────────────────────

class QuestionCreate(BaseModel):
    question: str
    options: List[str]
    correctAnswer: int
    explanation: str = ""
    category: str = "general"


class AptitudeTestCreate(BaseModel):
    title: str
    difficulty: str = "medium"
    duration: int = 30
    passingScore: int = 60
    maxTabSwitches: int = 3
    maxAttempts: int = 1
    startTime: Optional[str] = None
    deadline: Optional[str] = None
    description: str = ""
    status: str = "live"
    questions: List[QuestionCreate]
    createdBy: str


class AptitudeSubmit(BaseModel):
    studentId: str
    answers: Dict[str, Any]
    timeSpent: int = 0
    tabSwitches: int = 0


class StatusUpdate(BaseModel):
    status: str


class AllocateStudents(BaseModel):
    studentIds: List[str]


# ─── Helpers ───────────────────────────────────────────────────

def _clean_test(t: dict) -> dict:
    """Map DB row to camelCase API response."""
    return {
        "id": t["id"],
        "title": t["title"],
        "type": t.get("type", "aptitude"),
        "difficulty": t.get("difficulty"),
        "duration": t.get("duration"),
        "totalQuestions": t.get("total_questions"),
        "passingScore": t.get("passing_score"),
        "maxTabSwitches": t.get("max_tab_switches") or 3,
        "maxAttempts": t.get("max_attempts") or 1,
        "startTime": t["start_time"].isoformat() if t.get("start_time") else None,
        "deadline": t["deadline"].isoformat() if t.get("deadline") else None,
        "description": t.get("description") or "",
        "status": t.get("status"),
        "createdBy": t.get("created_by"),
        "createdAt": str(t.get("created_at", "")),
        "questionCount": t.get("total_questions"),
    }


def _fmt_dt(iso: Optional[str]) -> Optional[str]:
    """Parse ISO string → MySQL datetime string."""
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M:%S")


# ─── Routes ────────────────────────────────────────────────────

# ---------- List aptitude tests ----------

@router.get("/aptitude")
async def list_aptitude_tests(
    mentorId: Optional[str] = None,
    status: Optional[str] = None,
):
    pool = await get_pool()
    query = "SELECT * FROM aptitude_tests WHERE 1=1"
    params: list = []

    if mentorId:
        query += ' AND (created_by = %s OR created_by = "admin-001")'
        params.append(mentorId)
    if status:
        query += " AND status = %s"
        params.append(status)

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(query, params)
            tests = await cur.fetchall()

    return [_clean_test(t) for t in tests]


# ---------- Get single test with questions ----------

@router.get("/aptitude/{test_id}")
async def get_aptitude_test(test_id: str):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM aptitude_tests WHERE id = %s", (test_id,))
            test = await cur.fetchone()
            if not test:
                raise HTTPException(404, "Test not found")

            await cur.execute("SELECT * FROM aptitude_questions WHERE test_id = %s", (test_id,))
            questions = await cur.fetchall()

    clean_questions = [
        {
            "id": q["question_id"],
            "question": q["question"],
            "options": [q["option_1"], q["option_2"], q["option_3"], q["option_4"]],
            "correctAnswer": q["correct_answer"],
            "explanation": q.get("explanation"),
            "category": q.get("category"),
        }
        for q in questions
    ]

    result = _clean_test(test)
    result["questions"] = clean_questions
    return result


# ---------- Create test ----------

@router.post("/aptitude")
async def create_aptitude_test(body: AptitudeTestCreate):
    pool = await get_pool()
    test_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO aptitude_tests
                   (id, title, type, difficulty, duration, total_questions,
                    passing_score, max_tab_switches, max_attempts,
                    start_time, deadline, description, status, created_by, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    test_id, body.title, "aptitude", body.difficulty,
                    body.duration, len(body.questions), body.passingScore,
                    body.maxTabSwitches, body.maxAttempts,
                    _fmt_dt(body.startTime), _fmt_dt(body.deadline),
                    body.description, body.status, body.createdBy, created_at,
                ),
            )

            for q in body.questions:
                qid = str(uuid.uuid4())
                opts = q.options + [""] * (4 - len(q.options))  # pad to 4
                await cur.execute(
                    """INSERT INTO aptitude_questions
                       (question_id, test_id, question, option_1, option_2,
                        option_3, option_4, correct_answer, explanation, category)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (qid, test_id, q.question, opts[0], opts[1], opts[2], opts[3],
                     q.correctAnswer, q.explanation, q.category),
                )

        await conn.commit()

    logger.info("Aptitude test created id=%s title=%s", test_id, body.title)
    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_CREATED,
        user_id=body.createdBy,
        resource_id=test_id,
        resource_type="aptitude_test",
        action="Aptitude test created",
        details={"title": body.title, "difficulty": body.difficulty},
    )
    return {
        "id": test_id,
        "title": body.title,
        "difficulty": body.difficulty,
        "duration": body.duration,
        "totalQuestions": len(body.questions),
        "passingScore": body.passingScore,
        "maxTabSwitches": body.maxTabSwitches,
        "maxAttempts": body.maxAttempts,
        "startTime": body.startTime,
        "deadline": body.deadline,
        "description": body.description,
        "status": body.status,
        "createdBy": body.createdBy,
        "createdAt": str(created_at),
    }


# ---------- Submit answers ----------

@router.post("/aptitude/{test_id}/submit")
async def submit_aptitude_test(test_id: str, body: AptitudeSubmit, request: Request):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT * FROM aptitude_tests WHERE id = %s", (test_id,))
            test = await cur.fetchone()
            if not test:
                raise HTTPException(404, "Test not found")

            await cur.execute("SELECT * FROM aptitude_questions WHERE test_id = %s", (test_id,))
            questions = await cur.fetchall()

        # Score
        correct_count = 0
        question_results = []
        for q in questions:
            user_answer = body.answers.get(q["question_id"])
            options = [q["option_1"], q["option_2"], q["option_3"], q["option_4"]]
            options = [o for o in options if o]
            correct_text = options[q["correct_answer"]] if q["correct_answer"] < len(options) else ""
            is_correct = user_answer == correct_text
            if is_correct:
                correct_count += 1
            question_results.append({
                "questionId": q["question_id"],
                "question": q["question"],
                "userAnswer": user_answer or "Not Answered",
                "correctAnswer": correct_text,
                "isCorrect": is_correct,
                "explanation": q.get("explanation"),
                "category": q.get("category"),
            })

        score = round((correct_count / len(questions)) * 100) if questions else 0
        status = "passed" if score >= test["passing_score"] else "failed"
        sub_id = f"apt-sub-{str(uuid.uuid4())[:8]}"
        submitted_at = datetime.now(timezone.utc)

        # Persist
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO aptitude_submissions
                   (id, test_id, test_title, student_id, correct_count,
                    total_questions, score, status, time_spent, tab_switches, submitted_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (sub_id, test_id, test["title"], body.studentId, correct_count,
                 len(questions), score, status, body.timeSpent, body.tabSwitches, submitted_at),
            )

            for qr in question_results:
                await cur.execute(
                    """INSERT INTO aptitude_question_results
                       (submission_id, question_id, question, user_answer,
                        correct_answer, is_correct, explanation, category)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (sub_id, qr["questionId"], qr["question"], qr["userAnswer"],
                     qr["correctAnswer"], "true" if qr["isCorrect"] else "false",
                     qr.get("explanation"), qr.get("category")),
                )

            # Mark completed
            await cur.execute(
                "SELECT 1 FROM student_completed_aptitude WHERE student_id = %s AND aptitude_test_id = %s",
                (body.studentId, test_id),
            )
            if not await cur.fetchone():
                await cur.execute(
                    "INSERT INTO student_completed_aptitude (student_id, aptitude_test_id) VALUES (%s,%s)",
                    (body.studentId, test_id),
                )

        await conn.commit()

    audit_logger.log_event(
        AuditEventType.TEST_COMPLETED,
        user_id=body.studentId,
        ip_address=_client_ip(request),
        resource_id=sub_id,
        resource_type="aptitude_submission",
        action="Aptitude test submitted",
        details={"testId": test_id, "score": score, "status": status},
    )
    return {
        "submission": {
            "id": sub_id,
            "score": score,
            "status": status,
            "correctCount": correct_count,
            "totalQuestions": len(questions),
            "tabSwitches": body.tabSwitches,
            "timeSpent": body.timeSpent,
            "questionResults": question_results,
        },
        "message": "Congratulations! You passed the test!" if status == "passed" else "Keep practicing!",
    }


# ---------- Update test status ----------

@router.patch("/aptitude/{test_id}/status")
async def update_aptitude_status(test_id: str, body: StatusUpdate, request: Request):
    if body.status not in ("live", "ended"):
        raise HTTPException(400, 'Invalid status. Must be "live" or "ended"')

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE aptitude_tests SET status = %s WHERE id = %s", (body.status, test_id))
            if cur.rowcount == 0:
                raise HTTPException(404, "Test not found")
        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_MODIFIED,
        user_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        resource_id=test_id,
        resource_type="aptitude_test",
        action="Aptitude test status updated",
        details={"status": body.status},
    )
    return {"success": True, "status": body.status}


# ---------- Delete test ----------

@router.delete("/aptitude/{test_id}")
async def delete_aptitude_test(test_id: str, request: Request):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Cascading delete
            subs = []
            await cur.execute("SELECT id FROM aptitude_submissions WHERE test_id = %s", (test_id,))
            subs = await cur.fetchall()
            sub_ids = [s["id"] for s in subs]

            if sub_ids:
                placeholders = ",".join(["%s"] * len(sub_ids))
                await cur.execute(
                    f"DELETE FROM aptitude_question_results WHERE submission_id IN ({placeholders})",
                    sub_ids,
                )

            await cur.execute("DELETE FROM aptitude_submissions WHERE test_id = %s", (test_id,))
            await cur.execute("DELETE FROM student_completed_aptitude WHERE aptitude_test_id = %s", (test_id,))
            await cur.execute("DELETE FROM aptitude_questions WHERE test_id = %s", (test_id,))
            await cur.execute("DELETE FROM aptitude_tests WHERE id = %s", (test_id,))

            if cur.rowcount == 0:
                raise HTTPException(404, "Test not found")

        await conn.commit()

    audit_logger.log_event(
        AuditEventType.ADMIN_TEST_DELETED,
        user_id=request.headers.get("x-user-id", "anonymous"),
        ip_address=_client_ip(request),
        resource_id=test_id,
        resource_type="aptitude_test",
        action="Aptitude test deleted",
    )
    return {"success": True}


# ─── Submission routes ─────────────────────────────────────────

@router.get("/aptitude-submissions")
async def list_aptitude_submissions(
    studentId: Optional[str] = None,
    testId: Optional[str] = None,
    mentorId: Optional[str] = None,
):
    pool = await get_pool()
    query = """SELECT s.*, u.name AS student_name
               FROM aptitude_submissions s
               JOIN users u ON s.student_id = u.id
               WHERE 1=1"""
    params: list = []

    if studentId:
        query += " AND s.student_id = %s"
        params.append(studentId)
    if testId:
        query += " AND s.test_id = %s"
        params.append(testId)
    if mentorId:
        query += " AND u.mentor_id = %s"
        params.append(mentorId)

    query += " ORDER BY s.submitted_at DESC"

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(query, params)
            rows = await cur.fetchall()

    return [
        {
            "id": s["id"],
            "testId": s["test_id"],
            "testTitle": s["test_title"],
            "studentId": s["student_id"],
            "studentName": s["student_name"],
            "score": s["score"],
            "status": s["status"],
            "correctCount": s["correct_count"],
            "totalQuestions": s["total_questions"],
            "tabSwitches": s.get("tab_switches") or 0,
            "timeSpent": s.get("time_spent"),
            "submittedAt": str(s.get("submitted_at", "")),
        }
        for s in rows
    ]


# ---------- Get single submission with question results ----------

@router.get("/aptitude-submissions/{submission_id}")
async def get_aptitude_submission(submission_id: str):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT s.*, u.name AS student_name
                   FROM aptitude_submissions s
                   JOIN users u ON s.student_id = u.id
                   WHERE s.id = %s""",
                (submission_id,),
            )
            s = await cur.fetchone()
            if not s:
                raise HTTPException(404, "Submission not found")

            await cur.execute(
                "SELECT * FROM aptitude_question_results WHERE submission_id = %s",
                (submission_id,),
            )
            qr_rows = await cur.fetchall()

    return {
        "id": s["id"],
        "testId": s["test_id"],
        "testTitle": s["test_title"],
        "studentId": s["student_id"],
        "studentName": s["student_name"],
        "score": s["score"],
        "status": s["status"],
        "correctCount": s["correct_count"],
        "totalQuestions": s["total_questions"],
        "tabSwitches": s.get("tab_switches") or 0,
        "timeSpent": s.get("time_spent"),
        "submittedAt": str(s.get("submitted_at", "")),
        "questionResults": [
            {
                "questionId": qr["question_id"],
                "question": qr["question"],
                "userAnswer": qr["user_answer"],
                "correctAnswer": qr["correct_answer"],
                "isCorrect": qr["is_correct"] in ("true", True, 1),
                "explanation": qr.get("explanation"),
                "category": qr.get("category"),
            }
            for qr in qr_rows
        ],
    }


# ─── Test-Student Allocation routes ───────────────────────────

@router.post("/aptitude/{test_id}/allocate-students")
async def allocate_students(test_id: str, body: AllocateStudents):
    if not body.studentIds:
        raise HTTPException(400, "studentIds must be a non-empty array")

    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM test_student_allocations WHERE test_id = %s", (test_id,))

            for sid in body.studentIds:
                await cur.execute(
                    "INSERT INTO test_student_allocations (id, test_id, student_id) VALUES (%s,%s,%s)",
                    (str(uuid.uuid4()), test_id, sid),
                )

        await conn.commit()

    return {"success": True, "allocatedCount": len(body.studentIds)}


@router.get("/aptitude/{test_id}/allocated-students")
async def get_allocated_students(test_id: str):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                "SELECT student_id FROM test_student_allocations WHERE test_id = %s",
                (test_id,),
            )
            rows = await cur.fetchall()

    student_ids = [r["student_id"] for r in rows]
    return {"testId": test_id, "studentIds": student_ids, "count": len(student_ids)}


@router.get("/aptitude/allocated-to/{student_id}")
async def get_tests_allocated_to_student(student_id: str):
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute(
                """SELECT DISTINCT t.*
                   FROM test_student_allocations tsa
                   JOIN aptitude_tests t ON tsa.test_id = t.id
                   WHERE tsa.student_id = %s AND t.status = 'live'
                   ORDER BY t.created_at DESC""",
                (student_id,),
            )
            rows = await cur.fetchall()

    return [_clean_test(t) for t in rows]
