/**
 * useDocuments Hook
 * Provides document management operations for user-uploaded documents
 *
 * Features:
 * - List user's documents with status tracking
 * - Upload documents with progress callback
 * - Poll for processing status
 * - Delete and visibility management
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useAuth } from "./useAuth";
import type {
  UserDocument,
  UserDocumentUploadResponse,
  UserDocumentStatusResponse,
} from "@voiceassist/api-client";

export interface UseDocumentsOptions {
  /** Include public documents from other users */
  includePublic?: boolean;
  /** Auto-poll for processing status */
  autoPoll?: boolean;
  /** Poll interval in ms (default: 3000) */
  pollInterval?: number;
  /** Category filter */
  category?: string;
}

export interface UseDocumentsResult {
  /** List of user documents */
  documents: UserDocument[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Document IDs currently processing */
  processingIds: Set<string>;

  /** Refresh document list */
  refresh: () => Promise<void>;
  /** Upload a document */
  uploadDocument: (
    file: File,
    title?: string,
    category?: string,
    isPublic?: boolean,
    onProgress?: (progress: number) => void
  ) => Promise<UserDocumentUploadResponse>;
  /** Delete a document */
  deleteDocument: (documentId: string) => Promise<void>;
  /** Update document visibility */
  updateVisibility: (documentId: string, isPublic: boolean) => Promise<void>;
  /** Get document status */
  getDocumentStatus: (documentId: string) => Promise<UserDocumentStatusResponse>;
}

export function useDocuments(
  options: UseDocumentsOptions = {}
): UseDocumentsResult {
  const {
    includePublic = true,
    autoPoll = true,
    pollInterval = 3000,
    category,
  } = options;

  const { apiClient } = useAuth();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch documents
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.getUserDocuments(
        0,
        100,
        category,
        includePublic
      );
      setDocuments(result.documents);

      // Track processing documents
      const processing = new Set<string>();
      for (const doc of result.documents) {
        if (doc.indexing_status === "processing") {
          processing.add(doc.document_id);
        }
      }
      setProcessingIds(processing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, category, includePublic]);

  // Poll for processing status
  useEffect(() => {
    if (!autoPoll || processingIds.size === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      const updatedIds = new Set<string>();

      for (const docId of processingIds) {
        try {
          const status = await apiClient.getUserDocumentStatus(docId);

          if (status.status !== "processing") {
            // Update document in list
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.document_id === docId
                  ? {
                      ...doc,
                      indexing_status: status.status as
                        | "processing"
                        | "indexed"
                        | "failed",
                      chunks_indexed: status.chunks_indexed,
                      indexing_error: status.error,
                      total_pages: status.total_pages,
                      has_toc: status.has_toc,
                      has_figures: status.has_figures,
                    }
                  : doc
              )
            );
          } else {
            updatedIds.add(docId);
          }
        } catch (err) {
          console.error(`Failed to poll status for ${docId}:`, err);
          updatedIds.add(docId);
        }
      }

      setProcessingIds(updatedIds);
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [autoPoll, processingIds, pollInterval, apiClient]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Upload document
  const uploadDocument = useCallback(
    async (
      file: File,
      title?: string,
      uploadCategory?: string,
      isPublic?: boolean,
      onProgress?: (progress: number) => void
    ): Promise<UserDocumentUploadResponse> => {
      const result = await apiClient.uploadUserDocument(
        file,
        title,
        uploadCategory || category || "general",
        isPublic || false,
        onProgress
      );

      // Add new document to list
      const newDoc: UserDocument = {
        document_id: result.document_id,
        title: result.title,
        source_type: `user_${uploadCategory || category || "general"}`,
        filename: file.name,
        file_type: file.name.split(".").pop() || null,
        total_pages: null,
        has_toc: false,
        has_figures: false,
        is_public: isPublic || false,
        chunks_indexed: 0,
        indexing_status: "processing",
        indexing_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setProcessingIds((prev) => new Set([...prev, result.document_id]));

      return result;
    },
    [apiClient, category]
  );

  // Delete document
  const deleteDocument = useCallback(
    async (documentId: string): Promise<void> => {
      await apiClient.deleteUserDocument(documentId);
      setDocuments((prev) =>
        prev.filter((doc) => doc.document_id !== documentId)
      );
      setProcessingIds((prev) => {
        const updated = new Set(prev);
        updated.delete(documentId);
        return updated;
      });
    },
    [apiClient]
  );

  // Update visibility
  const updateVisibility = useCallback(
    async (documentId: string, isPublic: boolean): Promise<void> => {
      await apiClient.updateUserDocumentVisibility(documentId, isPublic);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.document_id === documentId ? { ...doc, is_public: isPublic } : doc
        )
      );
    },
    [apiClient]
  );

  // Get document status
  const getDocumentStatus = useCallback(
    async (documentId: string): Promise<UserDocumentStatusResponse> => {
      return await apiClient.getUserDocumentStatus(documentId);
    },
    [apiClient]
  );

  return {
    documents,
    isLoading,
    error,
    processingIds,
    refresh,
    uploadDocument,
    deleteDocument,
    updateVisibility,
    getDocumentStatus,
  };
}
