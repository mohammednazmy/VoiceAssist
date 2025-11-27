import { useState, useMemo, useEffect } from 'react';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, onProgress: (value: number) => void) => Promise<void>;
  maxSizeMb?: number;
  acceptedTypes?: string[];
}

interface PendingFile {
  file: File;
  error?: string;
  progress: number;
}

const DEFAULT_ACCEPTED = ['application/pdf', 'text/plain'];

export function UploadDialog({
  open,
  onClose,
  onUpload,
  maxSizeMb = 25,
  acceptedTypes = DEFAULT_ACCEPTED,
}: UploadDialogProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPendingFiles([]);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  const typeLabels = useMemo(
    () => acceptedTypes.map((t) => t.replace('application/', '').replace('text/', '')).join(', '),
    [acceptedTypes],
  );

  const validateFiles = (files: FileList | null) => {
    if (!files) return [] as PendingFile[];
    const maxBytes = maxSizeMb * 1024 * 1024;
    return Array.from(files).map((file) => {
      if (file.size > maxBytes) {
        return {
          file,
          progress: 0,
          error: `File exceeds ${maxSizeMb}MB limit`,
        } satisfies PendingFile;
      }
      if (acceptedTypes.length && !acceptedTypes.includes(file.type)) {
        return {
          file,
          progress: 0,
          error: `Unsupported type (${file.type || 'unknown'})`,
        } satisfies PendingFile;
      }
      return { file, progress: 0 } satisfies PendingFile;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const validated = validateFiles(e.target.files);
    setPendingFiles(validated);
    setSubmitError(null);
  };

  const hasBlockingErrors = useMemo(
    () => pendingFiles.some((pf) => Boolean(pf.error)),
    [pendingFiles],
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const submitFiles = async () => {
    if (!pendingFiles.length || hasBlockingErrors) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      for (const pending of pendingFiles) {
        await onUpload(pending.file, (value) => {
          setPendingFiles((prev) =>
            prev.map((p) =>
              p.file.name === pending.file.name
                ? { ...p, progress: value }
                : p,
            ),
          );
        });
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Upload documents</h3>
            <p className="text-sm text-slate-400">PDF and TXT files up to {maxSizeMb}MB.</p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-200"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close upload dialog"
          >
            ✕
          </button>
        </div>

        <label
          className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
            hasBlockingErrors
              ? 'border-amber-700/80 bg-amber-950/40 text-amber-200'
              : 'border-slate-700 hover:border-slate-500 text-slate-300'
          }`}
        >
          <input
            type="file"
            className="hidden"
            multiple
            accept={acceptedTypes.join(',')}
            onChange={handleFileChange}
            disabled={submitting}
          />
          <div className="text-sm font-medium">Drop files or click to select</div>
          <div className="text-xs text-slate-500 mt-1">Accepted: {typeLabels}</div>
        </label>

        {pendingFiles.length > 0 && (
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {pendingFiles.map((pf) => (
              <div
                key={pf.file.name}
                className="border border-slate-800 rounded-md p-3 bg-slate-950/60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{pf.file.name}</div>
                    <div className="text-xs text-slate-500">{formatSize(pf.file.size)}</div>
                  </div>
                  {pf.error ? (
                    <span className="text-xs text-amber-400">{pf.error}</span>
                  ) : (
                    <span className="text-xs text-slate-400">{Math.round(pf.progress)}%</span>
                  )}
                </div>
                {!pf.error && (
                  <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(100, pf.progress)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {submitError && (
          <div className="text-sm text-amber-300 bg-amber-950/40 border border-amber-900 rounded-md p-3">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            className="px-4 py-2 text-sm text-slate-300 hover:text-white"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              hasBlockingErrors || pendingFiles.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } ${submitting ? 'opacity-80' : ''}`}
            onClick={submitFiles}
            disabled={hasBlockingErrors || pendingFiles.length === 0 || submitting}
          >
            {submitting ? 'Uploading…' : 'Start upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
