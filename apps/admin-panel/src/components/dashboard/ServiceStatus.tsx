import { useEffect, useState } from "react";
import { ConnectionStatus, websocketService } from "../../services/websocket";

const statusCopy: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  closed: "Disconnected",
  error: "Error",
};

const statusColor: Record<ConnectionStatus, string> = {
  connecting: "text-amber-400 border-amber-500/50 bg-amber-500/10",
  open: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
  reconnecting: "text-sky-400 border-sky-500/50 bg-sky-500/10",
  closed: "text-slate-400 border-slate-500/50 bg-slate-500/10",
  error: "text-red-400 border-red-500/50 bg-red-500/10",
};

export function ServiceStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(
    websocketService.getStatus(),
  );

  useEffect(() => {
    const unsubscribe = websocketService.subscribeStatus(setStatus);
    websocketService.connect();
    return () => unsubscribe();
  }, []);

  const canReconnect = status === "closed" || status === "error";

  return (
    <div className="flex items-center gap-3 text-xs">
      <div
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${statusColor[status]}`}
      >
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
        <span className="font-medium">{statusCopy[status]}</span>
      </div>
      {status !== "open" && (
        <span className="text-slate-400">
          Admin event stream{" "}
          {status === "reconnecting" ? "retrying" : "offline"}
        </span>
      )}
      {canReconnect && (
        <button
          onClick={() => websocketService.forceReconnect()}
          className="px-3 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
