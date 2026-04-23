from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
from urllib import error, request

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import init_db, insert_session, list_sessions


class SessionPayload(BaseModel):
    user_id: str = Field(min_length=1, max_length=200)
    site: str
    duration_minutes: float
    timestamp: str


class AIAssistPayload(BaseModel):
    goal: str = Field(min_length=8, max_length=1200)
    current_work_sites: list[str] = Field(default_factory=list)
    daily_goal_minutes: int = Field(default=120, ge=1, le=1440)


def load_env_file() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = value.strip().strip('"').strip("'")
        existing = os.getenv(key)
        if existing is None or not existing.strip():
            os.environ[key] = value


def normalize_domain(value: str) -> str:
    cleaned = value.strip().lower().replace("https://", "").replace("http://", "")
    cleaned = cleaned.split("/")[0].replace("www.", "")
    return cleaned


THEME_SITE_PATTERNS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "coding": (
        ("interview", "leetcode", "dsa", "algorithm", "code", "coding", "developer", "programming", "debug"),
        (
            "github.com",
            "stackoverflow.com",
            "leetcode.com",
            "neetcode.io",
            "hackerrank.com",
            "codeforces.com",
            "geeksforgeeks.org",
        ),
    ),
    "writing": (
        ("write", "writing", "essay", "report", "doc", "document"),
        ("docs.google.com", "notion.so", "overleaf.com", "grammarly.com"),
    ),
    "research": (
        ("research", "paper", "study", "read", "reading"),
        ("scholar.google.com", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "wikipedia.org"),
    ),
    "design": (
        ("design", "ui", "ux"),
        ("figma.com", "dribbble.com", "behance.net"),
    ),
    "math": (
        ("math", "calculus", "algebra", "statistics"),
        ("khanacademy.org", "wolframalpha.com", "desmos.com"),
    ),
    "coursework": (
        ("class", "assignment", "homework", "course"),
        ("canvas.instructure.com", "coursera.org", "edx.org", "udemy.com"),
    ),
}

DISTRACTION_DOMAINS = {
    "chess.com",
    "reddit.com",
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "netflix.com",
    "twitch.tv",
}

DEFAULT_PRODUCTIVE_DOMAINS = ("notion.so", "docs.google.com", "github.com", "stackoverflow.com")


def site_matches_pattern(site: str, pattern: str) -> bool:
    return site == pattern or site.endswith(f".{pattern}")


def relevant_domains_for_goal(goal: str, current_work_sites: list[str]) -> tuple[set[str], bool]:
    goal_lower = goal.lower()
    allowed = {normalize_domain(site) for site in current_work_sites if normalize_domain(site)}
    matched_any_theme = False

    for keywords, patterns in THEME_SITE_PATTERNS.values():
        if any(keyword in goal_lower for keyword in keywords):
            matched_any_theme = True
            allowed.update(patterns)

    if not matched_any_theme:
        allowed.update(DEFAULT_PRODUCTIVE_DOMAINS)

    return allowed, matched_any_theme


def filter_relevant_sites(goal: str, current_work_sites: list[str], candidate_sites: list[str]) -> list[str]:
    allowed_domains, matched_theme = relevant_domains_for_goal(goal, current_work_sites)
    allowed_normalized = [normalize_domain(item) for item in allowed_domains]
    filtered: list[str] = []

    for raw_site in candidate_sites:
        site = normalize_domain(raw_site)
        if not site:
            continue
        if site in DISTRACTION_DOMAINS and matched_theme:
            continue
        if any(site_matches_pattern(site, allowed) for allowed in allowed_normalized):
            if site not in filtered:
                filtered.append(site)

    return filtered


