/**
 * SystemPage - Sprint 4 Enhanced System Management
 * Features: Resource monitoring, backup controls, maintenance mode, cache management
 */

import { useState } from "react";
import { featureFlags } from "../config/env";
import { useSystem } from "../hooks/useSystem";

type TabId = "overview" | "backups" | "maintenance" | "cache" | "config";

interface SystemConfig {
  environment: string;
  debug: boolean;
  api_version: string;
  database_pool_size: number;
  redis_max_connections: number;
}

export function SystemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const {
    resources,
    health,
    backupStatus,
    backupHistory,
    maintenanceStatus,
    cacheNamespaces,
    loading,
    resourcesLoading,
    backupLoading,
    triggeringBackup,
    error,
    refresh,
    triggerBackup,
    enableMaintenance,
    disableMaintenance,
    invalidateCacheNamespace,
  } = useSystem({ autoRefresh: true, refreshInterval: 30000 });

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "backups", label: "Backups" },
    { id: "maintenance", label: "Maintenance" },
    { id: "cache", label: "Cache" },
    { id: "config", label: "Configuration" },
  ];

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-slate-400">Loading system data...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            System Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor resources, manage backups, and control system settings
          </p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-950/50 border border-red-900 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          resources={resources}
          health={health}
          resourcesLoading={resourcesLoading}
        />
      )}
      {activeTab === "backups" && (
        <BackupsTab
          backupStatus={backupStatus}
          backupHistory={backupHistory}
          backupLoading={backupLoading}
          triggeringBackup={triggeringBackup}
          onTriggerBackup={triggerBackup}
        />
      )}
      {activeTab === "maintenance" && (
        <MaintenanceTab
          maintenanceStatus={maintenanceStatus}
          onEnableMaintenance={enableMaintenance}
          onDisableMaintenance={disableMaintenance}
        />
      )}
      {activeTab === "cache" && (
        <CacheTab
          cacheNamespaces={cacheNamespaces}
          onInvalidateNamespace={invalidateCacheNamespace}
        />
      )}
      {activeTab === "config" && <ConfigurationTab />}
    </div>
  );
}

// =============================================================================
// Overview Tab - Resource Monitoring
// =============================================================================

interface OverviewTabProps {
  resources: ReturnType<typeof useSystem>["resources"];
  health: ReturnType<typeof useSystem>["health"];
  resourcesLoading: boolean;
}

