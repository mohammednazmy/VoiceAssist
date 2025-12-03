import { useState, useEffect, useCallback } from "react";
import { usePrompts } from "../../hooks/usePrompts";
import type { Prompt, PromptVersion, PromptDiffResponse } from "../../types";
import { StatusBadge, LoadingState } from "../../components/shared";

interface VersionHistoryDrawerProps {
  prompt: Prompt;
  onClose: () => void;
}

export function VersionHistoryDrawer({
  prompt,
  onClose,
}: VersionHistoryDrawerProps) {
  const { getVersions, getDiff, rollbackPrompt } = usePrompts();

  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalVersions, setTotalVersions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Diff state
  const [selectedVersions, setSelectedVersions] = useState<
    [number, number] | null
  >(null);
  const [diff, setDiff] = useState<PromptDiffResponse | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Rollback state
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<PromptVersion | null>(
    null,
  );

  // Load versions (initial load)
  const loadVersions = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      const data = await getVersions(prompt.id, 1, pageSize);
      if (data) {
        setVersions(data.versions);
        setTotalVersions(data.total);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [prompt.id, getVersions, pageSize]);

  // Load more versions (pagination)
  const loadMoreVersions = useCallback(async () => {
    if (loadingMore || versions.length >= totalVersions) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const data = await getVersions(prompt.id, nextPage, pageSize);
      if (data) {
        setVersions((prev) => [...prev, ...data.versions]);
        setCurrentPage(nextPage);
      }
    } catch (err) {
      console.error("Failed to load more versions:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    prompt.id,
    getVersions,
    currentPage,
    pageSize,
    loadingMore,
    versions.length,
    totalVersions,
  ]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // Load diff when versions selected
  useEffect(() => {
    if (!selectedVersions) {
      setDiff(null);
      return;
    }

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const [versionA, versionB] = selectedVersions;
        const data = await getDiff(prompt.id, versionA, versionB);
        setDiff(data);
      } catch (err) {
        console.error("Failed to load diff:", err);
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [selectedVersions, prompt.id, getDiff]);

  // Handle version click for diff
  const handleVersionClick = (version: PromptVersion) => {
    if (!selectedVersions) {
      // First selection - compare with current
      setSelectedVersions([version.version_number, prompt.current_version]);
    } else if (selectedVersions[0] === version.version_number) {
      // Clicking same version - deselect
      setSelectedVersions(null);
    } else {
      // Second selection - compare both
      setSelectedVersions([
        Math.min(selectedVersions[0], version.version_number),
        Math.max(selectedVersions[0], version.version_number),
      ]);
    }
  };

  // Handle rollback
  const handleRollback = async () => {
    if (!rollbackTarget) return;

    setRollingBack(true);
    try {
      await rollbackPrompt(prompt.id, {
        version_number: rollbackTarget.version_number,
        reason: `Rollback to version ${rollbackTarget.version_number}`,
      });
      await loadVersions();
      setRollbackTarget(null);
    } catch (err) {
      console.error("Failed to rollback:", err);
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-slate-900 border-l border-slate-700 flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Version History
            </h3>
            <p className="text-sm text-slate-400">{prompt.display_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6">
              <LoadingState />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-red-400">{error}</p>
              <button
                type="button"
                onClick={loadVersions}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {/* Instructions */}
              <div className="px-6 py-3 bg-slate-800/50 text-xs text-slate-400">
                Click a version to compare with current. Click another to
                compare two versions.
                {selectedVersions && (
                  <button
                    type="button"
                    onClick={() => setSelectedVersions(null)}
                    className="ml-2 text-blue-400 hover:text-blue-300"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {/* Diff View */}
              {diff && (
                <div className="p-4 bg-slate-950 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-slate-200">
                      Comparing v{diff.version_a} → v{diff.version_b}
                    </h4>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-400">
                        +{diff.additions} added
                      </span>
                      <span className="text-red-400">
                        -{diff.deletions} removed
                      </span>
                    </div>
                  </div>
                  {loadingDiff ? (
                    <LoadingState />
                  ) : (
                    <pre className="text-xs font-mono bg-slate-900 p-3 rounded overflow-x-auto max-h-64 overflow-y-auto">
                      {diff.unified_diff.split("\n").map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith("+")
                              ? "text-green-400 bg-green-900/20"
                              : line.startsWith("-")
                                ? "text-red-400 bg-red-900/20"
                                : line.startsWith("@@")
                                  ? "text-blue-400"
                                  : "text-slate-400"
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}

              {/* Version List */}
              {versions.map((version) => {
                const isSelected =
                  selectedVersions?.includes(version.version_number) ?? false;
                const isCurrent =
                  version.version_number === prompt.current_version;

                return (
                  <div
                    key={version.id}
                    className={`px-6 py-4 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-900/30 border-l-2 border-blue-500"
                        : "hover:bg-slate-800/30"
                    }`}
                    onClick={() => handleVersionClick(version)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-200">
                            Version {version.version_number}
                          </span>
                          {isCurrent && (
                            <StatusBadge
                              status="green"
                              label="Current"
                              size="sm"
                              showDot={false}
                            />
                          )}
                          <StatusBadge
                            status={
                              version.status === "published"
                                ? "green"
                                : version.status === "draft"
                                  ? "yellow"
                                  : "purple"
                            }
                            label={version.status}
                            size="sm"
                            showDot={false}
                          />
                        </div>
                        {version.change_summary && (
                          <p className="text-sm text-slate-400 mb-1">
                            {version.change_summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>
                            {new Date(version.created_at).toLocaleString()}
                          </span>
                          {version.changed_by_email && (
                            <span>by {version.changed_by_email}</span>
                          )}
                        </div>
                      </div>

                      {/* Rollback button */}
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRollbackTarget(version);
                          }}
                          className="px-2 py-1 text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 rounded transition-colors"
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {versions.length === 0 && (
                <div className="p-6 text-center text-slate-500">
                  No version history available
                </div>
              )}

              {/* Load more */}
              {versions.length < totalVersions && (
                <div className="p-4 text-center">
                  <button
                    type="button"
                    onClick={loadMoreVersions}
                    disabled={loadingMore}
                    className="text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border border-slate-500 border-t-blue-400 rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      `Load more versions (${versions.length} of ${totalVersions})`
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rollback Confirmation */}
        {rollbackTarget && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700">
              <h4 className="text-lg font-semibold text-slate-100 mb-2">
                Rollback to Version {rollbackTarget.version_number}?
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                This will restore the prompt content from version{" "}
                {rollbackTarget.version_number} and create a new version. The
                current content will be preserved in the version history.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRollbackTarget(null)}
                  disabled={rollingBack}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={rollingBack}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 text-white rounded transition-colors"
                >
                  {rollingBack ? "Rolling back..." : "Rollback"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
