/**
 * Documents Page
 * Upload and manage medical documents for knowledge base
 * Includes document list with status, voice navigation, and visibility controls
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
} from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@voiceassist/ui";
import { extractErrorMessage } from "@voiceassist/types";
import { useAuth } from "../hooks/useAuth";
import type {
  UserDocument,
  UserDocumentStatusResponse,
} from "@voiceassist/api-client";
import { useKnowledgeBaseQuery } from "../hooks/useKnowledgeBaseQuery";

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  message?: string;
}

// Accepted file types and MIME types for uploads
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md,.doc";
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];
const ACCEPTED_FILE_INPUT = `${ACCEPTED_EXTENSIONS},${ACCEPTED_MIME_TYPES.join(",")}`;

export function DocumentsPage() {
  const { apiClient } = useAuth();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
  });
  const [category, setCategory] = useState("general");
  const [isPublic, setIsPublic] = useState(false);
  const [title, setTitle] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Document list state
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [processingDocIds, setProcessingDocIds] = useState<Set<string>>(
    new Set()
  );

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null);

  // Lightweight KB/RAG query helper (user-facing /api/kb surface)
  const kb = useKnowledgeBaseQuery();

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // Poll for processing documents status
  useEffect(() => {
    if (processingDocIds.size === 0) return;

    const pollInterval = setInterval(async () => {
      const updatedIds = new Set<string>();

      for (const docId of processingDocIds) {
        try {
          const status = await apiClient.getUserDocumentStatus(docId);

          if (status.status !== "processing") {
            // Document finished processing, update the list
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
            // Still processing, keep polling
            updatedIds.add(docId);
          }
        } catch (err) {
          console.error(`Failed to poll status for ${docId}:`, err);
          updatedIds.add(docId); // Keep polling on error
        }
      }

      setProcessingDocIds(updatedIds);
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [processingDocIds, apiClient]);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);

    try {
      const result = await apiClient.getUserDocuments(0, 100, undefined, true);
      setDocuments(result.documents);

      // Track which documents are still processing
      const processing = new Set<string>();
      for (const doc of result.documents) {
        if (doc.indexing_status === "processing") {
          processing.add(doc.document_id);
        }
      }
      setProcessingDocIds(processing);
    } catch (err) {
      setDocumentsError(extractErrorMessage(err));
    } finally {
      setDocumentsLoading(false);
    }
  }, [apiClient]);

  const handleUploadShortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      void handleUpload();
    }
  };

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        setSelectedFiles(Array.from(files));
        setUploadState({ status: "idle", progress: 0 });
      }
    },
    []
  );

  // Check if a file is an accepted type
  const isAcceptedFile = useCallback((file: File): boolean => {
    // Debug logging
    console.log("[DocumentsPage] Checking file:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Check MIME type first
    if (file.type && ACCEPTED_MIME_TYPES.includes(file.type)) {
      console.log("[DocumentsPage] File accepted by MIME type:", file.type);
      return true;
    }

    // Also accept common PDF MIME type variations
    if (file.type && (
      file.type.includes("pdf") ||
      file.type.includes("word") ||
      file.type.includes("text") ||
      file.type.includes("markdown")
    )) {
      console.log("[DocumentsPage] File accepted by MIME type pattern:", file.type);
      return true;
    }

    // Check file extension as fallback (most reliable on macOS)
    if (file.name) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const acceptedExtensions = ["pdf", "docx", "doc", "txt", "md", "markdown"];
      // Only check extension if filename has a dot (has an extension)
      if (file.name.includes(".") && ext && acceptedExtensions.includes(ext)) {
        console.log("[DocumentsPage] File accepted by extension:", ext);
        return true;
      }
    }

    // macOS Finder fallback: Accept files without extension/type if they have reasonable size
    // This handles the case where macOS strips the extension when dragging
    // The backend will validate the actual file type
    if (!file.type && file.name && !file.name.includes(".") && file.size > 100) {
      console.log("[DocumentsPage] File accepted (macOS fallback - no extension, will validate on upload):", file.name);
      return true;
    }

    console.log("[DocumentsPage] File rejected:", file.name, file.type);
    return false;
  }, []);

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set drag inactive if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    // Debug: Log all data transfer info
    console.log("[DocumentsPage] Drop event:", {
      filesCount: e.dataTransfer.files.length,
      itemsCount: e.dataTransfer.items?.length,
      types: e.dataTransfer.types,
    });

    // Try to get files with type info from DataTransferItemList first
    // This often has better MIME type information than the files array
    const filesWithTypes: File[] = [];
    const items = e.dataTransfer.items;

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[DocumentsPage] DataTransferItem ${i}:`, {
          kind: item.kind,
          type: item.type,
        });

        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            // If item has type info but file doesn't, create a new file with the type
            if (item.type && !file.type) {
              const typedFile = new File([file], file.name, { type: item.type });
              console.log(`[DocumentsPage] Created typed file:`, {
                name: typedFile.name,
                type: typedFile.type,
                size: typedFile.size,
              });
              filesWithTypes.push(typedFile);
            } else {
              filesWithTypes.push(file);
            }
          }
        }
      }
    }

    // Fallback to files array if items didn't work
    const droppedFiles = filesWithTypes.length > 0 ? filesWithTypes : Array.from(e.dataTransfer.files);

    if (droppedFiles.length > 0) {
      // Log each file
      droppedFiles.forEach((file, i) => {
        console.log(`[DocumentsPage] Processing file ${i}:`, {
          name: file.name,
          type: file.type,
          size: file.size,
        });
      });

      // Filter for accepted file types
      const acceptedFiles = droppedFiles.filter(isAcceptedFile);

      console.log("[DocumentsPage] Accepted files count:", acceptedFiles.length);

      if (acceptedFiles.length === 0) {
        setUploadState({
          status: "error",
          progress: 0,
          message: "No supported files found. Please upload PDF, DOCX, TXT, or MD files.",
        });
        return;
      }

      if (acceptedFiles.length < droppedFiles.length) {
        console.warn(`Filtered out ${droppedFiles.length - acceptedFiles.length} unsupported files`);
      }

      setSelectedFiles(acceptedFiles);
      setUploadState({ status: "idle", progress: 0 });
    }
  }, [isAcceptedFile]);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setUploadState({ status: "uploading", progress: 0 });

    try {
      // Upload files one by one
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        try {
          const result = await apiClient.uploadUserDocument(
            file,
            title || undefined,
            category,
            isPublic,
            (progress) => {
              const totalProgress =
                ((i + progress / 100) / selectedFiles.length) * 100;
              setUploadState({ status: "uploading", progress: totalProgress });
            }
          );

          // Add the new document to the list
          const newDoc: UserDocument = {
            document_id: result.document_id,
            title: result.title,
            source_type: `user_${category}`,
            filename: file.name,
            file_type: file.name.split(".").pop() || null,
            total_pages: null,
            has_toc: false,
            has_figures: false,
            is_public: isPublic,
            chunks_indexed: 0,
            indexing_status: "processing",
            indexing_error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setDocuments((prev) => [newDoc, ...prev]);
          setProcessingDocIds((prev) => new Set([...prev, result.document_id]));
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}`);
        }
      }

      // Success
      setUploadState({
        status: "success",
        progress: 100,
        message: `Successfully uploaded ${selectedFiles.length} file(s). Processing in background...`,
      });
      setSelectedFiles([]);
      setTitle("");

      // Reset after 3 seconds
      setTimeout(() => {
        setUploadState({ status: "idle", progress: 0 });
      }, 3000);
    } catch (err: unknown) {
      setUploadState({
        status: "error",
        progress: 0,
        message: extractErrorMessage(err),
      });
    }
  }, [selectedFiles, category, isPublic, title, apiClient]);

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeleteInProgress(documentId);

      try {
        await apiClient.deleteUserDocument(documentId);
        setDocuments((prev) =>
          prev.filter((doc) => doc.document_id !== documentId)
        );
        setDeleteConfirmId(null);
      } catch (err) {
        console.error("Failed to delete document:", err);
        alert(`Failed to delete document: ${extractErrorMessage(err)}`);
      } finally {
        setDeleteInProgress(null);
      }
    },
    [apiClient]
  );

  const handleToggleVisibility = useCallback(
    async (documentId: string, currentPublic: boolean) => {
      try {
        await apiClient.updateUserDocumentVisibility(documentId, !currentPublic);
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.document_id === documentId
              ? { ...doc, is_public: !currentPublic }
              : doc
          )
        );
      } catch (err) {
        console.error("Failed to update visibility:", err);
        alert(`Failed to update visibility: ${extractErrorMessage(err)}`);
      }
    },
    [apiClient]
  );

  const handleTalkToDocument = useCallback((document: UserDocument) => {
    // Navigate to chat page with document context for voice navigation
    // The chat page will detect the document param and start a voice document session
    window.location.href = `/chat?document=${document.document_id}&title=${encodeURIComponent(document.title)}`;
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (
    status: string,
    error?: string | null
  ): JSX.Element => {
    switch (status) {
      case "indexed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
            Ready
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            <svg
              className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Processing
          </span>
        );
      case "failed":
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
            title={error || "Processing failed"}
          >
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5"></span>
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            Unknown
          </span>
        );
    }
  };

  const getFileIcon = (filename: string): JSX.Element => {
    const ext = filename.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-8 h-8 text-red-500"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      );
    }

    if (["jpg", "jpeg", "png", "gif"].includes(ext || "")) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-8 h-8 text-blue-500"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
          />
        </svg>
      );
    }

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-8 h-8 text-neutral-500"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    );
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-6 p-6 pb-12"
      onKeyDown={handleUploadShortcut}
    >
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Documents</h1>
        <p className="mt-2 text-neutral-600">
          Upload medical documents to enhance the AI's knowledge base and enable
          voice navigation
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Input with Drag and Drop */}
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <label
              htmlFor="file-upload"
              className="block"
              role="button"
              tabIndex={0}
              aria-label="Choose files to upload or drag and drop"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <div
                className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
                  isDragActive
                    ? "border-primary-500 bg-primary-50 ring-2 ring-primary-200"
                    : "border-border-default hover:border-border-focus bg-surface-input"
                }`}
              >
                <div className="space-y-1 text-center">
                  <svg
                    className={`mx-auto h-12 w-12 ${
                      isDragActive ? "text-primary-500" : "text-neutral-400"
                    }`}
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-neutral-600">
                    {isDragActive ? (
                      <span className="font-medium text-primary-600">
                        Drop files here to upload
                      </span>
                    ) : (
                      <>
                        <span className="relative font-medium text-primary-600 hover:text-primary-500">
                          Choose files
                        </span>
                        <p className="pl-1">or drag and drop</p>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    PDF, DOCX, TXT, MD up to 10MB each
                  </p>
                </div>
              </div>
              <input
                id="file-upload"
                type="file"
                multiple
                accept={ACCEPTED_FILE_INPUT}
                onChange={handleFileSelect}
                ref={fileInputRef}
                className="sr-only"
              />
            </label>
          </div>

          {/* Title Input */}
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="block text-sm font-medium text-neutral-700"
            >
              Title (optional)
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to use filename"
              className="w-full px-3 py-2 border border-border-default rounded-md bg-surface-input text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 focus:ring-offset-background-primary hover:border-border-strong"
            />
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <label
              htmlFor="category"
              className="block text-sm font-medium text-neutral-700"
            >
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-border-default rounded-md bg-surface-input text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 focus:ring-offset-background-primary hover:border-border-strong"
            >
              <option value="general">General Medical</option>
              <option value="cardiology">Cardiology</option>
              <option value="neurology">Neurology</option>
              <option value="pediatrics">Pediatrics</option>
              <option value="surgery">Surgery</option>
              <option value="guidelines">Clinical Guidelines</option>
              <option value="research">Research Papers</option>
            </select>
          </div>

          {/* Visibility Toggle */}
          <div className="flex items-center space-x-3">
            <input
              id="is-public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-default rounded"
            />
            <label
              htmlFor="is-public"
              className="text-sm text-neutral-700"
            >
              Make document public (visible to all users)
            </label>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-900">
                Selected Files ({selectedFiles.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center space-x-3 p-3 bg-neutral-50 rounded-md border border-neutral-200"
                  >
                    {getFileIcon(file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-neutral-400 hover:text-red-600 focus:outline-none"
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
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
                ))}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {uploadState.status === "uploading" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-700">Uploading...</span>
                <span className="text-neutral-600">
                  {Math.round(uploadState.progress)}%
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages */}
          {uploadState.status === "success" && uploadState.message && (
            <div className="p-3 bg-green-50 rounded-md border border-green-200 flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-green-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-green-800">{uploadState.message}</p>
            </div>
          )}

          {uploadState.status === "error" && uploadState.message && (
            <div className="p-3 bg-red-50 rounded-md border border-red-200 flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-red-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <p className="text-sm text-red-800">{uploadState.message}</p>
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={
                selectedFiles.length === 0 || uploadState.status === "uploading"
              }
              size="lg"
              aria-label="Upload selected documents"
              aria-keyshortcuts="Control+U Meta+U"
            >
              {uploadState.status === "uploading"
                ? "Uploading..."
                : "Upload Documents"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Document List Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Your Documents</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDocuments}
            disabled={documentsLoading}
          >
            {documentsLoading ? "Loading..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {documentsError && (
            <div className="p-3 bg-red-50 rounded-md border border-red-200 mb-4">
              <p className="text-sm text-red-800">{documentsError}</p>
            </div>
          )}

          {documentsLoading && documents.length === 0 ? (
            <div className="text-center py-8">
              <svg
                className="animate-spin mx-auto h-8 w-8 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="mt-2 text-sm text-neutral-600">
                Loading documents...
              </p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
                className="mx-auto h-12 w-12 text-neutral-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-neutral-900">
                No documents yet
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                Upload a document to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.document_id}
                  className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors"
                >
                  <div className="flex items-center space-x-4 min-w-0 flex-1">
                    {getFileIcon(doc.filename || doc.title)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-neutral-900 truncate">
                          {doc.title}
                        </h4>
                        {doc.is_public && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            Public
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 mt-1 text-xs text-neutral-500">
                        <span>{formatDate(doc.created_at)}</span>
                        {doc.total_pages && (
                          <span>{doc.total_pages} pages</span>
                        )}
                        {doc.has_toc && (
                          <span className="text-green-600">TOC</span>
                        )}
                        {doc.has_figures && (
                          <span className="text-purple-600">Figures</span>
                        )}
                        <span>{doc.chunks_indexed} chunks</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {getStatusBadge(doc.indexing_status, doc.indexing_error)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {/* Talk to Document Button */}
                    {doc.indexing_status === "indexed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTalkToDocument(doc)}
                        title="Start voice navigation for this document"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4 mr-1"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                          />
                        </svg>
                        Talk
                      </Button>
                    )}

                    {/* Visibility Toggle */}
                    <button
                      onClick={() =>
                        handleToggleVisibility(doc.document_id, doc.is_public)
                      }
                      className="p-2 text-neutral-400 hover:text-neutral-600 focus:outline-none"
                      title={doc.is_public ? "Make private" : "Make public"}
                    >
                      {doc.is_public ? (
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
                            d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                          />
                        </svg>
                      ) : (
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
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Delete Button */}
                    {deleteConfirmId === doc.document_id ? (
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(doc.document_id)}
                          disabled={deleteInProgress === doc.document_id}
                        >
                          {deleteInProgress === doc.document_id
                            ? "..."
                            : "Confirm"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(doc.document_id)}
                        className="p-2 text-neutral-400 hover:text-red-600 focus:outline-none"
                        title="Delete document"
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
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Voice Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 mb-4">
            Once a document is indexed, you can use voice commands to navigate
            and read it:
          </p>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>"Read page 40"</strong> - Jump to and read a specific
                page
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>"Next page / Previous page"</strong> - Navigate
                sequentially
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>"What's in the table of contents?"</strong> - List
                chapters and sections
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>"Describe the figure on this page"</strong> - Get AI
                descriptions of diagrams
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-neutral-500">
            Click the "Talk" button on any indexed document to start a voice
            session.
          </p>
        </CardContent>
      </Card>

      {/* Ask the Knowledge Base (simple KB/RAG UI) */}
      <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ask the Knowledge Base</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">
              Type a question to query your indexed documents via the KB search
              and RAG pipeline.
            </p>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder='e.g. What are the first-line treatments for hypertension?'
              value={kb.question}
              onChange={(e) => kb.setQuestion(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                onClick={() => void kb.runQuery()}
                disabled={kb.isLoading || !kb.question.trim()}
              >
                {kb.isLoading ? "Searching..." : "Ask Knowledge Base"}
              </Button>
              {kb.error && (
                <span className="text-xs text-red-600">{kb.error}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KB Answer &amp; Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {kb.answer ? (
              <div className="space-y-2">
                <p className="text-sm whitespace-pre-line text-neutral-900">
                  {kb.answer}
                </p>
                {kb.sources.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                      Sources
                    </p>
                    <ul className="space-y-1 text-xs text-neutral-700">
                      {kb.sources.map((source) => (
                        <li key={source.id}>
                          <span className="font-medium">{source.title}</span>
                          {source.category && (
                            <span className="ml-1 text-neutral-500">
                              ({source.category})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                KB answers will appear here once you run a query.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
