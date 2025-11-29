/**
 * BulkActionBar Component
 *
 * Floating action bar that appears when users are selected.
 * Provides bulk operation buttons for activate, deactivate, and role change.
 */

import { useState } from "react";
import {
  BulkAction,
  AdminRole,
  BulkOperationResult,
} from "../../hooks/useBulkOperations";

interface BulkActionBarProps {
  selectedCount: number;
  isLoading: boolean;
  onAction: (
    action: BulkAction,
    role?: AdminRole,
    reason?: string,
  ) => Promise<BulkOperationResult>;
  onClearSelection: () => void;
  lastResult: BulkOperationResult | null;
}

export function BulkActionBar({
  selectedCount,
  isLoading,
  onAction,
  onClearSelection,
  lastResult,
}: BulkActionBarProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleAction = async (action: BulkAction, role?: AdminRole) => {
    const reason = prompt(
      `Add a reason for this bulk ${action}?`,
      "Bulk admin action",
    );
    if (reason === null) return; // User cancelled

    try {
      await onAction(action, role, reason || undefined);
      setShowResult(true);
      setShowRoleMenu(false);
      // Auto-hide result after 5 seconds
      setTimeout(() => setShowResult(false), 5000);
    } catch {
      // Error is handled by the hook
    }
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      {/* Result toast */}
      {showResult && lastResult && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-slate-100">
              Bulk {lastResult.action} completed
            </span>
            <button
              onClick={() => setShowResult(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-green-400">
                {lastResult.successful} successful
              </span>
              {lastResult.failed > 0 && (
                <span className="text-red-400">{lastResult.failed} failed</span>
              )}
              {lastResult.skipped > 0 && (
                <span className="text-amber-400">
                  {lastResult.skipped} skipped
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl flex items-center gap-1 p-2">
        {/* Selection count */}
        <div className="px-3 py-1.5 text-sm text-slate-300 border-r border-slate-700">
          <span className="font-medium text-blue-400">{selectedCount}</span>{" "}
          selected
        </div>

        {/* Activate button */}
        <button
          onClick={() => handleAction("activate")}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-green-400 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Activate selected users"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="hidden sm:inline">Activate</span>
        </button>

        {/* Deactivate button */}
        <button
          onClick={() => handleAction("deactivate")}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Deactivate selected users"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          <span className="hidden sm:inline">Deactivate</span>
        </button>

        {/* Role change dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Change role for selected users"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span className="hidden sm:inline">Set Role</span>
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showRoleMenu && (
            <div className="absolute bottom-full mb-1 right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[140px]">
              <button
                onClick={() => {
                  handleAction("set_role", "user");
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                User
              </button>
              <button
                onClick={() => {
                  handleAction("set_role", "viewer");
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Viewer
              </button>
              <button
                onClick={() => {
                  handleAction("set_role", "admin");
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-700 mx-1" />

        {/* Clear selection */}
        <button
          onClick={onClearSelection}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
          title="Clear selection"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Loading indicator */}
        {isLoading && (
          <div className="px-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkActionBar;
