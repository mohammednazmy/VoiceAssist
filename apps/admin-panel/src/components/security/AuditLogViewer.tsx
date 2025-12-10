/**
 * Audit Log Viewer Component
 *
 * Displays a paginated list of audit log entries with filtering and export capabilities.
 */

import { useState } from "react";
import { useAuditLogs, AuditLogEntry } from "../../hooks/useAuditLogs";

const ACTION_FILTERS = [
  { value: null, label: "All Actions" },
  { value: "auth.login", label: "Logins" },
  { value: "auth.logout", label: "Logouts" },
  { value: "auth.2fa", label: "2FA Changes" },
  { value: "user.update", label: "User Updates" },
  { value: "user.deactivate", label: "User Deactivations" },
  { value: "kb.", label: "Knowledge Base" },
];

function getActionIcon(action: string): string {
  if (action.startsWith("auth.login")) return "🔑";
  if (action.startsWith("auth.logout")) return "🚪";
  if (action.startsWith("auth.2fa")) return "🔐";
  if (action.startsWith("user.")) return "👤";
  if (action.startsWith("kb.")) return "📚";
  if (action.startsWith("admin.")) return "⚙️";
  return "📝";
}

function getActionColor(action: string, success: boolean): string {
  if (!success) return "text-red-400 bg-red-900/30";
  if (action.includes("login_success")) return "text-green-400 bg-green-900/30";
  if (action.includes("login_failed")) return "text-red-400 bg-red-900/30";
  if (action.includes("2fa_enabled")) return "text-blue-400 bg-blue-900/30";
  if (action.includes("2fa_disabled")) return "text-amber-400 bg-amber-900/30";
  if (action.includes("deactivate")) return "text-red-400 bg-red-900/30";
  return "text-slate-400 bg-slate-800";
}

function formatAction(action: string): string {
  return action
    .replace(/^(auth|user|kb|admin)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function LogEntryRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr
      className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <td className="px-4 py-3">
        <div className="text-xs text-slate-400">
          {formatTimestamp(entry.timestamp)}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getActionIcon(entry.action)}</span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.action, entry.success)}`}
          >
            {formatAction(entry.action)}
          </span>
        </div>
        {expanded && entry.details && (
          <div className="mt-2 text-xs text-slate-500 font-mono bg-slate-900/50 p-2 rounded max-w-md truncate">
            {entry.details}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-slate-300">
          {entry.user_email || "System"}
        </div>
        {entry.user_id && (
          <div className="text-xs text-slate-500 truncate max-w-32">
            {entry.user_id}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {entry.resource_type && (
          <div className="text-sm text-slate-400">
            {entry.resource_type}
            {entry.resource_id && (
              <span className="text-slate-500 ml-1 text-xs">
                #{entry.resource_id.slice(0, 8)}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
            entry.success
              ? "bg-green-900/30 text-green-400"
              : "bg-red-900/30 text-red-400"
          }`}
        >
          {entry.success ? "Success" : "Failed"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {entry.ip_address || "-"}
      </td>
    </tr>
  );
}

export function AuditLogViewer() {
  const {
    logs,
    total,
    loading,
    error,
    offset,
    limit,
    refresh,
    setOffset,
    setActionFilter,
    actionFilter,
    exportLogs,
  } = useAuditLogs({ autoRefresh: true, refreshIntervalMs: 30000 });

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePreviousPage = () => {
    if (offset >= limit) {
      setOffset(offset - limit);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-200">
            Security Audit Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {total.toLocaleString()} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Action Filter */}
          <select
            value={actionFilter || ""}
            onChange={(e) => {
              setActionFilter(e.target.value || null);
              setOffset(0);
            }}
            className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ACTION_FILTERS.map((filter) => (
              <option key={filter.value || "all"} value={filter.value || ""}>
                {filter.label}
              </option>
            ))}
          </select>

          {/* Export Button */}
          <button
            onClick={exportLogs}
            className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            Export CSV
          </button>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-400 bg-red-900/20">{error}</div>
      )}

      {loading && logs.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          No audit log entries found
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-800">
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Resource</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <LogEntryRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Showing {offset + 1} - {Math.min(offset + limit, total)} of{" "}
              {total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={offset === 0}
                className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={offset + limit >= total}
                className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
