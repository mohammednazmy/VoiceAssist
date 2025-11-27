---
title: "Admin Panel Specs"
slug: "admin-panel-specs"
summary: "The VoiceAssist Admin Panel provides a centralized web interface for system configuration, monitoring, and management. Accessible at `admin.asimo.io`."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["devops", "sre"]
tags: ["admin", "panel", "specs"]
category: operations
---

# Admin Panel Specifications

## Overview

The VoiceAssist Admin Panel provides a centralized web interface for system configuration, monitoring, and management. Accessible at `admin.asimo.io`.

## Technology Stack

### Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui or Tremor (for dashboards)
- **Charts**: Recharts or Chart.js
- **Tables**: TanStack Table (React Table v8)
- **State Management**: Zustand or React Context

### Backend

- **Framework**: FastAPI (Python)
- **Authentication**: JWT with admin role
- **Database**: PostgreSQL for admin data
- **Real-time**: WebSocket for live metrics

### Standard API Envelope

All admin API calls return a standard envelope. See [server/README.md](../server/README.md#standard-api-response-envelope) for complete specification.

Use the same TypeScript types and fetch helper from WEB_APP_SPECS.md (can be shared package or duplicated).

#### Usage Example - KB Management

```typescript
// admin/hooks/useKBManagement.ts

import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchAPI, APIError } from "@/lib/api";
import { KnowledgeDocument, IndexingJob } from "@/types"; // From DATA_MODEL.md
import { toast } from "@/lib/toast";

export function useKBDocuments() {
  return useQuery({
    queryKey: ["kb-documents"],
    queryFn: async () => {
      return fetchAPI<KnowledgeDocument[]>("/api/admin/kb/documents");
    },
  });
}

export function useUploadDocument() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      return fetchAPI<IndexingJob>("/api/admin/kb/upload", {
        method: "POST",
        body: formData,
        headers: {
          // Don't set Content-Type, let browser set it with boundary
        },
      });
    },
    onSuccess: (job) => {
      toast.success(`Upload started: ${job.id}`);
    },
    onError: (error: APIError) => {
      if (error.code === "VALIDATION_ERROR") {
        toast.error("Invalid file format. Only PDF and DOCX supported.");
      } else if (error.code === "CONFLICT") {
        toast.error("A document with this name already exists");
      } else {
        toast.error(`Upload failed: ${error.message}`);
      }
    },
  });
}

export function useReindexDocuments() {
  return useMutation({
    mutationFn: async (docIds: string[]) => {
      return fetchAPI<{ job_count: number }>("/api/admin/kb/reindex", {
        method: "POST",
        body: JSON.stringify({ document_ids: docIds }),
      });
    },
  });
}
```

### API Integration Examples

**Note**: For canonical entity definitions (JSON Schema, Pydantic, TypeScript), see [DATA_MODEL.md](DATA_MODEL.md). This section provides usage examples specific to the admin panel.

**Knowledge Base Management (TypeScript):**

```typescript
// services/api/admin.ts
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Send JWT cookies
  headers: {
    "Content-Type": "application/json",
  },
});

export interface DocumentUploadResponse {
  documentId: string;
  filename: string;
  status: string;
  message: string;
}

export interface DocumentListResponse {
  id: string;
  filename: string;
  sourceType: string;
  specialty: string;
  status: string;
  fileSize: number;
  chunkCount?: number;
  uploadedAt: string;
  indexedAt?: string;
}

export interface ReindexRequest {
  documentIds: string[];
  force: boolean;
}

export interface ReindexResponse {
  jobId: string;
  documentCount: number;
  status: string;
  message: string;
}

// Upload document
export async function uploadDocument(
  file: File,
  sourceType: string,
  specialty: string,
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sourceType", sourceType);
  formData.append("specialty", specialty);

  const response = await api.post("/api/admin/knowledge/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

// List documents
export async function listDocuments(
  skip: number = 0,
  limit: number = 50,
  status?: string,
): Promise<DocumentListResponse[]> {
  const response = await api.get("/api/admin/knowledge/documents", {
    params: { skip, limit, status },
  });

  return response.data;
}

// Trigger reindex
export async function triggerReindex(documentIds: string[] = [], force: boolean = false): Promise<ReindexResponse> {
  const response = await api.post("/api/admin/knowledge/reindex", {
    documentIds,
    force,
  });

  return response.data;
}

// Get vector DB stats
export async function getVectorDBStats(): Promise<VectorDBStatsResponse> {
  const response = await api.get("/api/admin/knowledge/stats");
  return response.data;
}
```

**React Hook for Document Management:**

```typescript
// hooks/useDocuments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '@/services/api/admin';

export function useDocuments(skip = 0, limit = 50, status?: string) {
  return useQuery({
    queryKey: ['documents', skip, limit, status],
    queryFn: () => adminApi.listDocuments(skip, limit, status),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      sourceType,
      specialty,
    }: {
      file: File;
      sourceType: string;
      specialty: string;
    }) => adminApi.uploadDocument(file, sourceType, specialty),
    onSuccess: () => {
      // Invalidate documents list to refetch
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useReindexDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentIds,
      force,
    }: {
      documentIds: string[];
      force: boolean;
    }) => adminApi.triggerReindex(documentIds, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

// Usage in component
function KnowledgeBaseManager() {
  const { data: documents, isLoading } = useDocuments(0, 50);
  const uploadMutation = useUploadDocument();
  const reindexMutation = useReindexDocuments();

  const handleUpload = (file: File) => {
    uploadMutation.mutate({
      file,
      sourceType: 'textbook',
      specialty: 'cardiology',
    });
  };

  const handleReindexAll = () => {
    reindexMutation.mutate({
      documentIds: [], // Empty = reindex all
      force: false,
    });
  };

  return (
    <div>
      <button onClick={handleReindexAll} disabled={reindexMutation.isPending}>
        Reindex All Documents
      </button>
      {/* Document list and upload UI */}
    </div>
  );
}
```

**Real-time Metrics with WebSocket:**

```typescript
// hooks/useRealtimeMetrics.ts
import { useEffect, useState } from 'react';

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeSessions: number;
  apiCallsToday: number;
  errorRate: number;
}

export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/admin/metrics`);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  return { metrics, isConnected };
}

