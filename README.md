# FocusUnlock

FocusUnlock is a Chrome extension that helps you stay productive by only allowing your configured work sites until you earn enough focus time.  
It includes a fastAPI backend API for session storage

## What This Project Does

- Tracks focused time spent on allowed work sites
- Blocks non-work websites until your focus quota is met
- Stores per-user session data for analytics
- Allows users to get AI recommendations on sites to work on

## How To Use It

1. Open extension **Settings** and configure:
   - Work sites (one per line)
   - Focus quota minutes
   - Daily goal
2. Browse and work on your allowed sites.
3. Focus time accumulates automatically.
4. Once quota is reached, blocked sites unlock.
5. Use:
   - **AI Assistance** to generate which sites they should work on
   - **Stats** to review your focus analytics

## Feature I Am Most Proud Of

The **Stats page** is the feature I am most proud of.  
It provides rich analytics based on time spent on work sites, including:

- Website distribution
- Category distribution
- Daily trend visualization
- Hourly focus heatmap
- Weekday performance
- Session length distribution
- Insight cards (top website/category, average session, etc.)

## Run the Chrome Extension (Correct Setup)

### 1) Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root folder (`FocusUnlock`)
5. Pin **FocusUnlock** and open it from the extensions toolbar

### 2) Reload while developing

- After file changes, click **Reload** on the FocusUnlock card in `chrome://extensions`.
- Refresh tabs where you want content-script changes to apply.

## Backend Notes (Important)

This project is configured for local backend usage:

- `http://127.0.0.1:3000`

This is used by:

- Session logging
- Stats page data
- AI Assistance recommendations


## Secrets Handling

- Secrets are stored in `backend/.env` (example: `GROQ_API_KEY`).
- `.env` must **not** be committed to git.
- The backend loads secrets from `backend/.env` at startup.
- If a key is missing or provider is unavailable, AI falls back to a local smart plan.

## Running Backend Locally (Required for local mode)

From the repo root:

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn server:app --reload --host 127.0.0.1 --port 3000
```

If you want the AI Assistance via the Groq api then:
- create backend/.env
- GROQ_API_KEY=their_key_here

The extension will still work fine without the backend/.env and will resort
to the default suggestions instead of AI suggestions

Then load/reload the extension in `chrome://extensions`.

## Notes on Data Isolation

- Session data is scoped by a generated extension `user_id`.
- Analytics queries are filtered by that `user_id`, so each user sees only their own tracked sessions.
