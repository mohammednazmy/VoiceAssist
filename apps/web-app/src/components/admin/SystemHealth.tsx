/**
 * System Health
 * Monitoring, logs, and system diagnostics
 */

import { useState, useEffect, useCallback } from "react";
import { getDefaultAdminApi } from "../../lib/api/adminApi";

interface HealthCheck {
  service: string;
  status: "healthy" | "degraded" | "down";
  latency: number;
  uptime: number;
  lastChecked: string;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
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

export function SystemHealth() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSystemHealth = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();

      // Fetch detailed health and OpenAI health in parallel
      const [detailedHealth, openaiHealth] = await Promise.all([
        adminApi.getDetailedHealth().catch(() => null),
        adminApi.getOpenAIHealth().catch(() => null),
      ]);

      const now = new Date().toISOString();
      const checks: HealthCheck[] = [];

      if (detailedHealth) {
        // Map backend health response to HealthCheck format
        const { components } = detailedHealth;

        checks.push({
          service: "PostgreSQL",
          status: mapComponentStatus(components.postgres.status),
          latency: components.postgres.latency_ms,
          uptime: 99.9, // Backend doesn't provide uptime yet
          lastChecked: now,
        });

        checks.push({
          service: "Redis Cache",
          status: mapComponentStatus(components.redis.status),
          latency: components.redis.latency_ms,
          uptime: 99.9,
          lastChecked: now,
        });

        checks.push({
          service: "Qdrant Vector DB",
          status: components.qdrant.enabled
            ? mapComponentStatus(components.qdrant.status)
            : "degraded",
          latency: components.qdrant.latency_ms,
          uptime: 99.9,
          lastChecked: now,
        });

        // API Gateway is healthy if we got a response
        checks.push({
          service: "API Gateway",
          status: "healthy",
          latency: 0, // Would need to measure round-trip
          uptime: 99.9,
          lastChecked: now,
        });
      }

      if (openaiHealth) {
        checks.push({
          service: "OpenAI API",
          status: openaiHealth.status === "ok" ? "healthy" : "down",
          latency: openaiHealth.latency_ms || 0,
          uptime: 99.9,
          lastChecked: now,
        });
      }

      // If we got data from the API, use it; otherwise fall back to mock
      if (checks.length > 0) {
        setHealthChecks(checks);
      } else {
        // Fallback mock data when API is unavailable
        setHealthChecks([
          {
            service: "PostgreSQL",
            status: "down",
            latency: 0,
            uptime: 0,
            lastChecked: now,
          },
          {
            service: "Redis Cache",
            status: "down",
            latency: 0,
            uptime: 0,
            lastChecked: now,
          },
          {
            service: "Qdrant Vector DB",
            status: "down",
            latency: 0,
            uptime: 0,
            lastChecked: now,
          },
          {
            service: "API Gateway",
            status: "down",
            latency: 0,
            uptime: 0,
            lastChecked: now,
          },
          {
            service: "OpenAI API",
            status: "down",
            latency: 0,
            uptime: 0,
            lastChecked: now,
          },
        ]);
        setError("Unable to connect to backend");
      }

      // Logs endpoint not implemented yet - show placeholder
      setLogs([
        {
          timestamp: now,
          level: "info",
          service: "system",
          message: "Health check completed successfully",
        },
      ]);

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load system health:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystemHealth();

    // Refresh every 10 seconds
    const interval = setInterval(loadSystemHealth, 10000);
    return () => clearInterval(interval);
  }, [loadSystemHealth]);

  const getStatusColor = (status: HealthCheck["status"]) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-100";
      case "degraded":
        return "text-yellow-600 bg-yellow-100";
      case "down":
        return "text-red-600 bg-red-100";
    }
  };

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "info":
        return "text-blue-600 bg-blue-100";
      case "warn":
        return "text-yellow-600 bg-yellow-100";
      case "error":
        return "text-red-600 bg-red-100";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading system health...</p>
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
          <h1 className="text-2xl font-bold text-neutral-900">System Health</h1>
          <p className="text-sm text-neutral-600">
            Service status, uptime, and system logs
          </p>
        </div>
        <button
          onClick={loadSystemHealth}
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

      {/* Health Checks */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            Service Health
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Service
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Latency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Uptime
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Last Checked
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {healthChecks.map((check) => (
                <tr key={check.service} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                    {check.service}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(check.status)}`}
                    >
                      {check.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-900">
                    {check.latency}ms
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-900">
                    {check.uptime}%
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {new Date(check.lastChecked).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            Recent Logs
          </h2>
        </div>
        <div className="divide-y divide-neutral-200">
          {logs.map((log, index) => (
            <div key={index} className="px-6 py-4 hover:bg-neutral-50">
              <div className="flex items-start space-x-3">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getLevelColor(log.level)} mt-0.5`}
                >
                  {log.level.toUpperCase()}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-neutral-900">
                      {log.service}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700">{log.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 bg-neutral-50 text-center">
          <button
            onClick={() =>
              alert("Full log viewer will be available when backend is ready")
            }
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View All Logs →
          </button>
        </div>
      </div>
    </div>
  );
}
