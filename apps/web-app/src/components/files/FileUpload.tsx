/**
 * FileUpload Component
 * Handles file selection, upload progress, and preview
 */

import { useState, useRef, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  preview?: string;
}

export interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  onFileRemoved?: (fileId: string) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFilesUploaded,
  onFileRemoved,
  maxFiles = 5,
  maxSizeMB = 10,
  accept = ".pdf,.png,.jpg,.jpeg,.txt,.md",
  disabled = false,
}: FileUploadProps) {
  const { apiClient } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingFiles, setUploadingFiles] = useState<
    Array<{ file: File; progress: number; error?: string }>
  >([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Generate preview for images
  const generatePreview = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Not an image"));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;

      const filesToUpload = Array.from(files);

      // Validate file count
      if (uploadedFiles.length + filesToUpload.length > maxFiles) {
        alert(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Validate file sizes
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      const oversizedFiles = filesToUpload.filter((f) => f.size > maxSizeBytes);
      if (oversizedFiles.length > 0) {
        alert(
          `Files too large (max ${maxSizeMB}MB): ${oversizedFiles.map((f) => f.name).join(", ")}`,
        );
        return;
      }

      // Initialize upload tracking
      const uploadTracking = filesToUpload.map((file) => ({
        file,
        progress: 0,
      }));
      setUploadingFiles(uploadTracking);

      // Upload files sequentially
      const uploaded: UploadedFile[] = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];

        try {
          // Update progress
          setUploadingFiles((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, progress: 10 } : item,
            ),
          );

          // Upload to backend
          const document = await apiClient.uploadDocument(file, "chat-attachment") as { id: string; url?: string };

          // Update progress
          setUploadingFiles((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, progress: 70 } : item,
            ),
          );

          // Generate preview for images
          let preview: string | undefined;
          try {
            preview = await generatePreview(file);
          } catch {
            // Not an image, no preview needed
          }

          // Update progress
          setUploadingFiles((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, progress: 100 } : item,
            ),
          );

          // Add to uploaded files
          const uploadedFile: UploadedFile = {
            id: document.id,
            name: file.name,
            size: file.size,
            type: file.type,
            url: document.url,
            preview,
          };
          uploaded.push(uploadedFile);
        } catch (error) {
          console.error("Upload failed:", error);
          setUploadingFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    progress: 0,
                    error: "Upload failed. Please try again.",
                  }
                : item,
            ),
          );
        }
      }

      // Clear upload tracking after a delay
      setTimeout(() => setUploadingFiles([]), 2000);

      // Update uploaded files list
      setUploadedFiles((prev) => [...prev, ...uploaded]);
      onFilesUploaded(uploaded);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [apiClient, disabled, maxFiles, maxSizeMB, uploadedFiles.length, onFilesUploaded, generatePreview],
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
      onFileRemoved?.(fileId);
    },
    [onFileRemoved],
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-3">
      {/* Upload Button */}
      <label
        className={`flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
          disabled
            ? "border-neutral-300 bg-neutral-100 cursor-not-allowed"
            : "border-primary-300 hover:border-primary-400 hover:bg-primary-50"
        }`}
      >
        <div className="text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 mx-auto mb-2 text-primary-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm text-neutral-700 font-medium">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            PDF, Images, Text (max {maxSizeMB}MB each)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={disabled}
          accept={accept}
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
      </label>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200"
            >
              <div className="flex-shrink-0">
                {item.error ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5 text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                ) : item.progress === 100 ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5 text-green-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {item.file.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-neutral-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        item.error
                          ? "bg-red-500"
                          : item.progress === 100
                            ? "bg-green-500"
                            : "bg-primary-500"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-500">
                    {item.error ? "Failed" : `${item.progress}%`}
                  </span>
                </div>
                {item.error && (
                  <p className="text-xs text-red-600 mt-1">{item.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700">
            Uploaded Files ({uploadedFiles.length}/{maxFiles})
          </p>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-200 shadow-sm"
            >
              {/* Preview or Icon */}
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="w-12 h-12 object-cover rounded"
                />
              ) : (
                <div className="flex items-center justify-center w-12 h-12 bg-neutral-100 rounded">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6 text-neutral-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </div>
              )}

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatFileSize(file.size)}
                </p>
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={() => handleRemoveFile(file.id)}
                className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                aria-label="Remove file"
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
      )}
    </div>
  );
}
