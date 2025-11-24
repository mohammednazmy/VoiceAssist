import { useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchAPI<User[]>("/api/users");
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await fetchAPI(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      await loadUsers();
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const toggleAdminRole = async (userId: string, currentStatus: boolean) => {
    if (
      !confirm(
        `Are you sure you want to ${currentStatus ? "remove" : "grant"} admin privileges?`,
      )
    ) {
      return;
    }

    try {
      await fetchAPI(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_admin: !currentStatus }),
      });
      await loadUsers();
    } catch (err: any) {
      alert(err.message || "Failed to update user role");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          + Create User
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
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
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3 text-sm text-slate-300">
                  {user.email}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                  {user.full_name || "-"}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                      user.is_admin
                        ? "bg-purple-900/50 text-purple-400 border border-purple-800"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {user.is_admin ? "Admin" : "User"}
                  </span>
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
                <td className="px-4 py-3 text-sm text-right space-x-2">
                  <button
                    onClick={() => toggleAdminRole(user.id, user.is_admin)}
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                    title={user.is_admin ? "Remove admin" : "Make admin"}
                  >
                    {user.is_admin ? "⚙️→👤" : "👤→⚙️"}
                  </button>
                  <button
                    onClick={() => toggleUserStatus(user.id, user.is_active)}
                    className={`${
                      user.is_active
                        ? "text-yellow-400 hover:text-yellow-300"
                        : "text-green-400 hover:text-green-300"
                    } transition-colors`}
                    title={user.is_active ? "Deactivate" : "Activate"}
                  >
                    {user.is_active ? "🔒" : "🔓"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            No users found. Click "Create User" to add one.
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Total users: {users.length} | Active:{" "}
        {users.filter((u) => u.is_active).length} | Admins:{" "}
        {users.filter((u) => u.is_admin).length}
      </div>

      {/* Create User Modal - Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-100 mb-4">
              Create New User
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              User creation UI coming soon. Use the backend API directly for
              now.
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
