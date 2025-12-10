/**
 * Scheduled Variant Changes Panel
 *
 * Admin panel component for viewing, editing, and cancelling scheduled
 * variant weight changes for feature flags.
 *
 * Features:
 * - List all upcoming scheduled changes
 * - Display scheduled time in user's local timezone
 * - Edit scheduled changes (time, weights, description)
 * - Cancel scheduled changes
 * - Preview change impact
 * - Full accessibility support (keyboard nav, ARIA labels)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useScheduledChanges,
  ScheduledChange,
  ScheduledChangeCreate,
  ScheduledChangeUpdate,
  ScheduledChangePreview,
} from "../../hooks/useScheduledChanges";
import {
  DataPanel,
  StatusBadge,
  ConfirmDialog,
  EmptyState,
  LoadingGrid,
  ErrorState,
  RefreshButton,
} from "../shared";

interface ScheduledChangesPanelProps {
  /** Optional: filter to specific flag name */
  flagName?: string;
  /** Callback when a change is created */
  onChangeCreated?: () => void;
  /** Callback when a change is cancelled */
  onChangeCancelled?: () => void;
  /** Whether user has admin permissions */
  isAdmin?: boolean;
}

export function ScheduledChangesPanel({
  flagName,
  onChangeCreated,
  onChangeCancelled,
  isAdmin = false,
}: ScheduledChangesPanelProps) {
  const {
    scheduledChanges,
    loading,
    error,
    lastUpdated: _lastUpdated,
    refreshChanges,
    createChange,
    updateChange,
    cancelChange,
    deleteChange: _deleteChange,
    previewChange,
  } = useScheduledChanges();

  // Filter changes for specific flag if provided
  const filteredChanges = flagName
    ? scheduledChanges.filter((c) => c.flag_name === flagName)
    : scheduledChanges;

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChange, setEditingChange] = useState<ScheduledChange | null>(
    null,
  );
  const [cancellingChange, setCancellingChange] =
    useState<ScheduledChange | null>(null);
  const [previewData, setPreviewData] = useState<{
    change: ScheduledChange;
    preview: ScheduledChangePreview;
  } | null>(null);
  const [updating, setUpdating] = useState(false);

  // Form state
  const [formFlagName, setFormFlagName] = useState(flagName || "");
  const [formScheduledAt, setFormScheduledAt] = useState("");
  const [formTimezone, setFormTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [formDescription, setFormDescription] = useState("");
  const [formChanges, setFormChanges] = useState<Record<string, number>>({});

  // Focus management refs
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const modalFirstFocusRef = useRef<HTMLInputElement>(null);

  // Reset form
  const resetForm = useCallback(() => {
    setFormFlagName(flagName || "");
    setFormScheduledAt("");
    setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setFormDescription("");
    setFormChanges({});
  }, [flagName]);

  // Open create modal
  const openCreateModal = useCallback(() => {
    resetForm();
    setShowCreateModal(true);
  }, [resetForm]);

  // Close create modal and return focus
  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    createButtonRef.current?.focus();
  }, []);

  // Open edit modal
  const openEditModal = useCallback((change: ScheduledChange) => {
    setFormFlagName(change.flag_name);
    setFormScheduledAt(change.scheduled_at.slice(0, 16)); // Format for datetime-local
    setFormTimezone(change.timezone_id);
    setFormDescription(change.description || "");
    setFormChanges(change.changes);
    setEditingChange(change);
  }, []);

  // Close edit modal
  const closeEditModal = useCallback(() => {
    setEditingChange(null);
    resetForm();
  }, [resetForm]);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!formFlagName) return;

    setUpdating(true);
    const newChange: ScheduledChangeCreate = {
      scheduled_at: new Date(formScheduledAt).toISOString(),
      changes: formChanges,
      description: formDescription || undefined,
      timezone_id: formTimezone,
    };

    const success = await createChange(formFlagName, newChange);
    if (success) {
      closeCreateModal();
      onChangeCreated?.();
    }
    setUpdating(false);
  }, [
    formFlagName,
    formScheduledAt,
    formChanges,
    formDescription,
    formTimezone,
    createChange,
    closeCreateModal,
    onChangeCreated,
  ]);

  // Handle update
  const handleUpdate = useCallback(async () => {
    if (!editingChange) return;

    setUpdating(true);
    const updates: ScheduledChangeUpdate = {
      scheduled_at: new Date(formScheduledAt).toISOString(),
      changes: formChanges,
      description: formDescription || undefined,
      timezone_id: formTimezone,
    };

    const success = await updateChange(
      editingChange.flag_name,
      editingChange.id,
      updates,
    );
    if (success) {
      closeEditModal();
    }
    setUpdating(false);
  }, [
    editingChange,
    formScheduledAt,
    formChanges,
    formDescription,
    formTimezone,
    updateChange,
    closeEditModal,
  ]);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (!cancellingChange) return;

    setUpdating(true);
    const success = await cancelChange(
      cancellingChange.flag_name,
      cancellingChange.id,
    );
    if (success) {
      setCancellingChange(null);
      onChangeCancelled?.();
    }
    setUpdating(false);
  }, [cancellingChange, cancelChange, onChangeCancelled]);

  // Handle preview
  const handlePreview = useCallback(
    async (change: ScheduledChange) => {
      const preview = await previewChange(change.flag_name, change.id);
      if (preview) {
        setPreviewData({ change, preview });
      }
    },
    [previewChange],
  );

  // Focus first input when modal opens
  useEffect(() => {
    if (showCreateModal || editingChange) {
      setTimeout(() => modalFirstFocusRef.current?.focus(), 100);
    }
  }, [showCreateModal, editingChange]);

  // Format date for display in user's locale
  const formatScheduledTime = (isoDate: string, timezone: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(isoDate));
    } catch {
      return new Date(isoDate).toLocaleString();
    }
  };

  // Get status badge for change
  const getChangeBadge = (change: ScheduledChange) => {
    if (change.cancelled) {
      return <StatusBadge status="error" label="Cancelled" size="sm" />;
    }
    if (change.applied) {
      return <StatusBadge status="online" label="Applied" size="sm" />;
    }
    const scheduledDate = new Date(change.scheduled_at);
    const now = new Date();
    const hoursUntil =
      (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil < 1) {
      return <StatusBadge status="warning" label="Imminent" size="sm" />;
    }
    if (hoursUntil < 24) {
      return <StatusBadge status="info" label="Today" size="sm" />;
    }
    return <StatusBadge status="pending" label="Pending" size="sm" />;
  };

  // Loading state
  if (loading && !scheduledChanges.length) {
    return <LoadingGrid count={3} cols={1} />;
  }

  return (
    <>
      <DataPanel
        title={
          flagName
            ? `Scheduled Changes for ${flagName}`
            : `All Scheduled Changes (${filteredChanges.length})`
        }
        noPadding
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                ref={createButtonRef}
                type="button"
                onClick={openCreateModal}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                aria-label="Schedule new variant change"
              >
                Schedule Change
              </button>
            )}
            <RefreshButton
              onClick={refreshChanges}
              isLoading={loading}
              aria-label="Refresh scheduled changes"
            />
          </div>
        }
      >
        {error && <ErrorState message={error} onRetry={refreshChanges} />}

        {filteredChanges.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message="No scheduled changes"
              icon="📅"
              action={
                isAdmin
                  ? {
                      label: "Schedule First Change",
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
            aria-label="Scheduled variant changes"
          >
            {filteredChanges.map((change, _index) => (
              <div
                key={change.id}
                className="p-4 hover:bg-slate-800/30 transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-inset"
                role="listitem"
                tabIndex={0}
                aria-label={`Scheduled change for ${change.flag_name} at ${formatScheduledTime(change.scheduled_at, change.timezone_id)}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isAdmin && !change.cancelled) {
                    openEditModal(change);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-slate-200 truncate">
                        {change.flag_name}
                      </h4>
                      {getChangeBadge(change)}
                    </div>

                    {/* Scheduled time */}
                    <p className="text-sm text-slate-300 mb-1">
                      <span className="text-slate-500">Scheduled:</span>{" "}
                      {formatScheduledTime(
                        change.scheduled_at,
                        change.timezone_id,
                      )}
                      <span className="text-slate-500 text-xs ml-2">
                        ({change.timezone_id})
                      </span>
                    </p>

                    {/* Description */}
                    {change.description && (
                      <p className="text-sm text-slate-400 mb-2">
                        {change.description}
                      </p>
                    )}

                    {/* Weight changes */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(change.changes).map(
                        ([variant, weight]) => (
                          <span
                            key={variant}
                            className="text-xs font-mono bg-slate-800/50 px-2 py-1 rounded"
                          >
                            {variant}: {weight}%
                          </span>
                        ),
                      )}
                    </div>

                    {/* Metadata */}
                    <p className="text-xs text-slate-500 mt-2">
                      Created: {new Date(change.created_at).toLocaleString()}
                      {change.created_by && ` by ${change.created_by}`}
                    </p>
                  </div>

                  {/* Actions */}
                  {isAdmin && !change.cancelled && !change.applied && (
                    <div
                      className="flex items-center gap-2"
                      role="group"
                      aria-label={`Actions for ${change.flag_name} scheduled change`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePreview(change)}
                        className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`Preview change for ${change.flag_name}`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(change)}
                        className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`Edit change for ${change.flag_name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancellingChange(change)}
                        className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        aria-label={`Cancel change for ${change.flag_name}`}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DataPanel>

      {/* Create Modal */}
      {showCreateModal && (
        <ScheduledChangeFormModal
          title="Schedule Variant Change"
          formFlagName={formFlagName}
          formScheduledAt={formScheduledAt}
          formTimezone={formTimezone}
          formDescription={formDescription}
          formChanges={formChanges}
          onFlagNameChange={setFormFlagName}
          onScheduledAtChange={setFormScheduledAt}
          onTimezoneChange={setFormTimezone}
          onDescriptionChange={setFormDescription}
          onChangesChange={setFormChanges}
          onSubmit={handleCreate}
          onCancel={closeCreateModal}
          isLoading={updating}
          isEdit={false}
          showFlagName={!flagName}
          firstFocusRef={modalFirstFocusRef}
        />
      )}

      {/* Edit Modal */}
      {editingChange && (
        <ScheduledChangeFormModal
          title={`Edit: ${editingChange.flag_name}`}
          formFlagName={formFlagName}
          formScheduledAt={formScheduledAt}
          formTimezone={formTimezone}
          formDescription={formDescription}
          formChanges={formChanges}
          onFlagNameChange={setFormFlagName}
          onScheduledAtChange={setFormScheduledAt}
          onTimezoneChange={setFormTimezone}
          onDescriptionChange={setFormDescription}
          onChangesChange={setFormChanges}
          onSubmit={handleUpdate}
          onCancel={closeEditModal}
          isLoading={updating}
          isEdit={true}
          showFlagName={false}
          firstFocusRef={modalFirstFocusRef}
        />
      )}

      {/* Cancel Confirmation */}
      <ConfirmDialog
        isOpen={!!cancellingChange}
        onClose={() => setCancellingChange(null)}
        onConfirm={handleCancel}
        title="Cancel Scheduled Change"
        message={
          <>
            Are you sure you want to cancel the scheduled change for{" "}
            <strong className="text-slate-200">
              {cancellingChange?.flag_name}
            </strong>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Cancel Change"
        variant="danger"
        isLoading={updating}
      />

      {/* Preview Modal */}
      {previewData && (
        <PreviewModal
          change={previewData.change}
          preview={previewData.preview}
          onClose={() => setPreviewData(null)}
        />
      )}
    </>
  );
}

// Form Modal Component
interface ScheduledChangeFormModalProps {
  title: string;
  formFlagName: string;
  formScheduledAt: string;
  formTimezone: string;
  formDescription: string;
  formChanges: Record<string, number>;
  onFlagNameChange: (value: string) => void;
  onScheduledAtChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onChangesChange: (value: Record<string, number>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
  showFlagName: boolean;
  firstFocusRef: React.RefObject<HTMLInputElement>;
}

function ScheduledChangeFormModal({
  title,
  formFlagName,
  formScheduledAt,
  formTimezone,
  formDescription,
  formChanges,
  onFlagNameChange,
  onScheduledAtChange,
  onTimezoneChange,
  onDescriptionChange,
  onChangesChange,
  onSubmit,
  onCancel,
  isLoading,
  isEdit,
  showFlagName,
  firstFocusRef,
}: ScheduledChangeFormModalProps) {
  // Common timezones
  const timezones = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];

  // Variant input management
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantWeight, setNewVariantWeight] = useState(0);

  const addVariant = () => {
    if (newVariantName && !formChanges[newVariantName]) {
      onChangesChange({ ...formChanges, [newVariantName]: newVariantWeight });
      setNewVariantName("");
      setNewVariantWeight(0);
    }
  };

  const updateVariantWeight = (name: string, weight: number) => {
    onChangesChange({ ...formChanges, [name]: weight });
  };

  const removeVariant = (name: string) => {
    const updated = { ...formChanges };
    delete updated[name];
    onChangesChange(updated);
  };

  // Trap focus in modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  // Calculate total weight
  const totalWeight = Object.values(formChanges).reduce((a, b) => a + b, 0);
  const isValidWeight = totalWeight === 100;

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
          {/* Flag Name */}
          {showFlagName && (
            <div>
              <label
                htmlFor="flag-name"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Flag Name
              </label>
              <input
                ref={firstFocusRef}
                id="flag-name"
                type="text"
                value={formFlagName}
                onChange={(e) => onFlagNameChange(e.target.value)}
                disabled={isEdit}
                placeholder="feature.flag_name"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-required="true"
              />
            </div>
          )}

          {/* Scheduled Time */}
          <div>
            <label
              htmlFor="scheduled-at"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Scheduled Time
            </label>
            <input
              ref={showFlagName ? undefined : firstFocusRef}
              id="scheduled-at"
              type="datetime-local"
              value={formScheduledAt}
              onChange={(e) => onScheduledAtChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-required="true"
            />
          </div>

          {/* Timezone */}
          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Timezone
            </label>
            <select
              id="timezone"
              value={formTimezone}
              onChange={(e) => onTimezoneChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Description (optional)
            </label>
            <textarea
              id="description"
              value={formDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the purpose of this change..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Variant Weights */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Variant Weights
              <span
                className={`ml-2 text-xs ${isValidWeight ? "text-green-400" : "text-red-400"}`}
              >
                (Total: {totalWeight}%{!isValidWeight && " - must equal 100%"})
              </span>
            </label>

            {/* Existing variants */}
            <div className="space-y-2 mb-3">
              {Object.entries(formChanges).map(([name, weight]) => (
                <div
                  key={name}
                  className="flex items-center gap-2"
                  role="group"
                  aria-label={`Variant ${name}`}
                >
                  <span className="flex-1 text-sm text-slate-300 font-mono">
                    {name}
                  </span>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) =>
                      updateVariantWeight(name, parseInt(e.target.value) || 0)
                    }
                    min={0}
                    max={100}
                    className="w-20 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Weight for ${name}`}
                  />
                  <span className="text-slate-500 text-sm">%</span>
                  <button
                    type="button"
                    onClick={() => removeVariant(name)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label={`Remove ${name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {/* Add new variant */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
              <input
                type="text"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                placeholder="variant_name"
                className="flex-1 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="New variant name"
              />
              <input
                type="number"
                value={newVariantWeight}
                onChange={(e) =>
                  setNewVariantWeight(parseInt(e.target.value) || 0)
                }
                min={0}
                max={100}
                className="w-20 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="New variant weight"
              />
              <span className="text-slate-500 text-sm">%</span>
              <button
                type="button"
                onClick={addVariant}
                disabled={!newVariantName}
                className="px-2 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Add
              </button>
            </div>
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
              !formScheduledAt ||
              Object.keys(formChanges).length === 0 ||
              !isValidWeight ||
              (!isEdit && !formFlagName)
            }
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isLoading ? "Saving..." : isEdit ? "Update" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Preview Modal Component
interface PreviewModalProps {
  change: ScheduledChange;
  preview: ScheduledChangePreview;
  onClose: () => void;
}

function PreviewModal({ change, preview, onClose }: PreviewModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <h3
          id="preview-title"
          className="text-lg font-semibold text-slate-100 mb-4"
        >
          Change Preview: {change.flag_name}
        </h3>

        <div className="space-y-4">
          {/* Before */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-2">
              Current Weights
            </h4>
            <div className="space-y-1">
              {preview.before.variants.map((v) => (
                <div key={v.name} className="flex justify-between text-sm">
                  <span className="text-slate-300 font-mono">{v.name}</span>
                  <span className="text-slate-400">{v.weight}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center text-slate-500">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>

          {/* After */}
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-2">
              New Weights
            </h4>
            <div className="space-y-1">
              {preview.after.variants.map((v) => (
                <div key={v.name} className="flex justify-between text-sm">
                  <span className="text-slate-300 font-mono">{v.name}</span>
                  <span className="text-green-400">{v.weight}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-slate-400 pt-2 border-t border-slate-700">
            {preview.change_summary}
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScheduledChangesPanel;
