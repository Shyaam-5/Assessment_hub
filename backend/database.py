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


async def get_tenant_pool_by_org_id(org_id: str | None) -> "PyMySQLPool | None":
    if not org_id:
        return None
    primary = await get_primary_pool()
    async with primary.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT db_url FROM organizations WHERE id = %s AND is_active = 1", (org_id,))
            row = await cur.fetchone()
    db_url = (row or {}).get("db_url")
    if not db_url:
        return None
    # Ensure tenant schema is ready at first touch for this org.
    if org_id not in _tenant_schema_checked:
        try:
            await asyncio.to_thread(_bootstrap_missing_tables_into_tenant, db_url)
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
        "organizations": ["id", "name", "code", "db_url", "is_active"],
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
                    "SELECT id, name, db_url FROM organizations WHERE is_active = 1 AND db_url IS NOT NULL AND TRIM(db_url) != ''"
                )
                orgs = await cur.fetchall() or []

        for org in orgs:
            org_id = str(org.get("id") or "")
            org_name = str(org.get("name") or "")
            db_url = str(org.get("db_url") or "").strip()
            if not db_url:
                continue
            try:
                _ = await get_tenant_pool_by_db_url(db_url)
                summary["tenants"].append({"org_id": org_id, "org_name": org_name, "ok": True})
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
                "SELECT id, name, db_url FROM organizations WHERE is_active = 1 AND db_url IS NOT NULL AND TRIM(db_url) != ''"
            )
            orgs = await cur.fetchall() or []

    results: list[dict] = []
    for org in orgs:
        org_id = str(org.get("id") or "")
        org_name = str(org.get("name") or "")
        db_url = str(org.get("db_url") or "").strip()
        if not db_url:
            continue
        try:
            stats = await asyncio.to_thread(_bootstrap_missing_tables_into_tenant, db_url)
            results.append({"org_id": org_id, "org_name": org_name, "ok": True, **stats})
        except Exception as exc:
            results.append({"org_id": org_id, "org_name": org_name, "ok": False, "error": str(exc)})
    return results
