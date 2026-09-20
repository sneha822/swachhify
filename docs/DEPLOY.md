# Deploying Swacchify

Your code is already on GitHub, so pick one of the routes below.

| Route | Good for | Cost | Effort |
|---|---|---|---|
| **A. Render blueprint** | A shareable demo link (college, judges, teammates) | Free tier works | ~15 min, all in the browser |
| **B. Railway** | Same, slightly quicker, no free Postgres expiry | ~$5/month credit | ~10 min |
| **C. Docker Compose on a VPS** | The real thing: background jobs, uploads that survive, a custom domain | ₹400–800/month | ~45 min, needs a server |

Everything works on all three. Only **C** runs the scheduled jobs (daily tips, pickup reminders, re-offering
stale pickups) and keeps uploaded photos permanently — see [What the free tiers can't do](#what-the-free-tiers-cant-do).

---

## A. Render (recommended for a demo)

The repo has a `render.yaml` blueprint that creates all three pieces: a Postgres database, the API (Docker), and
the website (static).

### 1. Create the services

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. **New → Blueprint**, choose the `swachhify` repo, and click **Apply**.
3. Render asks for the `sync: false` values. You don't know the URLs yet, so put placeholders in and fix them in
   step 3:
   - `CORS_ORIGINS` → `https://swacchify-web.onrender.com`
   - `FRONTEND_URL` → `https://swacchify-web.onrender.com`
   - `VITE_API_URL` → `https://swacchify-api.onrender.com/api/v1`
   - `ANTHROPIC_API_KEY` → your key, or leave blank
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` → leave blank while `SEED_DEMO_DATA` is `true`

   (Render usually keeps these exact names. If it adds a suffix, use the real URLs from your dashboard.)

### 2. Wait for the first build

The API takes a few minutes: it builds the image, runs `alembic upgrade head`, then seeds the knowledge base,
lessons and demo data. When `swacchify-api` is **Live**, check `https://<your-api>.onrender.com/healthz` — it
should print `{"status":"ok"}`.

### 3. Point the two services at each other

Copy the real URLs from your dashboard, then:

- On **swacchify-api** → Environment: set `CORS_ORIGINS` and `FRONTEND_URL` to your site URL
  (`https://…onrender.com`, no trailing slash). Save — it redeploys.
- On **swacchify-web** → Environment: set `VITE_API_URL` to your API URL **plus `/api/v1`**. Save, then
  **Manual Deploy → Clear build cache & deploy** (this value is baked in at build time).

### 4. Open it

Visit the website URL and sign in with `priya@swacchify.demo` / `Swacchify@123`.

> **First load after idling is slow.** Render's free services sleep after ~15 minutes; the next visit takes
> 30–60 seconds to wake. Before a demo, open the link once to warm it up.

### Free Postgres expires after 30 days

Render's free database is deleted after a month. Either upgrade it, or use a permanently free Postgres from
[Neon](https://neon.tech): create a database there, copy its connection string into the API's `DATABASE_URL`, and
remove the `databases:` block from `render.yaml`. The app rewrites `postgres://` URLs to the driver it needs, so
paste the string as-is.

---

## B. Railway

1. Sign up at [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Add a **Postgres** database to the project (New → Database → Postgres).
3. On the service built from `backend/`, set variables:
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SECRET_KEY=<long random string>`, `ENV=production`,
   `DEBUG=false`, `AUTO_CREATE_TABLES=false`, `SEED_DEMO_DATA=true`, plus `CORS_ORIGINS` and `FRONTEND_URL`
   once the site has a domain. Railway injects `PORT` itself.
4. Add a second service from the same repo with root directory `frontend/`, build `npm ci && npm run build`,
   publish `dist`, and `VITE_API_URL=https://<api-domain>/api/v1`.
5. Generate a domain for each service (Settings → Networking), then update the three URL variables.

---

## C. Docker Compose on a VPS

The only setup that runs the background worker, keeps uploads, and has no cold starts. Any Ubuntu server works
(DigitalOcean, Hetzner, AWS Lightsail, an Oracle free-tier VM).

```bash
# on the server, with Docker and the Compose plugin installed
git clone https://github.com/sneha822/swachhify.git && cd swachhify
cp backend/.env.example backend/.env          # edit: SECRET_KEY, ANTHROPIC_API_KEY, ADMIN_*
export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
docker compose up -d --build
```

That starts PostgreSQL, Redis, the API, the Celery worker and beat, and Nginx serving the site on port 8080.
Nginx proxies `/api` and `/media`, so no CORS setup and no `VITE_API_URL` needed.

Then put a real domain and HTTPS in front of it — [Caddy](https://caddyserver.com/) is the shortest path:

```caddy
swacchify.example.com {
    reverse_proxy localhost:8080
}
```

HTTPS matters beyond the padlock: **"Use my location" and voice input only work on a secure origin**, so on
plain HTTP those features silently do nothing on phones.

---

## Before you call it live

- [ ] **`SECRET_KEY`** is a long random value, not the development default. Changing it signs everyone out.
- [ ] **`SEED_DEMO_DATA=false`** for a real deployment, plus `ADMIN_EMAIL` / `ADMIN_PASSWORD` so you have an
      admin account. With demo data on, anyone who knows the demo password can sign in as an admin.
- [ ] **`DEBUG=false`** — otherwise password-reset links are returned in the API response.
- [ ] **`CORS_ORIGINS`** lists exactly your site's origin.
- [ ] **Real drop-off points and organisations** replace the fictional demo ones (admin → Knowledge base, and the
      `dropoff_points` table).
- [ ] **Email/SMS/WhatsApp providers** are wired in `backend/app/services/channels.py`; until then they only log.
- [ ] **Photo storage**: on Render and Railway the disk is wiped on every deploy, so collection photos disappear.
      Set `STORAGE_BACKEND=s3` with `S3_BUCKET`, `S3_REGION` and `S3_PUBLIC_BASE_URL`, and add `boto3` to
      `backend/requirements.txt`.
- [ ] **Review the CO₂ figures** in [IMPACT_METHODOLOGY.md](IMPACT_METHODOLOGY.md) before publishing them.

## What the free tiers can't do

| | Render / Railway free | VPS (Compose) |
|---|---|---|
| Daily tips, pickup reminders, re-offering stale pickups | ✗ (no Redis/worker) | ✓ |
| Uploaded photos survive a redeploy | ✗ (unless S3) | ✓ |
| Instant first load | ✗ (sleeps when idle) | ✓ |
| Live updates across several server instances | single instance only | ✓ (Redis) |

Scheduled jobs on Render can be approximated with a **Cron Job** service that calls
`POST /api/v1/admin/jobs/daily-tips` with an admin token.

## If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| Site loads, every request fails | `VITE_API_URL` wrong or missing | Set it (with `/api/v1`), then redeploy with cache cleared |
| "Failed to fetch" / CORS error in the console | `CORS_ORIGINS` doesn't match | Use the exact origin, no trailing slash |
| API won't boot, logs mention `SECRET_KEY` | Still the development default with `ENV=production` | Set a real `SECRET_KEY` |
| API boots but every page is empty | Migrations ran on an empty DB and seeding is off | Set `SEED_DEMO_DATA=true`, or create your admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| Login works, live updates don't | WebSockets blocked by a proxy | Expected on some hosts; the app falls back to polling |
