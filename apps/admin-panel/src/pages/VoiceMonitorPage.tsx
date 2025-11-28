import { useState } from "react";
import { useVoiceMonitor, VoiceSession } from "../hooks/useVoiceMonitor";
import { useAuth } from "../contexts/AuthContext";

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

  const handleDisconnect = async (sessionId: string) => {
    if (!isAdmin) return;
    setDisconnecting(sessionId);
    await disconnectSession(sessionId);
    setDisconnecting(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-900/50 text-green-400 border-green-800";
      case "degraded":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-800";
      case "unhealthy":
        return "bg-red-900/50 text-red-400 border-red-800";
      default:
        return "bg-slate-900/50 text-slate-400 border-slate-800";
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "voice":
        return "bg-purple-900/50 text-purple-400 border-purple-800";
      case "realtime":
        return "bg-blue-900/50 text-blue-400 border-blue-800";
      default:
        return "bg-slate-900/50 text-slate-400 border-slate-800";
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (loading && !metrics) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Voice Monitor</h1>
            <p className="text-sm text-slate-400 mt-1">
              Monitor voice sessions and realtime connections
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-8 w-16 bg-slate-800 rounded mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Voice Monitor</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor voice sessions and realtime connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor(health.status)}`}
            >
              {health.status === "healthy" && "● "}
              {health.status === "degraded" && "◐ "}
              {health.status === "unhealthy" && "○ "}
              {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
            </span>
          )}
          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Active Sessions"
          value={metrics?.active_sessions ?? 0}
          icon="🎙️"
          color="blue"
        />
        <MetricCard
          title="Sessions (24h)"
          value={metrics?.total_sessions_24h ?? 0}
          icon="📊"
          color="purple"
        />
        <MetricCard
          title="Avg Duration"
          value={
            metrics?.avg_session_duration_sec
              ? formatDuration(metrics.avg_session_duration_sec)
              : "0m 0s"
          }
          icon="⏱️"
          color="green"
          isText
        />
        <MetricCard
          title="Error Rate"
          value={`${((metrics?.error_rate_24h ?? 0) * 100).toFixed(1)}%`}
          icon="⚠️"
          color={
            (metrics?.error_rate_24h ?? 0) > 0.05
              ? "red"
              : (metrics?.error_rate_24h ?? 0) > 0.01
                ? "yellow"
                : "green"
          }
          isText
        />
      </div>

      {/* Service Health */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">Service Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      </div>

      {/* Connections by Type */}
      {metrics?.connections_by_type && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-200">
            Connections by Type
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(metrics.connections_by_type).map(
              ([type, count]) => (
                <div
                  key={type}
                  className="bg-slate-900/50 border border-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300 capitalize">
                      {type}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSessionTypeColor(type)}`}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Active Sessions Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">
            Active Sessions ({sessions.length})
          </h2>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-8 text-center">
            <p className="text-slate-400">No active voice sessions</p>
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Connected
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Messages
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
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
                    onDisconnect={() => handleDisconnect(session.session_id)}
                    getSessionTypeColor={getSessionTypeColor}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration Panel (Read-only for viewers) */}
      {config && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-200">
            Voice Configuration
          </h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-slate-500">
        {lastUpdated ? (
          <>Last updated: {new Date(lastUpdated).toLocaleString()}</>
        ) : (
          "Waiting for first successful sync..."
        )}
      </div>
    </div>
  );
}

// Sub-components

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: "blue" | "green" | "purple" | "yellow" | "red";
  isText?: boolean;
}

function MetricCard({ title, value, icon, color, isText }: MetricCardProps) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-400">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {isText ? value : value.toLocaleString()}
      </div>
    </div>
  );
}

interface HealthCardProps {
  name: string;
  enabled: boolean;
  label?: string;
}

function HealthCard({ name, enabled, label }: HealthCardProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{name}</span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            enabled
              ? "bg-green-900/50 text-green-400 border border-green-800"
              : "bg-red-900/50 text-red-400 border border-red-800"
          }`}
        >
          {label || (enabled ? "● Online" : "● Offline")}
        </span>
      </div>
    </div>
  );
}

interface SessionRowProps {
  session: VoiceSession;
  isAdmin: boolean;
  isDisconnecting: boolean;
  onDisconnect: () => void;
  getSessionTypeColor: (type: string) => string;
}

function SessionRow({
  session,
  isAdmin,
  isDisconnecting,
  onDisconnect,
  getSessionTypeColor,
}: SessionRowProps) {
  const connectedAt = new Date(session.connected_at);
  const lastActivity = session.last_activity
    ? new Date(session.last_activity)
    : null;

  return (
    <tr className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="text-sm text-slate-200">
          {session.user_email || session.user_id}
        </div>
        <div className="text-xs text-slate-500 font-mono">
          {session.session_id.slice(0, 8)}...
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSessionTypeColor(session.session_type)}`}
        >
          {session.session_type}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {connectedAt.toLocaleTimeString()}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {session.messages_count}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
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
    <div>
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="text-slate-300 font-medium">{value}</span>
    </div>
  );
}
