"""
db.py — SQLAlchemy async persistence (SQLite or PostgreSQL via DATABASE_URL).
Handles: Users, Files, Chats, Query logs, Context.
"""

import os
import json
import uuid
import traceback
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete
from passlib.hash import pbkdf2_sha256 as hasher
from dotenv import load_dotenv

from config import settings
from models import Base, User, FileRecord, ChatRecord, ContextRecord, QueryLog

# --- DATABASE CONFIG ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")
_DEFAULT_SQLITE = f"sqlite+aiosqlite:///{DB_PATH}"

# Priority: Environment variable > settings object > local sqlite
DATABASE_URL = os.environ.get("DATABASE_URL") or settings.DATABASE_URL or _DEFAULT_SQLITE

# Create async engine (PostgreSQL: postgresql+asyncpg://user:pass@host:5432/dbname)
engine = create_async_engine(DATABASE_URL, echo=False)

# Async session factory
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db():
    """Create tables (SQLite file or PostgreSQL from DATABASE_URL)."""
    safe_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL
    print(f"[DB] Database URL (masked): ...@{safe_url}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[DB] Schema ready.")

# ─── USER OPERATIONS ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hasher.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return hasher.verify(password, hashed)
    except Exception:
        return False

async def create_user(user_id: str, username: str, password: str) -> bool:
    async with AsyncSessionLocal() as session:
        try:
            new_user = User(
                id=user_id,
                username=username,
                password_hash=hash_password(password)
            )
            session.add(new_user)
            await session.commit()
            return True
        except Exception:
            print(f"[DB ERROR] create_user:\n{traceback.format_exc()}")
            await session.rollback()
            return False

async def get_user_by_username(username: str) -> Optional[Dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            return {"id": user.id, "username": user.username, "password_hash": user.password_hash}
        return None

# ─── FILE OPERATIONS ────────────────────────────────────────────────────────

async def save_file(
    file_id: str,
    filename: str,
    filepath: str,
    rows: int,
    columns: int,
    quality_score: int,
    user_id: Optional[str] = None
) -> None:
    async with AsyncSessionLocal() as session:
        try:
            # PostgreSQL doesn't have "INSERT OR REPLACE" exactly like SQLite's specialized syntax, 
            # we use an "on conflict" style or just check first.
            result = await session.execute(select(FileRecord).where(FileRecord.id == file_id))
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.filename = filename
                existing.filepath = filepath
                existing.rows = rows
                existing.columns = columns
                existing.quality_score = quality_score
                existing.user_id = user_id
            else:
                new_file = FileRecord(
                    id=file_id,
                    user_id=user_id,
                    filename=filename,
                    filepath=filepath,
                    rows=rows,
                    columns=columns,
                    quality_score=quality_score
                )
                session.add(new_file)
            
            await session.commit()
        except Exception as e:
            print(f"[DB ERROR] save_file: {e}")
            await session.rollback()

async def get_all_files(user_id: Optional[str] = None) -> List[Dict]:
    async with AsyncSessionLocal() as session:
        query = select(FileRecord).order_by(FileRecord.uploaded_at.desc())
        if user_id:
            query = query.where(FileRecord.user_id == user_id)
        
        result = await session.execute(query)
        files = result.scalars().all()
        return [
            {
                "id": f.id, "user_id": f.user_id, "filename": f.filename, 
                "filepath": f.filepath, "rows": f.rows, "columns": f.columns, 
                "quality_score": f.quality_score, "uploaded_at": f.uploaded_at.isoformat()
            } for f in files
        ]

async def get_file(file_id: str) -> Optional[Dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(FileRecord).where(FileRecord.id == file_id))
        f = result.scalar_one_or_none()
        if f:
             return {
                "id": f.id, "user_id": f.user_id, "filename": f.filename, 
                "filepath": f.filepath, "rows": f.rows, "columns": f.columns, 
                "quality_score": f.quality_score, "uploaded_at": f.uploaded_at.isoformat()
            }
        return None

async def delete_file(file_id: str, user_id: str) -> bool:
    """Delete file and related rows only if it belongs to user_id."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(FileRecord).where(FileRecord.id == file_id))
            fr = result.scalar_one_or_none()
            if not fr or fr.user_id != user_id:
                return False
            await session.execute(delete(ContextRecord).where(ContextRecord.file_id == file_id))
            await session.execute(delete(ChatRecord).where(ChatRecord.file_id == file_id))
            await session.execute(delete(FileRecord).where(FileRecord.id == file_id))
            await session.commit()
            return True
        except Exception as e:
            print(f"[DB ERROR] delete_file: {e}")
            await session.rollback()
            return False

# ─── CHAT OPERATIONS ─────────────────────────────────────────────────────────

async def log_user_query(user_id: str, query_text: str) -> None:
    """Store user id, natural-language query, and time (audit)."""
    async with AsyncSessionLocal() as session:
        try:
            session.add(
                QueryLog(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    query=query_text,
                )
            )
            await session.commit()
        except Exception as e:
            print(f"[DB ERROR] log_user_query: {e}")
            await session.rollback()


async def save_chat(
    chat_id: str,
    file_id: str,
    user_id: str,
    user_prompt: str,
    chart_type: Optional[str] = None,
    x_column: Optional[str] = None,
    y_column: Optional[str] = None,
    aggregation: Optional[str] = None,
    chart_data: Optional[list] = None,
    insights: Optional[list] = None,
    kpis: Optional[dict] = None,
    ml_result: Optional[dict] = None,
    summary: Optional[str] = None,
    color: Optional[str] = None,
    confidence: Optional[float] = None,
    reasoning: Optional[str] = None,
) -> None:
    async with AsyncSessionLocal() as session:
        try:
            new_chat = ChatRecord(
                id=chat_id,
                file_id=file_id,
                user_id=user_id,
                user_prompt=user_prompt,
                chart_type=chart_type,
                x_column=x_column,
                y_column=y_column,
                aggregation=aggregation,
                chart_data=json.dumps(chart_data) if chart_data is not None else None,
                insights=json.dumps(insights) if insights is not None else None,
                kpis=json.dumps(kpis) if kpis is not None else None,
                ml_result=json.dumps(ml_result) if ml_result is not None else None,
                summary=summary,
                color=color,
                confidence=confidence,
                reasoning=reasoning
            )
            session.add(new_chat)
            await session.commit()
        except Exception as e:
            print(f"[DB ERROR] save_chat: {e}")
            await session.rollback()

async def get_chat_history(file_id: str, user_id: str) -> List[Dict]:
    """Chat history for this file only if the file belongs to the user."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ChatRecord)
            .join(FileRecord, ChatRecord.file_id == FileRecord.id)
            .where(ChatRecord.file_id == file_id, FileRecord.user_id == user_id)
            .order_by(ChatRecord.created_at.asc())
        )
        chats = result.scalars().all()
        history = []
        for c in chats:
            d = {
                "id": c.id, "file_id": c.file_id, "user_prompt": c.user_prompt,
                "chart_type": c.chart_type, "x_column": c.x_column, "y_column": c.y_column,
                "aggregation": c.aggregation, "summary": c.summary, "color": c.color,
                "confidence": c.confidence, "reasoning": c.reasoning, 
                "created_at": c.created_at.isoformat()
            }
            # Parse JSON fields
            for field in ["chart_data", "insights", "kpis", "ml_result"]:
                val = getattr(c, field)
                if val:
                    try:
                        d[field] = json.loads(val)
                    except json.JSONDecodeError:
                        d[field] = None
            history.append(d)
        return history


