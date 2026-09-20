# Swacchify

**Know Your Waste. Do the Right Thing.** · *Segregate. Learn. Collect. Recycle. Repeat.*

Swacchify is a household waste-management platform for Indian homes. Anyone can ask "I have this item — what
should I do with it?" and get a simple, verified answer, then learn, schedule a doorstep pickup of dry waste,
earn points on the **verified** weight, and follow where their material went.

| Role | What they get |
|---|---|
| **Household** | Swacchify AI (text or voice, English and Hindi) · waste guide · 1-minute lessons with quizzes · daily tip and challenge · streaks and goals · pickup scheduling with live partner distance and ETA · rewards and badges · household dashboard · impact tracking · drop-off map |
| **Collection partner** | Nearby and assigned pickups · accept or decline · navigation · live location sharing · record weights · proof photo · earnings (Hindi-first UI) |
| **Recycling partner** | Verified hub inventory · material requests · dispatch tracking · GST invoices |
| **Admin** | KPIs and trends · warehouse verification queue · partner and recycler approvals · AI question analytics · knowledge-base editor · lesson editor · order allocation · payouts · audit log |

## Quick start (no Docker needed)

> **New here? Follow [SETUP.md](SETUP.md)**: step-by-step instructions, one-command Windows scripts
> (`setup.ps1`, `start.ps1`), a demo tour and troubleshooting.

Requires Python 3.11+ (3.12 recommended) and Node 22+.

```bash
# Backend: http://localhost:8000 (API docs at /docs)
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend: http://localhost:5173 (proxies /api and /media to :8000)
cd frontend
npm install
npm run dev
```

On first start, the backend creates a SQLite database and seeds it with the knowledge base, lessons and a
**realistic demo**: about 30 pickups replayed through the real lifecycle over the last 5 months, plus a
recycler order that closes the traceability loop.

**Demo accounts** (password `Swacchify@123`; one-tap buttons on the sign-in page in development):
`priya@swacchify.demo` (household) · `partner1@swacchify.demo` (collection partner) ·
`recycler@swacchify.demo` (recycler) · `admin@swacchify.demo` (admin).
Drop-off points and organisations in the demo data are fictional placeholders.

### Turn on Claude for Swacchify AI

The assistant works **without** an API key: it answers from the curated knowledge base. With credentials it uses
Claude (`claude-opus-5`) to understand free-form questions, follow up on earlier turns and reply naturally in
Hindi, while staying grounded in the same knowledge base:

```bash
set ANTHROPIC_API_KEY=sk-ant-...   # macOS/Linux: export ANTHROPIC_API_KEY=...
```

`GET /api/v1/ai/status` reports which mode is active.

## Deploying

**[docs/DEPLOY.md](docs/DEPLOY.md)** covers three routes: a Render blueprint (`render.yaml` in this repo, free
tier, ~15 minutes), Railway, and Docker Compose on your own server — plus the go-live checklist and what the
free tiers can't do.

## Production (Docker)

```bash
cp backend/.env.example backend/.env   # set SECRET_KEY (and ANTHROPIC_API_KEY, ADMIN_EMAIL/PASSWORD)
SECRET_KEY=... docker compose up --build
# → http://localhost:8080
```

The Compose stack runs PostgreSQL 16, Redis 7, the API (runs `alembic upgrade head` on start), a Celery worker,
Celery beat (daily tips, pickup reminders, streak reminders, re-offering unanswered pickups), and Nginx serving the
built React app. Nginx also proxies `/api` (including WebSockets) and `/media`. Set `SEED_DEMO_DATA=false` for a
real deployment.

## Tests and CI

```bash
cd backend && pytest && ruff check app tests
cd frontend && npm run build          # tsc typecheck + Vite build
```

The 33 backend tests cover:
- auth, refresh-token rotation with reuse detection, and password reset
- role-based access (RBAC)
- the full pickup lifecycle with exact point maths
- the privacy rule
- declined-offer reassignment
- AI routing for every example question in the brief (English, Hindi, Hinglish, typos)
- the Claude route with a fake client (the knowledge base's category wins, invented items are dropped, failures fall back)
- quizzes, recycler traceability and admin dashboards

GitHub Actions (`.github/workflows/ci.yml`) runs lint and tests on SQLite **and** PostgreSQL, checks that the
migrations match the models, builds the frontend, and builds both Docker images.

## Project layout

```
backend/
  app/api/v1/        REST routers (auth, users, households, waste, ai, learning, pickups, partners,
                     industries, rewards, impact, notifications, admin) + WebSocket at /api/v1/ws
  app/services/      business logic: ai_assistant, knowledge, pickups, industry, rewards, habits,
                     badges, impact, notifications, realtime, storage, channels
  app/models/        SQLAlchemy 2.0 models (≈35 tables)
  app/seed/          knowledge base, lessons, quizzes, tips, rewards, demo data
  app/worker.py      Celery tasks + beat schedule
  migrations/        Alembic
  tests/
frontend/src/
  pages/{public,customer,partner,recycler,admin,shared}/
  components/        design system (ui.tsx), chat, maps, lesson player, quiz, shell
  lib/               api client (auto token refresh), auth, i18n, realtime, speech
  i18n/              en.ts, hi.ts (type-checked: a missing Hindi key fails the build)
docs/                ARCHITECTURE.md, IMPACT_METHODOLOGY.md
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design decisions, including where this build
deliberately differs from the original brief.
