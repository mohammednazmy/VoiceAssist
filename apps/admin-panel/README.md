# VoiceAssist Admin Panel

**Status:** ✅ **Production Ready** (v2.0)
**Last Updated:** 2025-11-22

## Overview

The Admin Panel provides a comprehensive, secure web interface for managing and monitoring the VoiceAssist medical AI platform. Built with React, TypeScript, and modern web technologies, it features full authentication, role-based access control, and real-time system monitoring.

**Live Demo**: https://admin.asimo.io (requires admin credentials)

## ✨ Features

### 🔐 Security & Authentication
- **JWT-based Authentication**: Secure token-based login system
- **Admin-Only Access**: All routes protected with admin role verification
- **Session Management**: Automatic validation and logout
- **HIPAA Compliant**: Follows enterprise security standards

### 📊 Dashboard & Monitoring
- **Real-Time Metrics**: View user counts, active sessions, system health
- **Service Health**: Monitor PostgreSQL, Redis, and Qdrant status
- **Auto-Refresh**: Metrics update every 30 seconds
- **Visual Indicators**: Color-coded cards and status badges

### 👥 User Management
- **User Listing**: View all users with email, name, role, and status
- **Role Management**: Promote/demote users to admin role
- **Account Control**: Activate or deactivate user accounts
- **Statistics Dashboard**: Track total, active, and admin users

### 📚 Knowledge Base Management
- **Document Upload**: Support for PDF and TXT files (up to 50MB)
- **Status Tracking**: Monitor indexing progress (uploaded, processing, indexed, failed)
- **Document Actions**: View, reindex, or delete documents
- **Statistics**: Track total documents and processing queue

### ⚙️ System Configuration
- **Environment Settings**: Configure deployment environment
- **Database Configuration**: Adjust connection pool sizes
- **Feature Flags**: Toggle Voice Mode, RAG Search, Nextcloud Integration
- **Real-time Updates**: Save and apply configuration changes

## Technology Stack

- **React 18+**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Tremor**: Dashboard components and charts
- **TanStack Table**: Advanced data tables
- **Recharts**: Charts and visualizations
- **Socket.io**: Real-time metrics

## Project Structure

```
admin-panel/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── MetricCard.tsx
│   │   │   ├── ServiceStatus.tsx
│   │   │   └── ActivityFeed.tsx
│   │   ├── models/
│   │   │   ├── ModelSelector.tsx
│   │   │   └── RoutingConfig.tsx
│   │   ├── knowledge/
│   │   │   ├── DocumentTable.tsx
│   │   │   ├── UploadDialog.tsx
│   │   │   └── IndexingStatus.tsx
│   │   ├── analytics/
│   │   │   ├── QueryChart.tsx
│   │   │   ├── CostChart.tsx
│   │   │   └── UsageStats.tsx
│   │   ├── logs/
│   │   │   ├── LogViewer.tsx
│   │   │   └── LogFilters.tsx
│   │   └── integrations/
│   │       ├── IntegrationCard.tsx
│   │       └── ConfigDialog.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── System.tsx
│   │   ├── Models.tsx
│   │   ├── Knowledge.tsx
│   │   ├── Analytics.tsx
│   │   ├── Integrations.tsx
│   │   ├── Logs.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useMetrics.ts
│   │   ├── useWebSocket.ts
│   │   └── useAuth.ts
│   ├── services/
│   │   ├── adminApi.ts
│   │   └── websocket.ts
│   ├── stores/
│   │   └── adminStore.ts
│   ├── types/
│   │   ├── metrics.ts
│   │   ├── document.ts
│   │   └── integration.ts
│   └── utils/
│       └── formatters.ts
├── public/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- Admin API access credentials

### Setup

1. Install dependencies:
```bash
npm install
```

2. Configure:
```bash
cp .env.example .env.local
# Edit with admin API URL and credentials
```

3. Start development:
```bash
npm run dev
```

Access at `http://localhost:5174`

## Configuration

### Development Environment

