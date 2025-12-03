import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatCard,
  DataPanel,
  LoadingGrid,
  ErrorState,
  EmptyState,
  RefreshButton,
  ConfirmDialog,
  TabGroup,
  StatusType,
} from "../components/shared";
import { fetchAPI } from "../lib/api";

// Types
interface CalendarConnection {
  id: string;
  user_id: string;
  user_email: string | null;
  provider: string;
  provider_display_name: string;
  status: string;
  caldav_url: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  error_message: string | null;
}

interface CalendarStats {
  total_connections: number;
  connected_count: number;
  error_count: number;
  by_provider: Record<string, number>;
  by_status: Record<string, number>;
  users_with_connections: number;
  avg_connections_per_user: number;
}

interface ProviderConfig {
  name: string;
  type: string;
  configured: boolean;
  client_id_set?: boolean;
  client_secret_set?: boolean;
  notes?: string;
}

type TabId = "connections" | "stats" | "providers";

export function CalendarConnectionsPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("connections");
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [stats, setStats] = useState<CalendarStats | null>(null);
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Deletion state
  const [deleteConnection, setDeleteConnection] =
    useState<CalendarConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (providerFilter) params.set("provider", providerFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "100");

      const response = await fetchAPI<{ connections: CalendarConnection[] }>(
        `/api/admin/calendars/connections?${params}`,
      );
      setConnections(response.connections || []);
    } catch (err) {
      console.error("Failed to fetch connections:", err);
      throw err;
    }
  }, [providerFilter, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetchAPI<CalendarStats>(
        "/api/admin/calendars/stats",
      );
      setStats(response);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      throw err;
    }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetchAPI<{ providers: ProviderConfig[] }>(
        "/api/admin/calendars/providers",
      );
      // Convert array to Record keyed by provider name
      const providerRecord: Record<string, ProviderConfig> = {};
      for (const p of response.providers || []) {
        providerRecord[p.name.toLowerCase().replace(/\s+/g, "_")] = p;
      }
      setProviders(providerRecord);
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      throw err;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchConnections(), fetchStats(), fetchProviders()]);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [fetchConnections, fetchStats, fetchProviders]);

  useEffect(() => {
    refreshAll();
  }, []);

  const handleDeleteConnection = async () => {
    if (!deleteConnection || !isAdmin) return;
    setDeleting(true);
    try {
      await fetchAPI(
        `/api/admin/calendars/connections/${deleteConnection.id}`,
        { method: "DELETE" },
      );
      setConnections((prev) =>
        prev.filter((c) => c.id !== deleteConnection.id),
      );
      setDeleteConnection(null);
      // Refresh stats after deletion
      fetchStats();
    } catch (err) {
      console.error("Failed to delete connection:", err);
    } finally {
      setDeleting(false);
    }
  };

  const applyFilters = () => {
    fetchConnections();
  };

  const getProviderIcon = (provider: string): string => {
    const icons: Record<string, string> = {
      google: "📅",
      microsoft: "📆",
      apple: "🍎",
      nextcloud: "☁️",
      caldav: "📋",
    };
    return icons[provider] || "📅";
  };

  const getStatusBadge = (
    status: string,
  ): { type: StatusType; label: string } => {
    const mapping: Record<string, { type: StatusType; label: string }> = {
      connected: { type: "healthy", label: "Connected" },
      error: { type: "unhealthy", label: "Error" },
      pending: { type: "degraded", label: "Pending" },
      disconnected: { type: "unknown", label: "Disconnected" },
    };
    return mapping[status] || { type: "unknown", label: status };
  };

  // Loading state
  if (loading && !connections.length) {
    return (
      <PageContainer>
        <PageHeader
          title="Calendar Connections"
          description="Manage user calendar integrations"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={6} cols={1} />
      </PageContainer>
    );
  }

  const tabs = [
    {
      id: "connections" as const,
      label: "Connections",
      count: connections.length,
    },
    { id: "stats" as const, label: "Statistics" },
    { id: "providers" as const, label: "Provider Config" },
  ];

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Calendar Connections"
        description="Manage user calendar integrations (Google, Microsoft, Apple, Nextcloud)"
        lastUpdated={lastUpdated}
        actions={<RefreshButton onClick={refreshAll} isLoading={loading} />}
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Connections"
            value={stats.total_connections}
            icon="🔗"
            color="blue"
          />
          <StatCard
            title="Connected"
            value={stats.connected_count}
            icon="✅"
            color="green"
          />
          <StatCard
            title="Errors"
            value={stats.error_count}
            icon="⚠️"
            color="red"
          />
          <StatCard
            title="Users"
            value={stats.users_with_connections}
            icon="👤"
            color="purple"
          />
        </div>
      )}

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Tab Content */}
      {activeTab === "connections" && (
        <ConnectionsTab
          connections={connections}
          isAdmin={isAdmin}
          providerFilter={providerFilter}
          statusFilter={statusFilter}
          onProviderFilterChange={setProviderFilter}
          onStatusFilterChange={setStatusFilter}
          onFilter={applyFilters}
          onDelete={setDeleteConnection}
          getProviderIcon={getProviderIcon}
          getStatusBadge={getStatusBadge}
        />
      )}

      {activeTab === "stats" && stats && (
        <StatsTab stats={stats} getProviderIcon={getProviderIcon} />
      )}

      {activeTab === "providers" && <ProvidersTab providers={providers} />}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConnection}
        onClose={() => setDeleteConnection(null)}
        onConfirm={handleDeleteConnection}
        title="Delete Calendar Connection"
        message={
          <>
            Are you sure you want to delete the calendar connection for{" "}
            <strong className="text-slate-200">
              {deleteConnection?.user_email || deleteConnection?.user_id}
            </strong>
            ? This will remove their {deleteConnection?.provider} calendar
            integration.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </PageContainer>
  );
}

