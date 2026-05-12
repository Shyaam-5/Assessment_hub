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
            await cur.execute("SELECT id, title, enable_proctoring, track_tab_switches FROM problems LIMIT 5")
            probs = await cur.fetchall()
            for p in probs:
                print(p)
            await pool.close()

if __name__ == "__main__":
    asyncio.run(run())

