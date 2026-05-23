# AI Assessment Hub

Comprehensive full-stack assessment and proctoring platform with multi-tenant RBAC, AI-assisted content generation, real-time monitoring, and subscription-tier controls.

**Stack:** FastAPI + Socket.IO (Python) · React + Vite (JavaScript) · MySQL-compatible DB · Groq LLM

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Deployment — Render.com (Recommended)](#2-deployment--rendercom-recommended)
3. [Deployment — Railway](#3-deployment--railway)
4. [Deployment — VPS / Self-Hosted](#4-deployment--vps--self-hosted)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Database Setup (TiDB Cloud / PlanetScale / RDS)](#6-database-setup)
7. [Google OAuth Setup](#7-google-oauth-setup)
8. [Local Development](#8-local-development)
9. [Post-Deployment Checklist](#9-post-deployment-checklist)
10. [Architecture Deep Dive](#10-architecture-deep-dive)
11. [API Reference](#11-api-reference)
12. [Troubleshooting](#12-troubleshooting)

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

## 2. Deployment — Render.com (Recommended)

Render supports both the FastAPI backend (as a Web Service) and the React frontend (as a Static Site) on a free/paid plan. The `client/render.yaml` SPA rewrite rule is already committed.

### Step 1 — Database

Provision a MySQL-compatible database **before** deploying the app. Options:

| Provider | Notes |
|---|---|
| [TiDB Cloud](https://tidbcloud.com) (free tier) | MySQL-compatible, serverless, already used in dev |
| [PlanetScale](https://planetscale.com) | Serverless MySQL, generous free tier |
| [Aiven for MySQL](https://aiven.io) | Free 1-node MySQL |
| AWS RDS / GCP Cloud SQL | Production-grade, requires paid plan |

Copy the connection string — you will need it as `DATABASE_URL`:

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
```

### Step 2 — Deploy the Backend (Web Service)

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repository
3. Set the following in Render's UI:

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Environment** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:socket_app --host 0.0.0.0 --port $PORT` |
| **Plan** | Starter ($7/mo) or free (limited) |

4. Add all [environment variables](#5-environment-variables-reference) under **Environment** → **Add Environment Variable**

   Minimum required:
   ```
   DATABASE_URL=mysql://...
   SECRET_KEY=<generate a 64-char random string>
   PRESCAN_SECRET_KEY=<generate a 64-char random string>
   GROQ_API_KEY=gsk_...
   ALLOWED_ORIGINS=https://YOUR-FRONTEND.onrender.com
   FRONTEND_URL=https://YOUR-FRONTEND.onrender.com
   PORT=10000
   ```

5. Deploy. On first boot the backend automatically:
   - Creates all platform DB tables
   - Reconciles tenant schemas
   - Seeds super-admin accounts (from `SUPER_ADMIN_*` env vars)

6. Note your backend URL: `https://YOUR-BACKEND.onrender.com`

### Step 3 — Deploy the Frontend (Static Site)

1. Go to Render → **New** → **Static Site**
2. Connect the same repository

| Setting | Value |
|---|---|
| **Root Directory** | `client` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

3. Add environment variables:

   ```
   VITE_API_URL=https://YOUR-BACKEND.onrender.com
   VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
   ```

4. Under **Redirects/Rewrites**, add a rewrite rule (the `render.yaml` in `client/` handles this automatically if you use Render Blueprints):

   | Source | Destination | Action |
   |---|---|---|
   | `/*` | `/index.html` | Rewrite |

5. Deploy. Note your frontend URL: `https://YOUR-FRONTEND.onrender.com`

### Step 4 — Update CORS

Go back to your **backend** service on Render → Environment:

```
ALLOWED_ORIGINS=https://YOUR-FRONTEND.onrender.com
FRONTEND_URL=https://YOUR-FRONTEND.onrender.com
```

Trigger a redeploy.

---

## 3. Deployment — Railway

### Backend

```toml
# railway.toml  (create in backend/)
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn main:socket_app --host 0.0.0.0 --port $PORT"
restartPolicyType = "on_failure"
```

Add environment variables in the Railway dashboard (see [Section 5](#5-environment-variables-reference)).

### Frontend

```toml
# railway.toml  (create in client/)
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npx serve dist -s -l $PORT"
```

Or deploy the frontend to Vercel / Netlify instead (easier, free):

**Vercel:**
```bash
cd client
npx vercel --prod
# Set VITE_API_URL and VITE_GOOGLE_CLIENT_ID in Vercel project settings
```

**Netlify:**
```bash
cd client
npx netlify deploy --build --prod --dir dist
```

Add a `client/_redirects` file (already present in `public/`):
```
/*  /index.html  200
```

---

## 4. Deployment — VPS / Self-Hosted

### Requirements
- Ubuntu 22.04 / Debian 12 (or equivalent)
- Python 3.11+
- Node.js 18+
- Nginx (reverse proxy)
- SSL certificate (Let's Encrypt via Certbot)

### Backend setup

```bash
# Clone repo and enter backend
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO/backend

# Create virtualenv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and edit .env
cp .env.example .env
nano .env   # fill in all required values

# Run (production — use a process manager like systemd or pm2)
uvicorn main:socket_app --host 127.0.0.1 --port 8000
```

**systemd service** (`/etc/systemd/system/assessment-backend.service`):
```ini
[Unit]
Description=Assessment Hub Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/YOUR_REPO/backend
EnvironmentFile=/home/ubuntu/YOUR_REPO/backend/.env
ExecStart=/home/ubuntu/YOUR_REPO/backend/.venv/bin/uvicorn main:socket_app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable assessment-backend
sudo systemctl start assessment-backend
```

### Frontend build

```bash
cd client
cp .env.example .env
# Set VITE_API_URL=https://your-domain.com
npm install
npm run build   # output: dist/
```

### Nginx config

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Serve React SPA
    root /home/ubuntu/YOUR_REPO/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API + Socket.IO to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Socket.IO long-polling and WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

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

## 9. Post-Deployment Checklist

After deploying, verify each item:

- [ ] `GET /api/health` returns `{"status": "ok"}`
- [ ] Login page loads at the frontend URL
- [ ] Email/password login works (check server logs if OTP is not emailed)
- [ ] Super admin can log in (seeded from `SUPER_ADMIN_*` env vars)
- [ ] Create an organization → set up tenant DB → status shows active
- [ ] Create an org admin user → log in as org admin → complete first login
- [ ] Create and allocate one assessment → student can attempt and submit
- [ ] Live monitoring socket connects (check browser console for WebSocket frames)
- [ ] Prescan flow works end-to-end on mobile (requires HTTPS + correct `FRONTEND_URL`)
- [ ] AI content generation works (Groq key valid, model ID correct)
- [ ] Google Sign-In button appears and completes flow (if configured)

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
