# Use Case to API Permission Matrix

This document maps business use cases to concrete API endpoints, required headers, permission checks, and expected outcomes for the multi-tenant RBAC architecture.

## 1) Header and Identity Rules
- `x-user-id`: required for privileged operations (super admin / org admin / org users)
- `x-org-id`: required for tenant-scoped operations (except platform-level APIs)
- Auth middleware + tenant middleware enforce organization isolation and activation status.

## 2) Permission Key Catalog
- `users.create`, `users.view`, `users.update`, `users.delete`
- `roles.create`, `roles.view`, `roles.update`, `roles.delete`
- `tests.create`, `tests.view`, `tests.update`, `tests.delete`, `tests.assign`
- `coding.create`, `coding.assign`, `coding.evaluate`
- `communication.create`, `communication.assign`, `communication.evaluate`
- `aptitude.create`, `aptitude.assign`, `aptitude.evaluate`
- `analytics.view`, `analytics.export`
- `proctoring.view`, `proctoring.override`

## 3) Use Case Matrix

| UC ID | Use Case | Endpoint(s) | Method | Required Actor | Required Permission / Role | Required Headers | Success | Common Errors |
|---|---|---|---|---|---|---|---|---|
| UC-01 | Create Organization with tenant DB URL | `/api/platform/organizations` | `POST` | Platform Super Admin | `users.role == admin` | `x-user-id` | Org + org admin created; tenant bootstrap complete | `400` invalid db URL/privilege/bootstrap, `403` not super admin, `409` duplicate org/email |
| UC-02 | List Organizations | `/api/platform/organizations` | `GET` | Platform Super Admin | `users.role == admin` | `x-user-id` | Org list returned | `403` not super admin |
| UC-03 | Activate/Deactivate Organization | `/api/platform/organizations/{org_id}/status` | `PATCH` | Platform Super Admin | `users.role == admin` | `x-user-id` | Status updated | `403` not super admin, `404` org missing |
| UC-04 | Get Permission Catalog | `/api/rbac/permissions` | `GET` | Any authenticated UI context | none | none | Permission map returned | - |
| UC-05 | Create Role | `/api/orgs/{org_id}/roles` | `POST` | Org Admin / Authorized Org User / Super Admin | `roles.create` or super admin | `x-user-id`, `x-org-id` (recommended) | Role created | `401` missing actor, `403` denied |
| UC-06 | List Roles | `/api/orgs/{org_id}/roles` | `GET` | Org Admin / Authorized Org User / Super Admin | `roles.view` or super admin | `x-user-id`, `x-org-id` (recommended) | Role list with permissions | `401`, `403` |
| UC-07 | Create Organization User | `/api/orgs/{org_id}/users` | `POST` | Org Admin / Authorized Org User / Super Admin | `users.create` or super admin | `x-user-id`, `x-org-id` (recommended) | User + assignment + tenant mirror + email | `400` tenant db missing, `403`, `404` role missing, `409` email exists |
| UC-08 | List Organization Users | `/api/orgs/{org_id}/users` | `GET` | Org Admin / Authorized Org User / Super Admin | `users.view` or super admin | `x-user-id`, `x-org-id` (recommended) | Org users with role mapping | `401`, `403` |
| UC-09 | Login (password) | `/api/auth/login` | `POST` | Any provisioned user | valid credentials | none | user payload + RBAC context | `401` invalid creds, inactive org blocked |
| UC-10 | Login (Google) | `/api/auth/google` | `POST` | Any provisioned user | valid Google token + allowed email | none | user payload + RBAC context | `401` invalid auth, inactive org blocked |
| UC-11 | Verify Login Session | `/api/auth/verify` | `POST` | Logged-in user | token/session valid | optional `x-user-id`, `x-org-id` | session valid + user data | `401` invalid token, inactive org blocked |
| UC-12 | Tenant Runtime Isolation | Any tenant API after middleware | any | Any org user | org matches user context and org active | `x-user-id`, `x-org-id` | request routed to tenant DB | `403` org mismatch/inactive |
| UC-13 | Dynamic Menu Visibility | N/A (frontend behavior using auth payload) | N/A | Any logged-in user | permissions from auth payload | N/A | only authorized modules/actions shown | N/A |
| UC-14 | Assign Tests to specific users | module routes (existing test APIs) | `POST/PUT` | Authorized Org User/Admin | typically `tests.assign` | `x-user-id`, `x-org-id` | assignment persisted + notification | `403` denied |
| UC-15 | Create Tests | module routes (existing test APIs) | `POST` | Authorized Org User/Admin | `tests.create` or module-specific create perms | `x-user-id`, `x-org-id` | test created | `403` denied |
| UC-16 | View Analytics/Reports | module routes (existing analytics APIs) | `GET` | Authorized Org User/Admin | `analytics.view` | `x-user-id`, `x-org-id` | analytics returned | `403` denied |

