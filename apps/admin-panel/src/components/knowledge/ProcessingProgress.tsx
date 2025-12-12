/**
 * ProcessingProgress component
 * Shows progress for documents being uploaded and indexed
 */

import { useEffect, useState } from "react";
import type { IndexingJob } from "../../hooks/useIndexingJobs";

interface ProcessingProgressProps {
  jobs: IndexingJob[];
  loading?: boolean;
}

export function ProcessingProgress({ jobs, loading }: ProcessingProgressProps) {
  const [animatedProgress, setAnimatedProgress] = useState<Record<string, number>>({});

  // Animate progress bars smoothly
  useEffect(() => {
    jobs.forEach((job) => {
      const targetProgress = job.progress ?? (job.state === "completed" ? 100 : job.state === "running" ? 50 : 0);
      setAnimatedProgress((prev) => {
        const current = prev[job.id] ?? 0;
        if (current !== targetProgress) {
          // Animate towards target
          const step = Math.sign(targetProgress - current) * Math.max(1, Math.abs(targetProgress - current) / 10);
          return { ...prev, [job.id]: Math.min(100, Math.max(0, current + step)) };
        }
        return prev;
      });
    });
  }, [jobs]);

  // Filter to only show active jobs
  const activeJobs = jobs.filter((job) => job.state === "running" || job.state === "pending");
  const recentCompleted = jobs.filter(
    (job) => job.state === "completed" && job.completedAt &&
    Date.now() - new Date(job.completedAt).getTime() < 30000 // Show completed jobs for 30 seconds
  );
  const failedJobs = jobs.filter((job) => job.state === "failed");

  if (loading && jobs.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 w-40 bg-slate-800 rounded mb-3" />
        <div className="h-2 w-full bg-slate-800 rounded" />
      </div>
    );
  }

  if (activeJobs.length === 0 && recentCompleted.length === 0 && failedJobs.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <svg className="h-4 w-4 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Document Processing
        </h3>
        <span className="text-xs text-slate-500">
          {activeJobs.length} active{recentCompleted.length > 0 && `, ${recentCompleted.length} completed`}
        </span>
      </div>

      <div className="space-y-3">
        {/* Active/Pending Jobs */}
        {activeJobs.map((job) => (
          <JobProgressItem
            key={job.id}
            job={job}
            progress={animatedProgress[job.id] ?? job.progress ?? 0}
          />
        ))}

        {/* Recently Completed Jobs */}
        {recentCompleted.map((job) => (
          <JobProgressItem
            key={job.id}
            job={job}
            progress={100}
            isRecent
          />
        ))}

        {/* Failed Jobs */}
        {failedJobs.slice(0, 3).map((job) => (
          <JobProgressItem
            key={job.id}
            job={job}
            progress={0}
          />
        ))}
      </div>
    </div>
  );
}

interface JobProgressItemProps {
  job: IndexingJob;
  progress: number;
  isRecent?: boolean;
}

function JobProgressItem({ job, progress, isRecent }: JobProgressItemProps) {
  const getStatusColor = () => {
    switch (job.state) {
      case "running":
        return "bg-blue-500";
      case "pending":
        return "bg-amber-500";
      case "completed":
        return "bg-emerald-500";
      case "failed":
        return "bg-rose-500";
      default:
        return "bg-slate-500";
    }
  };

  const getStatusText = () => {
    switch (job.state) {
      case "running":
        return "Indexing...";
      case "pending":
        return "Queued";
      case "completed":
        return "Complete";
      case "failed":
        return "Failed";
      default:
        return job.state;
    }
  };

  return (
    <div className={`border border-slate-800 rounded-lg p-3 ${isRecent ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-2 w-2 rounded-full ${getStatusColor()} ${job.state === "running" ? "animate-pulse" : ""}`} />
          <span className="text-sm text-slate-200 truncate">{job.documentId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{getStatusText()}</span>
          {job.state === "running" && progress > 0 && (
            <span className="text-xs font-medium text-blue-300">{Math.round(progress)}%</span>
          )}
        </div>
      </div>

      {/* Progress bar for running/pending jobs */}
      {(job.state === "running" || job.state === "pending") && (
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${job.state === "running" ? "bg-blue-500" : "bg-amber-500"}`}
            style={{ width: `${job.state === "pending" ? 0 : progress}%` }}
          />
        </div>
      )}

      {/* Success indicator */}
      {job.state === "completed" && (
        <div className="h-1.5 bg-emerald-500 rounded-full" />
      )}

      {/* Error message for failed jobs */}
      {job.state === "failed" && job.errorMessage && (
        <div className="mt-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded px-2 py-1">
          {job.errorMessage}
        </div>
      )}

      {/* Attempt count */}
      {job.attempts > 1 && (
        <div className="mt-1 text-xs text-slate-500">
          Attempt {job.attempts}
        </div>
      )}
    </div>
  );
}