// Usage in dashboard component
function Dashboard() {
  const { metrics, isConnected } = useRealtimeMetrics();

  if (!isConnected) {
    return <div>Connecting to metrics stream...</div>;
  }

  if (!metrics) {
    return <div>Loading metrics...</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard title="Active Sessions" value={metrics.activeSessions} />
      <MetricCard title="API Calls Today" value={metrics.apiCallsToday} />
      <MetricCard title="CPU Usage" value={`${metrics.cpuUsage}%`} />
      <MetricCard title="Error Rate" value={`${metrics.errorRate}%`} />
    </div>
  );
}
```

## Authentication & Authorization

### Access Control

- **Admin Role**: Full access to all features
- **Viewer Role**: Read-only access (future)
- **API Keys**: Secure management with limited scopes

### Security

- Strong password requirements
- Two-factor authentication (TOTP)
- Session timeout
- Login attempt limiting
- Audit log of all admin actions

## Interface Layout

```
┌─────────────────────────────────────────────────────┐
│  Header                                              │
│  [Logo] Admin Panel          Dr. Nazmy [Logout] ⚙️  │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│  Sidebar     │  Main Content Area                   │
│  Menu        │                                       │
│              │  [Dashboard/Settings/etc content]    │
│  📊 Dashboard│                                       │
│  ⚙️  System  │                                       │
│  🤖 AI Models│                                       │
│  📚 Knowledge│                                       │
│  👤 Users    │                                       │
│  📈 Analytics│                                       │
│  🔌 Integrations                                     │
│  🔒 Security │                                       │
│  📋 Logs     │                                       │
│              │                                       │
└──────────────┴──────────────────────────────────────┘
```

## Core Pages

### 1. Dashboard (`/dashboard`)

**Full Dashboard Wireframe:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ VoiceAssist Admin                   🔔 Alerts (2)     Dr. Nazmy ▼     [Logout]     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Dashboard                                                    Last updated: 10s ago │
│                                                                                      │
│  ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐    │
│  │ Active Sessions  │ API Calls Today  │ Avg Response     │ Error Rate       │    │
│  │                  │                  │                  │                  │    │
│  │      3           │      1,247       │      1.8s        │      0.3%        │    │
│  │  ↑ +1 today      │  ↑ +12% vs avg  │  ↓ -0.2s         │  ↓ -0.1%         │    │
│  └──────────────────┴──────────────────┴──────────────────┴──────────────────┘    │
│                                                                                      │
│  ┌───────────────────────────────┬───────────────────────────────────────────┐    │
│  │ System Resources              │ Service Status                             │    │
│  │                               │                                            │    │
│  │  CPU Usage          68%  ████ │  ┌───────────────────────┬──────────┐    │    │
│  │  Memory Usage       45%  ███  │  │ FastAPI Backend       │  🟢 Up   │    │    │
│  │  GPU Usage (Ollama) 82%  █████│  │ PostgreSQL            │  🟢 Up   │    │    │
│  │  Disk Space         28%  ██   │  │ Redis Cache           │  🟢 Up   │    │    │
│  │  Network I/O        ↑12MB/s   │  │ Vector DB (Qdrant)    │  🟢 Up   │    │    │
│  │  WS Connections     3 active  │  │ Ollama (Local LLM)    │  🟢 Up   │    │    │
│  │                               │  │ OpenAI API            │  🟢 Up   │    │    │
│  │  [View Details]               │  │ Nextcloud             │  🟡 Slow │    │    │
│  │                               │  └───────────────────────┴──────────┘    │    │
│  │                               │                                            │    │
│  └───────────────────────────────┴───────────────────────────────────────────┘    │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │ Response Time (Last 24 Hours)                                             │     │
│  │                                                                            │     │
│  │  5s  ┤                                                                     │     │
│  │  4s  ┤                                                                     │     │
│  │  3s  ┤          ▄                                                          │     │
│  │  2s  ┤  ▄▄▄▄▄▄▄█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  Cloud API                         │     │
│  │  1s  ┤▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  Local Model                       │     │
│  │  0s  └─┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──────────                     │     │
│  │       00 02 04 06 08 10 12 14 16 18 20 22 Now                            │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│                                                                                      │
│  ┌──────────────────────────────────┬──────────────────────────────────────┐      │
│  │ Recent Activity                  │ Quick Actions                         │      │
│  │                                  │                                       │      │
│  │  [10:32] Query: HTN management   │  [⟳ Restart Services]                │      │
│  │  [10:28] Document indexed: DAPA  │  [🗑️ Clear Cache]                    │      │
│  │  [10:15] Query: Drug interaction │  [📚 Update Knowledge Base]          │      │
│  │  [09:58] Error: Nextcloud timeout│  [📋 View System Logs]               │      │
│  │  [09:45] Query: Lab interpretation│ [✓ Run Health Check]                │      │
│  │                                  │                                       │      │
│  │  [View All Activity]             │                                       │      │
│  └──────────────────────────────────┴──────────────────────────────────────┘      │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │ Alerts & Notifications                                                    │     │
│  │                                                                            │     │
│  │  ⚠️  [10:33] Nextcloud response time degraded (1.2s → 3.5s)              │     │
│  │  ℹ️  [08:00] Backup completed successfully (Database: 2.3GB)             │     │
│  │                                                                            │     │
│  │  [View All Alerts]                                                        │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Dashboard Components Summary

**System metrics defined in [OBSERVABILITY.md](../docs/OBSERVABILITY.md).**

**System Overview Cards:**

- Active Sessions: Current WebSocket/REST sessions
- API Calls Today: Total API requests with trend indicator
- Avg Response Time: Mean latency with change indicator
- Error Rate: Percentage of failed requests with trend

**Real-Time Metrics:**

- CPU, Memory, GPU usage with bar indicators
- Disk space utilization
- Network I/O (upload/download)
- Active WebSocket connections count

**Service Status Table:**

- Health check status for each service (🟢 Up, 🟡 Degraded, 🔴 Down)
- Last check timestamp
- Click to view detailed metrics

**Response Time Chart:**

- Line chart showing 24-hour latency trends
- Separate lines for local model vs cloud API
- Hoverable data points

**Recent Activity Feed:**

- Last 10-20 system events
- Query summaries (sanitized)
- Document indexing events
- Error notifications

**Quick Actions:**

- One-click service management
- Cache clearing
- Knowledge base updates
- Log viewing
- Health check execution

### 2. System Settings (`/system`)

**System settings are global** - they affect all users and the entire VoiceAssist instance.

#### System Settings Interface

Complete TypeScript interface for system-level configuration:

```typescript
// admin-panel/src/types/systemSettings.ts
export interface SystemSettings {
  // General System Configuration
  general: {
    systemName: string; // Display name (e.g., "VoiceAssist Production")
    systemDescription: string; // Description for documentation
    timezone: string; // Default system timezone (IANA)
    language: "en" | "es" | "fr"; // Default interface language
    maintenanceMode: boolean; // Enable maintenance mode (blocks users)
    maintenanceMessage: string; // Message shown during maintenance
  };

  // Data Retention & Cleanup
  dataRetention: {
    conversationLogs: number; // Days to keep conversation logs (7-365)
    errorLogs: number; // Days to keep error logs (30-365)
    accessLogs: number; // Days to keep access logs (30-730)
    auditLogs: number; // Days to keep audit logs (365-2555)
    tempFiles: number; // Days to keep temp files (1-30)
    autoCleanup: boolean; // Enable automatic cleanup
    cleanupSchedule: string; // Cron expression for cleanup
  };

  // Backup Configuration
  backup: {
    enabled: boolean;
    destination: "local" | "nextcloud" | "s3" | "custom";
    schedule: string; // Cron expression
    retention: number; // Number of backups to keep
    includeDatabase: boolean;
    includeVectorDB: boolean;
    includeDocuments: boolean;
    includeConfiguration: boolean;
    includeLogs: boolean;
    compression: "none" | "gzip" | "zstd";
    encryption: boolean;
  };

  // Model Routing & AI Configuration
  ai: {
    // Default model preferences
    defaultLocalModel: string; // e.g., "llama-3.1-8b"
    defaultCloudModel: string; // e.g., "gpt-4-turbo"
    defaultEmbeddingModel: string; // e.g., "text-embedding-3-large"

    // Routing rules
    routingStrategy: "auto" | "always_local" | "always_cloud";
    phiDetectionEnabled: boolean; // Auto-detect PHI and route to local
    phiKeywords: string[]; // Keywords that trigger PHI detection

    // Performance limits
    maxConcurrentRequests: number; // Max concurrent AI requests
    requestTimeout: number; // Timeout in seconds
    retryAttempts: number; // Number of retry attempts

    // Rate limiting (per user)
    rateLimits: {
      queriesPerMinute: number;
      queriesPerHour: number;
      queriesPerDay: number;
    };

    // Cost controls
    costLimits: {
      dailyLimit: number; // $ per day
      monthlyLimit: number; // $ per month
      alertThreshold: number; // % threshold for alerts (e.g., 80)
    };
  };

  // Logging & Monitoring
  logging: {
    level: "DEBUG" | "INFO" | "WARN" | "ERROR";
    structuredLogging: boolean; // JSON format
    logToFile: boolean;
    logToConsole: boolean;
    logToSyslog: boolean;
    sensitiveDataRedaction: boolean; // Redact PHI/PII from logs
    performanceLogging: boolean; // Log slow queries
    performanceThreshold: number; // ms threshold for slow query logging
  };

  // Security & Privacy
  security: {
    // Session management
    sessionTimeout: number; // Minutes of inactivity
    maxSessionDuration: number; // Max session duration in hours
    requireStrongPasswords: boolean;
    passwordMinLength: number;
    passwordRequireSpecialChars: boolean;
    passwordExpiryDays: number; // 0 = never

    // Two-factor authentication
    twoFactorRequired: boolean;
    twoFactorMethod: "totp" | "sms" | "email";

    // API security
    apiRateLimiting: boolean;
    apiRateLimit: number; // Requests per minute
    corsOrigins: string[]; // Allowed CORS origins

    // Audit logging
    auditAllActions: boolean;
    auditLoginAttempts: boolean;
    auditDataAccess: boolean;
    auditConfigChanges: boolean;
  };

