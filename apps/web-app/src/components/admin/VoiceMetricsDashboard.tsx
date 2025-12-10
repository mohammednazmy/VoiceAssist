/**
 * Voice Metrics Dashboard - Phase 11: Analytics & Observability
 *
 * Real-time voice mode health dashboard showing:
 * - STT/TTS latency metrics
 * - Session statistics
 * - Error rates
 * - Audio quality indicators
 */

import { useState, useEffect } from "react";
import { useVoiceMetrics, SessionStats } from "../../hooks/useVoiceMetrics";
import { useWebVitals } from "../../hooks/useWebVitals";

// Metric card component
interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  status?: "good" | "warning" | "critical";
}

function MetricCard({
  title,
  value,
  unit,
  trend,
  trendValue,
  status,
}: MetricCardProps) {
  const statusColors = {
    good: "text-green-600",
    warning: "text-yellow-600",
    critical: "text-red-600",
  };

  const trendIcons = {
    up: "↑",
    down: "↓",
    neutral: "→",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-neutral-600 mb-2">{title}</p>
      <div className="flex items-baseline space-x-2">
        <p
          className={`text-3xl font-bold ${status ? statusColors[status] : "text-neutral-900"}`}
        >
          {typeof value === "number"
            ? value.toFixed(value < 10 ? 1 : 0)
            : value}
        </p>
        {unit && <span className="text-sm text-neutral-500">{unit}</span>}
      </div>
      {trend && trendValue && (
        <p
          className={`text-xs mt-1 ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-neutral-500"}`}
        >
          {trendIcons[trend]} {trendValue}
        </p>
      )}
    </div>
  );
}

// Latency bar component
interface LatencyBarProps {
  label: string;
  value: number;
  max: number;
  threshold: { good: number; warning: number };
}

function LatencyBar({ label, value, max, threshold }: LatencyBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const status =
    value <= threshold.good
      ? "good"
      : value <= threshold.warning
        ? "warning"
        : "critical";

  const barColors = {
    good: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">{label}</span>
        <span className="font-medium text-neutral-900">
          {value.toFixed(0)}ms
        </span>
      </div>
      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColors[status]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-neutral-400">
        <span>0ms</span>
        <span>{max}ms</span>
      </div>
    </div>
  );
}

// Session timeline item
interface SessionTimelineItemProps {
  session: {
    sessionId: string;
    startTime: number;
    duration?: number;
    messageCount: number;
    errorCount: number;
  };
}

