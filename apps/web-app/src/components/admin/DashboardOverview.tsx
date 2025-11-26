/**
 * Dashboard Overview
 * Real-time metrics and system status
 */

import { useState, useEffect, useCallback } from "react";
import { getDefaultAdminApi } from "../../lib/api/adminApi";

interface Metrics {
  activeSessions: number;
  totalConversations: number;
  messagesLast24h: number;
  avgResponseTime: number;
  apiCallsToday: number;
  storageUsed: number;
  activeUsers: number;
  errorRate: number;
}

interface SystemStatus {
  database: "healthy" | "degraded" | "down";
  redis: "healthy" | "degraded" | "down";
  qdrant: "healthy" | "degraded" | "down";
  apiGateway: "healthy" | "degraded" | "down";
}

/**
 * Map component status from API response to display status
 */
function mapComponentStatus(status: string): "healthy" | "degraded" | "down" {
  switch (status) {
    case "up":
      return "healthy";
    case "down":
      return "down";
    case "disabled":
      return "degraded";
    default:
      return "down";
  }
}

export function DashboardOverview() {
  const [metrics, setMetrics] = useState<Metrics>({
    activeSessions: 0,
    totalConversations: 0,
    messagesLast24h: 0,
    avgResponseTime: 0,
    apiCallsToday: 0,
    storageUsed: 0,
    activeUsers: 0,
    errorRate: 0,
  });

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    database: "healthy",
    redis: "healthy",
    qdrant: "healthy",
    apiGateway: "healthy",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();

      // Fetch detailed health and admin summary in parallel
      const [detailedHealth, adminSummary] = await Promise.all([
        adminApi.getDetailedHealth().catch(() => null),
        adminApi.getAdminSummary().catch(() => null),
      ]);

      // Update system status from health check
      if (detailedHealth) {
        const { components } = detailedHealth;
        setSystemStatus({
          database: mapComponentStatus(components.postgres.status),
          redis: mapComponentStatus(components.redis.status),
          qdrant: components.qdrant.enabled
            ? mapComponentStatus(components.qdrant.status)
            : "degraded",
          apiGateway: "healthy", // If we got response, API is healthy
        });

        // Calculate avg response time from latencies
        const avgLatency =
          (components.postgres.latency_ms +
            components.redis.latency_ms +
            components.qdrant.latency_ms) /
          3;

        setMetrics((prev) => ({
          ...prev,
          avgResponseTime: avgLatency,
        }));
      } else {
        setSystemStatus({
          database: "down",
          redis: "down",
          qdrant: "down",
          apiGateway: "down",
        });
        setError("Unable to connect to backend");
      }

      // Update user metrics from admin summary
      if (adminSummary) {
        setMetrics((prev) => ({
          ...prev,
          activeUsers: adminSummary.active_users,
          // Other metrics would come from future endpoints
          activeSessions: adminSummary.active_users, // Approximate
          totalConversations: prev.totalConversations || 0,
          messagesLast24h: prev.messagesLast24h || 0,
          apiCallsToday: prev.apiCallsToday || 0,
          storageUsed: prev.storageUsed || 0,
          errorRate: prev.errorRate || 0,
        }));
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load metrics:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();

    // Refresh metrics every 30 seconds
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-100";
      case "degraded":
        return "text-yellow-600 bg-yellow-100";
      case "down":
        return "text-red-600 bg-red-100";
      default:
        return "text-neutral-600 bg-neutral-100";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return "✓";
      case "degraded":
        return "⚠";
      case "down":
        return "✗";
      default:
        return "?";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5 text-red-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Dashboard Overview
          </h1>
          <p className="text-sm text-neutral-600">
            Real-time system metrics and status
          </p>
        </div>
        <button
          onClick={loadMetrics}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          System Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(systemStatus).map(([service, status]) => (
            <div
              key={service}
              className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${getStatusColor(status)}`}
                >
                  {getStatusIcon(status)}
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-900 capitalize">
                    {service.replace(/([A-Z])/g, " $1").trim()}
                  </p>
                  <p className="text-xs text-neutral-600 capitalize">
                    {status}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Sessions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-600">
              Active Sessions
            </p>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-primary-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-neutral-900">
            {metrics.activeSessions}
          </p>
          <p className="text-xs text-green-600 mt-1">
            ↑ {metrics.activeUsers} active users
          </p>
        </div>

        {/* Total Conversations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-600">
              Total Conversations
            </p>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-blue-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-neutral-900">
            {metrics.totalConversations.toLocaleString()}
          </p>
          <p className="text-xs text-neutral-600 mt-1">
            {metrics.messagesLast24h} messages (24h)
          </p>
        </div>

        {/* API Calls */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-600">
              API Calls (Today)
            </p>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-green-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-neutral-900">
            {metrics.apiCallsToday.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 mt-1">
            {metrics.avgResponseTime.toFixed(0)}ms avg response
          </p>
        </div>

        {/* Error Rate */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-600">Error Rate</p>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-yellow-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-3xl font-bold text-neutral-900">
            {metrics.errorRate.toFixed(2)}%
          </p>
          <p className="text-xs text-neutral-600 mt-1">
            {metrics.storageUsed}% storage used
          </p>
        </div>
      </div>

      {/* Recent Activity (placeholder) */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Recent Activity
        </h2>
        <div className="text-center py-12 text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-12 h-12 mx-auto mb-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
          <p className="text-sm">
            Activity feed will be available when backend is ready
          </p>
        </div>
      </div>
    </div>
  );
}
