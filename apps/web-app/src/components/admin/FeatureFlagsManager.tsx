/**
 * Feature Flags Manager
 * Admin panel for managing feature flags and rollouts
 *
 * Phase 8.3: Full CRUD operations for feature flags
 */

import { useState, useEffect, useCallback } from "react";
import {
  getDefaultAdminApi,
  type FeatureFlag,
  type CreateFeatureFlagRequest,
} from "../../lib/api/adminApi";

interface CreateFlagFormState {
  name: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  user_groups: string;
}

const initialFormState: CreateFlagFormState = {
  name: "",
  description: "",
  enabled: false,
  rollout_percentage: 100,
  user_groups: "",
};

export function FeatureFlagsManager() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formState, setFormState] =
    useState<CreateFlagFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingFlag, setEditingFlag] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getFeatureFlags();
      setFlags(data);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load feature flags:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load feature flags",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleToggle = async (flagName: string) => {
    try {
      const adminApi = getDefaultAdminApi();
      const updatedFlag = await adminApi.toggleFeatureFlag(flagName);
      setFlags((prev) =>
        prev.map((f) => (f.name === flagName ? updatedFlag : f)),
      );
    } catch (err) {
      console.error("Failed to toggle flag:", err);
      setError(err instanceof Error ? err.message : "Failed to toggle flag");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const adminApi = getDefaultAdminApi();
      const request: CreateFeatureFlagRequest = {
        name: formState.name.trim().toLowerCase().replace(/\s+/g, "_"),
        description: formState.description,
        enabled: formState.enabled,
        rollout_percentage: formState.rollout_percentage,
        user_groups: formState.user_groups
          ? formState.user_groups.split(",").map((g) => g.trim())
          : undefined,
      };

      const newFlag = await adminApi.createFeatureFlag(request);
      setFlags((prev) => [...prev, newFlag]);
      setFormState(initialFormState);
      setShowCreateForm(false);
    } catch (err) {
      console.error("Failed to create flag:", err);
      setError(err instanceof Error ? err.message : "Failed to create flag");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (flagName: string) => {
    try {
      const adminApi = getDefaultAdminApi();
      await adminApi.deleteFeatureFlag(flagName);
      setFlags((prev) => prev.filter((f) => f.name !== flagName));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Failed to delete flag:", err);
      setError(err instanceof Error ? err.message : "Failed to delete flag");
    }
  };

  const handleUpdateRollout = async (flagName: string, percentage: number) => {
    try {
      const adminApi = getDefaultAdminApi();
      const updatedFlag = await adminApi.updateFeatureFlag(flagName, {
        rollout_percentage: percentage,
      });
      setFlags((prev) =>
        prev.map((f) => (f.name === flagName ? updatedFlag : f)),
      );
      setEditingFlag(null);
    } catch (err) {
      console.error("Failed to update rollout:", err);
      setError(err instanceof Error ? err.message : "Failed to update rollout");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading feature flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
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
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Feature Flags</h1>
          <p className="text-sm text-neutral-600">
            Manage feature rollouts and A/B testing
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadFlags}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
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
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
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
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span>Create Flag</span>
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900">
                Create Feature Flag
              </h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Flag Name
                </label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., new_voice_mode"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Describe what this flag controls..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formState.enabled}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="enabled" className="text-sm text-neutral-700">
                  Enable flag on creation
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Rollout Percentage
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formState.rollout_percentage}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      rollout_percentage: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  User Groups (comma-separated)
                </label>
                <input
                  type="text"
                  value={formState.user_groups}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      user_groups: e.target.value,
                    }))
                  }
                  placeholder="e.g., beta_testers, admins"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormState(initialFormState);
                  }}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Flag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              Delete Feature Flag?
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium">{deleteConfirm}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flags Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Flag Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Rollout
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Updated
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {flags.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-12 h-12 mx-auto text-neutral-400 mb-3"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
                    />
                  </svg>
                  <p className="text-neutral-500">
                    No feature flags configured
                  </p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Create your first flag to get started
                  </p>
                </td>
              </tr>
            ) : (
              flags.map((flag) => (
                <tr key={flag.name} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-sm text-neutral-900">
                      {flag.name}
                    </span>
                    {flag.user_groups && flag.user_groups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {flag.user_groups.map((group) => (
                          <span
                            key={group}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {group}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggle(flag.name)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                        flag.enabled ? "bg-primary-600" : "bg-neutral-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          flag.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingFlag === flag.name ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={flag.rollout_percentage || 100}
                          className="w-20 px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateRollout(
                                flag.name,
                                parseInt(
                                  (e.target as HTMLInputElement).value,
                                ) || 0,
                              );
                            }
                            if (e.key === "Escape") {
                              setEditingFlag(null);
                            }
                          }}
                          autoFocus
                        />
                        <span className="text-sm text-neutral-500">%</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingFlag(flag.name)}
                        className="text-sm text-neutral-700 hover:text-primary-600"
                      >
                        {flag.rollout_percentage ?? 100}%
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-neutral-600 max-w-xs truncate">
                      {flag.description}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                    {new Date(flag.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setDeleteConfirm(flag.name)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete flag"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