async def get_chat(chat_id: str, user_id: str) -> Optional[Dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ChatRecord)
            .join(FileRecord, ChatRecord.file_id == FileRecord.id)
            .where(ChatRecord.id == chat_id, FileRecord.user_id == user_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            return None
        d = {
            "id": c.id, "file_id": c.file_id, "user_prompt": c.user_prompt,
            "chart_type": c.chart_type, "x_column": c.x_column, "y_column": c.y_column,
            "aggregation": c.aggregation, "summary": c.summary, "color": c.color,
            "confidence": c.confidence, "reasoning": c.reasoning,
            "created_at": c.created_at.isoformat()
        }
        for field in ["chart_data", "insights", "kpis", "ml_result"]:
            val = getattr(c, field)
            if val:
                try:
                    d[field] = json.loads(val)
                except json.JSONDecodeError:
                    d[field] = None
        return d

# ─── CONTEXT OPERATIONS ──────────────────────────────────────────────────────

async def save_context(
    file_id: str,
    chart_type: Optional[str],
    x_col: Optional[str],
    y_col: Optional[str],
    color: Optional[str],
    found_columns: Optional[list]
) -> None:
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(ContextRecord).where(ContextRecord.file_id == file_id))
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.last_chart_type = chart_type
                existing.last_x = x_col
                existing.last_y = y_col
                existing.last_color = color
                existing.found_columns = json.dumps(found_columns) if found_columns else None
                existing.updated_at = datetime.utcnow()
            else:
                new_ctx = ContextRecord(
                    file_id=file_id,
                    last_chart_type=chart_type,
                    last_x=x_col,
                    last_y=y_col,
                    last_color=color,
                    found_columns=json.dumps(found_columns) if found_columns else None
                )
                session.add(new_ctx)
            await session.commit()
        except Exception as e:
            print(f"[DB ERROR] save_context: {e}")
            await session.rollback()

async def get_context(file_id: str) -> Optional[Dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(ContextRecord).where(ContextRecord.file_id == file_id))
        ctx = result.scalar_one_or_none()
        if ctx:
            return {
                "file_id": ctx.file_id, "last_chart_type": ctx.last_chart_type,
                "last_x": ctx.last_x, "last_y": ctx.last_y, "last_color": ctx.last_color,
                "found_columns": json.loads(ctx.found_columns) if ctx.found_columns else []
            }
        return None