// Sub-components

interface ConnectionsTabProps {
  connections: CalendarConnection[];
  isAdmin: boolean;
  providerFilter: string;
  statusFilter: string;
  onProviderFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onFilter: () => void;
  onDelete: (connection: CalendarConnection) => void;
  getProviderIcon: (provider: string) => string;
  getStatusBadge: (status: string) => { type: StatusType; label: string };
}

function ConnectionsTab({
  connections,
  isAdmin,
  providerFilter,
  statusFilter,
  onProviderFilterChange,
  onStatusFilterChange,
  onFilter,
  onDelete,
  getProviderIcon,
  getStatusBadge,
}: ConnectionsTabProps) {
  return (
    <DataPanel title="Calendar Connections" noPadding>
      {/* Filters */}
      <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
        <select
          value={providerFilter}
          onChange={(e) => onProviderFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Providers</option>
          <option value="google">Google</option>
          <option value="microsoft">Microsoft</option>
          <option value="apple">Apple iCloud</option>
          <option value="nextcloud">Nextcloud</option>
          <option value="caldav">CalDAV</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
        >
          <option value="">All Statuses</option>
          <option value="connected">Connected</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
        <button
          type="button"
          onClick={onFilter}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Connections Table */}
      {connections.length === 0 ? (
        <div className="p-4">
          <EmptyState message="No calendar connections found" icon="📅" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Connected
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                  Last Sync
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {connections.map((conn) => {
                const statusBadge = getStatusBadge(conn.status);
                return (
                  <tr
                    key={conn.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-200">
                        {conn.user_email || conn.user_id.slice(0, 8) + "..."}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{getProviderIcon(conn.provider)}</span>
                        <span className="text-sm text-slate-300">
                          {conn.provider_display_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={statusBadge.type}
                        label={statusBadge.label}
                        size="sm"
                      />
                      {conn.error_message && (
                        <div className="text-xs text-red-400 mt-1 truncate max-w-[200px]">
                          {conn.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
                      {conn.connected_at
                        ? new Date(conn.connected_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">
                      {conn.last_sync_at
                        ? new Date(conn.last_sync_at).toLocaleString()
                        : "Never"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDelete(conn)}
                          className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface StatsTabProps {
  stats: CalendarStats;
  getProviderIcon: (provider: string) => string;
}

function StatsTab({ stats, getProviderIcon }: StatsTabProps) {
  return (
    <div className="space-y-6">
      {/* Provider Breakdown */}
      <DataPanel title="Connections by Provider">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {Object.entries(stats.by_provider).map(([provider, count]) => (
            <div
              key={provider}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 text-center"
            >
              <div className="text-2xl mb-2">{getProviderIcon(provider)}</div>
              <div className="text-2xl font-bold text-slate-200">{count}</div>
              <div className="text-sm text-slate-400 capitalize">
                {provider}
              </div>
            </div>
          ))}
        </div>
      </DataPanel>

      {/* Status Breakdown */}
      <DataPanel title="Connections by Status">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(stats.by_status).map(([status, count]) => (
            <div
              key={status}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
            >
              <div className="text-2xl font-bold text-slate-200">{count}</div>
              <div className="text-sm text-slate-400 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </DataPanel>

      {/* Additional Stats */}
      <DataPanel title="User Statistics">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
            <div className="text-3xl font-bold text-slate-200">
              {stats.users_with_connections}
            </div>
            <div className="text-sm text-slate-400">
              Users with calendar connections
            </div>
          </div>
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
            <div className="text-3xl font-bold text-slate-200">
              {stats.avg_connections_per_user.toFixed(1)}
            </div>
            <div className="text-sm text-slate-400">
              Average connections per user
            </div>
          </div>
        </div>
      </DataPanel>
    </div>
  );
}

interface ProvidersTabProps {
  providers: Record<string, ProviderConfig>;
}

function ProvidersTab({ providers }: ProvidersTabProps) {
  const providerList = Object.entries(providers);

  if (providerList.length === 0) {
    return (
      <DataPanel title="Provider Configuration">
        <EmptyState message="No provider configuration found" icon="⚙️" />
      </DataPanel>
    );
  }

  return (
    <DataPanel title="Provider Configuration">
      <div className="space-y-4">
        {providerList.map(([id, config]) => (
          <div
            key={id}
            className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-slate-200">{config.name}</h4>
              <StatusBadge
                status={config.configured ? "healthy" : "unhealthy"}
                label={config.configured ? "Configured" : "Not Configured"}
                size="sm"
              />
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>Type: {config.type.toUpperCase()}</div>
              {config.type === "oauth" && (
                <>
                  <div>
                    Client ID: {config.client_id_set ? "✅ Set" : "❌ Missing"}
                  </div>
                  <div>
                    Client Secret:{" "}
                    {config.client_secret_set ? "✅ Set" : "❌ Missing"}
                  </div>
                </>
              )}
              {config.notes && (
                <div className="text-slate-500 italic mt-2">{config.notes}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </DataPanel>
  );
}
