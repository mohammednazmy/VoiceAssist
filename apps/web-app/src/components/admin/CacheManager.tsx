/**
 * Cache Manager
 * Admin panel for monitoring and managing Redis cache
 *
 * Phase 8.3: Cache statistics, invalidation, and management
 */

import { useState, useEffect, useCallback } from "react";
import { getDefaultAdminApi, type CacheStats } from "../../lib/api/adminApi";

export function CacheManager() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidatePattern, setInvalidatePattern] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [isInvalidating, setIsInvalidating] = useState(false);
  const [lastAction, setLastAction] = useState<{
    type: "clear" | "invalidate";
    result: string;
  } | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getCacheStats();
      setStats(data);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load cache stats:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load cache statistics",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const handleClearCache = async () => {
    if (
      !confirm(
        "Are you sure you want to clear the entire cache? This may temporarily impact performance.",
      )
    ) {
      return;
    }

    setIsClearing(true);
    setError(null);
    setLastAction(null);

    try {
      const adminApi = getDefaultAdminApi();
      const result = await adminApi.clearCache();
      setLastAction({ type: "clear", result: result.message });
      await loadStats();
    } catch (err) {
      console.error("Failed to clear cache:", err);
      setError(err instanceof Error ? err.message : "Failed to clear cache");
    } finally {
      setIsClearing(false);
    }
  };

  const handleInvalidatePattern = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invalidatePattern.trim()) {
      setError("Please enter a pattern to invalidate");
      return;
    }

    setIsInvalidating(true);
    setError(null);
    setLastAction(null);

    try {
      const adminApi = getDefaultAdminApi();
      const result = await adminApi.invalidateCachePattern(invalidatePattern);
      setLastAction({
        type: "invalidate",
        result: `Invalidated ${result.keys_invalidated} keys matching "${invalidatePattern}"`,
      });
      setInvalidatePattern("");
      await loadStats();
    } catch (err) {
      console.error("Failed to invalidate pattern:", err);
      setError(
        err instanceof Error ? err.message : "Failed to invalidate pattern",
      );
    } finally {
      setIsInvalidating(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(" ") : "< 1m";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading cache statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-red-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span className="text-sm text-red-700">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
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
        </div>
      )}

      {/* Success Banner */}
      {lastAction && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-green-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-green-700">{lastAction.result}</span>
          </div>
          <button
            onClick={() => setLastAction(null)}
            className="text-green-600 hover:text-green-800"
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
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Cache Management
          </h1>
          <p className="text-sm text-neutral-600">
            Monitor and manage Redis cache
          </p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
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
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Keys */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-neutral-600">Total Keys</p>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-primary-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-neutral-900">
              {stats.total_keys.toLocaleString()}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {stats.connected_clients} connected clients
            </p>
          </div>

          {/* Memory Used */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-neutral-600">
                Memory Used
              </p>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-blue-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-neutral-900">
              {stats.memory_used_human}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {(stats.memory_used_bytes / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>

          {/* Hit Rate */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-neutral-600">Hit Rate</p>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-green-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-neutral-900">
              {(stats.hit_rate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Miss rate: {(stats.miss_rate * 100).toFixed(1)}%
            </p>
          </div>

          {/* Uptime */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-neutral-600">Uptime</p>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-yellow-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-3xl font-bold text-neutral-900">
              {formatUptime(stats.uptime_seconds)}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {Math.floor(stats.uptime_seconds / 86400)} days running
            </p>
          </div>
        </div>
      )}

      {/* Keys by Prefix */}
      {stats &&
        stats.keys_by_prefix &&
        Object.keys(stats.keys_by_prefix).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              Keys by Prefix
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(stats.keys_by_prefix)
                .sort((a, b) => b[1] - a[1])
                .map(([prefix, count]) => (
                  <div
                    key={prefix}
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                  >
                    <span className="font-mono text-sm text-neutral-700">
                      {prefix}
                    </span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

      {/* Cache Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invalidate Pattern */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Invalidate by Pattern
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Invalidate cache keys matching a specific pattern. Use * as a
            wildcard.
          </p>
          <form onSubmit={handleInvalidatePattern} className="space-y-4">
            <div className="flex space-x-3">
              <input
                type="text"
                value={invalidatePattern}
                onChange={(e) => setInvalidatePattern(e.target.value)}
                placeholder="e.g., user:*, session:abc123"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={isInvalidating || !invalidatePattern.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                {isInvalidating ? "Invalidating..." : "Invalidate"}
              </button>
            </div>
            <div className="text-xs text-neutral-500">
              <strong>Common patterns:</strong>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>
                  <code className="bg-neutral-100 px-1 rounded">user:*</code> -
                  All user cache entries
                </li>
                <li>
                  <code className="bg-neutral-100 px-1 rounded">session:*</code>{" "}
                  - All session data
                </li>
                <li>
                  <code className="bg-neutral-100 px-1 rounded">kb:*</code> -
                  Knowledge base cache
                </li>
              </ul>
            </div>
          </form>
        </div>

        {/* Clear All Cache */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Clear Entire Cache
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Remove all entries from the cache. This will temporarily impact
            performance as the cache rebuilds.
          </p>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <div className="flex items-start space-x-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5 text-red-600 mt-0.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <div className="text-sm text-red-700">
                <strong>Warning:</strong> This action cannot be undone. All
                cached data will be lost and will need to be regenerated.
              </div>
            </div>
          </div>
          <button
            onClick={handleClearCache}
            disabled={isClearing}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isClearing ? "Clearing..." : "Clear All Cache"}
          </button>
        </div>
      </div>
    </div>
  );
}
