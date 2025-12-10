/**
 * WebSocket Status Panel (Phase 8.3)
 * Real-time monitoring of WebSocket connections
 */

import { useState, useEffect, useCallback } from "react";
import {
  getDefaultAdminApi,
  type WebSocketStatusResponse,
} from "../../lib/api/adminApi";

export function WebSocketStatusPanel() {
  const [status, setStatus] = useState<WebSocketStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getWebSocketStatus();
      setStatus(data);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load WebSocket status:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    // Refresh every 5 seconds
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded w-1/3" />
          <div className="h-20 bg-neutral-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            WebSocket Status
          </h2>
          <button
            onClick={loadStatus}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Retry
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">
          WebSocket Status
        </h2>
        <div className="flex items-center space-x-2">
          <span
            className={`w-2 h-2 rounded-full ${status?.active_connections ? "bg-green-500 animate-pulse" : "bg-neutral-300"}`}
          />
          <span className="text-sm text-neutral-600">
            {status?.active_connections || 0} active
          </span>
        </div>
      </div>

      {/* Connection Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-2xl font-bold text-blue-600">
            {status?.connections_by_type.chat || 0}
          </p>
          <p className="text-xs text-blue-700">Chat</p>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <p className="text-2xl font-bold text-purple-600">
            {status?.connections_by_type.voice || 0}
          </p>
          <p className="text-xs text-purple-700">Voice</p>
        </div>
        <div className="text-center p-3 bg-neutral-50 rounded-lg">
          <p className="text-2xl font-bold text-neutral-600">
            {status?.connections_by_type.other || 0}
          </p>
          <p className="text-xs text-neutral-700">Other</p>
        </div>
      </div>

      {/* Pool Stats */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-medium text-neutral-700">
          Connection Pools
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 border border-neutral-200 rounded-lg">
            <p className="text-xs text-neutral-600 mb-1">Database Pool</p>
            <div className="flex items-baseline space-x-2">
              <span className="text-lg font-semibold text-neutral-900">
                {status?.pool_stats.database.checked_out || 0}
              </span>
              <span className="text-xs text-neutral-500">
                / {status?.pool_stats.database.size || 0} used
              </span>
            </div>
          </div>
          <div className="p-3 border border-neutral-200 rounded-lg">
            <p className="text-xs text-neutral-600 mb-1">Redis Pool</p>
            <div className="flex items-baseline space-x-2">
              <span className="text-lg font-semibold text-neutral-900">
                {status?.pool_stats.redis.in_use_connections || 0}
              </span>
              <span className="text-xs text-neutral-500">
                / {status?.pool_stats.redis.max_connections || 0} used
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Connections */}
      {status?.recent_connections && status.recent_connections.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">
            Recent Connections
          </h3>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">User</th>
                  <th className="pb-2">Connected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {status.recent_connections.map((conn) => (
                  <tr key={conn.session_id} className="hover:bg-neutral-50">
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          conn.type === "voice"
                            ? "bg-purple-100 text-purple-700"
                            : conn.type === "chat"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {conn.type}
                      </span>
                    </td>
                    <td className="py-2 text-neutral-600 truncate max-w-[120px]">
                      {conn.user_id?.substring(0, 8)}...
                    </td>
                    <td className="py-2 text-neutral-500">
                      {new Date(conn.connected_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!status?.recent_connections ||
        status.recent_connections.length === 0) && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          No active connections
        </div>
      )}
    </div>
  );
}
