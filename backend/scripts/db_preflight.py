#!/usr/bin/env python3
"""Preflight checker for a new DATABASE_URL / tenant DB URL.

Validates:
1. URL parse + TLS connection
2. Core table presence
3. Core column presence on users/organizations
4. DDL/DML privileges via temporary table probe
"""

from __future__ import annotations

import argparse
import os
import ssl
from dataclasses import dataclass
from urllib.parse import urlparse

import pymysql


REQUIRED_TABLES = [
    "users",
    "organizations",
    "roles",
    "role_permissions",
    "user_role_assignments",
    "submissions",
    "aptitude_tests",
    "aptitude_submissions",
    "global_tests",
]

REQUIRED_COLUMNS = {
    "users": ["id", "email", "password", "role", "organization_id", "status"],
    "organizations": ["id", "name", "code", "db_url", "is_active"],
}


@dataclass
class Result:
    ok: bool
    msg: str


def _mask_url(raw_url: str) -> str:
    p = urlparse(raw_url)
    netloc = f"{p.username or ''}:***@{p.hostname or ''}:{p.port or 3306}"
    return f"{p.scheme}://{netloc}{p.path or ''}"


def _build_conn_kwargs(db_url: str) -> dict:
    p = urlparse(db_url)
    if p.scheme not in ("mysql", "mysql+pymysql"):
        raise ValueError("Unsupported scheme. Use mysql://user:pass@host:port/db")
    db_name = (p.path or "").lstrip("/")
    if not db_name:
        raise ValueError("Database name is missing in URL path.")

    ssl_ctx = ssl.create_default_context()
    insecure = os.getenv("DB_SSL_INSECURE", "").strip().lower() in ("1", "true", "yes")
    if insecure:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    else:
        ca_path = os.getenv("DB_SSL_CA", "").strip()
        if ca_path:
            ssl_ctx.load_verify_locations(ca_path)

    return {
        "host": p.hostname or "localhost",
        "port": int(p.port or 3306),
        "user": p.username or "root",
        "password": p.password or "",
        "database": db_name,
        "ssl": ssl_ctx,
        "charset": "utf8mb4",
        "autocommit": True,
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 15,
    }


def _check_tables(cur, db_name: str) -> list[Result]:
    out: list[Result] = []
    cur.execute(
        """
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE TABLE_SCHEMA = %s
        """,
        (db_name,),
    )
    existing = {r["TABLE_NAME"] for r in cur.fetchall()}
    for t in REQUIRED_TABLES:
        out.append(Result(t in existing, f"table:{t}"))
    return out


def _check_columns(cur, db_name: str) -> list[Result]:
    out: list[Result] = []
    for table, cols in REQUIRED_COLUMNS.items():
        cur.execute(
            """
            SELECT COLUMN_NAME
            FROM information_schema.columns
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """,
            (db_name, table),
        )
        present = {r["COLUMN_NAME"] for r in cur.fetchall()}
        for c in cols:
            out.append(Result(c in present, f"column:{table}.{c}"))
    return out


def _check_privileges(cur) -> list[Result]:
    out: list[Result] = []
    probe = "_preflight_probe_table"
    try:
        cur.execute(f"CREATE TABLE `{probe}` (id INT PRIMARY KEY, v VARCHAR(32))")
        out.append(Result(True, "priv:CREATE TABLE"))
    except Exception as exc:
        out.append(Result(False, f"priv:CREATE TABLE ({exc})"))
        return out

    try:
        cur.execute(f"INSERT INTO `{probe}` (id, v) VALUES (1, 'ok')")
        cur.execute(f"UPDATE `{probe}` SET v='ok2' WHERE id=1")
        cur.execute(f"SELECT v FROM `{probe}` WHERE id=1")
        row = cur.fetchone() or {}
        out.append(Result((row.get("v") == "ok2"), "priv:SELECT/INSERT/UPDATE"))
    except Exception as exc:
        out.append(Result(False, f"priv:SELECT/INSERT/UPDATE ({exc})"))

    try:
        cur.execute(f"ALTER TABLE `{probe}` ADD COLUMN x INT NULL")
        out.append(Result(True, "priv:ALTER TABLE"))
    except Exception as exc:
        out.append(Result(False, f"priv:ALTER TABLE ({exc})"))

    try:
        cur.execute(f"DROP TABLE `{probe}`")
        out.append(Result(True, "priv:DROP TABLE"))
    except Exception as exc:
        out.append(Result(False, f"priv:DROP TABLE ({exc})"))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DB URL before switching production traffic.")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL", "").strip(), help="MySQL URL to validate")
    args = parser.parse_args()

    if not args.db_url:
        print("[FAIL] Missing --db-url and DATABASE_URL is empty.")
        return 2

    print(f"[INFO] Preflight target: {_mask_url(args.db_url)}")
    try:
        kwargs = _build_conn_kwargs(args.db_url)
    except Exception as exc:
        print(f"[FAIL] Invalid DB URL/config: {exc}")
        return 2

    db_name = kwargs["database"]
    results: list[Result] = []

    try:
        conn = pymysql.connect(**kwargs)
    except Exception as exc:
        print(f"[FAIL] Connection failed: {exc}")
        return 2

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone() or {}
            results.append(Result(row.get("ok") == 1, "connectivity:SELECT 1"))
            results.extend(_check_tables(cur, db_name))
            results.extend(_check_columns(cur, db_name))
            results.extend(_check_privileges(cur))
    finally:
        conn.close()

    failed = [r for r in results if not r.ok]
    for r in results:
        print(f"[{'OK' if r.ok else 'FAIL'}] {r.msg}")

    if failed:
        print(f"[SUMMARY] FAILED {len(failed)} / {len(results)} checks.")
        return 1
    print(f"[SUMMARY] PASSED all {len(results)} checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

