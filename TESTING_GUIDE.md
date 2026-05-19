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
| User management (create / update / delete users) | ✗ | ✓ | ✓ |
| Role management (create / update custom roles) | ✗ | ✓ | ✓ |
| Create Tests / Question banks | ✓ (tests only) | ✓ | ✓ |
| Create Coding / Aptitude / Communication exams | ✗ | ✓ | ✓ |
| Assign exams to users | ✗ | ✓ | ✓ |
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

- [ ] Sidebar shows: Organizations, Platform Health, Users (platform level), Audit Logs.
- [ ] No "Create Organization" form shows DB URL or secret ref fields — only: Org Name, Org Code, Subscription Type, Admin Name, Admin Email, Admin Password.
- [ ] Platform Health page loads without errors.

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
- [ ] Sidebar shows sections appropriate for Free Trial: no "User Management" or "Role Management" links visible (those permissions are not granted under Free Trial).
- [ ] Welcome banner shows role name and "Use the sidebar to navigate".

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

### A4. Verify Free Trial Permission Limits (Org Admin)

Back in the org admin portal:

- [ ] **Users section is NOT in the sidebar** (no `users.create` or `users.view` — those are blocked for Free Trial).
- [ ] **Roles section is NOT in the sidebar**.
- [ ] **Analytics** link IS present (view only).
- [ ] **Proctoring** link IS present (view only — no override/manage buttons).

> **Bug to look for:** If user management or role management appears for Free Trial, that is a permissions leak. Report it.

---

### A5. Add a Student Manually via Super Admin

Since the Free Trial org admin cannot create users, a super admin must seed test users.

1. Go back to the **super admin** tab.
2. Navigate to **Organizations → Users** (select `Test FT Org` from the org picker).
3. Create a student user:
   - **Name:** `FT Student`
   - **Email:** `ftstudent@example.com`
   - **Password:** `Student@123`
   - **Role:** `student` / `learner`
4. Save.

---

### A6. Attempt an Exam as Student (Free Trial)

1. Open another incognito tab, login as `ftstudent@example.com`.
2. You land on `/student` (Student Portal).
3. Verify the sidebar shows **Learning** and **Progress** groups expanded by default.
4. Click **Assigned Tests** — the list may be empty if no exam has been assigned yet.

**Create & Assign a Test (super admin does this for Free Trial):**

1. In the super admin portal, go to `Test FT Org` → **Tests → Create Test**.
2. Create a short test (2–3 MCQ questions).
3. Go to **Tests → Assign** and assign it to `ftstudent@example.com`.

**Student takes the exam:**

1. Refresh the student portal.
2. The assigned test should appear under **Assigned Tests**.
3. Click **Start Test**.
4. Complete the questions and submit.
5. Navigate to **My Results** — the result should appear.

**Expected:**
- [ ] Test loads and questions are visible.
- [ ] Submit works without errors.
- [ ] Result is visible under My Results with score.

---

### A7. Free Trial Blocked Actions

Verify the following actions are blocked (should show 403 or "permission denied"):

- [ ] Org admin tries to create a new user → action button should not exist or returns error.
- [ ] Org admin tries to create a new role → action button should not exist or returns error.
- [ ] Org admin tries to assign an exam → no assign option visible.
- [ ] Org admin tries to create a coding/aptitude/communication exam → those exam types should not be creatable.

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

After DB is configured:

- [ ] Sidebar now shows **Users**, **Roles**, **Tests**, **Coding**, **Aptitude**, **Communication**, **Analytics**, **Proctoring**, **Submissions**.

---

### B3. Create Custom Roles

1. Click **Roles → Create Role**.
2. Create two roles:

**Role 1 — Content Creator:**
- Name: `Content Creator`
- Permissions: `tests.create`, `tests.view`, `tests.update`, `coding.create`, `coding.assign`, `aptitude.create`, `aptitude.assign`, `communication.create`, `communication.assign`

**Role 2 — Exam Evaluator:**
- Name: `Evaluator`
- Permissions: `coding.evaluate`, `communication.evaluate`, `aptitude.evaluate`, `submissions.view`, `submissions.manage`

3. Save both roles.

**Expected:**
- [ ] Roles appear in the Roles list.
- [ ] Permissions shown match what was selected.

---

### B4. Create Staff Users and Assign Roles

1. Click **Users → Create User**.
2. Create:

| Name | Email | Password | Role Assignment |
|------|-------|----------|-----------------|
| Content Creator User | `creator@example.com` | `Creator@123` | Content Creator |
| Evaluator User | `evaluator@example.com` | `Eval@123` | Evaluator |
| Basic Student | `basicstudent@example.com` | `Student@123` | Exam Taker / learner |

3. Assign the custom roles during user creation or via the role assignment panel.

---

### B5. Create Exam Content (as Content Creator)

