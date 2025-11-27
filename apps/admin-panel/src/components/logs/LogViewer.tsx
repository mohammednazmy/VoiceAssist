import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../../lib/api";
import {
  ConnectionStatus,
  websocketService,
  WebSocketEvent,
} from "../../services/websocket";
import { LogFilters, LogFiltersState, LogLevel, Timeframe } from "./LogFilters";

type LogEntryLevel = Exclude<LogLevel, "all">;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogEntryLevel;
  message: string;
  service?: string;
  context?: Record<string, unknown>;
}

const timeframeToMs: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function isRecent(timestamp: string, timeframe: Timeframe) {
  const windowMs = timeframeToMs[timeframe];
  const ts = new Date(timestamp).getTime();
  return Date.now() - ts <= windowMs;
}

function isLogEvent(
  event: WebSocketEvent,
): event is WebSocketEvent & { payload: LogEntry } {
  return event.type === "log" || event.type === "logs:new";
}

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<LogFiltersState>({
    timeframe: "1h",
    search: "",
    level: "all",
    service: "",
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    websocketService.getStatus(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: filters.timeframe,
        level: filters.level,
        service: filters.service,
        search: filters.search,
      });

      const data = await fetchAPI<{ logs: LogEntry[] }>(
        `/api/admin/logs?${params.toString()}`,
      );

      setLogs(data.logs);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to load logs";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters.level, filters.search, filters.service, filters.timeframe]);

  const handleIncomingLog = useCallback(
    (entry: LogEntry) => {
      if (!isRecent(entry.timestamp, filters.timeframe)) return;
      setLogs((current) => [entry, ...current].slice(0, 500));
      setLastUpdated(new Date().toISOString());
    },
    [filters.timeframe],
  );

  useEffect(() => {
    const unsubscribeStatus = websocketService.subscribeStatus(setConnectionStatus);
    const unsubscribeMessages = websocketService.subscribeMessages((event) => {
      if (!isLogEvent(event)) return;
      const payload = event.payload as LogEntry;
      handleIncomingLog(payload);
    });

    websocketService.connect();

    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
    };
  }, [handleIncomingLog]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        const matchesLevel = filters.level === "all" || log.level === filters.level;
        const matchesService =
          filters.service.trim() === "" ||
          log.service?.toLowerCase().includes(filters.service.toLowerCase());
        const matchesSearch =
          filters.search.trim() === "" ||
          log.message.toLowerCase().includes(filters.search.toLowerCase());
        const withinWindow = isRecent(log.timestamp, filters.timeframe);
        return matchesLevel && matchesService && matchesSearch && withinWindow;
      })
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
  }, [filters.level, filters.search, filters.service, filters.timeframe, logs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Logs</h2>
          <p className="text-xs text-slate-400">
            WebSocket status: {connectionStatus}
            {lastUpdated && ` · Last updated ${new Date(lastUpdated).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
              connectionStatus === "open"
                ? "text-emerald-400 border-emerald-500/50 bg-emerald-500/10"
                : "text-slate-400 border-slate-600 bg-slate-800/60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
            {connectionStatus === "open" ? "Streaming" : "Idle"}
          </span>
          <button
            type="button"
            onClick={loadLogs}
            className="px-3 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <LogFilters value={filters} onChange={setFilters} />

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 text-xs font-semibold text-slate-400 bg-slate-900/80 border-b border-slate-800 px-4 py-2">
          <span className="col-span-3">Timestamp</span>
          <span className="col-span-2">Level</span>
          <span className="col-span-2">Service</span>
          <span className="col-span-5">Message</span>
        </div>
        {loading ? (
          <div className="p-4 text-slate-400 text-sm">Loading logs…</div>
        ) : error ? (
          <div className="p-4 text-red-300 text-sm">{error}</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-6 text-slate-400 text-sm">No logs match the selected filters.</div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-800">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-12 text-sm text-slate-200 px-4 py-2 hover:bg-slate-900"
              >
                <span className="col-span-3 text-xs text-slate-400">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className="col-span-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                      log.level === "error"
                        ? "bg-red-500/10 text-red-300 border border-red-500/40"
                        : log.level === "warn"
                          ? "bg-amber-500/10 text-amber-200 border border-amber-500/40"
                          : log.level === "info"
                            ? "bg-blue-500/10 text-blue-200 border border-blue-500/40"
                            : "bg-slate-700 text-slate-200 border border-slate-600"
                    }`}
                  >
                    {log.level}
                  </span>
                </span>
                <span className="col-span-2 text-slate-300 truncate">
                  {log.service || "-"}
                </span>
                <span className="col-span-5 text-slate-100 truncate" title={log.message}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
