/**
 * Tests for FeatureFlagsPage - Toggle, create, edit, delete flags
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { FeatureFlagsPage } from "./FeatureFlagsPage";

// Mock hooks
vi.mock("../hooks/useFeatureFlagsRealtime", () => ({
  useFeatureFlagsRealtime: vi.fn(),
}));

vi.mock("../hooks/useScheduledChanges", () => ({
  useScheduledChanges: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useFeatureFlagsRealtime } from "../hooks/useFeatureFlagsRealtime";
import { useScheduledChanges } from "../hooks/useScheduledChanges";
import { useAuth } from "../contexts/AuthContext";

const mockFlags = [
  {
    name: "backend.voice_barge_in_quality_preset",
    description: "Barge-in quality preset",
    flag_type: "string" as const,
    enabled: true,
    value: "responsive",
    updated_at: "2024-01-15T10:00:00Z",
  },
  {
    name: "backend.voice_v4_audio_processing",
    description: "Enable server-side audio processing pipeline",
    flag_type: "boolean" as const,
    enabled: true,
    value: undefined,
    updated_at: "2024-01-15T11:00:00Z",
  },
  {
    name: "backend.voice_aec_capability_tuning",
    description: "Enable AEC capability-aware tuning",
    flag_type: "boolean" as const,
    enabled: false,
    value: undefined,
    updated_at: "2024-01-15T12:00:00Z",
  },
  {
    name: "phi_detection_v2",
    description: "Use PHI detection v2 algorithm",
    flag_type: "boolean" as const,
    enabled: false,
    value: undefined,
    updated_at: "2024-01-14T15:00:00Z",
  },
  {
    name: "max_sessions",
    description: "Maximum concurrent sessions per user",
    flag_type: "number" as const,
    enabled: true,
    value: 5,
    updated_at: "2024-01-13T09:00:00Z",
  },
  {
    name: "welcome_message",
    description: "Custom welcome message for users",
    flag_type: "string" as const,
    enabled: true,
    value: "Welcome to VoiceAssist!",
    updated_at: "2024-01-12T12:00:00Z",
  },
  {
    name: "rate_limits",
    description: "API rate limiting configuration",
    flag_type: "json" as const,
    enabled: true,
    value: { requests_per_minute: 60, burst: 10 },
    updated_at: "2024-01-11T08:00:00Z",
  },
];

const defaultFeatureFlagsReturn = {
  flags: mockFlags,
  loading: false,
  error: null,
  lastUpdated: new Date().toISOString(),
  version: 1,
  connected: true,
  connectionMode: "sse" as const,
  reconnectCount: 0,
  eventsReplayed: 0,
  refreshFlags: vi.fn(),
  createFlag: vi.fn().mockResolvedValue(true),
  updateFlag: vi.fn().mockResolvedValue(true),
  deleteFlag: vi.fn().mockResolvedValue(true),
  toggleFlag: vi.fn().mockResolvedValue(true),
  reconnect: vi.fn(),
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

const defaultScheduledChangesReturn = {
  scheduledChanges: [],
  loading: false,
  error: null,
  refreshChanges: vi.fn(),
};

describe("FeatureFlagsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFeatureFlagsRealtime).mockReturnValue(
      defaultFeatureFlagsReturn,
    );
    vi.mocked(useScheduledChanges).mockReturnValue(
      defaultScheduledChangesReturn,
    );
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
  });

  describe("rendering", () => {
    it("should render page title", () => {
      render(<FeatureFlagsPage />);

      expect(
        screen.getByRole("heading", { name: "Feature Flags" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Manage feature flags and rollout configuration"),
      ).toBeInTheDocument();
    });

    it("should render create flag button for admin", () => {
      render(<FeatureFlagsPage />);

      expect(
        screen.getByRole("button", { name: /create flag/i }),
      ).toBeInTheDocument();
    });

    it("should not render create flag button for non-admin", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<FeatureFlagsPage />);

      expect(
        screen.queryByRole("button", { name: /create flag/i }),
      ).not.toBeInTheDocument();
    });

    it("should render refresh button", () => {
      render(<FeatureFlagsPage />);

      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading state when loading without data", () => {
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        loading: true,
        flags: [],
      });

      render(<FeatureFlagsPage />);

      const loadingElements = document.querySelectorAll(".animate-pulse");
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("should show error message when error occurs", () => {
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        error: "Failed to load feature flags",
      });

      render(<FeatureFlagsPage />);

      expect(
        screen.getByText("Failed to load feature flags"),
      ).toBeInTheDocument();
    });
  });

  describe("summary stats", () => {
    it("should display total flags count", () => {
      render(<FeatureFlagsPage />);

      const totalCard = screen.getByText("Total Flags").parentElement
        ?.parentElement as HTMLElement;
      expect(totalCard).toBeTruthy();
      expect(within(totalCard).getByText("5")).toBeInTheDocument();
    });

    it("should display enabled flags count", () => {
      render(<FeatureFlagsPage />);

      const enabledLabel = screen.getAllByText("Enabled")[0];
      const enabledCard = enabledLabel.parentElement
        ?.parentElement as HTMLElement;
      expect(enabledCard).toBeTruthy();
      expect(within(enabledCard).getByText("4")).toBeInTheDocument();
    });

    it("should display disabled flags count", () => {
      render(<FeatureFlagsPage />);

      expect(screen.getByText("Disabled")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("should display boolean flags count", () => {
      render(<FeatureFlagsPage />);

      expect(screen.getByText("Boolean")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("should show voice flags count", () => {
      render(<FeatureFlagsPage />);

      const voiceCard = screen.getByText("Voice Flags").parentElement
        ?.parentElement as HTMLElement;
      expect(voiceCard).toBeTruthy();
      // Three backend.voice_* flags plus no ui.voice_/backend.ws_ in this fixture
      expect(within(voiceCard).getByText("3")).toBeInTheDocument();
    });
  });

  describe("flags list", () => {
    it("should display all flags", () => {
      render(<FeatureFlagsPage />);

      expect(
        screen.getByText("backend.voice_barge_in_quality_preset"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("backend.voice_v4_audio_processing"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("backend.voice_aec_capability_tuning"),
      ).toBeInTheDocument();
      expect(screen.getByText("phi_detection_v2")).toBeInTheDocument();
      expect(screen.getByText("max_sessions")).toBeInTheDocument();
      expect(screen.getByText("welcome_message")).toBeInTheDocument();
      expect(screen.getByText("rate_limits")).toBeInTheDocument();
    });

    it("should display flag descriptions", () => {
      render(<FeatureFlagsPage />);

      expect(
        screen.getByText("Enable new voice mode features"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Maximum concurrent sessions per user"),
      ).toBeInTheDocument();
    });

    it("should display flag type badges", () => {
      render(<FeatureFlagsPage />);

      const booleanBadges = screen.getAllByText("boolean");
      expect(booleanBadges.length).toBe(3);
      expect(screen.getByText("number")).toBeInTheDocument();
      expect(screen.getByText("string")).toBeInTheDocument();
      expect(screen.getByText("json")).toBeInTheDocument();
    });

    it("should display values for non-boolean flags", () => {
      render(<FeatureFlagsPage />);

      expect(screen.getByText(/Value: 5/)).toBeInTheDocument();
      expect(
        screen.getByText(/Value: "Welcome to VoiceAssist!"/),
      ).toBeInTheDocument();
    });

    it("should show empty state when no flags", () => {
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        flags: [],
      });

      render(<FeatureFlagsPage />);

      expect(
        screen.getByText("No feature flags configured"),
      ).toBeInTheDocument();
    });

    it("shows Dictation vs Conversation summary only when Voice Flags filter is active", () => {
      render(<FeatureFlagsPage />);

      // Initially, the summary block should not be present
      expect(
        screen.queryByText(/Dictation vs Conversation presets/i),
      ).not.toBeInTheDocument();

      // Toggle Voice Flags quick filter
      const voiceFilterButton = screen.getByRole("button", {
        name: /voice flags/i,
      });
      fireEvent.click(voiceFilterButton);

      // Summary block should now be visible
      expect(
        screen.getByText(/Dictation vs Conversation presets/i),
      ).toBeInTheDocument();

      // Toggling off should hide the summary again
      fireEvent.click(voiceFilterButton);
      expect(
        screen.queryByText(/Dictation vs Conversation presets/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("toggle functionality", () => {
    it("should render toggle switches for boolean flags", () => {
      render(<FeatureFlagsPage />);

      // Boolean flags have toggle switches
      const toggles = document.querySelectorAll(
        'button[class*="rounded-full"][class*="w-11"]',
      );
      expect(toggles.length).toBeGreaterThanOrEqual(2);
    });

    it("should call toggleFlag when toggle is clicked", async () => {
      const mockToggle = vi.fn().mockResolvedValue(true);
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        toggleFlag: mockToggle,
      });

      render(<FeatureFlagsPage />);

      // Find the first toggle switch (for new_voice_mode)
      const toggles = document.querySelectorAll(
        'button[class*="rounded-full"][class*="w-11"]',
      );
      fireEvent.click(toggles[0]);

      await waitFor(() => {
        expect(mockToggle).toHaveBeenCalledWith("new_voice_mode");
      });
    });

    it("should disable toggles for non-admin users", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<FeatureFlagsPage />);

      const toggles = document.querySelectorAll(
        'button[class*="rounded-full"][class*="w-11"]',
      );
      toggles.forEach((toggle) => {
        expect(toggle.className).toContain("cursor-not-allowed");
      });
    });
  });

  describe("create flag functionality", () => {
    it("should open create modal when create button clicked", async () => {
      render(<FeatureFlagsPage />);

      fireEvent.click(screen.getByRole("button", { name: /create flag/i }));

      await waitFor(() => {
        expect(screen.getByText("Create Feature Flag")).toBeInTheDocument();
      });
    });

    it("should show form fields in create modal", async () => {
      render(<FeatureFlagsPage />);

      fireEvent.click(screen.getByRole("button", { name: /create flag/i }));

      await waitFor(() => {
        const modal = screen
          .getByText("Create Feature Flag")
          .closest("div") as HTMLElement;

        expect(within(modal).getByText("Name")).toBeInTheDocument();
        expect(within(modal).getByText("Description")).toBeInTheDocument();
        expect(within(modal).getByText("Type")).toBeInTheDocument();
        expect(within(modal).getByText("Enabled")).toBeInTheDocument();
      });
    });

    it("should call createFlag when form submitted", async () => {
      const mockCreate = vi.fn().mockResolvedValue(true);
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        createFlag: mockCreate,
      });

      render(<FeatureFlagsPage />);

      fireEvent.click(screen.getByRole("button", { name: /create flag/i }));

      await waitFor(() => {
        expect(screen.getByText("Create Feature Flag")).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText("feature_name");
      const descInput = screen.getByPlaceholderText(
        /describe what this flag controls/i,
      );

      fireEvent.change(nameInput, { target: { value: "test_flag" } });
      fireEvent.change(descInput, { target: { value: "Test description" } });

      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith({
          name: "test_flag",
          description: "Test description",
          flag_type: "boolean",
          enabled: false,
          value: undefined,
        });
      });
    });

    it("should close modal when cancelled", async () => {
      render(<FeatureFlagsPage />);

      fireEvent.click(screen.getByRole("button", { name: /create flag/i }));

      await waitFor(() => {
        expect(screen.getByText("Create Feature Flag")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.queryByText("Create Feature Flag"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("edit flag functionality", () => {
    it("should show edit button for admins", () => {
      render(<FeatureFlagsPage />);

      const editButtons = screen.getAllByRole("button", { name: /edit/i });
      expect(editButtons.length).toBe(6);
    });

    it("should not show edit button for non-admins", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<FeatureFlagsPage />);

      const editButtons = screen.queryAllByRole("button", { name: /edit/i });
      expect(editButtons.length).toBe(0);
    });

    it("should open edit modal when edit clicked", async () => {
      render(<FeatureFlagsPage />);

      const editButtons = screen.getAllByRole("button", { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Edit: new_voice_mode/)).toBeInTheDocument();
      });
    });

    it("should pre-populate form with flag data", async () => {
      render(<FeatureFlagsPage />);

      const editButtons = screen.getAllByRole("button", { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue("new_voice_mode");
        expect(nameInput).toBeDisabled();
        expect(
          screen.getByDisplayValue("Enable new voice mode features"),
        ).toBeInTheDocument();
      });
    });

    it("should call updateFlag when form submitted", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        updateFlag: mockUpdate,
      });

      render(<FeatureFlagsPage />);

      const editButtons = screen.getAllByRole("button", { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Edit: new_voice_mode/)).toBeInTheDocument();
      });

      const descInput = screen.getByDisplayValue(
        "Enable new voice mode features",
      );
      fireEvent.change(descInput, { target: { value: "Updated description" } });

      fireEvent.click(screen.getByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          "new_voice_mode",
          expect.objectContaining({
            description: "Updated description",
          }),
        );
      });
    });
  });

  describe("delete flag functionality", () => {
    it("should show delete button for admins", () => {
      render(<FeatureFlagsPage />);

      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      expect(deleteButtons.length).toBe(6);
    });

    it("should not show delete button for non-admins", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isAdmin: false,
      } as ReturnType<typeof useAuth>);

      render(<FeatureFlagsPage />);

      const deleteButtons = screen.queryAllByRole("button", {
        name: /delete/i,
      });
      expect(deleteButtons.length).toBe(0);
    });

    it("should show confirmation dialog when delete clicked", async () => {
      render(<FeatureFlagsPage />);

      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Delete Feature Flag")).toBeInTheDocument();
        expect(
          screen.getByText(/Are you sure you want to delete the feature flag/i),
        ).toBeInTheDocument();
      });
    });

    it("should call deleteFlag when confirmed", async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        deleteFlag: mockDelete,
      });

      render(<FeatureFlagsPage />);

      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Delete Feature Flag")).toBeInTheDocument();
      });

      // The dialog confirmation button is the last "Delete" button in the DOM
      // Get all delete buttons again and click the last one (confirm button)
      const allDeleteButtons = screen.getAllByRole("button", {
        name: /delete/i,
      });
      const confirmButton = allDeleteButtons[allDeleteButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith("new_voice_mode");
      });
    });

    it("should close dialog when cancelled", async () => {
      render(<FeatureFlagsPage />);

      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Delete Feature Flag")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.queryByText("Delete Feature Flag"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("refresh functionality", () => {
    it("should call refreshFlags when refresh clicked", () => {
      const mockRefresh = vi.fn();
      vi.mocked(useFeatureFlagsRealtime).mockReturnValue({
        ...defaultFeatureFlagsReturn,
        refreshFlags: mockRefresh,
      });

      render(<FeatureFlagsPage />);

      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
