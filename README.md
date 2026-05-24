# AI Assessment Hub

Comprehensive full-stack assessment and proctoring platform with multi-tenant RBAC, AI-assisted content generation, real-time monitoring, and subscription-tier controls.

**Stack:** FastAPI + Socket.IO (Python) · React + Vite (JavaScript) · MySQL-compatible DB · Groq LLM

---

## About the Project

AI Assessment Hub is a multi-module online assessment platform for organizations.

It supports:
- Role-based workspaces (`admin`, `organization_admin`, `org_user`, learner flows)
- Multiple assessment types (Global Tests, Aptitude, Skill, Communication)
- Exam allocation and permission-based access control
- Proctoring features (tab switch tracking, camera checks, monitoring dashboards)
- AI-assisted features (question/content generation, analysis workflows)
- Multi-tenant architecture with one platform DB plus tenant DB per organization

Core folders:
- `client/` - React + Vite frontend SPA
- `backend/` - FastAPI + Socket.IO API and services

---

## How to Setup (Local)

### 1) Prerequisites

- Python `3.11+`
- Node.js `18+` and npm
- MySQL-compatible database (TiDB / MySQL / PlanetScale, etc.)

### 2) Backend Setup

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:
```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Create `backend/.env` and set at least:
```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DB_NAME
SECRET_KEY=replace_with_long_random_value
PRESCAN_SECRET_KEY=replace_with_long_random_value
GROQ_API_KEY=your_groq_key
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

Run backend:
```bash
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

Backend docs:
- Swagger UI: `http://localhost:8000/docs`

### 3) Frontend Setup

```bash
cd client
npm install
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

Run frontend:
```bash
npm run dev
```

Frontend runs at:
- `http://localhost:5173`

### 4) First Login Notes