Create `.env.local` for local development:

```bash
# API URLs (local development)
VITE_ADMIN_API_URL=http://localhost:8000/admin/api
VITE_WS_URL=ws://localhost:8000/admin/ws

# Environment
VITE_ENV=development

# Features
VITE_ENABLE_METRICS=true
VITE_ENABLE_LOGS=true
```

### Production Environment

Create `.env.production` for production builds:

```bash
# API URLs (production)
VITE_ADMIN_API_URL=https://admin.asimo.io/api
VITE_WS_URL=wss://admin.asimo.io/api/ws

# Environment
VITE_ENV=production

# Features
VITE_ENABLE_METRICS=true
VITE_ENABLE_LOGS=true
```

## TypeScript Types & Interfaces

Complete type definitions for all admin panel entities. All types are defined in `src/types/`.

### Core Types

```typescript
// src/types/document.ts
export interface KBDocument {
  id: string;
  filename: string;
  sourceType: 'textbook' | 'journal' | 'guideline' | 'reference' | 'trial';
  specialty: string;
  status: 'uploaded' | 'processing' | 'indexed' | 'failed';
  fileSize: number;
  chunkCount: number | null;
  uploadedAt: string;
  indexedAt: string | null;
  uploadedBy?: string;
  metadata?: {
    title?: string;
    authors?: string[];
    publicationYear?: number;
    edition?: string;
    doi?: string;
    pmid?: string;
    isbn?: string;
    publisher?: string;
  };
}

export interface IndexingJob {
  id: string;
  documentCount: number;
  processedCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  startedBy?: string;
}

export interface VectorDBStats {
  totalDocuments: number;
  totalChunks: number;
  vectorCount: number;
  indexedSize: number;
  embeddingDimension: number;
  diskSize?: string;
  avgQueryLatency?: number;
}

export interface DocumentUploadRequest {
  file: File;
  sourceType: string;
  specialty: string;
  metadata?: {
    title?: string;
    authors?: string[];
    publicationYear?: number;
    edition?: string;
    doi?: string;
    pmid?: string;
  };
  options?: {
    startIndexing?: boolean;
    extractMetadata?: boolean;
    detectSpecialty?: boolean;
    highPriority?: boolean;
  };
}

export interface DocumentUploadResponse {
  documentId: string;
  filename: string;
  status: string;
  message: string;
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
```

```typescript
// src/types/metrics.ts
export interface DashboardMetrics {
  activeSessions: number;
  apiCallsToday: number;
  avgResponseTime: number;
  errorRate: number;
  trends: {
    sessions: number;
    apiCalls: number;
    responseTime: number;
    errorRate: number;
  };
}

export interface SystemResources {
  cpu: {
    usage: number;  // Percentage
    cores: number;
  };
  memory: {
    usage: number;  // Percentage
    total: number;  // GB
    used: number;   // GB
  };
  gpu?: {
    usage: number;  // Percentage
    memory: {
      total: number;
      used: number;
    };
  };
  disk: {
    usage: number;  // Percentage
    total: number;  // GB
    free: number;   // GB
  };
  network: {
    upload: number;    // MB/s
    download: number;  // MB/s
  };
  websocketConnections: number;
}

export interface ServiceStatus {
  name: string;
  status: 'up' | 'degraded' | 'down';
  lastCheck: string;
  responseTime?: number;
  errorMessage?: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'query' | 'document_indexed' | 'error' | 'system_event';
  message: string;
  severity?: 'info' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  service?: string;
  acknowledged: boolean;
}
```

