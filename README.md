# AI Assessment Hub

Comprehensive full-stack assessment and proctoring platform with multi-tenant RBAC, AI-assisted assessment generation, real-time monitoring, and subscription-tier controls.

This README is generated from the current codebase structure and behavior.

## Table of Contents

1. Platform Summary
2. Architecture
3. Runtime Lifecycle
4. Backend Deep Dive
5. Frontend Deep Dive
6. Authentication and Authorization
7. Multi-Tenancy Model
8. Assessment Modules
9. Proctoring and Environment Scan
10. AI Integration
11. API Surface Map
12. Socket Events Map
13. Data Model Overview
14. Configuration
15. Local Development
16. End-to-End QA Workflows
17. Testing and Validation
18. Security Notes
19. Troubleshooting
20. API Endpoint Reference Table
21. Maintenance Checklist

## 1. Platform Summary

Core capabilities:
- Multi-role portals: super admin, organization admin, role-based staff, exam taker
- Assessment types: coding, global MCQ, skill tests (MCQ/coding/SQL/interview), aptitude, communication
- Proctoring: live violation streams, proctor intelligence agent, behavior analysis, environment prescan
- AI features: content generation, hints, chat, interview/report support
- Multi-tenant isolation with per-organization tenant DBs
- Subscription-aware RBAC with feature gating

## 2. Architecture

```text
+-------------------------+        HTTP + Socket.IO        +-------------------------------+
| React + Vite Frontend   | <----------------------------> | FastAPI + Socket.IO ASGI App  |
| /admin /role /student   |                                | backend/main.py               |
+-------------------------+                                +-------------------------------+
            |                                                               |
            |                                                               |
            v                                                               v
+-------------------------+                                   +-------------------------------+
| Browser-side proctoring |                                   | MySQL-compatible databases    |
| TFJS + camera signals   |                                   | - Primary platform DB         |
+-------------------------+                                   | - Tenant DB per organization  |
            |                                                 +-------------------------------+
            |
            v
+-------------------------+
| Groq API (LLM services) |
+-------------------------+
```

## 3. Runtime Lifecycle

Server bootstrap (`backend/main.py`):
1. Configure logging.
2. Initialize DB pools.
3. Ensure schemas for auth, RBAC, domain tables, proctoring, and audit.
4. Reconcile active tenant schemas when enabled.
5. Run startup DB preflight checks (optional, configurable).
6. Seed default super admins.
7. Mount routers and `/uploads` static path.
8. Run as `socket_app` (FastAPI wrapped by Socket.IO ASGI app).

Request path behavior:
- JWT validation enforced for protected `/api` routes.
- Request gets `x-user-id` and `x-org-id` injected from token claims.
- Tenant DB context resolved per request unless route is exempt.
- Inactive orgs or missing tenant DB reject requests early.

## 4. Backend Deep Dive

## 4.1 Core Files

- `backend/main.py`: app lifecycle, middleware, router registration, socket events.
- `backend/config.py`: settings from `.env`, Groq key loading, model fallback config.
- `backend/database.py`: async wrapper around PyMySQL pools, schema creation/reconciliation helpers.
- `backend/security.py`: minimal HS256 JWT create/decode utilities.

## 4.2 Middleware and Error Handling

`main.py` middleware stack:
- `SecurityHeadersMiddleware`
- `LoggingMiddleware`
- `RateLimitMiddleware`
- CORS middleware (explicit origins in prod, wildcard fallback in dev)
- Custom tenant/auth middleware with org/tenant resolution

Global exception handler:
- Returns standardized JSON error with `requestId`
- Special case for missing tenant table (`1146`) with explicit tenant-schema guidance

## 4.3 Router Modules Registered

All routers are mounted centrally in `backend/main.py`:
- `auth`, `tasks`, `problems`, `submissions`, `code_execution`, `hints`, `chat`, `messaging`
- `analytics`, `skill_tests`, `aptitude`, `global_tests`, `admin`, `communication`
- `proctor_agent`, `behavior_agent`, `ai`, `environment_scan`, `attachments`, `rbac`, `public`

## 4.4 Service Layer Highlights

`backend/services` responsibilities:
- `ai_service.py`: Groq chat abstraction, model candidates, response parsing, fallback generators.
- `proctor_agent.py`: proctor intelligence workflows and control actions.
- `behavior_agent.py`: behavioral analysis endpoints and scoring surfaces.
- `prescan_*`: environment scan session/token/socket orchestration.
- `scan_aggregator.py`, `angle_tracker.py`: scan quality and orientation logic.
- `comm_service.py`: communication test business logic.

## 5. Frontend Deep Dive

## 5.1 Entry and Routing

- `client/src/App.jsx` manages:
  - Session verification (`/api/auth/verify`)
  - Route guards (`ProtectedRoute`)
  - Role/permission-based workspace routing:
    - `/admin` for platform/org admins
    - `/role` for staff/content workspace
    - `/student` for exam takers
  - Google login + OTP flow support

