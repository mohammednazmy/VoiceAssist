import { useState, useCallback, useRef } from "react";
import { getApiClient } from "../lib/apiClient";
import type { AxiosError } from "axios";

export interface UploadResult {
  ok: boolean;
  source: string;
  title: string;
  author: string;
  chunks: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  stage: "uploading" | "processing" | "complete" | "error";
  attempt?: number;
  maxAttempts?: number;
}

interface UploadState {
  file: File;
  title?: string;
  author?: string;
  attempt: number;
  lastError?: string;
}

interface UseKBUploadOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Retry on these status codes (default: [500, 502, 503, 504]) */
  retryOnStatus?: number[];
}

interface UseKBUploadReturn {
  uploadDocument: (
    file: File,
    title?: string,
    author?: string,
    onProgress?: (progress: UploadProgress) => void,
  ) => Promise<UploadResult>;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
  // Retry functionality
  canRetry: boolean;
  retryUpload: (
    onProgress?: (progress: UploadProgress) => void,
  ) => Promise<UploadResult>;
  currentAttempt: number;
  maxAttempts: number;
  // Cancel functionality
  cancelUpload: () => void;
}

export function useKBUpload(
  options: UseKBUploadOptions = {},
): UseKBUploadReturn {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryOnStatus = [500, 502, 503, 504],
  } = options;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadState | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const performUpload = useCallback(
    async (
      file: File,
      title: string | undefined,
      author: string | undefined,
      attempt: number,
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<UploadResult> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name.replace(/\.[^/.]+$/, ""));
      formData.append("author", author || "");

      const apiClient = getApiClient();

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const response = await apiClient.request<UploadResult>({
        method: "POST",
        url: "/api/admin/kb/documents",
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
        signal: abortControllerRef.current.signal,
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress({
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percent,
              stage: percent < 100 ? "uploading" : "processing",
              attempt,
              maxAttempts: maxRetries,
            });
          }
        },
      });

      return response;
    },
    [maxRetries],
  );

  const uploadWithRetry = useCallback(
    async (
      file: File,
      title: string | undefined,
      author: string | undefined,
      startAttempt: number,
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<UploadResult> => {
      let lastError: Error | null = null;

      for (let attempt = startAttempt; attempt <= maxRetries; attempt++) {
        if (isCancelledRef.current) {
          throw new Error("Upload cancelled");
        }

        // Update state for retry tracking
        setLastUpload({ file, title, author, attempt });

        try {
          const result = await performUpload(
            file,
            title,
            author,
            attempt,
            onProgress,
          );

          // Success - notify progress
          onProgress?.({
            loaded: file.size,
            total: file.size,
            percent: 100,
            stage: "complete",
            attempt,
            maxAttempts: maxRetries,
          });

          return result;
        } catch (err) {
          const axiosError = err as AxiosError<{ detail?: string }>;

          // Check if we should retry
          const status = axiosError.response?.status;
          const shouldRetry =
            attempt < maxRetries &&
            !isCancelledRef.current &&
            (!status || retryOnStatus.includes(status));

          if (!shouldRetry) {
            // Final error - extract message
            let message = "Upload failed";

            if (axiosError.response) {
              const detail = axiosError.response.data?.detail;

              if (status === 415) {
                message =
                  detail ||
                  "Unsupported file type. Only PDF, .txt, and .md files are accepted.";
              } else if (status === 413) {
                message = detail || "File is too large. Maximum size is 50 MB.";
              } else if (status === 401) {
                message = "Unauthorized. Please check your credentials.";
              } else if (detail) {
                message = detail;
              } else if (status) {
                message = `Upload failed with status ${status}`;
              }
            } else if (err instanceof Error) {
              message = err.message;
            }

            lastError = new Error(message);
            setLastUpload((prev) =>
              prev ? { ...prev, lastError: message } : null,
            );
            break;
          }

          // Notify about retry
          onProgress?.({
            loaded: 0,
            total: file.size,
            percent: 0,
            stage: "error",
            attempt,
            maxAttempts: maxRetries,
          });

          // Wait before retry with exponential backoff
          await sleep(retryDelay * Math.pow(2, attempt - 1));
        }
      }

      throw lastError || new Error("Upload failed after retries");
    },
    [maxRetries, retryDelay, retryOnStatus, performUpload],
  );

  const uploadDocument = useCallback(
    async (
      file: File,
      title?: string,
      author?: string,
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<UploadResult> => {
      setIsUploading(true);
      setError(null);
      isCancelledRef.current = false;

      try {
        return await uploadWithRetry(file, title, author, 1, onProgress);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsUploading(false);
        abortControllerRef.current = null;
      }
    },
    [uploadWithRetry],
  );

  // Retry from the last failed upload
  const retryUpload = useCallback(
    async (
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<UploadResult> => {
      if (!lastUpload) {
        throw new Error("No upload to retry");
      }

      setIsUploading(true);
      setError(null);
      isCancelledRef.current = false;

      try {
        // Start from attempt 1 again on manual retry
        return await uploadWithRetry(
          lastUpload.file,
          lastUpload.title,
          lastUpload.author,
          1,
          onProgress,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsUploading(false);
        abortControllerRef.current = null;
      }
    },
    [lastUpload, uploadWithRetry],
  );

  const cancelUpload = useCallback(() => {
    isCancelledRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  return {
    uploadDocument,
    isUploading,
    error,
    clearError,
    // Retry functionality
    canRetry: !!lastUpload && !isUploading,
    retryUpload,
    currentAttempt: lastUpload?.attempt ?? 0,
    maxAttempts: maxRetries,
    // Cancel functionality
    cancelUpload,
  };
}