def build_fallback_plan(goal: str, current_work_sites: list[str], daily_goal_minutes: int) -> dict:
    goal_lower = goal.lower()
    suggested: list[str] = []

    keyword_sites = [
        (("interview", "leetcode", "dsa", "algorithms"), ["leetcode.com", "neetcode.io"]),
        (("code", "coding", "developer", "programming"), ["github.com", "stackoverflow.com"]),
        (("write", "writing", "essay", "report", "doc"), ["docs.google.com", "notion.so"]),
        (("research", "paper", "study", "read"), ["scholar.google.com", "arxiv.org"]),
        (("math", "calculus", "algebra"), ["khanacademy.org", "wolframalpha.com"]),
        (("design", "ui", "ux"), ["figma.com", "dribbble.com"]),
        (("class", "assignment", "homework", "course"), ["canvas.instructure.com", "cmu.edu"]),
    ]

    for keywords, sites in keyword_sites:
        if any(word in goal_lower for word in keywords):
            suggested.extend(sites)

    suggested.extend(current_work_sites)

    defaults = ["notion.so", "docs.google.com", "github.com", "stackoverflow.com"]
    suggested.extend(defaults)

    recommended_sites: list[str] = []
    for site in suggested:
        normalized = normalize_domain(site)
        if normalized and normalized not in recommended_sites:
            recommended_sites.append(normalized)
        if len(recommended_sites) >= 6:
            break

    if not recommended_sites:
        recommended_sites = defaults[:]

    plan_sites = recommended_sites[: min(4, len(recommended_sites))]
    per_site = max(10, daily_goal_minutes // max(1, len(plan_sites)))
    remainder = max(0, daily_goal_minutes - per_site * len(plan_sites))

    time_plan = []
    for idx, site in enumerate(plan_sites):
        extra = 1 if idx < remainder else 0
        minutes = per_site + extra
        time_plan.append(
            {
                "site": site,
                "minutes": minutes,
                "reason": "Use this site during a dedicated focus block aligned with your goal.",
            }
        )

    suggested_quota_minutes = max(15, min(90, round(daily_goal_minutes / 4)))
    focus_plan = [
        "Start with your highest-effort task first before switching sites.",
        "Use 20-30 minute deep-focus blocks and take a short break between blocks.",
        "Review progress after each block and only keep sites that helped.",
    ]

    return {
        "recommended_sites": recommended_sites,
        "time_plan": time_plan,
        "focus_plan": focus_plan,
        "suggested_quota_minutes": suggested_quota_minutes,
        "source": "fallback",
    }


def call_groq(goal: str, current_work_sites: list[str], daily_goal_minutes: int) -> dict:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        load_env_file()
        api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is missing in backend/.env")

    prompt = f"""
You are an AI productivity coach for a focus browser extension.

Goal from user:
{goal}

Current work sites:
{", ".join(current_work_sites) if current_work_sites else "None configured"}

Daily goal minutes:
{daily_goal_minutes}

Respond ONLY valid JSON with this exact shape:
{{
  "recommended_sites": ["domain1.com", "domain2.com"],
  "time_plan": [
    {{"site": "domain.com", "minutes": 25, "reason": "short reason"}}
  ],
  "focus_plan": ["tip 1", "tip 2", "tip 3"],
  "suggested_quota_minutes": 30
}}

Rules:
- Recommend 3 to 8 realistic domains.
- Domains must be lowercase hostnames only (no protocol, no paths).
- Keep recommendations tightly relevant to the user goal. Avoid entertainment/distraction sites unless explicitly requested.
- time_plan minutes should sum close to daily goal minutes.
- suggested_quota_minutes should be between 15 and 90.
"""

    body = {
        "model": "llama-3.1-8b-instant",
        "temperature": 0.4,
        "messages": [{"role": "user", "content": prompt}],
    }
    req = request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=25) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Groq API error: {detail}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Groq request failed: {exc}") from exc

    data = json.loads(raw)
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not content:
        raise HTTPException(status_code=502, detail="Groq returned an empty response.")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Groq returned non-JSON content: {content}") from exc

    recommended_sites = []
    for site in parsed.get("recommended_sites", []):
        normalized = normalize_domain(str(site))
        if normalized and normalized not in recommended_sites:
            recommended_sites.append(normalized)

    time_plan = []
    for item in parsed.get("time_plan", []):
        site = normalize_domain(str(item.get("site", "")))
        minutes = int(item.get("minutes", 0))
        reason = str(item.get("reason", "")).strip()
        if site and minutes > 0:
            time_plan.append({"site": site, "minutes": minutes, "reason": reason})

    focus_plan = [str(item).strip() for item in parsed.get("focus_plan", []) if str(item).strip()]
    suggested_quota_minutes = int(parsed.get("suggested_quota_minutes", 30))
    suggested_quota_minutes = max(15, min(90, suggested_quota_minutes))

    recommended_sites = filter_relevant_sites(goal, current_work_sites, recommended_sites)

    if not recommended_sites:
        raise HTTPException(status_code=502, detail="Groq response did not include valid site recommendations.")

    allowed_set = set(recommended_sites)
    time_plan = [item for item in time_plan if item["site"] in allowed_set]

    return {
        "recommended_sites": recommended_sites,
        "time_plan": time_plan,
        "focus_plan": focus_plan,
        "suggested_quota_minutes": suggested_quota_minutes,
        "source": "ai",
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_env_file()
    init_db()
    yield


app = FastAPI(title="FocusUnlock API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/sessions")
def create_session(payload: SessionPayload) -> dict:
    row_id = insert_session(
        payload.user_id,
        payload.site,
        payload.duration_minutes,
        payload.timestamp,
    )
    return {"id": row_id, "ok": True}


@app.get("/sessions")
def get_sessions(
    user_id: str = Query(min_length=1, max_length=200),
) -> list[dict]:
    return list_sessions(user_id=user_id)


@app.post("/ai/assist")
def ai_assist(payload: AIAssistPayload) -> dict:
    normalized_sites = [normalize_domain(site) for site in payload.current_work_sites]
    try:
        return call_groq(
            goal=payload.goal,
            current_work_sites=normalized_sites,
            daily_goal_minutes=payload.daily_goal_minutes,
        )
    except HTTPException as exc:
        # If Groq is unavailable (e.g., network/access issues like 1010), return a smart local fallback.
        if exc.status_code >= 500:
            return build_fallback_plan(
                goal=payload.goal,
                current_work_sites=normalized_sites,
                daily_goal_minutes=payload.daily_goal_minutes,
            )
        raise