```typescript
// src/types/analytics.ts
export interface QueryAnalytics {
  totalQueries: number;
  period: string;
  uniqueTopics: number;
  mostCommonSpecialties: Array<{
    specialty: string;
    count: number;
  }>;
  peakUsageTimes: Array<{
    hour: number;
    count: number;
  }>;
  queryTypeDistribution: {
    medicalLiterature: number;
    textbook: number;
    systemCommands: number;
    webSearch: number;
  };
  popularTopics: Array<{
    topic: string;
    count: number;
  }>;
  responseTimes: Array<{
    timestamp: string;
    localModel: number;
    cloudAPI: number;
  }>;
}

export interface CostAnalytics {
  period: string;
  openAI: {
    totalTokens: number;
    estimatedCost: number;
    breakdown: {
      gpt4: { tokens: number; cost: number };
      embeddings: { tokens: number; cost: number };
      realtimeAPI: { hours: number; cost: number };
    };
  };
  otherAPIs: Array<{
    name: string;
    cost: number;
    type: 'usage' | 'subscription';
  }>;
  totalCost: number;
  forecast?: number;
}
```

```typescript
// src/types/integration.ts
export interface Integration {
  name: string;
  type: 'nextcloud' | 'calendar' | 'email' | 'pubmed' | 'openevidence' | 'websearch';
  status: 'connected' | 'configured' | 'disconnected' | 'error';
  config: Record<string, any>;
  lastSync?: string;
  errorMessage?: string;
}

export interface NextcloudIntegration extends Integration {
  type: 'nextcloud';
  config: {
    url: string;
    username: string;
    autoIndex: boolean;
    backup: boolean;
    syncBookmarks: boolean;
  };
}

export interface CalendarIntegration extends Integration {
  type: 'calendar';
  config: {
    source: 'macos' | 'google' | 'caldav';
    readEvents: boolean;
    createEvents: boolean;
    updateEvents: boolean;
    deleteEvents: boolean;
  };
}
```

```typescript
// src/types/log.ts
export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  service: string;
  message: string;
  metadata?: Record<string, any>;
  stackTrace?: string;
}

export interface LogFilters {
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'all';
  service?: string | 'all';
  search?: string;
  timeRange?: {
    start: string;
    end: string;
  };
}
```

### API Client

Complete typed API client implementation.

```typescript
// src/services/adminApi.ts
import axios, { AxiosInstance } from 'axios';
import type {
  KBDocument,
  IndexingJob,
  VectorDBStats,
  DocumentUploadRequest,
  DocumentUploadResponse,
  ReindexRequest,
  ReindexResponse,
  DashboardMetrics,
  SystemResources,
  ServiceStatus,
  ActivityEvent,
  QueryAnalytics,
  CostAnalytics,
  Integration,
  LogEntry,
  LogFilters
} from '../types';

class AdminAPIClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  // Dashboard APIs
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const { data } = await this.client.get('/admin/dashboard');
    return data;
  }

  async getSystemResources(): Promise<SystemResources> {
    const { data } = await this.client.get('/admin/system/resources');
    return data;
  }

  async getServiceStatus(): Promise<ServiceStatus[]> {
    const { data } = await this.client.get('/admin/services/status');
    return data;
  }

  async getRecentActivity(): Promise<ActivityEvent[]> {
    const { data } = await this.client.get('/admin/activity');
    return data;
  }

  // Knowledge Base APIs
  async listDocuments(params?: {
    skip?: number;
    limit?: number;
    status?: string;
    sourceType?: string;
    specialty?: string;
  }): Promise<KBDocument[]> {
    const { data } = await this.client.get('/admin/knowledge/documents', { params });
    return data;
  }

  async uploadDocument(request: DocumentUploadRequest): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', request.file);
    formData.append('sourceType', request.sourceType);
    formData.append('specialty', request.specialty);

    if (request.metadata) {
      Object.entries(request.metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          formData.append(`metadata[${key}]`, String(value));
        }
      });
    }

    if (request.options) {
      Object.entries(request.options).forEach(([key, value]) => {
        formData.append(`options[${key}]`, String(value));
      });
    }

    const { data } = await this.client.post('/admin/knowledge/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return data;
  }

  async triggerReindex(request: ReindexRequest): Promise<ReindexResponse> {
    const { data } = await this.client.post('/admin/knowledge/reindex', request);
    return data;
  }

  async getIndexingJobs(limit: number = 20): Promise<IndexingJob[]> {
    const { data } = await this.client.get('/admin/knowledge/jobs', {
      params: { limit }
    });
    return data;
  }

  async getVectorDBStats(): Promise<VectorDBStats> {
    const { data } = await this.client.get('/admin/knowledge/stats');
    return data;
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.client.delete(`/admin/knowledge/${documentId}`);
  }

  // Analytics APIs
  async getQueryAnalytics(params?: {
    period?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<QueryAnalytics> {
    const { data } = await this.client.get('/admin/analytics/queries', { params });
    return data;
  }

  async getCostAnalytics(params?: {
    period?: string;
  }): Promise<CostAnalytics> {
    const { data } = await this.client.get('/admin/analytics/costs', { params });
    return data;
  }

  // Integration APIs
  async getIntegrations(): Promise<Integration[]> {
    const { data } = await this.client.get('/admin/integrations');
    return data;
  }

  async updateIntegration(name: string, config: Record<string, any>): Promise<Integration> {
    const { data } = await this.client.patch(`/admin/integrations/${name}`, config);
    return data;
  }

  async testIntegration(name: string): Promise<{ success: boolean; message: string }> {
    const { data } = await this.client.post(`/admin/integrations/${name}/test`);
    return data;
  }

  // Logs APIs
  async getLogs(filters?: LogFilters, params?: {
    skip?: number;
    limit?: number;
  }): Promise<LogEntry[]> {
    const { data } = await this.client.get('/admin/logs', {
      params: { ...filters, ...params }
    });
    return data;
  }

  // System APIs
  async restartService(serviceName: string): Promise<void> {
    await this.client.post(`/admin/services/restart`, { service: serviceName });
  }

  async runHealthCheck(): Promise<Record<string, any>> {
    const { data } = await this.client.post('/admin/system/health-check');
    return data;
  }
}

// Export singleton instance
export const adminApi = new AdminAPIClient(
  import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:8000/api'
);
```