  // Email Notifications (for alerts)
  email: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string; // Encrypted in storage
    smtpTLS: boolean;
    fromAddress: string;
    adminEmails: string[]; // Admins to notify
  };

  // Feature Flags
  features: {
    voiceEnabled: boolean;
    fileUploadEnabled: boolean;
    knowledgeBaseEnabled: boolean;
    nextcloudIntegration: boolean;
    calendarIntegration: boolean;
    emailIntegration: boolean;
    webSearchEnabled: boolean;
    betaFeatures: boolean;
  };

  // Resource Limits
  resources: {
    maxUploadSize: number; // MB
    maxDocuments: number; // Max documents in KB (0 = unlimited)
    maxVectorDBSize: number; // GB (0 = unlimited)
    maxConcurrentUsers: number; // (0 = unlimited)
  };
}

// Default system settings
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  general: {
    systemName: "VoiceAssist",
    systemDescription: "Medical AI Assistant",
    timezone: "UTC",
    language: "en",
    maintenanceMode: false,
    maintenanceMessage: "System is currently under maintenance. Please check back soon.",
  },
  dataRetention: {
    conversationLogs: 30,
    errorLogs: 90,
    accessLogs: 90,
    auditLogs: 365,
    tempFiles: 7,
    autoCleanup: true,
    cleanupSchedule: "0 2 * * *", // Daily at 2 AM
  },
  backup: {
    enabled: true,
    destination: "local",
    schedule: "0 2 * * *", // Daily at 2 AM
    retention: 7,
    includeDatabase: true,
    includeVectorDB: true,
    includeDocuments: true,
    includeConfiguration: true,
    includeLogs: false,
    compression: "gzip",
    encryption: true,
  },
  ai: {
    defaultLocalModel: "llama-3.1-8b",
    defaultCloudModel: "gpt-4-turbo",
    defaultEmbeddingModel: "text-embedding-3-large",
    routingStrategy: "auto",
    phiDetectionEnabled: true,
    phiKeywords: ["patient", "MRN", "DOB", "SSN", "medical record"],
    maxConcurrentRequests: 10,
    requestTimeout: 60,
    retryAttempts: 3,
    rateLimits: {
      queriesPerMinute: 20,
      queriesPerHour: 100,
      queriesPerDay: 1000,
    },
    costLimits: {
      dailyLimit: 50,
      monthlyLimit: 1000,
      alertThreshold: 80,
    },
  },
  logging: {
    level: "INFO",
    structuredLogging: true,
    logToFile: true,
    logToConsole: true,
    logToSyslog: false,
    sensitiveDataRedaction: true,
    performanceLogging: true,
    performanceThreshold: 1000,
  },
  security: {
    sessionTimeout: 30,
    maxSessionDuration: 8,
    requireStrongPasswords: true,
    passwordMinLength: 12,
    passwordRequireSpecialChars: true,
    passwordExpiryDays: 90,
    twoFactorRequired: false,
    twoFactorMethod: "totp",
    apiRateLimiting: true,
    apiRateLimit: 60,
    corsOrigins: [],
    auditAllActions: true,
    auditLoginAttempts: true,
    auditDataAccess: true,
    auditConfigChanges: true,
  },
  email: {
    enabled: false,
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpTLS: true,
    fromAddress: "",
    adminEmails: [],
  },
  features: {
    voiceEnabled: true,
    fileUploadEnabled: true,
    knowledgeBaseEnabled: true,
    nextcloudIntegration: true,
    calendarIntegration: true,
    emailIntegration: false,
    webSearchEnabled: true,
    betaFeatures: false,
  },
  resources: {
    maxUploadSize: 500,
    maxDocuments: 0,
    maxVectorDBSize: 0,
    maxConcurrentUsers: 0,
  },
};
```

#### Settings Comparison: User vs System

| Setting Category   | User Settings (Per-User)          | System Settings (Global)        |
| ------------------ | --------------------------------- | ------------------------------- |
| **Theme**          | ✅ User chooses dark/light        | ❌ Not configurable globally    |
| **Language**       | ✅ User's preferred language      | ✅ Default system language      |
| **Voice Input**    | ✅ User enables/disables          | ✅ System enables feature       |
| **Citations**      | ✅ User's display preference      | ❌ Not applicable               |
| **Logging**        | ❌ Not user-configurable          | ✅ System log level             |
| **Backups**        | ❌ Not user-configurable          | ✅ System backup schedule       |
| **AI Models**      | ✅ User preference (fast/quality) | ✅ System default models        |
| **Rate Limits**    | ❌ Applied system-wide            | ✅ System rate limit rules      |
| **Data Retention** | ✅ User's conversation retention  | ✅ System-wide retention policy |

#### System Settings Backend API

```python
# app/api/endpoints/admin/system_settings.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_admin_user
from app.models.user import User
from app.models.system_settings import SystemSettings as SystemSettingsModel
from app.api.schemas.system_settings import SystemSettingsSchema
from app.core.config import settings

router = APIRouter()

@router.get("/system/settings", response_model=SystemSettingsSchema)
async def get_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    Get system settings. Admin only.
    """
    system_settings = db.query(SystemSettingsModel).first()

    if not system_settings:
        # Return defaults
        return SystemSettingsSchema.get_defaults()

    return system_settings.settings

@router.patch("/system/settings", response_model=SystemSettingsSchema)
async def update_system_settings(
    settings_update: SystemSettingsSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    Update system settings. Admin only.
    Validates settings and logs changes to audit log.
    """
    system_settings = db.query(SystemSettingsModel).first()

    if not system_settings:
        # Create initial settings
        system_settings = SystemSettingsModel(settings={})
        db.add(system_settings)

    # Merge updates
    updated_settings = {**system_settings.settings, **settings_update.dict(exclude_unset=True)}

    # Validate critical settings
    if updated_settings['ai']['maxConcurrentRequests'] < 1:
        raise HTTPException(status_code=400, detail="maxConcurrentRequests must be >= 1")

    if updated_settings['dataRetention']['conversationLogs'] < 7:
        raise HTTPException(status_code=400, detail="Conversation log retention must be >= 7 days")

    # Log change to audit log
    from app.models.audit_log import AuditLog
    audit_entry = AuditLog(
        user_id=current_user.id,
        action='system_settings_update',
        resource='system_settings',
        changes=settings_update.dict(exclude_unset=True)
    )
    db.add(audit_entry)

    system_settings.settings = updated_settings
    db.commit()
    db.refresh(system_settings)

    # Trigger settings reload in all services
    from app.core.events import emit_settings_change
    emit_settings_change()

    return system_settings.settings

@router.post("/system/settings/validate")
async def validate_system_settings(
    settings: SystemSettingsSchema,
    current_user: User = Depends(get_admin_user)
):
    """
    Validate system settings without saving.
    Returns validation errors if any.
    """
    errors = []

    # Validate email settings if enabled
    if settings.email.enabled:
        if not settings.email.smtpHost:
            errors.append("SMTP host is required when email is enabled")
        if not settings.email.fromAddress:
            errors.append("From address is required when email is enabled")

    # Validate backup settings
    if settings.backup.enabled:
        if settings.backup.retention < 1:
            errors.append("Backup retention must be at least 1")

    # Validate AI settings
    if settings.ai.rateLimits.queriesPerMinute < 1:
        errors.append("Rate limit must be at least 1 query per minute")

    if errors:
        return {"valid": False, "errors": errors}

    return {"valid": True, "errors": []}
