import { useState } from "react";
import {
  useVoiceMonitor,
  VoiceSession,
  TTSession,
  TTContext,
  QualityPreset,
} from "../hooks/useVoiceMonitor";
import { useAuth } from "../contexts/AuthContext";
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

type TabId = "overview" | "tt-pipeline" | "analytics";

export function VoiceMonitorPage() {
  const { isAdmin } = useAuth();

  const {
    sessions,
    metrics,
    health,
    config,
    ttSessions,
    ttContexts,
    qualityPresets,
    ttAnalytics,
    loading,
    error,
    lastUpdated,
    refreshAll,
    refreshTTPipeline,
    disconnectSession,
    cleanupContexts,
  } = useVoiceMonitor({ autoRefresh: true, refreshIntervalMs: 10000 });

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] =
    useState<VoiceSession | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<number | null>(null);

  const handleCleanupContexts = async () => {
    if (!isAdmin) return;
    setCleaningUp(true);
    setCleanupResult(null);
    const cleaned = await cleanupContexts();
    setCleanupResult(cleaned);
    setCleaningUp(false);
  };

  const handleDisconnect = async () => {
    if (!confirmDisconnect || !isAdmin) return;
    setDisconnecting(confirmDisconnect.session_id);
    await disconnectSession(confirmDisconnect.session_id);
    setDisconnecting(null);
    setConfirmDisconnect(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getHealthStatus = (): { type: StatusType; label: string } => {
    if (!health) return { type: "unknown", label: "Unknown" };
    const status = health.status as StatusType;
    return {
      type: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
    };
  };

  const getErrorRateColor = (rate: number): "green" | "yellow" | "red" => {
    if (rate > 0.05) return "red";
    if (rate > 0.01) return "yellow";
    return "green";
  };

  // Loading state
  if (loading && !metrics) {
    return (
      <PageContainer>
        <PageHeader
          title="Voice Monitor"
          description="Monitor voice sessions and realtime connections"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={4} cols={4} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Voice Monitor"
        description="Monitor voice sessions and realtime connections"
        status={getHealthStatus()}
        lastUpdated={lastUpdated}
        actions={<RefreshButton onClick={refreshAll} isLoading={loading} />}
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 mb-4">
        <TabButton
          label="Overview"
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
        />
        <TabButton
          label="TT Pipeline"
          active={activeTab === "tt-pipeline"}
          onClick={() => setActiveTab("tt-pipeline")}
          badge={ttSessions.length > 0 ? ttSessions.length : undefined}
        />
        <TabButton
          label="Analytics"
          active={activeTab === "analytics"}
          onClick={() => setActiveTab("analytics")}
        />
      </div>

      {activeTab === "overview" && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Active Sessions"
              value={metrics?.active_sessions ?? 0}
              icon="🎙️"
              color="blue"
            />
            <StatCard
              title="Sessions (24h)"
              value={metrics?.total_sessions_24h ?? 0}
              icon="📊"
              color="purple"
            />
            <StatCard
              title="Avg Duration"
              value={
                metrics?.avg_session_duration_sec
                  ? formatDuration(metrics.avg_session_duration_sec)
                  : "0m 0s"
              }
              icon="⏱️"
              color="green"
            />
            <StatCard
              title="Error Rate"
              value={`${((metrics?.error_rate_24h ?? 0) * 100).toFixed(1)}%`}
              icon="⚠️"
              color={getErrorRateColor(metrics?.error_rate_24h ?? 0)}
            />
          </div>

          {/* Service Health */}
          <DataPanel title="Service Health">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <HealthCard
                name="Realtime API"
                enabled={health?.realtime_api_enabled ?? false}
              />
              <HealthCard
                name="OpenAI API"
                enabled={health?.openai_api_configured ?? false}
              />
              <HealthCard
                name="Redis"
                enabled={health?.redis_connected ?? false}
              />
              <HealthCard
                name="Voice Config"
                enabled={config?.realtime_enabled ?? false}
                label={config?.realtime_enabled ? "Enabled" : "Disabled"}
              />
            </div>
          </DataPanel>

          {/* Connections by Type */}
          {metrics?.connections_by_type && (
            <DataPanel title="Connections by Type">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(metrics.connections_by_type).map(
                  ([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
                    >
                      <span className="text-sm font-medium text-slate-300 capitalize">
                        {type}
                      </span>
                      <StatusBadge
                        status={type as StatusType}
                        label={String(count)}
                        showDot={false}
                      />
                    </div>
                  ),
                )}
              </div>
            </DataPanel>
          )}

          {/* Active Sessions Table */}
          <DataPanel title={`Active Sessions (${sessions.length})`} noPadding>
            {sessions.length === 0 ? (
              <div className="p-4">
                <EmptyState message="No active voice sessions" icon="🎙️" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                        Connected
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                        Messages
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                        Last Activity
                      </th>
                      {isAdmin && (
                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sessions.map((session) => (
                      <SessionRow
                        key={session.session_id}
                        session={session}
                        isAdmin={isAdmin}
                        isDisconnecting={disconnecting === session.session_id}
                        onDisconnect={() => setConfirmDisconnect(session)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataPanel>

          {/* Configuration Panel */}
          {config && (
            <DataPanel title="Voice Configuration">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <ConfigItem
                  label="Default Voice"
                  value={config.default_voice}
                />
                <ConfigItem
                  label="Default Language"
                  value={config.default_language}
                />
                <ConfigItem label="STT Provider" value={config.stt_provider} />
                <ConfigItem label="TTS Provider" value={config.tts_provider} />
                <ConfigItem
                  label="VAD Enabled"
                  value={config.vad_enabled ? "Yes" : "No"}
                />
                <ConfigItem
                  label="VAD Threshold"
                  value={config.vad_threshold.toString()}
                />
                <ConfigItem
                  label="Max Session"
                  value={`${Math.floor(config.max_session_duration_sec / 60)} min`}
                />
                <ConfigItem
                  label="Realtime"
                  value={config.realtime_enabled ? "Enabled" : "Disabled"}
                />
              </div>
            </DataPanel>
          )}
        </>
      )}

      {/* TT Pipeline Tab */}
      {activeTab === "tt-pipeline" && (
        <>
          {/* TT Sessions */}
          <DataPanel
            title={`Thinker-Talker Sessions (${ttSessions.length})`}
            headerAction={
              <RefreshButton
                onClick={refreshTTPipeline}
                isLoading={loading}
                size="sm"
              />
            }
            noPadding
          >
            {ttSessions.length === 0 ? (
              <div className="p-4">
                <EmptyState message="No active TT sessions" icon="🧠" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        State
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                        Model
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                        Voice
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                        Messages
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                        Avg Response
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ttSessions.map((session) => (
                      <TTSessionRow
                        key={session.session_id}
                        session={session}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataPanel>

          {/* TT Contexts */}
          <DataPanel
            title={`Conversation Contexts (${ttContexts.length})`}
            headerAction={
              isAdmin ? (
                <button
                  onClick={handleCleanupContexts}
                  disabled={cleaningUp}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 rounded transition-colors disabled:opacity-50"
                >
                  {cleaningUp ? "Cleaning..." : "Cleanup Expired"}
                </button>
              ) : undefined
            }
            noPadding
          >
            {cleanupResult !== null && (
              <div className="px-4 py-2 bg-green-900/20 border-b border-green-900/30 text-green-400 text-sm">
                Cleaned up {cleanupResult} expired contexts
              </div>
            )}
            {ttContexts.length === 0 ? (
              <div className="p-4">
                <EmptyState message="No conversation contexts" icon="💬" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Context ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                        Messages
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                        Expires
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ttContexts.map((ctx) => (
                      <TTContextRow key={ctx.context_id} context={ctx} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataPanel>

          {/* Quality Presets */}
          <DataPanel title="Quality Presets">
            {qualityPresets.length === 0 ? (
              <EmptyState message="No quality presets configured" icon="🎚️" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {qualityPresets.map((preset) => (
                  <QualityPresetCard key={preset.name} preset={preset} />
                ))}
              </div>
            )}
          </DataPanel>
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <>
          {/* Tool Analytics */}
          {ttAnalytics ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Tool Calls (24h)"
                  value={ttAnalytics.total_tool_calls_24h}
                  icon="🔧"
                  color="blue"
                />
                <StatCard
                  title="Avg Tool Latency"
                  value={`${ttAnalytics.avg_tool_latency_ms.toFixed(0)} ms`}
                  icon="⏱️"
                  color="purple"
                />
                <StatCard
                  title="Tool Success Rate"
                  value={`${(ttAnalytics.tool_success_rate * 100).toFixed(1)}%`}
                  icon="✅"
                  color={
                    ttAnalytics.tool_success_rate > 0.95 ? "green" : "yellow"
                  }
                />
                <StatCard
                  title="KB Calls (24h)"
                  value={ttAnalytics.kb_calls_24h}
                  icon="📚"
                  color="green"
                />
              </div>

              <DataPanel title="Tools by Frequency">
                {Object.keys(ttAnalytics.tools_by_frequency).length === 0 ? (
                  <EmptyState message="No tool usage data" icon="📊" />
                ) : (
                  <div className="space-y-2">
                    {Object.entries(ttAnalytics.tools_by_frequency)
                      .sort(([, a], [, b]) => b - a)
                      .map(([tool, count]) => (
                        <ToolFrequencyBar
                          key={tool}
                          tool={tool}
                          count={count}
                          maxCount={Math.max(
                            ...Object.values(ttAnalytics.tools_by_frequency),
                          )}
                        />
                      ))}
                  </div>
                )}
              </DataPanel>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataPanel title="KB Performance">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">
                        Calls (24h)
                      </span>
                      <span className="text-lg font-semibold text-slate-200">
                        {ttAnalytics.kb_calls_24h}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">
                        Avg Latency
                      </span>
                      <span className="text-lg font-semibold text-slate-200">
                        {ttAnalytics.kb_avg_latency_ms.toFixed(0)} ms
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          ttAnalytics.kb_avg_latency_ms < 100
                            ? "bg-green-500"
                            : ttAnalytics.kb_avg_latency_ms < 300
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (ttAnalytics.kb_avg_latency_ms / 500) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-slate-500">
                      Target: &lt;100ms | Warning: &gt;300ms
                    </div>
                  </div>
                </DataPanel>

                <DataPanel title="Latency Metrics">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">STT P95</span>
                      <span className="text-lg font-semibold text-slate-200">
                        {metrics?.stt_latency_p95_ms ?? 0} ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">TTS P95</span>
                      <span className="text-lg font-semibold text-slate-200">
                        {metrics?.tts_latency_p95_ms ?? 0} ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Tool Avg</span>
                      <span className="text-lg font-semibold text-slate-200">
                        {ttAnalytics.avg_tool_latency_ms.toFixed(0)} ms
                      </span>
                    </div>
                  </div>
                </DataPanel>
              </div>
            </>
          ) : (
            <EmptyState
              message="No analytics data available"
              icon="📊"
              action={{
                label: "Load Analytics",
                onClick: refreshTTPipeline,
              }}
            />
          )}
        </>
      )}

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={handleDisconnect}
        title="Disconnect Session"
        message={
          <>
            Are you sure you want to disconnect the session for{" "}
            <strong className="text-slate-200">
              {confirmDisconnect?.user_email || confirmDisconnect?.user_id}
            </strong>
            ? This will immediately end their voice session.
          </>
        }
        confirmLabel="Disconnect"
        variant="danger"
        isLoading={!!disconnecting}
      />
    </PageContainer>
  );
}

// Sub-components

interface HealthCardProps {
  name: string;
  enabled: boolean;
  label?: string;
}

function HealthCard({ name, enabled, label }: HealthCardProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
      <span className="text-sm font-medium text-slate-300">{name}</span>
      <StatusBadge
        status={enabled ? "online" : "offline"}
        label={label || (enabled ? "Online" : "Offline")}
        size="sm"
      />
    </div>
  );
}

interface SessionRowProps {
  session: VoiceSession;
  isAdmin: boolean;
  isDisconnecting: boolean;
  onDisconnect: () => void;
}

function SessionRow({
  session,
  isAdmin,
  isDisconnecting,
  onDisconnect,
}: SessionRowProps) {
  const connectedAt = new Date(session.connected_at);
  const lastActivity = session.last_activity
    ? new Date(session.last_activity)
    : null;

  const getSessionTypeStatus = (type: string): StatusType => {
    switch (type) {
      case "voice":
        return "active";
      case "realtime":
        return "connected";
      default:
        return "unknown";
    }
  };

  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="text-sm text-slate-200 truncate max-w-[150px] sm:max-w-none">
          {session.user_email || session.user_id}
        </div>
        <div className="text-xs text-slate-500 font-mono">
          {session.session_id.slice(0, 8)}...
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          status={getSessionTypeStatus(session.session_type)}
          label={session.session_type}
          size="sm"
        />
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
        {connectedAt.toLocaleTimeString()}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
        {session.messages_count}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
        {lastActivity ? lastActivity.toLocaleTimeString() : "-"}
      </td>
      {isAdmin && (
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onDisconnect}
            disabled={isDisconnecting}
            className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDisconnecting ? "..." : "Disconnect"}
          </button>
        </td>
      )}
    </tr>
  );
}

interface ConfigItemProps {
  label: string;
  value: string;
}

function ConfigItem({ label, value }: ConfigItemProps) {
  return (
    <div className="p-2 sm:p-0">
      <span className="text-slate-500 text-xs sm:text-sm">{label}:</span>{" "}
      <span className="text-slate-300 font-medium text-xs sm:text-sm">
        {value}
      </span>
    </div>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

function TabButton({ label, active, onClick, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? "border-blue-500 text-blue-400"
          : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="px-1.5 py-0.5 text-xs bg-blue-900/50 text-blue-300 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

interface TTSessionRowProps {
  session: TTSession;
}

function TTSessionRow({ session }: TTSessionRowProps) {
  const getStateColor = (state: TTSession["state"]): StatusType => {
    switch (state) {
      case "speaking":
        return "active";
      case "thinking":
        return "warning";
      case "listening":
        return "connected";
      default:
        return "unknown";
    }
  };

  const getStateIcon = (state: TTSession["state"]) => {
    switch (state) {
      case "speaking":
        return "🗣️";
      case "thinking":
        return "🧠";
      case "listening":
        return "👂";
      default:
        return "💤";
    }
  };

  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="text-sm text-slate-200 truncate max-w-[150px] sm:max-w-none">
          {session.user_email || session.user_id}
        </div>
        <div className="text-xs text-slate-500 font-mono">
          {session.session_id.slice(0, 8)}...
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          status={getStateColor(session.state)}
          label={`${getStateIcon(session.state)} ${session.state}`}
          size="sm"
        />
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
        {session.thinker_model || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
        {session.talker_voice || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
        {session.messages_processed}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
        {session.avg_response_time_ms
          ? `${session.avg_response_time_ms.toFixed(0)} ms`
          : "-"}
      </td>
    </tr>
  );
}

interface TTContextRowProps {
  context: TTContext;
}

function TTContextRow({ context }: TTContextRowProps) {
  const expiresAt = new Date(context.expires_at);
  const now = new Date();
  const isExpiringSoon = expiresAt.getTime() - now.getTime() < 1000 * 60 * 5; // 5 minutes

  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="text-sm text-slate-200 font-mono">
          {context.context_id.slice(0, 12)}...
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-slate-400">
          {context.user_id.slice(0, 8)}...
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
        {context.message_count}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
        {context.token_count.toLocaleString()}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span
          className={`text-xs ${
            isExpiringSoon ? "text-amber-400" : "text-slate-400"
          }`}
        >
          {expiresAt.toLocaleTimeString()}
        </span>
      </td>
    </tr>
  );
}

interface QualityPresetCardProps {
  preset: QualityPreset;
}

function QualityPresetCard({ preset }: QualityPresetCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        preset.is_default
          ? "bg-blue-900/20 border-blue-800"
          : "bg-slate-800/30 border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-slate-200">{preset.name}</span>
        {preset.is_default && (
          <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded">
            Default
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-3">{preset.description}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500">Model:</span>{" "}
          <span className="text-slate-300">{preset.tts_model}</span>
        </div>
        <div>
          <span className="text-slate-500">Voice:</span>{" "}
          <span className="text-slate-300">{preset.voice_id}</span>
        </div>
        <div className="col-span-2">
          <span className="text-slate-500">Speed:</span>{" "}
          <span className="text-slate-300">{preset.speed}x</span>
        </div>
      </div>
    </div>
  );
}

interface ToolFrequencyBarProps {
  tool: string;
  count: number;
  maxCount: number;
}

function ToolFrequencyBar({ tool, count, maxCount }: ToolFrequencyBarProps) {
  const percentage = (count / maxCount) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-sm text-slate-300 truncate" title={tool}>
        {tool}
      </div>
      <div className="flex-1 h-6 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all flex items-center justify-end pr-2"
          style={{ width: `${Math.max(percentage, 10)}%` }}
        >
          <span className="text-xs text-white font-medium">{count}</span>
        </div>
      </div>
    </div>
  );
}
