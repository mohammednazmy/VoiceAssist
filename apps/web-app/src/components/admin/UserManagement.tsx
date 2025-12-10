/**
 * User Management Component (Phase 8.3)
 * CRUD operations for user administration
 */

import { useState, useEffect, useCallback } from "react";
import {
  getDefaultAdminApi,
  type AdminUser,
  type UserUpdateRequest,
} from "../../lib/api/adminApi";

interface EditingUser {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<boolean | undefined>();
  const [filterAdmin, setFilterAdmin] = useState<boolean | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getUsers({
        offset,
        limit,
        search: search || undefined,
        is_active: filterActive,
        is_admin: filterAdmin,
      });
      setUsers(data.users);
      setTotal(data.total);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load users:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [offset, limit, search, filterActive, filterAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    loadUsers();
  };

  const handleEdit = (user: AdminUser) => {
    setEditingUser({
      id: user.id,
      email: user.email,
      full_name: user.full_name || "",
      is_admin: user.is_admin,
      is_active: user.is_active,
    });
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    setError(null);

    try {
      const adminApi = getDefaultAdminApi();
      const updateData: UserUpdateRequest = {
        email: editingUser.email,
        full_name: editingUser.full_name,
        is_admin: editingUser.is_admin,
        is_active: editingUser.is_active,
      };

      await adminApi.updateUser(editingUser.id, updateData);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (
      !confirm(
        `Are you sure you want to deactivate user ${email}? This will prevent them from logging in.`,
      )
    ) {
      return;
    }

    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      await adminApi.deleteUser(userId);
      loadUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setError(
        err instanceof Error ? err.message : "Failed to deactivate user",
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
          <p className="text-neutral-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            User Management
          </h1>
          <p className="text-sm text-neutral-600">
            Manage user accounts and permissions
          </p>
        </div>
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

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={handleSearch} className="flex items-center gap-4">
          <div className="flex-1 relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={filterActive === undefined ? "" : filterActive.toString()}
            onChange={(e) =>
              setFilterActive(
                e.target.value === "" ? undefined : e.target.value === "true",
              )
            }
            className="px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select
            value={filterAdmin === undefined ? "" : filterAdmin.toString()}
            onChange={(e) =>
              setFilterAdmin(
                e.target.value === "" ? undefined : e.target.value === "true",
              )
            }
            className="px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Roles</option>
            <option value="true">Admins</option>
            <option value="false">Regular</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-neutral-500"
                >
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {user.full_name || "—"}
                      </p>
                      <p className="text-xs text-neutral-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.is_admin
                          ? "bg-purple-100 text-purple-700"
                          : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {user.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user.id, user.email)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
            <p className="text-sm text-neutral-600">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of{" "}
              {total} users
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

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              Edit User
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.full_name}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      full_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-center space-x-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.is_admin}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        is_admin: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-neutral-700">Admin</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.is_active}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        is_active: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-neutral-700">Active</span>
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
