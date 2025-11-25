/**
 * FileUploadZone Component
 * Drag-and-drop file upload zone with file validation
 */

import { useCallback, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@voiceassist/ui";

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  disabled?: boolean;
}

const DEFAULT_ACCEPTED_TYPES = [
  ".pdf",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".doc",
  ".docx",
];

const DEFAULT_MAX_SIZE_MB = 10;

export function FileUploadZone({
  onFilesSelected,
  maxFiles = 5,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  disabled = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = useCallback(
    (files: FileList | File[]): { valid: File[]; errors: string[] } => {
      const fileArray = Array.from(files);
      const valid: File[] = [];
      const errors: string[] = [];

      if (fileArray.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return { valid: [], errors };
      }

      fileArray.forEach((file) => {
        // Check file size
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
          errors.push(`${file.name}: File too large (max ${maxSizeMB}MB)`);
          return;
        }

        // Check file type
        const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
        if (!acceptedTypes.includes(extension)) {
          errors.push(
            `${file.name}: File type not allowed. Allowed: ${acceptedTypes.join(", ")}`,
          );
          return;
        }

        valid.push(file);
      });

      return { valid, errors };
    },
    [maxFiles, maxSizeMB, acceptedTypes],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if leaving the drop zone itself
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const { valid, errors } = validateFiles(files);

        if (errors.length > 0) {
          setError(errors[0]); // Show first error
          setTimeout(() => setError(null), 5000);
        }

        if (valid.length > 0) {
          onFilesSelected(valid);
          setError(null);
        }
      }
    },
    [disabled, validateFiles, onFilesSelected],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const { valid, errors } = validateFiles(files);

        if (errors.length > 0) {
          setError(errors[0]);
          setTimeout(() => setError(null), 5000);
        }

        if (valid.length > 0) {
          onFilesSelected(valid);
          setError(null);
        }
      }

      // Reset input
      e.target.value = "";
    },
    [validateFiles, onFilesSelected],
  );

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
          disabled
            ? "border-neutral-200 bg-neutral-50 cursor-not-allowed"
            : isDragging
              ? "border-primary-500 bg-primary-50"
              : "border-neutral-300 hover:border-neutral-400 cursor-pointer"
        }`}
      >
        <input
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={handleFileInput}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Upload files"
        />

        <div className="flex flex-col items-center justify-center text-center">
          {/* Icon */}
          <div
            className={`w-12 h-12 mb-3 rounded-full flex items-center justify-center ${
              disabled
                ? "bg-neutral-200"
                : isDragging
                  ? "bg-primary-100"
                  : "bg-neutral-100"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`w-6 h-6 ${
                disabled
                  ? "text-neutral-400"
                  : isDragging
                    ? "text-primary-600"
                    : "text-neutral-600"
              }`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          {/* Text */}
          <p
            className={`text-sm font-medium mb-1 ${
              disabled ? "text-neutral-400" : "text-neutral-700"
            }`}
          >
            {isDragging ? "Drop files here" : "Drop files or click to browse"}
          </p>
          <p className="text-xs text-neutral-500">
            Max {maxFiles} files, {maxSizeMB}MB each
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            {acceptedTypes.join(", ")}
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
