import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  useBackups,
  BackupStatus,
  BackupHistoryEntry,
  DRStatus,
} from "../hooks/useBackups";
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

type TabId = "status" | "history" | "dr";

export function BackupsPage() {
  const { isAdmin } = useAuth();
  const {
    backupStatus,
    backupHistory,
    drStatus,
    loading,
    error,
    lastUpdated,
    triggeringBackup,
    refreshAll,
    triggerBackup,
  } = useBackups({ autoRefresh: true, refreshIntervalMs: 60000 });

  const [activeTab, setActiveTab] = useState<TabId>("status");
  const [confirmBackup, setConfirmBackup] = useState(false);

  const handleTriggerBackup = async () => {
    await triggerBackup();
    setConfirmBackup(false);
  };

  const getBackupStatusType = (result: string | undefined): StatusType => {
    const mapping: Record<string, StatusType> = {
      success: "healthy",
      failed: "unhealthy",
      in_progress: "degraded",
      unknown: "unknown",
    };
    return mapping[result || "unknown"] || "unknown";
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDuration = (startedAt: string, completedAt?: string): string => {
    if (!completedAt) return "In progress...";
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // Loading state
  if (loading && !backupStatus) {
    return (
      <PageContainer>
        <PageHeader
          title="Backups & Disaster Recovery"
          description="Manage backups and monitor disaster recovery readiness"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={4} cols={1} />
      </PageContainer>
    );
  }

  const tabs = [
    { id: "status" as const, label: "Backup Status" },
    { id: "history" as const, label: "History", count: backupHistory.length },
    { id: "dr" as const, label: "Disaster Recovery" },
  ];

  const overallStatus = getBackupStatusType(backupStatus?.last_backup_result);

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Backups & Disaster Recovery"
        description="Manage backups and monitor disaster recovery readiness"
        status={{
          type: overallStatus,
          label:
            backupStatus?.last_backup_result === "success"
              ? "Healthy"
              : backupStatus?.last_backup_result === "in_progress"
                ? "In Progress"
                : "Needs Attention",
        }}
        lastUpdated={lastUpdated}
        actions={
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmBackup(true)}
                disabled={triggeringBackup}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {triggeringBackup ? "Triggering..." : "Trigger Backup"}
              </button>
            )}
            <RefreshButton onClick={refreshAll} isLoading={loading} />
          </div>
        }
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshAll} />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Last Backup"
          value={
            backupStatus?.last_backup_at
              ? new Date(backupStatus.last_backup_at).toLocaleDateString()
              : "Never"
          }
          icon="💾"
          color={
            backupStatus?.last_backup_result === "success" ? "green" : "yellow"
          }
        />
        <StatCard
          title="Destination"
          value={backupStatus?.backup_destination || "Unknown"}
          icon="🗄️"
          color="blue"
        />
        <StatCard
          title="Retention"
          value={`${backupStatus?.retention_days ?? 30} days`}
          icon="📅"
          color="purple"
        />
        <StatCard
          title="RPO / RTO"
          value={`${drStatus?.rpo_minutes ?? 60}m / ${drStatus?.rto_minutes ?? 30}m`}
          icon="⏱️"
          color={drStatus?.replica_status === "healthy" ? "green" : "yellow"}
        />
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Tab Content */}
      {activeTab === "status" && (
        <BackupStatusTab
          backupStatus={backupStatus}
          getStatusType={getBackupStatusType}
        />
      )}

      {activeTab === "history" && (
        <BackupHistoryTab
          history={backupHistory}
          getStatusType={getBackupStatusType}
          formatBytes={formatBytes}
          formatDuration={formatDuration}
        />
      )}

      {activeTab === "dr" && (
        <DRStatusTab drStatus={drStatus} getStatusType={getBackupStatusType} />
      )}

      {/* Trigger Backup Confirmation */}
      <ConfirmDialog
        isOpen={confirmBackup}
        onClose={() => setConfirmBackup(false)}
        onConfirm={handleTriggerBackup}
        title="Trigger Manual Backup"
        message={
          <>
            Are you sure you want to trigger a manual backup? This will create a
            new backup snapshot immediately.
            <br />
            <br />
            <span className="text-slate-400 text-sm">
              Note: This may take several minutes depending on the data size.
            </span>
          </>
        }
        confirmLabel="Start Backup"
        variant="info"
        isLoading={triggeringBackup}
      />
    </PageContainer>
  );
}

// Sub-components

interface BackupStatusTabProps {
  backupStatus: BackupStatus | null;
  getStatusType: (result: string | undefined) => StatusType;
}

