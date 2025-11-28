---
title: Admin Panel Implementation Plan
slug: admin/implementation-plan
summary: Comprehensive implementation plan for making admin.asimo.io the canonical operational mission control for VoiceAssist.
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience: ["human", "agent", "ai-agents", "frontend", "backend", "devops"]
tags: ["admin", "implementation", "plan", "roadmap"]
relatedServices: ["api-gateway", "admin-panel"]
category: admin
source_of_truth: true
version: "2.0.0"
---

# Admin Panel Implementation Plan

**Last Updated:** 2025-11-27
**Version:** 2.0.0
**Status:** Canonical Implementation Guide
**Purpose:** Transform admin.asimo.io into the definitive operational mission control for VoiceAssist

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Admin Panel Tech Stack (Ground Truth)](#admin-panel-tech-stack-ground-truth)
3. [Phase 1: Backend-to-Admin Service Matrix](#phase-1-backend-to-admin-service-matrix)
4. [Phase 2: Admin API Enhancement Plan](#phase-2-admin-api-enhancement-plan)
5. [Phase 3: Admin Panel UI Implementation](#phase-3-admin-panel-ui-implementation)
6. [Phase 4: API Client Integration](#phase-4-api-client-integration)
7. [Phase 5: Security & Compliance](#phase-5-security--compliance)
8. [Phase 6: Testing Strategy](#phase-6-testing-strategy)
9. [Phase 7: Deployment & Rollout](#phase-7-deployment--rollout)
10. [Relationship to Phase Documents](#relationship-to-phase-documents)
11. [Using this Plan as an AI Agent](#using-this-plan-as-an-ai-agent)
12. [Implementation Roadmap](#implementation-roadmap)
13. [Related Documentation](#related-documentation)

---

## Executive Summary

This document provides a repo-aware, implementation-ready plan for completing the VoiceAssist Admin Panel. The goal is to ensure every meaningful backend service has a proper admin surface with status/health, configuration, analytics, and operational controls.

### Current State

Based on analysis of the actual codebase:

- **Backend**: `services/api-gateway/` - 21 API modules, 40+ services, production-ready
- **Admin Panel**: `apps/admin-panel/` - 5 pages implemented (Dashboard, Users, KB, Analytics, System) + Login
- **Admin API Endpoints**: 4 dedicated modules (`admin_panel.py`, `admin_kb.py`, `admin_feature_flags.py`, `admin_cache.py`)
- **Shared Packages**: 7 packages in `packages/` including `@voiceassist/ui`, `@voiceassist/api-client`, `@voiceassist/types`

### Implementation Status (Per IMPLEMENTATION_STATUS.md)

| Feature          | Backend API | Admin UI | Notes                 |
| ---------------- | ----------- | -------- | --------------------- |
| Dashboard        | Complete    | Complete | Real-time metrics     |
| User Management  | Complete    | Complete | CRUD, RBAC            |
| Knowledge Base   | Complete    | Complete | Upload, indexing      |
| Feature Flags    | Complete    | Partial  | API exists, UI basic  |
| Cache Management | Complete    | Partial  | Stats endpoint exists |
| Audit Logs       | Complete    | Complete | HIPAA-compliant       |
| Analytics        | Partial     | Partial  | Basic metrics only    |
| Integrations     | Complete    | Missing  | No admin UI           |
| Voice/Realtime   | Complete    | Missing  | No admin monitoring   |
| System Config    | Partial     | Basic    | Limited settings UI   |

---

## Admin Panel Tech Stack (Ground Truth)

The admin panel is a **React + TypeScript + Vite** application with client-side routing.

### Verified Stack Details

| Component        | Technology                        | Verified Source                            |
| ---------------- | --------------------------------- | ------------------------------------------ |
| **Framework**    | React 18                          | `apps/admin-panel/package.json`            |
| **Language**     | TypeScript                        | `apps/admin-panel/tsconfig.json`           |
| **Build Tool**   | Vite                              | `apps/admin-panel/vite.config.ts`          |
| **Routing**      | React Router DOM (client-side)    | `apps/admin-panel/src/App.tsx`             |
| **Dev Server**   | Vite dev server (port 5174)       | `apps/admin-panel/vite.config.ts`          |
| **Layout Shell** | `AdminLayoutWithRouter` component | `src/components/AdminLayoutWithRouter.tsx` |

### Current Route Structure

```typescript
// From apps/admin-panel/src/App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/*" element={
      <ProtectedRoute>
        <AdminLayoutWithRouter>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/system" element={<SystemPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AdminLayoutWithRouter>
      </ProtectedRoute>
    } />
  </Routes>
</BrowserRouter>
```

### Key Dependencies

From `package.json`:

- `react-router-dom` - Client-side routing
- `@tanstack/react-table` - Data tables
- `recharts` - Chart components
- `@voiceassist/ui` - Shared UI components
- `@voiceassist/types` - TypeScript types
- `@voiceassist/api-client` - API client

> **Note:** ADMIN_PANEL_SPECS.md correctly identifies React + Vite as the stack. If architecture diagrams elsewhere show Next.js, those are outdated for the admin panel specifically.

---

## Phase 1: Backend-to-Admin Service Matrix

### Backend Services Requiring Admin Surfaces

Cross-referenced with [SERVICE_CATALOG.md](../SERVICE_CATALOG.md) and actual backend code at `services/api-gateway/app/api/`:

| Service Category     | Backend Module(s)                            | Current Admin Endpoints       | Admin UI Status      | Priority | Expected Admin Capabilities           |
| -------------------- | -------------------------------------------- | ----------------------------- | -------------------- | -------- | ------------------------------------- |
| **Core Admin**       | `admin_panel.py`                             | `/api/admin/panel/*`          | Dashboard            | Complete | status, metrics                       |
| **User Management**  | `users.py`, `auth.py`                        | `/api/admin/panel/users/*`    | UsersPage            | Complete | CRUD, roles, sessions                 |
| **Knowledge Base**   | `admin_kb.py`, `kb_indexer.py`               | `/api/admin/kb/*`             | KnowledgeBasePage    | Complete | upload, index, status, reindex        |
| **Feature Flags**    | `admin_feature_flags.py`                     | `/api/admin/feature-flags/*`  | SystemPage (partial) | High     | CRUD, toggle, rollout %               |
| **Cache**            | `admin_cache.py`, `cache_service.py`         | `/api/admin/cache/*`          | Missing              | High     | stats, invalidate, clear              |
| **Audit Logs**       | `audit_service.py`                           | `/api/admin/panel/audit-logs` | UsersPage (partial)  | Medium   | filter, search, export                |
| **Voice/Realtime**   | `voice.py`, `realtime.py`                    | Missing                       | Missing              | **High** | sessions, metrics, config, disconnect |
| **Integrations**     | `integrations.py`                            | Missing admin routes          | Missing              | **High** | status, test, config                  |
| **Medical AI**       | `medical_ai.py`, `rag_service.py`            | Missing admin routes          | Missing              | Medium   | models, routing, metrics              |
| **External Medical** | `external_medical.py`                        | Missing admin routes          | Missing              | Medium   | PubMed/UpToDate status                |
| **Health/Metrics**   | `health.py`, `metrics.py`                    | `/health`, `/metrics`         | Dashboard (partial)  | Medium   | service health grid                   |
| **PHI Detection**    | `phi_detector.py`                            | Missing                       | Missing              | **High** | rules, config, test, routing stats    |
| **Search**           | `advanced_search.py`, `search_aggregator.py` | Missing                       | Missing              | Low      | stats, query analysis                 |

### Priority Services: Detailed Admin Requirements

#### Voice/Realtime (Priority: HIGH)

**Backend modules:** `voice.py`, `realtime.py`, `realtime_voice_service.py`, `voice_websocket_handler.py`

Expected admin endpoints:

- `GET /api/admin/voice/sessions` - List active WebSocket sessions
- `GET /api/admin/voice/sessions/{id}` - Session details
- `POST /api/admin/voice/sessions/{id}/disconnect` - Force disconnect
- `GET /api/admin/voice/metrics` - STT/TTS latency, session counts
- `GET /api/admin/voice/health` - Voice service health
- `GET /api/admin/voice/config` - Voice configuration
- `PATCH /api/admin/voice/config` - Update voice config

#### Integrations (Priority: HIGH)

**Backend module:** `integrations.py`, `nextcloud.py`, `caldav_service.py`, `email_service.py`

Expected admin endpoints:

- `GET /api/admin/integrations` - List all integrations with status
- `GET /api/admin/integrations/{name}` - Integration details
- `PATCH /api/admin/integrations/{name}` - Update config
- `POST /api/admin/integrations/{name}/test` - Test connection
- `GET /api/admin/integrations/{name}/metrics` - Usage metrics

#### PHI Detection (Priority: HIGH)

**Backend module:** `phi_detector.py`

Expected admin endpoints:

- `GET /api/admin/phi/config` - PHI detection config
- `PATCH /api/admin/phi/config` - Update config
- `GET /api/admin/phi/rules` - Detection rules
- `POST /api/admin/phi/rules` - Add rule
- `DELETE /api/admin/phi/rules/{id}` - Remove rule
- `POST /api/admin/phi/test` - Test PHI detection on sample text
- `GET /api/admin/phi/metrics` - Detection metrics
- `GET /api/admin/phi/routing/stats` - Cloud vs local routing stats

#### Medical AI/RAG (Priority: MEDIUM)

**Backend modules:** `medical_ai.py`, `rag_service.py`, `llm_client.py`

Expected admin endpoints:

- `GET /api/admin/medical/models` - Available models
- `PATCH /api/admin/medical/routing` - Update routing config
- `GET /api/admin/medical/metrics` - AI usage metrics, costs
- `GET /api/admin/medical/search/stats` - Search analytics
- `GET /api/admin/medical/embeddings/stats` - Embedding DB stats

---

## Phase 2: Admin API Enhancement Plan

### Admin API Conventions

All admin endpoints must follow conventions established in:

- [API_REFERENCE.md](../API_REFERENCE.md) - Standard response envelope, error codes
- [services/api-gateway/README.md](../../services/api-gateway/README.md) - Backend patterns

**Key Conventions:**

1. **Response Envelope**: All responses use standard APIEnvelope:

   ```python
   from app.core.api_envelope import success_response, error_response

   return success_response(data={"users": users})
   ```

2. **Error Handling**: Use standard error codes from `app/core/exceptions.py`

3. **Pagination**: Use standard pagination schema for list endpoints:

   ```python
   from app.schemas.common import PaginationParams, PaginatedResponse
   ```

4. **Admin Authentication**: All admin endpoints must use:

   ```python
   from app.api.admin_panel import get_current_admin_user, get_current_admin_or_viewer
   ```

5. **Audit Logging**: All write operations must emit audit logs (see Phase 5)

### 2.1 New Admin API Endpoints Required

#### Voice/Realtime Admin (`/api/admin/voice/`)

**File**: `services/api-gateway/app/api/admin_voice.py` (NEW)

**Endpoint Summary:**

| Method | URL                                         | Purpose              | RBAC   |
| ------ | ------------------------------------------- | -------------------- | ------ |
| GET    | `/api/admin/voice/sessions`                 | List active sessions | viewer |
| GET    | `/api/admin/voice/sessions/{id}`            | Session details      | viewer |
| POST   | `/api/admin/voice/sessions/{id}/disconnect` | Force disconnect     | admin  |
| GET    | `/api/admin/voice/metrics`                  | Voice metrics        | viewer |
| GET    | `/api/admin/voice/health`                   | Service health       | viewer |
| GET    | `/api/admin/voice/config`                   | Get config           | viewer |
| PATCH  | `/api/admin/voice/config`                   | Update config        | admin  |

**Pydantic Models** (reuse from `app/schemas/` or create new):

```python
# app/schemas/admin_voice.py (NEW)
from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime

class VoiceSessionInfo(BaseModel):
    session_id: str
    user_id: str
    user_email: str
    connected_at: datetime
    session_type: Literal["text", "voice", "realtime"]
    client_info: dict
    messages_count: int
    last_activity: datetime

class VoiceMetrics(BaseModel):
    active_sessions: int
    total_sessions_24h: int
    avg_session_duration_sec: float
    stt_latency_p95_ms: float
    tts_latency_p95_ms: float
    error_rate_24h: float
```

#### Integrations Admin (`/api/admin/integrations/`)

**File**: `services/api-gateway/app/api/admin_integrations.py` (NEW)

**Endpoint Summary:**

| Method | URL                                      | Purpose               | RBAC   |
| ------ | ---------------------------------------- | --------------------- | ------ |
| GET    | `/api/admin/integrations`                | List all integrations | viewer |
| GET    | `/api/admin/integrations/{name}`         | Integration details   | viewer |
| PATCH  | `/api/admin/integrations/{name}`         | Update config         | admin  |
| POST   | `/api/admin/integrations/{name}/test`    | Test connection       | admin  |
| GET    | `/api/admin/integrations/{name}/metrics` | Usage metrics         | viewer |

**Pydantic Models:**

```python
# app/schemas/admin_integrations.py (NEW)
class IntegrationStatus(BaseModel):
    name: str
    category: str  # "file_storage", "calendar", "medical_search", etc.
    status: Literal["connected", "disconnected", "error", "degraded"]
    api_key_configured: bool
    last_tested_at: Optional[datetime]
    last_test_status: Optional[str]
    requests_24h: int
    error_rate: float
    config: dict  # Masked sensitive values (see PHI section)
```

#### PHI Detection Admin (`/api/admin/phi/`)

**File**: `services/api-gateway/app/api/admin_phi.py` (NEW)

**Endpoint Summary:**

| Method | URL                            | Purpose             | RBAC   |
| ------ | ------------------------------ | ------------------- | ------ |
| GET    | `/api/admin/phi/config`        | Get PHI config      | viewer |
| PATCH  | `/api/admin/phi/config`        | Update config       | admin  |
| GET    | `/api/admin/phi/rules`         | List rules          | viewer |
| POST   | `/api/admin/phi/rules`         | Add rule            | admin  |
| DELETE | `/api/admin/phi/rules/{id}`    | Delete rule         | admin  |
| POST   | `/api/admin/phi/test`          | Test detection      | admin  |
| GET    | `/api/admin/phi/metrics`       | Detection metrics   | viewer |
| GET    | `/api/admin/phi/routing/stats` | Cloud/local routing | viewer |

#### Medical AI Admin (`/api/admin/medical/`)

**File**: `services/api-gateway/app/api/admin_medical.py` (NEW)

**Endpoint Summary:**

| Method | URL                                   | Purpose          | RBAC   |
| ------ | ------------------------------------- | ---------------- | ------ |
| GET    | `/api/admin/medical/models`           | Available models | viewer |
| GET    | `/api/admin/medical/models/{id}`      | Model details    | viewer |
| PATCH  | `/api/admin/medical/routing`          | Update routing   | admin  |
| GET    | `/api/admin/medical/metrics`          | AI usage metrics | viewer |
| GET    | `/api/admin/medical/search/stats`     | Search analytics | viewer |
| GET    | `/api/admin/medical/embeddings/stats` | Embedding stats  | viewer |

#### System Configuration Admin (Extend existing)

**File**: `services/api-gateway/app/api/admin_panel.py` (EXTEND)

**Additional Endpoints:**

| Method | URL                                     | Purpose            | RBAC   |
| ------ | --------------------------------------- | ------------------ | ------ |
| GET    | `/api/admin/system/config`              | Full system config | viewer |
| PATCH  | `/api/admin/system/config`              | Update config      | admin  |
| GET    | `/api/admin/system/config/history`      | Config changes     | viewer |
| POST   | `/api/admin/system/backup/trigger`      | Trigger backup     | admin  |
| GET    | `/api/admin/system/backup/status`       | Backup status      | viewer |
| GET    | `/api/admin/system/resources`           | Resource usage     | viewer |
| POST   | `/api/admin/system/maintenance/enable`  | Maintenance mode   | admin  |
| POST   | `/api/admin/system/maintenance/disable` | Exit maintenance   | admin  |

### 2.2 Existing Endpoint Enhancements

#### Enhance `/api/admin/panel/summary`

Add additional metrics to dashboard summary:

```python
{
    # Existing
    "total_users": int,
    "active_users": int,
    "admin_users": int,

    # New additions
    "active_ws_sessions": int,
    "voice_sessions_active": int,
    "kb_documents_total": int,
    "kb_chunks_total": int,
    "api_calls_24h": int,
    "error_rate_24h": float,
    "cache_hit_rate": float,
    "integrations_healthy": int,
    "integrations_total": int,
}
```

---

## Phase 3: Admin Panel UI Implementation

This phase is organized by page, aligned with [ADMIN_PANEL_SPECS.md](../ADMIN_PANEL_SPECS.md).

### 3.1 Page Implementation Matrix

| Page                 | Route                 | ADMIN_PANEL_SPECS Section | Status   | API Dependencies                                                          |
| -------------------- | --------------------- | ------------------------- | -------- | ------------------------------------------------------------------------- |
| Dashboard            | `/dashboard`          | §4.1 Dashboard            | Complete | `/api/admin/panel/summary`                                                |
| System Configuration | `/system`             | §4.2 System Configuration | Partial  | `/api/admin/system/*`, `/api/admin/feature-flags/*`, `/api/admin/cache/*` |
| AI Models            | `/models` (NEW)       | §4.3 AI Models            | Missing  | `/api/admin/medical/models`, `/api/admin/medical/routing`                 |
| Knowledge Base       | `/knowledge-base`     | §4.4 Knowledge Base       | Complete | `/api/admin/kb/*`                                                         |
| Integrations         | `/integrations` (NEW) | §4.5 Integrations         | Missing  | `/api/admin/integrations/*`                                               |
| User Management      | `/users`              | §4.6 User Management      | Complete | `/api/admin/panel/users/*`                                                |
| Analytics            | `/analytics`          | §4.7 Analytics            | Partial  | `/api/admin/panel/metrics`, `/api/admin/medical/metrics`                  |
| Security             | `/security` (NEW)     | §4.8 Security             | Missing  | `/api/admin/phi/*`, `/api/admin/panel/audit-logs`                         |
| Backups              | `/backups` (NEW)      | §4.9 Backups              | Missing  | `/api/admin/system/backup/*`                                              |
| Voice Monitor        | `/voice` (NEW)        | §4.10 Troubleshooting     | Missing  | `/api/admin/voice/*`                                                      |

### 3.2 New Pages Required

#### IntegrationsPage.tsx (NEW)

**Route**: `/integrations`
**Spec Reference**: [ADMIN_PANEL_SPECS.md §4.5](../ADMIN_PANEL_SPECS.md#45-integrations)

**Components:**

```
src/pages/IntegrationsPage/
├── index.tsx                 - Main page component
├── IntegrationsList.tsx      - Grid of integration cards
├── IntegrationCard.tsx       - Individual integration status
├── IntegrationDetails.tsx    - Detailed view drawer/modal
├── IntegrationConfig.tsx     - Configuration form
├── TestConnectionButton.tsx  - Connection test with status
└── IntegrationMetrics.tsx    - Usage charts (Recharts)
```

**API Endpoints Used:**

- `GET /api/admin/integrations` - List all
- `GET /api/admin/integrations/{name}` - Details
- `PATCH /api/admin/integrations/{name}` - Update
- `POST /api/admin/integrations/{name}/test` - Test

**Shared Components from @voiceassist/ui:**

- `DataTable` with TanStack Table (filtering, sorting)
- `Card` for integration status cards
- `Badge` for status indicators
- `Button` for test actions
- `Dialog` for confirmation

**Filtering/Pagination:**

- Client-side filtering by category (file_storage, calendar, medical)
- Client-side filtering by status (connected, disconnected, error)
- No server pagination (expect <20 integrations)

#### VoiceMonitorPage.tsx (NEW)

**Route**: `/voice`
**Spec Reference**: [ADMIN_PANEL_SPECS.md §4.10](../ADMIN_PANEL_SPECS.md#410-troubleshooting)

**Components:**

```
src/pages/VoiceMonitorPage/
├── index.tsx                 - Main page component
├── ActiveSessionsList.tsx    - Real-time session table
├── SessionDetails.tsx        - Session drill-down drawer
├── VoiceMetricsCards.tsx     - Key metrics cards
├── LatencyChart.tsx          - STT/TTS latency (Recharts)
├── VoiceConfig.tsx           - Voice settings panel
└── ForceDisconnect.tsx       - Session management with confirm
```

**API Endpoints Used:**

- `GET /api/admin/voice/sessions` - List sessions
- `GET /api/admin/voice/sessions/{id}` - Session details
- `POST /api/admin/voice/sessions/{id}/disconnect` - Force disconnect
- `GET /api/admin/voice/metrics` - Metrics
- `GET /api/admin/voice/config` - Config
- `PATCH /api/admin/voice/config` - Update config

**Shared Components from @voiceassist/ui:**

- `DataTable` with auto-refresh (TanStack Table)
- `MetricCard` for metrics display
- `LineChart` for latency over time
- `AlertDialog` for dangerous actions (disconnect)

**Real-time Updates:**

- Poll `/api/admin/voice/sessions` every 5 seconds
- Alternatively, use WebSocket for session updates

#### SecurityPage.tsx (NEW)

**Route**: `/security`
**Spec Reference**: [ADMIN_PANEL_SPECS.md §4.8](../ADMIN_PANEL_SPECS.md#48-security)

**Components:**

```
src/pages/SecurityPage/
├── index.tsx                 - Main page with tabs
├── PHIConfigPanel.tsx        - PHI detection settings
├── PHIRulesList.tsx          - Detection rules table
├── PHITestTool.tsx           - Test PHI detection
├── RoutingStatsPanel.tsx     - Cloud vs local routing
├── AuditLogsTable.tsx        - Full audit log viewer
├── SecurityMetrics.tsx       - Security dashboard
└── ComplianceChecklist.tsx   - HIPAA compliance status
```

**API Endpoints Used:**

- `GET /api/admin/phi/config` - PHI config
- `PATCH /api/admin/phi/config` - Update PHI config
- `GET /api/admin/phi/rules` - Rules list
- `POST /api/admin/phi/rules` - Add rule
- `DELETE /api/admin/phi/rules/{id}` - Delete rule
- `POST /api/admin/phi/test` - Test detection
- `GET /api/admin/phi/routing/stats` - Routing stats
- `GET /api/admin/panel/audit-logs` - Audit logs

**PHI Masking (CRITICAL):**

- Test tool results must mask actual PHI in UI
- Audit logs must show redacted content only
- See Phase 5 for full PHI requirements

### 3.3 Existing Page Enhancements

#### DashboardPage.tsx Enhancements

Add sections for:

- Service status grid (all services from Service Catalog)
- Integration health overview (connected/disconnected counts)
- Voice/realtime session count
- Quick action buttons (clear cache, trigger backup)
- Recent alerts panel (from audit logs with severity=error)

**New Components:**

```
src/pages/DashboardPage/
├── ServiceHealthGrid.tsx     - All services status
├── IntegrationHealthBar.tsx  - Integration summary
├── VoiceSessionCount.tsx     - Active voice sessions
├── QuickActions.tsx          - Common admin actions
└── RecentAlerts.tsx          - Error alerts
```

#### SystemPage.tsx Enhancements

Restructure into tabs:

1. **General Settings** - Maintenance mode, timezone, etc.
2. **Feature Flags** - Full CRUD with percentage rollout
3. **Cache Management** - Stats, invalidation, clear
4. **Backup Controls** - Trigger backup, view status
5. **Resource Monitoring** - Disk, memory, CPU (if available)

#### AnalyticsPage.tsx Enhancements

Add charts for:

- Model usage breakdown (cloud vs local routing)
- Cost tracking over time (token usage, API calls)
- Search query analytics (top queries, latency)
- Voice usage metrics (sessions, duration)
- Integration usage breakdown

---

## Phase 4: API Client Integration

### 4.1 Extend `@voiceassist/api-client`

**Location**: `packages/api-client/src/admin/`

```typescript
// packages/api-client/src/admin/index.ts (NEW)
export { VoiceAdminClient } from "./voice";
export { IntegrationsAdminClient } from "./integrations";
export { PHIAdminClient } from "./phi";
export { MedicalAdminClient } from "./medical";

// packages/api-client/src/admin/voice.ts (NEW)
export interface VoiceAdminClient {
  getSessions(): Promise<VoiceSession[]>;
  getSession(id: string): Promise<VoiceSessionDetails>;
  disconnectSession(id: string): Promise<void>;
  getMetrics(): Promise<VoiceMetrics>;
  getHealth(): Promise<HealthStatus>;
  getConfig(): Promise<VoiceConfig>;
  updateConfig(config: Partial<VoiceConfig>): Promise<VoiceConfig>;
}

// packages/api-client/src/admin/integrations.ts (NEW)
export interface IntegrationsAdminClient {
  list(): Promise<Integration[]>;
  get(name: string): Promise<IntegrationDetails>;
  update(name: string, config: Partial<IntegrationConfig>): Promise<Integration>;
  testConnection(name: string): Promise<TestResult>;
  getMetrics(name: string): Promise<IntegrationMetrics>;
}

// packages/api-client/src/admin/phi.ts (NEW)
export interface PHIAdminClient {
  getConfig(): Promise<PHIConfig>;
  updateConfig(config: Partial<PHIConfig>): Promise<PHIConfig>;
  getRules(): Promise<PHIRule[]>;
  addRule(rule: PHIRuleCreate): Promise<PHIRule>;
  deleteRule(id: string): Promise<void>;
  test(text: string): Promise<PHITestResult>;
  getMetrics(): Promise<PHIMetrics>;
  getRoutingStats(): Promise<RoutingStats>;
}
```

### 4.2 Extend `@voiceassist/types`

**Location**: `packages/types/src/admin/`

Type definitions will be added to `packages/types/src/admin/` during implementation.

---

## Phase 5: Security & Compliance

### Related Security Documentation

Before implementing any security-sensitive admin features, read:

- [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md) - HIPAA requirements, zero-trust architecture
- [HIPAA_COMPLIANCE_MATRIX.md](../HIPAA_COMPLIANCE_MATRIX.md) - 42 requirement mappings
- [OBSERVABILITY.md](../OBSERVABILITY.md) - Audit logging patterns
- [NEXTCLOUD_INTEGRATION.md](../NEXTCLOUD_INTEGRATION.md) - PHI storage rules

### 5.1 Admin RBAC Enforcement

All admin endpoints must:

1. **Require Authentication**: Use `get_current_admin_user` dependency
2. **Check Admin Role**: Use `ensure_admin_privileges` for mutations
3. **Support Viewer Role**: Use `get_current_admin_or_viewer` for read-only

```python
# Read-only endpoint (viewer can access)
@router.get("/summary")
async def get_system_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_or_viewer),
) -> Dict:
    ...

# Write endpoint (admin only)
@router.post("/config")
async def update_config(
    config: SystemConfigUpdate,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
) -> Dict:
    ensure_admin_privileges(current_admin_user)
    ...
```

### 5.2 Audit Logging Requirements

All admin mutations must be logged per [SECURITY_COMPLIANCE.md §6](../SECURITY_COMPLIANCE.md#audit-logging):

```python
from app.services.audit_service import audit_log

# Log all configuration changes
audit_log.log_action(
    action="system.config.update",
    user_id=current_admin_user.id,
    user_email=current_admin_user.email,
    resource_type="system_config",
    resource_id="global",
    success=True,
    details=json.dumps({"changes": changes}),
    request=request,
)
```

### 5.3 PHI Protection in Admin

Admin interfaces that display or manage PHI-related data must follow these rules:

#### Sensitive Data Visibility Rules

| Data Type            | Masking Rule                        | Who Can View Full Value     |
| -------------------- | ----------------------------------- | --------------------------- |
| API Keys             | Show last 4 chars only (`****ABCD`) | Never show full             |
| Passwords            | Never show                          | Never                       |
| User emails          | Full visible                        | Admin, Viewer               |
| Conversation content | PHI-redacted                        | Admin only (audit required) |
| Audit log details    | PHI-redacted                        | Admin only                  |
| Integration secrets  | Never show                          | Never                       |

#### PHI Masking in Admin UI

```typescript
// When displaying audit logs or conversation traces
const maskPHI = (text: string): string => {
  // Call backend PHI detection first
  // Display only redacted version
  return redactedText;
};
```

#### Stricter RBAC Tiers

| Operation                 | Required Role | Additional Check        |
| ------------------------- | ------------- | ----------------------- |
| View audit logs           | Admin         | Audit this access       |
| View conversation content | Superadmin    | Audit + reason required |
| Delete user data          | Superadmin    | Dual approval           |
| Modify PHI rules          | Admin         | Audit + confirmation    |
| Export data               | Admin         | Audit + confirmation    |

### 5.4 Compliance Guardrails

Implement safeguards to prevent HIPAA violations:

```python
# Example: Prevent reducing audit retention below HIPAA minimum
@router.patch("/system/retention")
async def update_retention(
    retention: RetentionConfig,
    db: Session = Depends(get_db),
    current_admin_user: User = Depends(get_current_admin_user),
):
    ensure_admin_privileges(current_admin_user)

    # HIPAA requires minimum 6-year retention for audit logs
    if retention.audit_logs_days < 2190:  # 6 years
        raise HTTPException(
            status_code=400,
            detail="Audit log retention must be at least 6 years for HIPAA compliance"
        )
    ...
```

### 5.5 Pre-Ship Security Checklist

Before shipping any new admin feature, verify:

- [ ] **RBAC enforced**: All endpoints check admin/viewer role
- [ ] **Audit logging**: All mutations emit audit events
- [ ] **PHI masking**: Sensitive data redacted in responses
- [ ] **Input validation**: Pydantic models validate all inputs
- [ ] **Rate limiting**: Sensitive endpoints are rate-limited
- [ ] **HIPAA compliance**: No violations of retention/access rules
- [ ] **Confirmation dialogs**: Dangerous actions require confirmation
- [ ] **Security review**: Code reviewed for auth bypass vulnerabilities

---

## Phase 6: Testing Strategy

### Relationship to Phase 13

This testing strategy extends [PHASE_13_TESTING_DOCS.md](../phases/PHASE_13_TESTING_DOCS.md) for admin-specific flows. Phase 13 covers general E2E and documentation testing; this section focuses specifically on admin panel testing.

### 6.1 Backend Tests

**Location**: `services/api-gateway/tests/test_admin_*.py`

**Test Framework**: pytest (verified in `services/api-gateway/requirements.txt`)

**Running Admin Tests:**

```bash
cd services/api-gateway
source .venv/bin/activate

# Run all admin tests
pytest tests/test_admin*.py -v

# Run with coverage
pytest tests/test_admin*.py --cov=app/api --cov-report=term-missing

# Run specific test file
pytest tests/test_admin_voice.py -v
```

**Test Patterns:**

```python
# tests/test_admin_voice.py (NEW)
import pytest
from httpx import AsyncClient
from app.main import app

class TestAdminVoiceEndpoints:
    """Test admin voice endpoints."""

    async def test_admin_endpoint_requires_auth(self, client: AsyncClient):
        """Verify endpoint returns 401 without token."""
        response = await client.get("/api/admin/voice/sessions")
        assert response.status_code == 401

    async def test_admin_endpoint_requires_admin_role(
        self, client: AsyncClient, user_token: str
    ):
        """Verify endpoint returns 403 for non-admin users."""
        response = await client.get(
            "/api/admin/voice/sessions",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 403

    async def test_admin_endpoint_viewer_can_read(
        self, client: AsyncClient, viewer_token: str
    ):
        """Verify viewer role can access read-only endpoints."""
        response = await client.get(
            "/api/admin/voice/sessions",
            headers={"Authorization": f"Bearer {viewer_token}"}
        )
        assert response.status_code == 200

    async def test_admin_mutation_creates_audit_log(
        self, client: AsyncClient, admin_token: str, db
    ):
        """Verify mutations create audit log entries."""
        response = await client.post(
            "/api/admin/voice/sessions/test-session/disconnect",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # Check audit log was created
        audit_entries = db.query(AuditLog).filter(
            AuditLog.action == "voice.session.disconnect"
        ).all()
        assert len(audit_entries) == 1
```

**Coverage Expectations:**

- New admin API endpoints: >80% coverage
- RBAC checks: 100% coverage (every endpoint tested)
- Audit logging: 100% of mutations tested

### 6.2 Frontend Tests

**Location**: `apps/admin-panel/src/__tests__/` or `*.test.tsx` co-located

**Test Framework**: Vitest (configured in `apps/admin-panel/vite.config.ts`)

**Note**: Per `apps/admin-panel/package.json`, tests are not yet implemented. This plan establishes the expected testing approach.

**Running Frontend Tests:**

```bash
cd apps/admin-panel

# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

**Test Patterns:**

```typescript
// src/pages/__tests__/IntegrationsPage.test.tsx (NEW)
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntegrationsPage } from '../IntegrationsPage';
import { MockProviders } from '../../test/MockProviders';

describe('IntegrationsPage', () => {
  it('renders loading state while fetching integrations', async () => {
    render(<IntegrationsPage />, { wrapper: MockProviders });
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('displays error state on API failure', async () => {
    // Mock API failure
    server.use(
      rest.get('/api/admin/integrations', (req, res, ctx) => {
        return res(ctx.status(500));
      })
    );
    render(<IntegrationsPage />, { wrapper: MockProviders });
    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });

  it('lists all integrations with status', async () => {
    render(<IntegrationsPage />, { wrapper: MockProviders });
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('allows testing connection', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />, { wrapper: MockProviders });

    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /test/i }));
    await waitFor(() => {
      expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
    });
  });

  it('shows confirmation before config changes', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />, { wrapper: MockProviders });

    // Trigger config change
    await user.click(screen.getByRole('button', { name: /save/i }));

    // Confirm dialog should appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
```

**Coverage Expectations:**

- New pages: >70% coverage
- Critical flows (RBAC, mutations): 100% tested
- Error states: All pages handle errors gracefully

### 6.3 E2E Tests

**Location**: `e2e/admin/` (to be created)

**Test Framework**: Playwright (recommended) or Cypress

**E2E Scope:**

```typescript
// e2e/admin/admin-panel.spec.ts (NEW)
import { test, expect } from "@playwright/test";

test.describe("Admin Panel E2E", () => {
  test("admin can log in and view dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "admin@example.com");
    await page.fill('[name="password"]', "password");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("admin can manage users", async ({ page }) => {
    // Login first
    await loginAsAdmin(page);

    await page.goto("/users");
    await expect(page.locator("table")).toBeVisible();

    // Test user creation
    await page.click('button:has-text("Add User")');
    // ... fill form
  });

  test("viewer cannot perform mutations", async ({ page }) => {
    await loginAsViewer(page);

    await page.goto("/system");

    // Save button should be disabled or hidden
    await expect(page.locator('button:has-text("Save")')).toBeDisabled();
  });
});
```

---

## Phase 7: Deployment & Rollout

### Related Infrastructure Documentation

- [INFRASTRUCTURE_SETUP.md](../INFRASTRUCTURE_SETUP.md) - Server setup, Docker Compose
- [COMPOSE_TO_K8S_MIGRATION.md](../COMPOSE_TO_K8S_MIGRATION.md) - Kubernetes migration
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) - Deployment procedures

### 7.1 Feature Flags for Admin Features

Use existing feature flag system to control rollout:

```python
# services/api-gateway/app/services/feature_flags.py
ADMIN_VOICE_MONITOR = "admin.voice.monitor"
ADMIN_INTEGRATIONS_PAGE = "admin.integrations.page"
ADMIN_SECURITY_PAGE = "admin.security.page"
ADMIN_ENHANCED_ANALYTICS = "admin.analytics.enhanced"
```

**Rollout Strategy:**

1. Deploy with flags disabled
2. Enable for internal users (10%)
3. Enable for beta users (25%)
4. Enable for all users (100%)

### 7.2 Deployment Checklist

Before deploying admin changes:

1. [ ] All new endpoints have tests with >80% coverage
2. [ ] All mutations create audit log entries
3. [ ] RBAC is enforced on all endpoints
4. [ ] Rate limiting is configured for sensitive operations
5. [ ] PHI is properly redacted in all responses
6. [ ] Frontend builds successfully (`pnpm build`)
7. [ ] E2E tests pass
8. [ ] Documentation is updated

### 7.3 Deployment Verification Checklist

After deployment, verify:

```bash
# 1. API Gateway health
curl https://api.voiceassist.example.com/health
# Expected: {"status": "healthy", ...}

# 2. Readiness check
curl https://api.voiceassist.example.com/ready
# Expected: {"status": "ready", "dependencies": {...}}

# 3. Admin summary endpoint
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.voiceassist.example.com/api/admin/panel/stats
# Expected: 200 with metrics

# 4. New admin endpoints (if deployed)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.voiceassist.example.com/api/admin/voice/sessions
# Expected: 200 or 404 (if feature flag disabled)

# 5. Frontend loads
curl -I https://admin.voiceassist.example.com/
# Expected: 200
```

### 7.4 Rollback Plan

If issues are discovered:

1. **Disable via Feature Flag**: Turn off problematic feature immediately
2. **Revert Frontend**: Deploy previous admin-panel build from CI/CD
3. **Revert Backend**: Roll back API Gateway container to previous tag
4. **Check Audit Logs**: Review what actions were taken during incident
5. **Post-mortem**: Document what went wrong and update processes

---

## Relationship to Phase Documents

This Admin Panel Implementation Plan relates to the canonical V2 phase documents as follows:

### Phase Document Mapping

| V2 Phase | Phase Document                                                     | Relationship to Admin Plan                                                                                                                        |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 07 | [PHASE_07_ADMIN_PANEL.md](../phases/PHASE_07_ADMIN_PANEL.md)       | **Core admin functionality** - Phase 7 established the base admin panel with RBAC. This plan extends with Voice, Integrations, Security surfaces. |
| Phase 08 | [PHASE_08_OBSERVABILITY.md](../phases/PHASE_08_OBSERVABILITY.md)   | **Metrics & logging** - Phase 8 established observability patterns. Admin plan adds admin-specific metrics dashboards.                            |
| Phase 10 | [PHASE_10_LOAD_TESTING.md](../phases/PHASE_10_LOAD_TESTING.md)     | **Voice/WebSocket** - Phase 10 covered load testing including WebSocket. Admin plan adds voice session monitoring.                                |
| Phase 11 | [PHASE_11_SECURITY_HIPAA.md](../phases/PHASE_11_SECURITY_HIPAA.md) | **Security hardening** - Phase 11 established HIPAA controls. Admin plan extends with PHI admin UI, security dashboard.                           |
| Phase 13 | [PHASE_13_TESTING_DOCS.md](../phases/PHASE_13_TESTING_DOCS.md)     | **Testing** - Phase 13 covers E2E testing. Admin plan extends with admin-specific test patterns.                                                  |

### What Phase 7 Covers vs. What This Plan Adds

**Phase 7 (Completed):**

- Basic admin panel with RBAC
- User management
- Knowledge base admin
- Feature flags API
- Audit logging infrastructure

**This Plan Adds:**

- Voice/Realtime monitoring page
- Integrations management page
- Security/PHI admin page
- Enhanced analytics with cost tracking
- System configuration with backups
- Deeper observability dashboards

### Global Phase → Admin Plan Mapping

| Global Phase | Admin Plan Phase | Description                              |
| ------------ | ---------------- | ---------------------------------------- |
| Phase 7      | Foundation       | Base admin panel (done)                  |
| Phase 8      | Phase 1-2        | Backend service matrix, API enhancements |
| Phase 11     | Phase 3, 5       | UI implementation, security compliance   |
| Phase 13     | Phase 6          | Testing strategy                         |
| Phase 14     | Phase 7          | Deployment & rollout                     |

---

## Using this Plan as an AI Agent

If you are an AI coding assistant (Claude, GPT, etc.) working on admin panel features, follow this guidance.

### Before Starting Work

1. **Read onboarding docs first:**
   - [AI Agent Onboarding](../ai/AGENT_ONBOARDING.md) - Quick context, repo structure
   - [Claude Execution Guide](../CLAUDE_EXECUTION_GUIDE.md) - Session startup, branching, safety

2. **Read admin specs:**
   - [ADMIN_PANEL_SPECS.md](../ADMIN_PANEL_SPECS.md) - Full admin panel specifications
   - This document (ADMIN_PANEL_IMPLEMENTATION_PLAN.md) - Implementation roadmap

3. **Check current status:**
   - [IMPLEMENTATION_STATUS.md](../overview/IMPLEMENTATION_STATUS.md) - What's built vs. planned
   - Run `git status` and `git log --oneline -10` to see recent changes

### Workflow for Admin Features

1. **Identify scope:**
   - Which phase of this plan are you implementing?
   - Which backend endpoints are needed?
   - Which UI pages/components are needed?

2. **Backend first:**
   - Create API endpoints in `services/api-gateway/app/api/admin_*.py`
   - Add Pydantic schemas in `app/schemas/admin_*.py`
   - Write tests in `tests/test_admin_*.py`
   - Ensure RBAC and audit logging (see Phase 5)

3. **Frontend second:**
   - Create page in `apps/admin-panel/src/pages/`
   - Use shared components from `@voiceassist/ui`
   - Follow existing patterns in DashboardPage, UsersPage
   - Add route in `App.tsx`

4. **Verify before committing:**

   ```bash
   # Backend
   cd services/api-gateway
   pytest tests/test_admin*.py -v

   # Frontend
   cd apps/admin-panel
   pnpm lint && pnpm build
   ```

### Common Pitfalls

- **Don't skip RBAC**: Every admin endpoint must check admin/viewer role
- **Don't skip audit logging**: Every mutation must emit audit event
- **Don't expose PHI**: Mask sensitive data in all responses
- **Don't forget tests**: New endpoints need test coverage
- **Don't modify shared files carelessly**: Coordinate changes to `docker-compose.yml`, `package.json`

---

## Implementation Roadmap

### Sprint 1: Voice & Realtime Admin (High Priority)

Tasks:

1. Create `admin_voice.py` backend module
2. Add WebSocket session tracking to Redis
3. Create VoiceMonitorPage.tsx
4. Add voice metrics to dashboard
5. Write backend tests (pytest)
6. Write frontend tests (Vitest)

### Sprint 2: Integrations Admin (High Priority)

Tasks:

1. Create `admin_integrations.py` backend module
2. Create IntegrationsPage.tsx
3. Add integration status to dashboard
4. Implement connection testing UI
5. Write tests

### Sprint 3: Security & PHI Admin (High Priority)

Tasks:

1. Create `admin_phi.py` backend module
2. Create SecurityPage.tsx
3. Implement PHI rule management
4. Add routing statistics
5. Enhance audit log viewer with PHI masking
6. Write tests

### Sprint 4: Enhanced Analytics & System (Medium Priority)

Tasks:

1. Enhance AnalyticsPage with model usage, costs
2. Enhance SystemPage with backup controls
3. Add resource monitoring
4. Improve cache management UI
5. Write tests

### Sprint 5: Polish & Documentation (Medium Priority)

Tasks:

1. Standardize all components on @voiceassist/ui
2. Add loading/error/empty states everywhere
3. Improve mobile responsiveness
4. Update all documentation
5. Complete E2E test coverage

---

## Related Documentation

### Core Specs

- [ADMIN_PANEL_SPECS.md](../ADMIN_PANEL_SPECS.md) - Full admin panel specifications
- [SERVICE_CATALOG.md](../SERVICE_CATALOG.md) - Backend service catalog
- [DATA_MODEL.md](../DATA_MODEL.md) - Canonical data entities
- [API_REFERENCE.md](../API_REFERENCE.md) - API conventions

### Security & Compliance

- [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md) - HIPAA requirements
- [HIPAA_COMPLIANCE_MATRIX.md](../HIPAA_COMPLIANCE_MATRIX.md) - Compliance checklist
- [OBSERVABILITY.md](../OBSERVABILITY.md) - Audit logging patterns

### Infrastructure

- [INFRASTRUCTURE_SETUP.md](../INFRASTRUCTURE_SETUP.md) - Server setup
- [COMPOSE_TO_K8S_MIGRATION.md](../COMPOSE_TO_K8S_MIGRATION.md) - K8s migration

### AI Agent Guidance

- [ai/AGENT_ONBOARDING.md](../ai/AGENT_ONBOARDING.md) - AI agent quick start
- [CLAUDE_EXECUTION_GUIDE.md](../CLAUDE_EXECUTION_GUIDE.md) - Claude-specific guidelines
- [overview/IMPLEMENTATION_STATUS.md](../overview/IMPLEMENTATION_STATUS.md) - Component status

### Phase Documents

- [phases/PHASE_07_ADMIN_PANEL.md](../phases/PHASE_07_ADMIN_PANEL.md) - Phase 7 admin panel
- [phases/PHASE_11_SECURITY_HIPAA.md](../phases/PHASE_11_SECURITY_HIPAA.md) - Phase 11 security
- [phases/PHASE_13_TESTING_DOCS.md](../phases/PHASE_13_TESTING_DOCS.md) - Phase 13 testing

---

## Appendix A: File Locations Reference

### Backend Files

```
services/api-gateway/app/
├── api/
│   ├── admin_panel.py          # Main admin endpoints
│   ├── admin_kb.py             # KB management
│   ├── admin_feature_flags.py  # Feature flags
│   ├── admin_cache.py          # Cache management
│   ├── admin_voice.py          # NEW: Voice admin
│   ├── admin_integrations.py   # NEW: Integrations admin
│   ├── admin_phi.py            # NEW: PHI admin
│   └── admin_medical.py        # NEW: Medical AI admin
├── schemas/
│   ├── admin_voice.py          # NEW: Voice schemas
│   ├── admin_integrations.py   # NEW: Integration schemas
│   └── admin_phi.py            # NEW: PHI schemas
├── services/
│   ├── audit_service.py
│   ├── cache_service.py
│   ├── feature_flags.py
│   └── ... (40+ services)
└── models/
    └── ...
```

### Frontend Files

```
apps/admin-panel/src/
├── pages/
│   ├── DashboardPage.tsx
│   ├── UsersPage.tsx
│   ├── KnowledgeBasePage.tsx
│   ├── AnalyticsPage.tsx
│   ├── SystemPage.tsx
│   ├── LoginPage.tsx
│   ├── IntegrationsPage/       # NEW
│   │   ├── index.tsx
│   │   └── ...
│   ├── VoiceMonitorPage/       # NEW
│   │   ├── index.tsx
│   │   └── ...
│   └── SecurityPage/           # NEW
│       ├── index.tsx
│       └── ...
├── components/
│   ├── AdminLayoutWithRouter.tsx
│   ├── ProtectedRoute.tsx
│   └── ...
└── __tests__/                  # NEW
    └── ...
```

### Shared Packages

```
packages/
├── api-client/src/
│   └── admin/                  # NEW
│       ├── index.ts
│       ├── voice.ts
│       ├── integrations.ts
│       ├── phi.ts
│       └── medical.ts
├── types/src/
│   └── admin/                  # NEW
│       ├── index.ts
│       ├── voice.ts
│       ├── integrations.ts
│       └── phi.ts
├── ui/                         # Shared UI components
├── design-tokens/              # Design system tokens
└── ...
```

---

## Version History

| Date       | Version | Changes                                                                                                                |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2025-11-27 | 1.0.0   | Initial implementation plan created                                                                                    |
| 2025-11-27 | 2.0.0   | Major refinement: added tech stack ground truth, phase mappings, AI agent guide, security deepening, testing alignment |

---

**Document Owner**: Frontend Team
**Review Required**: Backend Team, Security Team
**Approval Required**: Tech Lead
