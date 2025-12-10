/**
 * Analytics Dashboard
 * Usage analytics, query trends, and cost tracking
 */

import { useState, useEffect, useCallback } from "react";

interface AnalyticsData {
  dailyConversations: number[];
  dailyMessages: number[];
  topQueries: Array<{ query: string; count: number }>;
  costBreakdown: {
    openai: number;
    storage: number;
    compute: number;
  };
  userRetention: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    dailyConversations: [],
    dailyMessages: [],
    topQueries: [],
    costBreakdown: {
      openai: 0,
      storage: 0,
      compute: 0,
    },
    userRetention: {
      daily: 0,
      weekly: 0,
      monthly: 0,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d");

  const loadAnalytics = useCallback(async () => {
    try {
      // TODO: Replace with actual API call when backend is ready
      // const data = await apiClient.get(`/admin/analytics?range=${timeRange}`);

      // Mock data
      const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      setAnalytics({
        dailyConversations: Array.from(
          { length: days },
          () => Math.floor(Math.random() * 50) + 20,
        ),
        dailyMessages: Array.from(
          { length: days },
          () => Math.floor(Math.random() * 200) + 100,
        ),
        topQueries: [
          { query: "diabetes management guidelines", count: 145 },
          { query: "hypertension treatment options", count: 132 },
          { query: "chest pain differential diagnosis", count: 98 },
          { query: "antibiotic selection pneumonia", count: 87 },
          { query: "cardiac biomarkers interpretation", count: 76 },
        ],
        costBreakdown: {
          openai: 342.5,
          storage: 89.2,
          compute: 156.8,
        },
        userRetention: {
          daily: 78.5,
          weekly: 65.2,
          monthly: 45.8,
        },
      });

      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load analytics:", error);
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-neutral-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const totalCost = Object.values(analytics.costBreakdown).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Analytics & Reporting
          </h1>
          <p className="text-sm text-neutral-600">
            Usage trends, costs, and user behavior
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTimeRange("7d")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeRange === "7d"
                ? "bg-primary-500 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange("30d")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeRange === "30d"
                ? "bg-primary-500 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeRange("90d")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              timeRange === "90d"
                ? "bg-primary-500 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Cost Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-neutral-600 mb-2">
            Total Cost ({timeRange})
          </p>
          <p className="text-3xl font-bold text-neutral-900">
            ${totalCost.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            $
            {(
              totalCost /
              (timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90)
            ).toFixed(2)}
            /day avg
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-neutral-600 mb-2">OpenAI API</p>
          <p className="text-3xl font-bold text-blue-600">
            ${analytics.costBreakdown.openai.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {((analytics.costBreakdown.openai / totalCost) * 100).toFixed(1)}%
            of total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-neutral-600 mb-2">Storage</p>
          <p className="text-3xl font-bold text-green-600">
            ${analytics.costBreakdown.storage.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {((analytics.costBreakdown.storage / totalCost) * 100).toFixed(1)}%
            of total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-neutral-600 mb-2">Compute</p>
          <p className="text-3xl font-bold text-purple-600">
            ${analytics.costBreakdown.compute.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {((analytics.costBreakdown.compute / totalCost) * 100).toFixed(1)}%
            of total
          </p>
        </div>
      </div>

      {/* User Retention */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          User Retention
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-neutral-600 mb-2">Daily Active Users</p>
            <p className="text-4xl font-bold text-green-600">
              {analytics.userRetention.daily}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-neutral-600 mb-2">Weekly Active Users</p>
            <p className="text-4xl font-bold text-blue-600">
              {analytics.userRetention.weekly}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-neutral-600 mb-2">
              Monthly Active Users
            </p>
            <p className="text-4xl font-bold text-purple-600">
              {analytics.userRetention.monthly}%
            </p>
          </div>
        </div>
      </div>

      {/* Usage Trends (Placeholder for Charts) */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Usage Trends
        </h2>
        <div className="text-center py-12 text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-12 h-12 mx-auto mb-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-sm mb-2">Interactive charts coming soon</p>
          <p className="text-xs text-neutral-400">
            Install chart library (e.g., recharts, chart.js) for visualization
          </p>
        </div>
      </div>

      {/* Top Queries */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Top Queries
        </h2>
        <div className="space-y-3">
          {analytics.topQueries.map((query, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium">
                  {index + 1}
                </span>
                <span className="text-sm text-neutral-900">{query.query}</span>
              </div>
              <span className="text-sm font-medium text-neutral-600">
                {query.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={() =>
            alert(
              "Export functionality will be available when backend is ready",
            )
          }
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
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
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          <span>Export Report</span>
        </button>
      </div>
    </div>
  );
}