```

#### System Settings Storage

System settings are stored in:

1. **PostgreSQL** `system_settings` table (single row)
2. **Redis cache** for fast access (with 5-minute TTL)
3. **File backup** in `/etc/voiceassist/system.json` (read on startup)

When settings change:

1. Database is updated
2. Redis cache is invalidated
3. WebSocket broadcast to all services
4. Services reload configuration

### 3. AI Models Configuration (`/models`)

#### Model Selection

**Local Models (Ollama)**

```
┌──────────────────────────────────────────┐
│ Local Model: [Dropdown]                  │
│   ● Llama 3.1 8B                         │
│   ● Llama 3.1 70B                        │
│   ● Mistral 7B                           │
│   ● Mixtral 8x7B                         │
│                                           │
│ [Download New Model]                     │
└──────────────────────────────────────────┘
```

**Cloud API Configuration**

```
┌──────────────────────────────────────────┐
│ OpenAI                                    │
│   API Key: [••••••••••••key] [Test]      │
│   Model: gpt-4-turbo                     │
│   Max Tokens: 4096                       │
│   Temperature: 0.7                       │
│                                           │
│ Anthropic Claude (Optional)              │
│   API Key: [Not configured] [Add]        │
└──────────────────────────────────────────┘
```

#### Routing Logic

```
┌──────────────────────────────────────────┐
│ Request Routing                          │
│                                           │
│ ☑️ Auto-route based on privacy          │
│ ☐ Always use local model                │
│ ☐ Always use cloud API                  │
│                                           │
│ Classification Rules:                    │
│   • File access → Local                  │
│   • PHI detected → Local                 │
│   • Medical literature → Cloud           │
│   • Complex reasoning → Cloud            │
│                                           │
│ [Edit Rules]                             │
└──────────────────────────────────────────┘
```

#### Embedding Models

- OpenAI text-embedding-3-large (cloud)
- Local embedding model (if installed)
- Benchmark performance

#### Model Performance

- Average response time per model
- Token usage and costs
- Success/failure rates
- Switch recommendations based on usage

### 4. Knowledge Base Management (`/knowledge`)

**Full Knowledge Base Page Wireframe:**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Knowledge Base Management                                         [Upload Document] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐     │
│  │ 📊 Statistics                                                               │     │
│  │                                                                              │     │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────┐            │     │
│  │  │ Documents    │ Total Chunks │ Vector Size  │ Avg Query    │            │     │
│  │  │              │              │              │ Latency      │            │     │
│  │  │    247       │    128,452   │    8.4 GB    │    0.12s     │            │     │
│  │  └──────────────┴──────────────┴──────────────┴──────────────┘            │     │
│  │                                                                              │     │
│  │  Most Queried Topics: Cardiology (487) · Diabetes (312) · ID (234)         │     │
│  └────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐     │
│  │ 🔧 Indexing Jobs                                   [View All Jobs]          │     │
│  │                                                                              │     │
│  │  ⏳ In Progress: "SPRINT Trial" (PDF, 45 pages) - 67% complete             │     │
│  │  ✅ Completed: "Harrison's Ch. 234-240" - 3 minutes ago                    │     │
│  │  ❌ Failed: "corrupted_file.pdf" - Invalid format [Retry]                  │     │
│  └────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐     │
│  │ 📚 Document Library                                                         │     │
│  │                                                                              │     │
│  │  [🔍 Search documents...]                                                   │     │
│  │                                                                              │     │
│  │  Filters:  Type: [All ▼]  Specialty: [All ▼]  Status: [Indexed ▼]        │     │
│  │  Sort by: [Last Modified ▼]                              Showing 1-10 of 247│     │
│  │                                                                              │     │
│  │  ┌───┬─────────────────────┬───────────┬────────┬──────────┬────────────┐ │     │
│  │  │ ☑ │ Name                │ Type      │ Pages  │ Chunks   │ Actions    │ │     │
│  │  ├───┼─────────────────────┼───────────┼────────┼──────────┼────────────┤ │     │
│  │  │ ☐ │ Harrison's Princ... │ Textbook  │ 3,402  │  18,234  │ 👁️ ⚙️ ⬇️ 🗑️│ │     │
│  │  │   │ Internal Medicine   │           │        │          │            │ │     │
│  │  │   │ 21st Edition        │           │        │          │            │ │     │
│  │  │   │ 🏷️ Cardiology, GI   │ ✅ Indexed│        │ 12 days  │            │ │     │
│  │  ├───┼─────────────────────┼───────────┼────────┼──────────┼────────────┤ │     │
│  │  │ ☐ │ DAPA-HF Trial       │ Journal   │   15   │    145   │ 👁️ ⚙️ ⬇️ 🗑️│ │     │
│  │  │   │ NEJM 2019           │           │        │          │            │ │     │
│  │  │   │ 🏷️ Cardiology       │ ✅ Indexed│        │ 3 days   │            │ │     │
│  │  ├───┼─────────────────────┼───────────┼────────┼──────────┼────────────┤ │     │
│  │  │ ☐ │ 2023 AHA/ACC HTN    │ Guideline │   86   │    892   │ 👁️ ⚙️ ⬇️ 🗑️│ │     │
│  │  │   │ Guidelines          │           │        │          │            │ │     │
│  │  │   │ 🏷️ Cardiology, HTN  │ ✅ Indexed│        │ 1 week   │            │ │     │
│  │  ├───┼─────────────────────┼───────────┼────────┼──────────┼────────────┤ │     │
│  │  │ ☐ │ UpToDate: DKA Mgmt  │ Reference │    8   │     67   │ 👁️ ⚙️ ⬇️ 🗑️│ │     │
│  │  │   │ Updated Oct 2024    │           │        │          │            │ │     │
│  │  │   │ 🏷️ Endocrinology    │ ✅ Indexed│        │ 2 days   │            │ │     │
│  │  ├───┼─────────────────────┼───────────┼────────┼──────────┼────────────┤ │     │
│  │  │ ☐ │ IDSA Sepsis Guide   │ Guideline │   42   │    438   │ 👁️ ⚙️ ⬇️ 🗑️│ │     │
│  │  │   │ 2024 Edition        │           │        │          │            │ │     │
│  │  │   │ 🏷️ ID, ICU          │ ⏳ Indexing│       │ Now      │            │ │     │
│  │  └───┴─────────────────────┴───────────┴────────┴──────────┴────────────┘ │     │
│  │                                                                              │     │
│  │  [◀ Previous]  [1] [2] [3] ... [25]  [Next ▶]                              │     │
│  │                                                                              │     │
│  │  Bulk Actions: [☑ Select All]  [⚙️ Re-index Selected]  [🗑️ Delete Selected] │     │
│  └────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Upload Document Modal:**

```
┌─────────────────────────────────────────────────────────────┐
│ Upload Medical Documents                            [✕ Close]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │        📄 Drag & Drop Files Here                     │   │
│  │                  or                                   │   │
│  │             [Browse Files]                            │   │
│  │                                                       │   │
│  │  Supported: PDF, DOCX (max 500 MB)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  Selected Files:                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • harrison_chapter_45.pdf (12.4 MB)           [✕]   │   │
│  │ • ACC_HF_Guidelines_2024.pdf (5.8 MB)         [✕]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  Document Type: [Dropdown ▼]                                 │
│    ● Medical Textbook                                         │
│    ○ Journal Article                                          │
│    ○ Clinical Guideline                                       │
│    ○ Reference Material (UpToDate, etc.)                     │
│    ○ Trial/Study                                              │
│                                                               │
│  Specialty Tags: [Multi-select]                              │
│    [Cardiology ✕] [Endocrinology ✕] [+ Add Tag]             │
│                                                               │
│  Metadata (Optional):                                         │
│    Title: _______________________________________________     │
│    Author(s): ___________________________________________     │
│    Publication Year: [2024 ▼]                                │
│    Edition/Version: _____________________________________     │
│    DOI/PMID: ____________________________________________     │
│                                                               │
│  Indexing Options:                                            │
│    ☑ Start indexing immediately                              │
│    ☑ Extract metadata automatically                          │
│    ☑ Detect specialty from content                           │
│    ☐ High priority (index first)                            │
│                                                               │
│  [Cancel]                              [Upload & Index] ✓   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Document Detail View:**

