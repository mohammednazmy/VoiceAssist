import { useEffect, useState } from "react";
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
}

export function useIndexingJobs() {
  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // API path from ADMIN_PANEL_SPECS.md: GET /api/admin/kb/jobs
        // Returns APIEnvelope<IndexingJob[]> - fetchAPI unwraps to IndexingJob[]
        const data = await fetchAPI<IndexingJob[]>("/api/admin/kb/jobs");
        if (!cancelled) setJobs(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.warn("Falling back to demo indexing jobs:", message);
        if (!cancelled) {
          setError({ code: "demo", message });
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
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { jobs, loading, error };
}
