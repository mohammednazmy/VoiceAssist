# Admin Feature Parity Matrix

This document inventories the current admin/backend endpoints, compares them to the admin panel's expectations, and tracks implementation status.

## Backend API Structure

The backend API is located in `services/api-gateway/app/api/`. Key admin-related modules:

- **auth.py** - Authentication endpoints (`/api/auth/*`)
- **admin_panel.py** - Admin panel management (`/api/admin/panel/*`)
- **admin_kb.py** - Knowledge base admin (`/api/admin/kb/*`)
- **admin_cache.py** - Cache management (`/api/admin/cache/*`)
- **admin_feature_flags.py** - Feature flags (`/api/admin/feature-flags/*`)
- **users.py** - User management (`/api/users/*`)

## Endpoint Inventory

### Authentication (`/api/auth`)

| Endpoint             | Method | Status         | Description                    |
| -------------------- | ------ | -------------- | ------------------------------ |
| `/api/auth/register` | POST   | ✅ Implemented | User registration              |
| `/api/auth/login`    | POST   | ✅ Implemented | User login, returns JWT tokens |
| `/api/auth/refresh`  | POST   | ✅ Implemented | Refresh access token           |
| `/api/auth/logout`   | POST   | ✅ Implemented | Logout and revoke tokens       |
| `/api/auth/me`       | GET    | ✅ Implemented | Get current user info          |

### Admin Panel (`/api/admin/panel`)

| Endpoint                                   | Method | Status         | Description                 |
| ------------------------------------------ | ------ | -------------- | --------------------------- |
| `/api/admin/panel/summary`                 | GET    | ✅ Implemented | Dashboard metrics summary   |
| `/api/admin/panel/websocket-status`        | GET    | ✅ Implemented | WebSocket connection status |
| `/api/admin/panel/users`                   | GET    | ✅ Implemented | List users with pagination  |
| `/api/admin/panel/users/{id}`              | GET    | ✅ Implemented | Get user details            |
| `/api/admin/panel/users/{id}`              | PUT    | ✅ Implemented | Update user                 |
| `/api/admin/panel/users/{id}`              | DELETE | ✅ Implemented | Delete user                 |
| `/api/admin/panel/users/{id}/role-history` | GET    | ✅ Implemented | User role change history    |
| `/api/admin/panel/users/{id}/lock-reasons` | GET    | ✅ Implemented | Account lock reasons        |
| `/api/admin/panel/metrics`                 | GET    | ✅ Implemented | System metrics              |
| `/api/admin/panel/audit-logs`              | GET    | ✅ Implemented | Audit log entries           |
| `/api/admin/panel/audit-logs/export`       | GET    | ✅ Implemented | Export audit logs as CSV    |

### Knowledge Base Admin (`/api/admin/kb`)

| Endpoint                       | Method | Status         | Description                               |
| ------------------------------ | ------ | -------------- | ----------------------------------------- |
| `/api/admin/kb/documents`      | GET    | ✅ Implemented | List KB documents                         |
| `/api/admin/kb/documents`      | POST   | ✅ Implemented | Upload document                           |
| `/api/admin/kb/documents/{id}` | GET    | ✅ Implemented | Get document details                      |
| `/api/admin/kb/documents/{id}` | DELETE | ✅ Implemented | Delete document                           |
| `/api/admin/kb/jobs`           | GET    | ⚠️ Partial     | Indexing job status (via document status) |

### Cache Management (`/api/admin/cache`)

| Endpoint                      | Method | Status         | Description               |
| ----------------------------- | ------ | -------------- | ------------------------- |
| `/api/admin/cache/stats`      | GET    | ✅ Implemented | Cache statistics          |
| `/api/admin/cache/clear`      | POST   | ✅ Implemented | Clear cache               |
| `/api/admin/cache/invalidate` | POST   | ✅ Implemented | Invalidate cache patterns |

### Feature Flags (`/api/admin/feature-flags`)

| Endpoint                                 | Method | Status         | Description      |
| ---------------------------------------- | ------ | -------------- | ---------------- |
| `/api/admin/feature-flags`               | GET    | ✅ Implemented | List all flags   |
| `/api/admin/feature-flags/{name}`        | GET    | ✅ Implemented | Get flag details |
| `/api/admin/feature-flags`               | POST   | ✅ Implemented | Create flag      |
| `/api/admin/feature-flags/{name}`        | PATCH  | ✅ Implemented | Update flag      |
| `/api/admin/feature-flags/{name}`        | DELETE | ✅ Implemented | Delete flag      |
| `/api/admin/feature-flags/{name}/toggle` | POST   | ✅ Implemented | Toggle flag      |

### User Management (`/api/users`)

| Endpoint                        | Method | Status         | Description         |
| ------------------------------- | ------ | -------------- | ------------------- |
| `/api/users/me`                 | GET    | ✅ Implemented | Get current user    |
| `/api/users/me`                 | PUT    | ✅ Implemented | Update current user |
| `/api/users/me/change-password` | POST   | ✅ Implemented | Change password     |
| `/api/users/me`                 | DELETE | ✅ Implemented | Delete account      |
| `/api/users`                    | GET    | ✅ Implemented | List users (admin)  |
| `/api/users/{id}`               | GET    | ✅ Implemented | Get user by ID      |
| `/api/users/{id}`               | PATCH  | ✅ Implemented | Update user         |
| `/api/users/{id}/activate`      | PUT    | ✅ Implemented | Activate user       |
| `/api/users/{id}/deactivate`    | PUT    | ✅ Implemented | Deactivate user     |
| `/api/users/{id}/promote-admin` | PUT    | ✅ Implemented | Promote to admin    |
| `/api/users/{id}/revoke-admin`  | PUT    | ✅ Implemented | Revoke admin        |

## Frontend-Backend Alignment

### Admin Panel Pages

| Page           | Backend Support | Notes                                        |
| -------------- | --------------- | -------------------------------------------- |
| Login          | ✅ Full         | Auth endpoints complete                      |
| Dashboard      | ✅ Full         | Summary, metrics, health endpoints available |
| Users          | ✅ Full         | CRUD, role history, lock reasons, pagination |
| Knowledge Base | ✅ Full         | Document CRUD, audit trails                  |
| Analytics      | ✅ Full         | Metrics and audit log export                 |
| System         | ✅ Full         | Feature flags, cache management              |

### Known Gaps

1. **KB Indexing Jobs** - The `/api/admin/kb/jobs` endpoint is not fully implemented as a separate route. Job status is tracked per-document.

2. **Analytics Trends** - Specific analytics trend endpoints (`/api/admin/analytics/trends`) are not implemented; analytics data comes from the audit logs.

## Role-Based Access Control

The admin panel supports three roles:

| Role         | Access Level                              |
| ------------ | ----------------------------------------- |
| `viewer`     | Read-only access to dashboard, users, KB  |
| `admin`      | Full CRUD on users and KB, metrics access |
| `superadmin` | All admin permissions plus system config  |

## Recent Updates

- **PR 106-122**: Added admin roles, audit logging, pagination, rate limiting
- **PR 107**: WebSocket auth now validates user active status
- **PR 109**: User pagination with offset/limit support
- **PR 122**: Admin audit log service for privileged actions

---

_Last updated: 2025-11-27_