### Custom Hooks with Types

```typescript
// src/hooks/useDocuments.ts
import { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import type { KBDocument } from '../types';

export function useDocuments(filters?: {
  status?: string;
  sourceType?: string;
  specialty?: string;
}) {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const data = await adminApi.listDocuments(filters);
      setDocuments(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [filters]);

  const uploadDocument = async (file: File, metadata: any) => {
    const response = await adminApi.uploadDocument({
      file,
      sourceType: metadata.sourceType,
      specialty: metadata.specialty,
      metadata
    });

    // Refresh list
    await fetchDocuments();

    return response;
  };

  const deleteDocument = async (documentId: string) => {
    await adminApi.deleteDocument(documentId);
    await fetchDocuments();
  };

  const reindexDocuments = async (documentIds: string[], force: boolean = false) => {
    const response = await adminApi.triggerReindex({ documentIds, force });
    return response;
  };

  return {
    documents,
    loading,
    error,
    uploadDocument,
    deleteDocument,
    reindexDocuments,
    refresh: fetchDocuments
  };
}
```

```typescript
// src/hooks/useDashboard.ts
import { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import type { DashboardMetrics, SystemResources, ServiceStatus, ActivityEvent } from '../types';

export function useDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [metricsData, resourcesData, servicesData, activityData] = await Promise.all([
        adminApi.getDashboardMetrics(),
        adminApi.getSystemResources(),
        adminApi.getServiceStatus(),
        adminApi.getRecentActivity()
      ]);

      setMetrics(metricsData);
      setResources(resourcesData);
      setServices(servicesData);
      setActivity(activityData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Refresh every 10 seconds
    const interval = setInterval(fetchDashboardData, 10000);

    return () => clearInterval(interval);
  }, []);

  return {
    metrics,
    resources,
    services,
    activity,
    loading,
    refresh: fetchDashboardData
  };
}
```

