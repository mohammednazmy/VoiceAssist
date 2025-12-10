/**
 * BranchSidebar Component
 * Displays a list of conversation branches and allows switching between them
 */

import { useBranching } from "../../hooks/useBranching";

export interface BranchSidebarProps {
  sessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BranchSidebar({
  sessionId,
  isOpen,
  onClose,
}: BranchSidebarProps) {
  const { branches, currentBranchId, isLoading, error, switchBranch } =
    useBranching(sessionId);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto">
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 bg-black/50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-lg md:relative md:w-64 md:shadow-none overflow-y-auto"
        role="complementary"
        aria-label="Conversation branches"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Branches
          </h2>
          <button
            onClick={onClose}
            className="md:hidden p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close branch sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Loading State */}
          {isLoading && (
            <div
              className="flex items-center justify-center py-8"
              role="status"
              aria-live="polite"
            >
              <svg
                className="animate-spin h-6 w-6 text-primary-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="sr-only">Loading branches...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-400"
              role="alert"
            >
              <p className="font-medium">Error loading branches</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && branches.length === 0 && (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-12 h-12 mx-auto mb-3 opacity-50"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                />
              </svg>
              <p className="text-sm">No branches yet</p>
              <p className="text-xs mt-1">
                Create a branch from any message to explore alternative
                conversations
              </p>
            </div>
          )}

          {/* Branch List */}
          {!isLoading && !error && branches.length > 0 && (
            <ul className="space-y-2" role="list">
              {branches.map((branch) => {
                const isActive = branch.branchId === currentBranchId;

                return (
                  <li key={branch.branchId}>
                    <button
                      onClick={() => switchBranch(branch.branchId)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                        isActive
                          ? "bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700"
                          : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      }`}
                      aria-pressed={isActive}
                      aria-label={`Switch to ${branch.branchId === "main" ? "main branch" : `branch ${branch.branchId}`}`}
                    >
                      {/* Branch Icon and Name */}
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className={`w-4 h-4 ${
                            isActive
                              ? "text-primary-600 dark:text-primary-400"
                              : "text-neutral-500 dark:text-neutral-400"
                          }`}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                          />
                        </svg>
                        <span
                          className={`font-medium text-sm ${
                            isActive
                              ? "text-primary-900 dark:text-primary-100"
                              : "text-neutral-900 dark:text-neutral-100"
                          }`}
                        >
                          {branch.branchId === "main"
                            ? "Main"
                            : `Branch ${branch.branchId.split("-").pop()}`}
                        </span>
                        {isActive && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4 ml-auto text-primary-600 dark:text-primary-400"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Branch Metadata */}
                      <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                            />
                          </svg>
                          <span>{branch.messageCount} messages</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>
                            {new Date(branch.lastActivity).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer Info */}
        <div className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400">
          <p>
            Branches let you explore alternative conversation paths without
            losing your main discussion.
          </p>
        </div>
      </div>
    </div>
  );
}
