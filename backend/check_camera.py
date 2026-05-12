import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

import asyncio
import httpx

async def run():
    async with httpx.AsyncClient() as client:
        resp = await client.get('http://localhost:8000/api/students/student-085/problems')
        problems = resp.json()
        for p in problems:
            proc = p.get('proctoring', {})
            if proc.get('enabled'):
                print(f"Problem: {p['title']}")
                print(f"  videoAudio: {proc.get('videoAudio')}")
                print(f"  Full proctoring: {proc}")
                print()

if __name__ == "__main__":
    asyncio.run(run())

