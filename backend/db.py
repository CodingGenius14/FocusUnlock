import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "sessions.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'legacy',
                site TEXT NOT NULL,
                duration_minutes REAL NOT NULL,
                timestamp TEXT NOT NULL
            )
            """
        )
        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
        }
        if "user_id" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy'")
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_sessions_user_timestamp
            ON sessions (user_id, timestamp DESC, id DESC)
            """
        )
        conn.commit()


def insert_session(
    user_id: str,
    site: str,
    duration_minutes: float,
    timestamp: str,
) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO sessions (user_id, site, duration_minutes, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, site, duration_minutes, timestamp),
        )
        conn.commit()
        return int(cursor.lastrowid)


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, site, duration_minutes, timestamp
            FROM sessions
            WHERE user_id = ?
            ORDER BY timestamp DESC, id DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]
