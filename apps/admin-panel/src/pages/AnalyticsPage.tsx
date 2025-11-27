/**
 * Analytics Page
 * Query analytics, response times, usage trends, and export reports
 */

import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../config/env';
import { fetchAPI } from '../lib/api';

interface QueryAnalytics {
  total_queries: number;
  avg_queries_per_user: number;
  top_query_types: Array<{ type: string; count: number }>;
  popular_topics: Array<{ topic: string; count: number }>;
}

interface ResponseTimeData {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  histogram: Array<{ bucket: string; count: number }>;
}

interface UsageTrends {
  daily_users: Array<{ date: string; count: number }>;
  daily_queries: Array<{ date: string; count: number }>;
  weekly_growth: number;
  monthly_growth: number;
}

export function AnalyticsPage() {
  const [queryAnalytics, setQueryAnalytics] = useState<QueryAnalytics | null>(null);
  const [responseTimes, setResponseTimes] = useState<ResponseTimeData | null>(null);
  const [usageTrends, setUsageTrends] = useState<UsageTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [queryData, responseData, trendsData] = await Promise.all([
        fetchAPI<QueryAnalytics>(`/api/admin/analytics/queries?range=${timeRange}`, { headers }),
        fetchAPI<ResponseTimeData>(`/api/admin/analytics/response-times?range=${timeRange}`, { headers }),
        fetchAPI<UsageTrends>(`/api/admin/analytics/trends?range=${timeRange}`, { headers }),
      ]);

      setQueryAnalytics(queryData);
      setResponseTimes(responseData);
      setUsageTrends(trendsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${apiBaseUrl || 'http://localhost:8000'}/api/admin/analytics/export?range=${timeRange}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${timeRange}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to export report');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Query analytics, response times, and usage trends
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Export Button */}
          <button
            onClick={exportReport}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            📊 Export Report
          </button>
        </div>
      </div>

      {/* Query Analytics */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Query Analytics</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary Stats */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-sm text-slate-400">Total Queries</div>
              <div className="text-3xl font-bold text-blue-400 mt-1">
                {queryAnalytics?.total_queries.toLocaleString() || 0}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-sm text-slate-400">Avg Queries per User</div>
              <div className="text-3xl font-bold text-green-400 mt-1">
                {queryAnalytics?.avg_queries_per_user.toFixed(1) || 0}
              </div>
            </div>
          </div>

          {/* Top Query Types */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Top Query Types</h3>
            <div className="space-y-2">
              {queryAnalytics?.top_query_types.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-800/30 rounded p-2">
                  <span className="text-sm text-slate-300">{item.type}</span>
                  <span className="text-sm font-medium text-blue-400">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Popular Topics */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Popular Topics</h3>
          <div className="flex flex-wrap gap-2">
            {queryAnalytics?.popular_topics.map((topic, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-900/30 text-purple-400 border border-purple-800"
              >
                {topic.topic}
                <span className="ml-2 text-xs opacity-75">({topic.count})</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Response Time Histogram */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Response Time Distribution</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">P50 (Median)</div>
            <div className="text-2xl font-bold text-green-400">{responseTimes?.p50}ms</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">P95</div>
            <div className="text-2xl font-bold text-yellow-400">{responseTimes?.p95}ms</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">P99</div>
            <div className="text-2xl font-bold text-orange-400">{responseTimes?.p99}ms</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">Average</div>
            <div className="text-2xl font-bold text-blue-400">{responseTimes?.avg}ms</div>
          </div>
        </div>

        {/* Histogram */}
        <div className="space-y-2">
          {responseTimes?.histogram.map((bucket, idx) => {
            const maxCount = Math.max(...(responseTimes.histogram.map(b => b.count) || [1]));
            const percentage = (bucket.count / maxCount) * 100;

            return (
              <div key={idx} className="flex items-center space-x-3">
                <div className="w-24 text-xs text-slate-400 text-right">{bucket.bucket}</div>
                <div className="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center px-2"
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="text-xs text-white font-medium">{bucket.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Usage Trends */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Usage Trends</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-900/30 to-green-950/20 border border-green-800 rounded-lg p-4">
            <div className="text-sm text-slate-400">Weekly Growth</div>
            <div className="text-3xl font-bold text-green-400 mt-1">
              +{((usageTrends?.weekly_growth || 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-950/20 border border-purple-800 rounded-lg p-4">
            <div className="text-sm text-slate-400">Monthly Growth</div>
            <div className="text-3xl font-bold text-purple-400 mt-1">
              +{((usageTrends?.monthly_growth || 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Simplified Trend Chart (ASCII-style) */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Daily Active Users</h3>
            <div className="bg-slate-800/30 rounded-lg p-3 font-mono text-xs text-slate-400">
              {usageTrends?.daily_users.slice(-7).map((day, idx) => {
                const maxUsers = Math.max(...(usageTrends.daily_users.map(d => d.count) || [1]));
                const bars = Math.round((day.count / maxUsers) * 40);
                return (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="w-16">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-blue-400">{'█'.repeat(bars)}</span>
                    <span>{day.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Daily Queries</h3>
            <div className="bg-slate-800/30 rounded-lg p-3 font-mono text-xs text-slate-400">
              {usageTrends?.daily_queries.slice(-7).map((day, idx) => {
                const maxQueries = Math.max(...(usageTrends.daily_queries.map(d => d.count) || [1]));
                const bars = Math.round((day.count / maxQueries) * 40);
                return (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="w-16">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-purple-400">{'█'.repeat(bars)}</span>
                    <span>{day.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
