/**
 * ChatAttachmentUpload Component
 * Handles file selection for message attachments (different from KB document upload)
 * Files are NOT uploaded immediately - they're sent after the message is created
 */

import { useState, useRef, useCallback } from "react";

export interface PendingFile {
  file: File;
  id: string; // Local temp ID
  preview?: string;
}

export interface ChatAttachmentUploadProps {
  onFilesSelected: (files: PendingFile[]) => void;
  onFileRemoved?: (fileId: string) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string;
  disabled?: boolean;
  selectedFiles?: PendingFile[];
}

export function ChatAttachmentUpload({
  onFilesSelected,
  onFileRemoved,
  maxFiles = 5,
  maxSizeMB = 10,
  accept = ".pdf,.png,.jpg,.jpeg,.txt,.md,.doc,.docx",
  disabled = false,
  selectedFiles = [],
}: ChatAttachmentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const filesToAdd = Array.from(files);

      // Validate file count
      if (selectedFiles.length + filesToAdd.length > maxFiles) {
        alert(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Validate file sizes
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      const oversizedFiles = filesToAdd.filter((f) => f.size > maxSizeBytes);
      if (oversizedFiles.length > 0) {
        alert(
          `Files too large (max ${maxSizeMB}MB): ${oversizedFiles.map((f) => f.name).join(", ")}`,
        );
        return;
      }

      // Convert to PendingFile objects
      const pendingFiles: PendingFile[] = [];
      for (const file of filesToAdd) {
        let preview: string | undefined;
        try {
          preview = await generatePreview(file);
        } catch {
          // Not an image, no preview needed
        }

        pendingFiles.push({
          file,
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          preview,
        });
      }

      onFilesSelected([...selectedFiles, ...pendingFiles]);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      disabled,
      maxFiles,
      maxSizeMB,
      selectedFiles,
      onFilesSelected,
      generatePreview,
    ],
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      const updatedFiles = selectedFiles.filter((f) => f.id !== fileId);
      onFilesSelected(updatedFiles);
      onFileRemoved?.(fileId);
    },
    [selectedFiles, onFilesSelected, onFileRemoved],
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
            Click to select files
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            PDF, Images, Documents (max {maxSizeMB}MB each)
          </p>
          <p className="text-xs text-neutral-400 mt-1 italic">
            Files will be uploaded when you send the message
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

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700">
            Selected Files ({selectedFiles.length}/{maxFiles})
          </p>
          {selectedFiles.map((pendingFile) => (
            <div
              key={pendingFile.id}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-200 shadow-sm"
            >
              {/* Preview or Icon */}
              {pendingFile.preview ? (
                <img
                  src={pendingFile.preview}
                  alt={pendingFile.file.name}
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
                  {pendingFile.file.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatFileSize(pendingFile.file.size)}
                </p>
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={() => handleRemoveFile(pendingFile.id)}
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
