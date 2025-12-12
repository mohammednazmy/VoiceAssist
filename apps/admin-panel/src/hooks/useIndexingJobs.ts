import { useEffect, useState, useCallback, useRef } from "react";
import type { APIErrorShape } from "../types";
import { fetchAPI } from "../lib/api";

// Simplified IndexingJob for admin list view
// Full canonical definition in DATA_MODEL.md includes 20+ fields:
// userId, docKey, status, progress, currentStep, totalChunks, processedChunks,
// retryCount, maxRetries, errorMessage, errorDetails, supersededBy,
// startedAt, completedAt, failedAt, createdAt, updatedAt
export interface IndexingJob {
  id: string;
  documentId: string;
  state: "pending" | "running" | "completed" | "failed" | "superseded";
  attempts: number; // Maps to 'retryCount' in canonical model
  progress?: number; // 0-100
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

interface UseIndexingJobsOptions {
  /** Polling interval in ms when there are active jobs (default: 5000 = 5 seconds) */
  pollingInterval?: number;
  /** Enable auto-polling when jobs are running (default: true) */
  autoPolling?: boolean;
  /** Enable the jobs feature - set to true when /api/admin/kb/jobs endpoint exists (default: false) */
  enabled?: boolean;
}

export function useIndexingJobs(options: UseIndexingJobsOptions = {}) {
  const { pollingInterval = 5000, autoPolling = true, enabled = false } = options;

  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Check if there are any active (running/pending) jobs
  const hasActiveJobs = jobs.some(
    (job) => job.state === "running" || job.state === "pending",
  );

  const load = useCallback(
    async (showLoading = true) => {
      // Skip API call if feature is disabled (endpoint doesn't exist yet)
      if (!enabled) {
        setJobs([]);
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      setError(null);

      try {
        // API path from ADMIN_PANEL_SPECS.md: GET /api/admin/kb/jobs
        // Returns APIEnvelope<IndexingJob[]> - fetchAPI unwraps to IndexingJob[]
        const rawData = await fetchAPI<any[]>("/api/admin/kb/jobs");
        // Map snake_case API response to camelCase interface
        const mappedData: IndexingJob[] = (rawData || []).map((job) => ({
          id: job.id,
          documentId: job.document_id || job.documentId,
          state: job.state,
          attempts: job.attempts || 1,
          progress: job.progress,
          errorMessage: job.error_message || job.errorMessage,
          startedAt: job.started_at || job.startedAt,
          completedAt: job.completed_at || job.completedAt,
        }));
        if (isMountedRef.current) {
          setJobs(mappedData);
          setLastFetched(new Date());
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        // Jobs endpoint may not exist - this is normal, just return empty list
        if (isMountedRef.current) {
          setError({ code: "not_available", message });
          // Don't show demo data - just show empty list
          setJobs([]);
        }
      } finally {
        if (isMountedRef.current && showLoading) setLoading(false);
      }
    },
    [enabled],
  );

  // Manual refetch
  const refetch = useCallback(() => {
    return load(true);
  }, [load]);

  // Silent refresh (no loading indicator)
  const silentRefresh = useCallback(() => {
    return load(false);
  }, [load]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    load(true);

    return () => {
      isMountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-polling when there are active jobs
  useEffect(() => {
    if (!autoPolling || !hasActiveJobs) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      silentRefresh();
    }, pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoPolling, hasActiveJobs, pollingInterval, silentRefresh]);

  // Cancel a running job
  const cancelJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      setActionLoading((prev) => new Set(prev).add(jobId));
      setActionError(null);

      try {
        await fetchAPI(`/api/admin/kb/jobs/${jobId}/cancel`, {
          method: "POST",
        });

        // Optimistic update
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId ? { ...job, state: "failed" as const } : job,
          ),
        );

        // Refresh to get accurate state
        await silentRefresh();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel job";
        setActionError(message);
        return false;
      } finally {
        if (isMountedRef.current) {
          setActionLoading((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
        }
      }
    },
    [silentRefresh],
  );

  // Retry a failed job
  const retryJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      setActionLoading((prev) => new Set(prev).add(jobId));
      setActionError(null);

      try {
        await fetchAPI(`/api/admin/kb/jobs/${jobId}/retry`, {
          method: "POST",
        });

        // Optimistic update
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  state: "pending" as const,
                  attempts: job.attempts + 1,
                }
              : job,
          ),
        );

        // Refresh to get accurate state
        await silentRefresh();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to retry job";
        setActionError(message);
        return false;
      } finally {
        if (isMountedRef.current) {
          setActionLoading((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
        }
      }
    },
    [silentRefresh],
  );

  // Get job by ID
  const getJob = useCallback(
    (jobId: string) => jobs.find((job) => job.id === jobId),
    [jobs],
  );

  // Get jobs by document ID
  const getJobsByDocument = useCallback(
    (documentId: string) => jobs.filter((job) => job.documentId === documentId),
    [jobs],
  );

  // Filter helpers
  const activeJobs = jobs.filter(
    (job) => job.state === "running" || job.state === "pending",
  );
  const completedJobs = jobs.filter((job) => job.state === "completed");
  const failedJobs = jobs.filter((job) => job.state === "failed");

  const clearActionError = useCallback(() => {
    setActionError(null);
  }, []);

  const isActionLoading = (jobId: string) => actionLoading.has(jobId);

  return {
    jobs,
    loading,
    error,
    refetch,
    silentRefresh,
    lastFetched,
    // Polling state
    hasActiveJobs,
    isPolling: hasActiveJobs && autoPolling,
    // Job actions
    cancelJob,
    retryJob,
    actionError,
    clearActionError,
    isActionLoading,
    // Helpers
    getJob,
    getJobsByDocument,
    activeJobs,
    completedJobs,
    failedJobs,
    // Stats
    stats: {
      total: jobs.length,
      active: activeJobs.length,
      completed: completedJobs.length,
      failed: failedJobs.length,
    },
  };
}
