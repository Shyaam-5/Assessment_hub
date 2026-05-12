import logging
logger = logging.getLogger(__name__)

import asyncio
from database import get_pool, init_db
import pymysql.cursors

async def run():
    await init_db()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(pymysql.cursors.DictCursor) as cur:
            await cur.execute("SELECT id, email, password FROM users LIMIT 10")
            users = await cur.fetchall()
            for u in users:
                print(f"ID: {u['id']}, Email: {u['email']}, Password: {u['password']}")

if __name__ == "__main__":
    asyncio.run(run())

