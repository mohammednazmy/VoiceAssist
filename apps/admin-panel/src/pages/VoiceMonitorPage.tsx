import { useState } from "react";
import { useVoiceMonitor, VoiceSession } from "../hooks/useVoiceMonitor";
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

export function VoiceMonitorPage() {
  const { isAdmin } = useAuth();

  const {
    sessions,
    metrics,
    health,
    config,
    loading,
    error,
    lastUpdated,
    refreshAll,
    disconnectSession,
  } = useVoiceMonitor({ autoRefresh: true, refreshIntervalMs: 10000 });

  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] =
    useState<VoiceSession | null>(null);

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
          <HealthCard name="Redis" enabled={health?.redis_connected ?? false} />
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
            <ConfigItem label="Default Voice" value={config.default_voice} />
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
