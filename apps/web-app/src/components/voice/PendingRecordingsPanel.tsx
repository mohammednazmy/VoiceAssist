/**
 * PendingRecordingsPanel Component
 *
 * Displays and manages offline voice recordings waiting to be synced.
 * Features:
 * - List view of pending recordings with metadata
 * - Individual and bulk delete options
 * - Manual sync trigger
 * - Storage quota information
 * - Upload progress tracking
 *
 * @module components/voice/PendingRecordingsPanel
 */

import { useState, useEffect, useCallback } from "react";
import { Button, Card } from "@voiceassist/ui";
import type { OfflineRecording } from "../../hooks/useOfflineVoiceCapture";
import { getStorageQuota } from "../../utils/storageQuota";

interface PendingRecordingsPanelProps {
  /** Function to get pending recordings */
  getPendingRecordings: () => Promise<OfflineRecording[]>;
  /** Function to delete a recording */
  deleteRecording: (id: string) => Promise<void>;
  /** Function to sync all pending recordings */
  syncPendingRecordings: () => Promise<void>;
  /** Whether currently syncing */
  isSyncing?: boolean;
  /** Whether offline */
  isOffline?: boolean;
  /** Callback when panel should close */
  onClose?: () => void;
}

interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format date to relative time or date string
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(date).toLocaleDateString();
}

/**
 * Get status badge color
 */
function getStatusColor(status: OfflineRecording["status"]): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "uploading":
      return "bg-blue-100 text-blue-800";
    case "uploaded":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function PendingRecordingsPanel({
  getPendingRecordings,
  deleteRecording,
  syncPendingRecordings,
  isSyncing = false,
  isOffline = false,
  onClose,
}: PendingRecordingsPanelProps) {
  const [recordings, setRecordings] = useState<OfflineRecording[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Load recordings and storage info
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recs, storage] = await Promise.all([
        getPendingRecordings(),
        getStorageQuota(),
      ]);
      setRecordings(recs);
      setStorageInfo(storage);
    } catch (error) {
      console.error("Failed to load pending recordings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getPendingRecordings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle delete single recording
  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Failed to delete recording:", error);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Handle delete all recordings
  const handleDeleteAll = async () => {
    if (
      !confirm(
        `Delete all ${recordings.length} pending recording(s)? This cannot be undone.`,
      )
    ) {
      return;
    }

    const ids = recordings.map((r) => r.id);
    setDeletingIds(new Set(ids));

    try {
      await Promise.all(ids.map((id) => deleteRecording(id)));
      setRecordings([]);
    } catch (error) {
      console.error("Failed to delete all recordings:", error);
      await loadData(); // Refresh to show actual state
    } finally {
      setDeletingIds(new Set());
    }
  };

  // Handle sync
  const handleSync = async () => {
    await syncPendingRecordings();
    await loadData();
  };

  // Calculate total size
  const totalSize = recordings.reduce(
    (sum, r) => sum + (r.audioBlob?.size || 0),
    0,
  );

  return (
    <Card className="w-full max-w-md">
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">
            Pending Recordings
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-neutral-100 transition-colors"
              aria-label="Close panel"
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
          )}
        </div>

        {/* Storage info */}
        {storageInfo && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
              <span>Storage used</span>
              <span>
                {formatBytes(storageInfo.used)} /{" "}
                {formatBytes(storageInfo.quota)}
              </span>
            </div>
            <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  storageInfo.percentage > 90
                    ? "bg-red-500"
                    : storageInfo.percentage > 70
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-12 h-12 mx-auto mb-2 opacity-50"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
            <p className="text-sm">No pending recordings</p>
          </div>
        ) : (
          <>
            {/* Recordings list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(recording.status)}`}
                      >
                        {recording.status}
                      </span>
                      {recording.retryCount > 0 && (
                        <span className="text-xs text-neutral-500">
                          ({recording.retryCount} retries)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-neutral-600">
                      <span>{formatDuration(recording.duration)}</span>
                      <span>{formatBytes(recording.audioBlob?.size || 0)}</span>
                      <span>{formatDate(recording.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(recording.id)}
                    disabled={deletingIds.has(recording.id)}
                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                    aria-label="Delete recording"
                  >
                    {deletingIds.has(recording.id) ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
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
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Summary and actions */}
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between text-sm text-neutral-600 mb-3">
                <span>
                  {recordings.length} recording{recordings.length !== 1 && "s"}
                </span>
                <span>Total: {formatBytes(totalSize)}</span>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSync}
                  disabled={isSyncing || isOffline || recordings.length === 0}
                  className="flex-1"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : isOffline ? (
                    "Offline"
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
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      Sync All
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDeleteAll}
                  disabled={deletingIds.size > 0 || recordings.length === 0}
                  className="text-red-600 hover:bg-red-50 border-red-200"
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
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </Button>
              </div>

              {isOffline && (
                <p className="mt-2 text-xs text-amber-600">
                  You're offline. Recordings will sync when you reconnect.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default PendingRecordingsPanel;