function SessionTimelineItem({ session }: SessionTimelineItemProps) {
  const startDate = new Date(session.startTime);
  const duration = session.duration || Date.now() - session.startTime;
  const durationStr =
    duration < 60000
      ? `${Math.round(duration / 1000)}s`
      : `${Math.round(duration / 60000)}m`;

  return (
    <div className="flex items-center space-x-3 py-2 border-b border-neutral-100 last:border-0">
      <div
        className={`w-2 h-2 rounded-full ${session.errorCount > 0 ? "bg-red-500" : "bg-green-500"}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">
          Session {session.sessionId.slice(-8)}
        </p>
        <p className="text-xs text-neutral-500">
          {startDate.toLocaleTimeString()} · {durationStr} ·{" "}
          {session.messageCount} messages
        </p>
      </div>
      {session.errorCount > 0 && (
        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
          {session.errorCount} errors
        </span>
      )}
    </div>
  );
}

export function VoiceMetricsDashboard() {
  const { currentSession, allSessions, getSessionStats, getAverageLatencies } =
    useVoiceMetrics();

  const { metrics: webVitals, isSupported: webVitalsSupported } =
    useWebVitals();

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [latencies, setLatencies] = useState({ stt: 0, tts: 0 });

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      setStats(getSessionStats());
      setLatencies(getAverageLatencies());
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);

    return () => clearInterval(interval);
  }, [getSessionStats, getAverageLatencies]);

  // Determine latency status
  const getSttStatus = (latency: number): "good" | "warning" | "critical" => {
    if (latency <= 200) return "good";
    if (latency <= 500) return "warning";
    return "critical";
  };

  const getTtsStatus = (latency: number): "good" | "warning" | "critical" => {
    if (latency <= 300) return "good";
    if (latency <= 800) return "warning";
    return "critical";
  };

  // Recent sessions (last 10)
  const recentSessions = [...allSessions].reverse().slice(0, 10);
  if (currentSession) {
    recentSessions.unshift(currentSession);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Voice Mode Health
          </h1>
          <p className="text-sm text-neutral-600">
            Real-time voice metrics and session analytics
          </p>
        </div>
        {currentSession && (
          <div className="flex items-center space-x-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span className="text-sm font-medium text-green-600">
              Active Session
            </span>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Avg STT Latency"
          value={latencies.stt}
          unit="ms"
          status={getSttStatus(latencies.stt)}
        />
        <MetricCard
          title="Avg TTS Latency"
          value={latencies.tts}
          unit="ms"
          status={getTtsStatus(latencies.tts)}
        />
        <MetricCard
          title="Total Sessions"
          value={stats?.totalSessions || 0}
          trend={
            stats?.totalSessions && stats.totalSessions > 0 ? "up" : "neutral"
          }
        />
        <MetricCard
          title="Error Rate"
          value={
            stats?.totalSessions
              ? (stats.totalErrors / Math.max(stats.totalMessages, 1)) * 100
              : 0
          }
          unit="%"
          status={
            stats?.totalErrors === 0
              ? "good"
              : stats?.totalErrors && stats.totalErrors < 5
                ? "warning"
                : "critical"
          }
        />
      </div>

      {/* Latency Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Latency Breakdown
          </h2>
          <div className="space-y-6">
            <LatencyBar
              label="Speech-to-Text (STT)"
              value={latencies.stt}
              max={1000}
              threshold={{ good: 200, warning: 500 }}
            />
            <LatencyBar
              label="Text-to-Speech (TTS)"
              value={latencies.tts}
              max={1000}
              threshold={{ good: 300, warning: 800 }}
            />
            <LatencyBar
              label="P95 STT Latency"
              value={stats?.p95SttLatency || 0}
              max={1500}
              threshold={{ good: 400, warning: 800 }}
            />
            <LatencyBar
              label="P95 TTS Latency"
              value={stats?.p95TtsLatency || 0}
              max={1500}
              threshold={{ good: 500, warning: 1000 }}
            />
          </div>
        </div>

        {/* Session Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Session Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-neutral-50 rounded-lg">
              <p className="text-3xl font-bold text-primary-600">
                {stats?.totalMessages || 0}
              </p>
              <p className="text-sm text-neutral-600">Total Messages</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">
                {stats?.totalDuration
                  ? Math.round(stats.totalDuration / 60000)
                  : 0}
                m
              </p>
              <p className="text-sm text-neutral-600">Total Duration</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-lg">
              <p className="text-3xl font-bold text-blue-600">
                {stats?.averageSessionDuration
                  ? Math.round(stats.averageSessionDuration / 1000)
                  : 0}
                s
              </p>
              <p className="text-sm text-neutral-600">Avg Session</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-lg">
              <p className="text-3xl font-bold text-yellow-600">
                {stats?.totalReconnections || 0}
              </p>
              <p className="text-sm text-neutral-600">Reconnections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Recent Sessions
        </h2>
        {recentSessions.length > 0 ? (
          <div className="divide-y divide-neutral-100">
            {recentSessions.map((session) => (
              <SessionTimelineItem key={session.sessionId} session={session} />
            ))}
          </div>
        ) : (
          <p className="text-center text-neutral-500 py-8">
            No voice sessions recorded yet
          </p>
        )}
      </div>

      {/* Web Vitals Section */}
      {webVitalsSupported && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Core Web Vitals
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <VitalMetric
              name="LCP"
              value={webVitals.lcp}
              unit="ms"
              thresholds={{ good: 2500, warning: 4000 }}
            />
            <VitalMetric
              name="FID"
              value={webVitals.fid}
              unit="ms"
              thresholds={{ good: 100, warning: 300 }}
            />
            <VitalMetric
              name="CLS"
              value={webVitals.cls}
              unit=""
              thresholds={{ good: 0.1, warning: 0.25 }}
              decimals={3}
            />
            <VitalMetric
              name="FCP"
              value={webVitals.fcp}
              unit="ms"
              thresholds={{ good: 1800, warning: 3000 }}
            />
            <VitalMetric
              name="TTFB"
              value={webVitals.ttfb}
              unit="ms"
              thresholds={{ good: 800, warning: 1800 }}
            />
            <VitalMetric
              name="INP"
              value={webVitals.inp}
              unit="ms"
              thresholds={{ good: 200, warning: 500 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Web Vital metric display
interface VitalMetricProps {
  name: string;
  value?: number;
  unit: string;
  thresholds: { good: number; warning: number };
  decimals?: number;
}

function VitalMetric({
  name,
  value,
  unit,
  thresholds,
  decimals = 0,
}: VitalMetricProps) {
  const getStatus = (): "good" | "warning" | "critical" | "unknown" => {
    if (value === undefined) return "unknown";
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.warning) return "warning";
    return "critical";
  };

  const status = getStatus();
  const colors = {
    good: "text-green-600 bg-green-50",
    warning: "text-yellow-600 bg-yellow-50",
    critical: "text-red-600 bg-red-50",
    unknown: "text-neutral-400 bg-neutral-50",
  };

  return (
    <div className={`text-center p-4 rounded-lg ${colors[status]}`}>
      <p className="text-2xl font-bold">
        {value !== undefined ? value.toFixed(decimals) : "-"}
      </p>
      <p className="text-sm font-medium">
        {name} {unit && <span className="font-normal">{unit}</span>}
      </p>
    </div>
  );
}

export default VoiceMetricsDashboard;