## 5.2 Portal Responsibilities

- `client/src/pages/AdminPortal.jsx`:
  - Platform operations (org lifecycle, tenant DB setup, usage/limits)
  - RBAC user/role administration
  - Assessment management depending on role and permissions
  - Monitoring and analytics panels

- `client/src/pages/MentorPortal.jsx`:
  - Content creation and review views (permission-gated)
  - Group analytics and live monitoring for mentees

- `client/src/pages/StudentPortal.jsx`:
  - Learning modules: coding, aptitude, global tests, skill tests, communication
  - Progress modules: submissions, skill submissions, analytics
  - Prescan gate integration for protected exam starts

## 5.3 Real-Time and Prescan Client Modules

- `client/src/hooks/useProctoring.js`: sends client-side monitoring events.
- `client/src/services/socketService.js` and prescan socket services: monitoring and scan event transport.
- `client/src/prescan/*`: mobile + desktop scan UX and room/session handling.

## 6. Authentication and Authorization

Auth flow supports:
- Email/password login (`/api/auth/login`)
- Google credential login (`/api/auth/google`)
- OTP verification (`/api/auth/verify-otp`)
- First-login forced password completion (`/api/auth/complete-first-login`)
- Session verify (`/api/auth/verify`)

Authorization model:
- JWT claims validated on protected routes.
- Token `sub` must align with requested user context.
- Role and permission checks enforced both in backend and UI gating.
- Protected socket joins validate token + user context.

## 7. Multi-Tenancy Model

Primary DB stores platform-wide entities (users, orgs, RBAC, metadata).
Tenant DB per organization stores assessment-domain data.

Per-request tenant resolution:
1. Determine authenticated user and organization from token.
2. Validate org is active.
3. Resolve tenant pool for org.
4. Bind pool to request context for route-level DB calls.

Startup integrity guards:
- tenant schema reconciliation for active orgs
- optional DB preflight checks for primary and tenant schemas

## 8. Assessment Modules

## 8.1 Coding / Problems / Tasks

- CRUD for coding problems and tasks
- Student assignment retrieval and submission pipelines
- Code execution endpoint for multiple languages

## 8.2 Skill Tests

`/api/skill-tests` covers:
- test creation and allocation
- student available tests and attempt lifecycle
- MCQ, coding, SQL, and interview sections
- proctoring logs and reports
- admin submission reset/cleanup endpoints

## 8.3 Aptitude

`/api/aptitude` covers:
- test CRUD
- allocation and student listing
- submission and detailed question result tracking
- proctoring logging

## 8.4 Global Tests

`/api/global-tests` covers:
- test CRUD and question management
- student allocations
- submission and reporting
- proctoring logs

## 8.5 Communication

`/api/communication` covers:
- module A/B/C/D prompts and answer submission
- full communication test creation/allocation/attempt flow
- proctoring logs + status checks
- history and report retrieval

## 9. Proctoring and Environment Scan

## 9.1 Monitoring Events

Students emit events like:
- `submission_started`
- `submission_completed`
- `proctoring_violation`
- `progress_update`
- `test_failed`

Server forwards scoped alerts to org admin room and mentor room when valid.

## 9.2 Proctor Agent and Behavior Agent

REST modules:
- `/api/proctor-agent/*`: analysis, warnings, terminate, clear-flag, dashboards.
- `/api/behavior/*`: log-events, analyze, reports, dashboards, session traces.

## 9.3 Environment Prescan

`/api/prescan` + socket handlers provide:
- scan session creation and tracking
- mobile token links for QR scan handoff
- frame-level scan ingestion and status updates
- retry and scan completion lifecycle

## 10. AI Integration

Current AI provider: Groq Chat Completions API.

Key implementation facts (`backend/services/ai_service.py`):
- Model candidate list built from primary + fallback models.
- Key rotation is cyclic across configured keys.
- If a key fails, request retries next key automatically.
- If model unavailable, fallback models are attempted.
- JSON parsing helper handles fenced JSON responses.

Key slots supported in config:
- `GROQ_API_KEY`
- `GROQ_API_KEY_1` through `GROQ_API_KEY_15`

## 11. API Surface Map

Major prefixes and examples (not exhaustive):
- `/api/auth/*`: login, google, otp, verify
- `/api/admin/*`: admin user CRUD/status/reset
- `/api/rbac/*`, `/api/platform/*`, `/api/orgs/*`: roles, organizations, tenant DB setup, limits
- `/api/analytics/*`: admin/mentor/student analytics + export + logs/errors
- `/api/skill-tests/*`: full skill-test lifecycle
- `/api/aptitude*`: aptitude lifecycle
- `/api/global-tests*`: global tests lifecycle
- `/api/communication/*`: module and full communication test lifecycle
- `/api/submissions*`: submission creation, feedback, escalation
- `/api/run`: language execution endpoint
- `/api/prescan/*`: environment scan flows
- `/api/proctor-agent/*`, `/api/behavior/*`: integrity intelligence
- `/api/public/config`, `/api/health`

