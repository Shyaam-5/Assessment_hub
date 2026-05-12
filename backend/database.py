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

import pymysql
import pymysql.cursors

from config import settings

# â"€â"€â"€ Global pool â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

_pool: "PyMySQLPool | None" = None


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
    """Return the pool or raise if not initialised."""
    if _pool is None:
        raise RuntimeError("Database pool not initialised - call init_db() first.")
    return _pool


async def init_db() -> None:
    """Create the global connection pool at application startup."""
    global _pool

    # NOTE: TiDB Cloud / some managed DBs require TLS but their certs may
    # not be verifiable on all platforms.  In production set VERIFY_DB_SSL=1
    # and provide the CA bundle via DB_SSL_CA env-var.
    ssl_ctx = _ssl.create_default_context()
    if os.getenv("VERIFY_DB_SSL", "").strip() in ("1", "true", "yes"):
        ca_path = os.getenv("DB_SSL_CA", "")
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)
    else:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = _ssl.CERT_NONE

    connect_kwargs = dict(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
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
    print(f"[OK] Database pool created - {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")


async def close_db() -> None:
    """Clean up on shutdown."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        print("[OK] Database pool closed.")


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

