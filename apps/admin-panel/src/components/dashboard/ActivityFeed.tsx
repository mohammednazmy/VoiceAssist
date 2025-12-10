import {
  useRealtimeEvents,
  AdminEvent,
  AdminEventType,
  ConnectionStatus,
} from "../../hooks/useRealtimeEvents";

// Event type display configuration
const eventConfig: Record<
  AdminEventType,
  { icon: string; label: string; color: string }
> = {
  "session.connected": {
    icon: "🔗",
    label: "Session Connected",
    color: "text-green-400",
  },
  "session.disconnected": {
    icon: "🔌",
    label: "Session Disconnected",
    color: "text-slate-400",
  },
  "conversation.created": {
    icon: "💬",
    label: "Conversation Created",
    color: "text-blue-400",
  },
  "conversation.updated": {
    icon: "✏️",
    label: "Conversation Updated",
    color: "text-blue-300",
  },
  "conversation.deleted": {
    icon: "🗑️",
    label: "Conversation Deleted",
    color: "text-red-400",
  },
  "message.created": {
    icon: "📝",
    label: "Message Created",
    color: "text-slate-300",
  },
  "clinical_context.created": {
    icon: "🏥",
    label: "Clinical Context Created",
    color: "text-purple-400",
  },
  "clinical_context.updated": {
    icon: "🏥",
    label: "Clinical Context Updated",
    color: "text-purple-300",
  },
  "attachment.uploaded": {
    icon: "📎",
    label: "Attachment Uploaded",
    color: "text-cyan-400",
  },
  "attachment.deleted": {
    icon: "📎",
    label: "Attachment Deleted",
    color: "text-red-300",
  },
  "phi.accessed": {
    icon: "🔓",
    label: "PHI Accessed",
    color: "text-amber-400",
  },
  "phi.detected": {
    icon: "⚠️",
    label: "PHI Detected",
    color: "text-amber-500",
  },
  "voice.session_started": {
    icon: "🎤",
    label: "Voice Session Started",
    color: "text-green-400",
  },
  "voice.session_ended": {
    icon: "🎤",
    label: "Voice Session Ended",
    color: "text-slate-400",
  },
  "voice.session_error": {
    icon: "🎤",
    label: "Voice Session Error",
    color: "text-red-400",
  },
  "tt.state_changed": {
    icon: "🤖",
    label: "TT State Changed",
    color: "text-blue-400",
  },
  "tt.tool_called": {
    icon: "🔧",
    label: "Tool Called",
    color: "text-cyan-400",
  },
  "tt.context_created": {
    icon: "📋",
    label: "TT Context Created",
    color: "text-purple-400",
  },
  "tt.context_expired": {
    icon: "📋",
    label: "TT Context Expired",
    color: "text-slate-400",
  },
  "system.alert": { icon: "🚨", label: "System Alert", color: "text-red-500" },
  "system.health_changed": {
    icon: "💓",
    label: "Health Changed",
    color: "text-amber-400",
  },
  "user.logged_in": {
    icon: "👤",
    label: "User Logged In",
    color: "text-green-400",
  },
  "user.logged_out": {
    icon: "👤",
    label: "User Logged Out",
    color: "text-slate-400",
  },
  "user.created": {
    icon: "✨",
    label: "User Created",
    color: "text-green-500",
  },
};

const connectionStatusConfig: Record<
  ConnectionStatus,
  { label: string; color: string; dot: string }
> = {
  connecting: {
    label: "Connecting",
    color: "text-yellow-400",
    dot: "bg-yellow-400",
  },
  connected: { label: "Live", color: "text-green-400", dot: "bg-green-400" },
  reconnecting: {
    label: "Reconnecting",
    color: "text-amber-400",
    dot: "bg-amber-400 animate-pulse",
  },
  disconnected: {
    label: "Disconnected",
    color: "text-slate-400",
    dot: "bg-slate-400",
  },
  failed: { label: "Failed", color: "text-red-400", dot: "bg-red-400" },
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

function EventItem({ event }: { event: AdminEvent }) {
  const config = eventConfig[event.type] || {
    icon: "📌",
    label: event.type,
    color: "text-slate-400",
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
      <span className="text-base flex-shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${config.color}`}>
          {config.label}
        </div>
        {event.user_email && (
          <div className="text-xs text-slate-500 truncate">
            {event.user_email}
          </div>
        )}
        {event.data && Object.keys(event.data).length > 0 && (
          <div className="text-xs text-slate-600 truncate">
            {Object.entries(event.data)
              .slice(0, 2)
              .map(([k, v]) => (
                <span key={k} className="mr-2">
                  {k}: {typeof v === "string" ? v : JSON.stringify(v)}
                </span>
              ))}
          </div>
        )}
      </div>
      <span className="text-xs text-slate-500 flex-shrink-0">
        {formatTimestamp(event.timestamp)}
      </span>
    </div>
  );
}

export function ActivityFeed() {
  const { status, events, metrics, clearEvents, connect, lastEventTime } =
    useRealtimeEvents({
      autoConnect: true,
      maxReconnectAttempts: 5,
    });

  const statusConfig = connectionStatusConfig[status];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Activity Feed
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${statusConfig.color}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <button
              type="button"
              onClick={clearEvents}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
          {status === "disconnected" || status === "failed" ? (
            <button
              type="button"
              onClick={connect}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Reconnect
            </button>
          ) : null}
        </div>
      </div>

      {/* Real-time Metrics (if available) */}
      {metrics && (
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/30">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500">WS Sessions:</span>{" "}
              <span className="text-slate-300">
                {metrics.active_websocket_sessions}
              </span>
            </div>
            <div>
              <span className="text-slate-500">DB Pool:</span>{" "}
              <span className="text-slate-300">
                {metrics.database_pool.checked_out}/
                {metrics.database_pool.pool_size}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Redis:</span>{" "}
              <span className="text-slate-300">
                {metrics.redis_pool.available_connections}/
                {metrics.redis_pool.total_connections}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="max-h-[300px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            {status === "connected" ? (
              <>Waiting for events...</>
            ) : status === "connecting" ? (
              <>Connecting to event stream...</>
            ) : (
              <>No events received</>
            )}
          </div>
        ) : (
          <div className="px-4 py-2">
            {events.slice(0, 20).map((event, idx) => (
              <EventItem key={`${event.timestamp}-${idx}`} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastEventTime && (
        <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
          Last event: {formatTimestamp(lastEventTime)}
        </div>
      )}
    </div>
  );
}
