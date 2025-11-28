/**
 * UnifiedHeader Tests
 * Tests header rendering, title editing, connection status, and action buttons
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UnifiedHeader } from "../UnifiedHeader";
import type { Conversation } from "@voiceassist/types";

// Mock stores
vi.mock("../../../stores/unifiedConversationStore", () => ({
  useUnifiedConversationStore: vi.fn((selector) => {
    const state = {
      voiceModeActive: false,
    };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  }),
  selectConnectionStatus: () => "connected",
}));

vi.mock("../../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

describe("UnifiedHeader", () => {
  const mockConversation: Conversation = {
    id: "conv-1",
    title: "Test Conversation",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultProps = {
    conversation: mockConversation,
    isSidebarOpen: true,
    isContextPaneOpen: true,
    onToggleSidebar: vi.fn(),
    onToggleContextPane: vi.fn(),
    onTitleChange: vi.fn(),
    onExport: vi.fn(),
    onShare: vi.fn(),
    onSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic rendering", () => {
    it("should render conversation title", () => {
      render(<UnifiedHeader {...defaultProps} />);
      expect(screen.getByText("Test Conversation")).toBeInTheDocument();
    });

    it('should render "New Conversation" when no conversation', () => {
      render(<UnifiedHeader {...defaultProps} conversation={null} />);
      expect(screen.getByText("New Conversation")).toBeInTheDocument();
    });

    it("should render connection status", () => {
      render(<UnifiedHeader {...defaultProps} />);
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("should render action buttons", () => {
      render(<UnifiedHeader {...defaultProps} />);

      expect(screen.getByLabelText("Share conversation")).toBeInTheDocument();
      expect(screen.getByLabelText("Export conversation")).toBeInTheDocument();
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });
  });

  describe("panel toggles", () => {
    it("should show sidebar toggle when sidebar closed", () => {
      render(<UnifiedHeader {...defaultProps} isSidebarOpen={false} />);
      expect(screen.getByLabelText("Open sidebar")).toBeInTheDocument();
    });

    it("should not show sidebar toggle when sidebar open (desktop)", () => {
      render(<UnifiedHeader {...defaultProps} isSidebarOpen={true} />);
      expect(screen.queryByLabelText("Open sidebar")).not.toBeInTheDocument();
    });

    it("should show context pane toggle when pane closed", () => {
      render(<UnifiedHeader {...defaultProps} isContextPaneOpen={false} />);
      expect(screen.getByLabelText("Open context pane")).toBeInTheDocument();
    });

    it("should call onToggleSidebar when clicked", () => {
      const onToggleSidebar = vi.fn();
      render(
        <UnifiedHeader
          {...defaultProps}
          isSidebarOpen={false}
          onToggleSidebar={onToggleSidebar}
        />,
      );

      fireEvent.click(screen.getByLabelText("Open sidebar"));
      expect(onToggleSidebar).toHaveBeenCalled();
    });

    it("should call onToggleContextPane when clicked", () => {
      const onToggleContextPane = vi.fn();
      render(
        <UnifiedHeader
          {...defaultProps}
          isContextPaneOpen={false}
          onToggleContextPane={onToggleContextPane}
        />,
      );

      fireEvent.click(screen.getByLabelText("Open context pane"));
      expect(onToggleContextPane).toHaveBeenCalled();
    });
  });

  describe("title editing", () => {
    it("should show edit icon on hover", () => {
      render(<UnifiedHeader {...defaultProps} />);

      const titleButton = screen
        .getByText("Test Conversation")
        .closest("button");
      expect(titleButton).toBeInTheDocument();
    });

    it("should enter edit mode when title clicked", () => {
      render(<UnifiedHeader {...defaultProps} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByLabelText("Save title")).toBeInTheDocument();
      expect(screen.getByLabelText("Cancel editing")).toBeInTheDocument();
    });

    it("should call onTitleChange when saved", async () => {
      const onTitleChange = vi.fn().mockResolvedValue(undefined);
      render(<UnifiedHeader {...defaultProps} onTitleChange={onTitleChange} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Updated Title" } });
      fireEvent.click(screen.getByLabelText("Save title"));

      await waitFor(() => {
        expect(onTitleChange).toHaveBeenCalledWith("Updated Title");
      });
    });

    it("should exit edit mode when cancelled", () => {
      render(<UnifiedHeader {...defaultProps} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      fireEvent.click(screen.getByLabelText("Cancel editing"));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("Test Conversation")).toBeInTheDocument();
    });

    it("should show error for empty title", async () => {
      render(<UnifiedHeader {...defaultProps} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.click(screen.getByLabelText("Save title"));

      await waitFor(() => {
        expect(screen.getByText("Title cannot be empty")).toBeInTheDocument();
      });
    });

    it("should save on Enter key", async () => {
      const onTitleChange = vi.fn().mockResolvedValue(undefined);
      render(<UnifiedHeader {...defaultProps} onTitleChange={onTitleChange} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(onTitleChange).toHaveBeenCalledWith("New Title");
      });
    });

    it("should cancel on Escape key", () => {
      render(<UnifiedHeader {...defaultProps} />);

      fireEvent.click(screen.getByText("Test Conversation"));
      const input = screen.getByRole("textbox");
      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("action buttons", () => {
    it("should call onShare when share clicked", () => {
      const onShare = vi.fn();
      render(<UnifiedHeader {...defaultProps} onShare={onShare} />);

      fireEvent.click(screen.getByLabelText("Share conversation"));
      expect(onShare).toHaveBeenCalled();
    });

    it("should call onExport when export clicked", () => {
      const onExport = vi.fn();
      render(<UnifiedHeader {...defaultProps} onExport={onExport} />);

      fireEvent.click(screen.getByLabelText("Export conversation"));
      expect(onExport).toHaveBeenCalled();
    });

    it("should call onSettings when settings clicked", () => {
      const onSettings = vi.fn();
      render(<UnifiedHeader {...defaultProps} onSettings={onSettings} />);

      fireEvent.click(screen.getByLabelText("Settings"));
      expect(onSettings).toHaveBeenCalled();
    });

    it("should disable share/export when no conversation", () => {
      render(<UnifiedHeader {...defaultProps} conversation={null} />);

      expect(screen.getByLabelText("Share conversation")).toBeDisabled();
      expect(screen.getByLabelText("Export conversation")).toBeDisabled();
    });
  });

  describe("connection status", () => {
    it("should show connected status with green indicator", () => {
      render(<UnifiedHeader {...defaultProps} />);

      const statusIndicator = screen.getByText("Connected").previousSibling;
      expect(statusIndicator).toHaveClass("bg-green-500");
    });
  });
});
