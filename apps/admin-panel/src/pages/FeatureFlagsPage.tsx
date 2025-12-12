import { useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  useFeatureFlagsRealtime,
  FeatureFlag,
  FeatureFlagCreate,
} from "../hooks/useFeatureFlagsRealtime";
import { useScheduledChanges } from "../hooks/useScheduledChanges";
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
  TabGroup,
} from "../components/shared";
import { ScheduledChangesPanel } from "../components/feature-flags";

export function FeatureFlagsPage() {
  const { isAdmin } = useAuth();
  const [useSSE, setUseSSE] = useState(true);
  const [activeTab, setActiveTab] = useState<"flags" | "scheduled">("flags");
  const [showVoiceOnly, setShowVoiceOnly] = useState(false);
   const [showVoiceFilterSettings, setShowVoiceFilterSettings] =
    useState(false);
  const [includeBackendVoice, setIncludeBackendVoice] = useState(true);
  const [includeUiVoice, setIncludeUiVoice] = useState(true);
  const [includeWsVoice, setIncludeWsVoice] = useState(true);

  const {
    flags,
    loading,
    error,
    lastUpdated,
    version,
    connected,
    connectionMode,
    reconnectCount,
    eventsReplayed,
    refreshFlags,
    createFlag,
    updateFlag,
    deleteFlag,
    toggleFlag,
    reconnect,
  } = useFeatureFlagsRealtime({
    useSSE,
    autoRefresh: !useSSE, // Fallback to polling if SSE disabled
    onFlagUpdate: (flag, value) => {
      console.log(`Flag ${flag} updated in real-time:`, value.enabled);
    },
  });

  // Scheduled changes for displaying badges
  const { scheduledChanges, refreshChanges: refreshScheduledChanges } =
    useScheduledChanges();

  // Create a map of flag names to pending scheduled changes count
  const flagsWithPendingChanges = useMemo(() => {
    const map = new Map<string, number>();
    scheduledChanges
      .filter((c) => !c.cancelled && !c.applied)
      .forEach((c) => {
        map.set(c.flag_name, (map.get(c.flag_name) || 0) + 1);
      });
    return map;
  }, [scheduledChanges]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [deletingFlag, setDeletingFlag] = useState<FeatureFlag | null>(null);
  const [updating, setUpdating] = useState(false);

  // Form state for create/edit
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<
    "boolean" | "string" | "number" | "json" | "multivariate"
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
    type: "boolean" | "string" | "number" | "json" | "multivariate",
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
  const pendingScheduledCount = scheduledChanges.filter(
    (c) => !c.cancelled && !c.applied,
  ).length;

  const isVoiceFlag = (flag: FeatureFlag) => {
    const name = flag.name || "";
    if (includeBackendVoice && name.startsWith("backend.voice_")) {
      return true;
    }
    if (includeUiVoice && name.startsWith("ui.voice_")) {
      return true;
    }
    if (includeWsVoice && name.startsWith("backend.ws_")) {
      return true;
    }
    return false;
  };

  const voiceFlags = useMemo(
    () => flags.filter((f) => isVoiceFlag(f)),
    [flags, includeBackendVoice, includeUiVoice, includeWsVoice],
  );

  const visibleFlags = showVoiceOnly ? voiceFlags : flags;

  // Tab configuration
  const tabs = [
    {
      id: "flags" as const,
      label: "Feature Flags",
      count: flags.length,
    },
    {
      id: "scheduled" as const,
      label: "Scheduled Changes",
      count: pendingScheduledCount,
      badge: pendingScheduledCount > 0 ? "warning" : undefined,
    },
  ];

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
            {/* Connection Status Indicator */}
            <ConnectionStatus
              connected={connected}
              connectionMode={connectionMode}
              version={version}
              reconnectCount={reconnectCount}
              eventsReplayed={eventsReplayed}
              useSSE={useSSE}
              onToggleSSE={() => setUseSSE(!useSSE)}
              onReconnect={reconnect}
            />
            <button
              type="button"
              onClick={() => setShowVoiceOnly((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                showVoiceOnly
                  ? "bg-purple-900/60 border-purple-500 text-purple-100"
                  : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {showVoiceOnly ? "Showing Voice Flags" : "Voice Flags"}
            </button>
            <button
              type="button"
              onClick={() =>
                setShowVoiceFilterSettings((prevVisible) => !prevVisible)
              }
              className="px-2 py-1.5 text-xs font-medium rounded border border-slate-600 text-slate-300 bg-slate-800 hover:bg-slate-700"
              aria-label="Configure voice flag filter criteria"
            >
              ⚙
            </button>
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

      {/* Voice filter criteria configuration */}
      {showVoiceFilterSettings && (
        <div className="mt-3 mb-3 rounded border border-slate-700 bg-slate-900/70 px-4 py-3">
          <p className="text-xs font-medium text-slate-300 mb-2">
            Voice flag filter criteria
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border-slate-600 bg-slate-800"
                checked={includeBackendVoice}
                onChange={(e) => setIncludeBackendVoice(e.target.checked)}
              />
              <span>
                Backend voice flags (<code>backend.voice_*</code>)
              </span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border-slate-600 bg-slate-800"
                checked={includeUiVoice}
                onChange={(e) => setIncludeUiVoice(e.target.checked)}
              />
              <span>
                Voice UI flags (<code>ui.voice_*</code>)
              </span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border-slate-600 bg-slate-800"
                checked={includeWsVoice}
                onChange={(e) => setIncludeWsVoice(e.target.checked)}
              />
              <span>
                WebSocket voice flags (<code>backend.ws_*</code>)
              </span>
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            These settings control what counts as a “Voice” flag for the quick
            filter, badge, and stats.
          </p>
        </div>
      )}

      {showVoiceOnly && (
        <div className="mt-2 mb-3 rounded border border-purple-700 bg-purple-950/40 px-4 py-3 text-xs text-purple-100">
          <p className="font-semibold text-purple-100">
            Dictation vs Conversation presets
          </p>
          <p className="mt-1 text-purple-100/90">
            Use <code>responsive</code> on{" "}
            <code>backend.voice_barge_in_quality_preset</code> for
            dictation-focused behavior, and <code>balanced</code> or{" "}
            <code>smooth</code> for more conversational flows.
          </p>
          <p className="mt-1 text-purple-200/80">
            See internal guide{" "}
            <code>
              docs/admin-guide/feature-flags/admin-panel-guide.md#voice-aec--dictation-presets
            </code>{" "}
            for full recommendations.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
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
        <StatCard
          title="Voice Flags"
          value={voiceFlags.length}
          icon="🎙️"
          color="purple"
        />
        <StatCard
          title="Scheduled"
          value={pendingScheduledCount}
          icon="📅"
          color={pendingScheduledCount > 0 ? "yellow" : "blue"}
          onClick={() => setActiveTab("scheduled")}
        />
      </div>

      {/* Tab Navigation */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as "flags" | "scheduled")}
      />

      {/* Flags List - shown when flags tab is active */}
      {activeTab === "flags" && (
        <DataPanel
          title={`Feature Flags (${visibleFlags.length}${
            showVoiceOnly ? " • Voice" : ""
          })`}
          noPadding
        >
          {visibleFlags.length === 0 ? (
            <div className="p-4">
              <EmptyState
                message={
                  showVoiceOnly
                    ? "No voice-related feature flags found"
                    : "No feature flags configured"
                }
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
              {visibleFlags.map((flag) => (
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
                          status={
                            getFlagTypeColor(flag.flag_type) as StatusType
                          }
                          label={flag.flag_type}
                          size="sm"
                          showDot={false}
                        />
                        {isVoiceFlag(flag) && (
                          <span className="inline-flex items-center rounded-full bg-purple-900/40 border border-purple-700/70 px-2 py-0.5 text-[11px] font-medium text-purple-200">
                            Voice
                          </span>
                        )}
                        {/* Badge for pending scheduled changes */}
                        {flagsWithPendingChanges.has(flag.name) && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("scheduled")}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-700/50 rounded hover:bg-yellow-900/70 transition-colors"
                            title={`${flagsWithPendingChanges.get(flag.name)} scheduled change(s)`}
                            aria-label={`View ${flagsWithPendingChanges.get(flag.name)} scheduled changes for ${flag.name}`}
                          >
                            <span className="text-yellow-500">📅</span>
                            {flagsWithPendingChanges.get(flag.name)}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mb-2">
                        {flag.description}
                      </p>
                      {flag.name === "backend.voice_barge_in_quality_preset" && (
                        <p className="text-xs text-slate-500 mb-2">
                          <span className="font-semibold text-slate-300">
                            Clinician tip:
                          </span>{" "}
                          <span className="text-slate-400">
                            Use <code>responsive</code> for dictation-focused
                            behavior (very fast interruptions),{" "}
                            <code>balanced</code> for normal conversations, and{" "}
                            <code>smooth</code> when you want the assistant to
                            finish thoughts before you interrupt.
                          </span>
                        </p>
                      )}
                      {flag.name === "backend.voice_v4_audio_processing" && (
                        <p className="text-xs text-slate-500 mb-2">
                          <span className="font-semibold text-slate-300">
                            Clinician tip:
                          </span>{" "}
                          <span className="text-slate-400">
                            Turn this on to let VoiceAssist apply echo
                            cancellation, automatic gain control, and noise
                            suppression on the server. Recommended for laptops
                            and exam-room speakers to make barge-in more
                            reliable in noisy rooms.
                          </span>
                        </p>
                      )}
                      {flag.name ===
                        "backend.voice_hybrid_vad_signal_freshness_ms" && (
                        <p className="text-xs text-slate-500 mb-2">
                          <span className="font-semibold text-slate-300">
                            Ops hint:
                          </span>{" "}
                          <span className="text-slate-400">
                            This controls how long Silero/Deepgram VAD events
                            are considered “fresh” when deciding barge-in. Use{" "}
                            <code>200</code> ms for very low-latency networks,
                            <code>300</code> ms as the default, and{" "}
                            <code>500</code> ms in higher-latency or jittery
                            environments.
                          </span>
                        </p>
                      )}
                      {flag.name === "backend.voice_aec_capability_tuning" && (
                        <p className="text-xs text-slate-500 mb-2">
                          <span className="font-semibold text-slate-300">
                            Clinician tip:
                          </span>{" "}
                          <span className="text-slate-400">
                            When enabled, VoiceAssist adapts barge-in
                            thresholds to the device’s echo cancellation
                            quality—keeping headsets very responsive while
                            being more cautious on built-in speakers to avoid
                            the AI “hearing itself.”
                          </span>
                        </p>
                      )}
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
                          aria-label={`Toggle ${flag.name} ${flag.enabled ? "off" : "on"}`}
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
                            className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label={`Edit ${flag.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingFlag(flag)}
                            className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label={`Delete ${flag.name}`}
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
      )}

      {/* Scheduled Changes Panel - shown when scheduled tab is active */}
      {activeTab === "scheduled" && (
        <ScheduledChangesPanel
          isAdmin={isAdmin}
          onChangeCreated={refreshScheduledChanges}
          onChangeCancelled={refreshScheduledChanges}
        />
      )}

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
type FlagType = "boolean" | "string" | "number" | "json" | "multivariate";

interface FlagFormModalProps {
  title: string;
  formName: string;
  formDescription: string;
  formType: FlagType;
  formEnabled: boolean;
  formValue: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTypeChange: (value: FlagType) => void;
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

// Connection Status Component for SSE real-time updates
interface ConnectionStatusProps {
  connected: boolean;
  connectionMode: "sse" | "polling" | "disconnected";
  version: number;
  reconnectCount: number;
  eventsReplayed: number;
  useSSE: boolean;
  onToggleSSE: () => void;
  onReconnect: () => void;
}

function ConnectionStatus({
  connected,
  connectionMode,
  version,
  reconnectCount,
  eventsReplayed,
  useSSE,
  onToggleSSE,
  onReconnect,
}: ConnectionStatusProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusColor = () => {
    if (connectionMode === "sse" && connected) return "bg-green-500";
    if (connectionMode === "polling") return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusLabel = () => {
    if (connectionMode === "sse" && connected) return "Live";
    if (connectionMode === "polling") return "Polling";
    return "Disconnected";
  };

  return (
    <div className="relative">
      {/* Status indicator button */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded transition-colors"
      >
        <span
          className={`w-2 h-2 rounded-full ${getStatusColor()} ${connected && connectionMode === "sse" ? "animate-pulse" : ""}`}
        />
        <span className="text-slate-300">{getStatusLabel()}</span>
        <span className="text-slate-500">v{version}</span>
      </button>

      {/* Details dropdown */}
      {showDetails && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50">
          <div className="p-3 space-y-3">
            {/* Connection status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Status</span>
              <span
                className={`text-xs font-medium ${connected ? "text-green-400" : "text-red-400"}`}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>

            {/* Connection mode */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Mode</span>
              <span className="text-xs text-slate-300 capitalize">
                {connectionMode}
              </span>
            </div>

            {/* Version */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Version</span>
              <span className="text-xs font-mono text-slate-300">
                {version}
              </span>
            </div>

            {/* Reconnect count */}
            {reconnectCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Reconnects</span>
                <span className="text-xs text-slate-300">{reconnectCount}</span>
              </div>
            )}

            {/* Events replayed */}
            {eventsReplayed > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Events Replayed</span>
                <span className="text-xs text-slate-300">{eventsReplayed}</span>
              </div>
            )}

            <hr className="border-slate-700" />

            {/* Live updates toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Live Updates</span>
              <button
                type="button"
                onClick={onToggleSSE}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  useSSE ? "bg-blue-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    useSSE ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Reconnect button */}
            {!connected && useSSE && (
              <button
                type="button"
                onClick={() => {
                  onReconnect();
                  setShowDetails(false);
                }}
                className="w-full px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
