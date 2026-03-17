# AGENTS.md

## Cursor Cloud specific instructions

### Overview

A real-time video-call platform with AI-powered hints for conducting structured conversations. Two services:

- **Backend** (`app/backend/`): Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL, Redis, LiveKit
- **Frontend** (`app/frontend/`): Next.js 14, React 18, TypeScript, Tailwind CSS, LiveKit Components

### Infrastructure (Docker Compose)

Infrastructure services are defined in `app/docker-compose.yml`. Start only the infrastructure (not the app services):

```bash
cd /workspace/app && sudo docker compose up -d db redis livekit
```

This starts PostgreSQL 16 (port 5432), Redis 7 (port 6379), and LiveKit server (port 7880).

### Environment Variables

See `app/.env.example` for the full list. **Pre-set shell environment variables override `.env` file values** (pydantic-settings behavior). When starting backend services, you must explicitly pass correct env vars to match the Docker Compose infrastructure credentials (`postgres:postgres`).

Retrieve the database name dynamically:

```bash
DBNAME=$(sudo docker exec app-db-1 psql -U postgres -t -c "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1');" | tr -d ' \n')
```

For external API credentials (`SALUTE_SPEECH_CREDENTIALS`, `GIGACHAT_CREDENTIALS`), use dummy values for local dev — the app will start but STT and AI hints won't work without real credentials.

### Running the Backend

Set explicit env vars matching Docker Compose defaults (see `app/docker-compose.yml` for reference values), then run:

```bash
cd /workspace/app/backend && source venv/bin/activate && \
  DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/$DBNAME" \
  SALUTE_SPEECH_CREDENTIALS=dummy \
  GIGACHAT_CREDENTIALS=dummy \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

All other env vars (`REDIS_URL`, `LIVEKIT_*`, `CORS_ORIGINS`) have sensible defaults in `app/backend/app/config.py`.

Verify: `curl localhost:8000/health` should return `{"status":"ok"}`.

### Running the Frontend

Pass `NEXT_PUBLIC_*` env vars matching `app/.env.example`, then run:

```bash
cd /workspace/app/frontend && npm run dev
```

Frontend runs on port 3000. ESLint config (`.eslintrc.json`) uses `next/core-web-vitals`.

### Lint & Type Check

- **Frontend lint**: `cd app/frontend && npm run lint`
- **Frontend types**: `cd app/frontend && npx tsc --noEmit`
- No backend linter is configured.

### Key Gotchas

1. **Shell env vars override `.env` file**: The VM may have pre-set `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD` env vars that differ from Docker Compose defaults. Always pass explicit env vars when starting the backend.
2. **Docker required**: PostgreSQL, Redis, and LiveKit all run via Docker. Ensure Docker daemon is running (`sudo dockerd` if needed).
3. **No Alembic migrations**: The backend auto-creates tables on startup via `create_tables()` in the lifespan handler. No need to run `alembic upgrade head`.
4. **LiveKit config**: The `app/livekit.yaml` is for production. Docker Compose passes LiveKit keys directly via environment (see `app/docker-compose.yml`).
5. **External APIs are optional**: SaluteSpeech (STT) and GigaChat (AI hints) require real credentials. The app runs without them — only those features will fail.
