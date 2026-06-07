import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)

"""Async-compatible MySQL connection pool using synchronous PyMySQL under the hood.

aiomysql/asyncmy fail with TiDB Cloud TLS on Windows, so we wrap PyMySQL
connections with asyncio.to_thread to keep the FastAPI route interface async.

The public API is identical to the previous aiomysql-based version:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT ...")
            rows = await cur.fetchall()
"""

import asyncio
import os
import ssl as _ssl
from contextlib import asynccontextmanager
from contextvars import ContextVar
from pathlib import Path
from urllib.parse import urlparse

import pymysql
import pymysql.cursors
import bcrypt
from dotenv import dotenv_values

from config import settings


def _normalize_db_url(raw: str) -> str:
    v = (raw or "").strip()
    if v.upper().startswith("DATABASE_URL="):
        v = v.split("=", 1)[1].strip()
    return v

# â"€â"€â"€ Global pool â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

_pool: "PyMySQLPool | None" = None
_tenant_pools: dict[str, "PyMySQLPool"] = {}
_active_request_pool: ContextVar["PyMySQLPool | None"] = ContextVar("active_request_pool", default=None)
_tenant_schema_checked: set[str] = set()

_REQUIRED_TENANT_DOMAIN_TABLES = [
    # Coding / content
    "problems",
    "tasks",
    "submissions",
    "problem_completions",
    "task_completions",
    "mentor_student_allocations",
    # Aptitude
    "aptitude_tests",
    "aptitude_questions",
    "aptitude_submissions",
    "aptitude_question_results",
    "test_student_allocations",
    "student_completed_aptitude",
    # Communication
    "comm_tests",
    "comm_test_attempts",
    "comm_test_allocations",
    # Skill / SQL flow
    "skill_tests",
    "skill_test_attempts",
    "skill_test_allocations",
    # Global tests
    "global_tests",
    "test_questions",
    "global_test_allocations",
    "global_test_submissions",
    "question_results",
    "section_results",
    # Proctoring / analysis surfaces
    "proctoring_events_unified",
    "proctor_agent_analyses",
    "proctor_integrity_reports",
    "behavior_analyses",
]