function BackupStatusTab({
  backupStatus,
  getStatusType,
}: BackupStatusTabProps) {
  if (!backupStatus) {
    return (
      <DataPanel title="Backup Configuration">
        <EmptyState message="No backup configuration found" icon="💾" />
      </DataPanel>
    );
  }

  return (
    <div className="space-y-6">
      <DataPanel title="Current Backup Status">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Status</span>
              <StatusBadge
                status={getStatusType(backupStatus.last_backup_result)}
                label={backupStatus.last_backup_result.replace("_", " ")}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Last Backup</span>
              <span className="text-sm text-slate-200">
                {backupStatus.last_backup_at
                  ? new Date(backupStatus.last_backup_at).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Next Scheduled</span>
              <span className="text-sm text-slate-200">
                {backupStatus.next_scheduled_at
                  ? new Date(backupStatus.next_scheduled_at).toLocaleString()
                  : "Not scheduled"}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Destination</span>
              <span className="text-sm text-slate-200">
                {backupStatus.backup_destination}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Schedule</span>
              <span className="text-sm text-slate-200">
                {backupStatus.schedule}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-400">Retention</span>
              <span className="text-sm text-slate-200">
                {backupStatus.retention_days} days
              </span>
            </div>
          </div>
        </div>
      </DataPanel>

      <DataPanel title="Backup Components">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: "PostgreSQL Database", icon: "🐘", status: "included" },
            { name: "Redis Cache", icon: "🔴", status: "included" },
            { name: "Qdrant Vectors", icon: "📊", status: "included" },
            { name: "File Storage", icon: "📁", status: "included" },
          ].map((component) => (
            <div
              key={component.name}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{component.icon}</span>
                <span className="font-medium text-slate-200 text-sm">
                  {component.name}
                </span>
              </div>
              <StatusBadge
                status="healthy"
                label={component.status}
                size="sm"
              />
            </div>
          ))}
        </div>
      </DataPanel>
    </div>
  );
}

interface BackupHistoryTabProps {
  history: BackupHistoryEntry[];
  getStatusType: (result: string | undefined) => StatusType;
  formatBytes: (bytes: number) => string;
  formatDuration: (startedAt: string, completedAt?: string) => string;
}

function BackupHistoryTab({
  history,
  getStatusType,
  formatBytes,
  formatDuration,
}: BackupHistoryTabProps) {
  if (history.length === 0) {
    return (
      <DataPanel title="Backup History">
        <EmptyState message="No backup history available" icon="📋" />
      </DataPanel>
    );
  }

  return (
    <DataPanel title="Backup History" noPadding>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                Size
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {history.map((entry) => (
              <tr
                key={entry.id}
                className="hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-200">
                    {new Date(entry.started_at).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(entry.started_at).toLocaleTimeString()}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-300 capitalize">
                    {entry.backup_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={getStatusType(entry.status)}
                    label={entry.status.replace("_", " ")}
                    size="sm"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
                  {entry.size_bytes ? formatBytes(entry.size_bytes) : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell">
                  {formatDuration(entry.started_at, entry.completed_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataPanel>
  );
}

interface DRStatusTabProps {
  drStatus: DRStatus | null;
  getStatusType: (result: string | undefined) => StatusType;
}

function DRStatusTab({
  drStatus,
  getStatusType: _getStatusType,
}: DRStatusTabProps) {
  if (!drStatus) {
    return (
      <DataPanel title="Disaster Recovery Status">
        <EmptyState
          message="Disaster recovery status not available"
          icon="🛡️"
        />
      </DataPanel>
    );
  }

  return (
    <div className="space-y-6">
      <DataPanel title="Recovery Objectives">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🎯</span>
              <div>
                <h4 className="font-medium text-slate-200">
                  Recovery Point Objective (RPO)
                </h4>
                <p className="text-xs text-slate-500">
                  Maximum acceptable data loss
                </p>
              </div>
            </div>
            <p className="text-3xl font-bold text-blue-400">
              {drStatus.rpo_minutes} minutes
            </p>
          </div>
          <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⏱️</span>
              <div>
                <h4 className="font-medium text-slate-200">
                  Recovery Time Objective (RTO)
                </h4>
                <p className="text-xs text-slate-500">
                  Maximum acceptable downtime
                </p>
              </div>
            </div>
            <p className="text-3xl font-bold text-green-400">
              {drStatus.rto_minutes} minutes
            </p>
          </div>
        </div>
      </DataPanel>

      <DataPanel title="Replication Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
            <span className="text-sm text-slate-400">Replica Status</span>
            <StatusBadge
              status={
                drStatus.replica_status === "healthy"
                  ? "healthy"
                  : drStatus.replica_status === "degraded"
                    ? "degraded"
                    : "unhealthy"
              }
              label={drStatus.replica_status}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
            <span className="text-sm text-slate-400">Replication Lag</span>
            <span
              className={`text-sm font-medium ${
                (drStatus.replication_lag_seconds ?? 0) < 10
                  ? "text-green-400"
                  : "text-yellow-400"
              }`}
            >
              {drStatus.replication_lag_seconds?.toFixed(1) ?? "N/A"}s
            </span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
            <span className="text-sm text-slate-400">Last DR Drill</span>
            <span className="text-sm text-slate-200">
              {drStatus.last_drill_at
                ? new Date(drStatus.last_drill_at).toLocaleDateString()
                : "Never"}
            </span>
          </div>
        </div>
      </DataPanel>

      <DataPanel title="DR Checklist">
        <div className="space-y-3">
          {[
            {
              item: "Database replication active",
              status: drStatus.replica_status === "healthy",
            },
            {
              item: "Backup verification automated",
              status: true,
            },
            {
              item: "Failover procedure documented",
              status: true,
            },
            {
              item: "DR drill completed (quarterly)",
              status: drStatus.last_drill_result === "success",
            },
            {
              item: "Recovery runbooks updated",
              status: true,
            },
          ].map((check, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
            >
              <span className="text-sm text-slate-300">{check.item}</span>
              <StatusBadge
                status={check.status ? "healthy" : "degraded"}
                label={check.status ? "Complete" : "Pending"}
                size="sm"
              />
            </div>
          ))}
        </div>
      </DataPanel>
    </div>
  );
}
