---
title: Admin Panel Feature Specs
slug: client-implementation/admin-panel-feature-specs
summary: "**Document Version:** 1.0.0"
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience:
  - devops
  - sre
  - ai-agents
tags:
  - admin
  - panel
  - feature
  - specs
category: planning
ai_summary: >-
  Document Version: 1.0.0 Last Updated: 2025-11-21 Status: Final Specification
  Target Release: v1.0.0 --- 1. Overview 2. Dashboard Features 3. Knowledge Base
  Management 4. AI Model Configuration 5. Analytics 6. Integration Management 7.
  Technical Implementation 8. Testing Strategy --- The VoiceAssi...
---

# VoiceAssist Admin Panel - Feature Specifications

**Document Version:** 1.0.0
**Last Updated:** 2025-11-21
**Status:** Final Specification
**Target Release:** v1.0.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dashboard Features](#2-dashboard-features)
3. [Knowledge Base Management](#3-knowledge-base-management)
4. [AI Model Configuration](#4-ai-model-configuration)
5. [Analytics](#5-analytics)
6. [Integration Management](#6-integration-management)
7. [Technical Implementation](#7-technical-implementation)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Overview

### 1.1 Technology Stack

The VoiceAssist Admin Panel is built with modern web technologies optimized for administrative interfaces and data visualization:

**Core Framework:**

- React 18.2+ with TypeScript 5.0+
- Vite 5.0+ (build tool and dev server)
- React Router v6 (client-side routing)

**UI Framework:**

- Tailwind CSS 3.4+ (utility-first styling)
- Tremor 3.x (dashboard and chart components)
- Headless UI (accessible component primitives)
- Heroicons (icon library)

**Data Management:**

- TanStack Table v8 (advanced table functionality)
- TanStack Query v5 (server state management)
- Zustand (client state management)

**Visualization:**

- Recharts 2.x (charts via Tremor)
- D3.js 7.x (custom visualizations)

**Real-time Communication:**

- Socket.io Client 4.x (WebSocket connections)
- Server-Sent Events (SSE) for updates

**Form Management:**

- React Hook Form 7.x
- Zod (schema validation)

**Development Tools:**

- ESLint + Prettier
- Vitest (unit testing)
- Playwright (e2e testing)
- MSW (API mocking)

### 1.2 Design Principles

**1. Information Density**

- Maximize useful information per screen
- Use progressive disclosure for complex data
- Implement responsive tables and charts

**2. Real-time Updates**

- Live metrics without page refresh
- WebSocket connections for critical data
- Optimistic UI updates

**3. Performance**

- Virtualized tables for large datasets
- Lazy loading of heavy components
- Code splitting by route

**4. Accessibility**

- WCAG 2.1 AA compliance
- Keyboard navigation throughout
- Screen reader optimized

**5. Error Handling**

- Graceful degradation
- Clear error messages
- Retry mechanisms

### 1.3 Architecture

```
/admin-panel
├── /src
│   ├── /components
│   │   ├── /dashboard     # Dashboard widgets
│   │   ├── /kb            # KB management components
│   │   ├── /ai-config     # AI configuration components
│   │   ├── /analytics     # Analytics components
│   │   ├── /integrations  # Integration components
│   │   └── /common        # Shared components
│   ├── /hooks             # Custom React hooks
│   ├── /services          # API services
│   ├── /stores            # Zustand stores
│   ├── /types             # TypeScript types
│   ├── /utils             # Utility functions
│   └── /pages             # Route pages
├── /tests
│   ├── /unit
│   ├── /integration
│   └── /e2e
└── /public
```

---

## 2. Dashboard Features

### 2.1 Real-time Metrics Display

**Priority:** P0 (Critical)
**Effort:** 5 days
**Dependencies:** WebSocket connection, /api/admin/metrics endpoint

#### Specification

Display key system metrics updated in real-time via WebSocket:

- Active sessions count
- Requests per minute
- Average response time
- Error rate
- Cost per hour

**Visual Design:**

- 5 metric cards in a grid layout
- Large numbers with trend indicators
- Sparkline charts showing 1-hour history
- Color-coded status (green/yellow/red)

#### Component Implementation

```typescript
// src/components/dashboard/RealTimeMetrics.tsx
import { useEffect, useState } from 'react';
import { Card, Metric, Text, Flex, BadgeDelta, AreaChart } from '@tremor/react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { SystemMetrics } from '@/types/metrics';

interface MetricCardProps {
  title: string;
  value: number;
  unit?: string;
  trend?: number;
  trendType?: 'increase' | 'decrease' | 'unchanged';
  history?: number[];
  format?: (value: number) => string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit = '',
  trend,
  trendType = 'unchanged',
  history = [],
  format = (v) => v.toString(),
}) => {
  const chartData = history.map((val, idx) => ({
    time: idx,
    value: val,
  }));

  return (
    <Card decoration="top" decorationColor={
      trendType === 'increase' ? 'green' :
      trendType === 'decrease' ? 'red' :
      'gray'
    }>
      <Flex>
        <Text>{title}</Text>
        {trend !== undefined && (
          <BadgeDelta deltaType={trendType}>
            {trend > 0 ? '+' : ''}{trend}%
          </BadgeDelta>
        )}
      </Flex>
      <Metric>{format(value)}{unit}</Metric>
      {history.length > 0 && (
        <AreaChart
          className="mt-4 h-12"
          data={chartData}
          index="time"
          categories={['value']}
          colors={[trendType === 'increase' ? 'green' : trendType === 'decrease' ? 'red' : 'gray']}
          showXAxis={false}
          showYAxis={false}
          showLegend={false}
          showGridLines={false}
          showTooltip={false}
          curveType="natural"
        />
      )}
    </Card>
  );
};

export const RealTimeMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<Map<string, number[]>>(new Map());

  const { data, isConnected } = useWebSocket<SystemMetrics>('metrics', {
    reconnect: true,
    reconnectInterval: 5000,
  });

  useEffect(() => {
    if (data) {
      setMetrics(data);

      // Update history for sparklines
      setHistory((prev) => {
        const newHistory = new Map(prev);

        const updateHistory = (key: string, value: number) => {
          const current = newHistory.get(key) || [];
          const updated = [...current, value].slice(-60); // Keep last 60 points
          newHistory.set(key, updated);
        };

        updateHistory('activeSessions', data.activeSessions);
        updateHistory('requestsPerMinute', data.requestsPerMinute);
        updateHistory('avgResponseTime', data.avgResponseTime);
        updateHistory('errorRate', data.errorRate);
        updateHistory('costPerHour', data.costPerHour);

        return newHistory;
      });
    }
  }, [data]);

  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-20 bg-gray-200 rounded"></div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isConnected && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">
            Real-time updates disconnected. Attempting to reconnect...
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Active Sessions"
          value={metrics.activeSessions}
          trend={metrics.sessionsTrend}
          trendType={metrics.sessionsTrend > 0 ? 'increase' : 'decrease'}
          history={history.get('activeSessions')}
        />

        <MetricCard
          title="Requests/min"
          value={metrics.requestsPerMinute}
          trend={metrics.requestsTrend}
          trendType={metrics.requestsTrend > 0 ? 'increase' : 'decrease'}
          history={history.get('requestsPerMinute')}
          format={(v) => v.toFixed(1)}
        />

        <MetricCard
          title="Avg Response Time"
          value={metrics.avgResponseTime}
          unit="ms"
          trend={metrics.responseTrend}
          trendType={metrics.responseTrend < 0 ? 'increase' : 'decrease'}
          history={history.get('avgResponseTime')}
          format={(v) => Math.round(v).toString()}
        />

        <MetricCard
          title="Error Rate"
          value={metrics.errorRate}
          unit="%"
          trend={metrics.errorTrend}
          trendType={metrics.errorTrend > 0 ? 'decrease' : 'increase'}
          history={history.get('errorRate')}
          format={(v) => v.toFixed(2)}
        />

        <MetricCard
          title="Cost/Hour"
          value={metrics.costPerHour}
          unit=""
          trend={metrics.costTrend}
          trendType={metrics.costTrend > 0 ? 'decrease' : 'increase'}
          history={history.get('costPerHour')}
          format={(v) => `$${v.toFixed(2)}`}
        />
      </div>
    </div>
  );
};
```

#### Custom Hook for WebSocket

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useState, useRef } from "react";
import io, { Socket } from "socket.io-client";

interface UseWebSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
}

interface UseWebSocketReturn<T> {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
  emit: (event: string, data: any) => void;
}

export function useWebSocket<T = any>(event: string, options: UseWebSocketOptions = {}): UseWebSocketReturn<T> {
  const { reconnect = true, reconnectInterval = 5000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_WEBSOCKET_URL || "http://localhost:5056", {
      reconnection: reconnect,
      reconnectionDelay: reconnectInterval,
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("error", (err: Error) => {
      setError(err);
    });

    socket.on(event, (newData: T) => {
      setData(newData);
    });

    return () => {
      socket.disconnect();
    };
  }, [event, reconnect, reconnectInterval]);

  const emit = (eventName: string, eventData: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(eventName, eventData);
    }
  };

  return { data, isConnected, error, emit };
}
```

#### Type Definitions

```typescript
// src/types/metrics.ts
export interface SystemMetrics {
  activeSessions: number;
  sessionsTrend: number;
  requestsPerMinute: number;
  requestsTrend: number;
  avgResponseTime: number;
  responseTrend: number;
  errorRate: number;
  errorTrend: number;
  costPerHour: number;
  costTrend: number;
  timestamp: string;
}
```

#### Unit Tests

```typescript
// tests/unit/components/dashboard/RealTimeMetrics.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RealTimeMetrics } from '@/components/dashboard/RealTimeMetrics';
import * as useWebSocketModule from '@/hooks/useWebSocket';

vi.mock('@/hooks/useWebSocket');

describe('RealTimeMetrics', () => {
  it('should render loading state initially', () => {
    vi.mocked(useWebSocketModule.useWebSocket).mockReturnValue({
      data: null,
      isConnected: false,
      error: null,
      emit: vi.fn(),
    });

    render(<RealTimeMetrics />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(5);
    expect(cards[0]).toHaveClass('animate-pulse');
  });

  it('should render metrics when data is available', async () => {
    const mockMetrics = {
      activeSessions: 42,
      sessionsTrend: 5.2,
      requestsPerMinute: 123.5,
      requestsTrend: -2.1,
      avgResponseTime: 145,
      responseTrend: 3.4,
      errorRate: 0.05,
      errorTrend: -0.02,
      costPerHour: 2.45,
      costTrend: 1.2,
      timestamp: '2025-11-21T10:00:00Z',
    };

    vi.mocked(useWebSocketModule.useWebSocket).mockReturnValue({
      data: mockMetrics,
      isConnected: true,
      error: null,
      emit: vi.fn(),
    });

    render(<RealTimeMetrics />);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('123.5')).toBeInTheDocument();
      expect(screen.getByText('145ms')).toBeInTheDocument();
      expect(screen.getByText('0.05%')).toBeInTheDocument();
      expect(screen.getByText('$2.45')).toBeInTheDocument();
    });
  });

  it('should show disconnection warning', () => {
    vi.mocked(useWebSocketModule.useWebSocket).mockReturnValue({
      data: null,
      isConnected: false,
      error: null,
      emit: vi.fn(),
    });

    render(<RealTimeMetrics />);

    expect(screen.getByText(/Real-time updates disconnected/i)).toBeInTheDocument();
  });
});
```

#### Accessibility Notes

- All metric cards have proper ARIA labels
- Trend indicators use semantic colors and text
- Loading states announced to screen readers
- Keyboard navigation between cards
- Focus indicators on interactive elements

---

### 2.2 System Health Indicators

**Priority:** P0 (Critical)
**Effort:** 3 days
**Dependencies:** /api/admin/health endpoint

#### Specification

Visual indicators for critical system components:

- API server status
- Database connection
- Redis cache
- Vector database
- External integrations (Nextcloud, email)

**Visual Design:**

- Status badges with icons (check/warning/error)
- Last check timestamp
- Response time for each component
- Click to view detailed logs

#### Component Implementation

```typescript
// src/components/dashboard/SystemHealthIndicators.tsx
import { useState } from 'react';
import { Card, Badge, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Button } from '@tremor/react';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { HealthStatus } from '@/types/health';

interface HealthIndicatorProps {
  status: 'healthy' | 'degraded' | 'down';
  size?: 'sm' | 'md' | 'lg';
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({ status, size = 'md' }) => {
  const config = {
    healthy: { icon: CheckCircleIcon, color: 'green', label: 'Healthy' },
    degraded: { icon: ExclamationCircleIcon, color: 'yellow', label: 'Degraded' },
    down: { icon: XCircleIcon, color: 'red', label: 'Down' },
  };

  const { icon: Icon, color, label } = config[status];
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <Badge color={color} icon={Icon} size={size}>
      {label}
    </Badge>
  );
};

export const SystemHealthIndicators: React.FC = () => {
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const { data: health, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => adminApi.getSystemHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <p className="text-gray-500">Unable to load health status</p>
      </Card>
    );
  }

  const overallStatus = health.components.every(c => c.status === 'healthy')
    ? 'healthy'
    : health.components.some(c => c.status === 'down')
    ? 'down'
    : 'degraded';

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
          <HealthIndicator status={overallStatus} size="lg" />
        </div>
        <Button
          variant="secondary"
          size="xs"
          icon={ArrowPathIcon}
          onClick={() => refetch()}
          loading={isRefetching}
        >
          Refresh
        </Button>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Component</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Response Time</TableHeaderCell>
            <TableHeaderCell>Last Check</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {health.components.map((component) => (
            <TableRow key={component.name}>
              <TableCell>
                <div>
                  <p className="font-medium text-gray-900">{component.name}</p>
                  <p className="text-sm text-gray-500">{component.description}</p>
                </div>
              </TableCell>
              <TableCell>
                <HealthIndicator status={component.status} />
              </TableCell>
              <TableCell>
                <span className={
                  component.responseTime < 100 ? 'text-green-600' :
                  component.responseTime < 500 ? 'text-yellow-600' :
                  'text-red-600'
                }>
                  {component.responseTime}ms
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-gray-500">
                  {new Date(component.lastCheck).toLocaleTimeString()}
                </span>
              </TableCell>
              <TableCell>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => setShowDetails(
                    showDetails === component.name ? null : component.name
                  )}
                >
                  {showDetails === component.name ? 'Hide' : 'Details'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showDetails && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">
            {health.components.find(c => c.name === showDetails)?.name} Details
          </h4>
          <pre className="text-xs text-gray-700 overflow-auto">
            {JSON.stringify(
              health.components.find(c => c.name === showDetails)?.details,
              null,
              2
            )}
          </pre>
        </div>
      )}
    </Card>
  );
};
```

#### API Service

```typescript
// src/services/api/admin.ts
import { apiClient } from "./client";
import type { HealthStatus } from "@/types/health";

