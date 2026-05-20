# Assessment Hub — End-to-End Testing Guide

> **For QA / Testers**  
> This guide walks through the full platform lifecycle — from super admin login to an exam taker completing an exam — for each of the three subscription tiers: **Free Trial**, **Basic**, and **Pro**.  
> Complete the sections in order. Each tier is self-contained; you can test them independently.

---

## Table of Contents

1. [Prerequisites & Environment](#1-prerequisites--environment)
2. [Subscription Tier Feature Matrix](#2-subscription-tier-feature-matrix)
3. [Phase 0 — Super Admin Login](#phase-0--super-admin-login)
4. [Tier A — Free Trial Workflow](#tier-a--free-trial-workflow)
5. [Tier B — Basic Workflow](#tier-b--basic-workflow)
6. [Tier C — Pro Workflow](#tier-c--pro-workflow)
7. [Cross-Tier Checks](#cross-tier-checks)
8. [Bug Reporting Checklist](#bug-reporting-checklist)

---

## 1. Prerequisites & Environment

| Item | Value |
|------|-------|
| Frontend URL | `http://localhost:5173` (or the ngrok URL shared by the dev) |
| Backend URL | `http://localhost:8000` |
| Super Admin 1 email | Set in backend `.env` → `SUPER_ADMIN_1_EMAIL` |
| Super Admin 1 password | Set in backend `.env` → `SUPER_ADMIN_1_PASSWORD` |

> **Note:** The super admin credentials are configured per deployment. Ask the dev for the actual values before starting.

**Browser requirements:**
- Use Google Chrome or Firefox (latest stable).
- Open DevTools → Console tab before each test. Note any red errors.
- For proctoring tests: allow camera and microphone when prompted.

---

## 2. Subscription Tier Feature Matrix

| Feature | Free Trial | Basic | Pro |
|---------|-----------|-------|-----|
| User management (create / view users) | ✓ (create + view) | ✓ (full CRUD) | ✓ |
| Role management — view existing roles | ✓ | ✓ | ✓ |
| Role management — create / update custom roles | ✗ | ✓ | ✓ |
| Create & assign MCQ Tests | ✓ (via Content Creator role) | ✓ | ✓ |
| Create Coding / Aptitude / Communication exams | ✗ | ✓ (via Basic Content Creator) | ✓ |
| Assign exams to users | ✓ (MCQ tests only) | ✓ (all types) | ✓ |
| Evaluate / grade submissions | ✗ | ✓ | ✓ |
| View analytics dashboard | ✓ (view only) | ✓ (view only) | ✓ |
| Export analytics | ✗ | ✗ | ✓ |
| View proctoring panel | ✓ | ✓ | ✓ |
| Override / manage proctoring flags | ✗ | ✗ | ✓ |
| View submissions | ✓ | ✓ | ✓ |
| Manage submissions | ✗ | ✓ | ✓ |
| Student — attempt assigned exams | ✓ | ✓ | ✓ |
| Student — view own results | ✓ | ✓ | ✓ |
| Tenant database self-configure (org admin) | ✓ | ✓ | ✓ |

> **Portal structure note:** The **Org Admin portal** (`/admin`) handles user management, access control, monitoring, and analytics only. All exam *creation* is done by role-based staff users logged into the **Staff portal** (`/role`) using a role that has content-creation permissions. Three system roles are seeded when an org is created: **Organization Admin**, **Content Creator**, and **Exam Taker**.

---

## Phase 0 — Super Admin Login

> This phase is identical for all three tiers. Do this once before each tier test.

### Steps

1. Navigate to the platform URL in your browser.
2. You are redirected to the landing page. Click **Login** or navigate to `/login`.
3. Enter the super admin email and password.
4. If OTP is enabled, check the inbox and enter the 6-digit code.
5. You should land on the **Admin Portal** (`/admin`).

### What to verify

- [ ] Sidebar shows: **Dashboard**, **Organizations** (All Organizations, Create Organization, Manage Users — expanded by default), **Infrastructure** (Tenant Database, Usage & Limits), **Analytics**.
- [ ] No "Create Organization" form shows DB URL or secret ref fields — only: Org Name, Org Code, Subscription Type, Admin Name, Admin Email, Admin Password.
- [ ] The Organizations group is expanded by default; clicking its header collapses and re-expands it correctly.

---

## Tier A — Free Trial Workflow

### A1. Create a Free Trial Organization

1. In the super admin sidebar click **Organizations → Create Organization**.
2. Fill in:
   - **Org Name:** `Test FT Org`
   - **Org Code:** `test-ft` *(lowercase, no spaces)*
   - **Subscription Type:** `Free Trial`
   - **Admin Name:** `FT Admin`
   - **Admin Email:** `ftadmin@example.com`
   - **Admin Password:** `FtAdmin@123` *(share this with the tester securely)*
3. Click **Create Organization**.
4. Verify success message appears: "Organization created successfully. The org admin should configure their tenant database from their Tenant Database page after first login."

**Expected:** No DB URL field is shown. Organization is created with `is_active = true` immediately (no DB needed to create the org record).

---

### A2. Org Admin First Login

1. Open a **new browser window / incognito tab**.
2. Navigate to `/login`.
3. Login with `ftadmin@example.com` and the password you set.
4. You are prompted to **change your password** (first login). Set a new strong password.
5. After password change, you land on `/admin` (org admin portal).

**Expected:**
- [ ] Sidebar shows: **Dashboard**, **Access Control** (Roles & Permissions, Users — expanded by default), **Tenant Database**, **Monitoring** (All Submissions, Live Monitoring, Proctoring Agent, Behavior Analysis), **Analytics** (Analytics, Org Analytics), **System** (Audit Logs, Error Monitoring).
- [ ] **Roles & Permissions** is visible (Free Trial includes `roles.view`) but the **Create Role** button is NOT available (no `roles.create` in Free Trial).
- [ ] No **Tests / Coding / Aptitude / Communication create** sections exist in this portal. Exam creation is done by the seeded **Content Creator** role user (see A5).

---

### A3. Configure Tenant Database (Org Admin)

1. In the org admin sidebar click **Tenant Database**.
2. You see two cards: **DB Connection Status** and **Configure Tenant Database**.
3. Click **Check Status** — it should show "DB not configured" or a connection error.
4. In the Configure card, enter your tenant DB URL: `mysql://user:pass@host:port/dbname`.
5. Keep **Activate after validation** checked.
6. Click **Save & Validate DB**.

**Expected:**
- [ ] Success message with bootstrap stats (tables created).
- [ ] Clicking Check Status again now shows connection details and `is_active = true`.

> **If you don't have a separate tenant DB**, enter a URL to the same primary DB with a different schema/database name. Ask the dev for a test DB URL.

---

### A4. Create Users (Org Admin)

Free Trial includes `users.create` and `users.view`, so the org admin can add users directly.

**Navigate to:** Org Admin sidebar → **Access Control → Users → Create User**

**Create a Content Creator (for test authoring):**

| Field | Value |
|-------|-------|
| Name | `FT Creator` |
| Email | `ftcreator@example.com` |
| Password | `Creator@123` |
| Role | `Content Creator` *(seeded system role)* |

Click **Create User**.

**Create a Student:**

| Field | Value |
|-------|-------|
| Name | `FT Student` |
| Email | `ftstudent@example.com` |
| Password | `Student@123` |
| Role | `Exam Taker` *(seeded system role)* |

Click **Create User**.

**Expected:**
- [ ] Both users appear in the user list with status "active".
- [ ] Role dropdown shows the three seeded system roles: Organization Admin, Content Creator, Exam Taker.

---

### A5. Create and Assign a Test (Content Creator)

Free Trial allows test creation via the seeded **Content Creator** role. The Content Creator logs into the **Staff portal** (`/role`), not the admin portal.

1. Open another **incognito tab**.
2. Navigate to `/login` and log in as `ftcreator@example.com` with the initial password `Creator@123`.
3. You are prompted to **change your password** (first login). Set a new strong password.
4. You land on `/role` (Staff portal — role-based workspace).
5. Sidebar shows: **Dashboard** and **Content Management** (collapsed by default). Click **Content Management** to expand — you should see **Global Complete Tests** only. Coding, Aptitude, and Communication options are absent (not in Free Trial).

**Create an MCQ test:**

1. Click **Content Management → Global Complete Tests** (expand the group first if it is collapsed).
2. Click **Create Test** (or "+ New Test").
3. Fill in:
   - **Title:** `FT Sample Test`
   - Add 2–3 MCQ questions with answer options and mark the correct answer for each.
4. Save / Publish the test.

**Assign the test to the student:**

1. On the test list, click **Assign** next to `FT Sample Test`.
2. Select `ftstudent@example.com` (or the student user you created).
3. Confirm the assignment.

**Expected:**
- [ ] Test saves and appears in the test list.
- [ ] Assignment confirmation shown.
- [ ] Staff portal does **not** show Coding, Aptitude, or Communication create options (those are not in Free Trial).

> **Coding / Aptitude / Communication create are unavailable in Free Trial.** Attempting to navigate to those URLs returns an "Access not enabled" notice.

---

### A6. Student Takes the Exam (Free Trial)

1. Open another incognito tab, navigate to `/login` and log in as `ftstudent@example.com` with `Student@123`.
2. You are prompted to **change your password** (first login). Set a new strong password.
3. You land on `/student` (Student Portal).
4. Verify the sidebar shows **Learning** (expanded) and **Progress** (expanded) groups.

**Learning group items visible:**
- Coding Problems, Aptitude Tests, Global Complete Tests, Skill Tests, Communication

**Student takes the exam:**

1. Click **Global Complete Tests** (in the Learning group) — `FT Sample Test` should appear.
2. Click **Start Test** on `FT Sample Test`.
3. Answer the MCQ questions and submit.
4. Navigate to **Progress → My Submissions** — the result should appear with the score.

**Expected:**
- [ ] Test loads and questions are visible.
- [ ] Submit works without errors.
- [ ] Result is visible under My Submissions with score.

---

### A7. Free Trial Blocked Actions

Verify the following actions are blocked (hidden or show an "Access not enabled" notice):

- [ ] Org admin → **Access Control → Roles & Permissions** → **Create Role** button is NOT present (no `roles.create`).
- [ ] Org admin tries to **delete or update a user** → no delete/edit buttons shown (no `users.delete` / `users.update`).
- [ ] Content Creator (Staff portal) tries to **create a Coding exam** → not visible in Content Management (no `coding.create` in Free Trial).
- [ ] Content Creator tries to **create an Aptitude exam** → not visible (no `aptitude.create` in Free Trial).
- [ ] Content Creator tries to **create a Communication exam** → not visible (no `communication.create` in Free Trial).
- [ ] Org admin → **Analytics → Analytics** → **Export** button is NOT present (no `analytics.export`).
- [ ] Org admin → **Monitoring → Live Monitoring** → **Override / Manage** proctoring buttons are NOT present (no `proctoring.override` / `proctoring.manage`).

---

## Tier B — Basic Workflow

### B1. Create a Basic Organization

1. In the super admin portal, **Organizations → Create Organization**.
2. Fill in:
   - **Org Name:** `Test Basic Org`
   - **Org Code:** `test-basic`
   - **Subscription Type:** `Basic`
   - **Admin Name:** `Basic Admin`
   - **Admin Email:** `basicadmin@example.com`
   - **Admin Password:** `BasicAdmin@123`
3. Click **Create Organization**.

---

### B2. Org Admin First Login & DB Setup

Same as [A2](#a2-org-admin-first-login) and [A3](#a3-configure-tenant-database-org-admin) but for `basicadmin@example.com`.

After DB is configured, verify the org admin sidebar:

- [ ] **Dashboard**, **Access Control** (Roles & Permissions, Users), **Tenant Database**, **Monitoring** (All Submissions, Skill Submissions, Live Monitoring, Proctoring Agent, Behavior Analysis), **Analytics** (Analytics, Org Analytics), **System** (Audit Logs, Error Monitoring).
- [ ] Access Control → **Roles & Permissions** now shows a **Create Role** button (Basic includes `roles.create`).

> **Note:** The org admin portal still does not show exam creation options. Exam creation is done by role-based staff users via the Staff portal (`/role`).

---

### B3. Create Custom Roles

1. Click **Access Control → Roles & Permissions → Create Role**.
2. Create two roles:

**Role 1 — Content Creator (custom):**
- Name: `Content Creator (Custom)`
- Permissions: `tests.create`, `tests.view`, `tests.update`, `tests.assign`, `coding.create`, `coding.assign`, `aptitude.create`, `aptitude.assign`, `communication.create`, `communication.assign`

**Role 2 — Exam Evaluator:**
- Name: `Evaluator`
- Permissions: `coding.evaluate`, `communication.evaluate`, `aptitude.evaluate`, `submissions.view`, `submissions.manage`

3. Save both roles.

**Expected:**
- [ ] Roles appear in the Roles list alongside the system-seeded roles.
- [ ] Permissions shown match what was selected.

> **Tip:** You may also use the seeded "Content Creator" system role (which has the same test creation permissions) if you prefer not to create a custom role.

---

### B4. Create Staff Users and Assign Roles

1. Click **Access Control → Users → Create User**.
2. Create:

| Name | Email | Password | Role |
|------|-------|----------|------|
| Content Creator User | `creator@example.com` | `Creator@123` | Content Creator (Custom) |
| Evaluator User | `evaluator@example.com` | `Eval@123` | Evaluator |
| Basic Student | `basicstudent@example.com` | `Student@123` | Exam Taker |

---

### B5. Create Exam Content (as Content Creator)

1. Open incognito tab, navigate to `/login` and log in as `creator@example.com` with `Creator@123`.
2. You are prompted to **change your password** (first login). Set a new strong password.
3. You land on `/role` (Staff portal — role-based workspace).
4. Click **Content Management** to expand the group (collapsed by default). You should see: **Aptitude Tests**, **Global Complete Tests**, **Skill Tests**, **Communication Tests**.

**Create an Aptitude Test:**
1. Navigate to **Content Management → Aptitude Tests**.
2. Add 5 aptitude questions (numerical/logical).
3. Save and publish.

**Create a Coding Challenge:**
1. Navigate to **Content Management → Skill Tests**.
2. Add a problem with test cases.
3. Save and publish.

**Create a Communication Test:**
1. Navigate to **Content Management → Communication Tests**.
2. Add speaking/listening prompts.
3. Save.

**Assign exams to `basicstudent@example.com`:**
1. For each exam type created above, click **Assign** and assign to the student.

**Expected:**
- [ ] All three exam types created without errors.
- [ ] Assignment confirmation shown for each.

---

### B6. Student Takes All Three Exam Types

1. Incognito tab → navigate to `/login` and log in as `basicstudent@example.com` with `Student@123`.
2. You are prompted to **change your password** (first login). Set a new strong password.
3. Student portal opens; Learning and Progress groups expanded.
4. Take each assigned exam:
   - **Learning → Aptitude Tests** → take the aptitude test → submit.
   - **Learning → Skill Tests** → take the coding challenge → write code → run test cases → submit.
   - **Learning → Communication** → complete → submit.
5. Go to **Progress → My Submissions** — all three results should appear.

**Expected:**
- [ ] Each exam loads with correct content.
- [ ] Aptitude: score calculated immediately.
- [ ] Coding: test case pass/fail shown.
- [ ] Communication: submission recorded, awaiting evaluation.
- [ ] My Submissions panel shows all three entries.

---

### B7. Evaluator Reviews Submissions

1. Log in as `evaluator@example.com` with `Eval@123`. On first login you will be prompted to change your password. After changing it, you land on `/role`.
2. Navigate to **Monitoring → All Submissions** (or Skill Submissions).
3. Find the student's coding and communication submissions.
4. For coding: review code, override score if needed.
5. For communication: score each prompt, add comments, submit evaluation.

**Expected:**
- [ ] Evaluator can view all submissions.
- [ ] Can save evaluation/score.
- [ ] Student's result is updated after evaluation.

---

### B8. Analytics (Basic — View Only)

1. As org admin, navigate to **Analytics → Analytics**.
2. Verify dashboards load: exam completion rates, score distributions, user activity.
3. Look for an **Export** button — it should **NOT** be present on Basic.

**Expected:**
- [ ] Analytics page loads with charts.
- [ ] No Export button visible.

---

### B9. Proctoring (Basic — View Only)

1. As org admin, navigate to **Monitoring → Live Monitoring** or **Proctoring Agent**.
2. View the proctoring events/flags for the student exams taken above.
3. Look for **Override** or **Manage** buttons — they should **NOT** be present on Basic.

**Expected:**
- [ ] Proctoring log is visible.
- [ ] No override/manage controls shown.

---

## Tier C — Pro Workflow

### C1. Create a Pro Organization

1. Super admin → **Organizations → Create Organization**.
2. Fill in:
   - **Org Name:** `Test Pro Org`
   - **Org Code:** `test-pro`
   - **Subscription Type:** `Pro`
   - **Admin Name:** `Pro Admin`
   - **Admin Email:** `proadmin@example.com`
   - **Admin Password:** `ProAdmin@123`
3. Click **Create Organization**.

---

### C2. Org Admin First Login & DB Setup

Same flow as before for `proadmin@example.com`. After DB setup, verify:

- [ ] Sidebar same as Basic (Dashboard, Access Control, Tenant Database, Monitoring, Analytics, System).
- [ ] Analytics export and proctoring override/manage are enabled — verify in C4 and C5.

---

### C3. Repeat B3–B7 for Pro

Perform all the same steps as Tier B (create roles, users, exams, assign, student takes exams, evaluator grades) — these all work the same. Then verify the **Pro-exclusive** features below.

---

### C4. Analytics Export (Pro Only)

1. As org admin navigate to **Analytics → Analytics**.
2. Verify an **Export** button is present.
3. Click Export — a CSV/Excel file should download.

**Expected:**
- [ ] Export button visible (not present in Basic/Free Trial).
- [ ] File downloads successfully with correct data.

---

### C5. Proctoring Override & Management (Pro Only)

1. Navigate to **Monitoring → Live Monitoring** or **Proctoring Agent**.
2. Find a flagged proctoring event from a student exam.
3. Click **Override** — should allow marking the flag as reviewed/cleared.
4. Click **Manage** — should allow configuring proctoring rules (camera thresholds, tab-switch limits, etc.).

**Expected:**
- [ ] Override and Manage buttons visible (not present in Basic/Free Trial).
- [ ] Override action saves successfully.
- [ ] Manage settings page loads and changes can be saved.

---

### C6. Full Permission Matrix Verification (Pro)

As a Pro org admin, verify every sidebar section is accessible and role-based users can use all create/evaluate features:

- [ ] Users — Create / View (org admin portal)
- [ ] Roles — Create / View / Update / Delete (org admin portal)
- [ ] Tests (MCQ) — Create / Assign (Staff portal, Content Creator role)
- [ ] Skill (Coding) — Create / Assign / Evaluate
- [ ] Aptitude — Create / Assign / Evaluate
- [ ] Communication — Create / Assign / Evaluate
- [ ] Analytics — View + Export
- [ ] Proctoring — View + Override + Manage
- [ ] Submissions — View + Manage

---

## Cross-Tier Checks

These checks should be run after all three tiers are tested.

### Isolation Check

- [ ] Org `test-ft` data (users, exams, results) is NOT visible when logged in to `test-basic` or `test-pro` admin portals.
- [ ] Student from `test-ft` cannot login and see exams from `test-basic`.

### Permission Boundary Check

| Action | Free Trial | Basic | Pro |
|--------|-----------|-------|-----|
| Create user (org admin) | Should work (`users.create` in Free Trial) | Should work | Should work |
| Create MCQ test (Content Creator staff user) | Should work | Should work | Should work |
| Create Coding/Aptitude exam (Content Creator) | Should fail / hidden | Should work | Should work |
| Export analytics | Should fail / hidden | Should fail / hidden | Should work |
| Proctoring override | Should fail / hidden | Should fail / hidden | Should work |
| Assign MCQ test | Should work (`tests.assign` in Free Trial) | Should work | Should work |
| Create custom role (org admin) | Should fail / hidden (no Create button) | Should work | Should work |

### Session & Auth Checks

- [ ] Logging out clears session (cannot navigate back to `/admin` or `/student`).
- [ ] Refreshing the page keeps the user logged in (session persists via localStorage).
- [ ] Super admin session does not leak into org admin pages.

### Student Portal UX

- [ ] Learning and Progress nav groups are **expanded by default** on first load (not collapsed).
- [ ] Navigating between sections preserves the student session.
- [ ] "My Submissions" (Progress group) shows only the current student's own results.

---

## Bug Reporting Checklist

When you find an issue, include the following in your report:

1. **Tier** — Free Trial / Basic / Pro
2. **User role** — super admin / org admin / staff (role name) / student
3. **URL** — the exact page path where the issue occurred
4. **Steps to reproduce** — numbered steps starting from login
5. **Expected behavior** — what should have happened
6. **Actual behavior** — what actually happened
7. **Console errors** — copy any red errors from DevTools → Console
8. **Screenshot or screen recording** — attach if possible

---

*Guide version: 2.0 — updated to reflect actual portal structure: org admin portal handles access control only; exam creation is role-based via staff portal (`/role`). Free Trial seeds Content Creator and Exam Taker roles automatically.*
