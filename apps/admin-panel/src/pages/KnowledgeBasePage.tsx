import { useEffect, useMemo, useState } from "react";
import { useKnowledgeDocuments } from "../hooks/useKnowledgeDocuments";
import { useAuth } from "../contexts/AuthContext";
import {
  DocumentTable,
  type DocumentRow,
} from "../components/knowledge/DocumentTable";
import { UploadDialog } from "../components/knowledge/UploadDialog";
import { AuditDrawer } from "../components/knowledge/AuditDrawer";

const MAX_UPLOAD_MB = 25;

export function KnowledgeBasePage() {
  const { docs, loading, error } = useKnowledgeDocuments();
  const { isViewer } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [auditDoc, setAuditDoc] = useState<DocumentRow | null>(null);

  useEffect(() => {
    setDocuments(
      docs.map((doc) => ({
        ...doc,
        status: doc.indexed ? "indexed" : "pending",
        sizeMb: undefined,
      })),
    );
  }, [docs]);

  const simulateUpload = async (
    file: File,
    onProgress: (value: number) => void,
  ) => {
    return new Promise<void>((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress = Math.min(100, progress + 10 + Math.random() * 20);
        onProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(resolve, 150);
        }
      }, 180);
    });
  };

  const handleUpload = async (
    file: File,
    onProgress: (value: number) => void,
  ) => {
    if (isViewer) {
      throw new Error("Uploads are disabled for viewer role");
    }
    setUploading(true);
    setUploadError(null);
    try {
      await simulateUpload(file, onProgress);
      const now = new Date().toISOString();
      const newDoc: DocumentRow = {
        id: `local-${Date.now()}`,
        name: file.name,
        type: file.type?.includes("pdf") ? "pdf" : "note",
        indexed: false,
        status: "pending",
        version: "v1",
        lastIndexedAt: now,
        sizeMb: file.size / (1024 * 1024),
      };
      setDocuments((prev) => [newDoc, ...prev]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const updateDocumentsStatus = (
    ids: string[],
    status: DocumentRow["status"],
  ) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        ids.includes(doc.id)
          ? {
              ...doc,
              status,
              indexed: status === "indexed",
              lastIndexedAt:
                status === "indexed"
                  ? new Date().toISOString()
                  : doc.lastIndexedAt,
            }
          : doc,
      ),
    );
  };

  const handleDelete = async (ids: string[]) => {
    if (isViewer) return;
    setDocuments((prev) => prev.filter((doc) => !ids.includes(doc.id)));
  };

  const handleReindex = async (ids: string[]) => {
    if (isViewer) return;
    updateDocumentsStatus(ids, "reindexing");
    setTimeout(() => updateDocumentsStatus(ids, "indexed"), 1000);
  };

  const stats = useMemo(() => {
    const total = documents.length;
    const indexed = documents.filter((d) => d.status === "indexed").length;
    const pending = documents.filter((d) => d.status === "pending").length;
    const reindexing = documents.filter(
      (d) => d.status === "reindexing",
    ).length;
    return {
      total,
      indexed,
      pending,
      reindexing,
    };
  }, [documents]);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Knowledge Base</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage medical documents, textbooks, and reference materials
          </p>
        </div>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isViewer
              ? "cursor-not-allowed opacity-60 bg-slate-800 text-slate-400"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          onClick={() => setShowUpload(true)}
          disabled={isViewer || uploading}
        >
          {uploading ? "Uploading…" : "+ Upload"}
        </button>
      </div>

      {isViewer && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md text-amber-300 text-sm">
          Viewer role is read-only. Uploads and destructive actions are
          disabled.
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-md text-rose-200 text-sm">
          Failed to load documents. Showing demo data.
        </div>
      )}

      {uploadError && (
        <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-md text-rose-200 text-sm">
          {uploadError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Documents"
          value={stats.total}
          color="blue"
          subtitle={`${stats.indexed} indexed`}
        />
        <StatCard
          label="Indexed"
          value={stats.indexed}
          color="green"
          subtitle="Ready for RAG"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="amber"
          subtitle="Waiting to index"
        />
        <StatCard
          label="Reindexing"
          value={stats.reindexing}
          color="blue"
          subtitle="Queued"
        />
      </div>

      <DocumentTable
        documents={documents}
        loading={loading}
        onDelete={handleDelete}
        onReindex={handleReindex}
        onOpenAudit={(doc) => setAuditDoc(doc)}
      />

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
        maxSizeMb={MAX_UPLOAD_MB}
        acceptedTypes={["application/pdf", "text/plain"]}
      />

      <AuditDrawer
        open={Boolean(auditDoc)}
        document={auditDoc}
        onClose={() => setAuditDoc(null)}
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: "blue" | "green" | "amber";
  subtitle?: string;
}

function StatCard({ label, value, color, subtitle }: StatCardProps) {
  const colorMap: Record<StatCardProps["color"], string> = {
    blue: "bg-blue-950/50 border-blue-900 text-blue-100",
    green: "bg-emerald-950/50 border-emerald-900 text-emerald-100",
    amber: "bg-amber-950/50 border-amber-900 text-amber-100",
  };

  return (
    <div className={`border rounded-lg p-4 ${colorMap[color]}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="text-2xl font-semibold text-white mt-2">{value}</div>
      {subtitle && (
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
