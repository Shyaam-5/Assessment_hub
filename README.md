# AI Assessment Hub

AI Assessment Hub is a full-stack, multi-tenant assessment platform for coding, aptitude, communication, and proctored evaluation workflows.

It combines:
- FastAPI + Socket.IO backend
- React + Vite frontend SPA
- MySQL-compatible platform + tenant databases
- Groq-powered AI generation and analysis

## Purpose

This repository implements an architecture for fair, scalable online assessments with:
- Multi-modal tests (MCQ, coding, SQL, AI interview, communication, aptitude, global tests)
- Real-time proctoring and monitoring
- Behavior and integrity analysis
- Organization-aware RBAC and tenant isolation

## Scope

In scope:
- Student, mentor/staff, organization admin, and super admin workspaces
- Test creation, allocation, attempt, and reporting
- Real-time monitoring via Socket.IO
- AI-assisted generation/evaluation workflows
- Prescan (mobile/desktop environment scan) and proctoring event capture
- Multi-tenant data isolation per organization

Out of scope:
- CI/CD pipelines and infra-as-code templates
- Internal implementation details of third-party APIs/services
- Hardware/IoT proctoring integrations

## Architecture Summary

```text
React SPA (client/) <---- HTTP + Socket.IO ----> FastAPI + Socket.IO (backend/main.py)
        |                                                   |
        |                                                   +--> Platform DB (users/orgs/RBAC)
        |                                                   +--> Tenant DB per organization
        |
        +--> Browser proctoring/prescan UX                 +--> Groq AI services
```

## Logical Layers

1. Frontend Layer (`client/`)
- React SPA with route-based workspaces: `/admin`, `/role|/mentor`, `/student`, `/scan/*`
- Role/permission gating in `client/src/App.jsx`
- Assessment UIs, analytics panels, monitoring dashboards, RBAC views

2. API & Realtime Layer (`backend/main.py`, `backend/routes/`)
- FastAPI REST modules for auth, tests, analytics, messaging, AI, attachments, RBAC, public endpoints
- Socket.IO events for monitoring, student session updates, and proctoring alerts

3. Agent/AI Layer (`backend/services/`)
- AI service wrappers and model fallbacks
- Proctor and behavior analysis services
- Vision and communication helpers

4. Data Layer (`backend/database.py`)
- Primary platform database for identity/org metadata
- Tenant DB pools resolved per request for domain data
- Startup schema checks/reconciliation

## Current Router Map

Registered backend route groups:
- `/api/admin`
- `/api/analytics`
- `/api/ai`
- `/api/attachments`
- `/api/communication`
- `/api/prescan`
- `/api/proctor-agent`
- `/api/behavior`
- `/api/public`
- plus `/api`-prefixed auth, problems, tasks, submissions, code execution, hints, chat, messaging, aptitude, global tests, and RBAC endpoints

## Realtime Monitoring Model

Key Socket.IO events:
- `join_monitoring`
- `join_student_session`
- `submission_started`
- `submission_completed`
- `proctoring_violation`
- `progress_update`
- `test_failed`

Room scoping:
- `admin_room:platform`
- `admin_room:{org_id}`
- `mentor:{org_id}:{mentor_id}`
- `student_{student_id}`
- `session_{session_id}`

## Security and Access Control

- JWT bearer auth for protected APIs
- OAuth support (Google, optional)
- OTP-assisted login flow support
- RBAC checks in backend and workspace gating in frontend
- Tenant/org binding checks per request
- Security headers + logging + rate limiting middleware

## Technology Stack

Frontend:
- React 18, Vite 7, React Router, Socket.IO client, Axios
- Monaco editor, TensorFlow.js models, Recharts

Backend:
- FastAPI, Uvicorn, python-socketio
- PyMySQL-based async-compatible pool wrapper
- bcrypt, python-dotenv, httpx, aiofiles

Data/AI:
- MySQL-compatible DB (TiDB/MySQL/PlanetScale-compatible)
- Groq API for LLM/vision tasks

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- MySQL-compatible database

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DB_NAME
SECRET_KEY=replace_with_secure_secret
PRESCAN_SECRET_KEY=replace_with_prescan_secret
GROQ_API_KEY=your_groq_key
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

Run backend:

```bash
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

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

## Risks and Limitations (Current)

- AI output quality depends on upstream model behavior and API quotas
- Real-time proctoring reliability depends on client network/camera conditions
- Tenant setup correctness is critical for isolation and data availability
- Large concurrent monitoring loads require careful infra sizing and observability

## Why This Architecture

Design choices align with the project goals from the architecture document:
- FastAPI for async performance and modular APIs
- Socket.IO for low-latency live monitoring
- Multi-tenant DB model for organization isolation
- Modular route/service structure for extensibility
- Config-driven AI key rotation and fallback for availability
