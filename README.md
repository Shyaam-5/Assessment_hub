# AI Assessment Hub

A full-stack, AI-powered online assessment and proctoring platform for educational institutions. Supports coding, SQL, MCQ, aptitude, behavioral, and communication assessments with real-time integrity monitoring.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup & Installation](#setup--installation)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
  - [4. Database Setup](#4-database-setup)
  - [5. Running the Application](#5-running-the-application)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [User Roles](#user-roles)
- [Assessment Types](#assessment-types)
- [Proctoring System](#proctoring-system)
- [Pre-Scan (Environment Scan)](#pre-scan-environment-scan)
- [AI Integration](#ai-integration)
- [Code Execution Engine](#code-execution-engine)
- [WebSocket Events](#websocket-events)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Multi-type Assessments** — Coding, SQL, MCQ, aptitude, global, behavioral, communication
- **AI-Powered Proctoring** — Real-time face detection, object detection, tab-switch monitoring, copy-paste detection
- **Pre-Scan System** — Environment verification before assessments (room scan via webcam, mobile QR-based scan)
- **AI Problem Generation** — Auto-generate problems using Groq LLM (Llama 4 Scout)
- **Live Code Execution** — In-browser execution for Python, JavaScript, C, Java, SQL
- **Real-Time Monitoring** — Admin/mentor live dashboard via Socket.io
- **Behavior Analysis** — ML ensemble model for anomaly detection
- **Plagiarism Detection** — Submission-level similarity analysis
- **Analytics Dashboards** — Per-role dashboards for admin, mentor, and student
- **Communication Assessments** — Text-to-speech prompts, AI-evaluated responses
- **PWA Support** — Offline fallback, installable on mobile/desktop

---

## Tech Stack

### Backend

| Component | Technology |
|-----------|------------|
| Framework | FastAPI 0.115.0 |
| Server | Uvicorn 0.30.6 (ASGI) |
| Database | MySQL / TiDB Cloud |
| Real-time | Python Socket.io 5.11.4 |
| AI / LLM | Groq API (Llama 4 Scout, Llama 3.1 8B fallback) |
| Password Hashing | BCrypt 4.2.0 |
| TTS | edge-tts 6.1.12 |
| HTTP Client | httpx 0.27.2 |

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 19.2.0 |
| Router | React Router DOM 7.13.0 |
| Build Tool | Vite 7.2.4 |
| Code Editor | Monaco Editor 4.7.0 |
| ML / Vision | TensorFlow.js 4.22.0, BlazeFace 0.1.0, COCO-SSD 2.2.3 |
| Real-time | Socket.io-client 4.7.2 |
| Charts | Recharts 3.7.0 |
| PDF Export | jsPDF 4.1.0 + html2canvas 1.4.1 |
| In-browser SQL | sql.js 1.13.0 |
| Icons | Lucide React 0.563.0 |

---

## Project Structure

```
Assessmentt/
├── backend/
│   ├── main.py                  # FastAPI + Socket.io app entry point
│   ├── config.py                # Settings loader (reads .env)
│   ├── database.py              # MySQL connection pool + table creation
│   ├── requirements.txt
│   ├── .env                     # Backend environment variables
│   ├── routes/                  # API route modules (18 modules)
│   │   ├── auth.py              # Login, session verify
│   │   ├── admin.py             # User management
│   │   ├── problems.py          # Problem CRUD
│   │   ├── submissions.py       # Code submission & evaluation
│   │   ├── code_execution.py    # Multi-language code runner
│   │   ├── skill_tests.py       # Skill test management
│   │   ├── aptitude.py          # Aptitude tests
│   │   ├── global_tests.py      # Global assessments
│   │   ├── analytics.py         # Dashboard analytics
│   │   ├── ai.py                # AI problem/question generation
│   │   ├── chat.py              # AI chat endpoint
│   │   ├── messaging.py         # User messaging
│   │   ├── communication.py     # Communication assessments
│   │   ├── proctor_agent.py     # AI proctoring analysis
│   │   ├── behavior_agent.py    # Behavior analysis
│   │   ├── hints.py             # AI hint generation
│   │   ├── tasks.py             # Task management
│   │   └── environment_scan.py  # Pre-scan system
│   ├── services/
│   │   ├── ai_service.py        # Groq API wrapper with key rotation
│   │   ├── proctor_agent.py     # Proctoring analysis logic
│   │   ├── behavior_agent.py    # Behavioral ML analysis
│   │   ├── prescan_*.py         # Pre-scan services (7 files)
│   │   ├── scan_aggregator.py   # Scan result aggregation
│   │   ├── angle_tracker.py     # Device angle tracking
│   │   ├── pagination.py        # Pagination helper
│   │   └── comm_service.py      # Communication service
│   ├── ml/
│   │   ├── ensemble_predictor.py
│   │   └── train_ensemble.py
│   └── uploads/
│       ├── proctoring/          # Webcam/screen captures
│       └── tts/                 # TTS audio files
│
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── .env                     # Frontend environment variables
│   ├── src/
│   │   ├── App.jsx              # Root app + routing
│   │   ├── main.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── StudentPortal.jsx
│   │   │   ├── MentorPortal.jsx
│   │   │   └── AdminPortal.jsx
│   │   ├── components/          # 36 React components
│   │   ├── prescan/             # Pre-scan UI (pages, components, hooks)
│   │   ├── services/
│   │   │   ├── socketService.js
│   │   │   └── offlineService.js
│   │   ├── hooks/
│   │   │   └── useProctoring.js
│   │   └── styles/
│   │       ├── accessibility.css
│   │       └── darkmode.css
│   └── public/
│       ├── manifest.json        # PWA manifest
│       ├── sw.js                # Service worker
│       ├── offline.html
│       └── sql-wasm.wasm        # SQL.js WASM binary
│
└── README.md
```

---

## Prerequisites

Make sure the following are installed before proceeding:

| Requirement | Minimum Version | Notes |
|-------------|-----------------|-------|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend build + dev server |
| npm | 9+ | Package manager |
| MySQL | 8.0+ | Or use TiDB Cloud (recommended) |
| Groq API Key | — | Free tier available at console.groq.com |

**For code execution features:**

- `gcc` — C compilation (`gcc` must be on system PATH)
- `java` / `javac` — Java execution
- `node` — JavaScript execution
- Python is already required for the backend

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Assessmentt
```

### 2. Backend Setup

#### Create and activate a virtual environment

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate on Windows
.venv\Scripts\activate

# Activate on macOS/Linux
source .venv/bin/activate
```

#### Install Python dependencies

```bash
pip install -r requirements.txt
```

#### Configure backend environment variables

Create a `.env` file inside `backend/`:

```env
# Database (MySQL or TiDB Cloud)
DATABASE_URL=mysql://username:password@host:port/mentor_hub

# Groq AI API Keys (primary + fallbacks for rate-limit rotation)
GROQ_API_KEY=gsk_your_primary_key_here
GROQ_API_KEY_1=gsk_your_fallback_key_1
GROQ_API_KEY_2=gsk_your_fallback_key_2

# AI Model
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Server
PORT=8000

# Frontend URL (for CORS — use localhost in development)
FRONTEND_URL=http://localhost:5173

# Pre-scan security
PRESCAN_SECRET_KEY=your-random-secret-string-here
```

### 3. Frontend Setup

```bash
cd client

# Install dependencies
npm install
```

#### Configure frontend environment variables

Create a `.env` file inside `client/`:

```env
# Backend API base URL
VITE_API_URL=http://localhost:8000
```

### 4. Database Setup

The application **automatically creates all required tables** on startup. You only need to:

1. Create an empty MySQL database:

```sql
CREATE DATABASE mentor_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Ensure your `DATABASE_URL` in `.env` points to it.

Tables created automatically on first run:

| Table | Purpose |
|-------|---------|
| `users` | User accounts (admin, mentor, student) |
| `problems` | Coding/SQL problem bank |
| `submissions` | Code submissions and results |
| `skill_tests` | Skill test definitions and sessions |
| `aptitude_tests` | Aptitude test data |
| `global_tests` | Global assessment definitions |
| `tasks` | Learning task assignments |
| `prescan_exams` | Pre-scan exam definitions |
| `prescan_exam_sessions` | Candidate scan sessions |
| `prescan_room_scans` | Room scan results |
| `prescan_scan_frames` | Frame-by-frame analysis data |
| `prescan_scan_audit_log` | Audit trail |
| `prescan_scan_overrides` | Manual proctor overrides |

#### Create initial admin user

```bash
cd backend
python create_user.py
```

Follow the prompts to create an admin account.

### 5. Running the Application

#### Start the backend server

```bash
cd backend
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.
Interactive API docs: `http://localhost:8000/docs`

#### Start the frontend dev server

```bash
cd client
npm run dev
```

The frontend will be available at `http://localhost:5173`.

#### Verify health

```
GET http://localhost:8000/api/health
```

Expected response: `{ "status": "healthy" }`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `GROQ_API_KEY` | Yes | Primary Groq API key |
| `GROQ_API_KEY_1` | No | Fallback API key 1 |
| `GROQ_API_KEY_2` | No | Fallback API key 2 |
| `GROQ_MODEL` | No | LLM model ID (default: llama-4-scout) |
| `PORT` | No | Server port (default: 8000) |
| `FRONTEND_URL` | Yes | Allowed CORS origin |
| `PRESCAN_SECRET_KEY` | Yes | Secret for prescan session tokens |

### Frontend (`client/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend base URL |

---

## API Reference

Base URL: `http://localhost:8000/api`

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Validate email + password; returns OTP challenge (`requiresOtp`, `challengeId`, …), not a session yet |
| POST | `/auth/google` | Validate Google ID token; same OTP challenge pattern |
| POST | `/auth/verify-otp` | Submit `{ challengeId, otp }`; returns `user`, or `mustChangePassword` + `setupToken` for first-time setup |
| POST | `/auth/complete-first-login` | Submit `{ setupToken, newPassword }` after OTP when `must_change_password` is set |
| POST | `/auth/verify` | Verify stored session; **401** if user still must change password |
| GET | `/users/{id}` | Get user by ID |
| GET | `/users` | List all users |

**Login request body (step 1):**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Login response (step 1 — OTP sent):**
```json
{
  "requiresOtp": true,
  "challengeId": "uuid",
  "expiresIn": 600,
  "emailMasked": "u***@example.com"
}
```

**Verify OTP request:**
```json
{
  "challengeId": "uuid",
  "otp": "123456"
}
```

**Verify OTP response (normal):**
```json
{
  "success": true,
  "mustChangePassword": false,
  "user": {
    "id": "student-abc123",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "student",
    "mustChangePassword": false
  }
}
```

**Verify OTP response (first login after admin created user):**
```json
{
  "success": true,
  "mustChangePassword": true,
  "setupToken": "uuid",
  "user": { "...": "...", "mustChangePassword": true }
}
```

**Legacy note:** The SPA stores `user` in `localStorage` only after OTP (and optional first-password step), then calls `/auth/verify` on reload.

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| POST | `/admin/users` | Create a new user |
| PUT | `/admin/users/{id}` | Update user details |
| DELETE | `/admin/users/{id}` | Delete a user |
| POST | `/admin/users/{id}/reset-password` | Reset user password |

### Problems

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/problems` | List all problems |
| POST | `/problems` | Create a problem |
| GET | `/problems/{id}` | Get problem details |
| PUT | `/problems/{id}` | Update a problem |
| DELETE | `/problems/{id}` | Delete a problem |

### Code Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/run` | Execute code in any supported language |

**Request body:**
```json
{
  "language": "python",
  "code": "print('Hello, World!')",
  "input": "",
  "time_limit": 5
}
```

**Supported languages:** `python`, `javascript`, `c`, `java`, `sql`

### Submissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/submissions` | Submit code for evaluation |
| GET | `/submissions/{id}` | Get submission result |
| POST | `/submissions/{id}/plagiarism` | Run plagiarism check |
| POST | `/submissions/upload` | Upload file submission |

### AI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate-problem` | Generate a problem with AI |
| POST | `/generate-coding-problem` | Generate a coding problem |
| POST | `/chat` | AI chat assistant |
| POST | `/hints` | Get hint for a problem |

**Generate problem request:**
```json
{
  "topic": "Binary Trees",
  "difficulty": "medium",
  "type": "coding"
}
```

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/admin` | Admin overview analytics |
| GET | `/analytics/student/{id}` | Student-level analytics |
| GET | `/analytics/mentor/{id}` | Mentor-level analytics |

### Pre-Scan (Environment Scan)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/prescan/exams` | List available prescan exams |
| POST | `/prescan/sessions` | Create a prescan session |
| POST | `/prescan/sessions/{token}/start-scan` | Begin environment scan |
| POST | `/prescan/sessions/{token}/frames` | Submit scan frames |
| GET | `/prescan/sessions/{token}/status` | Get scan status |
| POST | `/prescan/sessions/{token}/complete` | Complete the scan |

### Proctoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/proctor-agent/analyze` | Analyze proctoring data |
| POST | `/proctor-agent/report` | Generate integrity report |
| POST | `/proctor-agent/collusion-detect` | Detect collusion between submissions |

---

## User Roles

The platform supports three roles, each with a dedicated portal:

| Role | Portal | Capabilities |
|------|--------|-------------|
| **Admin** | `/admin` | Full platform management: create users, assign mentors, configure tests, view all analytics, live monitoring |
| **Mentor** | `/mentor` | Manage assigned students, create/assign problems and tests, view student progress, monitor assessments |
| **Student** | `/student` | Take assessments, view results and feedback, access AI chatbot and hints |

---

## Assessment Types

### Coding Tests
- Problems with custom test cases
- Monaco editor with syntax highlighting
- Real-time code execution feedback
- Auto-evaluated with test case pass/fail

### SQL Tests
- SQL query problems with schema context
- In-browser execution via sql.js (WASM)
- Server-side validation against expected output

### MCQ / Aptitude Tests
- Multiple choice questions with configurable time limits
- Randomized question ordering
- Auto-scored with detailed result breakdown

### Global Tests
- Organization-wide assessments combining multiple question types
- Configurable sections and time allocations

### Behavioral Assessments
- ML-based analysis of response patterns
- Ensemble model for anomaly detection

### Communication Assessments
- AI-generated prompts delivered via text-to-speech
- Recorded responses evaluated by Groq LLM
- Scoring across multiple communication dimensions

---

## Proctoring System

The platform includes a multi-layered proctoring system:

### Client-Side Detection (TensorFlow.js)
- **Face Detection** — BlazeFace model detects if no face or multiple faces are visible
- **Object Detection** — COCO-SSD model flags unauthorized objects (phones, books, etc.)
- **Tab Switch Detection** — `visibilitychange` and `blur` events tracked
- **Copy-Paste Detection** — Clipboard events intercepted and logged

### Server-Side Analysis (AI Proctoring Agent)
- Aggregates client-side events per session
- Groq LLM analyzes behavioral patterns for fraud risk scoring
- Generates structured integrity reports with evidence
- Collusion detection across multiple submissions

### Real-Time Alerts (Socket.io)
- Proctoring events streamed to mentor/admin dashboards
- Per-student rooms: `student_{id}`, `mentor_{id}`, `admin_room`
- Configurable alert thresholds

---

## Pre-Scan (Environment Scan)

Before high-stakes assessments, students complete a mandatory environment scan:

1. **Desktop Scan** — Webcam captures 360° room panorama frames
2. **Mobile Scan** — Student scans a QR code on their phone; mobile camera provides additional angle coverage
3. **Analysis** — Frames are analyzed server-side for:
   - Unauthorized persons in the room
   - Multiple monitors
   - Prohibited devices
   - Environment angle coverage completeness
4. **Result** — Pass/Fail decision with manual override capability for proctors

---

## AI Integration

The platform uses **Groq API** with automatic key rotation across up to 3 API keys to handle rate limits.

### Supported Models
- Primary: `meta-llama/llama-4-scout-17b-16e-instruct`
- Fallback: `llama-3.1-8b-instant`

### AI Features
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Problem Generation | `POST /api/generate-problem` | Creates problem statements with test cases |
| Coding Problem Generation | `POST /api/generate-coding-problem` | Generates complete coding challenges |
| Hint Generation | `POST /api/hints` | Context-aware hints for students |
| AI Chat Assistant | `POST /api/chat` | General assistant for students |
| Communication Evaluation | Internal | Evaluates spoken/written responses |
| Proctoring Analysis | `POST /api/proctor-agent/analyze` | Fraud risk scoring from events |
| Plagiarism Detection | `POST /api/submissions/{id}/plagiarism` | Similarity analysis |

---

## Code Execution Engine

Supports server-side execution in 5 languages:

| Language | Runtime Required | Notes |
|----------|-----------------|-------|
| Python | `python3` | Uses subprocess with timeout |
| JavaScript | `node` | Node.js required |
| C | `gcc` | Compiled and executed per submission |
| Java | `java`, `javac` | JDK required |
| SQL | Internal | SQLite-based execution |

All executions run with a configurable time limit (default: 5 seconds) to prevent infinite loops.

---

## WebSocket Events

The platform uses Socket.io for real-time features. Connect to `ws://localhost:8000`.

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join_student_room` | `{ student_id }` | Join student monitoring room |
| `join_mentor_room` | `{ mentor_id }` | Join mentor dashboard room |
| `join_admin_room` | `{}` | Join admin monitoring room |
| `proctor_event` | `{ student_id, event_type, data }` | Report proctoring violation |
| `prescan_frame` | `{ token, frame_data }` | Upload prescan frame |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `proctor_alert` | `{ student_id, alert_type, severity }` | Proctoring violation alert |
| `student_status_update` | `{ student_id, status }` | Student status change |
| `prescan_update` | `{ token, status, progress }` | Pre-scan progress update |
| `analysis_complete` | `{ session_id, result }` | AI analysis finished |

---

## Deployment

### Frontend (Netlify)

```bash
cd client
npm run build
# Deploy the dist/ folder to Netlify
```

The `client/public/_redirects` file is pre-configured for Netlify SPA routing:
```
/*  /index.html  200
```

### Backend (Any ASGI-compatible host)

```bash
# Production start command
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --workers 1
```

> Note: Socket.io requires a single worker or sticky sessions. Do not use `--workers > 1` without a Socket.io adapter (e.g., Redis adapter).

### Using ngrok for Development/Demo

```bash
# Expose backend
ngrok http 8000

# Update client/.env with the ngrok URL
VITE_API_URL=https://your-ngrok-url.ngrok-free.app

# Update backend/.env
FRONTEND_URL=https://your-frontend-url
```

### Environment Notes for Production

- Set `allow_origins` in `backend/main.py` CORS config to your specific frontend domain (not `"*"`)
- Use a strong, unique `PRESCAN_SECRET_KEY`
- Ensure `uploads/proctoring/` and `uploads/tts/` directories have write permissions
- Use environment variables for all secrets — never commit `.env` files

---

## Troubleshooting

### Backend won't start

- Check that MySQL is running and `DATABASE_URL` is correct
- Ensure all dependencies are installed: `pip install -r requirements.txt`
- Check Python version: `python --version` (must be 3.10+)

### Frontend shows blank page or API errors

- Verify `VITE_API_URL` in `client/.env` matches the running backend URL
- Check browser console for CORS errors — ensure `FRONTEND_URL` in backend `.env` matches the frontend origin
- Run `npm install` to ensure all packages are installed

### Code execution not working

- Verify the required runtime is installed and on PATH:
  - Python: `python3 --version`
  - Node.js: `node --version`
  - Java: `java --version` and `javac --version`
  - C: `gcc --version`

### AI features returning errors

- Verify `GROQ_API_KEY` is set and valid
- Check Groq API rate limits — add `GROQ_API_KEY_1` and `GROQ_API_KEY_2` as fallbacks
- Test the key at `https://console.groq.com`

### Webcam / proctoring not working

- Ensure the browser has camera permissions for the origin
- Use HTTPS in production — browsers block camera on non-HTTPS origins (except `localhost`)
- Check browser console for TensorFlow.js model loading errors

### Socket.io connection issues

- Confirm backend is running on the correct port
- Check that `vite.config.js` proxy is configured for `/socket.io` in development
- In production, ensure your reverse proxy supports WebSocket upgrades

---

## License

This project is intended for educational and institutional use. See [LICENSE](LICENSE) for details.
