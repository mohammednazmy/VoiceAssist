/**
 * Tests for SystemPage - Sprint 4 System Management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SystemPage } from "./SystemPage";

// Mock the useSystem hook
vi.mock("../hooks/useSystem", () => ({
  useSystem: vi.fn(),
}));

// Mock featureFlags
vi.mock("../config/env", () => ({
  featureFlags: {
    metrics: true,
    logs: true,
  },
}));

import { useSystem } from "../hooks/useSystem";

const mockResources = {
  disk_total_gb: 500,
  disk_used_gb: 200,
  disk_free_gb: 300,
  disk_usage_percent: 40,
  memory_total_gb: 32,
  memory_used_gb: 16,
  memory_free_gb: 16,
  memory_usage_percent: 50,
  cpu_count: 8,
  cpu_usage_percent: 25,
  load_average_1m: 1.5,
  load_average_5m: 1.2,
  load_average_15m: 1.0,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockHealth = {
  status: "healthy",
  uptime_seconds: 86400,
  services: {
    api: "healthy",
    database: "healthy",
    redis: "healthy",
  },
  last_checked_at: "2024-01-15T12:00:00Z",
};

const mockBackupStatus = {
  last_backup_at: "2024-01-15T00:00:00Z",
  last_backup_result: "success" as const,
  backup_destination: "/backups/daily",
  schedule: "0 0 * * *",
  retention_days: 30,
  backup_size_mb: 150.5,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockBackupHistory = [
  {
    id: "backup-1",
    started_at: "2024-01-15T00:00:00Z",
    completed_at: "2024-01-15T00:15:00Z",
    status: "success" as const,
    size_bytes: 157286400,
    backup_type: "full" as const,
  },
];

const mockMaintenanceStatus = {
  enabled: false,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockCacheNamespaces = [
  { namespace: "kb", key_count: 500, estimated_size_bytes: 1048576 },
  { namespace: "session", key_count: 100, estimated_size_bytes: 524288 },
];

const defaultMockReturn = {
  resources: mockResources,
  health: mockHealth,
  backupStatus: mockBackupStatus,
  backupHistory: mockBackupHistory,
  maintenanceStatus: mockMaintenanceStatus,
  cacheNamespaces: mockCacheNamespaces,
  loading: false,
  resourcesLoading: false,
  backupLoading: false,
  triggeringBackup: false,
  error: null,
  refresh: vi.fn(),
  refreshResources: vi.fn(),
  refreshBackup: vi.fn(),
  triggerBackup: vi.fn().mockResolvedValue(true),
  enableMaintenance: vi.fn().mockResolvedValue(true),
  disableMaintenance: vi.fn().mockResolvedValue(true),
  invalidateCacheNamespace: vi.fn().mockResolvedValue(true),
};

describe("SystemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSystem).mockReturnValue(defaultMockReturn);
  });

  it("should render loading state", () => {
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      loading: true,
    });

    render(<SystemPage />);

    expect(screen.getByText(/loading system data/i)).toBeInTheDocument();
  });

  it("should render error state", () => {
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      error: "Failed to fetch system data",
    });

    render(<SystemPage />);

    expect(
      screen.getByText(/failed to fetch system data/i),
    ).toBeInTheDocument();
  });

  it("should render system page title", () => {
    render(<SystemPage />);

    expect(screen.getByText("System Management")).toBeInTheDocument();
  });

  it("should render all tabs", () => {
    render(<SystemPage />);

    expect(
      screen.getByRole("button", { name: /overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /backups/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /maintenance/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cache/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /configuration/i }),
    ).toBeInTheDocument();
  });

  it("should display system health status", () => {
    render(<SystemPage />);

    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("should display resource metrics", () => {
    render(<SystemPage />);

    expect(screen.getByText("Disk Usage")).toBeInTheDocument();
    expect(screen.getByText("Memory Usage")).toBeInTheDocument();
    expect(screen.getByText("CPU Usage")).toBeInTheDocument();
  });

  it("should display load average section", () => {
    render(<SystemPage />);

    expect(screen.getByText("Load Average")).toBeInTheDocument();
    expect(screen.getByText("1.50")).toBeInTheDocument();
    expect(screen.getByText("1.20")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
  });

  it("should switch to Backups tab", async () => {
    render(<SystemPage />);

    const backupsTab = screen.getByRole("button", { name: /backups/i });
    fireEvent.click(backupsTab);

    await waitFor(() => {
      expect(screen.getByText("Backup Status")).toBeInTheDocument();
    });
  });

  it("should trigger backup when Start Backup is clicked", async () => {
    const mockTriggerBackup = vi.fn().mockResolvedValue(true);
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      triggerBackup: mockTriggerBackup,
    });

    render(<SystemPage />);

    const backupsTab = screen.getByRole("button", { name: /backups/i });
    fireEvent.click(backupsTab);

    await waitFor(() => {
      expect(screen.getByText("Start Backup")).toBeInTheDocument();
    });

    const startBackupButton = screen.getByText("Start Backup");
    fireEvent.click(startBackupButton);

    await waitFor(() => {
      expect(mockTriggerBackup).toHaveBeenCalledWith("incremental");
    });
  });

  it("should switch to Maintenance tab and show inactive status", async () => {
    render(<SystemPage />);

    const maintenanceTab = screen.getByRole("button", { name: /maintenance/i });
    fireEvent.click(maintenanceTab);

    await waitFor(() => {
      expect(screen.getByText("Maintenance Mode")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
  });

  it("should enable maintenance mode", async () => {
    const mockEnableMaintenance = vi.fn().mockResolvedValue(true);
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      enableMaintenance: mockEnableMaintenance,
    });

    render(<SystemPage />);

    const maintenanceTab = screen.getByRole("button", { name: /maintenance/i });
    fireEvent.click(maintenanceTab);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /enable maintenance mode/i }),
      ).toBeInTheDocument();
    });

    const enableButton = screen.getByRole("button", {
      name: /enable maintenance mode/i,
    });
    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(mockEnableMaintenance).toHaveBeenCalled();
    });
  });

  it("should switch to Cache tab and display namespaces", async () => {
    render(<SystemPage />);

    const cacheTab = screen.getByRole("button", { name: /cache/i });
    fireEvent.click(cacheTab);

    await waitFor(() => {
      expect(screen.getByText("Cache Namespaces")).toBeInTheDocument();
      expect(screen.getByText("kb")).toBeInTheDocument();
      expect(screen.getByText("session")).toBeInTheDocument();
    });
  });

  it("should invalidate cache namespace", async () => {
    const mockInvalidate = vi.fn().mockResolvedValue(true);
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      invalidateCacheNamespace: mockInvalidate,
    });

    render(<SystemPage />);

    const cacheTab = screen.getByRole("button", { name: /cache/i });
    fireEvent.click(cacheTab);

    await waitFor(() => {
      expect(screen.getByText("kb")).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByText("Clear");
    fireEvent.click(clearButtons[0]);

    await waitFor(() => {
      expect(mockInvalidate).toHaveBeenCalledWith("kb");
    });
  });

  it("should switch to Configuration tab", async () => {
    render(<SystemPage />);

    const configTab = screen.getByRole("button", { name: /configuration/i });
    fireEvent.click(configTab);

    await waitFor(() => {
      expect(screen.getByText("Environment Settings")).toBeInTheDocument();
      expect(screen.getByText("Database Configuration")).toBeInTheDocument();
    });
  });

  it("should call refresh when Refresh button is clicked", async () => {
    const mockRefresh = vi.fn();
    vi.mocked(useSystem).mockReturnValue({
      ...defaultMockReturn,
      refresh: mockRefresh,
    });

    render(<SystemPage />);

    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshButton);

    expect(mockRefresh).toHaveBeenCalled();
  });
});
