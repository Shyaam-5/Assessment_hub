# How to set up MentorHub / Assessment stack

This repo has a **FastAPI** backend (`backend/`) and a **Vite + React** client (`client/`). Database access uses MySQL-compatible URLs (e.g. TiDB Cloud).

---

## Prerequisites

- **Python 3.11+** (whatever version your `backend` dependencies expect)
- **Node.js 20+** (or current LTS) and **npm**
- **MySQL-compatible database** reachable from your machine
- Optional: **ngrok** (or another HTTPS tunnel) for **environment / room scan** on real devices, because camera and secure context rules work reliably over **HTTPS**

---

## 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` from the template:

```bash
cp .env.example .env
```

Edit `backend/.env` and set at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | `mysql://user:password@host:port/database` |
| `PORT` | API port (default `8000`) |
| `SECRET_KEY` | Long random string for signing sessions / tokens |
| `PRESCAN_SECRET_KEY` | Separate secret for prescan mobile token signing |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed by CORS |
| `FRONTEND_URL` | Public base URL of the React app (see ngrok section below) |
| `GOOGLE_OAUTH_CLIENT_ID` | Optional. Web client ID from Google Cloud (must match `VITE_GOOGLE_CLIENT_ID`). Enables “Continue with Google” on the login page. |

### Run the backend

From the **`backend/`** directory, with the virtual environment **activated**:

**Option A — Uvicorn (recommended)**

```bash
# Linux / macOS — use the same port as PORT in .env (default 8000)
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

On **Windows** (PowerShell), after `.\.venv\Scripts\activate`:

```powershell
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

If `PORT` in `.env` is not `8000`, use that value in `--port` so the client’s `VITE_API_URL` matches.

**Option B — Python module**

`main.py` reads `PORT` from the environment (defaults to `8000`):

```bash
python main.py
```

Use this only from **`backend/`** so imports like `main:socket_app` resolve.

**Why `socket_app`?** The app wraps FastAPI with **Socket.IO** for live monitoring, prescan, and messaging. Use **`main:socket_app`**, not `main:app`, or WebSocket / socket features will not work.

You should see startup logs including the database pool and prescan/auth schema checks. The API base URL is `http://localhost:8000` (or your chosen `PORT`); REST routes are under **`/api/...`**.

---

## 2. Client

```bash
cd client
npm install
```

Create `client/.env` from the template:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Origin of the API (scheme + host + port, **no** trailing `/api`). Local default: `http://localhost:8000`. |
| `VITE_PUBLIC_APP_URL` | **HTTPS public URL of the Vite app** when you use ngrok. Same URL you open in the browser (no path). Used only at build/dev config time so Vite accepts that host. |
| `VITE_DEV_ALLOWED_HOSTS` | Optional extra hostnames (comma-separated) if you use more than one tunnel. |
| `VITE_GOOGLE_CLIENT_ID` | Optional. Same string as backend `GOOGLE_OAUTH_CLIENT_ID`. If unset, the Google button is hidden. |

Run:

```bash
npm run dev
```

The dev server listens on **5173** by default and proxies `/api` and `/socket.io` to `http://localhost:8000`.

---

## 3. Environment scan (prescan) and HTTPS / ngrok

Room scan flows generate a **mobile URL** (QR / link). Browsers need a **secure context** (HTTPS on real devices, or localhost on desktop). For phones, you typically expose the **frontend** over HTTPS.

### Single tunnel to the Vite dev server (simplest)

1. Start backend on `8000` and client on `5173`.
2. Start ngrok pointing at **5173** (the Vite port), for example:

   ```bash
   ngrok http 5173
   ```

3. Copy the HTTPS URL ngrok prints (e.g. `https://something.ngrok-free.dev`).

4. **Update these whenever the ngrok URL changes:**

   - **`backend/.env`**
     - `FRONTEND_URL=https://something.ngrok-free.dev`
     - `ALLOWED_ORIGINS=…` must include the same origin (and usually `http://localhost:5173` for local testing).

   - **`client/.env`**
     - `VITE_PUBLIC_APP_URL=https://something.ngrok-free.dev` (no space after `=`).
     - `VITE_API_URL=https://something.ngrok-free.dev` so the browser uses the **same HTTPS origin** as the page; Vite proxies `/api` and `/socket.io` to your local backend. Using `http://localhost:8000` while the site is loaded over **HTTPS** ngrok can break requests (mixed content) or confuse OAuth.
     - Do **not** set `VITE_STRICT_CROSS_ORIGIN_ISOLATION=true` if you use **Continue with Google** — it enables COOP/COEP and the Google popup often stays blank at `gsi/transform`.

5. Restart **Vite** and the **backend** after editing `.env` so new values load.

The API builds mobile links from the request **`Origin`** header when present, and falls back to **`FRONTEND_URL`** from `backend/.env`. Keeping `FRONTEND_URL` in sync with your tunnel avoids broken QR links when `Origin` is missing.