function OverviewTab({
  resources,
  health,
  resourcesLoading,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* System Health */}
      {health && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            System Health
          </h2>
          <div className="flex items-center space-x-4">
            <HealthBadge status={health.status} />
            <div className="text-sm text-slate-400">
              Uptime: {formatUptime(health.uptime_seconds)}
            </div>
          </div>
          {health.services && Object.keys(health.services).length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(health.services).map(([service, status]) => (
                <div
                  key={service}
                  className="flex items-center space-x-2 text-sm"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status === "healthy"
                        ? "bg-green-500"
                        : status === "degraded"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="text-slate-300 capitalize">{service}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resource Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Disk Usage */}
        <ResourceCard
          title="Disk Usage"
          icon="💾"
          loading={resourcesLoading}
          current={resources?.disk_used_gb ?? 0}
          total={resources?.disk_total_gb ?? 0}
          percent={resources?.disk_usage_percent ?? 0}
          unit="GB"
          warningThreshold={80}
          criticalThreshold={90}
        />

        {/* Memory Usage */}
        <ResourceCard
          title="Memory Usage"
          icon="🧠"
          loading={resourcesLoading}
          current={resources?.memory_used_gb ?? 0}
          total={resources?.memory_total_gb ?? 0}
          percent={resources?.memory_usage_percent ?? 0}
          unit="GB"
          warningThreshold={75}
          criticalThreshold={90}
        />

        {/* CPU Usage */}
        <ResourceCard
          title="CPU Usage"
          icon="⚡"
          loading={resourcesLoading}
          current={resources?.cpu_usage_percent ?? 0}
          total={100}
          percent={resources?.cpu_usage_percent ?? 0}
          unit="%"
          warningThreshold={70}
          criticalThreshold={85}
          showAsPercentOnly
        />
      </div>

      {/* Load Average */}
      {resources && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            Load Average
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <LoadAverageCard
              label="1 min"
              value={resources.load_average_1m}
              cpuCount={resources.cpu_count}
            />
            <LoadAverageCard
              label="5 min"
              value={resources.load_average_5m}
              cpuCount={resources.cpu_count}
            />
            <LoadAverageCard
              label="15 min"
              value={resources.load_average_15m}
              cpuCount={resources.cpu_count}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            CPU Cores: {resources.cpu_count} - Load above {resources.cpu_count}{" "}
            indicates system is overloaded
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Backups Tab
// =============================================================================

interface BackupsTabProps {
  backupStatus: ReturnType<typeof useSystem>["backupStatus"];
  backupHistory: ReturnType<typeof useSystem>["backupHistory"];
  backupLoading: boolean;
  triggeringBackup: boolean;
  onTriggerBackup: (type: "full" | "incremental") => Promise<boolean>;
}

function BackupsTab({
  backupStatus,
  backupHistory,
  backupLoading,
  triggeringBackup,
  onTriggerBackup,
}: BackupsTabProps) {
  const [selectedType, setSelectedType] = useState<"full" | "incremental">(
    "incremental",
  );

  const handleTriggerBackup = async () => {
    const success = await onTriggerBackup(selectedType);
    if (!success) {
      alert("Failed to trigger backup. Please check logs.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Backup Status */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Backup Status
        </h2>
        {backupStatus ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Last Backup</span>
                <span className="text-sm text-slate-200">
                  {backupStatus.last_backup_at
                    ? formatDate(backupStatus.last_backup_at)
                    : "Never"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Status</span>
                <BackupStatusBadge status={backupStatus.last_backup_result} />
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Size</span>
                <span className="text-sm text-slate-200">
                  {backupStatus.backup_size_mb
                    ? `${backupStatus.backup_size_mb.toFixed(1)} MB`
                    : "N/A"}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Destination</span>
                <span className="text-sm text-slate-200 truncate max-w-48">
                  {backupStatus.backup_destination}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Schedule</span>
                <span className="text-sm text-slate-200">
                  {backupStatus.schedule}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Retention</span>
                <span className="text-sm text-slate-200">
                  {backupStatus.retention_days} days
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No backup status available</p>
        )}
      </div>

      {/* Manual Backup */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Manual Backup
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedType}
            onChange={(e) =>
              setSelectedType(e.target.value as "full" | "incremental")
            }
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="incremental">Incremental</option>
            <option value="full">Full</option>
          </select>
          <button
            onClick={handleTriggerBackup}
            disabled={triggeringBackup}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
          >
            {triggeringBackup ? "Starting..." : "Start Backup"}
          </button>
          <p className="text-xs text-slate-500">
            Full backups include all data; incremental backups only include
            changes since last backup.
          </p>
        </div>
      </div>

      {/* Backup History */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Backup History
        </h2>
        {backupLoading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : backupHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Started
                  </th>
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Type
                  </th>
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Status
                  </th>
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Size
                  </th>
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {backupHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800">
                    <td className="py-2 text-slate-300">
                      {formatDate(entry.started_at)}
                    </td>
                    <td className="py-2 text-slate-300 capitalize">
                      {entry.backup_type}
                    </td>
                    <td className="py-2">
                      <BackupStatusBadge status={entry.status} />
                    </td>
                    <td className="py-2 text-slate-300">
                      {entry.size_bytes ? formatBytes(entry.size_bytes) : "N/A"}
                    </td>
                    <td className="py-2 text-slate-300">
                      {entry.completed_at
                        ? formatDuration(entry.started_at, entry.completed_at)
                        : "In progress"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No backup history available</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Maintenance Tab
// =============================================================================

interface MaintenanceTabProps {
  maintenanceStatus: ReturnType<typeof useSystem>["maintenanceStatus"];
  onEnableMaintenance: (
    message?: string,
    durationMinutes?: number,
  ) => Promise<boolean>;
  onDisableMaintenance: () => Promise<boolean>;
}

function MaintenanceTab({
  maintenanceStatus,
  onEnableMaintenance,
  onDisableMaintenance,
}: MaintenanceTabProps) {
  const [message, setMessage] = useState("System is under maintenance");
  const [duration, setDuration] = useState(30);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const handleEnable = async () => {
    setEnabling(true);
    const success = await onEnableMaintenance(message, duration);
    setEnabling(false);
    if (!success) {
      alert("Failed to enable maintenance mode");
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    const success = await onDisableMaintenance();
    setDisabling(false);
    if (!success) {
      alert("Failed to disable maintenance mode");
    }
  };

  const isActive = maintenanceStatus?.enabled ?? false;

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div
        className={`border rounded-lg p-6 ${
          isActive
            ? "bg-yellow-950/50 border-yellow-900"
            : "bg-slate-900/50 border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">
              Maintenance Mode
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {isActive
                ? "Maintenance mode is currently active"
                : "System is operating normally"}
            </p>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              isActive
                ? "bg-yellow-600/20 text-yellow-400"
                : "bg-green-600/20 text-green-400"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </div>
        </div>

        {isActive && maintenanceStatus && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Started At</span>
              <span className="text-slate-200">
                {maintenanceStatus.started_at
                  ? formatDate(maintenanceStatus.started_at)
                  : "Unknown"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Started By</span>
              <span className="text-slate-200">
                {maintenanceStatus.started_by ?? "Unknown"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Message</span>
              <span className="text-slate-200">
                {maintenanceStatus.message ?? "No message"}
              </span>
            </div>
            {maintenanceStatus.estimated_end && (
              <div className="flex justify-between">
                <span className="text-slate-400">Estimated End</span>
                <span className="text-slate-200">
                  {formatDate(maintenanceStatus.estimated_end)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enable/Disable Controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          {isActive ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
        </h2>

        {!isActive ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Maintenance Message
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="System is under maintenance"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Estimated Duration (minutes)
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="5"
                max="1440"
              />
            </div>
            <button
              onClick={handleEnable}
              disabled={enabling}
              className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
            >
              {enabling ? "Enabling..." : "Enable Maintenance Mode"}
            </button>
            <p className="text-xs text-slate-500">
              Warning: Users will see a maintenance page and API requests may be
              restricted.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Click below to disable maintenance mode and restore normal
              operations.
            </p>
            <button
              onClick={handleDisable}
              disabled={disabling}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
            >
              {disabling ? "Disabling..." : "Disable Maintenance Mode"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Cache Tab
// =============================================================================

interface CacheTabProps {
  cacheNamespaces: ReturnType<typeof useSystem>["cacheNamespaces"];
  onInvalidateNamespace: (namespace: string) => Promise<boolean>;
}

function CacheTab({ cacheNamespaces, onInvalidateNamespace }: CacheTabProps) {
  const [invalidating, setInvalidating] = useState<string | null>(null);

  const handleInvalidate = async (namespace: string) => {
    setInvalidating(namespace);
    const success = await onInvalidateNamespace(namespace);
    setInvalidating(null);
    if (!success) {
      alert(`Failed to invalidate namespace: ${namespace}`);
    }
  };

  const totalKeys = cacheNamespaces.reduce((sum, ns) => sum + ns.key_count, 0);
  const totalSize = cacheNamespaces.reduce(
    (sum, ns) => sum + ns.estimated_size_bytes,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-sm text-slate-400">Total Namespaces</div>
          <div className="text-2xl font-bold text-slate-100">
            {cacheNamespaces.length}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-sm text-slate-400">Total Keys</div>
          <div className="text-2xl font-bold text-slate-100">
            {totalKeys.toLocaleString()}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-sm text-slate-400">Estimated Size</div>
          <div className="text-2xl font-bold text-slate-100">
            {formatBytes(totalSize)}
          </div>
        </div>
      </div>

      {/* Namespace List */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Cache Namespaces
        </h2>
        {cacheNamespaces.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 text-slate-400 font-medium">
                    Namespace
                  </th>
                  <th className="text-right py-2 text-slate-400 font-medium">
                    Keys
                  </th>
                  <th className="text-right py-2 text-slate-400 font-medium">
                    Size
                  </th>
                  <th className="text-right py-2 text-slate-400 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {cacheNamespaces.map((ns) => (
                  <tr key={ns.namespace} className="border-b border-slate-800">
                    <td className="py-3 text-slate-300 font-mono">
                      {ns.namespace}
                    </td>
                    <td className="py-3 text-slate-300 text-right">
                      {ns.key_count.toLocaleString()}
                    </td>
                    <td className="py-3 text-slate-300 text-right">
                      {formatBytes(ns.estimated_size_bytes)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleInvalidate(ns.namespace)}
                        disabled={invalidating === ns.namespace}
                        className="px-3 py-1 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded transition-colors disabled:opacity-50"
                      >
                        {invalidating === ns.namespace
                          ? "Clearing..."
                          : "Clear"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">
            No cache namespaces found or cache is empty.
          </p>
        )}
      </div>

      {/* Warning */}
      <div className="text-xs text-slate-500 p-4 bg-yellow-950/30 border border-yellow-900/50 rounded-lg">
        <strong>Warning:</strong> Clearing cache namespaces will remove all
        cached data for that namespace. This may temporarily increase latency as
        the cache is repopulated.
      </div>
    </div>
  );
}

// =============================================================================
// Configuration Tab (Original functionality)
// =============================================================================

function ConfigurationTab() {
  const [config, setConfig] = useState<SystemConfig>({
    environment: "production",
    debug: false,
    api_version: "2.0",
    database_pool_size: 20,
    redis_max_connections: 50,
  });

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaved(true);
    setLoading(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Environment Settings */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">
          Environment Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Environment
            </label>
            <select
              value={config.environment}
              onChange={(e) =>
                setConfig({ ...config, environment: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              API Version
            </label>
            <input
              type="text"
              value={config.api_version}
              onChange={(e) =>
                setConfig({ ...config, api_version: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              readOnly
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="debug"
            checked={config.debug}
            onChange={(e) => setConfig({ ...config, debug: e.target.checked })}
            className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
          />
          <label htmlFor="debug" className="text-sm font-medium text-slate-300">
            Enable debug mode
          </label>
        </div>
      </div>

      {/* Database Settings */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">
          Database Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Connection Pool Size
            </label>
            <input
              type="number"
              value={config.database_pool_size}
              onChange={(e) =>
                setConfig({
                  ...config,
                  database_pool_size: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Current: {config.database_pool_size} connections
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Redis Max Connections
            </label>
            <input
              type="number"
              value={config.redis_max_connections}
              onChange={(e) =>
                setConfig({
                  ...config,
                  redis_max_connections: parseInt(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="200"
            />
            <p className="mt-1 text-xs text-slate-500">
              Current: {config.redis_max_connections} connections
            </p>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Feature Flags</h2>

        <p className="text-xs text-slate-400">
          Loaded from deployment config: metrics reporting is
          <span className="font-semibold text-slate-200">
            {featureFlags.metrics ? " enabled" : " disabled"}
          </span>
          , audit logging is
          <span className="font-semibold text-slate-200">
            {featureFlags.logs ? " enabled" : " disabled"}
          </span>
          .
        </p>

        <div className="space-y-3">
          <FeatureToggle
            id="voice-mode"
            label="Voice Mode (WebRTC)"
            description="Enable real-time voice interaction via WebRTC"
            enabled={true}
          />
          <FeatureToggle
            id="rag-search"
            label="RAG Search"
            description="Enable semantic search in knowledge base"
            enabled={true}
          />
          <FeatureToggle
            id="nextcloud-sync"
            label="Nextcloud Integration"
            description="Automatic file indexing from Nextcloud"
            enabled={false}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center space-x-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
        >
          {loading ? "Saving..." : "Save Configuration"}
        </button>

        {saved && (
          <span className="text-sm text-green-400">Configuration saved</span>
        )}
      </div>

      <div className="text-xs text-slate-500 p-4 bg-yellow-950/30 border border-yellow-900/50 rounded-lg">
        <strong>Note:</strong> Some configuration changes require a service
        restart to take effect.
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function HealthBadge({ status }: { status: string }) {
  const colors = {
    healthy: "bg-green-600/20 text-green-400",
    degraded: "bg-yellow-600/20 text-yellow-400",
    unhealthy: "bg-red-600/20 text-red-400",
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status as keyof typeof colors] || colors.unhealthy}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function BackupStatusBadge({
  status,
}: {
  status: "success" | "failed" | "in_progress" | "unknown";
}) {
  const colors = {
    success: "bg-green-600/20 text-green-400",
    failed: "bg-red-600/20 text-red-400",
    in_progress: "bg-blue-600/20 text-blue-400",
    unknown: "bg-slate-600/20 text-slate-400",
  };
  const labels = {
    success: "Success",
    failed: "Failed",
    in_progress: "In Progress",
    unknown: "Unknown",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

interface ResourceCardProps {
  title: string;
  icon: string;
  loading: boolean;
  current: number;
  total: number;
  percent: number;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  showAsPercentOnly?: boolean;
}

function ResourceCard({
  title,
  icon,
  loading,
  current,
  total,
  percent,
  unit,
  warningThreshold,
  criticalThreshold,
  showAsPercentOnly = false,
}: ResourceCardProps) {
  const getColor = () => {
    if (percent >= criticalThreshold) return "text-red-400";
    if (percent >= warningThreshold) return "text-yellow-400";
    return "text-green-400";
  };

  const getBarColor = () => {
    if (percent >= criticalThreshold) return "bg-red-500";
    if (percent >= warningThreshold) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span>{icon}</span>
          <span className="text-sm font-medium text-slate-300">{title}</span>
        </div>
        {loading && (
          <span className="text-xs text-slate-500 animate-pulse">
            Updating...
          </span>
        )}
      </div>
      <div className={`text-2xl font-bold ${getColor()}`}>
        {showAsPercentOnly
          ? `${percent.toFixed(1)}%`
          : `${current.toFixed(1)} / ${total.toFixed(1)} ${unit}`}
      </div>
      <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor()} transition-all duration-300`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {percent.toFixed(1)}% used
      </div>
    </div>
  );
}

function LoadAverageCard({
  label,
  value,
  cpuCount,
}: {
  label: string;
  value: number;
  cpuCount: number;
}) {
  const ratio = value / cpuCount;
  const getColor = () => {
    if (ratio >= 1) return "text-red-400";
    if (ratio >= 0.7) return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <div className="text-center p-3 bg-slate-800/50 rounded-lg">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${getColor()}`}>
        {value.toFixed(2)}
      </div>
    </div>
  );
}

function FeatureToggle({
  id,
  label,
  description,
  enabled,
}: {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <div className="flex items-start justify-between p-3 bg-slate-800/50 rounded-lg">
      <div className="flex-1">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-300"
        >
          {label}
        </label>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        onClick={() => setIsEnabled(!isEnabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
          isEnabled ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out ${
            isEnabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  return `${minutes}m ${seconds}s`;
}