```typescript
// src/hooks/useWebSocketMetrics.ts
import { useState, useEffect, useRef } from 'react';
import type { DashboardMetrics, SystemResources } from '../types';

interface MetricsUpdate {
  type: 'metrics' | 'resources';
  data: DashboardMetrics | SystemResources;
}

export function useWebSocketMetrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
    const ws = new WebSocket(`${wsUrl}/metrics`);

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const update: MetricsUpdate = JSON.parse(event.data);

        if (update.type === 'metrics') {
          setMetrics(update.data as DashboardMetrics);
        } else if (update.type === 'resources') {
          setResources(update.data as SystemResources);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected');

      // Attempt reconnection after 5 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  return {
    metrics,
    resources,
    connected
  };
}
```

## Pages

### Dashboard

**Components:**
- System overview cards (sessions, API calls, response time, errors)
- Service status indicators
- Real-time metrics charts
- Recent activity feed
- Quick actions

**API Endpoints:**
- `GET /api/admin/dashboard` - Dashboard data
- `WS /ws/metrics` - Real-time metric updates

### System Settings

**Features:**
- System configuration
- Environment variables viewer
- Service management (restart, status)
- Update management
- Health checks

**API Endpoints:**
- `GET /api/admin/system/config`
- `PATCH /api/admin/system/config`
- `POST /api/admin/system/services/restart`
- `GET /api/admin/system/health`

### AI Models

**Features:**
- Local model selection (Ollama)
- Cloud API configuration (OpenAI, Claude)
- Routing logic configuration
- Model performance metrics
- Test endpoints

**API Endpoints:**
- `GET /api/admin/models`
- `PATCH /api/admin/models/config`
- `POST /api/admin/models/test`

### Knowledge Base

**Features:**
- Document library table
- Upload interface (single/bulk)
- Indexing queue and status
- Document management (view, reindex, delete)
- Search and filters

**API Endpoints:**
- `GET /api/admin/knowledge` - List documents
- `POST /api/admin/knowledge/upload` - Upload files
- `POST /api/admin/knowledge/reindex` - Trigger reindex
- `DELETE /api/admin/knowledge/:id` - Delete document

**Upload Component:**
```typescript
const UploadDialog = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState({
    type: 'textbook',
    specialty: [],
    tags: []
  });

  const handleUpload = async () => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('metadata', JSON.stringify(metadata));

    await uploadDocuments(formData);
  };

  return (
    // Drag & drop UI with progress tracking
  );
};
```

### Analytics

**Features:**
- Query analytics (total, by type, topics)
- Cost tracking (API usage breakdown)
- Performance metrics (response times, latency)
- Usage trends (charts over time)
- Export reports

**Charts:**
- Query distribution pie chart
- Cost trends line chart
- Response time histogram
- Popular topics bar chart

**API Endpoints:**
- `GET /api/admin/analytics/queries`
- `GET /api/admin/analytics/costs`
- `GET /api/admin/analytics/performance`

### Integrations

**Features:**
- Integration status cards (Nextcloud, Calendar, Email, etc.)
- Configuration dialogs
- Connection testing
- Enable/disable toggles
- API key management

**Integration Card Example:**
```typescript
<IntegrationCard
  name="Nextcloud"
  status="connected"
  config={{
    url: "https://asimo.io/nextcloud",
    autoIndex: true,
    backup: true
  }}
  onTest={testConnection}
  onConfigure={openConfigDialog}
/>
```

**API Endpoints:**
- `GET /api/admin/integrations`
- `PATCH /api/admin/integrations/:name`
- `POST /api/admin/integrations/:name/test`

### Logs

**Features:**
- Real-time log streaming
- Log level filtering (DEBUG, INFO, WARN, ERROR)
- Service filtering
- Time range selection
- Text search
- Download logs

**Log Viewer:**
```typescript
const LogViewer = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState({
    level: 'all',
    service: 'all',
    search: ''
  });

  useEffect(() => {
    const ws = connectToLogs();
    ws.on('log', (entry: LogEntry) => {
      if (matchesFilters(entry, filters)) {
        setLogs(prev => [...prev, entry]);
      }
    });
  }, [filters]);

  return (
    // Log display with filters
  );
};
```

