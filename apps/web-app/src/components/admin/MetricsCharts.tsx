/**
 * Metrics Charts Component (Phase 8.3)
 * System metrics visualization with simple SVG charts
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getDefaultAdminApi,
  type SystemMetricsResponse,
} from "../../lib/api/adminApi";

interface BarChartProps {
  data: Array<{ date: string; count: number }>;
  color: string;
  height?: number;
}

function BarChart({ data, color, height = 150 }: BarChartProps) {
  const maxValue = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  );

  const barWidth = data.length > 0 ? 100 / data.length : 0;
  const gap = 2;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[150px] text-neutral-500 text-sm">
        No data available
      </div>
    );
  }

  return (
    <div className="relative">
      <svg width="100%" height={height} className="overflow-visible">
        {data.map((item, index) => {
          const barHeight = (item.count / maxValue) * (height - 30);
          const x = `${index * barWidth + gap / 2}%`;
          const width = `${barWidth - gap}%`;
          const y = height - barHeight - 20;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={width}
                height={barHeight}
                fill={color}
                rx={2}
                className="transition-all duration-200 hover:opacity-80"
              >
                <title>{`${item.date}: ${item.count}`}</title>
              </rect>
              {/* Show label on hover or if few data points */}
              {data.length <= 14 && (
                <text
                  x={`${index * barWidth + barWidth / 2}%`}
                  y={height - 5}
                  textAnchor="middle"
                  className="text-xs fill-neutral-500"
                >
                  {item.date.split("-").slice(1).join("/")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface DonutChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
}

function DonutChart({ data, size = 150 }: DonutChartProps) {
  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data],
  );
  const center = size / 2;
  const radius = (size - 20) / 2;
  const innerRadius = radius * 0.6;

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-neutral-500 text-sm">No data</span>
      </div>
    );
  }

  let currentAngle = -90; // Start from top

  const segments = data.map((item) => {
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const x3 = center + innerRadius * Math.cos(endRad);
    const y3 = center + innerRadius * Math.sin(endRad);
    const x4 = center + innerRadius * Math.cos(startRad);
    const y4 = center + innerRadius * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");

    return {
      ...item,
      path,
      percentage: ((item.value / total) * 100).toFixed(0),
    };
  });

  return (
    <div className="flex items-center space-x-4">
      <svg width={size} height={size}>
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment.path}
            fill={segment.color}
            className="transition-all duration-200 hover:opacity-80"
          >
            <title>{`${segment.label}: ${segment.value} (${segment.percentage}%)`}</title>
          </path>
        ))}
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          className="text-2xl font-bold fill-neutral-900"
        >
          {total}
        </text>
        <text
          x={center}
          y={center + 15}
          textAnchor="middle"
          className="text-xs fill-neutral-500"
        >
          Total
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center space-x-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-sm text-neutral-600">
              {segment.label}: {segment.value} ({segment.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricsCharts() {
  const [metrics, setMetrics] = useState<SystemMetricsResponse | null>(null);
  const [days, setDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      setError(null);
      const adminApi = getDefaultAdminApi();
      const data = await adminApi.getSystemMetrics(days);
      setMetrics(data);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load metrics:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded w-1/3" />
          <div className="h-40 bg-neutral-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            System Metrics
          </h2>
          <button
            onClick={loadMetrics}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Retry
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const userDistribution = metrics?.user_distribution
    ? [
        {
          label: "Active",
          value: metrics.user_distribution.active,
          color: "#22c55e",
        },
        {
          label: "Inactive",
          value: metrics.user_distribution.inactive,
          color: "#ef4444",
        },
      ]
    : [];

  const roleDistribution = metrics?.user_distribution
    ? [
        {
          label: "Admins",
          value: metrics.user_distribution.admins,
          color: "#8b5cf6",
        },
        {
          label: "Regular",
          value: metrics.user_distribution.regular,
          color: "#3b82f6",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            System Metrics
          </h2>
          <div className="flex items-center space-x-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  days === d
                    ? "bg-primary-500 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>
        </div>

        {/* Activity Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">
              Daily Registrations
            </h3>
            <BarChart
              data={metrics?.daily_registrations || []}
              color="#3b82f6"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">
              Daily Active Users
            </h3>
            <BarChart
              data={metrics?.daily_active_users || []}
              color="#22c55e"
            />
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">
            User Status Distribution
          </h3>
          <DonutChart data={userDistribution} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">
            User Role Distribution
          </h3>
          <DonutChart data={roleDistribution} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-4">
          Summary ({metrics?.period_days || days} days)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-neutral-50 rounded-lg">
            <p className="text-3xl font-bold text-neutral-900">
              {metrics?.user_distribution.total || 0}
            </p>
            <p className="text-sm text-neutral-600">Total Users</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">
              {metrics?.user_distribution.active || 0}
            </p>
            <p className="text-sm text-green-700">Active Users</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-3xl font-bold text-purple-600">
              {metrics?.user_distribution.admins || 0}
            </p>
            <p className="text-sm text-purple-700">Admins</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">
              {metrics?.daily_registrations?.reduce(
                (sum, d) => sum + d.count,
                0,
              ) || 0}
            </p>
            <p className="text-sm text-blue-700">New Registrations</p>
          </div>
        </div>
      </div>
    </div>
  );
}