### Two tunnels (frontend + API)

If you expose the API on a separate HTTPS URL, set:

- `VITE_API_URL` to the **API** tunnel origin.
- `VITE_PUBLIC_APP_URL` to the **frontend** tunnel origin.
- `FRONTEND_URL` on the backend to the **frontend** tunnel (for scan links).
- `ALLOWED_ORIGINS` to include the **frontend** origin.

No ngrok hostname is hardcoded in `vite.config.js`; it reads **`VITE_PUBLIC_APP_URL`** and **`VITE_DEV_ALLOWED_HOSTS`** from `client/.env`.

---

## 4. Google Sign-In (admin-provisioned accounts)

The app supports **Google Identity Services** (Sign-In button) in addition to email and password. There is **no self-registration**: the Google account’s email must match a user row that an **administrator already created** (`POST /api/admin/users`).

### Google Cloud Console

1. Create (or select) a project → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Open **`client/google-oauth-console-uris.txt`** in this repo. For **each URI** listed under **Authorized JavaScript origins** and **Authorized redirect URIs**, click **+ Add URI** in Google Cloud and paste it (no spaces, no quotes). Save.
4. If Google rejects a duplicate (e.g. with vs without trailing `/`), keep only one variant per host.
5. **Save**. Changes can take a few minutes to apply.

Update that `.txt` file whenever your **ngrok URL** changes (and match **`VITE_PUBLIC_APP_URL`** / **`VITE_API_URL`** in `client/.env`).

### Environment variables

Use the **same OAuth client ID** in both places:

| File | Variable |
|------|----------|
| `backend/.env` | `GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com` |
| `client/.env` | `VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com` |

If `VITE_GOOGLE_CLIENT_ID` is empty, the login page does not show Google Sign-In.

After changing `.env`, restart the backend and the Vite dev server.

**Blank white Google popup** at `accounts.google.com/gsi/transform`: strict **COOP / COEP** headers on the dev server isolate the page and stop Google’s popup from completing. By default those headers are **not** sent. If you set **`VITE_STRICT_CROSS_ORIGIN_ISOLATION=true`** in `client/.env` for WebAssembly/TensorFlow, turn it **off** while testing Google Sign-In, or use email/password login.

### Secure login flow (password path + Google path)

The diagram you use for assessments (credentials → OTP → first-login password change → dashboard) can treat **Google** as an alternative entry that **merges** after identity is known: Google proves email ownership; the platform still requires a **matching provisioned account**. OTP and forced password change can apply **after** either branch the same way.

```mermaid
flowchart TD
  Start[Login page]
  Start --> Method{Sign-in method}

  Method -->|Email + password| Creds[Validate email and password]
  Creds -->|Invalid| Deny1[Access denied]
  Creds -->|Valid| OTP[OTP: send and verify]
  OTP -->|Invalid| Deny2[Retry / deny access]
  OTP -->|Valid| FirstPwd[Force password change on first login if flagged]
  FirstPwd --> Dash[Secure dashboard]

  Method -->|Continue with Google| G[Google OAuth / ID token]
  G -->|Not verified / invalid| Deny3[Access denied]
  G -->|Valid email| Prov{User row exists with same email admin created?}
  Prov -->|No| Deny4[No account — contact admin]
  Prov -->|Yes| Merge[Same session as password login]
  Merge --> OTP
```

*(OTP and “first login” password rules are shown as shared steps; wire them in the backend when you implement those features.)*

### API (sign-in sequence)

1. `POST /api/auth/login` — checks email/password; sends OTP email (or logs code if SMTP is unset); returns `{ requiresOtp, challengeId, emailMasked, expiresIn }`.
2. `POST /api/auth/google` — same OTP step after Google verifies the account.
3. `POST /api/auth/verify-otp` — body `{ challengeId, otp }`; returns `{ user }` or `{ mustChangePassword, setupToken, user }` for new admin-provisioned accounts.
4. `POST /api/auth/complete-first-login` — body `{ setupToken, newPassword }` when a password change is required.
5. `POST /api/auth/verify` — session check; fails if `must_change_password` is still set so stale sessions cannot use the app until the user finishes setup.

Environment variables (see `backend/.env.example`): `OTP_EXPIRY_MINUTES`, `OTP_MAX_FAILED_ATTEMPTS`, `FIRST_LOGIN_PASSWORD_MIN_LEN`, and optional `SMTP_*` for real email delivery.

---

## 5. Tests

From `backend/`:

```bash
pytest -q
```

---

## 6. Security notes

- Do **not** commit `backend/.env` or `client/.env` with real keys.
- Rotate any API keys that were ever committed to git or shared in chat.
- For production, use proper secrets management and restrict `ALLOWED_ORIGINS` to your real domains.
- Restrict Google OAuth **JavaScript origins** to known domains only.
