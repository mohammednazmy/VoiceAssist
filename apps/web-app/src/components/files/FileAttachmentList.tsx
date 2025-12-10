/**
 * FileAttachmentList Component
 * Display list of attached files with preview and remove options
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@voiceassist/ui";

export interface PendingFile {
  file: File;
  id: string;
  progress?: number;
  error?: string;
}

interface FileAttachmentListProps {
  files: PendingFile[];
  onRemove: (fileId: string) => void;
  disabled?: boolean;
}

export function FileAttachmentList({
  files,
  onRemove,
  disabled = false,
}: FileAttachmentListProps) {
  const getFileIcon = (file: File): string => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    switch (extension) {
      case "pdf":
        return "📄";
      case "doc":
      case "docx":
        return "📝";
      case "txt":
      case "md":
        return "📃";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
        return "🖼️";
      default:
        return "📎";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFilePreview = (file: File): string | null => {
    // Check if it's an image
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((pendingFile) => {
        const previewUrl = getFilePreview(pendingFile.file);

        return (
          <div
            key={pendingFile.id}
            className="flex items-center gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-md group hover:bg-neutral-100 transition-colors"
          >
            {/* Preview/Icon */}
            <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-neutral-200 flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={pendingFile.file.name}
                  className="w-full h-full object-cover"
                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                />
              ) : (
                <span className="text-2xl">
                  {getFileIcon(pendingFile.file)}
                </span>
              )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {pendingFile.file.name}
              </p>
              <p className="text-xs text-neutral-500">
                {formatFileSize(pendingFile.file.size)}
              </p>

              {/* Progress Bar */}
              {pendingFile.progress !== undefined &&
                pendingFile.progress < 100 && (
                  <div className="mt-2 w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary-500 h-full transition-all duration-300"
                      style={{ width: `${pendingFile.progress}%` }}
                    />
                  </div>
                )}

              {/* Error */}
              {pendingFile.error && (
                <p className="text-xs text-red-600 mt-1">{pendingFile.error}</p>
              )}
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(pendingFile.id)}
              disabled={disabled}
              className="shrink-0 p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`Remove ${pendingFile.file.name}`}
              title="Remove file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
