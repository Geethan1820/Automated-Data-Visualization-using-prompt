"""
db.py — SQLite persistence layer for DataSight.
Handles: FILES, CHATS, CONTEXT, USERS tables.
"""

import sqlite3
import json
import os
import hashlib
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    """Create all tables if they don't exist."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id        TEXT PRIMARY KEY,
                username  TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                id          TEXT PRIMARY KEY,
                user_id     TEXT,
                filename    TEXT NOT NULL,
                filepath    TEXT NOT NULL,
                rows        INTEGER,
                columns     INTEGER,
                quality_score INTEGER,
                uploaded_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS chats (
                id          TEXT PRIMARY KEY,
                file_id     TEXT NOT NULL,
                user_prompt TEXT NOT NULL,
                chart_type  TEXT,
                x_column    TEXT,
                y_column    TEXT,
                aggregation TEXT,
                chart_data  TEXT,
                insights    TEXT,
                kpis        TEXT,
                ml_result   TEXT,
                summary     TEXT,
                color       TEXT,
                confidence  REAL,
                reasoning   TEXT,
                created_at  TEXT NOT NULL,
                FOREIGN KEY(file_id) REFERENCES files(id)
            );

            CREATE TABLE IF NOT EXISTS context (
                file_id         TEXT PRIMARY KEY,
                last_chart_type TEXT,
                last_x          TEXT,
                last_y          TEXT,
                last_color      TEXT,
                found_columns   TEXT,
                updated_at      TEXT NOT NULL,
                FOREIGN KEY(file_id) REFERENCES files(id)
            );
        """)
    print("[DB] Database initialized at:", DB_PATH)


# ─── FILE OPERATIONS ────────────────────────────────────────────────────────

def save_file(
    file_id: str,
    filename: str,
    filepath: str,
    rows: int,
    columns: int,
    quality_score: int,
    user_id: Optional[str] = None
) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO files
               (id, user_id, filename, filepath, rows, columns, quality_score, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (file_id, user_id, filename, filepath, rows, columns, quality_score,
             datetime.utcnow().isoformat())
        )


def get_all_files(user_id: Optional[str] = None) -> List[Dict]:
    with get_conn() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT * FROM files WHERE user_id=? ORDER BY uploaded_at DESC", (user_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM files ORDER BY uploaded_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]


def get_file(file_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id=?", (file_id,)).fetchone()
        return dict(row) if row else None


def delete_file(file_id: str) -> bool:
    """Delete a file and all its associated chats and context rows. Returns True if deleted."""
    with get_conn() as conn:
        conn.execute("DELETE FROM context WHERE file_id=?", (file_id,))
        conn.execute("DELETE FROM chats WHERE file_id=?", (file_id,))
        cursor = conn.execute("DELETE FROM files WHERE id=?", (file_id,))
        return cursor.rowcount > 0


# ─── CHAT OPERATIONS ─────────────────────────────────────────────────────────

def save_chat(
    chat_id: str,
    file_id: str,
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
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO chats
               (id, file_id, user_prompt, chart_type, x_column, y_column,
                aggregation, chart_data, insights, kpis, ml_result, summary,
                color, confidence, reasoning, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                chat_id, file_id, user_prompt, chart_type, x_column, y_column,
                aggregation,
                json.dumps(chart_data) if chart_data is not None else None,
                json.dumps(insights) if insights is not None else None,
                json.dumps(kpis) if kpis is not None else None,
                json.dumps(ml_result) if ml_result is not None else None,
                summary, color, confidence, reasoning,
                datetime.utcnow().isoformat()
            )
        )


def get_chat_history(file_id: str) -> List[Dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM chats WHERE file_id=? ORDER BY created_at ASC", (file_id,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            for field in ("chart_data", "insights", "kpis", "ml_result"):
                if d.get(field):
                    try:
                        d[field] = json.loads(d[field])
                    except Exception:
                        pass
            result.append(d)
        return result


def get_chat(chat_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        for field in ("chart_data", "insights", "kpis", "ml_result"):
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except Exception:
                    pass
        return d


# ─── CONTEXT OPERATIONS ──────────────────────────────────────────────────────

def save_context(
    file_id: str,
    chart_type: Optional[str],
    x_col: Optional[str],
    y_col: Optional[str],
    color: Optional[str],
    found_columns: Optional[list]
) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO context
               (file_id, last_chart_type, last_x, last_y, last_color, found_columns, updated_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                file_id, chart_type, x_col, y_col, color,
                json.dumps(found_columns) if found_columns else None,
                datetime.utcnow().isoformat()
            )
        )


def get_context(file_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM context WHERE file_id=?", (file_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("found_columns"):
            try:
                d["found_columns"] = json.loads(d["found_columns"])
            except Exception:
                d["found_columns"] = []
        return d


# ─── USER OPERATIONS ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":")
        return hashlib.sha256((password + salt).encode()).hexdigest() == hashed
    except Exception:
        return False


def create_user(user_id: str, username: str, password: str) -> bool:
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
                (user_id, username, hash_password(password), datetime.utcnow().isoformat())
            )
        return True
    except sqlite3.IntegrityError:
        return False  # Username already exists


def get_user_by_username(username: str) -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()
        return dict(row) if row else None
