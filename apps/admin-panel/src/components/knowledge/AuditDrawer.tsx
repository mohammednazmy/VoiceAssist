import { useEffect, useState } from "react";
import { fetchAPI } from "../../lib/api";
import type { KnowledgeDocument } from "../../hooks/useKnowledgeDocuments";

interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  notes?: string;
}

interface AuditDrawerProps {
  open: boolean;
  document?: KnowledgeDocument | null;
  onClose: () => void;
}

export function AuditDrawer({ open, document, onClose }: AuditDrawerProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAudit = async () => {
      if (!open || !document) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAPI<AuditEvent[]>(
          `/api/admin/kb/documents/${document.id}/audit`,
        );
        setEvents(data);
      } catch (err: unknown) {
        console.warn("Using fallback audit events because API failed", err);
        const now = new Date();
        setEvents([
          {
            id: "evt-1",
            action: "indexed",
            actor: "system/kb-indexer",
            timestamp: now.toISOString(),
            notes: "Initial ingestion completed.",
          },
          {
            id: "evt-2",
            action: "uploaded",
            actor: "admin@example.com",
            timestamp: new Date(now.getTime() - 1000 * 60 * 10).toISOString(),
            notes: `Uploaded ${document.name}`,
          },
        ]);
        setError(
          "Audit trail service unavailable; showing fallback demo events.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadAudit();
  }, [document, open]);

  if (!open || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full shadow-2xl p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm uppercase tracking-wide text-slate-500">
              Audit Trail
            </div>
            <div className="text-lg font-semibold text-slate-100">
              {document.name}
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-100"
            onClick={onClose}
            aria-label="Close audit drawer"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="text-slate-400 text-sm">Loading audit events…</div>
        )}
        {error && (
          <div className="mb-3 text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded p-2">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="border border-slate-800 rounded-md p-3 bg-slate-950/70"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="uppercase tracking-wide">{evt.action}</span>
                <span>{new Date(evt.timestamp).toLocaleString()}</span>
              </div>
              <div className="text-sm text-slate-100 mt-1">
                {evt.notes || "No additional details"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Actor: {evt.actor}
              </div>
            </div>
          ))}

          {!loading && events.length === 0 && (
            <div className="text-sm text-slate-500">
              No audit events recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