```
┌─────────────────────────────────────────────────────────────┐
│ Document Details                                   [✕ Close] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📖 Harrison's Principles of Internal Medicine - Chapter 45  │
│     Atrial Fibrillation and Flutter                          │
│                                                               │
│  ┌──────────────────┬────────────────────────────────────┐  │
│  │ Status           │ ✅ Indexed                         │  │
│  │ Document Type    │ Medical Textbook                   │  │
│  │ Specialty        │ Cardiology, Arrhythmia             │  │
│  │ Pages            │ 18                                  │  │
│  │ Chunks Generated │ 124                                 │  │
│  │ File Size        │ 2.4 MB                              │  │
│  │ Uploaded         │ Nov 10, 2024 10:34 AM              │  │
│  │ Last Indexed     │ Nov 10, 2024 10:38 AM (4m 23s)    │  │
│  │ Uploaded By      │ Dr. Nazmy                          │  │
│  └──────────────────┴────────────────────────────────────┘  │
│                                                               │
│  Metadata:                                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Authors:  Dennis Kasper, Stephen Hauser, et al.       │  │
│  │ Edition:  21st Edition                                 │  │
│  │ Year:     2022                                         │  │
│  │ Publisher: McGraw-Hill                                 │  │
│  │ ISBN:     978-1264268504                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Usage Statistics:                                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Times Cited:      487                                  │  │
│  │ Last Accessed:    2 hours ago                          │  │
│  │ Avg Relevance:    0.82 (High)                          │  │
│  │ Most Cited In:    AF management, stroke prevention    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Indexing Details:                                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Chunking Strategy: Semantic (500 token windows)       │  │
│  │ Embedding Model:   text-embedding-3-large             │  │
│  │ Vector Dimensions: 3072                                │  │
│  │ Processing Time:   4m 23s                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Sample Chunks (first 3 of 124):                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. "Atrial fibrillation (AF) is the most common      │  │
│  │     sustained cardiac arrhythmia, affecting 1-2% of  │  │
│  │     the general population..."                        │  │
│  │                                                        │  │
│  │ 2. "Risk stratification for stroke prevention uses   │  │
│  │     the CHA2DS2-VASc score. Patients with scores     │  │
│  │     ≥2 should receive anticoagulation..."            │  │
│  │                                                        │  │
│  │ 3. "Rate control strategies include beta-blockers,   │  │
│  │     calcium channel blockers, and digoxin..."         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  [⬇️ Download PDF]  [⚙️ Re-index]  [🗑️ Delete Document]     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Knowledge Base Management Endpoints

All KB management endpoints use the standard API envelope pattern. See [server/README.md](../server/README.md#standard-api-response-envelope) for complete specification.

| Endpoint                        | Method | Purpose              | Request                     | Response                           |
| ------------------------------- | ------ | -------------------- | --------------------------- | ---------------------------------- |
| `/api/admin/kb/documents`       | GET    | List documents       | Query params (filters)      | `APIEnvelope<KnowledgeDocument[]>` |
| `/api/admin/kb/documents/{id}`  | GET    | Get document details | -                           | `APIEnvelope<KnowledgeDocument>`   |
| `/api/admin/kb/documents`       | POST   | Upload document      | FormData (file)             | `APIEnvelope<IndexingJob>`         |
| `/api/admin/kb/documents/{id}`  | DELETE | Delete document      | -                           | `APIEnvelope<{success: true}>`     |
| `/api/admin/kb/jobs`            | GET    | List indexing jobs   | Query params (state filter) | `APIEnvelope<IndexingJob[]>`       |
| `/api/admin/kb/jobs/{id}`       | GET    | Get job details      | -                           | `APIEnvelope<IndexingJob>`         |
| `/api/admin/kb/jobs/{id}/retry` | POST   | Retry failed job     | -                           | `APIEnvelope<IndexingJob>`         |
| `/api/admin/kb/reindex`         | POST   | Bulk reindex         | `{document_ids: string[]}`  | `APIEnvelope<{job_count: number}>` |
| `/api/admin/kb/search`          | POST   | Test search          | `{query, filters}`          | `APIEnvelope<SearchResult[]>`      |

All endpoints return standard `APIEnvelope` as defined in [server/README.md](../server/README.md#standard-api-response-envelope).
All entity types reference [DATA_MODEL.md](DATA_MODEL.md).

---

### Indexing Job UI Flow

Complete flow from document upload to indexed status:

```
┌────────────────────────────────────────────────────────────────┐
│                   Document Upload & Indexing Flow               │
└────────────────────────────────────────────────────────────────┘

User selects file
    ↓
[1. Client validation]
    └─→ Check file type (PDF, DOCX)
    └─→ Check file size (< 50MB)
    ↓
[2. Upload: POST /api/admin/kb/documents]
    └─→ FormData with file
    └─→ Returns: APIEnvelope<IndexingJob>
    ↓
[3. Job created: state = "pending"]
    └─→ Show in "Indexing Jobs" list
    └─→ Display: "Queued"
    ↓
[4. Backend worker picks up job]
    └─→ State transition: pending → running
    ↓
[5. Job running: state = "running"]
    └─→ UI polls: GET /api/admin/kb/jobs/{id}
    └─→ Display progress: "Processing... {processed_chunks}/{total_chunks}"
    └─→ Show spinner
    ↓
[6a. Success: state = "completed"]
    └─→ Display: "✓ Indexed successfully"
    └─→ Show document in KB list
    └─→ Stop polling

[6b. Failure: state = "failed"]
    └─→ Display: "✗ Failed: {error_message}"
    └─→ Show "Retry" button
    └─→ Stop polling

[7. User clicks "Retry" (if failed)]
    └─→ POST /api/admin/kb/jobs/{id}/retry
    └─→ Job state: failed → pending
    └─→ Resume polling

Polling Strategy:
- Interval: 2 seconds while job is "running"
- Exponential backoff if server errors
- Stop when state is "completed" or "failed"
- Timeout after 5 minutes (show error)

Alternative: WebSocket Updates
- Connect to /ws/admin/jobs
- Receive real-time state updates
- No polling needed
```

---

### Indexing Jobs Hook Example

Complete React hook for managing indexing jobs:

```typescript
// admin/hooks/useIndexingJobs.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAPI } from "@/lib/api";
import { IndexingJob } from "@/types"; // From DATA_MODEL.md

interface UseIndexingJobsOptions {
  stateFilter?: "pending" | "running" | "completed" | "failed";
  pollInterval?: number; // Milliseconds (default: 2000)
}

export function useIndexingJobs(options: UseIndexingJobsOptions = {}) {
  const { stateFilter, pollInterval = 2000 } = options;
  const queryClient = useQueryClient();

  // Fetch jobs list
  const jobsQuery = useQuery({
    queryKey: ["indexing-jobs", stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stateFilter) params.append("state", stateFilter);

      return fetchAPI<IndexingJob[]>(`/api/admin/kb/jobs?${params.toString()}`);
    },
    refetchInterval: (data) => {
      // Poll if any jobs are running
      const hasRunningJobs = data?.some((job) => job.state === "running");
      return hasRunningJobs ? pollInterval : false;
    },
  });

  // Retry failed job
  const retryJob = useMutation({
    mutationFn: async (jobId: string) => {
      return fetchAPI<IndexingJob>(`/api/admin/kb/jobs/${jobId}/retry`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      // Refetch jobs list
      queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] });
      toast.success("Job retry initiated");
    },
    onError: (error: APIError) => {
      if (error.code === "VALIDATION_ERROR") {
        toast.error("Cannot retry: Max retries exceeded");
      } else {
        toast.error(`Retry failed: ${error.message}`);
      }
    },
  });

  // Bulk reindex
  const reindexDocuments = useMutation({
    mutationFn: async (documentIds: string[]) => {
      return fetchAPI<{ job_count: number }>("/api/admin/kb/reindex", {
        method: "POST",
        body: JSON.stringify({ document_ids: documentIds }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] });
      toast.success(`${data.job_count} indexing jobs created`);
    },
  });

  return {
    jobs: jobsQuery.data || [],
    isLoading: jobsQuery.isLoading,
    isError: jobsQuery.isError,
    error: jobsQuery.error,
    retryJob: retryJob.mutate,
    isRetrying: retryJob.isPending,
    reindexDocuments: reindexDocuments.mutate,
    isReindexing: reindexDocuments.isPending,
  };
}