## 12. Socket Events Map

Client -> server join events:
- `join_monitoring`
- `join_student_session`
- prescan-specific join events from `prescan_socket_handlers`

Client -> server activity events:
- `submission_started`
- `submission_completed`
- `proctoring_violation`
- `progress_update`
- `test_failed`

Server -> client examples:
- `monitoring_connected`
- `monitoring_error`
- `live_update`
- `live_alert`
- prescan status/result events

## 13. Data Model Overview

Domain tables include (from DB bootstrap):
- content/work: `problems`, `tasks`, `submissions`, completion/allocation tables
- aptitude: tests, questions, submissions, question results, allocations
- skill tests: test/attempt/allocation tables
- global tests: tests, questions, submissions, section/question results
- communication: tests, allocations, attempts
- integrity: unified proctoring events, proctor analyses, behavior analyses, reports

Note: platform DB and tenant DB separation is enforced by request context and org mapping.

## 14. Configuration

## 14.1 Backend `.env`

Required/important:
- `DATABASE_URL`
- `PORT`
- `SECRET_KEY`
- `PRESCAN_SECRET_KEY`
- `ALLOWED_ORIGINS`
- `FRONTEND_URL`
- `GROQ_API_KEY` + optional `GROQ_API_KEY_1..15`
- `GROQ_MODEL`, `GROQ_FALLBACK_MODELS`
- `GOOGLE_OAUTH_CLIENT_ID`
- OTP controls (`OTP_EXPIRY_MINUTES`, `OTP_MAX_FAILED_ATTEMPTS`, etc.)

Operational toggles:
- `STARTUP_DB_PREFLIGHT`
- `STARTUP_DB_PREFLIGHT_TENANTS`
- `STARTUP_TENANT_SCHEMA_RECONCILE`

## 14.2 Frontend `.env`

- `VITE_API_URL`
- `VITE_PUBLIC_APP_URL`
- `VITE_DEV_ALLOWED_HOSTS`
- `VITE_GOOGLE_CLIENT_ID`

## 15. Local Development

## 15.1 Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

## 15.2 Frontend

```bash
cd client
npm install
npm run dev
```

## 15.3 HTTPS Tunnel for Prescan/OAuth

For real-device prescan:
1. Start backend and frontend.
2. Tunnel frontend (`ngrok http 5173`).
3. Set backend `FRONTEND_URL` and frontend `VITE_PUBLIC_APP_URL`/`VITE_API_URL` to tunnel origin.
4. Restart backend and frontend.

## 16. End-to-End QA Workflows

## Common Phase (All Tiers)

1. Login as super admin.
2. Create organization with selected subscription tier.
3. Login as org admin and complete first-login setup.
4. Configure tenant DB and verify status is active.

## Free Trial

Validate:
- limited RBAC controls (no custom role creation)
- content creator can manage allowed test types only
- student can attempt assigned tests and view own submissions
- blocked actions are hidden and denied

## Basic

Validate:
- custom roles creation enabled
- broader assessment creation/evaluation flows
- staff workflow in `/role` and learner workflow in `/student`

## Pro

Validate:
- all monitoring, override/manage, and export capabilities
- full analytics and operations surfaces

## 17. Testing and Validation

Backend tests:

```bash
cd backend
pytest -q
```

DB preflight utility:

```bash
cd backend
python scripts/db_preflight.py --db-url "mysql://user:password@host:port/database"
```

Suggested verification after config updates:
- `/api/health`
- auth login + verify route
- tenant DB status route
- one assessment create/start/submit cycle
- live monitoring socket connection

## 18. Security Notes

- Keep all secrets in environment variables only.
- Rotate keys if leaked.
- Restrict CORS to known domains in production.
- Restrict Google OAuth origins/redirect URIs.
- Use HTTPS in production for auth, prescan, and proctoring flows.

## 19. Troubleshooting

- `401 Missing bearer token`: protected route called without auth header.
- `401 Invalid or expired token`: token expired/signature mismatch.
- `403 Organization context mismatch`: token org and request org differ.
- `503 Tenant database is not configured`: org tenant DB setup incomplete.
- `500 Tenant database schema is incomplete`: run schema reconciliation/preflight.
- Prescan mobile issues: verify HTTPS origin and `FRONTEND_URL` consistency.
- Groq failures: verify key validity, model IDs, and fallback configuration.

## 20. API Endpoint Reference Table

Grouped by backend route modules (prefix + key endpoints).

