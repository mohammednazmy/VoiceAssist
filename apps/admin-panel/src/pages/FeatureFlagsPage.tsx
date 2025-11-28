import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  useFeatureFlags,
  FeatureFlag,
  FeatureFlagCreate,
} from "../hooks/useFeatureFlags";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatCard,
  DataPanel,
  LoadingGrid,
  ErrorState,
  EmptyState,
  RefreshButton,
  ConfirmDialog,
  StatusType,
} from "../components/shared";

export function FeatureFlagsPage() {
  const { isAdmin } = useAuth();
  const {
    flags,
    loading,
    error,
    lastUpdated,
    refreshFlags,
    createFlag,
    updateFlag,
    deleteFlag,
    toggleFlag,
  } = useFeatureFlags();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [deletingFlag, setDeletingFlag] = useState<FeatureFlag | null>(null);
  const [updating, setUpdating] = useState(false);

  // Form state for create/edit
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<
    "boolean" | "string" | "number" | "json"
  >("boolean");
  const [formEnabled, setFormEnabled] = useState(false);
  const [formValue, setFormValue] = useState("");

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormType("boolean");
    setFormEnabled(false);
    setFormValue("");
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (flag: FeatureFlag) => {
    setFormName(flag.name);
    setFormDescription(flag.description);
    setFormType(flag.flag_type);
    setFormEnabled(flag.enabled);
    setFormValue(flag.value ? JSON.stringify(flag.value) : "");
    setEditingFlag(flag);
  };

  const handleCreate = async () => {
    setUpdating(true);
    const newFlag: FeatureFlagCreate = {
      name: formName,
      description: formDescription,
      flag_type: formType,
      enabled: formEnabled,
      value:
        formType !== "boolean" ? parseValue(formValue, formType) : undefined,
    };
    const success = await createFlag(newFlag);
    if (success) {
      setShowCreateModal(false);
      resetForm();
    }
    setUpdating(false);
  };

  const handleUpdate = async () => {
    if (!editingFlag) return;
    setUpdating(true);
    const success = await updateFlag(editingFlag.name, {
      description: formDescription,
      enabled: formEnabled,
      value:
        editingFlag.flag_type !== "boolean"
          ? parseValue(formValue, editingFlag.flag_type)
          : undefined,
    });
    if (success) {
      setEditingFlag(null);
      resetForm();
    }
    setUpdating(false);
  };

  const handleDelete = async () => {
    if (!deletingFlag) return;
    setUpdating(true);
    await deleteFlag(deletingFlag.name);
    setDeletingFlag(null);
    setUpdating(false);
  };

  const handleToggle = async (flag: FeatureFlag) => {
    await toggleFlag(flag.name);
  };

  const parseValue = (
    value: string,
    type: "boolean" | "string" | "number" | "json",
  ): unknown => {
    try {
      switch (type) {
        case "number":
          return parseFloat(value) || 0;
        case "json":
          return JSON.parse(value);
        case "string":
        default:
          return value;
      }
    } catch {
      return value;
    }
  };

  const getFlagTypeColor = (
    type: string,
  ): "blue" | "green" | "purple" | "yellow" => {
    const colors: Record<string, "blue" | "green" | "purple" | "yellow"> = {
      boolean: "blue",
      string: "green",
      number: "purple",
      json: "yellow",
    };
    return colors[type] || "blue";
  };

  // Stats
  const enabledCount = flags.filter((f) => f.enabled).length;
  const disabledCount = flags.filter((f) => !f.enabled).length;
  const booleanCount = flags.filter((f) => f.flag_type === "boolean").length;

  // Loading state
  if (loading && !flags.length) {
    return (
      <PageContainer>
        <PageHeader
          title="Feature Flags"
          description="Manage feature flags and rollout configuration"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={6} cols={1} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Feature Flags"
        description="Manage feature flags and rollout configuration"
        lastUpdated={lastUpdated}
        actions={
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Create Flag
              </button>
            )}
            <RefreshButton onClick={refreshFlags} isLoading={loading} />
          </div>
        }
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshFlags} />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Flags"
          value={flags.length}
          icon="🚩"
          color="blue"
        />
        <StatCard
          title="Enabled"
          value={enabledCount}
          icon="✅"
          color="green"
        />
        <StatCard
          title="Disabled"
          value={disabledCount}
          icon="⏸️"
          color="yellow"
        />
        <StatCard
          title="Boolean"
          value={booleanCount}
          icon="🔘"
          color="purple"
        />
      </div>

      {/* Flags List */}
      <DataPanel title={`Feature Flags (${flags.length})`} noPadding>
        {flags.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message="No feature flags configured"
              icon="🚩"
              action={
                isAdmin
                  ? {
                      label: "Create First Flag",
                      onClick: openCreateModal,
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {flags.map((flag) => (
              <div
                key={flag.name}
                className="p-4 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-medium text-slate-200 truncate">
                        {flag.name}
                      </h4>
                      <StatusBadge
                        status={getFlagTypeColor(flag.flag_type) as StatusType}
                        label={flag.flag_type}
                        size="sm"
                        showDot={false}
                      />
                    </div>
                    <p className="text-sm text-slate-400 mb-2">
                      {flag.description}
                    </p>
                    {flag.flag_type !== "boolean" &&
                      flag.value !== undefined && (
                        <div className="text-xs font-mono bg-slate-800/50 px-2 py-1 rounded inline-block">
                          Value: {JSON.stringify(flag.value)}
                        </div>
                      )}
                    <p className="text-xs text-slate-500 mt-2">
                      Updated: {new Date(flag.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Toggle switch for boolean flags */}
                    {flag.flag_type === "boolean" && (
                      <button
                        type="button"
                        onClick={() => handleToggle(flag)}
                        disabled={!isAdmin}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          flag.enabled ? "bg-blue-600" : "bg-slate-700"
                        } ${!isAdmin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            flag.enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}

                    {/* Status badge for non-boolean */}
                    {flag.flag_type !== "boolean" && (
                      <StatusBadge
                        status={flag.enabled ? "online" : "offline"}
                        label={flag.enabled ? "Enabled" : "Disabled"}
                        size="sm"
                      />
                    )}

                    {/* Action buttons */}
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(flag)}
                          className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingFlag(flag)}
                          className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DataPanel>

      {/* Create Modal */}
      {showCreateModal && (
        <FlagFormModal
          title="Create Feature Flag"
          formName={formName}
          formDescription={formDescription}
          formType={formType}
          formEnabled={formEnabled}
          formValue={formValue}
          onNameChange={setFormName}
          onDescriptionChange={setFormDescription}
          onTypeChange={setFormType}
          onEnabledChange={setFormEnabled}
          onValueChange={setFormValue}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateModal(false)}
          isLoading={updating}
          isEdit={false}
        />
      )}

      {/* Edit Modal */}
      {editingFlag && (
        <FlagFormModal
          title={`Edit: ${editingFlag.name}`}
          formName={formName}
          formDescription={formDescription}
          formType={editingFlag.flag_type}
          formEnabled={formEnabled}
          formValue={formValue}
          onNameChange={setFormName}
          onDescriptionChange={setFormDescription}
          onTypeChange={setFormType}
          onEnabledChange={setFormEnabled}
          onValueChange={setFormValue}
          onSubmit={handleUpdate}
          onCancel={() => setEditingFlag(null)}
          isLoading={updating}
          isEdit={true}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingFlag}
        onClose={() => setDeletingFlag(null)}
        onConfirm={handleDelete}
        title="Delete Feature Flag"
        message={
          <>
            Are you sure you want to delete the feature flag{" "}
            <strong className="text-slate-200">{deletingFlag?.name}</strong>?
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={updating}
      />
    </PageContainer>
  );
}

// Form Modal Component
interface FlagFormModalProps {
  title: string;
  formName: string;
  formDescription: string;
  formType: "boolean" | "string" | "number" | "json";
  formEnabled: boolean;
  formValue: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTypeChange: (value: "boolean" | "string" | "number" | "json") => void;
  onEnabledChange: (value: boolean) => void;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  isEdit: boolean;
}

function FlagFormModal({
  title,
  formName,
  formDescription,
  formType,
  formEnabled,
  formValue,
  onNameChange,
  onDescriptionChange,
  onTypeChange,
  onEnabledChange,
  onValueChange,
  onSubmit,
  onCancel,
  isLoading,
  isEdit,
}: FlagFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">{title}</h3>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={isEdit}
              placeholder="feature_name"
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe what this flag controls..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 resize-none"
            />
          </div>

          {/* Type */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Type
              </label>
              <select
                value={formType}
                onChange={(e) =>
                  onTypeChange(
                    e.target.value as "boolean" | "string" | "number" | "json",
                  )
                }
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
              >
                <option value="boolean">Boolean (on/off)</option>
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="json">JSON</option>
              </select>
            </div>
          )}

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">
              Enabled
            </label>
            <button
              type="button"
              onClick={() => onEnabledChange(!formEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formEnabled ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Value (for non-boolean types) */}
          {formType !== "boolean" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Value
              </label>
              <input
                type={formType === "number" ? "number" : "text"}
                value={formValue}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={
                  formType === "json" ? '{"key": "value"}' : "Enter value"
                }
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 font-mono"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading || !formName || !formDescription}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            {isLoading ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