## 4) Key Request/Response Contracts

### 4.1 Create Organization
Endpoint: `POST /api/platform/organizations`

Request body:
```json
{
  "name": "Acme Institute",
  "code": "acme-inst",
  "type": "institutional",
  "dbUrl": "mysql://user:pass@host:4000/acme_tenant",
  "adminName": "Org Head",
  "adminEmail": "head@acme.com",
  "adminPassword": "TempStrong#123"
}
```

Success response:
```json
{
  "success": true,
  "organizationId": "...",
  "organizationAdminId": "orgadmin-...",
  "tenantSchema": {
    "created": 176,
    "existing": 0
  }
}
```

### 4.2 Create Role
Endpoint: `POST /api/orgs/{org_id}/roles`

Request body:
```json
{
  "name": "Faculty Manager",
  "description": "Can create and assign tests",
  "permissions": [
    "tests.create",
    "tests.assign",
    "tests.view",
    "analytics.view"
  ]
}
```

### 4.3 Create User
Endpoint: `POST /api/orgs/{org_id}/users`

Request body:
```json
{
  "name": "Jane Doe",
  "email": "jane@acme.com",
  "password": "Temp#Pass123",
  "roleId": "<role-uuid>",
  "phone": "9999999999",
  "batch": "2026"
}
```

## 5) Middleware and Enforcement Mapping
- Tenant context resolver (`main.py` middleware):
  - reads `x-org-id`/`x-user-id`
  - validates org ownership for user
  - blocks inactive org
  - switches DB pool to tenant DB for tenant routes

- Auth route guard (`routes/auth.py`):
  - on login/verify, checks org active state
  - attaches role and permission set into auth response payload

- RBAC route guards (`routes/rbac.py`):
  - super admin checks for platform operations
  - permission checks via `user_role_assignments` + `role_permissions`

## 6) Error Message Matrix

| Condition | Status | Error Detail (typical) |
|---|---|---|
| Missing/invalid tenant DB URL | `400` | `Invalid DB URL format` |
| System schema used (`sys/mysql/...`) | `400` | `Database '<name>' is a system schema; use a dedicated app database` |
| No DDL privilege for tenant bootstrap | `400` | `Tenant DB user does not have CREATE/DROP privilege required for bootstrap` |
| Org inactive at login/runtime | `403` | `Organization is inactive. Contact the super admin.` |
| Unauthorized platform operation | `403` | `Only platform super admin can ...` |
| Missing actor header | `401` | `Missing actor identity` |
| Permission missing | `403` | `Permission denied` |
| Duplicate user/org code | `409` | `... already exists` |

## 7) Test Scenarios (API-level)
1. Super admin creates org with valid dedicated DB URL -> expect `200` and tenant schema stats.
2. Super admin uses `sys` DB URL -> expect `400` with system schema message.
3. Super admin uses tenant user without CREATE privilege -> expect `400` with privilege message.
4. Org admin creates role with granular permissions -> expect `200` and role id.
5. Org admin creates user and role assignment -> expect `200`, user mirrored to tenant DB.
6. Deactivate org, then login with org user -> expect block with inactive org message.
7. User without `roles.create` hits role create API -> expect `403`.
8. User with `users.view` only should list users but fail create user.

## 8) Suggested Implementation Notes
- Keep `DATABASE_URL` (primary) on dedicated app DB (e.g., `mentor_hub`), never `sys`.
- Keep per-tenant `dbUrl` dedicated and isolated.
- Maintain env-driven super admin seed passwords.
- Ensure SMTP credentials are valid for production email delivery.
