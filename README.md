# Parallel Life

An interactive fictional life simulator for adults. Start with a fictional avatar or make your own. Each of the three stories offers three initial paths, an opening decision and four playable chapters per path, interactive NPCs, and two authored endings per path. Choices change bounded world values and NPC trust. Trust can unlock an additional decision.

The Life Map restores saved checkpoints into independent timelines. Compare endings and earlier decisions, save a Decision Passport, and track an optional Reality Bridge experiment. My Universes lists and deletes saved games. Guest games are tied to a random token stored in the browser.

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

Open `http://localhost:8000`. FastAPI serves the exported Next.js frontend and the REST API from the same origin. API documentation is at `/docs`. The tables are created at startup. SQLite is the local default.

Copy `.env.example` to `.env` in the repository root to override settings. Supply `OPENAI_API_KEY` on the server and restart to enable live NPC conversations and optional scene personalization. `OPENAI_MODEL` selects the model. Without a key or when the provider fails, the game uses authored scenes and explicitly labels scripted NPC replies.

## Deploy

- **FastAPI and Supabase**. Deploy the repository Dockerfile with your Python-compatible host or use the Render Blueprint in `render.yaml`. Set `DATABASE_URL` to the Supabase session pooler URI with TLS enabled. Set the optional OpenAI variables in the service’s environment. The Docker image builds Next.js and serves it through FastAPI. `/api/status` reports API availability.
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
