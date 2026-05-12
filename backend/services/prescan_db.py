"""
prescan_db.py
-------------
Thin async wrapper around the main backend's PyMySQLPool that provides
the same fetchone / fetchall / execute / execute_lastrowid interface
expected by the environment-scan services.
"""
from __future__ import annotations

import logging
from logging_config import LogConfig
logger = LogConfig.get_logger(__name__)
from typing import Any, Dict, List, Optional

from database import get_pool

logger = LogConfig.get_logger(__name__)


class PrescanDB:
    """Wraps the shared connection pool for environment-scan queries."""

    async def fetchone(self, query: str, args=None) -> Optional[Dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, args)
                return await cur.fetchone()

    async def fetchall(self, query: str, args=None) -> List[Dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, args)
                return await cur.fetchall() or []

    async def execute(self, query: str, args=None) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                result = await cur.execute(query, args)
                return result

    async def execute_lastrowid(self, query: str, args=None) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, args)
                return cur.lastrowid


# Module-level singleton
_prescan_db: Optional[PrescanDB] = None


def get_prescan_db() -> PrescanDB:
    global _prescan_db
    if _prescan_db is None:
        _prescan_db = PrescanDB()
    return _prescan_db

