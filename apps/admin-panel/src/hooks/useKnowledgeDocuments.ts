import { useEffect, useState, useCallback, useRef } from "react";
import type { APIErrorShape } from "../types";
import { fetchAPI } from "../lib/api";

// Simplified KnowledgeDocument for admin list view
// Full canonical definition in DATA_MODEL.md includes 20+ fields:
// userId, docKey, contentHash, filePath, fileName, fileSize, fileFormat,
// authors, publicationYear, publisher, edition, isbn, doi, etc.
export interface KnowledgeDocument {
  id: string;
  name: string; // Maps to 'title' in canonical model
  type: "textbook" | "journal" | "guideline" | "note" | string; // Maps to 'documentType'
  indexed: boolean; // Maps to 'isIndexed'
  indexingStatus: "processing" | "indexed" | "failed"; // Actual status from backend
  version?: string; // Simplified from canonical 'version' (number)
  lastIndexedAt?: string;
  // Structure-related fields (from PDF parsing)
  totalPages?: number | null;
  hasToc?: boolean;
  hasFigures?: boolean;
  chunksIndexed?: number;
  processingStage?: string;
  processingProgress?: number;
  hasEnhancedStructure?: boolean;
  phiRisk?: string | null;
  // Ownership/visibility fields
  ownerId?: string | null;
  ownerName?: string | null;
  isPublic?: boolean;
  sourceType?: string;
}

interface DeleteResult {
  success: boolean;
  documentId: string;
}

export function useKnowledgeDocuments() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const isMountedRef = useRef(true);

  const refetch = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try real backend; fall back to demo data on failure
        // API path from ADMIN_PANEL_SPECS.md: GET /api/admin/kb/documents
        // Returns APIEnvelope<{documents: KnowledgeDocument[], total: number}>
        const response = await fetchAPI<
          | { documents: KnowledgeDocument[]; total: number }
          | KnowledgeDocument[]
        >("/api/admin/kb/documents");
        // Handle both array and object response formats for backwards compatibility
        const rawData = Array.isArray(response) ? response : response.documents;
        // Map snake_case API response to camelCase interface
        const mappedData: KnowledgeDocument[] = (rawData as any[]).map((doc) => {
          const indexingStatus: "processing" | "indexed" | "failed" =
            doc.indexing_status ??
            (doc.indexed === true ? "indexed" : "processing");

          return {
            id: doc.document_id || doc.id,
            name: doc.title || doc.name,
            type: doc.source_type || doc.type,
            indexed: indexingStatus === "indexed",
            indexingStatus,
            version: doc.version,
            lastIndexedAt: doc.upload_date || doc.lastIndexedAt,
            // Structure fields
            totalPages: doc.total_pages ?? null,
            hasToc: doc.has_toc ?? false,
            hasFigures: doc.has_figures ?? false,
            chunksIndexed: doc.chunks_indexed ?? 0,
            processingStage: doc.processing_stage,
            processingProgress: doc.processing_progress,
            hasEnhancedStructure: doc.has_enhanced_structure ?? false,
            phiRisk: doc.phi_risk ?? null,
            // Ownership fields
            ownerId: doc.owner_id ?? null,
            ownerName: doc.owner_name ?? null,
            isPublic: doc.is_public ?? true,
            sourceType: doc.source_type,
          };
        });
        if (!cancelled) setDocs(mappedData);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.warn("Falling back to demo KB data:", message);
        if (!cancelled) {
          setError({ code: "demo", message });
          setDocs([
            {
              id: "doc-harrisons-hf",
              name: "Harrison's · Heart Failure",
              type: "textbook",
              indexed: true,
              indexingStatus: "indexed",
              version: "v1",
              lastIndexedAt: new Date().toISOString(),
            },
            {
              id: "doc-aha-2022-hf",
              name: "AHA/ACC/HFSA 2022 HF Guideline",
              type: "guideline",
              indexed: true,
              indexingStatus: "indexed",
              version: "v1",
              lastIndexedAt: new Date().toISOString(),
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [fetchTrigger]);

  // Optimistic delete with rollback on failure
  const deleteDocument = useCallback(
    async (documentId: string): Promise<DeleteResult> => {
      // Store the document for potential rollback
      const documentToDelete = docs.find((d) => d.id === documentId);
      if (!documentToDelete) {
        return { success: false, documentId };
      }

      // Mark as deleting
      setDeleting((prev) => new Set(prev).add(documentId));
      setDeleteError(null);

      // Optimistic update: remove from list immediately
      setDocs((prev) => prev.filter((d) => d.id !== documentId));

      try {
        await fetchAPI(`/api/admin/kb/documents/${documentId}`, {
          method: "DELETE",
        });

        if (isMountedRef.current) {
          setDeleting((prev) => {
            const next = new Set(prev);
            next.delete(documentId);
            return next;
          });
        }

        return { success: true, documentId };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete document";

        if (isMountedRef.current) {
          // Rollback: restore the document
          setDocs((prev) => [...prev, documentToDelete]);
          setDeleteError(message);
          setDeleting((prev) => {
            const next = new Set(prev);
            next.delete(documentId);
            return next;
          });
        }

        return { success: false, documentId };
      }
    },
    [docs],
  );

  // Bulk delete with optimistic updates
  const deleteDocuments = useCallback(
    async (
      documentIds: string[],
    ): Promise<{ succeeded: string[]; failed: string[] }> => {
      const results = await Promise.all(
        documentIds.map((id) => deleteDocument(id)),
      );

      return {
        succeeded: results.filter((r) => r.success).map((r) => r.documentId),
        failed: results.filter((r) => !r.success).map((r) => r.documentId),
      };
    },
    [deleteDocument],
  );

  const clearDeleteError = useCallback(() => {
    setDeleteError(null);
  }, []);

  const isDeleting = (documentId: string) => deleting.has(documentId);

  return {
    docs,
    loading,
    error,
    refetch,
    // Delete operations
    deleteDocument,
    deleteDocuments,
    deleteError,
    clearDeleteError,
    isDeleting,
    deletingCount: deleting.size,
  };
}
