import { useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { CreateUserDialog } from "../components/users/CreateUserDialog";
import { EditUserDialog } from "../components/users/EditUserDialog";
import { PasswordResetDialog } from "../components/users/PasswordResetDialog";
import { PermanentDeleteDialog } from "../components/users/PermanentDeleteDialog";
import { BulkActionBar } from "../components/users/BulkActionBar";
import { RoleBadge } from "../components/users/RoleBadge";
import { useBulkOperations } from "../hooks/useBulkOperations";

interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  is_active: boolean;
  admin_role: "user" | "admin" | "viewer";
  created_at: string;
  last_login?: string;
}

interface RoleHistoryEntry {
  id: string;
  changed_at: string | null;
  actor: string;
  from_role: "admin" | "user";
  to_role: "admin" | "user";
  reason?: string;
}

interface LockEvent {
  id: string;
  timestamp: string | null;
  actor: string;
  status: "locked" | "unlocked";
  reason?: string;
}

interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset_in?: number | null;
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] =
    useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<AdminUser | null>(
    null,
  );
  const [permanentDeleteUser, setPermanentDeleteUser] =
    useState<AdminUser | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [roleHistory, setRoleHistory] = useState<RoleHistoryEntry[]>([]);
  const [lockEvents, setLockEvents] = useState<LockEvent[]>([]);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const { isViewer } = useAuth();

  // Bulk operations
  const {
    selectedIds,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    executeBulkOperation,
    isLoading: bulkLoading,
    lastResult: bulkResult,
  } = useBulkOperations(users.length);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  useEffect(() => {
    loadUsers();
  }, [page]);

  useEffect(() => {
    if (selectedUserId) {
      loadUserInsights(selectedUserId);
    }
  }, [selectedUserId]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const offset = page * pageSize;
      const data = await fetchAPI<{
        users: AdminUser[];
        total: number;
        offset: number;
        limit: number;
      }>(`/api/admin/panel/users?offset=${offset}&limit=${pageSize}`);
      setUsers(data.users);
      setTotal(data.total);
      if (!selectedUserId && data.users.length > 0) {
        setSelectedUserId(data.users[0].id);
      }
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadUserInsights = async (userId: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [historyRes, lockRes] = await Promise.all([
        fetchAPI<{ history: RoleHistoryEntry[] }>(
          `/api/admin/panel/users/${userId}/role-history`,
        ),
        fetchAPI<{ events: LockEvent[] }>(
          `/api/admin/panel/users/${userId}/lock-reasons`,
        ),
      ]);
      setRoleHistory(historyRes.history);
      setLockEvents(lockRes.events);
    } catch (err: unknown) {
      console.error("Failed to load user insights:", err);
      setHistoryError(
        err instanceof Error ? err.message : "Failed to load user history",
      );
      setRoleHistory([]);
      setLockEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatRateLimit = (info?: RateLimitInfo | null) => {
    if (!info || info.limit === undefined) return null;
    return `Limit: ${info.limit} · Remaining: ${
      info.remaining ?? "—"
    } · Resets in ${info.reset_in ?? "?"}s`;
  };

  const handleRateLimit = (info?: RateLimitInfo | null) => {
    const text = formatRateLimit(info);
    setRateLimitNotice(text);
  };

  const promptForReason = (action: string) => {
    const reason = prompt(
      `Add a reason for this ${action}?`,
      "Policy enforcement",
    );
    if (reason === null) return null;
    return reason.trim() || "Admin action";
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (isViewer) return;
    const reason = promptForReason(
      currentStatus ? "deactivation" : "reactivation",
    );
    if (reason === null) return;

    try {
      const data = await fetchAPI<{
        rate_limit?: RateLimitInfo;
      }>(`/api/admin/panel/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: !currentStatus,
          action_reason: reason,
        }),
      });
      handleRateLimit(data.rate_limit ?? null);
      await loadUsers();
      if (userId === selectedUserId) {
        await loadUserInsights(userId);
      }
    } catch (err: unknown) {
      const error = err as {
        details?: { rate_limit?: RateLimitInfo };
        message?: string;
      };
      if (error.details?.rate_limit) {
        handleRateLimit(error.details.rate_limit);
      }
      alert(error.message || "Failed to update user");
    }
  };

  const toggleAdminRole = async (userId: string, currentStatus: boolean) => {
    if (isViewer) return;
    if (
      !confirm(
        `Are you sure you want to ${currentStatus ? "remove" : "grant"} admin privileges?`,
      )
    ) {
      return;
    }

    const reason = promptForReason("role change");
    if (reason === null) return;

    try {
      const data = await fetchAPI<{
        rate_limit?: RateLimitInfo;
      }>(`/api/admin/panel/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          is_admin: !currentStatus,
          action_reason: reason,
        }),
      });
      handleRateLimit(data.rate_limit ?? null);
      await loadUsers();
      if (userId === selectedUserId) {
        await loadUserInsights(userId);
      }
    } catch (err: unknown) {
      const error = err as {
        details?: { rate_limit?: RateLimitInfo };
        message?: string;
      };
      if (error.details?.rate_limit) {
        handleRateLimit(error.details.rate_limit);
      }
      alert(error.message || "Failed to update user role");
    }
  };

  const handleExportAudit = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/panel/audit-logs/export", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Failed to export audit logs");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "admin-audit.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unable to export audit CSV");
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    if (isViewer) return;
    if (
      !confirm(
        `Are you sure you want to DELETE user "${userEmail}"?\n\nThis will permanently deactivate the account. This action is logged and audited.`,
      )
    ) {
      return;
    }

    try {
      await fetchAPI<{ message: string }>(`/api/admin/panel/users/${userId}`, {
        method: "DELETE",
      });
      alert(`User "${userEmail}" has been deleted successfully.`);
      // If we just deleted the selected user, clear selection
      if (selectedUserId === userId) {
        setSelectedUserId(null);
        setRoleHistory([]);
        setLockEvents([]);
      }
      await loadUsers();
    } catch (err: unknown) {
      const error = err as {
        details?: { rate_limit?: RateLimitInfo };
        message?: string;
      };
      if (error.details?.rate_limit) {
        handleRateLimit(error.details.rate_limit);
      }
      alert(error.message || "Failed to delete user");
    }
  };

  const renderTableRows = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, idx) => (
        <tr
          key={idx}
          className="divide-x divide-slate-900 bg-slate-900/30 animate-pulse"
        >
          {/* Checkbox column */}
          <td className="px-4 py-3">
            <div className="h-4 w-4 bg-slate-800 rounded" />
          </td>
          {Array.from({ length: 7 }).map((__, cellIdx) => (
            <td key={cellIdx} className="px-4 py-3">
              <div className="h-3 w-full max-w-[140px] bg-slate-800 rounded" />
            </td>
          ))}
        </tr>
      ));
    }

    return users.map((user) => (
      <tr
        key={user.id}
        className={`hover:bg-slate-800/50 ${selectedUserId === user.id ? "bg-slate-900/60" : ""} ${isSelected(user.id) ? "bg-blue-950/30" : ""}`}
      >
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected(user.id)}
            onChange={() => toggleSelection(user.id)}
            disabled={isViewer}
            className="h-4 w-4 text-blue-600 border-slate-600 bg-slate-800 rounded focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
          />
        </td>
        <td className="px-4 py-3 text-sm text-slate-300">{user.email}</td>
        <td className="px-4 py-3 text-sm text-slate-300">
          {user.full_name || "-"}
        </td>
        <td className="px-4 py-3 text-sm">
          <RoleBadge
            role={user.admin_role || (user.is_admin ? "admin" : "user")}
          />
        </td>
        <td className="px-4 py-3 text-sm">
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
              user.is_active
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : "bg-red-900/50 text-red-400 border border-red-800"
            }`}
          >
            {user.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">
          {new Date(user.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">
          {user.last_login
            ? new Date(user.last_login).toLocaleDateString()
            : "-"}
        </td>
        <td className="px-4 py-3 text-sm text-right space-x-2">
          <button
            onClick={() => {
              setEditingUser(user);
              setShowEditModal(true);
            }}
            disabled={isViewer}
            className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Edit user"
          >
            ✏️
          </button>
          <button
            onClick={() => {
              setPasswordResetUser(user);
              setShowPasswordResetModal(true);
            }}
            disabled={isViewer}
            className="text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reset password"
          >
            🔑
          </button>
          <button
            onClick={() => toggleAdminRole(user.id, user.is_admin)}
            disabled={isViewer}
            className="text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={user.is_admin ? "Remove admin" : "Make admin"}
          >
            {user.is_admin ? "⚙️→👤" : "👤→⚙️"}
          </button>
          <button
            onClick={() => toggleUserStatus(user.id, user.is_active)}
            disabled={isViewer}
            className={`${
              user.is_active
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-green-400 hover:text-green-300"
            } transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            title={user.is_active ? "Deactivate" : "Activate"}
          >
            {user.is_active ? "🔒" : "🔓"}
          </button>
          <button
            onClick={() => setSelectedUserId(user.id)}
            className={`transition-colors ${
              selectedUserId === user.id
                ? "text-blue-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="View history"
          >
            📜
          </button>
          <button
            onClick={() => deleteUser(user.id, user.email)}
            disabled={isViewer}
            className="text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Deactivate user"
          >
            🗑️
          </button>
          <button
            onClick={() => {
              setPermanentDeleteUser(user);
              setShowPermanentDeleteModal(true);
            }}
            disabled={isViewer}
            className="text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Permanently delete user"
          >
            💀
          </button>
        </td>
      </tr>
    ));
  };

  // Mobile card view for users
  const renderMobileCards = () => {
    if (loading) {
      return Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse space-y-3"
        >
          <div className="h-4 w-3/4 bg-slate-800 rounded" />
          <div className="h-3 w-1/2 bg-slate-800 rounded" />
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-slate-800 rounded" />
            <div className="h-6 w-16 bg-slate-800 rounded" />
          </div>
        </div>
      ));
    }

    if (users.length === 0 && !error) {
      return (
        <div className="p-8 text-center text-slate-400 bg-slate-900/50 border border-slate-800 rounded-lg">
          No users found.{" "}
          {isViewer
            ? "Contact an admin to add users."
            : 'Click "Create User" to add one.'}
        </div>
      );
    }

    return users.map((user) => (
      <div
        key={user.id}
        className={`bg-slate-900/50 border rounded-lg p-4 space-y-3 ${
          selectedUserId === user.id
            ? "border-blue-700 bg-slate-900/80"
            : isSelected(user.id)
              ? "border-blue-600 bg-blue-950/30"
              : "border-slate-800"
        }`}
      >
        {/* Header with checkbox, email and status badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {!isViewer && (
              <input
                type="checkbox"
                checked={isSelected(user.id)}
                onChange={() => toggleSelection(user.id)}
                className="mt-0.5 h-4 w-4 text-blue-600 border-slate-600 bg-slate-800 rounded focus:ring-blue-500 focus:ring-offset-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-200 truncate">
                {user.email}
              </div>
              {user.full_name && (
                <div className="text-xs text-slate-400 truncate">
                  {user.full_name}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <RoleBadge
              role={user.admin_role || (user.is_admin ? "admin" : "user")}
              size="sm"
            />
            <span
              className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded ${
                user.is_active
                  ? "bg-green-900/50 text-green-400 border border-green-800"
                  : "bg-red-900/50 text-red-400 border border-red-800"
              }`}
            >
              {user.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Dates */}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
          <span>
            Last login:{" "}
            {user.last_login
              ? new Date(user.last_login).toLocaleDateString()
              : "Never"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setEditingUser(user);
                setShowEditModal(true);
              }}
              disabled={isViewer}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✏️ <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => {
                setPasswordResetUser(user);
                setShowPasswordResetModal(true);
              }}
              disabled={isViewer}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🔑 <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={() => toggleAdminRole(user.id, user.is_admin)}
              disabled={isViewer}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {user.is_admin ? "⚙️→👤" : "👤→⚙️"}
              <span className="hidden sm:inline">
                {user.is_admin ? "Remove admin" : "Make admin"}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleUserStatus(user.id, user.is_active)}
              disabled={isViewer}
              className={`flex items-center gap-1 text-xs ${
                user.is_active
                  ? "text-yellow-400 hover:text-yellow-300"
                  : "text-green-400 hover:text-green-300"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {user.is_active ? "🔒" : "🔓"}
            </button>
            <button
              onClick={() => setSelectedUserId(user.id)}
              className={`flex items-center gap-1 text-xs ${
                selectedUserId === user.id
                  ? "text-blue-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📜
            </button>
            <button
              onClick={() => deleteUser(user.id, user.email)}
              disabled={isViewer}
              className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Deactivate"
            >
              🗑️
            </button>
            <button
              onClick={() => {
                setPermanentDeleteUser(user);
                setShowPermanentDeleteModal(true);
              }}
              disabled={isViewer}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Permanently delete"
            >
              💀
            </button>
          </div>
        </div>
      </div>
    ));
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage user accounts, roles, and permissions with auditability
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAudit}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
          >
            Export admin activity CSV
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={isViewer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-950 disabled:text-slate-400 text-white rounded-md text-sm font-medium transition-colors"
          >
            + Create User
          </button>
        </div>
      </div>

      {rateLimitNotice && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md text-amber-300 text-sm">
          Sensitive action rate limit — {rateLimitNotice}
        </div>
      )}

      {isViewer && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md text-amber-300 text-sm">
          Viewer role is read-only. User creation and status changes are
          disabled.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={loadUsers}
            className="px-3 py-1 text-xs bg-red-900/50 border border-red-800 rounded-md text-red-100 hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {renderMobileCards()}

        {/* Mobile pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
            >
              ← Prev
            </button>
            <span className="text-xs text-slate-400">
              {page + 1} / {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() =>
                setPage((p) => Math.min(Math.ceil(total / pageSize) - 1, p + 1))
              }
              disabled={(page + 1) * pageSize >= total}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    users.length > 0 && selectedIds.size === users.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAll(users.map((u) => u.id));
                    } else {
                      clearSelection();
                    }
                  }}
                  disabled={isViewer || users.length === 0}
                  className="h-4 w-4 text-blue-600 border-slate-600 bg-slate-800 rounded focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Last login
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {renderTableRows()}
          </tbody>
        </table>

        {!loading && users.length === 0 && !error && (
          <div className="p-8 text-center text-slate-400">
            No users found.{" "}
            {isViewer
              ? "Contact an admin to add users."
              : 'Click "Create User" to add one.'}
          </div>
        )}

        {/* Desktop pagination controls */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} to{" "}
              {Math.min((page + 1) * pageSize, total)} of {total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.ceil(total / pageSize) - 1, p + 1),
                  )
                }
                disabled={(page + 1) * pageSize >= total}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Total users: {total} | Active: {users.filter((u) => u.is_active).length}{" "}
        | Admins: {users.filter((u) => u.is_admin).length}
      </div>

      {selectedUser && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              History for:{" "}
              <span className="text-blue-400">{selectedUser.email}</span>
            </h2>
            <button
              onClick={() => {
                setSelectedUserId(null);
                setRoleHistory([]);
                setLockEvents([]);
                setHistoryError(null);
              }}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ✕ Close
            </button>
          </div>

          {historyError && (
            <div className="p-3 bg-red-950/50 border border-red-900 rounded-md text-red-400 text-sm">
              {historyError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100">
                  Role assignment history
                </h3>
                {historyLoading && (
                  <span className="text-xs text-slate-400">Loading…</span>
                )}
              </div>
              {roleHistory.length === 0 && !historyLoading ? (
                <p className="text-sm text-slate-400">
                  No role changes recorded.
                </p>
              ) : (
                <ul className="space-y-2">
                  {roleHistory.map((entry) => (
                    <li
                      key={entry.id}
                      className="p-3 bg-slate-800/60 border border-slate-700 rounded-md text-sm text-slate-200"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{entry.actor}</span>
                        <span>
                          {entry.changed_at
                            ? new Date(entry.changed_at).toLocaleString()
                            : ""}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-100">
                        {entry.from_role} → {entry.to_role}
                      </div>
                      {entry.reason && (
                        <div className="text-xs text-slate-400 mt-1">
                          Reason: {entry.reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100">
                  Account lock/unlock reasons
                </h3>
                {historyLoading && (
                  <span className="text-xs text-slate-400">Loading…</span>
                )}
              </div>
              {lockEvents.length === 0 && !historyLoading ? (
                <p className="text-sm text-slate-400">
                  No lock or unlock actions recorded.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lockEvents.map((event) => (
                    <li
                      key={event.id}
                      className="p-3 bg-slate-800/60 border border-slate-700 rounded-md text-sm text-slate-200"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{event.actor}</span>
                        <span>
                          {event.timestamp
                            ? new Date(event.timestamp).toLocaleString()
                            : ""}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-100 flex items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                            event.status === "locked"
                              ? "bg-red-500/10 text-red-300 border border-red-500/40"
                              : "bg-green-500/10 text-green-300 border border-green-500/40"
                          }`}
                        >
                          {event.status}
                        </span>
                        <span className="text-slate-200">
                          {event.reason || "Admin status change"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <CreateUserDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          loadUsers();
        }}
      />

      <EditUserDialog
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingUser(null);
        }}
        onSuccess={() => {
          loadUsers();
          if (editingUser && selectedUserId === editingUser.id) {
            loadUserInsights(editingUser.id);
          }
        }}
        user={editingUser}
      />

      <PasswordResetDialog
        isOpen={showPasswordResetModal}
        onClose={() => {
          setShowPasswordResetModal(false);
          setPasswordResetUser(null);
        }}
        user={passwordResetUser}
      />

      <PermanentDeleteDialog
        isOpen={showPermanentDeleteModal}
        onClose={() => {
          setShowPermanentDeleteModal(false);
          setPermanentDeleteUser(null);
        }}
        onSuccess={() => {
          // Clear selection if we deleted the selected user
          if (
            permanentDeleteUser &&
            selectedUserId === permanentDeleteUser.id
          ) {
            setSelectedUserId(null);
            setRoleHistory([]);
            setLockEvents([]);
          }
          loadUsers();
        }}
        user={permanentDeleteUser}
      />

      {/* Bulk action bar (appears when users are selected) */}
      {!isViewer && (
        <BulkActionBar
          selectedCount={selectedCount}
          isLoading={bulkLoading}
          onAction={async (action, role, reason) => {
            const result = await executeBulkOperation(action, role, reason);
            // Reload users after bulk operation
            await loadUsers();
            return result;
          }}
          onClearSelection={clearSelection}
          lastResult={bulkResult}
        />
      )}
    </div>
  );
}
