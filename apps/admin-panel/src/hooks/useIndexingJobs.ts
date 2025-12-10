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
}

export function useIndexingJobs(options: UseIndexingJobsOptions = {}) {
  const { pollingInterval = 5000, autoPolling = true } = options;

  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Check if there are any active (running/pending) jobs
  const hasActiveJobs = jobs.some(
    (job) => job.state === "running" || job.state === "pending",
  );

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);

      try {
        // API path from ADMIN_PANEL_SPECS.md: GET /api/admin/kb/jobs
        // Returns APIEnvelope<IndexingJob[]> - fetchAPI unwraps to IndexingJob[]
        const data = await fetchAPI<IndexingJob[]>("/api/admin/kb/jobs");
        if (isMountedRef.current) {
          setJobs(data);
          setLastFetched(new Date());
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.warn("Falling back to demo indexing jobs:", message);
        if (isMountedRef.current) {
          setError({ code: "demo", message });
          // Only set demo data on initial load
          if (jobs.length === 0) {
            setJobs([
              {
                id: "job-1",
                documentId: "doc-harrisons-hf",
                state: "completed",
                attempts: 1,
              },
              {
                id: "job-2",
                documentId: "doc-aha-2022-hf",
                state: "running",
                attempts: 1,
                progress: 45,
              },
            ]);
          }
        }
      } finally {
        if (isMountedRef.current && showLoading) setLoading(false);
      }
    },
    [jobs.length],
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
