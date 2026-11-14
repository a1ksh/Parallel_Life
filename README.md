# Parallel Life

An interactive fictional life simulator for adults. Start with a fictional avatar or make your own. Each of the three stories offers three initial paths, five playable scenes after the opening decision, interactive NPCs, and two authored endings per path. Choices change bounded world values and NPC trust. Trust can unlock an additional decision. The fifth scene adds a choice-specific epilogue to the ending.

The Life Map shows named decision checkpoints and restores them into independent timelines. Compare endings and earlier decisions, save a Decision Passport with reflection questions, and track an optional Reality Bridge experiment. My Universes lists and deletes saved games. Guest games are tied to a random token stored in the browser. Timelines completed before the fifth scene was added keep their saved ending.

## Personal decisions and the return visit

Quick Start supplies a fictional dilemma. A custom avatar can bring a personal dilemma, a practical constraint and two or three values. Complete two timelines and open Compare to find their first differing choice. In Life Map or Compare, open the other-self conversation and select a recorded decision. Each timeline keeps its own dialogue. With live AI disabled, the game answers using its journal.

Decision Lab connects the chosen values to recorded choices and their fictional world scores. Save a Decision Passport, then set up an optional experiment in Reality Bridge. Choose one action, a check-in date and a sign you can observe. On your return, record the outcome, what surprised you and whether your priorities changed. The Decision Pass survey records interest in a proposed US$5.99 offer.

The [three-minute demo and pilot guide in Russian](DEMO-PILOT-RU.md) includes facilitator prompts and blank measurement fields for ten interviews and fifteen playtests.

## Run locally

Use Python 3.11+ and Node.js 24. From the repository root, build the frontend and install the backend dependencies in a virtual environment.

```sh
npm ci --prefix frontend
npm run build --prefix frontend
python -m venv .venv
```

Activate the environment with `source .venv/bin/activate` on macOS/Linux or `.venv\Scripts\Activate.ps1` in PowerShell.

```sh
python -m pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://localhost:8000/` for the unified game (English by default, then the saved preference). Direct links are `/en`, `/kk`, and `/ru`. The language switcher keeps the current view and active timeline mounted. Use the same hostname and port to resume an earlier browser save. FastAPI serves the game and REST API from the same origin. API documentation is at `/docs`. The tables are created at startup. SQLite is the local default.

Copy `.env.example` to `.env` in the repository root to override settings. Supply `OPENAI_API_KEY` on the server and restart to enable live NPC conversations and optional scene personalization in all three locales. Without a key or when the provider fails, all three locales use authored scenes and label scripted NPC replies. Previous messages stay in their original language. When a generated scene has no rendition in the new locale, the game shows the localized authored beat and offers to translate the existing AI prose if the provider is enabled. Translation is cached per scene and locale; it never changes choices or outcomes.

AI settings (server only):

- `OPENAI_API_KEY`: required for live generation. In Sites, configure it as a **runtime secret**. Never put it in frontend settings, source control, or browser storage.
- `OPENAI_MODEL`: optional Responses API model with Structured Outputs support; defaults to `gpt-5.4-mini`.
- `PARALLEL_LIFE_AI_ENABLED=0`: optional kill switch that keeps scripted play available even with a key configured.

Provider calls time out after 8.5 seconds, with output limits of 420 tokens for chat and 650 for scene personalization. Chat and scene requests share database-backed budgets: 6 per guest per minute, 30 globally per minute, and 500 globally per UTC day. Quota and provider failures fall back to scripted play. These are request limits, not a billing cap. The hosted migration adds only a quota table; existing story data stays in place. Server usage logs contain request type, status, time and token counts when available, without prompts, replies, guest tokens or keys. NPC context includes the last three exchanges and up to four relevant excerpts from older player messages in the current timeline. Checkpoints inherit only what was known at the fork point. Generated scenes add prose, a reaction and an optional side vignette; authored choices, effects and endings remain authoritative.

## Saves and localization

The modern game uses the same guest token, database records, scenario and path IDs, choice indices, and ending indices in every locale. Translation is a display step; do not edit canonical English text without updating the matching keys in `backend/app/scenarios/kk.json` and `ru.json`. UI messages live in `frontend/messages/ui.json`. Player text is kept verbatim. Previously saved AI prose and chat messages without language metadata are treated as English.

`/legacy/` remains a separate archive linked to the new `/kk` game. It continues to read and write its original `parallel-life-v1` browser save. Its scenarios `career`, `study`, and `relationship` have legacy-only paths (`launch/pilot/stay`, `abroad/local`, and `together/apart`) and a two-decision story. Canonical IDs are `career`, `education`, and `relationships`, with three paths and five decision scenes per path. Even overlapping names such as `abroad` and `local` represent different decisions. No verified mapping exists from the 14 legacy endings to the 18 canonical endings, so no automatic migration is performed.

## Deploy

- **FastAPI and Supabase**. Deploy the repository Dockerfile with your Python-compatible host or use the Render Blueprint in `render.yaml`. The Render Blueprint provisions a free Postgres database and connects it to the web service. During setup, supply GEMINI_API_KEY as a Render secret for Gemini conversations. For a separate Supabase deployment, set DATABASE_URL to its session pooler URI with TLS enabled. Set the optional OpenAI variables in the service’s environment. The Docker image builds Next.js and serves it through FastAPI. `/api/status` reports API availability.
- **Existing ChatGPT Sites URL**. The Sites deployment serves the same exported frontend from a Cloudflare Worker, with the equivalent REST API in `server/sites-api.js` and D1 persistence. The Site applies SQL under `drizzle/`. From the root, `npm run build` creates the Worker package input. Add optional OpenAI variables in Sites runtime settings. The previous Kazakh edition and its browser saves remain accessible at `/legacy/`.

## Code

- `frontend/` contains the Next.js and TypeScript app, Tailwind, shadcn-style buttons, Zustand, Motion, React Flow and Lucide.
- `backend/app/scenarios/` contains the shared authored stories, NPC profiles and branch effects.
- `backend/app/game_engine/` owns bounded state transitions and checkpoint snapshots.
- `backend/app/models/` contains Pydantic gameplay schemas and SQLAlchemy storage. Session updates use a revision counter to prevent overwriting concurrent changes.
- `backend/app/api/` exposes the REST routes for profiles, sessions, choices, timelines, conversations, reflections and experiments.
- `backend/app/services/` validates structured model output and keeps NPC context limited to the current timeline.

Run `python -m pytest -q` from `backend/` for the FastAPI and SQLite suite. It checks all endings, persistence across app restarts, branch and memory isolation, access control, reflection, experiment progress and deletion. Build and run `npm run test:sites` with Node.js 24 to verify the hosted adapter against a local SQLite implementation of D1’s query interface.

## Demo walkthrough

1. Start your journey, choose Quick Start, and open Career & Business.
2. Choose Build Your Own Business. Ask Emma about her goal, select a paid pilot, and finish the remaining decisions.
3. Open Life Map. Fork the first saved decision or start Change Your Career. Finish the new timeline.
4. Compare the two lives, open Decision Lab, choose a priority, and save a Decision Passport.
5. Check a Reality Bridge step. Refresh, reopen Reality Bridge, and confirm the step stays checked.
