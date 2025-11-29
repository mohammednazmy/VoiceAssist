import { useState, useCallback } from "react";
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
}

export function useKBUpload(): UseKBUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadDocument = useCallback(
    async (
      file: File,
      title?: string,
      author?: string,
      onProgress?: (progress: UploadProgress) => void,
    ): Promise<UploadResult> => {
      setIsUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title || file.name.replace(/\.[^/.]+$/, ""));
        formData.append("author", author || "");

        const apiClient = getApiClient();

        // Use the request method with proper config for multipart upload
        const response = await apiClient.request<UploadResult>({
          method: "POST",
          url: "/api/admin/kb/documents",
          data: formData,
          headers: {
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percent = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total,
              );
              onProgress({
                loaded: progressEvent.loaded,
                total: progressEvent.total,
                percent,
              });
            }
          },
        });

        return response;
      } catch (err) {
        let message = "Upload failed";

        // Check if it's an Axios error with a response
        const axiosError = err as AxiosError<{ detail?: string }>;
        if (axiosError.response) {
          const status = axiosError.response.status;
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
          }
        } else if (err instanceof Error) {
          message = err.message;
        }

        setError(message);
        throw new Error(message);
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  return {
    uploadDocument,
    isUploading,
    error,
    clearError,
  };
}