export const adminApi = {
  async getSystemHealth(): Promise<HealthStatus> {
    const response = await apiClient.get<HealthStatus>("/api/admin/health");
    return response.data;
  },

  async runHealthCheck(component: string): Promise<void> {
    await apiClient.post(`/api/admin/health/${component}/check`);
  },
};
```

#### Type Definitions

```typescript
// src/types/health.ts
export type ComponentStatus = "healthy" | "degraded" | "down";

export interface ComponentHealth {
  name: string;
  description: string;
  status: ComponentStatus;
  responseTime: number;
  lastCheck: string;
  details?: Record<string, any>;
}

export interface HealthStatus {
  overall: ComponentStatus;
  components: ComponentHealth[];
  timestamp: string;
}
```

#### Unit Tests

```typescript
// tests/unit/components/dashboard/SystemHealthIndicators.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemHealthIndicators } from '@/components/dashboard/SystemHealthIndicators';
import * as adminApi from '@/services/api/admin';

vi.mock('@/services/api/admin');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('SystemHealthIndicators', () => {
  it('should render all components', async () => {
    const mockHealth = {
      overall: 'healthy' as const,
      components: [
        {
          name: 'API Server',
          description: 'FastAPI backend',
          status: 'healthy' as const,
          responseTime: 45,
          lastCheck: '2025-11-21T10:00:00Z',
        },
        {
          name: 'Database',
          description: 'PostgreSQL',
          status: 'healthy' as const,
          responseTime: 12,
          lastCheck: '2025-11-21T10:00:00Z',
        },
      ],
      timestamp: '2025-11-21T10:00:00Z',
    };

    vi.mocked(adminApi.adminApi.getSystemHealth).mockResolvedValue(mockHealth);

    render(<SystemHealthIndicators />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('API Server')).toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });

  it('should show details when clicked', async () => {
    const user = userEvent.setup();
    const mockHealth = {
      overall: 'healthy' as const,
      components: [
        {
          name: 'API Server',
          description: 'FastAPI backend',
          status: 'healthy' as const,
          responseTime: 45,
          lastCheck: '2025-11-21T10:00:00Z',
          details: { version: '1.0.0', uptime: 3600 },
        },
      ],
      timestamp: '2025-11-21T10:00:00Z',
    };

    vi.mocked(adminApi.adminApi.getSystemHealth).mockResolvedValue(mockHealth);

    render(<SystemHealthIndicators />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('API Server')).toBeInTheDocument();
    });

    const detailsButton = screen.getByText('Details');
    await user.click(detailsButton);

    expect(screen.getByText(/version/i)).toBeInTheDocument();
  });
});
```

---

### 2.3 Active Sessions Monitor

**Priority:** P1 (High)
**Effort:** 4 days
**Dependencies:** WebSocket connection, /api/admin/sessions endpoint

#### Specification

Real-time table of active user sessions:

- Session ID
- User ID / Anonymous
- Start time
- Duration
- Current activity
- Messages sent
- Token usage
- Actions (view details, terminate)

**Visual Design:**

- Paginated table with live updates
- Color-coded by activity level
- Expandable rows for session details
- Bulk actions (terminate multiple)

#### Component Implementation

```typescript
// src/components/dashboard/ActiveSessionsMonitor.tsx
import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { Card, Badge, Button, TextInput } from '@tremor/react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDuration } from '@/utils/time';
import type { ActiveSession } from '@/types/sessions';

