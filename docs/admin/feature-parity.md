# Admin Feature Parity Matrix

This document inventories the current admin/backend endpoints, compares them to the admin panel's expectations, and highlights missing or drifting contracts. Sources reviewed include the backend admin routes in `server/app/api`, admin services, the admin-panel guide, and the frontend API usages.

## Backend inventory (server)

- Knowledge Base: GET `/api/admin/kb/documents`, POST `/api/admin/kb/documents`, POST `/api/admin/kb/documents/preflight`, POST `/api/admin/kb/documents/batch`, GET `/api/admin/kb/documents/{doc_id}/audit`.【F:server/app/api/admin.py†L47-L151】
- Health: GET `/health` and GET `/ready` probes.【F:server/app/api/health.py†L10-L27】
- No authentication or admin summary/user/analytics/system endpoints exist yet (admin router notes auth will be added later).【F:server/app/api/admin.py†L7-L11】

## Frontend expectations (admin panel)

Key expectations from the guide and current React code:

- Auth: POST `/api/auth/login`, GET `/api/auth/me` per the guide; React AuthContext calls `apiClient.login`, `getCurrentUser`, and token refresh flows requiring these endpoints.【F:apps/admin-panel/ADMIN_PANEL_GUIDE.md†L147-L239】【F:apps/admin-panel/src/contexts/AuthContext.tsx†L104-L207】
- Dashboard summary: hooks call GET `/api/admin/panel/summary` plus `/health` for service health and metrics.【F:apps/admin-panel/src/hooks/useAdminSummary.ts†L17-L49】【F:apps/admin-panel/src/hooks/useMetrics.ts†L67-L189】
- User management: UsersPage fetches `/api/admin/panel/users`, per-user role history, lock reasons, PUT updates, and audit CSV export at `/api/admin/panel/audit-logs/export`.【F:apps/admin-panel/src/pages/UsersPage.tsx†L68-L223】
- Knowledge base: hooks/components call `/api/admin/kb/documents`, `/api/admin/kb/jobs`, and `/api/admin/kb/documents/{id}/audit`.【F:apps/admin-panel/src/hooks/useKnowledgeDocuments.ts†L23-L73】【F:apps/admin-panel/src/hooks/useIndexingJobs.ts†L22-L62】【F:apps/admin-panel/src/components/knowledge/AuditDrawer.tsx†L24-L108】
- Analytics: AnalyticsPage calls `/api/admin/analytics/queries`, `/response-times`, `/trends`, and `/analytics/export` based on the selected range.【F:apps/admin-panel/src/pages/AnalyticsPage.tsx†L47-L97】
- System configuration UI is present but currently local-only (no API calls), so it relies on future config endpoints to persist settings.【F:apps/admin-panel/src/pages/SystemPage.tsx†L1-L82】

## Contract matrix

| Priority | Feature | Backend implementation | Frontend usage | Parity / gaps |
| --- | --- | --- | --- | --- |
| P0 | Auth & session | No auth routes implemented; admin router comments that auth will be added later.【F:server/app/api/admin.py†L7-L11】 | AuthContext relies on login, refresh, and `/api/auth/me` to populate admin sessions.【F:apps/admin-panel/ADMIN_PANEL_GUIDE.md†L147-L239】【F:apps/admin-panel/src/contexts/AuthContext.tsx†L104-L207】 | **Blocking** – authentication endpoints are missing, so admin login/refresh cannot function. |
| P1 | Dashboard summary | No `/api/admin/panel/summary` route; only `/health` exists.【F:server/app/api/health.py†L10-L27】 | useAdminSummary/useMetrics fetch `/api/admin/panel/summary` and `/health` for metrics and health cards.【F:apps/admin-panel/src/hooks/useAdminSummary.ts†L17-L49】【F:apps/admin-panel/src/hooks/useMetrics.ts†L67-L189】 | **Blocking** – metrics card data absent; health probe partially satisfied via `/health`. |
| P2 | User management | No `/api/admin/panel/users` CRUD, role-history, lock-reasons, or audit export endpoints in backend. | UsersPage depends on list, update (PUT), role history, lock reasons, and audit CSV export endpoints.【F:apps/admin-panel/src/pages/UsersPage.tsx†L68-L223】 | **Blocking** – user list/actions/audit export unsupported. |
| P3 | Knowledge base docs | CRUD/list/audit routes for documents exist; batch and upload implemented.【F:server/app/api/admin.py†L47-L151】 | UI lists documents and audit trails via `/kb/documents` and `/kb/documents/{id}/audit`.【F:apps/admin-panel/src/hooks/useKnowledgeDocuments.ts†L23-L73】【F:apps/admin-panel/src/components/knowledge/AuditDrawer.tsx†L24-L108】 | **Partial** – list/audit align; upload/batch exist; no `/kb/jobs` implementation for indexing status. |
| P4 | Knowledge base indexing jobs | No `/api/admin/kb/jobs` route implemented. | useIndexingJobs expects `/api/admin/kb/jobs` for job monitoring.【F:apps/admin-panel/src/hooks/useIndexingJobs.ts†L22-L62】 | **Blocking** – indexing job list missing. |
| P5 | Analytics & logs | No analytics or audit-export endpoints exist. | AnalyticsPage calls `/api/admin/analytics/*` and export; UsersPage calls `/api/admin/panel/audit-logs/export`.【F:apps/admin-panel/src/pages/AnalyticsPage.tsx†L47-L97】【F:apps/admin-panel/src/pages/UsersPage.tsx†L200-L223】 | **Blocking** – analytics dashboards and audit CSV export unsupported. |
| P6 | System configuration & integrations | No config/feature-flag endpoints exist. | SystemPage presents config UI but stores values locally only.【F:apps/admin-panel/src/pages/SystemPage.tsx†L1-L82】 | **Gapped** – UI lacks persistence/API backing for environment, DB/Redis settings, and feature flags described in the guide.【F:apps/admin-panel/ADMIN_PANEL_GUIDE.md†L38-L48】 |

### Mismatch summary

- Highest-priority gaps: missing auth/session endpoints, dashboard summary metrics, user management APIs, and KB indexing jobs prevent the admin panel from functioning beyond static KB lists.
- Secondary gaps: analytics/log export endpoints and system configuration/integration APIs are absent, leaving those UI areas non-functional or placeholder-only.
- Implemented alignment: KB document listing/upload/batch/audit routes are present and correspond to the frontend list/audit flows.

### Recommended sequencing (critical → lower)

1. Implement auth (`/api/auth/login`, `/api/auth/me`, refresh) to unblock sessions.
2. Add dashboard summary `/api/admin/panel/summary` returning user/metric counts alongside health integration.
3. Build `/api/admin/panel/users` list/update plus role history/lock reasons and audit export.
4. Provide `/api/admin/kb/jobs` for indexing status to complete KB parity.
5. Deliver analytics `/api/admin/analytics/*` and audit log export.
6. Add system config/feature-flag endpoints to persist settings surfaced in SystemPage.