**API Endpoints:**
- `GET /api/admin/logs` - Historical logs
- `WS /ws/logs` - Real-time streaming

### Settings

**Features:**
- Admin user profile
- Security settings (2FA, password change)
- Notification preferences
- API key management
- Audit logs

## Real-Time Features

### Metrics WebSocket

```typescript
const useMetrics = () => {
  const [metrics, setMetrics] = useState<Metrics>({});

  useEffect(() => {
    const ws = new WebSocket('wss://admin.asimo.io/ws/metrics');

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, ...update }));
    };

    return () => ws.close();
  }, []);

  return metrics;
};
```

### Log Streaming

```typescript
const useLogs = (filters: LogFilters) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const ws = new WebSocket('wss://admin.asimo.io/ws/logs');

    ws.onmessage = (event) => {
      const log = JSON.parse(event.data);
      if (matchFilters(log, filters)) {
        setLogs(prev => [log, ...prev].slice(0, 1000)); // Keep last 1000
      }
    };

    return () => ws.close();
  }, [filters]);

  return logs;
};
```

## Charts & Visualizations

### Metric Cards

```typescript
import { Card, Metric, Text } from '@tremor/react';

<Card>
  <Text>Active Sessions</Text>
  <Metric>3</Metric>
  <Text className="text-green-500">↑ 50% from yesterday</Text>
</Card>
```

### Line Charts

```typescript
import { LineChart } from '@tremor/react';

<LineChart
  data={costData}
  index="date"
  categories={["GPT-4", "Embeddings", "Realtime API"]}
  colors={["blue", "green", "amber"]}
  valueFormatter={(value) => `$${value.toFixed(2)}`}
/>
```

### Bar Charts

```typescript
import { BarChart } from '@tremor/react';

<BarChart
  data={topicData}
  index="topic"
  categories={["queries"]}
  colors={["blue"]}
/>
```

## Data Tables

### Document Table

```typescript
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'pages', header: 'Pages' },
  { accessorKey: 'indexed', header: 'Indexed' },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div>
        <Button onClick={() => view(row.original)}>View</Button>
        <Button onClick={() => reindex(row.original)}>Reindex</Button>
        <Button onClick={() => deleteDoc(row.original)}>Delete</Button>
      </div>
    )
  }
];

const table = useReactTable({
  data: documents,
  columns,
  getCoreRowModel: getCoreRowModel()
});
```

## Authentication

### Protected Routes

```typescript
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};
```

### Auth Context

```typescript
const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    const response = await adminApi.login(email, password);
    setUser(response.user);
    localStorage.setItem('admin_token', response.token);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('admin_token');
  };

  return { user, login, logout, isAuthenticated: !!user, isAdmin: user?.role === 'admin' };
};
```

## Security

### API Authentication

All requests include JWT token in header:

```typescript
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Role-Based Access

Admin panel requires `admin` role. Future: viewer role with read-only access.

## Performance

- Virtualized tables for large datasets
- Debounced search inputs
- Lazy loading of charts
- Code splitting by route
- Memoized components

## Build & Deploy

```bash
# Production build
npm run build

# Preview
npm run preview

# Deploy
rsync -avz dist/ user@asimo.io:/var/www/admin/
```

## Troubleshooting

### Cannot connect to admin API

- Verify admin API URL
- Check authentication token
- Ensure admin role assigned

### Metrics not updating

- Check WebSocket connection
- Verify firewall allows WSS
- Check server-side metric generation

### Upload fails

- Check file size limits
- Verify MIME type allowed
- Check disk space on server

## Future Enhancements

- [ ] Mobile admin app
- [ ] Advanced alerting rules
- [ ] Custom dashboard widgets
- [ ] Multi-admin support with roles
- [ ] A/B testing for models
- [ ] Cost optimization recommendations
- [ ] Automated maintenance tasks
- [ ] Integration marketplace

## License

Personal use project.