- On first startup, backend initializes core tables automatically.
- Seeded super admin users depend on `SUPER_ADMIN_*` env vars.
- Organization users and roles are managed from Admin/RBAC screens after login.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Environment Variables Reference](#5-environment-variables-reference)
3. [Database Setup (TiDB Cloud / PlanetScale / RDS)](#6-database-setup)
4. [Google OAuth Setup](#7-google-oauth-setup)
5. [Local Development](#8-local-development)
6. [Architecture Deep Dive](#10-architecture-deep-dive)
7. [API Reference](#11-api-reference)
8. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture

```
+-------------------------+    HTTP + Socket.IO    +-------------------------------+
|  React + Vite SPA       | <------------------->  |  FastAPI + Socket.IO backend  |
|  client/                |                        |  backend/main.py              |
|  /admin  /role /student |                        |  Port 8000                    |
+-------------------------+                        +-------------------------------+
           |                                                       |
           | TensorFlow.js (camera/proctoring)                     | aiomysql
           v                                                       v
+-------------------------+                        +-------------------------------+
|  Groq API (LLM)         |                        |  MySQL-compatible DB          |
|  Content gen, hints,    |                        |  - Platform DB (users, orgs)  |
|  chat, AI interview     |                        |  - Tenant DB per organization |
+-------------------------+                        +-------------------------------+
```

**Key design points:**
- Backend is a single ASGI process — FastAPI wrapped by Socket.IO (`socket_app`)
- Frontend is a pure SPA — build output (`client/dist`) served as static files
- Multi-tenant: one platform DB + one MySQL DB schema per organization
- Groq key rotation: up to 16 keys cycled automatically (`GROQ_API_KEY` + `GROQ_API_KEY_1..15`)
- JWT-authenticated REST + Socket.IO with org-scoped rooms

---

## 5. Environment Variables Reference

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in all values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | `mysql://USER:PASSWORD@HOST:PORT/DB_NAME` |
| `SECRET_KEY` | **Yes** | JWT signing key — generate with `openssl rand -hex 32` |
| `PRESCAN_SECRET_KEY` | **Yes** | Prescan session signing key — generate separately |
| `GROQ_API_KEY` | **Yes** | Primary Groq API key from [console.groq.com](https://console.groq.com) |
| `GROQ_API_KEY_1` ... `GROQ_API_KEY_15` | No | Additional Groq keys for rotation (recommended in prod) |
| `GROQ_MODEL` | No | Default: `meta-llama/llama-4-scout-17b-16e-instruct` |
| `GROQ_FALLBACK_MODELS` | No | Comma-separated fallback model IDs |
| `PORT` | No | Default: `8000`. Render/Railway set this automatically |
| `ALLOWED_ORIGINS` | **Yes** | Comma-separated frontend origins, e.g. `https://app.example.com` |
| `FRONTEND_URL` | **Yes** | Public HTTPS URL of the frontend (used for prescan mobile QR links) |
| `GOOGLE_OAUTH_CLIENT_ID` | No | Google Web Client ID (leave empty to disable Google Sign-In) |
| `OTP_EXPIRY_MINUTES` | No | Default: `10` |
| `OTP_MAX_FAILED_ATTEMPTS` | No | Default: `5` |
| `SMTP_HOST` | No | SMTP server hostname. If empty, OTPs are logged to console |
| `SMTP_PORT` | No | Default: `587` |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `SMTP_FROM` | No | Sender address, e.g. `noreply@example.com` |
| `SMTP_USE_TLS` | No | Default: `true` |
| `SUPER_ADMIN_SEED_ENABLED` | No | `true` to auto-create super admins on boot |
| `SUPER_ADMIN_ROTATE_PASSWORDS_ON_STARTUP` | No | `true` to reset passwords every restart |
| `SUPER_ADMIN_1_ID` | No | Super admin 1 username/ID |
| `SUPER_ADMIN_1_NAME` | No | Super admin 1 display name |
| `SUPER_ADMIN_1_EMAIL` | No | Super admin 1 email |
| `SUPER_ADMIN_1_PASSWORD` | No | Super admin 1 password |
| `SUPER_ADMIN_2_*` | No | Same fields for super admin 2 |
| `STARTUP_DB_PREFLIGHT` | No | Default: `true`. Set `false` to skip schema checks on boot |
| `STARTUP_DB_PREFLIGHT_TENANTS` | No | Default: `false` |
| `STARTUP_TENANT_SCHEMA_RECONCILE` | No | Default: `true` |

### Frontend (`client/.env`)

Copy `client/.env.example` to `client/.env`. These are baked into the build.

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | **Yes** | Backend origin, e.g. `https://YOUR-BACKEND.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | No | Same value as `GOOGLE_OAUTH_CLIENT_ID` in backend |
| `VITE_PUBLIC_APP_URL` | No | Public HTTPS frontend URL (needed for ngrok tunnels) |
| `VITE_STRICT_CROSS_ORIGIN_ISOLATION` | No | Default: `false`. Do not enable — it breaks Google Sign-In |

---

## 6. Database Setup

The backend creates all tables automatically on first startup. You only need to provide a working `DATABASE_URL`.

### TiDB Cloud (Free — currently used)

1. Sign up at [tidbcloud.com](https://tidbcloud.com)
2. Create a **Serverless** cluster
3. Go to **Connect** → copy the connection string
4. Use it as `DATABASE_URL=mysql://user:password@gateway.tidbcloud.com:4000/your_db`

### PlanetScale

1. Create a database at [planetscale.com](https://planetscale.com)
2. Create a branch (use `main`)
3. Go to **Connect** → **Connect with** → **General** → copy the URL
4. PlanetScale uses `pscale://` — use the MySQL-compatible URL format shown

### AWS RDS / GCP Cloud SQL

Standard MySQL 8.x. Ensure the DB server is accessible from your backend host (VPC peering or public endpoint with firewall rules).

---

## 7. Google OAuth Setup

Skip this section if you do not need Google Sign-In.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Create an **OAuth 2.0 Client ID** → **Web application**
3. Add **Authorized JavaScript origins**:
   - `https://YOUR-FRONTEND.onrender.com`
   - `http://localhost:5173` (for local dev)
4. Add **Authorized redirect URIs**:
   - `https://YOUR-FRONTEND.onrender.com`
   - `http://localhost:5173`
5. Copy the **Client ID** → set as `GOOGLE_OAUTH_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend)

---

## 8. Local Development

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL, SECRET_KEY, GROQ_API_KEY
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

Backend is now at `http://localhost:8000`. Health check: `http://localhost:8000/api/health`

### Frontend

```bash
cd client
npm install
cp .env.example .env   # set VITE_API_URL=http://localhost:8000
npm run dev
```

Frontend is now at `http://localhost:5173`. The Vite dev server proxies `/api` and `/socket.io` to port 8000.

### HTTPS tunnel for prescan / Google OAuth on mobile

```bash
# Start ngrok (or any tunnel)
ngrok http 5173

# Then update both .env files:
# backend/.env
FRONTEND_URL=https://YOUR-SUBDOMAIN.ngrok-free.app
ALLOWED_ORIGINS=https://YOUR-SUBDOMAIN.ngrok-free.app

# client/.env
VITE_API_URL=http://localhost:8000
VITE_PUBLIC_APP_URL=https://YOUR-SUBDOMAIN.ngrok-free.app
```

Restart both servers after changing `.env` files.

### Run backend tests

```bash
cd backend
pytest -q
```

### DB preflight utility

```bash
cd backend
python scripts/db_preflight.py --db-url "mysql://user:password@host:port/database"
```

---

## 10. Architecture Deep Dive

### Runtime lifecycle (backend startup)

1. Configure structured logging
2. Initialize async MySQL connection pools
3. Create platform DB tables (users, orgs, RBAC, audit, etc.)
4. Reconcile active tenant DB schemas (if `STARTUP_TENANT_SCHEMA_RECONCILE=true`)
5. Run DB preflight checks (if `STARTUP_DB_PREFLIGHT=true`)
6. Seed super-admin accounts (if `SUPER_ADMIN_SEED_ENABLED=true`)
7. Mount all 22 API routers + `/uploads` static path
8. Start ASGI server as `socket_app`

### Request path

```
HTTP Request
    → CORS middleware
    → SecurityHeadersMiddleware
    → LoggingMiddleware (request ID, timing)
    → RateLimitMiddleware
    → JWT validation (extracts user_id, org_id → injected as x-user-id, x-org-id)
    → Tenant DB resolution (per org_id, validates org is active)
    → Route handler
```

### Multi-tenancy

- **Platform DB**: users, organizations, roles, permissions, audit logs
- **Tenant DB** (one per org): all assessment content, submissions, proctoring data
- Tenant DB URL is stored in the platform DB per organization
- Super admin sets up the tenant DB connection via `/api/orgs/{org_id}/tenant-db`

### Assessment types

| Type | Route prefix | Sections |
|---|---|---|
| Coding problems | `/api/problems`, `/api/submissions` | Code execution, hints |
| Skill tests | `/api/skill-tests` | MCQ, coding, SQL, interview |
| Aptitude tests | `/api/aptitude` | MCQ |
| Global tests | `/api/global-tests` | Multi-section MCQ |
| Communication | `/api/communication` | Modules A, B, C, D |

### AI integration (Groq)

- Provider: Groq Chat Completions API (`backend/services/ai_service.py`)
- Key rotation: cycles through `GROQ_API_KEY`, `GROQ_API_KEY_1` … `GROQ_API_KEY_15`
- Model fallback: if primary model unavailable, tries `GROQ_FALLBACK_MODELS` list
- Features: content generation, hints, chat, AI interview, behavior analysis reports

### Proctoring

- Client-side: TensorFlow.js + COCO-SSD object detection, camera monitoring
- Server-side: Socket.IO rooms scoped per org/mentor/student
- `useProctoring.js` emits violation events → backend routes to proctor dashboard
- Environment prescan: mobile QR handoff, frame-by-frame room scan validation

### Socket.IO events

Client → Server:
- `join_monitoring` — admin/mentor subscribes to live alerts
- `join_student_session` — student registers for session tracking
- `submission_started`, `submission_completed`, `proctoring_violation`, `progress_update`, `test_failed`

Server → Client:
- `monitoring_connected`, `live_update`, `live_alert`, `monitoring_error`
- Prescan: `prescan_status`, `prescan_result`, `prescan_frame_ack`

---

## 11. API Reference

| Module | Prefix | Key endpoints |
|---|---|---|
| Auth | `/api` | `/auth/login` `/auth/google` `/auth/verify-otp` `/auth/complete-first-login` `/auth/verify` |
| Health | `/api` | `/health` |
| Admin users | `/api/admin` | `/users` `/users/{id}` `/users/{id}/reset-password` `/users/{id}/status` |
| Organizations | `/api/platform` | `/organizations` `/organizations/{id}/status` |
| RBAC | `/api` | `/rbac/permissions` `/orgs/{id}/roles` `/orgs/{id}/users` `/orgs/{id}/tenant-db` |
| Analytics | `/api/analytics` | `/admin` `/mentor/{id}` `/student/{id}` `/export/json` `/export/csv` `/audit-logs` |
| Problems | `/api` | `/problems` `/submissions` `/run` `/hints` `/chat` |
| Skill tests | `/api/skill-tests` | `/create` `/all` `/student/available` `/{id}/start` `/report/{attempt_id}` |
| Aptitude | `/api` | `/aptitude` `/aptitude/{id}/submit` `/aptitude/{id}/allocate-students` |
| Global tests | `/api` | `/global-tests` `/global-tests/{id}/submit` `/global-test-submissions` |
| Communication | `/api/communication` | `/tests/create` `/tests/all` `/tests/{id}/start` `/tests/attempt/{id}/finish` |
| Proctor agent | `/api/proctor-agent` | `/dashboard` `/analyze` `/terminate` `/warn` `/clear-flag` |
| Behavior agent | `/api/behavior` | `/log-events` `/analyze` `/report` `/sessions` `/dashboard` |
| Prescan | `/api/prescan` | `/sessions` `/scans/{id}/frames` `/mobile/{token}` |
| AI | `/api/ai` | `/generate-problem` `/generate-aptitude` `/chat` |
| Attachments | `/api/attachments` | `/upload` |
| Public | `/api/public` | `/config` |

Full interactive docs available at `http://localhost:8000/docs` (Swagger UI) when running locally.

---

## 12. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `401 Missing bearer token` | Protected route called without auth header | Log in first; token sent automatically by frontend |
| `401 Invalid or expired token` | Token expired or wrong `SECRET_KEY` | Re-login; verify `SECRET_KEY` matches what issued the token |
| `403 Organization context mismatch` | Token org ≠ request org | Use the correct org account |
| `503 Tenant database is not configured` | Org tenant DB not set up | Super admin must configure tenant DB for that org |
| `500 Tenant database schema is incomplete` | Tenant DB exists but missing tables | Restart backend — reconciliation runs on startup |
| Backend crashes on boot | `DATABASE_URL` invalid or DB unreachable | Check DB URL, firewall rules, DB is running |
| Google Sign-In fails | Wrong `GOOGLE_OAUTH_CLIENT_ID` or origin not allowlisted | Check Google Cloud Console authorized origins |
| Prescan QR link doesn't work on mobile | `FRONTEND_URL` not set to public HTTPS URL | Set `FRONTEND_URL` to your HTTPS domain and restart backend |
| Groq errors in AI features | Invalid key, rate limited, or wrong model ID | Check key at console.groq.com; add more keys (`GROQ_API_KEY_1..15`) |
| Socket.IO not connecting | CORS mismatch or missing WebSocket support | Ensure `ALLOWED_ORIGINS` includes the frontend origin; nginx must proxy `/socket.io/` with upgrade headers |
| Render free plan sleeps | Free web services sleep after inactivity | Upgrade to Starter plan ($7/mo) or use UptimeRobot to ping `/api/health` every 5 min |

### Generating secure secrets

```bash
# On Linux/macOS
openssl rand -hex 32

# On Windows PowerShell
-join ((1..32) | ForEach-Object { '{0:X2}' -f (Get-Random -Max 256) })
```

---

## Security checklist before going live

- [ ] `SECRET_KEY` and `PRESCAN_SECRET_KEY` are unique random values (not the example defaults)
- [ ] `ALLOWED_ORIGINS` lists only your production frontend URL (not `*`)
- [ ] Super admin passwords changed from defaults
- [ ] `DATABASE_URL` credentials are production-specific (not dev credentials)
- [ ] HTTPS enforced on both frontend and backend domains
- [ ] Google OAuth origins restricted to production domains only
- [ ] `.env` files not committed to git (verify with `git status`)

---

Last updated: May 23, 2026.