1. Open incognito tab, login as `creator@example.com`.
2. You land on `/role` (role-based staff workspace).
3. Verify the welcome banner shows "Content Creator" role name.
4. Sidebar should show only the sections permitted by Content Creator permissions.

**Create an Aptitude Test:**
1. Navigate to **Aptitude → Create**.
2. Add 5 aptitude questions (numerical/logical).
3. Save and publish.

**Create a Coding Challenge:**
1. Navigate to **Coding → Create**.
2. Add a problem with test cases.
3. Save and publish.

**Create a Communication Test:**
1. Navigate to **Communication → Create**.
2. Add speaking/listening prompts.
3. Save.

**Assign exams to `basicstudent@example.com`:**
1. For each exam type created above, go to **Assign** and assign to the student.

**Expected:**
- [ ] All three exam types created without errors.
- [ ] Assignment confirmation shown for each.

---

### B6. Student Takes All Three Exam Types

1. Incognito tab → login as `basicstudent@example.com`.
2. Student portal opens, Learning and Progress groups expanded.
3. Take each assigned exam:
   - **Assigned Tests** → take the aptitude test → submit.
   - **Assigned Tests** → take the coding challenge → write code → run test cases → submit.
   - **Assigned Tests** → take the communication test → complete → submit.
4. Go to **My Results** — all three results should appear.

**Expected:**
- [ ] Each exam loads with correct content.
- [ ] Aptitude: score calculated immediately.
- [ ] Coding: test case pass/fail shown.
- [ ] Communication: submission recorded, awaiting evaluation.
- [ ] Results panel shows all three entries.

---

### B7. Evaluator Reviews Submissions

1. Login as `evaluator@example.com`.
2. Navigate to **Submissions**.
3. Find the student's coding and communication submissions.
4. For coding: review code, override score if needed.
5. For communication: score each prompt, add comments, submit evaluation.

**Expected:**
- [ ] Evaluator can view all submissions.
- [ ] Can save evaluation/score.
- [ ] Student's result is updated after evaluation.

---

### B8. Analytics (Basic — View Only)

1. As org admin, navigate to **Analytics**.
2. Verify dashboards load: exam completion rates, score distributions, user activity.
3. Look for an **Export** button — it should **NOT** be present on Basic.

**Expected:**
- [ ] Analytics page loads with charts.
- [ ] No Export button visible.

---

### B9. Proctoring (Basic — View Only)

1. As org admin, navigate to **Proctoring**.
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

Same flow as before for `proadmin@example.com`. After DB setup:

- [ ] Sidebar shows all sections including Analytics Export, Proctoring with manage controls.

---

### C3. Repeat B3–B7 for Pro

Perform all the same steps as Tier B (create roles, users, exams, assign, student takes exams, evaluator grades) — these all work the same. Then verify the **Pro-exclusive** features below.

---

### C4. Analytics Export (Pro Only)

1. As org admin navigate to **Analytics**.
2. Verify an **Export** button is present.
3. Click Export — a CSV/Excel file should download.

**Expected:**
- [ ] Export button visible (not present in Basic/Free Trial).
- [ ] File downloads successfully with correct data.

---

### C5. Proctoring Override & Management (Pro Only)

1. Navigate to **Proctoring**.
2. Find a flagged proctoring event from a student exam.
3. Click **Override** — should allow marking the flag as reviewed/cleared.
4. Click **Manage** — should allow configuring proctoring rules (camera thresholds, tab-switch limits, etc.).

**Expected:**
- [ ] Override and Manage buttons visible (not present in Basic/Free Trial).
- [ ] Override action saves successfully.
- [ ] Manage settings page loads and changes can be saved.

---

### C6. Full Permission Matrix Verification (Pro)

As a Pro org admin, verify every sidebar section is accessible:

- [ ] Users — Create / View / Update / Delete
- [ ] Roles — Create / View / Update / Delete
- [ ] Tests — Create / View / Update / Delete / Assign
- [ ] Coding — Create / Assign / Evaluate
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
| Create user via org admin | Should fail / hidden | Should work | Should work |
| Export analytics | Should fail / hidden | Should fail / hidden | Should work |
| Proctoring override | Should fail / hidden | Should fail / hidden | Should work |
| Assign exam | Should fail / hidden | Should work | Should work |

### Session & Auth Checks

- [ ] Logging out clears session (cannot navigate back to `/admin` or `/student`).
- [ ] Refreshing the page keeps the user logged in (session persists via localStorage).
- [ ] Super admin session does not leak into org admin pages.

### Student Portal UX

- [ ] Learning and Progress nav groups are **expanded by default** on first load (not collapsed).
- [ ] Navigating between sections preserves the student session.
- [ ] "My Results" shows only the current student's own results.

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

*Guide version: 1.0 — matches commit `2b94824` (feat: move tenant DB config to org admin and remove secret refs)*
