# How to run Swacchify

This guide gets Swacchify running on your computer in about 10 minutes, and has a demo you can click through
straight away.

- [1. Install the two prerequisites](#1-install-the-two-prerequisites)
- [2. Quick start on Windows (recommended)](#2-quick-start-on-windows-recommended)
- [3. Manual start (Windows, macOS, Linux)](#3-manual-start-windows-macos-linux)
- [4. Sign in and try it](#4-sign-in-and-try-it)
- [5. Turn on Claude for Swacchify AI (optional)](#5-turn-on-claude-for-swacchify-ai-optional)
- [6. Everyday tasks](#6-everyday-tasks)
- [7. Run with Docker (production-like)](#7-run-with-docker-production-like)
- [8. Troubleshooting](#8-troubleshooting)

---

## 1. Install the two prerequisites

| Tool | Version | Download | Check it works |
|---|---|---|---|
| **Python** | 3.11 or newer (3.12 recommended) | https://www.python.org/downloads/ | `python --version` |
| **Node.js** | 22 LTS | https://nodejs.org/ | `node --version` |

> **Windows:** on the first screen of the Python installer, tick **"Add python.exe to PATH"**.
> After installing either tool, close and reopen your terminal so it can find the new commands.

You don't need PostgreSQL, Redis or Docker for local use. The app uses a built-in SQLite database, and everything
else has a fallback. You do need an internet connection for the first install and for the map tiles.

---

## 2. Quick start on Windows (recommended)

Open **PowerShell** in the project folder (the one containing `setup.ps1`). In File Explorer you can type
`powershell` in the address bar and press Enter.

**Step 1: install everything (one time only, about 2–5 minutes).**

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

This creates a Python environment in `backend\.venv`, installs the backend and frontend packages, and creates
the settings file `backend\.env`.

**Step 2: start the app (every time).**

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Two windows open ("Swacchify API" and "Swacchify Web"), and after a few seconds your browser opens
**http://localhost:5173**.

> The **very first** start takes 10–30 seconds longer because it builds the demo data. Leave both windows open
> while you use the app. To stop, close them (or press `Ctrl + C` in each).

---

## 3. Manual start (Windows, macOS, Linux)

Use two terminals, both starting in the project folder.

### Terminal 1: the API (backend)

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-dir app --port 8000
```

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --reload-dir app --port 8000
```

When you see `Application startup complete`, the API is ready. Its interactive documentation is at
http://localhost:8000/docs.

### Terminal 2: the website (frontend)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

> Next time, skip the install lines: only the last command in each terminal is needed.

---

## 4. Sign in and try it

On the sign-in page, the **"Try a demo account"** box has one-tap buttons. You can also type the details:

| Role | Email | Password |
|---|---|---|
| 🏡 Household | `priya@swacchify.demo` | `Swacchify@123` |
| 🚚 Collection partner | `partner1@swacchify.demo` | `Swacchify@123` |
| 🏭 Recycling partner | `recycler@swacchify.demo` | `Swacchify@123` |
| 🛠️ Admin | `admin@swacchify.demo` | `Swacchify@123` |

More demo accounts: `rahul@`, `asha@`, `imran@`, `meera@` and `deepak@swacchify.demo` (households),
`partner2@` and `partner3@swacchify.demo` (partners), and `ewaste.recycler@swacchify.demo`. Accounts waiting for
approval: `partner.pending@` and `recycler.pending@swacchify.demo`.

**A 5-minute tour**

1. **As the household (Priya):** tap **Ask Swacchify AI** and try "old robot toy", "toy", "milk packet",
   "thermocol", or a Hindi question like "बैटरी कहाँ डालें". Switch to **हि** at the top for Hindi. Then:
   - schedule a pickup (Pickup → Schedule pickup)
   - watch a lesson and take its quiz (Learn)
   - look at Rewards, My Impact and Household
2. **As the admin:** open **Pickups & verification** and verify the pickup waiting in the queue. The customer's
   points are credited at that moment. Also see Overview (charts), AI insights and Recycler orders.
3. **As the collection partner:** see assigned pickups, accept one, then step it through
   *Start trip → I've arrived → Mark collected*.
4. **As the recycler:** request material, and open an invoice (Invoices).

> Tip: you can use different browsers (or a private window) to stay signed in as two roles at once, for example
> the household in one and the partner in the other.

---

## 5. Turn on Claude for Swacchify AI (optional)

Swacchify AI already works without any key: it answers from its built-in, verified waste guide. Adding a Claude
key lets it understand free-form questions, follow the conversation and write natural Hindi. It still only states
rules from the verified guide.

1. Get an API key at https://console.anthropic.com.
2. Open `backend\.env` in a text editor, find the line `# ANTHROPIC_API_KEY=sk-ant-...`, remove the `#` and paste
   your key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
3. Restart the API (close the "Swacchify API" window and run `start.ps1` again).
4. Check it's on: http://localhost:8000/api/v1/ai/status should show `"mode": "claude+knowledge_base"`.

Answers then show "AI answer based on Swacchify's verified guide". If the key is wrong or the service is
unreachable, the assistant quietly falls back to the guide.

---

## 6. Everyday tasks

| I want to… | Do this |
|---|---|
| **Start fresh demo data** | Stop the API, delete `backend\swacchify.db` (and any `swacchify.db-wal` / `-shm` files next to it), then start again. |
| **Use a real, empty database** | In `backend\.env` set `SEED_DEMO_DATA=false`, plus `ADMIN_EMAIL=` and `ADMIN_PASSWORD=` for your first admin, then start fresh as above. |
| **Open the app on my phone** | Put the phone on the same Wi-Fi, run `npm run dev -- --host` in `frontend`, and open the "Network" address it prints. Location and microphone features need HTTPS on phones, so use Docker behind HTTPS for those. |
| **Run the tests** | `cd backend` then `.\.venv\Scripts\python.exe -m pytest` (33 tests) |
| **Check the frontend builds** | `cd frontend` then `npm run build` |
| **See all API endpoints** | http://localhost:8000/docs |

Common settings in `backend\.env` (every line is optional):

| Setting | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on Claude for Swacchify AI |
| `SEED_DEMO_DATA` | `true` loads the demo households, partners and history |
| `DEFAULT_CITY`, `DEFAULT_LAT`, `DEFAULT_LNG` | Where maps centre (default: Jaipur) |
| `SLOT_CAPACITY` | Maximum pickups per time slot |
| `DATABASE_URL` | Switch to PostgreSQL, e.g. `postgresql+psycopg://user:pass@localhost:5432/swacchify` |
| `REDIS_URL` | Enables Redis for live updates across servers and real background workers |

---

## 7. Run with Docker (production-like)

This runs PostgreSQL, Redis, the API, the background workers and the website together behind Nginx. Install
[Docker Desktop](https://www.docker.com/products/docker-desktop/) first.

```powershell
copy backend\.env.example backend\.env      # then edit it: set a long random SECRET_KEY
$env:SECRET_KEY = "paste-a-long-random-string-here"
docker compose up --build
```

Open **http://localhost:8080**. Stop with `Ctrl + C`, or `docker compose down`. Add `-v` to also delete the
database.

To generate a secret key: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| **"running scripts is disabled on this system"** | Use the full command shown above: `powershell -ExecutionPolicy Bypass -File .\setup.ps1` |
| **`python` or `node` "is not recognized"** | Install it (section 1), tick "Add to PATH" for Python, then **reopen** PowerShell. On Windows you can also try `py` instead of `python`. |
| **Blank page or "Can't reach Swacchify" right after starting** | The API is still building the demo data on first start. Wait 30 seconds and refresh. |
| **"Port 8000 / 5173 is already in use"** | Swacchify (or another app) is already running. Close the old windows, or find the process with `netstat -ano \| findstr :8000` and end it in Task Manager. |
| **`pip install` fails** | Check your internet connection. On office networks you may need your proxy settings. Run `setup.ps1` again; it's safe to repeat. |
| **Map shows grey squares** | Map tiles come from OpenStreetMap and need internet. Everything else works offline. |
| **"Listen" (read-aloud) is silent in Hindi** | Your computer needs a Hindi voice. On Windows: Settings → Time & language → Speech → add Hindi. |
| **The microphone button doesn't appear** | Voice input needs Chrome or Edge. Firefox doesn't support it; you can still type. |
| **I changed `backend\.env` but nothing changed** | Settings are read at startup. Restart the API window. |
| **Something is badly broken** | Reset the demo data (section 6). If that doesn't help, delete `backend\.venv` and `frontend\node_modules` and run `setup.ps1` again. |
