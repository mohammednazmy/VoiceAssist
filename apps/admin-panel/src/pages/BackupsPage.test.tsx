/**
 * Tests for BackupsPage - Backup status, history, DR, trigger backup
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BackupsPage } from "./BackupsPage";

// Mock hooks
vi.mock("../hooks/useBackups", () => ({
  useBackups: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useBackups } from "../hooks/useBackups";
import { useAuth } from "../contexts/AuthContext";

const mockBackupStatus = {
  last_backup_at: "2024-01-15T08:00:00Z",
  last_backup_result: "success" as const,
  backup_destination: "s3://backups/voiceassist",
  schedule: "0 2 * * *",
  retention_days: 30,
  next_scheduled_at: "2024-01-16T02:00:00Z",
};

const mockBackupHistory = [
  {
    id: "backup-1",
    started_at: "2024-01-15T08:00:00Z",
    completed_at: "2024-01-15T08:15:00Z",
    status: "success" as const,
    size_bytes: 1073741824, // 1GB
    backup_type: "full" as const,
  },
  {
    id: "backup-2",
    started_at: "2024-01-14T08:00:00Z",
    completed_at: "2024-01-14T08:10:00Z",
    status: "success" as const,
    size_bytes: 536870912, // 512MB
    backup_type: "incremental" as const,
  },
  {
    id: "backup-3",
    started_at: "2024-01-13T08:00:00Z",
    completed_at: undefined,
    status: "in_progress" as const,
    size_bytes: undefined,
    backup_type: "full" as const,
  },
];

const mockDRStatus = {
  last_drill_at: "2024-01-01T10:00:00Z",
  last_drill_result: "success" as const,
  rpo_minutes: 60,
  rto_minutes: 30,
  replication_lag_seconds: 5.2,
  replica_status: "healthy" as const,
};

const defaultBackupsReturn = {
  backupStatus: mockBackupStatus,
  backupHistory: mockBackupHistory,
  drStatus: mockDRStatus,
  loading: false,
  error: null,
  lastUpdated: "2024-01-15T12:00:00Z",
  triggeringBackup: false,
  refreshBackupStatus: vi.fn(),
  refreshBackupHistory: vi.fn(),
  refreshDRStatus: vi.fn(),
  refreshAll: vi.fn(),
  triggerBackup: vi.fn().mockResolvedValue(true),
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

describe("BackupsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBackups).mockReturnValue(defaultBackupsReturn);
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
  });

  describe("rendering", () => {
    it("should render page title", () => {
      render(<BackupsPage />);

      expect(
        screen.getByText("Backups & Disaster Recovery"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Manage backups and monitor disaster recovery readiness",
        ),
      ).toBeInTheDocument();
    });

    it("should render health status badge", () => {
      render(<BackupsPage />);

      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("should render tab navigation", () => {
      render(<BackupsPage />);

      expect(screen.getByText("Backup Status")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
      expect(screen.getByText("Disaster Recovery")).toBeInTheDocument();
    });

    it("should render trigger backup button for admin", () => {
      render(<BackupsPage />);

      expect(
        screen.getByRole("button", { name: /trigger backup/i }),
      ).toBeInTheDocument();
    });

    it("should not render trigger backup button for non-admin", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<BackupsPage />);

      expect(
        screen.queryByRole("button", { name: /trigger backup/i }),
      ).not.toBeInTheDocument();
    });

    it("should render refresh button", () => {
      render(<BackupsPage />);

      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading state when loading without data", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        loading: true,
        backupStatus: null,
      });

      render(<BackupsPage />);

      const loadingElements = document.querySelectorAll(".animate-pulse");
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("should show error message when error occurs", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        error: "Failed to load backup data",
      });

      render(<BackupsPage />);

      expect(
        screen.getByText("Failed to load backup data"),
      ).toBeInTheDocument();
    });
  });

  describe("summary stats", () => {
    it("should render stat cards", () => {
      render(<BackupsPage />);

      // Check that all four stat cards are rendered with their titles
      const container = document.querySelector(".grid");
      expect(container).toBeInTheDocument();
      // StatCards render with title in text-sm class
      expect(container?.querySelectorAll(".text-sm").length).toBeGreaterThan(0);
    });

    it("should display backup destination value", () => {
      render(<BackupsPage />);

      // The destination should appear in the stat cards
      const destinations = screen.getAllByText(/s3:\/\/backups\/voiceassist/);
      expect(destinations.length).toBeGreaterThan(0);
    });

    it("should display RPO/RTO values", () => {
      render(<BackupsPage />);

      expect(screen.getByText("60m / 30m")).toBeInTheDocument();
    });
  });

  describe("backup status tab", () => {
    it("should display current backup status", () => {
      render(<BackupsPage />);

      expect(screen.getByText("Current Backup Status")).toBeInTheDocument();
    });

    it("should display backup schedule", () => {
      render(<BackupsPage />);

      expect(screen.getByText("Schedule")).toBeInTheDocument();
      expect(screen.getByText("0 2 * * *")).toBeInTheDocument();
    });

    it("should display backup components", () => {
      render(<BackupsPage />);

      expect(screen.getByText("Backup Components")).toBeInTheDocument();
      expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
      expect(screen.getByText("Redis Cache")).toBeInTheDocument();
      expect(screen.getByText("Qdrant Vectors")).toBeInTheDocument();
      expect(screen.getByText("File Storage")).toBeInTheDocument();
    });
  });

  describe("history tab", () => {
    it("should switch to history tab", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("History"));

      await waitFor(() => {
        expect(screen.getByText("Backup History")).toBeInTheDocument();
      });
    });

    it("should display backup history entries", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("History"));

      await waitFor(() => {
        expect(screen.getByText("Backup History")).toBeInTheDocument();
      });
      // Check that backup sizes are displayed as indicators of entries
      await waitFor(() => {
        expect(screen.getByText("1 GB")).toBeInTheDocument();
      });
    });

    it("should display backup sizes", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("History"));

      await waitFor(() => {
        expect(screen.getByText("1 GB")).toBeInTheDocument();
        expect(screen.getByText("512 MB")).toBeInTheDocument();
      });
    });

    it("should show empty state when no history", async () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        backupHistory: [],
      });

      render(<BackupsPage />);

      fireEvent.click(screen.getByText("History"));

      await waitFor(() => {
        expect(
          screen.getByText("No backup history available"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("disaster recovery tab", () => {
    it("should switch to DR tab", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(screen.getByText("Recovery Objectives")).toBeInTheDocument();
      });
    });

    it("should display RPO value", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(
          screen.getByText("Recovery Point Objective (RPO)"),
        ).toBeInTheDocument();
        expect(screen.getByText("60 minutes")).toBeInTheDocument();
      });
    });

    it("should display RTO value", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(
          screen.getByText("Recovery Time Objective (RTO)"),
        ).toBeInTheDocument();
        expect(screen.getByText("30 minutes")).toBeInTheDocument();
      });
    });

    it("should display replication status", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(screen.getByText("Replication Status")).toBeInTheDocument();
        expect(screen.getByText("Replica Status")).toBeInTheDocument();
      });
    });

    it("should display replication lag", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(screen.getByText("Replication Lag")).toBeInTheDocument();
        expect(screen.getByText("5.2s")).toBeInTheDocument();
      });
    });

    it("should display DR checklist", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByText("Disaster Recovery"));

      await waitFor(() => {
        expect(screen.getByText("DR Checklist")).toBeInTheDocument();
        expect(
          screen.getByText("Database replication active"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Backup verification automated"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Failover procedure documented"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("trigger backup functionality", () => {
    it("should show confirmation dialog when trigger backup clicked", () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByRole("button", { name: /trigger backup/i }));

      expect(screen.getByText("Trigger Manual Backup")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to trigger a manual backup/i),
      ).toBeInTheDocument();
    });

    it("should call triggerBackup when confirmed", async () => {
      const mockTrigger = vi.fn().mockResolvedValue(true);
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        triggerBackup: mockTrigger,
      });

      render(<BackupsPage />);

      fireEvent.click(screen.getByRole("button", { name: /trigger backup/i }));

      const confirmButton = screen.getByRole("button", {
        name: "Start Backup",
      });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockTrigger).toHaveBeenCalled();
      });
    });

    it("should close dialog when cancelled", async () => {
      render(<BackupsPage />);

      fireEvent.click(screen.getByRole("button", { name: /trigger backup/i }));

      expect(screen.getByText("Trigger Manual Backup")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.queryByText("Trigger Manual Backup"),
        ).not.toBeInTheDocument();
      });
    });

    it("should show triggering state on button", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        triggeringBackup: true,
      });

      render(<BackupsPage />);

      expect(screen.getByText("Triggering...")).toBeInTheDocument();
    });

    it("should disable trigger button while triggering", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        triggeringBackup: true,
      });

      render(<BackupsPage />);

      const button = screen.getByRole("button", { name: /triggering/i });
      expect(button).toBeDisabled();
    });
  });

  describe("refresh functionality", () => {
    it("should call refreshAll when refresh clicked", () => {
      const mockRefresh = vi.fn();
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        refreshAll: mockRefresh,
      });

      render(<BackupsPage />);

      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe("status badge variations", () => {
    it("should show In Progress status for in_progress backup", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        backupStatus: {
          ...mockBackupStatus,
          last_backup_result: "in_progress",
        },
      });

      render(<BackupsPage />);

      expect(screen.getByText("In Progress")).toBeInTheDocument();
    });

    it("should show Needs Attention for failed backup", () => {
      vi.mocked(useBackups).mockReturnValue({
        ...defaultBackupsReturn,
        backupStatus: {
          ...mockBackupStatus,
          last_backup_result: "failed",
        },
      });

      render(<BackupsPage />);

      expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    });
  });
});
