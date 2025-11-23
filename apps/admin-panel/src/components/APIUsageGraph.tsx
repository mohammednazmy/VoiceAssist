/**
 * API Usage Graph
 * Real-time display of API request metrics
 */

import { useEffect, useState, useRef } from 'react';
import { fetchAPI } from '../lib/api';

interface APIMetrics {
  timestamp: string;
  requests_per_minute: number;
  avg_response_time_ms: number;
  error_rate: number;
}

interface UsageStats {
  current_rpm: number;
  avg_response_time: number;
  error_rate: number;
  total_requests_24h: number;
  history: APIMetrics[];
}

export function APIUsageGraph() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stats && canvasRef.current) {
      drawGraph(canvasRef.current, stats.history);
    }
  }, [stats]);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await fetchAPI<UsageStats>(
        '/api/admin/metrics/usage',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStats(data);
      setError(null);
    } catch (err: any) {
      if (loading) {
        setError(err.message || 'Failed to load API metrics');
      }
    } finally {
      setLoading(false);
    }
  };

  const drawGraph = (canvas: HTMLCanvasElement, history: APIMetrics[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || history.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Get data points
    const maxRPM = Math.max(...history.map(h => h.requests_per_minute), 1);
    const points = history.slice(-30); // Last 30 data points

    // Draw grid lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw line graph
    if (points.length > 1) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();

      points.forEach((point, index) => {
        const x = padding + (width - 2 * padding) * (index / (points.length - 1));
        const y = height - padding - (height - 2 * padding) * (point.requests_per_minute / maxRPM);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = '#3b82f6';
      points.forEach((point, index) => {
        const x = padding + (width - 2 * padding) * (index / (points.length - 1));
        const y = height - padding - (height - 2 * padding) * (point.requests_per_minute / maxRPM);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * (i / 4);
      const value = Math.round(maxRPM * (1 - i / 4));
      ctx.fillText(value.toString(), padding - 10, y + 4);
    }

    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Requests/min', 0, 0);
    ctx.restore();
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading API metrics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-6 py-4 border-b border-slate-800">
        <h3 className="text-lg font-semibold text-slate-200">API Usage</h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Current Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">Current RPM</div>
            <div className="text-2xl font-bold text-blue-400">{stats?.current_rpm || 0}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">Avg Response</div>
            <div className="text-2xl font-bold text-green-400">
              {stats?.avg_response_time || 0}ms
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">Error Rate</div>
            <div className="text-2xl font-bold text-orange-400">
              {((stats?.error_rate || 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400">24h Total</div>
            <div className="text-2xl font-bold text-purple-400">
              {(stats?.total_requests_24h || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Graph */}
        <div className="bg-slate-800/30 rounded-lg p-4">
          <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="w-full h-auto"
          />
        </div>
      </div>
    </div>
  );
}
