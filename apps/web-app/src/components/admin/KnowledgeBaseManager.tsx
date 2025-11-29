/**
 * Knowledge Base Manager
 * Upload, manage, and index documents for RAG
 *
 * Phase 8.3: Added document preview modal
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "@voiceassist/ui";
import type {
  AdminKBDocument,
  AdminKBDocumentDetail,
} from "@voiceassist/api-client";

interface Document {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  size: number;
  uploadedAt: string;
  status: "indexed" | "processing" | "failed";
  chunks?: number;
}

interface DocumentPreview {
  detail: AdminKBDocumentDetail;
  isLoading: boolean;
}

/** Convert API document to local Document type */
function apiDocToLocal(doc: AdminKBDocument): Document {
  return {
    id: doc.document_id,
    title: doc.title,
    filename: doc.title, // API doesn't return filename in list, use title
    fileType: doc.source_type,
    size: 0, // Not available in list response
    uploadedAt: doc.upload_date,
    status: "indexed",
    chunks: doc.chunks_indexed,
  };
}

/** Convert detailed API document to local Document type */
function _apiDetailToLocal(doc: AdminKBDocumentDetail): Document {
  const metadata = doc.metadata as { file_size?: number } | undefined;
  return {
    id: doc.document_id,
    title: doc.title,
    filename: doc.filename,
    fileType: doc.file_type,
    size: metadata?.file_size ?? 0,
    uploadedAt: doc.created_at,
    status:
      doc.indexing_status === "indexed"
        ? "indexed"
        : doc.indexing_status === "processing"
          ? "processing"
          : "failed",
    chunks: doc.chunks_indexed,
  };
}

export function KnowledgeBaseManager() {
  const { apiClient } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Phase 8.3: Preview state
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      setError(null);
      const response = await apiClient.getAdminKBDocuments(0, 100);
      const localDocs = response.documents.map(apiDocToLocal);
      setDocuments(localDocs);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load documents:", err);
      setError(err instanceof Error ? err.message : "Failed to load documents");
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        await apiClient.uploadAdminKBDocument(
          file,
          undefined, // Use filename as title
          "uploaded",
          (progress) => setUploadProgress(progress),
        );
      }

      await loadDocuments();
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      setError(null);
      await apiClient.deleteAdminKBDocument(id);
      // Remove from local state immediately for better UX
      setDocuments((docs) => docs.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleReindex = async (id: string) => {
    // TODO: Backend doesn't have reindex endpoint yet
    // When implemented, call: await apiClient.reindexAdminKBDocument(id);
    setError(
      `Reindex for document ${id} is not yet implemented. Delete and re-upload the document to reindex.`,
    );
  };

  // Phase 8.3: Preview document
  const handlePreview = async (docId: string) => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      const detail = await apiClient.getAdminKBDocument(docId);
      setPreview({ detail, isLoading: false });
    } catch (err) {
      console.error("Failed to load document preview:", err);
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const closePreview = () => {
    setPreview(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const getStatusBadge = (status: Document["status"]) => {
    switch (status) {
      case "indexed":
        return (
          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            Indexed
          </span>
        );
      case "processing":
        return (
          <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">
            Processing...
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
            Failed
          </span>
        );
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Knowledge Base
          </h1>
          <p className="text-sm text-neutral-600">
            Manage medical documents for RAG system
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
            multiple
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <span
              className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all h-10 px-4 py-2 text-base bg-primary-600 text-white hover:bg-primary-700 ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {uploadProgress > 0 ? `${uploadProgress}%` : "Uploading..."}
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 mr-2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Upload Documents
                </>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Total Documents</p>
          <p className="text-2xl font-bold text-neutral-900">
            {documents.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Indexed Chunks</p>
          <p className="text-2xl font-bold text-neutral-900">
            {documents
              .reduce((sum, doc) => sum + (doc.chunks || 0), 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-neutral-600">Total Storage</p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatFileSize(documents.reduce((sum, doc) => sum + doc.size, 0))}
          </p>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Chunks
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-neutral-500"
                  >
                    {searchQuery
                      ? "No documents found"
                      : "No documents uploaded yet"}
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-8 h-8 text-red-500 mr-3"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {doc.title}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {doc.filename}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                    <td className="px-6 py-4 text-sm text-neutral-900">
                      {formatFileSize(doc.size)}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-900">
                      {doc.chunks?.toLocaleString() || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handlePreview(doc.id)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        disabled={isLoadingPreview}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Reindex
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 8.3: Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">
                Document Preview
              </h3>
              <button
                onClick={closePreview}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Document Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Title
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {preview.detail.title}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Filename
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {preview.detail.filename}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    File Type
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {preview.detail.file_type}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Source Type
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {preview.detail.source_type}
                  </p>
                </div>
              </div>

              {/* Indexing Status */}
              <div className="bg-neutral-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-neutral-700 mb-3">
                  Indexing Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500">Status</p>
                    <p
                      className={`text-sm font-medium ${
                        preview.detail.indexing_status === "indexed"
                          ? "text-green-600"
                          : preview.detail.indexing_status === "processing"
                            ? "text-yellow-600"
                            : "text-red-600"
                      }`}
                    >
                      {preview.detail.indexing_status}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Chunks Indexed</p>
                    <p className="text-sm font-medium text-neutral-900">
                      {preview.detail.chunks_indexed?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Total Tokens</p>
                    <p className="text-sm font-medium text-neutral-900">
                      {preview.detail.total_tokens?.toLocaleString() || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Document ID</p>
                    <p className="text-sm font-mono text-neutral-600">
                      {preview.detail.document_id.substring(0, 16)}...
                    </p>
                  </div>
                </div>

                {preview.detail.indexing_error && (
                  <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
                    <p className="text-xs font-medium text-red-700 mb-1">
                      Indexing Error
                    </p>
                    <p className="text-sm text-red-600">
                      {preview.detail.indexing_error}
                    </p>
                  </div>
                )}
              </div>

              {/* Metadata */}
              {preview.detail.metadata &&
                Object.keys(preview.detail.metadata).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">
                      Metadata
                    </h4>
                    <div className="bg-neutral-50 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-xs text-neutral-700 whitespace-pre-wrap">
                        {JSON.stringify(preview.detail.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-200">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Created
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {new Date(preview.detail.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    Updated
                  </label>
                  <p className="text-sm text-neutral-900 mt-1">
                    {new Date(preview.detail.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end space-x-3">
              <button
                onClick={closePreview}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Preview Overlay */}
      {isLoadingPreview && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-neutral-700">
                Loading preview...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
