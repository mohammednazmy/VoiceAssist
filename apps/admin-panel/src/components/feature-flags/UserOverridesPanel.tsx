/**
 * User Flag Overrides Panel (Phase 4)
 *
 * Admin panel component for managing per-user feature flag overrides.
 *
 * Features:
 * - View override statistics
 * - Search overrides by user ID or flag name
 * - Create new overrides
 * - Edit existing overrides
 * - Bulk enable/disable overrides
 * - Delete overrides
 * - Full accessibility support (keyboard nav, ARIA labels)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useUserOverrides,
  UserFlagOverride,
  UserFlagOverrideCreate,
  UserFlagOverrideUpdate,
} from "../../hooks/useUserOverrides";
import {
  DataPanel,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
  LoadingGrid,
  ErrorState,
  RefreshButton,
  StatCard,
} from "../shared";

interface UserOverridesPanelProps {
  /** Optional: filter to specific user ID */
  userId?: string;
  /** Optional: filter to specific flag name */
  flagName?: string;
  /** Whether user has admin permissions */
  isAdmin?: boolean;
}

export function UserOverridesPanel({
  userId,
  flagName,
  isAdmin = false,
}: UserOverridesPanelProps) {
  const {
    overrides,
    loading,
    error,
    stats,
    refreshOverrides,
    createOverride,
    updateOverride,
    deleteOverride,
    toggleOverride,
    bulkDelete,
    refreshStats,
  } = useUserOverrides({ userId, flagName });

  // Search state
  const [searchUserId, setSearchUserId] = useState("");
  const [searchFlagName, setSearchFlagName] = useState("");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOverride, setEditingOverride] =
    useState<UserFlagOverride | null>(null);
  const [deletingOverride, setDeletingOverride] =
    useState<UserFlagOverride | null>(null);
  const [selectedOverrides, setSelectedOverrides] = useState<Set<string>>(
    new Set(),
  );
  const [updating, setUpdating] = useState(false);

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formFlagName, setFormFlagName] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formReason, setFormReason] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");

  // Focus management refs
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const modalFirstFocusRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Filter overrides based on search
  const filteredOverrides = overrides.filter((override) => {
    if (searchUserId && !override.user_id.includes(searchUserId)) return false;
    if (searchFlagName && !override.flag_name.includes(searchFlagName))
      return false;
    return true;
  });

  // Reset form
  const resetForm = useCallback(() => {
    setFormUserId(userId || "");
    setFormFlagName(flagName || "");
    setFormValue("");
    setFormEnabled(true);
    setFormReason("");
    setFormExpiresAt("");
  }, [userId, flagName]);

  // Open create modal
  const openCreateModal = useCallback(() => {
    resetForm();
    setShowCreateModal(true);
  }, [resetForm]);

  // Close create modal
  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    createButtonRef.current?.focus();
  }, []);

  // Open edit modal
  const openEditModal = useCallback((override: UserFlagOverride) => {
    setFormUserId(override.user_id);
    setFormFlagName(override.flag_name);
    setFormValue(JSON.stringify(override.value ?? ""));
    setFormEnabled(override.enabled);
    setFormReason(override.reason || "");
    setFormExpiresAt(
      override.expires_at ? override.expires_at.slice(0, 16) : "",
    );
    setEditingOverride(override);
  }, []);

  // Close edit modal
  const closeEditModal = useCallback(() => {
    setEditingOverride(null);
    resetForm();
  }, [resetForm]);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!formUserId || !formFlagName) return;

    setUpdating(true);
    const newOverride: UserFlagOverrideCreate = {
      user_id: formUserId,
      flag_name: formFlagName,
      value: formValue ? JSON.parse(formValue) : undefined,
      enabled: formEnabled,
      reason: formReason || undefined,
      expires_at: formExpiresAt
        ? new Date(formExpiresAt).toISOString()
        : undefined,
    };

    const success = await createOverride(newOverride);
    if (success) {
      closeCreateModal();
      await refreshStats();
    }
    setUpdating(false);
  }, [
    formUserId,
    formFlagName,
    formValue,
    formEnabled,
    formReason,
    formExpiresAt,
    createOverride,
    closeCreateModal,
    refreshStats,
  ]);

  // Handle update
  const handleUpdate = useCallback(async () => {
    if (!editingOverride) return;

    setUpdating(true);
    const updates: UserFlagOverrideUpdate = {
      value: formValue ? JSON.parse(formValue) : undefined,
      enabled: formEnabled,
      reason: formReason || undefined,
      expires_at: formExpiresAt
        ? new Date(formExpiresAt).toISOString()
        : undefined,
    };

    const success = await updateOverride(
      editingOverride.user_id,
      editingOverride.flag_name,
      updates,
    );
    if (success) {
      closeEditModal();
      await refreshStats();
    }
    setUpdating(false);
  }, [
    editingOverride,
    formValue,
    formEnabled,
    formReason,
    formExpiresAt,
    updateOverride,
    closeEditModal,
    refreshStats,
  ]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deletingOverride) return;

    setUpdating(true);
    const success = await deleteOverride(
      deletingOverride.user_id,
      deletingOverride.flag_name,
    );
    if (success) {
      setDeletingOverride(null);
      await refreshStats();
    }
    setUpdating(false);
  }, [deletingOverride, deleteOverride, refreshStats]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedOverrides.size === 0) return;

    setUpdating(true);
    // Extract user IDs from selected overrides
    const userIds = Array.from(selectedOverrides).map(
      (key) => key.split(":")[0],
    );
    const success = await bulkDelete(userIds);
    if (success) {
      setSelectedOverrides(new Set());
      await refreshStats();
    }
    setUpdating(false);
  }, [selectedOverrides, bulkDelete, refreshStats]);

  // Toggle selection
  const toggleSelection = useCallback((override: UserFlagOverride) => {
    const key = `${override.user_id}:${override.flag_name}`;
    setSelectedOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Select all visible
  const selectAll = useCallback(() => {
    setSelectedOverrides(
      new Set(filteredOverrides.map((o) => `${o.user_id}:${o.flag_name}`)),
    );
  }, [filteredOverrides]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedOverrides(new Set());
  }, []);

  // Focus first input when modal opens
  useEffect(() => {
    if (showCreateModal || editingOverride) {
      setTimeout(() => modalFirstFocusRef.current?.focus(), 100);
    }
  }, [showCreateModal, editingOverride]);

  // Check if override is expired
  const isExpired = (override: UserFlagOverride) => {
    if (!override.expires_at) return false;
    return new Date(override.expires_at) < new Date();
  };

  // Get status badge for override
  const getOverrideBadge = (override: UserFlagOverride) => {
    if (isExpired(override)) {
      return <StatusBadge status="error" label="Expired" size="sm" />;
    }
    if (!override.enabled) {
      return <StatusBadge status="pending" label="Disabled" size="sm" />;
    }
    return <StatusBadge status="online" label="Active" size="sm" />;
  };

  // Loading state
  if (loading && !overrides.length && !stats) {
    return <LoadingGrid count={3} cols={1} />;
  }

  return (
    <>
      {/* Statistics Cards */}
      {stats && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
          role="region"
          aria-label="Override statistics"
        >
          <StatCard
            label="Total Overrides"
            value={stats.total_overrides}
            variant="default"
          />
          <StatCard
            label="Active"
            value={stats.active_overrides}
            variant="success"
          />
          <StatCard
            label="Expired"
            value={stats.expired_overrides}
            variant="warning"
          />
          <StatCard
            label="Users"
            value={stats.users_with_overrides}
            variant="info"
          />
        </div>
      )}

      <DataPanel
        title={
          userId
            ? `Overrides for User ${userId.slice(0, 8)}...`
            : flagName
              ? `Overrides for ${flagName}`
              : `User Flag Overrides (${filteredOverrides.length})`
        }
        noPadding
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && selectedOverrides.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={updating}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={`Delete ${selectedOverrides.size} selected overrides`}
              >
                Delete Selected ({selectedOverrides.size})
              </button>
            )}
            {isAdmin && (
              <button
                ref={createButtonRef}
                type="button"
                onClick={openCreateModal}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                aria-label="Create new user override"
              >
                Create Override
              </button>
            )}
            <RefreshButton
              onClick={() => {
                refreshOverrides();
                refreshStats();
              }}
              isLoading={loading}
              aria-label="Refresh overrides"
            />
          </div>
        }
      >
        {error && (
          <ErrorState
            message={error}
            onRetry={() => {
              refreshOverrides();
              refreshStats();
            }}
          />
        )}

        {/* Search/Filter Bar */}
        <div className="p-4 border-b border-slate-800 flex gap-4">
          <div className="flex-1">
            <label htmlFor="search-user" className="sr-only">
              Search by User ID
            </label>
            <input
              id="search-user"
              type="text"
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              placeholder="Filter by user ID..."
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="search-flag" className="sr-only">
              Search by Flag Name
            </label>
            <input
              id="search-flag"
              type="text"
              value={searchFlagName}
              onChange={(e) => setSearchFlagName(e.target.value)}
              placeholder="Filter by flag name..."
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {isAdmin && filteredOverrides.length > 0 && (
            <button
              type="button"
              onClick={
                selectedOverrides.size === filteredOverrides.length
                  ? clearSelection
                  : selectAll
              }
              className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedOverrides.size === filteredOverrides.length
                ? "Clear All"
                : "Select All"}
            </button>
          )}
        </div>

        {filteredOverrides.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message={
                searchUserId || searchFlagName
                  ? "No overrides match your search"
                  : "No user overrides configured"
              }
              icon="🎛️"
              action={
                isAdmin
                  ? {
                      label: "Create First Override",
                      onClick: openCreateModal,
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <div
            className="divide-y divide-slate-800"
            role="list"
            aria-label="User flag overrides"
          >
            {filteredOverrides.map((override) => {
              const key = `${override.user_id}:${override.flag_name}`;
              const isSelected = selectedOverrides.has(key);

              return (
                <div
                  key={override.id}
                  className={`p-4 hover:bg-slate-800/30 transition-colors ${
                    isSelected ? "bg-blue-900/20" : ""
                  }`}
                  role="listitem"
                  aria-label={`Override for ${override.flag_name} on user ${override.user_id}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    {isAdmin && (
                      <div className="flex items-center pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(override)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                          aria-label={`Select override for ${override.flag_name}`}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-slate-200 font-mono">
                          {override.flag_name}
                        </h4>
                        {getOverrideBadge(override)}
                      </div>

                      {/* User ID */}
                      <p className="text-sm text-slate-300 mb-1">
                        <span className="text-slate-500">User:</span>{" "}
                        <span className="font-mono">{override.user_id}</span>
                      </p>

                      {/* Value */}
                      {override.value !== undefined && (
                        <p className="text-sm text-slate-400 mb-1">
                          <span className="text-slate-500">Value:</span>{" "}
                          <code className="px-1 bg-slate-800 rounded text-xs">
                            {JSON.stringify(override.value)}
                          </code>
                        </p>
                      )}

                      {/* Reason */}
                      {override.reason && (
                        <p className="text-sm text-slate-400 mb-1">
                          <span className="text-slate-500">Reason:</span>{" "}
                          {override.reason}
                        </p>
                      )}

                      {/* Expiration */}
                      {override.expires_at && (
                        <p
                          className={`text-sm mb-1 ${isExpired(override) ? "text-red-400" : "text-slate-400"}`}
                        >
                          <span className="text-slate-500">Expires:</span>{" "}
                          {new Date(override.expires_at).toLocaleString()}
                        </p>
                      )}

                      {/* Metadata */}
                      <p className="text-xs text-slate-500 mt-2">
                        Created:{" "}
                        {new Date(override.created_at).toLocaleString()}
                        {override.created_by && ` by ${override.created_by}`}
                        {override.updated_by &&
                          override.updated_by !== override.created_by && (
                            <span> | Modified by {override.updated_by}</span>
                          )}
                      </p>
                    </div>

                    {/* Actions */}
                    {isAdmin && (
                      <div
                        className="flex items-center gap-2"
                        role="group"
                        aria-label={`Actions for ${override.flag_name} override`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            toggleOverride(override.user_id, override.flag_name)
                          }
                          className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label={`${override.enabled ? "Disable" : "Enable"} override`}
                        >
                          {override.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(override)}
                          className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label="Edit override"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingOverride(override)}
                          className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                          aria-label="Delete override"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DataPanel>

      {/* Create Modal */}
      {showCreateModal && (
        <OverrideFormModal
          title="Create User Override"
          formUserId={formUserId}
          formFlagName={formFlagName}
          formValue={formValue}
          formEnabled={formEnabled}
          formReason={formReason}
          formExpiresAt={formExpiresAt}
          onUserIdChange={setFormUserId}
          onFlagNameChange={setFormFlagName}
          onValueChange={setFormValue}
          onEnabledChange={setFormEnabled}
          onReasonChange={setFormReason}
          onExpiresAtChange={setFormExpiresAt}
          onSubmit={handleCreate}
          onCancel={closeCreateModal}
          isLoading={updating}
          isEdit={false}
          showUserIdField={!userId}
          showFlagNameField={!flagName}
          firstFocusRef={modalFirstFocusRef}
        />
      )}

      {/* Edit Modal */}
      {editingOverride && (
        <OverrideFormModal
          title={`Edit Override: ${editingOverride.flag_name}`}
          formUserId={formUserId}
          formFlagName={formFlagName}
          formValue={formValue}
          formEnabled={formEnabled}
          formReason={formReason}
          formExpiresAt={formExpiresAt}
          onUserIdChange={setFormUserId}
          onFlagNameChange={setFormFlagName}
          onValueChange={setFormValue}
          onEnabledChange={setFormEnabled}
          onReasonChange={setFormReason}
          onExpiresAtChange={setFormExpiresAt}
          onSubmit={handleUpdate}
          onCancel={closeEditModal}
          isLoading={updating}
          isEdit={true}
          showUserIdField={false}
          showFlagNameField={false}
          firstFocusRef={modalFirstFocusRef}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingOverride}
        onClose={() => setDeletingOverride(null)}
        onConfirm={handleDelete}
        title="Delete Override"
        message={
          <>
            Are you sure you want to delete the override for{" "}
            <strong className="text-slate-200">
              {deletingOverride?.flag_name}
            </strong>{" "}
            on user{" "}
            <code className="px-1 bg-slate-800 rounded text-xs">
              {deletingOverride?.user_id}
            </code>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Override"
        variant="danger"
        isLoading={updating}
      />
    </>
  );
}

// Form Modal Component
interface OverrideFormModalProps {
  title: string;
  formUserId: string;
  formFlagName: string;
  formValue: string;
  formEnabled: boolean;
  formReason: string;
  formExpiresAt: string;
  onUserIdChange: (value: string) => void;
  onFlagNameChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onReasonChange: (value: string) => void;
  onExpiresAtChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
  showUserIdField: boolean;
  showFlagNameField: boolean;
  firstFocusRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
}

function OverrideFormModal({
  title,
  formUserId,
  formFlagName,
  formValue,
  formEnabled,
  formReason,
  formExpiresAt,
  onUserIdChange,
  onFlagNameChange,
  onValueChange,
  onEnabledChange,
  onReasonChange,
  onExpiresAtChange,
  onSubmit,
  onCancel,
  isLoading,
  isEdit,
  showUserIdField,
  showFlagNameField,
  firstFocusRef,
}: OverrideFormModalProps) {
  // Trap focus in modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  // Validate JSON value
  const isValidJson = (value: string) => {
    if (!value) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const jsonValid = isValidJson(formValue);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-slate-900 rounded-lg p-6 max-w-lg w-full mx-4 border border-slate-700 max-h-[90vh] overflow-y-auto"
        role="document"
      >
        <h3
          id="modal-title"
          className="text-lg font-semibold text-slate-100 mb-4"
        >
          {title}
        </h3>

        <div className="space-y-4">
          {/* User ID */}
          {showUserIdField && (
            <div>
              <label
                htmlFor="user-id"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                User ID
              </label>
              <input
                ref={firstFocusRef as React.RefObject<HTMLInputElement>}
                id="user-id"
                type="text"
                value={formUserId}
                onChange={(e) => onUserIdChange(e.target.value)}
                disabled={isEdit}
                placeholder="550e8400-e29b-41d4-a716-446655440000"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 disabled:opacity-50 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-required="true"
              />
            </div>
          )}

          {/* Flag Name */}
          {showFlagNameField && (
            <div>
              <label
                htmlFor="flag-name"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Flag Name
              </label>
              <input
                ref={showUserIdField ? undefined : (firstFocusRef as React.RefObject<HTMLInputElement>)}
                id="flag-name"
                type="text"
                value={formFlagName}
                onChange={(e) => onFlagNameChange(e.target.value)}
                disabled={isEdit}
                placeholder="feature.flag_name"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 disabled:opacity-50 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-required="true"
              />
            </div>
          )}

          {/* Value (JSON) */}
          <div>
            <label
              htmlFor="value"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Value (JSON)
              {!jsonValid && (
                <span className="ml-2 text-xs text-red-400">Invalid JSON</span>
              )}
            </label>
            <textarea
              ref={
                !showUserIdField && !showFlagNameField
                  ? (firstFocusRef as React.RefObject<HTMLTextAreaElement>)
                  : undefined
              }
              id="value"
              value={formValue}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder='true, 123, "string", or {"complex": "value"}'
              rows={3}
              className={`w-full px-3 py-2 text-sm bg-slate-800 border rounded text-slate-200 placeholder-slate-500 font-mono resize-none focus:outline-none focus:ring-2 ${
                jsonValid
                  ? "border-slate-600 focus:ring-blue-500"
                  : "border-red-500 focus:ring-red-500"
              }`}
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={formEnabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
            />
            <label htmlFor="enabled" className="text-sm text-slate-300">
              Override Enabled
            </label>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Reason (optional)
            </label>
            <input
              id="reason"
              type="text"
              value={formReason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Beta testing, debugging, support ticket #123"
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Expiration */}
          <div>
            <label
              htmlFor="expires-at"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Expires At (optional)
            </label>
            <input
              id="expires-at"
              type="datetime-local"
              value={formExpiresAt}
              onChange={(e) => onExpiresAtChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              isLoading ||
              !jsonValid ||
              (!isEdit && (!formUserId || !formFlagName))
            }
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isLoading ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserOverridesPanel;
