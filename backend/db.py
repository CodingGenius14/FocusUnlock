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
                site TEXT NOT NULL,
                duration_minutes REAL NOT NULL,
                timestamp TEXT NOT NULL
            )
            """
        )
        conn.commit()


def insert_session(site: str, duration_minutes: float, timestamp: str) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO sessions (site, duration_minutes, timestamp)
            VALUES (?, ?, ?)
            """,
            (site, duration_minutes, timestamp),
        )
        conn.commit()
        return int(cursor.lastrowid)


def list_sessions() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, site, duration_minutes, timestamp
            FROM sessions
            ORDER BY timestamp DESC, id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]
