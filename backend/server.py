from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import init_db, insert_session, list_sessions


class SessionPayload(BaseModel):
    site: str
    duration_minutes: float
    timestamp: str


app = FastAPI(title="FocusUnlock API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.post("/sessions")
def create_session(payload: SessionPayload) -> dict:
    row_id = insert_session(payload.site, payload.duration_minutes, payload.timestamp)
    return {"id": row_id, "ok": True}


@app.get("/sessions")
def get_sessions() -> list[dict]:
    return list_sessions()
