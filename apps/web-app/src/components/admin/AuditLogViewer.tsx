/**
 * Audit Log Viewer Component (Phase 8.3)
 * View and filter system audit logs
 */

import { useState, useEffect, useCallback } from "react";
import { getDefaultAdminApi, type AuditLogEntry } from "../../lib/api/adminApi";

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getAuditLogs({
        offset,
        limit,
        level: levelFilter || undefined,
        action: actionFilter || undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [offset, limit, levelFilter, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            ERROR
          </span>
        );
      case "warn":
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
            WARN
          </span>
        );
      case "info":
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
            INFO
          </span>
        );
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Audit Logs</h1>
          <p className="text-sm text-neutral-600">
            System activity and security events
          </p>
        </div>
        <button
          onClick={loadLogs}
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

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-neutral-700">Level:</label>
          <select
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="flex items-center space-x-2 flex-1">
          <label className="text-sm font-medium text-neutral-700">
            Action:
          </label>
          <input
            type="text"
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="text-sm text-neutral-600">
          {total} {total === 1 ? "entry" : "entries"}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-neutral-500"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-12 h-12 mx-auto mb-3 text-neutral-400"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    <p>No audit logs found</p>
                    <p className="text-xs mt-1">
                      Audit events will appear here as system activity occurs
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={index} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 text-sm text-neutral-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">{getLevelBadge(log.level)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {log.user_id ? (
                        <span className="font-mono text-xs">
                          {log.user_id.substring(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-neutral-400">System</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600 max-w-md truncate">
                      {log.details || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
            <p className="text-sm text-neutral-600">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of{" "}
              {total} entries
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-1 text-sm border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-neutral-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1 text-sm border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