// Fetch single job with detailed progress
export function useIndexingJob(jobId: string) {
  return useQuery({
    queryKey: ["indexing-job", jobId],
    queryFn: async () => {
      return fetchAPI<IndexingJob>(`/api/admin/kb/jobs/${jobId}`);
    },
    refetchInterval: (data) => {
      // Poll while job is running
      return data?.state === "running" ? 2000 : false;
    },
    enabled: !!jobId,
  });
}
```

**Usage in Component:**

```typescript
// admin/components/IndexingJobsList.tsx

export function IndexingJobsList() {
  const { jobs, isLoading, retryJob } = useIndexingJobs({
    stateFilter: undefined, // Show all jobs
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="jobs-list">
      <h2>Indexing Jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>State</th>
            <th>Progress</th>
            <th>Started</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id}>
              <td>{job.doc_key}</td>
              <td>
                <JobStateBadge state={job.state} />
              </td>
              <td>
                {job.state === 'running' && (
                  <ProgressBar
                    value={job.processed_chunks}
                    max={job.total_chunks || 100}
                  />
                )}
                {job.processed_chunks}/{job.total_chunks || '?'}
              </td>
              <td>{formatDate(job.started_at)}</td>
              <td>
                {job.state === 'failed' && (
                  <button onClick={() => retryJob(job.id)}>
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

#### Document Library Features

**Table View:**

- Checkbox for bulk operations
- Sortable columns (name, type, pages, indexed date)
- Expandable rows showing tags and metadata
- Status indicators (✅ Indexed, ⏳ Indexing, ❌ Failed, 📝 Pending)
- Action buttons (👁️ View, ⚙️ Re-index, ⬇️ Download, 🗑️ Delete)

**Filters & Search:**

- Full-text search across titles, authors, content
- Filter by document type (textbook, journal, guideline, etc.)
- Filter by specialty (multi-select)
- Filter by status (indexed, pending, failed)
- Filter by date range
- Sort by: name, date added, date modified, pages, usage count

**Document Actions:**

- 👁️ View details & metadata with usage stats
- ⚙️ Re-index (with progress tracking)
- ⬇️ Download original PDF
- 🗑️ Delete (with confirmation)
- 📊 View citation analytics

#### Bulk Operations

**Available Actions:**

- Select all / Select filtered
- Batch re-indexing with priority queue
- Batch delete with confirmation
- Export metadata to CSV/JSON
- Bulk tag editing
- Backup selected documents

#### Indexing Status Panel

**Real-time Progress:**

- Current job name and status
- Progress bar with percentage
- Estimated time remaining
- Chunks processed / total
- Error count

**Queue Management:**

- List of pending indexing jobs
- Priority queue reordering
- Pause/resume indexing
- Cancel job option
- Retry failed jobs

#### Vector Database Statistics

**Metrics Display:**

- Total documents indexed
- Total text chunks generated
- Total vector embeddings
- Database disk size
- Index memory usage
- Average query latency
- Query throughput (queries/sec)
- Cache hit rate

**Top Queried Topics:**

- Bar chart of most-accessed specialties
- Most cited documents
- Trending topics this week
- Underutilized documents

### 5. User Management (`/users`)

**Note**: For single-user initially, this section is minimal. Expandable for multi-user future.

#### User Profile

- Name and email
- Profile picture
- Medical specialty
- Preferences

#### Session Management

- Active sessions
- Device/browser info
- Last activity
- Revoke session

#### API Keys (Personal)

- Generate API keys for programmatic access
- Scoped permissions
- Usage tracking
- Revoke keys

### 6. Analytics & Usage (`/analytics`)

#### Query Analytics

**Overview Metrics**

- Total queries (by period)
- Unique topics
- Most common medical specialties
- Peak usage times

**Query Type Distribution** (Pie Chart)

- Medical literature: 40%
- Textbook queries: 25%
- System commands: 20%
- Web search: 15%

**Popular Topics** (Bar Chart)

- Cardiology: 120 queries
- Diabetes: 95 queries
- Infectious Disease: 78 queries
- ...

**Response Time Trends** (Line Chart)

- Average response time over 30 days
- Separate lines for local vs cloud

#### Cost Analysis

**API Usage**

```
Month: November 2024

OpenAI API:
  - Total tokens: 2,450,000
  - Estimated cost: $45.00
  - Breakdown:
    • GPT-4: $38.00 (1.8M tokens)
    • Embeddings: $5.00 (650k tokens)
    • Realtime API: $2.00 (4.5 hours)

Other APIs:
  - OpenEvidence: $10.00 (subscription)

Total: $55.00
```

**Cost Trends** (Line Chart)

- Daily/monthly spend over time
- Forecast next month

#### Knowledge Base Analytics

- Most accessed documents
- Citation frequency
- Specialties most queried
- Recent additions performance

#### User Activity

- Sessions per day
- Average session duration
- Conversation length (messages)
- Voice vs text usage ratio

#### Export Reports

- Generate PDF reports
- CSV data export
- Custom date ranges

### 7. Integrations (`/integrations`)

#### Nextcloud

```
┌──────────────────────────────────────────┐
│ Nextcloud Integration                    │
│                                           │
│ Status: 🟢 Connected                     │
│ URL: https://asimo.io/nextcloud          │
│ Username: mohammednazmy                  │
│                                           │
│ ☑️ Auto-index medical documents          │
│ ☑️ Backup conversations                  │
│ ☐ Sync bookmarks                         │
│                                           │
│ Last Sync: 2 minutes ago                 │
│                                           │
│ [Test Connection] [Disconnect]           │
└──────────────────────────────────────────┘
```

#### Calendar (macOS/Google)

```
┌──────────────────────────────────────────┐
│ Calendar Integration                     │
│                                           │
│ Status: 🟢 Enabled                       │
│ Source: macOS Calendar (AppleScript)     │
│                                           │
│ ☑️ Read events                           │
│ ☑️ Create events                         │
│ ☑️ Update events                         │
│ ☐ Delete events (disabled for safety)   │
│                                           │
│ [Test] [Configure]                       │
└──────────────────────────────────────────┘
```

#### Email

```
┌──────────────────────────────────────────┐
│ Email Integration                        │
│                                           │
│ Status: 🟡 Configured but disabled       │
│                                           │
│ IMAP Server: imap.gmail.com              │
│ SMTP Server: smtp.gmail.com              │
│ Email: doctor@example.com                │
│                                           │
│ ☐ Enable email access                   │
│                                           │
│ [Configure] [Test]                       │
└──────────────────────────────────────────┘
```

#### PubMed

```
┌──────────────────────────────────────────┐
│ PubMed / NCBI                            │
│                                           │
│ Status: 🟢 Active (Public API)           │
│                                           │
│ API Key (optional): [Not set]            │
│   (Increases rate limit if provided)     │
│                                           │
│ Queries today: 87 / 10,000 limit         │
│                                           │
│ [Test API]                               │
└──────────────────────────────────────────┘
```

#### OpenEvidence

```
┌──────────────────────────────────────────┐
│ OpenEvidence                             │
│                                           │
│ Status: 🔴 Not configured                │
│                                           │
│ API Key: [_______________] [Save]        │
│                                           │
│ [Sign up] [Test]                         │
└──────────────────────────────────────────┘
```

#### Web Search

```
┌──────────────────────────────────────────┐
│ Web Search                               │
│                                           │
│ Provider: [Brave Search API ▼]          │
│ API Key: [••••••••••••key]              │
│                                           │
│ ☑️ Enable web search                     │
│                                           │
│ [Test] [Configure]                       │
└──────────────────────────────────────────┘
```

### 8. Security & Privacy (`/security`)

#### Privacy Settings

```
┌──────────────────────────────────────────┐
│ Data Retention                           │
│                                           │
│ Conversation logs: [30 days ▼]          │
│ Error logs: [90 days ▼]                 │
│ Access logs: [1 year ▼]                 │
│                                           │
│ ☑️ Log all queries (for debugging)       │
│ ☐ Include PHI in logs (DANGEROUS)       │
└──────────────────────────────────────────┘
```

#### PHI Detection Rules

- Keyword list (MRN, patient name patterns, etc.)
- Regex patterns
- Directory blacklist (never send to cloud)
- Test PHI detector with examples

#### Data Handling Policy

- Document current privacy approach
- HIPAA compliance checklist
- Link to full privacy policy

#### Encryption

- Encryption at rest: Status
- Encryption in transit: Status
- Key management

#### Access Logs

- Admin login history
- Failed login attempts
- API access patterns
- Suspicious activity alerts

### 9. Logs & Monitoring (`/logs`)

#### Log Viewer

**Real-Time Logs**

```
┌──────────────────────────────────────────────────┐
│ [■ Pause] [⟳ Auto-refresh] [⬇️ Download]        │
├──────────────────────────────────────────────────┤
│ 2024-11-19 14:32:15 [INFO] New query received   │
│ 2024-11-19 14:32:16 [INFO] Routed to cloud      │
│ 2024-11-19 14:32:18 [INFO] Response generated   │
│ 2024-11-19 14:32:18 [DEBUG] Citations: 2        │
│ 2024-11-19 14:33:01 [ERROR] Nextcloud timeout   │
│ 2024-11-19 14:33:02 [WARN] Retrying connection  │
└──────────────────────────────────────────────────┘
```

**Filters**

- Log level (DEBUG, INFO, WARN, ERROR)
- Service (backend, vector-db, ollama, etc.)
- Time range
- Search text

#### Error Tracking

- Error summary dashboard
- Error rate over time
- Most common errors
- Stack traces
- Error resolution status

#### Performance Logs

- Slow query log (> 5s)
- API latency tracking
- Database query performance

### 10. Backups & Maintenance (`/maintenance`)

#### Backup Configuration

```
┌──────────────────────────────────────────┐
│ Automated Backups                        │
│                                           │
│ Destination: Nextcloud                   │
│ Schedule: Daily at 2:00 AM               │
│                                           │
│ Backup includes:                         │
│ ☑️ PostgreSQL database                   │
│ ☑️ Vector database                       │
│ ☑️ Uploaded documents                    │
│ ☑️ Configuration files                   │
│ ☐ Conversation logs                      │
│                                           │
│ Retention: [7 days ▼]                    │
│                                           │
│ Last backup: 8 hours ago                 │
│ Status: Success                          │
│                                           │
│ [Run Backup Now] [Restore]               │
└──────────────────────────────────────────┘
```

#### System Maintenance

- Database vacuum and optimization
- Clear old logs
- Rebuild vector index
- Clear Redis cache
- Prune old Docker images

#### Health Checks

- Run comprehensive system test
- Check all integrations
- Verify model availability
- Test API endpoints
- Database connectivity

#### Update Management

- Check for updates
- View changelog
- Schedule update
- Rollback to previous version

## Mobile Responsiveness

- Responsive layout for tablet access
- Essential metrics on mobile
- Touch-friendly controls
- Simplified navigation

## Notifications & Alerts

### Alert Types

- Critical: Service down
- Warning: High error rate, disk space low
- Info: Update available, backup completed

### Notification Channels

- In-app notifications
- Email alerts
- Webhook (Slack, Discord, etc.)

### Alert Configuration

- Set thresholds (CPU > 90%, error rate > 5%, etc.)
- Enable/disable specific alerts
- Quiet hours

## Tools & External Integrations

The admin panel provides comprehensive management of the tools layer and external service integrations. See [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) for complete tool specifications.

### Tools Overview Dashboard

```typescript
// Page: /admin/tools

interface ToolStatus {
  tool_name: string;
  enabled: boolean;
  category: 'calendar' | 'file' | 'medical' | 'calculation' | 'search';
  total_calls_24h: number;
  success_rate: number;
  avg_duration_ms: number;
  last_error?: string;
  last_error_at?: string;
  phi_enabled: boolean;
  requires_confirmation: boolean;
}

// Display: Grid of tool cards
{tools.map(tool => (
  <ToolCard>
    <Header>
      <Icon /> {tool.tool_name}
      <StatusBadge success_rate={tool.success_rate} />
    </Header>
    <Metrics>
      <Stat label="Calls (24h)" value={tool.total_calls_24h} />
      <Stat label="Success Rate" value={`${tool.success_rate}%`} />
      <Stat label="Avg Duration" value={`${tool.avg_duration_ms}ms`} />
    </Metrics>
    <Footer>
      <Toggle checked={tool.enabled} onChange={toggleTool} />
      <Button onClick={viewDetails}>Details</Button>
    </Footer>
  </ToolCard>
))}
```

**Key Metrics:**

- Total tool calls per tool (24h, 7d, 30d)
- Success rate percentage
- Average execution duration
- Error rate and last error
- PHI detection rate

### Tool Configuration

```typescript
// Page: /admin/tools/:tool_name

interface ToolConfiguration {
  tool_name: string;
  enabled: boolean;
  timeout_seconds: number;
  rate_limit_per_user: number;
  rate_limit_window_seconds: number;
  requires_confirmation: boolean;
  phi_enabled: boolean;
  custom_settings?: Record<string, any>;
}

// Example: Calendar Tool Configuration
<Form>
  <Toggle
    label="Enable Tool"
    checked={config.enabled}
  />

  <NumberInput
    label="Timeout (seconds)"
    value={config.timeout_seconds}
    min={5}
    max={300}
  />

  <NumberInput
    label="Rate Limit (calls per user)"
    value={config.rate_limit_per_user}
    min={1}
    max={1000}
  />

  <NumberInput
    label="Rate Limit Window (seconds)"
    value={config.rate_limit_window_seconds}
    options={[60, 300, 3600]}
  />

  <Toggle
    label="Require User Confirmation"
    checked={config.requires_confirmation}
    description="High-risk actions require explicit user approval"
  />

  <Toggle
    label="Allow PHI"
    checked={config.phi_enabled}
    description="Enable this tool for queries containing PHI"
  />

  <Button type="submit">Save Configuration</Button>
</Form>
```

### External API Integrations

```typescript
// Page: /admin/integrations

interface ExternalIntegration {
  name: string;
  category: 'medical_search' | 'calendar' | 'file_storage' | 'guidelines';
  status: 'connected' | 'disconnected' | 'error';
  api_key_configured: boolean;
  last_tested_at?: string;
  last_test_status?: 'success' | 'failure';
  requests_24h: number;
  error_rate: number;
}

// List of integrations:
const integrations: ExternalIntegration[] = [
  {
    name: 'OpenEvidence',
    category: 'medical_search',
    status: 'connected',
    api_key_configured: true,
    last_tested_at: '2025-11-20T10:30:00Z',
    last_test_status: 'success',
    requests_24h: 342,
    error_rate: 0.02,
  },
  {
    name: 'PubMed (NCBI E-utilities)',
    category: 'medical_search',
    status: 'connected',
    api_key_configured: false, // Public API
    last_tested_at: '2025-11-20T09:15:00Z',
    last_test_status: 'success',
    requests_24h: 156,
    error_rate: 0.01,
  },
  // ... more integrations
];

<IntegrationsList>
  {integrations.map(integration => (
    <IntegrationCard>
      <Header>
        <StatusIndicator status={integration.status} />
        <h3>{integration.name}</h3>
        <CategoryBadge category={integration.category} />
      </Header>

      <Metrics>
        <Stat label="Requests (24h)" value={integration.requests_24h} />
        <Stat label="Error Rate" value={`${(integration.error_rate * 100).toFixed(1)}%`} />
        <Stat label="Last Tested" value={formatRelativeTime(integration.last_tested_at)} />
      </Metrics>

      <Actions>
        <Button onClick={() => configureIntegration(integration.name)}>
          Configure
        </Button>
        <Button onClick={() => testConnection(integration.name)}>
          Test Connection
        </Button>
      </Actions>
    </IntegrationCard>
  ))}
</IntegrationsList>
```

**Supported Integrations:**

| Integration          | Category       | API Key Required | PHI Safe       | Purpose                         |
| -------------------- | -------------- | ---------------- | -------------- | ------------------------------- |
| OpenEvidence         | Medical Search | Yes              | Yes (external) | Evidence-based medicine search  |
| PubMed (NCBI)        | Medical Search | No               | Yes (external) | Biomedical literature search    |
| Nextcloud            | File Storage   | No (internal)    | No (local PHI) | Document storage and retrieval  |
| CalDAV Server        | Calendar       | No (internal)    | No (local PHI) | Calendar events (via Nextcloud) |
| Google Custom Search | Web Search     | Yes              | Yes (external) | General medical web search      |

### Integration Configuration UI

```typescript
// Page: /admin/integrations/:integration_name

interface IntegrationConfig {
  name: string;
  enabled: boolean;
  api_key?: string;
  api_url?: string;
  timeout_seconds: number;
  retry_attempts: number;
  rate_limit?: number;
  custom_headers?: Record<string, string>;
}

// Example: OpenEvidence Configuration
<Form>
  <TextInput
    label="API Key"
    type="password"
    value={config.api_key}
    placeholder="sk_test_..."
    helpText="Get your API key from openevidence.com/api-keys"
  />

  <TextInput
    label="API Base URL"
    value={config.api_url}
    placeholder="https://api.openevidence.com/v1"
  />

  <NumberInput
    label="Timeout (seconds)"
    value={config.timeout_seconds}
    min={10}
    max={60}
  />

  <NumberInput
    label="Retry Attempts"
    value={config.retry_attempts}
    min={0}
    max={5}
  />

  <NumberInput
    label="Rate Limit (requests/minute)"
    value={config.rate_limit}
    helpText="Leave empty for no limit"
  />

  <Button type="button" onClick={testConnection}>
    Test Connection
  </Button>

  <Button type="submit">
    Save Configuration
  </Button>
</Form>
```

### Tool Invocation Logs

```typescript
// Page: /admin/tools/logs

interface ToolInvocationLog {
  id: string;
  tool_name: string;
  user_email: string;
  session_id: string;
  call_id: string;
  arguments: Record<string, any>;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  duration_ms: number;
  phi_detected: boolean;
  confirmation_required: boolean;
  user_confirmed?: boolean;
  error_code?: string;
  error_message?: string;
  created_at: string;
}

// Display: Searchable table with filters
<ToolLogsTable>
  <Filters>
    <Select
      label="Tool"
      options={allTools}
      value={filter.tool_name}
    />
    <Select
      label="Status"
      options={['all', 'completed', 'failed', 'timeout']}
      value={filter.status}
    />
    <Toggle
      label="PHI Only"
      checked={filter.phi_only}
    />
    <DateRangePicker
      label="Date Range"
      value={filter.date_range}
    />
  </Filters>

  <Table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Tool</th>
        <th>User</th>
        <th>Status</th>
        <th>Duration</th>
        <th>PHI</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {logs.map(log => (
        <tr>
          <td>{formatDateTime(log.created_at)}</td>
          <td><code>{log.tool_name}</code></td>
          <td>{log.user_email}</td>
          <td><StatusBadge status={log.status} /></td>
          <td>{log.duration_ms}ms</td>
          <td>{log.phi_detected && <PHIBadge />}</td>
          <td>
            <Button onClick={() => viewDetails(log)}>View</Button>
          </td>
        </tr>
      ))}
    </tbody>
  </Table>
</ToolLogsTable>
```

### Tool Usage Analytics

```typescript
// Page: /admin/analytics/tools

interface ToolAnalytics {
  tool_name: string;
  period: '24h' | '7d' | '30d';
  total_calls: number;
  unique_users: number;
  success_count: number;
  failure_count: number;
  timeout_count: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  phi_detection_rate: number;
  calls_per_day: Array<{ date: string; count: number }>;
}

// Visualizations:
<Analytics>
  <MetricsGrid>
    <MetricCard
      title="Total Tool Calls"
      value={analytics.total_calls}
      trend={+12.5}
      period="vs last 7d"
    />
    <MetricCard
      title="Success Rate"
      value={`${(analytics.success_count / analytics.total_calls * 100).toFixed(1)}%`}
      trend={+2.3}
    />
    <MetricCard
      title="Avg Duration"
      value={`${analytics.avg_duration_ms}ms`}
      trend={-45}
      trendLabel="faster"
    />
    <MetricCard
      title="Unique Users"
      value={analytics.unique_users}
      trend={+8}
    />
  </MetricsGrid>

  <TimeSeriesChart
    title="Tool Calls Over Time"
    data={analytics.calls_per_day}
    xKey="date"
    yKey="count"
  />

  <BarChart
    title="Tool Usage by Tool"
    data={toolsUsage}
    xKey="tool_name"
    yKey="total_calls"
  />

  <PieChart
    title="Tool Status Distribution"
    data={[
      { label: 'Success', value: analytics.success_count },
      { label: 'Failed', value: analytics.failure_count },
      { label: 'Timeout', value: analytics.timeout_count },
    ]}
  />
</Analytics>
```

### Tool Health Monitoring

```typescript
// Component: ToolHealthMonitor

interface ToolHealth {
  tool_name: string;
  status: 'healthy' | 'degraded' | 'down';
  last_successful_call?: string;
  consecutive_failures: number;
  health_check_at: string;
}

<HealthMonitor>
  {toolsHealth.map(health => (
    <HealthCard status={health.status}>
      <h4>{health.tool_name}</h4>

      {health.status === 'down' && (
        <Alert severity="error">
          Tool is down. {health.consecutive_failures} consecutive failures.
          Last success: {formatRelativeTime(health.last_successful_call)}
        </Alert>
      )}

      {health.status === 'degraded' && (
        <Alert severity="warning">
          Tool performance degraded. Error rate above threshold.
        </Alert>
      )}

      {health.status === 'healthy' && (
        <Alert severity="success">
          Tool operating normally.
        </Alert>
      )}
    </HealthCard>
  ))}
</HealthMonitor>
```

**Related Documentation:**

- [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) - Complete tools layer specification
- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - Backend tool execution flow
- [DATA_MODEL.md](DATA_MODEL.md) - ToolCall and ToolResult entities
- [OBSERVABILITY.md](OBSERVABILITY.md) - Tool metrics and monitoring

## API for Admin Panel

### Endpoints

```
GET    /api/admin/dashboard          - Dashboard metrics
GET    /api/admin/services/status    - Service health
POST   /api/admin/services/restart   - Restart service
GET    /api/admin/models             - List models
PATCH  /api/admin/models/config      - Update model config
GET    /api/admin/knowledge          - List documents
POST   /api/admin/knowledge/upload   - Upload document
DELETE /api/admin/knowledge/:id      - Delete document
POST   /api/admin/knowledge/reindex  - Trigger reindex
GET    /api/admin/analytics/queries  - Query analytics
GET    /api/admin/analytics/costs    - Cost data
GET    /api/admin/integrations       - Integration status
PATCH  /api/admin/integrations/:name - Update integration
GET    /api/admin/logs               - Fetch logs
GET    /api/admin/users              - List users
POST   /api/admin/backup             - Trigger backup
GET    /api/admin/health             - System health check
```

## Security Considerations

- Admin panel on separate subdomain
- Strong authentication required
- Rate limiting on all endpoints
- Audit log all admin actions
- No sensitive data in client-side code
- HTTPS only
- CSRF protection

## Future Enhancements

### Advanced Features

- Multi-user management with roles
- Team collaboration features
- Custom dashboard widgets
- Scheduled reports via email
- Mobile admin app
- A/B testing for model performance
- Cost optimization recommendations
- Automated scaling suggestions

### AI-Powered Admin

- Anomaly detection in metrics
- Predictive maintenance alerts
- Intelligent log analysis
- Automatic optimization suggestions
