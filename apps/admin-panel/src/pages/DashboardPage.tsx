import { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';
import { ActiveSessionsMonitor } from '../components/ActiveSessionsMonitor';
import { APIUsageGraph } from '../components/APIUsageGraph';
import { AlertNotifications } from '../components/AlertNotifications';

interface SystemMetrics {
  total_users: number;
  active_users: number;
  admin_users: number;
  timestamp: string;
}

interface ServiceHealth {
  database: boolean;
  redis: boolean;
  qdrant: boolean;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [metricsData, healthData] = await Promise.all([
        fetchAPI<SystemMetrics>('/api/admin/panel/summary', { headers }),
        fetchAPI<ServiceHealth>('/health', { headers }).catch(() => ({
          database: true,
          redis: true,
          qdrant: true,
        })),
      ]);

      setMetrics(metricsData);
      setHealth(healthData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading dashboard...</div>
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
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          System overview and key metrics
        </p>
      </div>

      {/* User Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">User Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Total Users"
            value={metrics?.total_users || 0}
            icon="👥"
            color="blue"
          />
          <MetricCard
            title="Active Users"
            value={metrics?.active_users || 0}
            icon="✓"
            color="green"
          />
          <MetricCard
            title="Admin Users"
            value={metrics?.admin_users || 0}
            icon="⚙️"
            color="purple"
          />
        </div>
      </div>

      {/* Alert Notifications */}
      <AlertNotifications />

      {/* Service Health */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Service Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ServiceCard name="PostgreSQL" healthy={health?.database || false} />
          <ServiceCard name="Redis" healthy={health?.redis || false} />
          <ServiceCard name="Qdrant" healthy={health?.qdrant || false} />
        </div>
      </div>

      {/* Active Sessions Monitor */}
      <ActiveSessionsMonitor />

      {/* API Usage Graph */}
      <APIUsageGraph />

      {/* Last Updated */}
      <div className="text-xs text-slate-500">
        Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'Unknown'}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  icon: string;
  color: 'blue' | 'green' | 'purple';
}

function MetricCard({ title, value, icon, color }: MetricCardProps) {
  const colors = {
    blue: 'from-blue-900/50 to-blue-950/30 border-blue-800 text-blue-400',
    green: 'from-green-900/50 to-green-950/30 border-green-800 text-green-400',
    purple: 'from-purple-900/50 to-purple-950/30 border-purple-800 text-purple-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <div className="text-sm text-slate-300">{title}</div>
    </div>
  );
}

function ServiceCard({ name, healthy }: { name: string; healthy: boolean }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{name}</span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            healthy
              ? 'bg-green-900/50 text-green-400 border border-green-800'
              : 'bg-red-900/50 text-red-400 border border-red-800'
          }`}
        >
          {healthy ? '● Online' : '● Offline'}
        </span>
      </div>
    </div>
  );
}