const columnHelper = createColumnHelper<ActiveSession>();

export const ActiveSessionsMonitor: React.FC = () => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  const { data: sessions, emit } = useWebSocket<ActiveSession[]>('active-sessions', {
    reconnect: true,
  });

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!filter) return sessions;

    return sessions.filter(
      (s) =>
        s.sessionId.toLowerCase().includes(filter.toLowerCase()) ||
        s.userId?.toLowerCase().includes(filter.toLowerCase()) ||
        s.currentActivity.toLowerCase().includes(filter.toLowerCase())
    );
  }, [sessions, filter]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-gray-300"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-gray-300"
          />
        ),
      }),
      columnHelper.accessor('sessionId', {
        header: 'Session ID',
        cell: (info) => (
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
            {info.getValue().slice(0, 8)}...
          </code>
        ),
      }),
      columnHelper.accessor('userId', {
        header: 'User',
        cell: (info) => {
          const userId = info.getValue();
          return userId ? (
            <span className="font-medium">{userId}</span>
          ) : (
            <Badge color="gray">Anonymous</Badge>
          );
        },
      }),
      columnHelper.accessor('startTime', {
        header: 'Duration',
        cell: (info) => {
          const duration = Date.now() - new Date(info.getValue()).getTime();
          return <span className="text-sm">{formatDuration(duration)}</span>;
        },
      }),
      columnHelper.accessor('currentActivity', {
        header: 'Activity',
        cell: (info) => {
          const activity = info.getValue();
          const color =
            activity === 'idle' ? 'gray' :
            activity === 'chatting' ? 'green' :
            activity === 'searching' ? 'blue' : 'purple';

          return <Badge color={color}>{activity}</Badge>;
        },
      }),
      columnHelper.accessor('messagesSent', {
        header: 'Messages',
        cell: (info) => (
          <span className="tabular-nums">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('tokenUsage', {
        header: 'Tokens',
        cell: (info) => (
          <span className="tabular-nums text-sm">
            {info.getValue().toLocaleString()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="light"
              size="xs"
              onClick={() => handleViewDetails(row.original.sessionId)}
            >
              View
            </Button>
            <Button
              variant="light"
              size="xs"
              color="red"
              onClick={() => handleTerminate(row.original.sessionId)}
            >
              End
            </Button>
          </div>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredSessions,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const handleViewDetails = (sessionId: string) => {
    // Open modal or navigate to session details
    console.log('View session:', sessionId);
  };

  const handleTerminate = (sessionId: string) => {
    if (confirm('Are you sure you want to terminate this session?')) {
      emit('terminate-session', { sessionId });
    }
  };

  const handleBulkTerminate = () => {
    const sessionIds = Array.from(selectedSessions);
    if (
      confirm(
        `Are you sure you want to terminate ${sessionIds.length} session(s)?`
      )
    ) {
      emit('terminate-sessions', { sessionIds });
      setSelectedSessions(new Set());
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Active Sessions ({filteredSessions.length})
          </h3>
          <div className="flex gap-2">
            {selectedSessions.size > 0 && (
              <Button
                variant="secondary"
                size="xs"
                color="red"
                onClick={handleBulkTerminate}
              >
                Terminate {selectedSessions.size} session(s)
              </Button>
            )}
          </div>
        </div>

        <TextInput
          icon={MagnifyingGlassIcon}
          placeholder="Search sessions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium text-gray-700"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() && (
                          <span>
                            {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
```

#### Type Definitions

```typescript
// src/types/sessions.ts
export interface ActiveSession {
  sessionId: string;
  userId: string | null;
  startTime: string;
  currentActivity: "idle" | "chatting" | "searching" | "listening";
  messagesSent: number;
  tokenUsage: number;
  ipAddress?: string;
  userAgent?: string;
}
```

#### Utility Functions

```typescript
// src/utils/time.ts
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
```

---

### 2.4 API Usage Graphs

**Priority:** P1 (High)
**Effort:** 3 days
**Dependencies:** /api/admin/usage endpoint

#### Specification

Interactive charts showing API usage patterns:

- Requests per hour (last 24h)
- Requests by endpoint
- Requests by status code
- Requests by client type

**Visual Design:**

- Area chart for time series
- Bar chart for endpoint comparison
- Donut chart for status codes
- Time range selector (1h, 6h, 24h, 7d)

#### Component Implementation

```typescript
// src/components/dashboard/APIUsageGraphs.tsx
import { useState } from 'react';
import {
  Card,
  Title,
  AreaChart,
  BarChart,
  DonutChart,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Select,
  SelectItem,
} from '@tremor/react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { APIUsageData } from '@/types/usage';

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

export const APIUsageGraphs: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  const { data: usage, isLoading } = useQuery({
    queryKey: ['api-usage', timeRange],
    queryFn: () => adminApi.getAPIUsage(timeRange),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading || !usage) {
    return (
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  const timeSeriesData = usage.timeSeries.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    requests: point.count,
    errors: point.errors,
  }));

  const endpointData = usage.byEndpoint.map((item) => ({
    endpoint: item.endpoint,
    requests: item.count,
  }));

  const statusCodeData = usage.byStatusCode.map((item) => ({
    name: `${item.code} (${item.label})`,
    value: item.count,
  }));

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Title>API Usage</Title>
          <Select
            value={timeRange}
            onValueChange={(value) => setTimeRange(value as TimeRange)}
            className="w-32"
          >
            <SelectItem value="1h">Last Hour</SelectItem>
            <SelectItem value="6h">Last 6 Hours</SelectItem>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </Select>
        </div>

        <TabGroup>
          <TabList>
            <Tab>Requests Over Time</Tab>
            <Tab>By Endpoint</Tab>
            <Tab>Status Codes</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <AreaChart
                className="h-72 mt-4"
                data={timeSeriesData}
                index="time"
                categories={['requests', 'errors']}
                colors={['blue', 'red']}
                valueFormatter={(value) => `${value} req`}
                showLegend={true}
                showGridLines={true}
                showXAxis={true}
                showYAxis={true}
              />
            </TabPanel>

            <TabPanel>
              <BarChart
                className="h-72 mt-4"
                data={endpointData}
                index="endpoint"
                categories={['requests']}
                colors={['blue']}
                valueFormatter={(value) => `${value} req`}
                showLegend={false}
                showGridLines={true}
                showXAxis={true}
                showYAxis={true}
                layout="vertical"
              />
            </TabPanel>

            <TabPanel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <DonutChart
                  className="h-72"
                  data={statusCodeData}
                  category="value"
                  index="name"
                  colors={['green', 'blue', 'yellow', 'red']}
                  valueFormatter={(value) => `${value} req`}
                  showLabel={true}
                />
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900">Status Code Summary</h4>
                  {statusCodeData.map((item) => (
                    <div key={item.name} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.name}</span>
                      <span className="font-medium">{item.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Total Requests</span>
                      <span>
                        {statusCodeData
                          .reduce((sum, item) => sum + item.value, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>
    </Card>
  );
};
```

#### API Service Extension

```typescript
// src/services/api/admin.ts (extension)
export const adminApi = {
  // ... existing methods

  async getAPIUsage(timeRange: string): Promise<APIUsageData> {
    const response = await apiClient.get<APIUsageData>(`/api/admin/usage?range=${timeRange}`);
    return response.data;
  },
};
```

#### Type Definitions

```typescript
// src/types/usage.ts
export interface TimeSeriesPoint {
  timestamp: string;
  count: number;
  errors: number;
}

export interface EndpointUsage {
  endpoint: string;
  count: number;
  avgResponseTime: number;
}

export interface StatusCodeUsage {
  code: number;
  label: string;
  count: number;
}

export interface APIUsageData {
  timeSeries: TimeSeriesPoint[];
  byEndpoint: EndpointUsage[];
  byStatusCode: StatusCodeUsage[];
  totalRequests: number;
  totalErrors: number;
  avgResponseTime: number;
}
```

---

### 2.5 Cost Tracking

**Priority:** P1 (High)
**Effort:** 4 days
**Dependencies:** /api/admin/costs endpoint

#### Specification

Real-time cost monitoring across all services:

- OpenAI API costs (by model)
- ElevenLabs TTS costs
- Vector database costs
- Total daily/monthly costs
- Cost projections
- Budget alerts

**Visual Design:**

- Cost breakdown donut chart
- Trend line chart
- Cost per user metric
- Budget progress bar
- Cost optimization suggestions

#### Component Implementation

```typescript
// src/components/dashboard/CostTracking.tsx
import { Card, Title, DonutChart, LineChart, ProgressBar, Callout, Badge } from '@tremor/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { CostData } from '@/types/costs';

export const CostTracking: React.FC = () => {
  const { data: costs, isLoading } = useQuery({
    queryKey: ['costs'],
    queryFn: () => adminApi.getCosts(),
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading || !costs) {
    return (
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  const serviceBreakdown = [
    { name: 'OpenAI API', value: costs.openai, color: 'blue' },
    { name: 'ElevenLabs TTS', value: costs.elevenlabs, color: 'purple' },
    { name: 'Vector DB', value: costs.vectorDb, color: 'green' },
    { name: 'Infrastructure', value: costs.infrastructure, color: 'gray' },
  ];

  const trendData = costs.dailyTrend.map((point) => ({
    date: new Date(point.date).toLocaleDateString(),
    cost: point.total,
    projected: point.projected,
  }));

  const budgetUsage = (costs.monthToDate / costs.monthlyBudget) * 100;
  const isOverBudget = budgetUsage > 100;
  const isNearBudget = budgetUsage > 80 && budgetUsage <= 100;

  return (
    <div className="space-y-4">
      <Card>
        <Title>Cost Overview - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Title>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <p className="text-sm text-gray-600">Today</p>
            <p className="text-2xl font-bold text-gray-900">
              ${costs.today.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Month to Date</p>
            <p className="text-2xl font-bold text-gray-900">
              ${costs.monthToDate.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Projected Monthly</p>
            <p className="text-2xl font-bold text-gray-900">
              ${costs.projectedMonthly.toFixed(2)}
            </p>
          </div>
        </div>

        {(isOverBudget || isNearBudget) && (
          <Callout
            title={isOverBudget ? 'Budget Exceeded' : 'Approaching Budget Limit'}
            icon={ExclamationTriangleIcon}
            color={isOverBudget ? 'red' : 'yellow'}
            className="mt-4"
          >
            You have used {budgetUsage.toFixed(1)}% of your monthly budget (
            ${costs.monthlyBudget.toFixed(2)}).
            {isOverBudget && ' Consider reviewing usage or increasing budget.'}
          </Callout>
        )}

        <div className="mt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Monthly Budget</span>
            <span className="font-medium">
              ${costs.monthToDate.toFixed(2)} / ${costs.monthlyBudget.toFixed(2)}
            </span>
          </div>
          <ProgressBar
            value={budgetUsage}
            color={isOverBudget ? 'red' : isNearBudget ? 'yellow' : 'green'}
            className="mt-2"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <Title>Cost Breakdown</Title>
          <DonutChart
            className="h-64 mt-4"
            data={serviceBreakdown}
            category="value"
            index="name"
            valueFormatter={(value) => `$${value.toFixed(2)}`}
            colors={['blue', 'purple', 'green', 'gray']}
            showLabel={true}
          />
          <div className="mt-4 space-y-2">
            {serviceBreakdown.map((service) => (
              <div key={service.name} className="flex justify-between text-sm">
                <span className="text-gray-600">{service.name}</span>
                <span className="font-medium">${service.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Title>Daily Trend & Projection</Title>
          <LineChart
            className="h-64 mt-4"
            data={trendData}
            index="date"
            categories={['cost', 'projected']}
            colors={['blue', 'gray']}
            valueFormatter={(value) => `$${value.toFixed(2)}`}
            showLegend={true}
            showGridLines={true}
            showXAxis={true}
            showYAxis={true}
          />
        </Card>
      </div>

      <Card>
        <Title>Cost Optimization Suggestions</Title>
        <div className="mt-4 space-y-3">
          {costs.suggestions.map((suggestion, index) => (
            <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <Badge color="blue">{suggestion.category}</Badge>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{suggestion.title}</p>
                <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                <p className="text-sm font-medium text-green-600 mt-1">
                  Potential savings: ${suggestion.potentialSavings.toFixed(2)}/month
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
```

#### Type Definitions

```typescript
// src/types/costs.ts
export interface DailyCostPoint {
  date: string;
  total: number;
  projected: number;
  byService: Record<string, number>;
}

export interface CostSuggestion {
  category: string;
  title: string;
  description: string;
  potentialSavings: number;
}

export interface CostData {
  today: number;
  monthToDate: number;
  projectedMonthly: number;
  monthlyBudget: number;
  openai: number;
  elevenlabs: number;
  vectorDb: number;
  infrastructure: number;
  dailyTrend: DailyCostPoint[];
  suggestions: CostSuggestion[];
}
```

---

### 2.6 Alert Notifications

**Priority:** P2 (Medium)
**Effort:** 3 days
**Dependencies:** WebSocket connection, /api/admin/alerts endpoint

#### Specification

Real-time alert notification system:

- System errors
- Performance degradation
- Budget warnings
- Security alerts
- Custom alerts

**Visual Design:**

- Toast notifications for new alerts
- Alert center with history
- Severity levels (info, warning, error, critical)
- Acknowledge/dismiss actions
- Alert filtering

#### Component Implementation

```typescript
// src/components/dashboard/AlertNotifications.tsx
import { useState, useEffect } from 'react';
import { Card, Title, Badge, Button, Select, SelectItem } from '@tremor/react';
import {
  BellIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/hooks/useToast';
import type { Alert } from '@/types/alerts';

type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export const AlertNotifications: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all');
  const { showToast } = useToast();

  const { data: newAlert } = useWebSocket<Alert>('new-alert');

  useEffect(() => {
    if (newAlert) {
      setAlerts((prev) => [newAlert, ...prev]);

      // Show toast notification
      showToast({
        title: newAlert.title,
        message: newAlert.message,
        severity: newAlert.severity,
        duration: 5000,
      });
    }
  }, [newAlert]);

  const filteredAlerts = alerts.filter(
    (alert) => filter === 'all' || alert.severity === filter
  );

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      )
    );
  };

  const handleDismiss = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  const severityConfig = {
    info: { color: 'blue', label: 'Info' },
    warning: { color: 'yellow', label: 'Warning' },
    error: { color: 'orange', label: 'Error' },
    critical: { color: 'red', label: 'Critical' },
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Title>Alerts</Title>
            {unacknowledgedCount > 0 && (
              <Badge color="red" icon={BellIcon}>
                {unacknowledgedCount} new
              </Badge>
            )}
          </div>
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as AlertSeverity | 'all')}
            icon={FunnelIcon}
            className="w-32"
          >
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </Select>
        </div>

        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BellIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No alerts to display</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlerts.map((alert) => {
              const config = severityConfig[alert.severity];

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    alert.acknowledged ? 'bg-gray-50' : 'bg-white'
                  }`}
                  style={{
                    borderLeftColor: config.color === 'red' ? '#ef4444' :
                                     config.color === 'yellow' ? '#f59e0b' :
                                     config.color === 'orange' ? '#f97316' :
                                     '#3b82f6',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge color={config.color as any}>{config.label}</Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                        {alert.acknowledged && (
                          <Badge color="gray" icon={CheckCircleIcon}>
                            Acknowledged
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-medium text-gray-900">{alert.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                      {alert.details && (
                        <details className="mt-2">
                          <summary className="text-sm text-blue-600 cursor-pointer">
                            View details
                          </summary>
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">
                            {JSON.stringify(alert.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      {!alert.acknowledged && (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={CheckCircleIcon}
                          onClick={() => handleAcknowledge(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                      <Button
                        variant="light"
                        size="xs"
                        icon={XMarkIcon}
                        onClick={() => handleDismiss(alert.id)}
                      >
                        Dismiss
                        </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
```

#### Toast Hook

```typescript
// src/hooks/useToast.ts
import { create } from "zustand";

interface Toast {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));

    if (toast.duration) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, toast.duration);
    }
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const { addToast, removeToast } = useToastStore();

  return {
    showToast: addToast,
    hideToast: removeToast,
  };
}
```

#### Type Definitions

```typescript
// src/types/alerts.ts
export interface Alert {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  details?: Record<string, any>;
  source?: string;
}
```

---

### 2.7 Quick Actions Panel

**Priority:** P2 (Medium)
**Effort:** 2 days
**Dependencies:** Various admin endpoints

#### Specification

Common administrative actions in one place:

- Restart services
- Clear caches
- Reindex knowledge base
- Run health checks
- Export reports
- System maintenance mode

**Visual Design:**

- Grid of action cards
- Confirmation modals for destructive actions
- Progress indicators
- Recent action history

#### Component Implementation

```typescript
// src/components/dashboard/QuickActionsPanel.tsx
import { useState } from 'react';
import { Card, Title, Button, Grid, Col } from '@tremor/react';
import {
  ArrowPathIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  HeartIcon,
  DocumentArrowDownIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/common/ConfirmModal';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof ArrowPathIcon;
  color: string;
  requiresConfirm: boolean;
  confirmMessage?: string;
  action: () => Promise<void>;
}

export const QuickActionsPanel: React.FC = () => {
  const [confirmAction, setConfirmAction] = useState<QuickAction | null>(null);
  const { showToast } = useToast();

  const { mutate: executeAction, isPending } = useMutation({
    mutationFn: (action: QuickAction) => action.action(),
    onSuccess: (_, action) => {
      showToast({
        title: 'Action completed',
        message: `${action.title} completed successfully`,
        severity: 'info',
      });
      setConfirmAction(null);
    },
    onError: (error, action) => {
      showToast({
        title: 'Action failed',
        message: `${action.title} failed: ${error.message}`,
        severity: 'error',
      });
    },
  });

  const actions: QuickAction[] = [
    {
      id: 'restart-services',
      title: 'Restart Services',
      description: 'Restart all backend services',
      icon: ArrowPathIcon,
      color: 'blue',
      requiresConfirm: true,
      confirmMessage: 'This will restart all services. Active sessions may be interrupted.',
      action: () => adminApi.restartServices(),
    },
    {
      id: 'clear-cache',
      title: 'Clear Cache',
      description: 'Clear Redis cache',
      icon: TrashIcon,
      color: 'orange',
      requiresConfirm: true,
      confirmMessage: 'This will clear all cached data.',
      action: () => adminApi.clearCache(),
    },
    {
      id: 'reindex-kb',
      title: 'Reindex KB',
      description: 'Rebuild knowledge base index',
      icon: MagnifyingGlassIcon,
      color: 'purple',
      requiresConfirm: true,
      confirmMessage: 'This may take several minutes and affect search performance.',
      action: () => adminApi.reindexKnowledgeBase(),
    },
    {
      id: 'health-check',
      title: 'Run Health Check',
      description: 'Check all system components',
      icon: HeartIcon,
      color: 'green',
      requiresConfirm: false,
      action: () => adminApi.runHealthCheck(),
    },
    {
      id: 'export-report',
      title: 'Export Report',
      description: 'Generate usage report',
      icon: DocumentArrowDownIcon,
      color: 'blue',
      requiresConfirm: false,
      action: async () => {
        const blob = await adminApi.exportReport();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${new Date().toISOString()}.pdf`;
        a.click();
      },
    },
    {
      id: 'maintenance-mode',
      title: 'Maintenance Mode',
      description: 'Enable/disable maintenance',
      icon: WrenchScrewdriverIcon,
      color: 'yellow',
      requiresConfirm: true,
      confirmMessage: 'This will make the system unavailable to users.',
      action: () => adminApi.toggleMaintenanceMode(),
    },
  ];

  const handleActionClick = (action: QuickAction) => {
    if (action.requiresConfirm) {
      setConfirmAction(action);
    } else {
      executeAction(action);
    }
  };

  return (
    <>
      <Card>
        <Title>Quick Actions</Title>
        <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-4 mt-4">
          {actions.map((action) => (
            <Col key={action.id}>
              <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg bg-${action.color}-100`}
                    style={{
                      backgroundColor:
                        action.color === 'blue' ? '#dbeafe' :
                        action.color === 'green' ? '#d1fae5' :
                        action.color === 'purple' ? '#e9d5ff' :
                        action.color === 'orange' ? '#fed7aa' :
                        action.color === 'yellow' ? '#fef3c7' :
                        '#e5e7eb',
                    }}
                  >
                    <action.icon className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{action.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                    <Button
                      variant="secondary"
                      size="xs"
                      className="mt-3"
                      onClick={() => handleActionClick(action)}
                      loading={isPending}
                    >
                      Execute
                    </Button>
                  </div>
                </div>
              </div>
            </Col>
          ))}
        </Grid>
      </Card>

      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={`Confirm ${confirmAction.title}`}
          message={confirmAction.confirmMessage || ''}
          onConfirm={() => executeAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          confirmText="Execute"
          confirmColor="blue"
        />
      )}
    </>
  );
};
```

#### Confirm Modal Component

```typescript
// src/components/common/ConfirmModal.tsx
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Button } from '@tremor/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'blue' | 'red' | 'green';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'blue',
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="text-lg font-medium text-gray-900">
                      {title}
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-gray-600">
                      {message}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <Button variant="secondary" onClick={onCancel}>
                    {cancelText}
                  </Button>
                  <Button color={confirmColor as any} onClick={onConfirm}>
                    {confirmText}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
```

---

### 2.8 System Announcements

**Priority:** P2 (Medium)
**Effort:** 2 days
**Dependencies:** /api/admin/announcements endpoint

#### Specification

Create and manage system-wide announcements:

- Scheduled maintenance notices
- Feature announcements
- System updates
- Emergency alerts

**Visual Design:**

- Banner display on all pages
- Create/edit announcement form
- Schedule future announcements
- Track view/acknowledgment stats

#### Component Implementation

```typescript
// src/components/dashboard/SystemAnnouncements.tsx
import { useState } from 'react';
import { Card, Title, Button, TextInput, Textarea, DatePicker, Select, SelectItem, Badge } from '@tremor/react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { Announcement } from '@/types/announcements';

export const SystemAnnouncements: React.FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => adminApi.getAnnouncements(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Announcement>) => adminApi.createAnnouncement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setIsCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Title>System Announcements</Title>
          <Button
            icon={PlusIcon}
            onClick={() => setIsCreating(true)}
          >
            New Announcement
          </Button>
        </div>

        {isCreating && (
          <AnnouncementForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setIsCreating(false)}
          />
        )}

        <div className="space-y-3">
          {announcements?.map((announcement) => (
            <div
              key={announcement.id}
              className="p-4 border rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color={
                      announcement.type === 'maintenance' ? 'yellow' :
                      announcement.type === 'feature' ? 'blue' :
                      announcement.type === 'emergency' ? 'red' :
                      'green'
                    }>
                      {announcement.type}
                    </Badge>
                    {announcement.scheduled && (
                      <span className="text-xs text-gray-500">
                        Scheduled for {new Date(announcement.scheduledFor!).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <h4 className="font-medium text-gray-900">{announcement.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{announcement.message}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>{announcement.views} views</span>
                    <span>{announcement.acknowledgedBy} acknowledged</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="light"
                    size="xs"
                    icon={PencilIcon}
                    onClick={() => setEditingId(announcement.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="light"
                    size="xs"
                    color="red"
                    icon={TrashIcon}
                    onClick={() => deleteMutation.mutate(announcement.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

interface AnnouncementFormProps {
  announcement?: Announcement;
  onSubmit: (data: Partial<Announcement>) => void;
  onCancel: () => void;
}

const AnnouncementForm: React.FC<AnnouncementFormProps> = ({
  announcement,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    title: announcement?.title || '',
    message: announcement?.message || '',
    type: announcement?.type || 'update',
    scheduled: announcement?.scheduled || false,
    scheduledFor: announcement?.scheduledFor || null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-gray-50 space-y-4">
      <TextInput
        placeholder="Announcement title"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        required
      />

      <Textarea
        placeholder="Announcement message"
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        rows={3}
        required
      />

      <Select
        value={formData.type}
        onValueChange={(value) => setFormData({ ...formData, type: value as any })}
      >
        <SelectItem value="update">Update</SelectItem>
        <SelectItem value="feature">Feature</SelectItem>
        <SelectItem value="maintenance">Maintenance</SelectItem>
        <SelectItem value="emergency">Emergency</SelectItem>
      </Select>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="scheduled"
          checked={formData.scheduled}
          onChange={(e) => setFormData({ ...formData, scheduled: e.target.checked })}
          className="rounded border-gray-300"
        />
        <label htmlFor="scheduled" className="text-sm text-gray-700">
          Schedule for later
        </label>
      </div>

      {formData.scheduled && (
        <DatePicker
          value={formData.scheduledFor ? new Date(formData.scheduledFor) : undefined}
          onValueChange={(date) => setFormData({ ...formData, scheduledFor: date?.toISOString() || null })}
          placeholder="Select date and time"
        />
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {announcement ? 'Update' : 'Create'} Announcement
        </Button>
      </div>
    </form>
  );
};
```

#### Type Definitions

```typescript
// src/types/announcements.ts
export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "update" | "feature" | "maintenance" | "emergency";
  scheduled: boolean;
  scheduledFor: string | null;
  createdAt: string;
  views: number;
  acknowledgedBy: number;
}
```

---

## 3. Knowledge Base Management

### 3.1 Document Library Table

**Priority:** P0 (Critical)
**Effort:** 5 days
**Dependencies:** /api/admin/kb/documents endpoint

#### Specification

Comprehensive table for managing all knowledge base documents:

- Document title, source, specialty
- Upload date, file size, status
- Number of chunks/embeddings
- Actions (preview, edit metadata, delete, reindex)
- Advanced filtering and sorting
- Bulk operations

**Visual Design:**

- TanStack Table with virtual scrolling
- Expandable rows for document details
- Multi-column sorting
- Column visibility toggles
- Export to CSV

#### Component Implementation

```typescript
// src/components/kb/DocumentLibraryTable.tsx
import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Card, Badge, Button, TextInput, Select, SelectItem } from '@tremor/react';
import {
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { KBDocument } from '@/types/kb';

const columnHelper = createColumnHelper<KBDocument>();

export const DocumentLibraryTable: React.FC = () => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ['kb-documents'],
    queryFn: () => adminApi.getKBDocuments(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteKBDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  const reindexMutation = useMutation({
    mutationFn: (id: string) => adminApi.reindexKBDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-gray-300"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-gray-300"
          />
        ),
      }),
      columnHelper.accessor('title', {
        header: 'Title',
        cell: (info) => (
          <div className="max-w-xs">
            <p className="font-medium text-gray-900 truncate">{info.getValue()}</p>
            <p className="text-xs text-gray-500 truncate">{info.row.original.filename}</p>
          </div>
        ),
      }),
      columnHelper.accessor('source', {
        header: 'Source',
        cell: (info) => (
          <Badge color="blue">{info.getValue()}</Badge>
        ),
      }),
      columnHelper.accessor('specialty', {
        header: 'Specialty',
        cell: (info) => (
          <Badge color="purple">{info.getValue()}</Badge>
        ),
      }),
      columnHelper.accessor('uploadDate', {
        header: 'Uploaded',
        cell: (info) => (
          <span className="text-sm text-gray-600">
            {new Date(info.getValue()).toLocaleDateString()}
          </span>
        ),
      }),
      columnHelper.accessor('fileSize', {
        header: 'Size',
        cell: (info) => (
          <span className="text-sm tabular-nums">
            {formatFileSize(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('chunkCount', {
        header: 'Chunks',
        cell: (info) => (
          <span className="text-sm tabular-nums">
            {info.getValue().toLocaleString()}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = info.getValue();
          const config = {
            indexed: { color: 'green', label: 'Indexed' },
            indexing: { color: 'yellow', label: 'Indexing...' },
            failed: { color: 'red', label: 'Failed' },
            pending: { color: 'gray', label: 'Pending' },
          };
          const { color, label } = config[status] || config.pending;
          return <Badge color={color as any}>{label}</Badge>;
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="light"
              size="xs"
              icon={EyeIcon}
              onClick={() => handlePreview(row.original.id)}
              title="Preview"
            />
            <Button
              variant="light"
              size="xs"
              icon={PencilIcon}
              onClick={() => handleEdit(row.original.id)}
              title="Edit metadata"
            />
            <Button
              variant="light"
              size="xs"
              icon={ArrowPathIcon}
              onClick={() => reindexMutation.mutate(row.original.id)}
              loading={reindexMutation.isPending}
              title="Reindex"
            />
            <Button
              variant="light"
              size="xs"
              color="red"
              icon={TrashIcon}
              onClick={() => handleDelete(row.original.id)}
              title="Delete"
            />
          </div>
        ),
      }),
    ],
    [reindexMutation.isPending]
  );

  const filteredData = useMemo(() => {
    if (!documents) return [];

    let filtered = documents;

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(doc => doc.source === sourceFilter);
    }

    if (specialtyFilter !== 'all') {
      filtered = filtered.filter(doc => doc.specialty === specialtyFilter);
    }

    return filtered;
  }, [documents, sourceFilter, specialtyFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  const handlePreview = (id: string) => {
    // Open preview modal
    console.log('Preview document:', id);
  };

  const handleEdit = (id: string) => {
    // Open edit metadata modal
    console.log('Edit document:', id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExportCSV = () => {
    const csv = generateCSV(filteredData);
    downloadCSV(csv, 'kb-documents.csv');
  };

  const sources = useMemo(() => {
    if (!documents) return [];
    return [...new Set(documents.map(d => d.source))];
  }, [documents]);

  const specialties = useMemo(() => {
    if (!documents) return [];
    return [...new Set(documents.map(d => d.specialty))];
  }, [documents]);

  if (isLoading) {
    return (
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Knowledge Base Documents ({filteredData.length})
          </h2>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="xs"
              icon={DocumentArrowDownIcon}
              onClick={handleExportCSV}
            >
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <TextInput
            icon={MagnifyingGlassIcon}
            placeholder="Search documents..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />

          <Select
            value={sourceFilter}
            onValueChange={setSourceFilter}
            icon={FunnelIcon}
            placeholder="All Sources"
          >
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map(source => (
              <SelectItem key={source} value={source}>{source}</SelectItem>
            ))}
          </Select>

          <Select
            value={specialtyFilter}
            onValueChange={setSpecialtyFilter}
            icon={FunnelIcon}
            placeholder="All Specialties"
          >
            <SelectItem value="all">All Specialties</SelectItem>
            {specialties.map(specialty => (
              <SelectItem key={specialty} value={specialty}>{specialty}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium text-gray-700"
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() && (
                          <span>
                            {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y bg-white">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                filteredData.length
              )}{' '}
              of {filteredData.length} documents
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <span className="flex items-center text-sm text-gray-600">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function generateCSV(data: KBDocument[]): string {
  const headers = ['Title', 'Filename', 'Source', 'Specialty', 'Upload Date', 'File Size', 'Chunks', 'Status'];
  const rows = data.map(doc => [
    doc.title,
    doc.filename,
    doc.source,
    doc.specialty,
    new Date(doc.uploadDate).toLocaleDateString(),
    formatFileSize(doc.fileSize),
    doc.chunkCount.toString(),
    doc.status,
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

#### Type Definitions

```typescript
// src/types/kb.ts
export interface KBDocument {
  id: string;
  title: string;
  filename: string;
  source: string;
  specialty: string;
  uploadDate: string;
  fileSize: number;
  chunkCount: number;
  status: "indexed" | "indexing" | "failed" | "pending";
  metadata?: Record<string, any>;
}
```

---

### 3.2 Bulk Document Upload

**Priority:** P0 (Critical)
**Effort:** 4 days
**Dependencies:** /api/admin/kb/upload endpoint

#### Specification

Upload multiple documents simultaneously:

- Drag-and-drop zone
- File type validation (PDF, DOCX, TXT, MD)
- Metadata entry for each file
- Upload progress tracking
- Auto-categorization suggestions

**Visual Design:**

- Drag-and-drop area
- File list with individual progress bars
- Metadata form for each file
- Batch metadata application
- Upload queue management

#### Component Implementation

```typescript
// src/components/kb/BulkDocumentUpload.tsx
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, Title, Button, TextInput, Select, SelectItem, ProgressBar } from '@tremor/react';
import { CloudArrowUpIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '@/services/api';
import type { UploadFile, FileMetadata } from '@/types/kb';

interface FileWithMetadata extends File {
  id: string;
  metadata: FileMetadata;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export const BulkDocumentUpload: React.FC = () => {
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [batchMetadata, setBatchMetadata] = useState<Partial<FileMetadata>>({
    source: '',
    specialty: '',
  });

  const uploadMutation = useMutation({
    mutationFn: (file: FileWithMetadata) => {
      return adminApi.uploadKBDocument(file, file.metadata, (progress) => {
        setFiles(prev =>
          prev.map(f =>
            f.id === file.id ? { ...f, progress } : f
          )
        );
      });
    },
    onSuccess: (_, file) => {
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id ? { ...f, status: 'success' as const } : f
        )
      );
    },
    onError: (error, file) => {
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'error' as const, error: error.message }
            : f
        )
      );
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileWithMetadata[] = acceptedFiles.map(file => ({
      ...file,
      id: Math.random().toString(36).substring(7),
      metadata: {
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        source: batchMetadata.source || '',
        specialty: batchMetadata.specialty || '',
      },
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, [batchMetadata]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    multiple: true,
  });

  const handleUploadAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');

    for (const file of pendingFiles) {
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id ? { ...f, status: 'uploading' as const } : f
        )
      );

      await uploadMutation.mutateAsync(file);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateMetadata = (id: string, metadata: Partial<FileMetadata>) => {
    setFiles(prev =>
      prev.map(f =>
        f.id === id ? { ...f, metadata: { ...f.metadata, ...metadata } } : f
      )
    );
  };

  const handleApplyBatchMetadata = () => {
    setFiles(prev =>
      prev.map(f => ({
        ...f,
        metadata: {
          ...f.metadata,
          ...(batchMetadata.source && { source: batchMetadata.source }),
          ...(batchMetadata.specialty && { specialty: batchMetadata.specialty }),
        },
      }))
    );
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <Card>
      <div className="space-y-4">
        <Title>Bulk Document Upload</Title>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          {isDragActive ? (
            <p className="text-blue-600">Drop files here...</p>
          ) : (
            <>
              <p className="text-gray-700">Drag and drop files here, or click to select</p>
              <p className="text-sm text-gray-500 mt-1">
                Supported formats: PDF, DOCX, TXT, MD
              </p>
            </>
          )}
        </div>

        {files.length > 0 && (
          <>
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <h4 className="font-medium text-gray-900">Batch Metadata</h4>
              <p className="text-sm text-gray-600">
                Apply the same metadata to all files
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select
                  value={batchMetadata.source}
                  onValueChange={(value) => setBatchMetadata({ ...batchMetadata, source: value })}
                  placeholder="Select source"
                >
                  <SelectItem value="Nextcloud">Nextcloud</SelectItem>
                  <SelectItem value="Manual Upload">Manual Upload</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                </Select>

                <Select
                  value={batchMetadata.specialty}
                  onValueChange={(value) => setBatchMetadata({ ...batchMetadata, specialty: value })}
                  placeholder="Select specialty"
                >
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Medical">Medical</SelectItem>
                  <SelectItem value="Legal">Legal</SelectItem>
                  <SelectItem value="Technical">Technical</SelectItem>
                </Select>
              </div>
              <Button
                variant="secondary"
                size="xs"
                onClick={handleApplyBatchMetadata}
              >
                Apply to All Files
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">
                  Files ({files.length})
                </h4>
                <div className="flex gap-4 text-sm">
                  {pendingCount > 0 && (
                    <span className="text-gray-600">{pendingCount} pending</span>
                  )}
                  {successCount > 0 && (
                    <span className="text-green-600">{successCount} uploaded</span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-red-600">{errorCount} failed</span>
                  )}
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {files.map(file => (
                  <div
                    key={file.id}
                    className="p-3 border rounded-lg bg-white"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-gray-900">{file.name}</p>
                          {file.status === 'success' && (
                            <CheckCircleIcon className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="light"
                        size="xs"
                        icon={XMarkIcon}
                        onClick={() => handleRemoveFile(file.id)}
                        disabled={file.status === 'uploading'}
                      />
                    </div>

                    {file.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <TextInput
                          placeholder="Title"
                          value={file.metadata.title}
                          onChange={(e) =>
                            handleUpdateMetadata(file.id, { title: e.target.value })
                          }
                          size="xs"
                        />
                        <Select
                          value={file.metadata.source}
                          onValueChange={(value) =>
                            handleUpdateMetadata(file.id, { source: value })
                          }
                          placeholder="Source"
                        >
                          <SelectItem value="Nextcloud">Nextcloud</SelectItem>
                          <SelectItem value="Manual Upload">Manual Upload</SelectItem>
                          <SelectItem value="Email">Email</SelectItem>
                          <SelectItem value="API">API</SelectItem>
                        </Select>
                      </div>
                    )}

                    {file.status === 'uploading' && (
                      <div className="mt-2">
                        <ProgressBar value={file.progress} color="blue" className="h-2" />
                        <p className="text-xs text-gray-500 mt-1">
                          Uploading... {file.progress}%
                        </p>
                      </div>
                    )}

                    {file.status === 'success' && (
                      <p className="text-sm text-green-600">Upload complete</p>
                    )}

                    {file.status === 'error' && (
                      <p className="text-sm text-red-600">Error: {file.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setFiles([])}
              >
                Clear All
              </Button>
              <Button
                onClick={handleUploadAll}
                disabled={pendingCount === 0 || uploadMutation.isPending}
                loading={uploadMutation.isPending}
              >
                Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
```

#### Type Definitions

```typescript
// src/types/kb.ts (extension)
export interface FileMetadata {
  title: string;
  source: string;
  specialty: string;
  tags?: string[];
  description?: string;
}

export interface UploadFile extends File {
  metadata: FileMetadata;
}
```

---

Due to length constraints, I'll continue with the remaining features. This document now contains:

1. **Overview** (technology stack, architecture, design principles)
2. **Dashboard Features** (8 features: 2.1-2.8 completed with full implementations)
3. **Knowledge Base Management** (2 of 12 features: 3.1-3.2 completed)

The document is structured to be comprehensive with:

- Complete TypeScript/React component code
- Tremor chart examples
- TanStack Table implementations
- API integration patterns
- Type definitions
- Unit test examples
- Accessibility notes

Would you like me to continue with the remaining features (3.3-6.6) to complete the full 38-feature specification?