| Module | Prefix | Key Endpoints | Typical Roles |
|---|---|---|---|
| Auth | `/api` | `/auth/login`, `/auth/google`, `/auth/verify-otp`, `/auth/complete-first-login`, `/auth/verify` | All |
| Admin Users | `/api/admin` | `/users` (GET/POST), `/users/{user_id}` (PUT/DELETE), `/users/{user_id}/reset-password`, `/users/{user_id}/status` | Super Admin, Org Admin |
| RBAC + Org Management | `/api` | `/rbac/permissions`, `/platform/organizations`, `/platform/organizations/{org_id}/status`, `/orgs/{org_id}/roles`, `/orgs/{org_id}/users`, `/orgs/{org_id}/tenant-db` | Super Admin, Org Admin |
| Public | `/api/public` | `/config` | Public |
| Health | `/api` | `/health` | Public |
| Problems | `/api` | `/problems` (GET/POST), `/problems/{problem_id}` (DELETE), `/students/{student_id}/problems` | Staff, Students |
| Tasks | `/api` | `/tasks` (GET/POST), `/tasks/{task_id}` (DELETE), `/students/{student_id}/tasks` | Staff, Students |
| Submissions | `/api` | `/submissions` (GET/POST), `/submissions/proctored`, `/submissions/{submission_id}/feedback`, `/submissions/{submission_id}/escalate` | Staff, Students |
| Code Execution | `/api` | `/run` | Staff, Students |
| Hints | `/api` | `/hints` | Staff, Students |
| Chat | `/api` | `/chat` | Staff, Students |
| Messaging | `/api` | `/messages/{user_id}`, `/messages/{user_id}/{other_user_id}`, `/messages` (POST) | Staff, Students |
| AI Content | `/api/ai` | `/generate-problem`, `/generate-coding-problem`, `/generate-sql-problem`, `/generate-aptitude`, `/chat` | Staff |
| Analytics | `/api/analytics` | `/admin`, `/mentor/{mentor_id}`, `/student/{student_id}`, `/topics`, `/plagiarism`, `/time-to-solve`, `/export/json`, `/export/csv`, `/audit-logs`, `/system-errors` | Staff, Admin |
| Skill Tests | `/api/skill-tests` | `/create`, `/all`, `/student/available`, `/{test_id}/allocations`, `/{test_id}/start`, `/mcq/*`, `/coding/*`, `/sql/*`, `/interview/*`, `/report/{attempt_id}`, `/admin/all-submissions` | Staff, Students, Admin |
| Aptitude | `/api` | `/aptitude` (GET/POST), `/aptitude/{test_id}`, `/aptitude/{test_id}/submit`, `/aptitude/{test_id}/allocate-students`, `/aptitude/proctoring/log`, `/aptitude-submissions` | Staff, Students |
| Global Tests | `/api` | `/global-tests` (GET/POST), `/global-tests/{test_id}` (GET/PUT/DELETE), `/global-tests/{test_id}/allocations`, `/global-tests/{test_id}/submit`, `/global-test-submissions`, `/global-tests/proctoring/log` | Staff, Students |
| Communication | `/api/communication` | `/moduleA|B|C|D`, `/tests/create`, `/tests/all`, `/tests/{test_id}/allocations`, `/tests/student/available`, `/tests/{test_id}/start`, `/tests/attempt/{attempt_id}/submit-module`, `/tests/attempt/{attempt_id}/finish`, `/proctoring/log` | Staff, Students |
| Proctor Agent | `/api/proctor-agent` | `/dashboard`, `/analyses`, `/analyze`, `/analyze/batch`, `/report`, `/terminate`, `/warn`, `/clear-flag`, `/analysis/{analysis_id}` | Admin, Mentors |
| Behavior Agent | `/api/behavior` | `/log-events`, `/analyze`, `/report`, `/sessions`, `/dashboard`, `/analyses`, `/analysis/{analysis_id}`, `/session/{session_id}`, `/clear` | Admin, Mentors |
| Environment Scan | `/api/prescan` | `/exams`, `/sessions` (POST/GET), `/sessions/{session_id}`, `/scans/{scan_id}`, `/scans/{scan_id}/retry`, `/scans/{scan_id}/frames`, `/mobile/{token}` | Students, Staff |
| Attachments | `/api/attachments` | `/upload` | Staff, Students |

Notes:
- Role access is enforced by token + permission checks; “Typical Roles” is a usage guide, not a bypass rule.
- Many modules include additional endpoints; this table lists high-signal operational routes.

## 21. Maintenance Checklist

Whenever code changes in routes/services/config:
1. Update this README sections affected by flow changes.
2. Re-verify endpoint names and prefixes.
3. Re-verify startup flags and env variables.
4. Re-run backend tests and DB preflight.
5. Confirm tier-based gating remains aligned with RBAC permissions.

---

Last updated: May 22, 2026.
