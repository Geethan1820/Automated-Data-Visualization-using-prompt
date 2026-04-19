import asyncio
from server.db import AsyncSessionLocal
from server.models import User
from sqlalchemy import select

async def check():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"Users in DB: {[u.username for u in users]}")

if __name__ == "__main__":
    asyncio.run(check())