_CORE_DOMAIN_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS problems (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        title VARCHAR(255) NULL,
        description TEXT NULL,
        expected_output TEXT NULL,
        sample_input TEXT NULL,
        difficulty VARCHAR(20) NULL,
        type VARCHAR(50) NULL,
        language VARCHAR(50) NULL,
        mentor_id VARCHAR(50) NULL,
        status VARCHAR(20) NULL,
        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        live_coding VARCHAR(10) NULL,
        enable_proctoring VARCHAR(10) NULL,
        enable_video_audio VARCHAR(10) NULL,
        disable_copy_paste VARCHAR(10) NULL,
        track_tab_switches VARCHAR(10) NULL,
        max_tab_switches INT NULL,
        sql_schema TEXT NULL,
        expected_query_result TEXT NULL,
        enable_face_detection VARCHAR(10) NULL,
        detect_multiple_faces VARCHAR(10) NULL,
        track_face_lookaway VARCHAR(10) NULL,
        attempt_limit INT NULL,
        max_attempts INT NULL,
        deadline DATETIME NULL,
        INDEX idx_problems_mentor (mentor_id),
        INDEX idx_problems_status (status),
        INDEX idx_problems_created_at (created_at)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        mentor_id VARCHAR(50) NULL,
        title VARCHAR(255) NULL,
        description TEXT NULL,
        requirements TEXT NULL,
        status VARCHAR(20) NULL,
        deadline DATETIME NULL,
        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tasks_mentor (mentor_id),
        INDEX idx_tasks_status (status)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS submissions (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        student_id VARCHAR(50) NULL,
        problem_id VARCHAR(50) NULL,
        task_id VARCHAR(50) NULL,
        mentor_id VARCHAR(50) NULL,
        code LONGTEXT NULL,
        submission_type VARCHAR(50) NULL,
        file_name VARCHAR(255) NULL,
        language VARCHAR(50) NULL,
        output LONGTEXT NULL,
        score INT NULL,
        max_score INT NULL,
        test_cases_total INT NULL,
        test_cases_passed INT NULL,
        status VARCHAR(30) NULL,
        feedback LONGTEXT NULL,
        ai_explanation LONGTEXT NULL,
        analysis_correctness INT NULL,
        analysis_efficiency INT NULL,
        analysis_code_style INT NULL,
        analysis_best_practices INT NULL,
        plagiarism_detected VARCHAR(10) NULL,
        plagiarism_score DECIMAL(5,2) NULL,
        copied_from VARCHAR(50) NULL,
        copied_from_name VARCHAR(255) NULL,
        tab_switches INT NULL,
        copy_paste_attempts INT NULL,
        camera_blocked_count INT NULL,
        phone_detection_count INT NULL,
        face_not_detected_count INT NULL,
        multiple_faces_count INT NULL,
        face_lookaway_count INT NULL,
        proctoring_video VARCHAR(500) NULL,
        integrity_violation VARCHAR(10) NULL,
        submitted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INT NULL,
        memory_kb INT NULL,
        INDEX idx_submissions_student (student_id),
        INDEX idx_submissions_problem (problem_id),
        INDEX idx_submissions_task (task_id),
        INDEX idx_submissions_mentor (mentor_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS problem_completions (
        problem_id VARCHAR(50) NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        completed_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (problem_id, student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS aptitude_submissions (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        test_id VARCHAR(50) NULL,
        test_title VARCHAR(255) NULL,
        student_id VARCHAR(50) NULL,
        correct_count INT NULL,
        total_questions INT NULL,
        score INT NULL,
        status VARCHAR(20) NULL,
        time_spent INT NULL,
        tab_switches INT NULL,
        submitted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_apt_sub_test (test_id),
        INDEX idx_apt_sub_student (student_id),
        INDEX idx_apt_sub_status (status)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS task_completions (
        task_id VARCHAR(50) NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        PRIMARY KEY (task_id, student_id),
        INDEX idx_task_completions_student (student_id),
        INDEX idx_task_completions_task (task_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS mentor_student_allocations (
        mentor_id VARCHAR(50) NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        PRIMARY KEY (mentor_id, student_id),
        INDEX idx_alloc_mentor (mentor_id),
        INDEX idx_alloc_student (student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS aptitude_tests (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        title VARCHAR(255) NULL,
        type VARCHAR(50) NULL,
        difficulty VARCHAR(20) NULL,
        duration INT NULL,
        total_questions INT NULL,
        start_time DATETIME NULL,
        passing_score INT NULL,
        status VARCHAR(20) NULL,
        created_by VARCHAR(50) NULL,
        created_at DATETIME NULL,
        max_tab_switches INT NULL DEFAULT 3,
        max_attempts INT NULL DEFAULT 1,
        deadline DATETIME NULL,
        description TEXT NULL,
        result_visibility VARCHAR(32) NULL DEFAULT 'immediate',
        INDEX idx_apt_tests_created_by (created_by),
        INDEX idx_apt_tests_created_at (created_at)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS aptitude_questions (
        test_id VARCHAR(50) NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        question TEXT NULL,
        option_1 TEXT NULL,
        option_2 TEXT NULL,
        option_3 TEXT NULL,
        option_4 TEXT NULL,
        correct_answer TEXT NULL,
        explanation TEXT NULL,
        category VARCHAR(100) NULL,
        PRIMARY KEY (test_id, question_id),
        INDEX idx_apt_q_test (test_id),
        INDEX idx_apt_q_qid (question_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS aptitude_question_results (
        submission_id VARCHAR(50) NULL,
        question_id VARCHAR(50) NULL,
        question TEXT NULL,
        user_answer TEXT NULL,
        correct_answer TEXT NULL,
        is_correct VARCHAR(10) NULL,
        explanation TEXT NULL,
        category VARCHAR(100) NULL,
        INDEX idx_apt_qr_submission (submission_id),
        INDEX idx_apt_qr_qid (question_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS test_student_allocations (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        test_id VARCHAR(50) NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        assigned_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_test_student (test_id, student_id),
        INDEX idx_tsa_test_id (test_id),
        INDEX idx_tsa_student_id (student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS student_completed_aptitude (
        student_id VARCHAR(50) NOT NULL,
        aptitude_test_id VARCHAR(50) NOT NULL,
        PRIMARY KEY (student_id, aptitude_test_id),
        INDEX idx_sca_test_id (aptitude_test_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS global_tests (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        difficulty VARCHAR(20) NULL,
        duration INT NULL,
        total_questions INT NULL,
        passing_score INT NULL DEFAULT 60,
        status VARCHAR(20) NULL DEFAULT 'draft',
        created_by VARCHAR(50) NULL,
        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        description TEXT NULL,
        start_time DATETIME NULL,
        deadline DATETIME NULL,
        max_attempts INT NULL DEFAULT 1,
        max_tab_switches INT NULL DEFAULT 3,
        section_config JSON NULL,
        proctoring_config JSON NULL,
        result_visibility VARCHAR(32) NULL DEFAULT 'immediate',
        INDEX idx_global_tests_created_by (created_by),
        INDEX idx_global_tests_status (status)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS test_questions (
        question_id VARCHAR(50) NOT NULL PRIMARY KEY,
        test_id VARCHAR(50) NULL,
        section VARCHAR(32) NOT NULL,
        question_type VARCHAR(32) NULL DEFAULT 'mcq',
        question TEXT NOT NULL,
        option_1 TEXT NULL,
        option_2 TEXT NULL,
        option_3 TEXT NULL,
        option_4 TEXT NULL,
        correct_answer TEXT NULL,
        test_cases JSON NULL,
        starter_code TEXT NULL,
        solution_code TEXT NULL,
        explanation TEXT NULL,
        category VARCHAR(100) NULL,
        difficulty VARCHAR(20) NULL,
        points INT NULL DEFAULT 1,
        time_limit INT NULL,
        INDEX idx_test_questions_test_id (test_id),
        INDEX idx_test_questions_section (section)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS global_test_allocations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        test_id VARCHAR(64) NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_global_alloc (test_id, student_id),
        INDEX idx_gta_test_id (test_id),
        INDEX idx_gta_student_id (student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS global_test_submissions (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        test_id VARCHAR(50) NULL,
        test_title VARCHAR(255) NULL,
        student_id VARCHAR(50) NULL,
        aptitude_score INT NULL DEFAULT 0,
        verbal_score INT NULL DEFAULT 0,
        logical_score INT NULL DEFAULT 0,
        coding_score INT NULL DEFAULT 0,
        sql_score INT NULL DEFAULT 0,
        total_score INT NULL DEFAULT 0,
        overall_percentage DECIMAL(5,2) NULL,
        status VARCHAR(20) NULL DEFAULT 'pending',
        time_spent INT NULL,
        tab_switches INT NULL DEFAULT 0,
        submitted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_gts_student_id (student_id),
        INDEX idx_gts_test_id (test_id),
        INDEX idx_gts_status (status)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS question_results (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        submission_id VARCHAR(50) NULL,
        question_id VARCHAR(50) NULL,
        section VARCHAR(50) NULL,
        user_answer TEXT NULL,
        correct_answer TEXT NULL,
        is_correct TINYINT(1) NULL DEFAULT 0,
        points_earned INT NULL DEFAULT 0,
        time_taken INT NULL,
        explanation TEXT NULL,
        INDEX idx_qr_submission_id (submission_id),
        INDEX idx_qr_question_id (question_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS section_results (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        submission_id VARCHAR(50) NULL,
        section VARCHAR(32) NOT NULL,
        correct_count INT NULL DEFAULT 0,
        total_questions INT NULL DEFAULT 0,
        score INT NULL DEFAULT 0,
        percentage DECIMAL(5,2) NULL,
        time_spent INT NULL,
        INDEX idx_sr_submission_id (submission_id),
        INDEX idx_sr_section (section)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS personalized_reports (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        student_id VARCHAR(50) NULL,
        test_id VARCHAR(50) NULL,
        submission_id VARCHAR(50) NULL,
        report_data JSON NULL,
        generated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pr_student_id (student_id),
        INDEX idx_pr_test_id (test_id),
        INDEX idx_pr_submission_id (submission_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_tests (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        skills JSON NOT NULL,
        mcq_count INT NULL DEFAULT 10,
        coding_count INT NULL DEFAULT 3,
        sql_count INT NULL DEFAULT 3,
        interview_count INT NULL DEFAULT 5,
        attempt_limit INT NULL DEFAULT 1,
        mcq_duration_minutes INT NULL DEFAULT 30,
        coding_duration_minutes INT NULL DEFAULT 30,
        sql_duration_minutes INT NULL DEFAULT 30,
        interview_duration_minutes INT NULL DEFAULT 30,
        mcq_passing_score INT NULL DEFAULT 60,
        coding_passing_score INT NULL DEFAULT 50,
        sql_passing_score INT NULL DEFAULT 50,
        interview_passing_score INT NULL DEFAULT 6,
        is_active TINYINT(1) NULL DEFAULT 1,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        difficulty_level VARCHAR(20) NULL DEFAULT 'mixed',
        proctoring_enabled TINYINT(1) NULL DEFAULT 1,
        proctoring_config JSON NULL,
        company_name VARCHAR(100) NULL,
        is_company_test TINYINT(1) NULL DEFAULT 0,
        target_company VARCHAR(100) NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_test_attempts (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        test_id INT NOT NULL,
        student_id VARCHAR(100) NOT NULL,
        student_name VARCHAR(255) NULL,
        attempt_number INT NULL DEFAULT 1,
        current_stage VARCHAR(50) NULL DEFAULT 'mcq',
        overall_status VARCHAR(50) NULL DEFAULT 'in_progress',
        mcq_questions JSON NULL,
        mcq_answers JSON NULL,
        mcq_score DECIMAL(5,2) NULL DEFAULT 0,
        mcq_status VARCHAR(20) NULL DEFAULT 'pending',
        mcq_start_time TIMESTAMP NULL DEFAULT NULL,
        mcq_end_time TIMESTAMP NULL DEFAULT NULL,
        mcq_violations INT NULL DEFAULT 0,
        coding_problems JSON NULL,
        coding_submissions JSON NULL,
        coding_score DECIMAL(5,2) NULL DEFAULT 0,
        coding_status VARCHAR(20) NULL DEFAULT 'pending',
        sql_problems JSON NULL,
        sql_submissions JSON NULL,
        sql_score DECIMAL(5,2) NULL DEFAULT 0,
        sql_status VARCHAR(20) NULL DEFAULT 'pending',
        interview_qa JSON NULL,
        interview_current_index INT NULL DEFAULT 0,
        interview_score DECIMAL(5,2) NULL DEFAULT 0,
        interview_status VARCHAR(20) NULL DEFAULT 'pending',
        interview_violations INT NULL DEFAULT 0,
        report JSON NULL,
        started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL DEFAULT NULL,
        last_activity_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        total_violations INT NULL DEFAULT 0,
        risk_level VARCHAR(20) NULL DEFAULT 'low',
        processing_time_seconds INT NULL DEFAULT 0,
        fairness_score DECIMAL(5,2) NULL DEFAULT 100.00,
        ai_confidence_score DECIMAL(5,2) NULL DEFAULT 0.00,
        final_recommendation VARCHAR(20) NULL DEFAULT 'pending',
        INDEX idx_sta_test_student (test_id, student_id),
        INDEX idx_sta_overall_status (overall_status),
        INDEX idx_sta_last_activity (last_activity_at)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS code_feedback (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        submission_id VARCHAR(36) NOT NULL,
        mentor_id VARCHAR(100) NOT NULL,
        student_id VARCHAR(100) NOT NULL,
        line_number INT NOT NULL,
        end_line INT NULL,
        comment TEXT NOT NULL,
        feedback_type VARCHAR(20) NULL DEFAULT 'suggestion',
        is_resolved TINYINT(1) NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cf_submission (submission_id),
        INDEX idx_cf_mentor (mentor_id),
        INDEX idx_cf_student (student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS direct_messages (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        sender_id VARCHAR(100) NOT NULL,
        receiver_id VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        message_type VARCHAR(20) NULL DEFAULT 'text',
        file_url VARCHAR(500) NULL,
        is_read TINYINT(1) NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dm_sender (sender_id),
        INDEX idx_dm_receiver (receiver_id),
        INDEX idx_dm_conversation (sender_id, receiver_id),
        INDEX idx_dm_created (created_at)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_users (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'candidate',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_prescan_users_email (email)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS comm_tests (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        title               VARCHAR(255)   NOT NULL,
        description         TEXT,
        module_a_sentences  JSON,
        module_b_sentences  JSON,
        module_c_topics     JSON,
        module_d_questions  JSON,
        module_a_count      INT DEFAULT 5,
        module_b_count      INT DEFAULT 5,
        module_c_count      INT DEFAULT 3,
        module_d_count      INT DEFAULT 5,
        duration_minutes    INT DEFAULT 60,
        proctoring_enabled  BOOLEAN DEFAULT TRUE,
        proctoring_config   JSON,
        attempt_limit       INT DEFAULT 3,
        is_active           BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS comm_test_attempts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        test_id         INT NOT NULL,
        student_id      VARCHAR(50) NOT NULL,
        student_name    VARCHAR(100),
        attempt_number  INT DEFAULT 1,
        module_a_data   JSON,
        module_b_data   JSON,
        module_c_data   JSON,
        module_d_data   JSON,
        module_a_score  FLOAT DEFAULT 0,
        module_b_score  FLOAT DEFAULT 0,
        module_c_score  FLOAT DEFAULT 0,
        module_d_score  FLOAT DEFAULT 0,
        overall_score   FLOAT DEFAULT 0,
        current_module  VARCHAR(20) DEFAULT 'A',
        status          VARCHAR(20) DEFAULT 'in_progress',
        proctoring_violations INT DEFAULT 0,
        violation_details   JSON,
        auto_terminated     TINYINT DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at    TIMESTAMP NULL,
        FOREIGN KEY (test_id) REFERENCES comm_tests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS comm_test_allocations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        test_id INT NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_comm_alloc (test_id, student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_test_allocations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        test_id INT NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_skill_alloc (test_id, student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]


class _AsyncCursorWrapper:
    """Wraps a synchronous pymysql cursor so callers can ``await`` its methods."""

    def __init__(self, sync_cursor):
        self._cur = sync_cursor

    async def execute(self, query, args=None):
        return await asyncio.to_thread(self._cur.execute, query, args)

    async def executemany(self, query, args):
        return await asyncio.to_thread(self._cur.executemany, query, args)

    async def fetchone(self):
        return await asyncio.to_thread(self._cur.fetchone)

    async def fetchall(self):
        return await asyncio.to_thread(self._cur.fetchall)

    async def fetchmany(self, size=None):
        return await asyncio.to_thread(self._cur.fetchmany, size)

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    # Context-manager support (async with conn.cursor() as cur)
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self._cur.close()
        return False


class _AsyncConnectionWrapper:
    """Wraps a synchronous pymysql connection so callers can use"""

    def __init__(self, sync_conn):
        self._conn = sync_conn

    def cursor(self, cursor_class=None):
        """Return an async-wrapped cursor.

        ``cursor_class`` is accepted for API compatibility with aiomysql
        (e.g. ``aiomysql.DictCursor``), but we always use pymysql's own
        DictCursor when the caller requests one.
        """
        # Map aiomysql.DictCursor â†’ pymysql.cursors.DictCursor
        if cursor_class is not None:
            cls_name = getattr(cursor_class, "__name__", "")
            if "Dict" in cls_name:
                cursor_class = pymysql.cursors.DictCursor
        raw = self._conn.cursor(cursor_class or pymysql.cursors.DictCursor)
        return _AsyncCursorWrapper(raw)

    async def commit(self):
        await asyncio.to_thread(self._conn.commit)

    async def rollback(self):
        await asyncio.to_thread(self._conn.rollback)

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass

    # Context-manager support (async with conn.cursor(...) as cur)
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


class PyMySQLPool:
    """Async-compatible connection pool backed by PyMySQL.

    Maintains a free-list of reusable connections to avoid creating
    a new TCP + TLS handshake for every single query.
    """

    def __init__(self, connect_kwargs: dict, maxsize: int = 10):
        self._connect_kwargs = connect_kwargs
        self._maxsize = maxsize
        self._free: list = []

    def _create_connection_sync(self):
        return pymysql.connect(**self._connect_kwargs)

    @asynccontextmanager
    async def acquire(self):
        """Yield an async-wrapped connection (mirrors aiomysql pool.acquire)."""
        raw = None

        # Try to reuse a free connection
        while self._free:
            candidate = self._free.pop()
            try:
                await asyncio.to_thread(candidate.ping, True)  # reconnect=True
                raw = candidate
                break
            except Exception:
                try:
                    candidate.close()
                except Exception:
                    pass

        # Create new if none reusable
        if raw is None:
            raw = await asyncio.to_thread(self._create_connection_sync)

        wrapper = _AsyncConnectionWrapper(raw)
        try:
            yield wrapper
        except Exception:
            # On error discard the connection (may be in bad state)
            try:
                raw.close()
            except Exception:
                pass
            raise
        else:
            # Return healthy connection to pool
            if len(self._free) < self._maxsize:
                self._free.append(raw)
            else:
                try:
                    raw.close()
                except Exception:
                    pass

    def close(self):
        """Close all pooled connections."""
        for conn in self._free:
            try:
                conn.close()
            except Exception:
                pass
        self._free.clear()

    async def wait_closed(self):
        self.close()


# â"€â"€â"€ Public helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async def get_pool() -> PyMySQLPool:
    """Return request-scoped tenant pool when set; otherwise primary pool."""
    req_pool = _active_request_pool.get()
    if req_pool is not None:
        return req_pool
    if _pool is None:
        raise RuntimeError("Database pool not initialised - call init_db() first.")
    return _pool


async def get_primary_pool() -> PyMySQLPool:
    """Return the primary platform DB pool regardless of request scope."""
    if _pool is None:
        raise RuntimeError("Primary database pool not initialised - call init_db() first.")
    return _pool


def set_request_pool(pool: "PyMySQLPool | None") -> None:
    """Set request-scoped active pool; pass None to clear fallback to primary."""
    _active_request_pool.set(pool)


def clear_request_pool() -> None:
    _active_request_pool.set(None)


def _build_connect_kwargs_from_url(db_url: str) -> dict:
    parsed = urlparse(db_url)
    ssl_ctx = _ssl.create_default_context()
    if os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes"):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)

    return dict(
        host=parsed.hostname or "localhost",
        port=int(parsed.port or 3306),
        user=parsed.username or "root",
        password=parsed.password or "",
        database=(parsed.path or "/test").lstrip("/"),
        ssl=ssl_ctx,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=15,
        cursorclass=pymysql.cursors.DictCursor,
    )


async def get_tenant_pool_by_db_url(db_url: str) -> "PyMySQLPool":
    key = (db_url or "").strip()
    if not key:
        raise RuntimeError("Missing tenant DB URL")
    existing = _tenant_pools.get(key)
    if existing is not None:
        return existing

    connect_kwargs = _build_connect_kwargs_from_url(key)
    test_conn = await asyncio.to_thread(pymysql.connect, **connect_kwargs)
    test_conn.close()
    pool = PyMySQLPool(connect_kwargs, maxsize=10)
    _tenant_pools[key] = pool
    return pool


def resolve_tenant_db_url(*, db_url: str | None, db_secret_ref: str | None) -> str | None:
    """
    Resolve tenant DB connection URL from direct URL or external secret reference.

    Supported reference formats:
    - env://VAR_NAME  -> reads process environment variable VAR_NAME
    """
    direct = (db_url or "").strip()
    if direct:
        return direct
    ref = (db_secret_ref or "").strip()
    if not ref:
        return None
    if ref.lower().startswith("env://"):
        env_key = ref[6:].strip()
        if not env_key:
            raise RuntimeError("Invalid tenant DB secret reference: missing env key")
        value = (os.getenv(env_key, "") or "").strip()
        if not value:
            raise RuntimeError(f"Tenant DB secret env var '{env_key}' is empty")
        return value
    raise RuntimeError("Unsupported tenant DB secret reference. Use env://VAR_NAME")


async def get_tenant_pool_by_org_id(org_id: str | None) -> "PyMySQLPool | None":
    if not org_id:
        return None
    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT db_url, db_secret_ref FROM organizations WHERE id = %s AND is_active = 1", (org_id,))
            row = await cur.fetchone()
    db_url = resolve_tenant_db_url(
        db_url=(row or {}).get("db_url"),
        db_secret_ref=(row or {}).get("db_secret_ref"),
    )
    if not db_url:
        return None
    # Ensure tenant schema is ready at first touch for this org.
    if org_id not in _tenant_schema_checked:
        try:
            await asyncio.to_thread(_bootstrap_missing_tables_into_tenant, db_url)
            tenant_pool = await get_tenant_pool_by_db_url(db_url)
            await ensure_core_domain_tables(tenant_pool)
            _tenant_schema_checked.add(org_id)
        except Exception as exc:
            raise RuntimeError(f"Tenant schema bootstrap failed for org {org_id}: {exc}")
    return await get_tenant_pool_by_db_url(db_url)


async def init_db() -> None:
    """Create the global connection pool at application startup."""
    global _pool

    # NOTE: TiDB Cloud / some managed DBs require TLS but their certs may
    # not be verifiable on all platforms.  In production set VERIFY_DB_SSL=1
    # and provide the CA bundle via DB_SSL_CA env-var.
    ssl_ctx = _ssl.create_default_context()
    if os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes"):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)

    # Resolve DB settings from backend/.env at runtime to avoid stale shell/process env drift.
    env_path = Path(__file__).resolve().parent / ".env"
    env_file = dotenv_values(env_path) if env_path.exists() else {}
    runtime_db_url = _normalize_db_url(
        (env_file.get("DATABASE_URL") or os.getenv("DATABASE_URL") or settings.DATABASE_URL or "").strip()
    )
    parsed = urlparse(runtime_db_url)
    db_host = parsed.hostname or settings.DB_HOST
    db_port = int(parsed.port or settings.DB_PORT)
    db_user = parsed.username or settings.DB_USER
    db_password = parsed.password or settings.DB_PASSWORD
    db_name = (parsed.path or f"/{settings.DB_NAME or 'test'}").lstrip("/")
    if db_name.lower() in {"sys", "mysql", "information_schema", "performance_schema"}:
        fallback_db = (os.getenv("APP_DB_NAME", "mentor_hub") or "mentor_hub").strip()
        # Ensure fallback app DB exists before creating the pool.
        admin_kwargs = dict(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            ssl=ssl_ctx,
            charset="utf8mb4",
            autocommit=True,
            connect_timeout=15,
            cursorclass=pymysql.cursors.DictCursor,
        )
        admin_conn = await asyncio.to_thread(pymysql.connect, **admin_kwargs)
        try:
            with admin_conn.cursor() as cur:
                cur.execute(f"CREATE DATABASE IF NOT EXISTS `{fallback_db}`")
            settings.DB_NAME = fallback_db
            db_name = fallback_db
            print(f"[WARNING] System DB '{(settings.DB_NAME or '').strip()}' detected. Using app DB '{fallback_db}'.")
        finally:
            admin_conn.close()

    connect_kwargs = dict(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name,
        ssl=ssl_ctx,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=15,
        cursorclass=pymysql.cursors.DictCursor,
    )

    # Verify connection works at startup
    test_conn = await asyncio.to_thread(pymysql.connect, **connect_kwargs)
    test_conn.close()

    _pool = PyMySQLPool(connect_kwargs, maxsize=10)
    settings.DB_HOST = db_host
    settings.DB_PORT = db_port
    settings.DB_USER = db_user
    settings.DB_PASSWORD = db_password
    settings.DB_NAME = db_name
    print(f"[OK] Database pool created - {db_host}:{db_port}/{db_name}")


async def close_db() -> None:
    """Clean up on shutdown."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        print("[OK] Database pool closed.")
    for tp in list(_tenant_pools.values()):
        try:
            tp.close()
        except Exception:
            pass
    _tenant_pools.clear()
    _tenant_schema_checked.clear()


async def ensure_core_domain_tables(pool: "PyMySQLPool | None" = None) -> None:
    target_pool = pool or _pool
    if target_pool is None:
        return
    async with target_pool.acquire() as conn:
        async with conn.cursor() as cur:
            for sql in _CORE_DOMAIN_TABLES_SQL:
                await cur.execute(sql)
            for table_name in ("aptitude_tests", "global_tests"):
                await cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = %s
                      AND COLUMN_NAME = 'result_visibility'
                    LIMIT 1
                    """,
                    (table_name,),
                )
                if not await cur.fetchone():
                    await cur.execute(
                        f"ALTER TABLE `{table_name}` ADD COLUMN result_visibility VARCHAR(32) NULL DEFAULT 'immediate'"
                    )

            # Migrate existing submissions tables that are missing columns added after initial schema
            _submissions_migrations = [
                ("task_id",              "VARCHAR(50) NULL"),
                ("submission_type",      "VARCHAR(50) NULL"),
                ("file_name",            "VARCHAR(255) NULL"),
                ("feedback",             "LONGTEXT NULL"),
                ("ai_explanation",       "LONGTEXT NULL"),
                ("analysis_correctness", "INT NULL"),
                ("analysis_efficiency",  "INT NULL"),
                ("analysis_code_style",  "INT NULL"),
                ("analysis_best_practices", "INT NULL"),
                ("plagiarism_detected",  "VARCHAR(10) NULL"),
                ("copied_from",          "VARCHAR(50) NULL"),
                ("copied_from_name",     "VARCHAR(255) NULL"),
                ("tab_switches",         "INT NULL"),
                ("copy_paste_attempts",       "INT NULL"),
                ("camera_blocked_count",      "INT NULL"),
                ("phone_detection_count",     "INT NULL"),
                ("face_not_detected_count",   "INT NULL"),
                ("multiple_faces_count",      "INT NULL"),
                ("face_lookaway_count",       "INT NULL"),
                ("proctoring_video",          "VARCHAR(500) NULL"),
                ("integrity_violation",  "VARCHAR(10) NULL"),
            ]
            for col_name, col_def in _submissions_migrations:
                await cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'submissions'
                      AND COLUMN_NAME = %s
                    LIMIT 1
                    """,
                    (col_name,),
                )
                if not await cur.fetchone():
                    await cur.execute(
                        f"ALTER TABLE `submissions` ADD COLUMN `{col_name}` {col_def}"
                    )


# â"€â"€â"€ Prescan table DDL â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

_PRESCAN_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS prescan_exams (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INT NOT NULL DEFAULT 60,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_exam_sessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        candidate_id VARCHAR(50) NOT NULL,
        exam_id BIGINT NOT NULL,
        session_token VARCHAR(128) NOT NULL UNIQUE,
        status ENUM('pending','scanning','approved','rejected','incomplete','in_progress','completed') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_candidate_exam (candidate_id, exam_id),
        INDEX idx_token (session_token),
        FOREIGN KEY (exam_id) REFERENCES prescan_exams(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_room_scans (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        exam_session_id BIGINT NOT NULL,
        mobile_socket_id VARCHAR(128),
        scan_start_time DATETIME,
        scan_end_time DATETIME,
        final_verdict ENUM('approved','rejected','incomplete'),
        verdict_reason TEXT,
        total_frames INT DEFAULT 0,
        flagged_frames INT DEFAULT 0,
        angles_covered JSON,
        raw_summary JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_session_id) REFERENCES prescan_exam_sessions(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_scan_frames (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        room_scan_id BIGINT NOT NULL,
        frame_index INT NOT NULL,
        captured_at DATETIME(3) NOT NULL,
        angle_label VARCHAR(32),
        device_orientation JSON,
        detections JSON NOT NULL,
        is_flagged TINYINT(1) NOT NULL DEFAULT 0,
        flag_reasons JSON,
        processing_ms INT,
        groq_raw_response TEXT,
        FOREIGN KEY (room_scan_id) REFERENCES prescan_room_scans(id),
        INDEX idx_scan_frame (room_scan_id, frame_index)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_scan_audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        room_scan_id BIGINT NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        actor VARCHAR(32) NOT NULL,
        payload JSON,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (room_scan_id) REFERENCES prescan_room_scans(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prescan_scan_overrides (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        room_scan_id BIGINT NOT NULL UNIQUE,
        proctor_id VARCHAR(50) NOT NULL,
        original_verdict ENUM('approved','rejected','incomplete') NOT NULL,
        override_verdict ENUM('approved','rejected') NOT NULL,
        reason TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_scan_id) REFERENCES prescan_room_scans(id)
    )
    """,
]

_PRESCAN_SEED_EXAMS = [
    (1, "General Assessment",      "Standard general knowledge assessment",        60),
    (2, "Technical Aptitude Test", "Programming and technical problem solving",     90),
    (3, "Mathematics Exam",        "Algebra, calculus and statistics assessment",   75),
]


async def ensure_core_users_table() -> None:
    """Ensure core users table exists on fresh databases."""
    if _pool is None:
        print("[WARNING] Cannot ensure users table - pool not initialised.")
        return

    try:
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id VARCHAR(50) NOT NULL PRIMARY KEY,
                        email VARCHAR(255) NULL,
                        password VARCHAR(255) NULL,
                        role VARCHAR(20) NULL DEFAULT 'student',
                        name VARCHAR(255) NULL,
                        avatar VARCHAR(255) NULL,
                        specialization VARCHAR(255) NULL,
                        mentor_id VARCHAR(50) NULL,
                        batch VARCHAR(20) NULL,
                        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                        phone VARCHAR(20) NULL,
                        status ENUM('active','inactive','suspended') NULL DEFAULT 'active',
                        tier VARCHAR(50) NULL DEFAULT 'beginner',
                        theme_preference VARCHAR(50) NULL DEFAULT 'system',
                        ide_theme VARCHAR(50) NULL DEFAULT 'vs-dark',
                        keyboard_shortcuts_enabled TINYINT(1) NULL DEFAULT 1,
                        tier_start_date TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                        tier_expiry_date TIMESTAMP NULL DEFAULT NULL,
                        must_change_password TINYINT(1) NOT NULL DEFAULT 0,
                        UNIQUE KEY uq_users_email (email),
                        KEY idx_users_role (role),
                        KEY idx_users_mentor (mentor_id)
                    )
                    """
                )
        print("[OK] Core users table verified.")
    except Exception as exc:
        print(f"[WARNING] Core users table migration (non-fatal): {exc}")


async def _drop_foreign_keys_for_column(cur, table_name: str, column_name: str) -> None:
    await cur.execute(
        """
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
          AND REFERENCED_TABLE_NAME IS NOT NULL
        """,
        (settings.DB_NAME, table_name, column_name),
    )
    rows = await cur.fetchall() or []
    for row in rows:
        name = row.get("CONSTRAINT_NAME")
        if not name:
            continue
        try:
            await cur.execute(f"ALTER TABLE `{table_name}` DROP FOREIGN KEY `{name}`")
            print(f"[OK] Dropped foreign key {table_name}.{name}")
        except Exception as exc:
            print(f"[WARNING] Could not drop foreign key {table_name}.{name}: {exc}")


async def _ensure_prescan_identity_columns() -> None:
    if _pool is None:
        return

    migrations = [
        ("prescan_exam_sessions", "candidate_id"),
        ("prescan_scan_overrides", "proctor_id"),
    ]

    async with _pool.acquire() as conn:
        async with conn.cursor() as cur:
            for table_name, column_name in migrations:
                try:
                    await cur.execute(
                        """
                        SELECT DATA_TYPE, COLUMN_TYPE
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = %s
                          AND TABLE_NAME = %s
                          AND COLUMN_NAME = %s
                        """,
                        (settings.DB_NAME, table_name, column_name),
                    )
                    meta = await cur.fetchone()
                    if not meta:
                        print(f"[WARNING] Missing column for migration: {table_name}.{column_name}")
                        continue

                    if str(meta.get("DATA_TYPE", "")).lower() == "varchar":
                        continue

                    await _drop_foreign_keys_for_column(cur, table_name, column_name)
                    await cur.execute(
                        f"ALTER TABLE `{table_name}` MODIFY COLUMN `{column_name}` VARCHAR(50) NOT NULL"
                    )
                    print(f"[OK] Updated {table_name}.{column_name} to VARCHAR(50)")
                except Exception as exc:
                    print(f"[WARNING] Prescan identity-column migration {table_name}.{column_name} failed: {exc}")

            # Best-effort data backfill: convert legacy numeric prescan user ids to main users.id (by email).
            await cur.execute(
                """
                SELECT 1
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'prescan_users'
                LIMIT 1
                """,
                (settings.DB_NAME,),
            )
            has_prescan_users = bool(await cur.fetchone())
            if not has_prescan_users:
                print("[INFO] Legacy prescan_users table not found; skipping prescan id backfill.")
                return

            try:
                await cur.execute(
                    """
                    UPDATE prescan_exam_sessions es
                    JOIN prescan_users pu ON pu.id = CAST(es.candidate_id AS UNSIGNED)
                    JOIN users u ON u.email = pu.email
                    SET es.candidate_id = u.id
                    WHERE es.candidate_id REGEXP '^[0-9]+$'
                    """
                )
            except Exception as exc:
                print(f"[WARNING] Prescan candidate-id backfill skipped: {exc}")

            try:
                await cur.execute(
                    """
                    UPDATE prescan_scan_overrides so
                    JOIN prescan_users pu ON pu.id = CAST(so.proctor_id AS UNSIGNED)
                    JOIN users u ON u.email = pu.email
                    SET so.proctor_id = u.id
                    WHERE so.proctor_id REGEXP '^[0-9]+$'
                    """
                )
            except Exception as exc:
                print(f"[WARNING] Prescan proctor-id backfill skipped: {exc}")


async def create_prescan_tables() -> None:
    """Create prescan environment-scan tables if they don't exist."""
    if _pool is None:
        print("[WARNING] Cannot create prescan tables - pool not initialised.")
        return

    for sql in _PRESCAN_TABLES_SQL:
        try:
            async with _pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(sql.strip())
        except Exception as exc:
            print(f"[WARNING] Prescan table DDL (continuing): {exc}")

    await _ensure_prescan_identity_columns()

    # Seed default exams if table is empty
    try:
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) AS cnt FROM prescan_exams")
                row = await cur.fetchone()
                if row and row.get("cnt", 0) == 0:
                    for exam_id, title, desc, dur in _PRESCAN_SEED_EXAMS:
                        await cur.execute(
                            "INSERT INTO prescan_exams (id, title, description, duration_minutes, is_active) VALUES (%s,%s,%s,%s,1)",
                            (exam_id, title, desc, dur),
                        )
                    print(f"[OK] Seeded {len(_PRESCAN_SEED_EXAMS)} default prescan exams.")
    except Exception as exc:
        print(f"[WARNING] Prescan exam seed (non-fatal): {exc}")

    print("[OK] Prescan tables verified.")


async def ensure_auth_login_schema() -> None:
    """Add OTP / first-login columns and helper tables for authentication."""
    if _pool is None:
        print("[WARNING] Cannot run auth schema migration - pool not initialised.")
        return

    try:
        await ensure_core_users_table()
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
                    """,
                    (settings.DB_NAME,),
                )
                if not await cur.fetchone():
                    await cur.execute(
                        "ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0"
                    )
                    print("[OK] Added column users.must_change_password")

                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS auth_login_challenges (
                        id CHAR(36) NOT NULL PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL,
                        otp_hash VARCHAR(128) NOT NULL,
                        expires_at DATETIME NOT NULL,
                        consumed TINYINT(1) NOT NULL DEFAULT 0,
                        failed_attempts INT NOT NULL DEFAULT 0,
                        auth_method VARCHAR(16) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_pending (user_id, consumed)
                    )
                    """
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS auth_password_setup_tokens (
                        token CHAR(36) NOT NULL PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL,
                        expires_at DATETIME NOT NULL,
                        consumed TINYINT(1) NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_setup (user_id, consumed)
                    )
                    """
                )
        print("[OK] Auth login / OTP schema verified.")
    except Exception as exc:
        print(f"[WARNING] Auth schema migration (non-fatal): {exc}")


async def ensure_rbac_schema() -> None:
    """Create multi-tenant RBAC schema for organizations, roles, and permissions."""
    if _pool is None:
        print("[WARNING] Cannot run RBAC schema migration - pool not initialised.")
        return

    ddl = [
        """
        CREATE TABLE IF NOT EXISTS organizations (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(64) NOT NULL UNIQUE,
            type ENUM('institutional','corporate') NOT NULL DEFAULT 'institutional',
            db_url TEXT NULL,
            db_secret_ref VARCHAR(255) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_by VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS roles (
            id CHAR(36) NOT NULL PRIMARY KEY,
            organization_id CHAR(36) NOT NULL,
            name VARCHAR(128) NOT NULL,
            slug VARCHAR(128) NOT NULL,
            description TEXT NULL,
            is_system TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_org_role_slug (organization_id, slug),
            CONSTRAINT fk_roles_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS role_permissions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            role_id CHAR(36) NOT NULL,
            permission_key VARCHAR(128) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_role_permission (role_id, permission_key),
            CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS user_role_assignments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            organization_id CHAR(36) NOT NULL,
            role_id CHAR(36) NOT NULL,
            is_primary TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_org (user_id, organization_id),
            CONSTRAINT fk_user_role_assignments_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
            CONSTRAINT fk_user_role_assignments_role FOREIGN KEY (role_id) REFERENCES roles(id)
        )
        """,
    ]

    try:
        await ensure_core_users_table()
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                for sql in ddl:
                    await cur.execute(sql)
                await cur.execute(
                    """
                    SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users' AND COLUMN_NAME = 'organization_id'
                    """,
                    (settings.DB_NAME,),
                )
                if not await cur.fetchone():
                    await cur.execute("ALTER TABLE users ADD COLUMN organization_id CHAR(36) NULL")
                await cur.execute(
                    """
                    SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'db_secret_ref'
                    """,
                    (settings.DB_NAME,),
                )
                if not await cur.fetchone():
                    await cur.execute("ALTER TABLE organizations ADD COLUMN db_secret_ref VARCHAR(255) NULL")
                await cur.execute(
                    """
                    SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'subscription_type'
                    """,
                    (settings.DB_NAME,),
                )
                if not await cur.fetchone():
                    await cur.execute(
                        "ALTER TABLE organizations ADD COLUMN subscription_type VARCHAR(32) NOT NULL DEFAULT 'free_trial'"
                    )
        print("[OK] RBAC schema verified.")
    except Exception as exc:
        print(f"[WARNING] RBAC schema migration (non-fatal): {exc}")


async def ensure_default_super_admins() -> None:
    """Seed platform super-admin users if they do not exist."""
    if _pool is None:
        print("[WARNING] Cannot seed default super admins - pool not initialised.")
        return
    if not settings.SUPER_ADMIN_SEED_ENABLED:
        print("[INFO] Default super-admin seeding is disabled (SUPER_ADMIN_SEED_ENABLED=false).")
        return

    defaults = [
        (
            settings.SUPER_ADMIN_1_ID,
            settings.SUPER_ADMIN_1_NAME,
            settings.SUPER_ADMIN_1_EMAIL,
            settings.SUPER_ADMIN_1_PASSWORD,
        ),
        (
            settings.SUPER_ADMIN_2_ID,
            settings.SUPER_ADMIN_2_NAME,
            settings.SUPER_ADMIN_2_EMAIL,
            settings.SUPER_ADMIN_2_PASSWORD,
        ),
    ]

    try:
        await ensure_core_users_table()
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                for user_id, name, email, plain_password in defaults:
                    if not email:
                        continue
                    if not plain_password:
                        print(f"[WARNING] Missing password env for super-admin {email}; skipping seed/update.")
                        continue
                    pw_hash = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                    await cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                    exists = await cur.fetchone()
                    if exists:
                        if settings.SUPER_ADMIN_ROTATE_PASSWORDS_ON_STARTUP:
                            await cur.execute(
                                """
                                UPDATE users
                                SET password = %s, role = 'admin', status = 'active', must_change_password = 0
                                WHERE email = %s
                                """,
                                (pw_hash, email),
                            )
                        continue
                    await cur.execute(
                        """
                        INSERT INTO users (id, name, email, password, role, status, must_change_password, created_at)
                        VALUES (%s, %s, %s, %s, 'admin', 'active', 0, NOW())
                        """,
                        (user_id, name, email, pw_hash),
                    )
        print("[OK] Default super-admin users ensured.")
    except Exception as exc:
        print(f"[WARNING] Default super-admin seed failed: {exc}")


async def ensure_proctoring_tables() -> None:
    """Create all shared proctoring tables once at startup."""
    if _pool is None:
        print("[WARNING] Cannot run proctoring schema migration - pool not initialised.")
        return

    ddl = [
        """
        CREATE TABLE IF NOT EXISTS proctoring_events_unified (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            test_type VARCHAR(32) NOT NULL,
            test_id VARCHAR(64) NULL,
            attempt_id VARCHAR(64) NULL,
            user_id VARCHAR(64) NOT NULL,
            session_id VARCHAR(128) NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            details LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pu_test_type (test_type),
            INDEX idx_pu_user (user_id),
            INDEX idx_pu_session (session_id),
            INDEX idx_pu_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS aptitude_proctoring_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            test_id VARCHAR(64) NULL,
            user_id VARCHAR(64) NOT NULL,
            session_id VARCHAR(128) NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            details LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ap_user (user_id),
            INDEX idx_ap_session (session_id),
            INDEX idx_ap_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS global_test_proctoring_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            test_id VARCHAR(64) NULL,
            user_id VARCHAR(64) NOT NULL,
            session_id VARCHAR(128) NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            details LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_gtp_user (user_id),
            INDEX idx_gtp_session (session_id),
            INDEX idx_gtp_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS comm_proctoring_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            session_id VARCHAR(100) NOT NULL DEFAULT 'default',
            event_type VARCHAR(50) NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'low',
            details LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_session (user_id, session_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS skill_proctoring_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            attempt_id INT NOT NULL,
            test_stage VARCHAR(32) NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            severity VARCHAR(16) NOT NULL DEFAULT 'low',
            details LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sp_attempt (attempt_id),
            INDEX idx_sp_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
    ]

    try:
        async with _pool.acquire() as conn:
            async with conn.cursor() as cur:
                for sql in ddl:
                    await cur.execute(sql)
        print("[OK] Proctoring tables verified.")
    except Exception as exc:
        print(f"[WARNING] Proctoring schema migration (non-fatal): {exc}")


async def run_startup_db_preflight(check_tenants: bool = True) -> dict:
    """Run DB preflight checks during backend startup.

    Returns a summary dict:
      {"ok": bool, "primary": {...}, "tenants": [...]}
    """
    summary = {"ok": True, "primary_ok": True, "tenant_ok": True, "primary": {}, "tenants": []}
    pool = await get_primary_pool()

    # Primary DB checks
    required_tables = [
        "users",
        "organizations",
        "roles",
        "role_permissions",
        "user_role_assignments",
    ]
    required_columns = {
        "users": ["id", "email", "password", "role", "organization_id", "status"],
        "organizations": ["id", "name", "code", "db_url", "db_secret_ref", "is_active"],
    }

    missing_tables: list[str] = []
    missing_columns: list[str] = []

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            for t in required_tables:
                await cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.tables
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                    LIMIT 1
                    """,
                    (settings.DB_NAME, t),
                )
                if not await cur.fetchone():
                    missing_tables.append(t)

            for table, cols in required_columns.items():
                for col in cols:
                    await cur.execute(
                        """
                        SELECT 1
                        FROM information_schema.columns
                        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s
                        LIMIT 1
                        """,
                        (settings.DB_NAME, table, col),
                    )
                    if not await cur.fetchone():
                        missing_columns.append(f"{table}.{col}")

    summary["primary"] = {
        "db": f"{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}",
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
    }
    if missing_tables or missing_columns:
        summary["ok"] = False
        summary["primary_ok"] = False

    # Tenant DB URL checks (connectivity only, per active organization)
    if check_tenants:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, name, db_url, db_secret_ref
                    FROM organizations
                    WHERE is_active = 1
                      AND (
                        (db_url IS NOT NULL AND TRIM(db_url) != '')
                        OR (db_secret_ref IS NOT NULL AND TRIM(db_secret_ref) != '')
                      )
                    """
                )
                orgs = await cur.fetchall() or []

        for org in orgs:
            org_id = str(org.get("id") or "")
            org_name = str(org.get("name") or "")
            db_url = resolve_tenant_db_url(
                db_url=org.get("db_url"),
                db_secret_ref=org.get("db_secret_ref"),
            ) or ""
            if not db_url:
                continue
            try:
                _ = await get_tenant_pool_by_db_url(db_url)
                # Verify tenant functional tables for aptitude/sql/communication/coding/submissions.
                missing_tables: list[str] = []
                pool = await get_tenant_pool_by_db_url(db_url)
                async with pool.acquire() as tconn:
                    async with tconn.cursor() as tcur:
                        for table_name in _REQUIRED_TENANT_DOMAIN_TABLES:
                            await tcur.execute(
                                """
                                SELECT 1
                                FROM information_schema.tables
                                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
                                LIMIT 1
                                """,
                                (table_name,),
                            )
                            if not await tcur.fetchone():
                                missing_tables.append(table_name)
                ok = len(missing_tables) == 0
                summary["tenants"].append(
                    {
                        "org_id": org_id,
                        "org_name": org_name,
                        "ok": ok,
                        "missing_tables": missing_tables,
                    }
                )
                if not ok:
                    summary["ok"] = False
                    summary["tenant_ok"] = False
            except Exception as exc:
                summary["tenants"].append({"org_id": org_id, "org_name": org_name, "ok": False, "error": str(exc)})
                summary["ok"] = False
                summary["tenant_ok"] = False

    return summary


def _connect_sync_from_url(db_url: str):
    kwargs = _build_connect_kwargs_from_url(db_url)
    return pymysql.connect(**kwargs)


def _connect_primary_sync():
    ssl_ctx = _ssl.create_default_context()
    if os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes"):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)
    return pymysql.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        ssl=ssl_ctx,
        charset="utf8mb4",
        connect_timeout=15,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _bootstrap_missing_tables_into_tenant(tenant_db_url: str) -> dict[str, int]:
    primary_conn = _connect_primary_sync()
    tenant_conn = _connect_sync_from_url(tenant_db_url)
    created = 0
    existing = 0
    try:
        with primary_conn.cursor() as pcur, tenant_conn.cursor() as tcur:
            pcur.execute("SHOW TABLES")
            table_rows = pcur.fetchall() or []
            table_names = [next(iter(r.values())) for r in table_rows]
            tcur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table_name in table_names:
                tcur.execute(
                    """
                    SELECT 1 FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
                    """,
                    (table_name,),
                )
                if tcur.fetchone():
                    existing += 1
                    continue
                pcur.execute(f"SHOW CREATE TABLE `{table_name}`")
                ddl_row = pcur.fetchone() or {}
                create_sql = ddl_row.get("Create Table")
                if not create_sql:
                    continue
                tcur.execute(create_sql)
                created += 1
            tcur.execute("SET FOREIGN_KEY_CHECKS = 1")
    finally:
        try:
            primary_conn.close()
        except Exception:
            pass
        try:
            tenant_conn.close()
        except Exception:
            pass
    return {"created": created, "existing": existing}


async def reconcile_active_tenant_schemas() -> list[dict]:
    """Best-effort: clone missing primary tables into all active tenant DBs."""
    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT id, name, db_url, db_secret_ref
                FROM organizations
                WHERE is_active = 1
                  AND (
                    (db_url IS NOT NULL AND TRIM(db_url) != '')
                    OR (db_secret_ref IS NOT NULL AND TRIM(db_secret_ref) != '')
                  )
                """
            )
            orgs = await cur.fetchall() or []

    results: list[dict] = []
    for org in orgs:
        org_id = str(org.get("id") or "")
        org_name = str(org.get("name") or "")
        db_url = resolve_tenant_db_url(
            db_url=org.get("db_url"),
            db_secret_ref=org.get("db_secret_ref"),
        ) or ""
        if not db_url:
            continue
        try:
            stats = await asyncio.to_thread(_bootstrap_missing_tables_into_tenant, db_url)
            results.append({"org_id": org_id, "org_name": org_name, "ok": True, **stats})
        except Exception as exc:
            results.append({"org_id": org_id, "org_name": org_name, "ok": False, "error": str(exc)})
    return results
