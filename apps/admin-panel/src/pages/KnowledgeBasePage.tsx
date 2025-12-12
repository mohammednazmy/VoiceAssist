import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { HelpButton } from "@voiceassist/ui";
import { AskAIButton } from "../components/shared";
import { useKnowledgeDocuments } from "../hooks/useKnowledgeDocuments";
import { useKBUpload } from "../hooks/useKBUpload";
import { useIndexingJobs } from "../hooks/useIndexingJobs";
import { useAuth } from "../contexts/AuthContext";
import { getApiClient } from "../lib/apiClient";
import {
  DocumentTable,
  type DocumentRow,
} from "../components/knowledge/DocumentTable";
import { UploadDialog } from "../components/knowledge/UploadDialog";
import { AuditDrawer } from "../components/knowledge/AuditDrawer";
import { ProcessingProgress } from "../components/knowledge/ProcessingProgress";
import { DocumentPreviewDrawer } from "../components/knowledge/DocumentPreviewDrawer";

const MAX_UPLOAD_MB = 50; // VoiceAssist backend supports up to 50 MB for PDFs

export function KnowledgeBasePage() {
  const { docs, loading, error, refetch, deleteDocument, deleteError } = useKnowledgeDocuments();
  const {
    uploadDocument,
    isUploading,
    error: uploadHookError,
    clearError,
  } = useKBUpload();
  const { jobs, loading: jobsLoading, hasActiveJobs: _hasActiveJobs } = useIndexingJobs({
    pollingInterval: 3000, // Poll every 3 seconds when there are active jobs
    autoPolling: true,
    enabled: true, // Jobs endpoint is now implemented
  });
  const { isViewer } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [auditDoc, setAuditDoc] = useState<DocumentRow | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [deepLinkDocId, setDeepLinkDocId] = useState<string | null>(null);
  const location = useLocation();
  const [narrationCoverage, setNarrationCoverage] = useState<
    Record<string, { coverage_percent: number; ready: number; total_pages: number }>
  >({});

  useEffect(() => {
    setDocuments(
      docs.map((doc) => {
        // Map indexingStatus to UI status
        let status: DocumentRow["status"] = "pending";
        if (doc.indexingStatus === "indexed") {
          status = "indexed";
        } else if (doc.indexingStatus === "processing") {
          status = "reindexing"; // Use reindexing to show processing state
        } else if (doc.indexingStatus === "failed") {
          status = "pending"; // Failed shows as pending for retry
        }

        return {
          ...doc,
          status,
          sizeMb: undefined,
          // Structure fields from API
          totalPages: doc.totalPages ?? null,
          hasToc: doc.hasToc ?? false,
          hasFigures: doc.hasFigures ?? false,
          chunksIndexed: doc.chunksIndexed ?? 0,
          // Ownership fields from API
          ownerId: doc.ownerId ?? null,
          ownerName: doc.ownerName ?? null,
          isPublic: doc.isPublic ?? false,
          sourceType: doc.sourceType ?? "system",
        };
      }),
    );
  }, [docs]);

  // Load narration coverage summaries for KB documents that have enhanced structure.
  // Uses batch endpoint for efficiency instead of individual calls per document.
  useEffect(() => {
    const loadCoverage = async () => {
      const client = getApiClient();

      // Filter to only docs with enhanced structure
      const enhancedDocIds = docs
        .filter((doc) => doc.hasEnhancedStructure)
        .map((doc) => doc.id);

      if (enhancedDocIds.length === 0) return;

      try {
        // Use batch endpoint for efficiency
        const response = await client.getBatchNarrationSummaries(enhancedDocIds);

        if (response?.summaries) {
          const updated: Record<
            string,
            { coverage_percent: number; ready: number; total_pages: number }
          > = {};

          for (const [docId, summary] of Object.entries(response.summaries)) {
            if (
              summary &&
              typeof summary.coverage_percent === "number" &&
              typeof summary.ready === "number"
            ) {
              updated[docId] = {
                coverage_percent: summary.coverage_percent,
                ready: summary.ready,
                total_pages: summary.total_pages ?? 0,
              };
            }
          }

          if (Object.keys(updated).length > 0) {
            setNarrationCoverage(updated);
          }
        }
      } catch {
        // Fallback to individual calls if batch fails (e.g., older backend)
        const updated: Record<
          string,
          { coverage_percent: number; ready: number; total_pages: number }
        > = {};

        await Promise.all(
          enhancedDocIds.map(async (docId) => {
            try {
              const result = await client.getNarrationSummary(docId);
              const summary = result?.summary;
              if (
                summary &&
                typeof summary.coverage_percent === "number" &&
                typeof summary.ready === "number"
              ) {
                updated[docId] = {
                  coverage_percent: summary.coverage_percent,
                  ready: summary.ready,
                  total_pages: summary.total_pages ?? 0,
                };
              }
            } catch {
              // Ignore individual failures
            }
          }),
        );

        if (Object.keys(updated).length > 0) {
          setNarrationCoverage(updated);
        }
      }
    };

    if (docs.length > 0) {
      void loadCoverage();
    }
  }, [docs]);

  // Capture deep-link documentId from query string (e.g. ?documentId=doc-123)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const docId =
      params.get("documentId") ?? params.get("docId") ?? params.get("doc");
    if (docId) {
      setDeepLinkDocId(docId);
    }
  }, [location.search]);

  // Sync upload hook error with local state
  useEffect(() => {
    if (uploadHookError) {
      setUploadError(uploadHookError);
    }
  }, [uploadHookError]);

  // Refetch documents when indexing jobs complete
  useEffect(() => {
    const completedJobs = jobs.filter((j) => j.state === "completed");
    if (completedJobs.length > 0) {
      // Refetch to get updated document status
      refetch?.();
    }
  }, [jobs, refetch]);

  // When documents are loaded and a deep-link id is present, open preview
  useEffect(() => {
    if (!deepLinkDocId || previewDoc) return;
    const target = documents.find((d) => d.id === deepLinkDocId);
    if (target) {
      setPreviewDoc(target);
    }
  }, [deepLinkDocId, documents, previewDoc]);

  const handleUpload = useCallback(
    async (file: File, onProgress: (value: number) => void) => {
      if (isViewer) {
        throw new Error("Uploads are disabled for viewer role");
      }

      setUploadError(null);
      clearError();

      try {
        // Upload to backend with progress callback
        const result = await uploadDocument(
          file,
          file.name.replace(/\.[^/.]+$/, ""), // title from filename
          "", // author empty for now
          (progress) => onProgress(progress.percent),
        );

        // Create new document entry from response
        const now = new Date().toISOString();
        const newDoc: DocumentRow = {
          id: result.source,
          name: result.title,
          type: file.type?.includes("pdf") ? "pdf" : "note",
          indexed: result.chunks > 0,
          indexingStatus: result.chunks > 0 ? "indexed" : "processing",
          status: result.chunks > 0 ? "indexed" : "pending",
          version: "v1",
          lastIndexedAt: now,
          sizeMb: file.size / (1024 * 1024),
          // Structure fields - will be populated after processing
          totalPages: null,
          hasToc: false,
          hasFigures: false,
          chunksIndexed: result.chunks ?? 0,
          // Ownership fields
          ownerId: null, // Admin uploads are system docs
          ownerName: null,
          isPublic: true, // Admin uploads default to public
          sourceType: "system",
        };
        setDocuments((prev) => [newDoc, ...prev]);

        // Optionally refetch the full list
        refetch?.();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadError(message);
        throw err;
      }
    },
    [isViewer, uploadDocument, clearError, refetch],
  );

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

    // Delete each document via API (with optimistic UI update handled by the hook)
    const results = await Promise.all(ids.map((id) => deleteDocument(id)));

    // Check for any failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.error(`Failed to delete ${failures.length} document(s)`);
    }
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
    // Include active indexing jobs in processing count
    const activeJobs = jobs.filter((j) => j.state === "running" || j.state === "pending").length;
    return {
      total,
      indexed,
      pending,
      reindexing,
      processing: activeJobs,
    };
  }, [documents, jobs]);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">
              Knowledge Base
            </h1>
            <HelpButton
              docPath="admin/knowledge-base"
              tooltipText="View KB documentation"
              docsBaseUrl={import.meta.env.VITE_DOCS_URL}
            />
            <AskAIButton
              pageContext="Knowledge Base management"
              docPath="admin/knowledge-base"
            />
          </div>
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
          disabled={isViewer || isUploading}
        >
          {isUploading ? "Uploading…" : "+ Upload"}
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

      {deleteError && (
        <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-md text-rose-200 text-sm">
          Delete failed: {deleteError}
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
          label="Processing"
          value={stats.reindexing + stats.processing}
          color="blue"
          subtitle={stats.processing > 0 ? `${stats.processing} indexing` : "Queued"}
        />
      </div>

      {/* Processing Progress Indicator */}
      <ProcessingProgress jobs={jobs} loading={jobsLoading} />

      <DocumentTable
        documents={documents}
        loading={loading}
        onDelete={handleDelete}
        onReindex={handleReindex}
        onOpenAudit={(doc) => setAuditDoc(doc)}
        onOpenPreview={(doc) => setPreviewDoc(doc)}
        narrationCoverage={narrationCoverage}
      />

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
        maxSizeMb={MAX_UPLOAD_MB}
        acceptedTypes={["application/pdf", "text/plain", "text/markdown"]}
      />

      <AuditDrawer
        open={Boolean(auditDoc)}
        document={auditDoc}
        onClose={() => setAuditDoc(null)}
      />

      <DocumentPreviewDrawer
        open={Boolean(previewDoc)}
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onNarrationUpdated={async (docId) => {
          try {
            const client = getApiClient();
            const resp = await client.getNarrationSummary(docId);
            const summary = resp.summary;
            if (
              summary &&
              typeof summary.coverage_percent === "number" &&
              typeof summary.ready === "number"
            ) {
              setNarrationCoverage((prev) => ({
                ...prev,
                [docId]: {
                  coverage_percent: summary.coverage_percent,
                  ready: summary.ready,
                  total_pages: summary.total_pages ?? 0,
                },
              }));
            }
          } catch {
            // Ignore refresh failures; UI will remain consistent with last known state
          }
        }}
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
