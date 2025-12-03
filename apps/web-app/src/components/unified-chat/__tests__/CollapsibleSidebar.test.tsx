/**
 * CollapsibleSidebar Tests
 * Tests sidebar visibility, conversation list, and mobile overlay behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { CollapsibleSidebar } from "../CollapsibleSidebar";

// Mock hooks
vi.mock("../../../hooks/useConversations", () => ({
  useConversations: () => ({
    conversations: [
      {
        id: "conv-1",
        title: "Test Conversation 1",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "conv-2",
        title: "Test Conversation 2",
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
    deleteConversation: vi.fn(),
    archiveConversation: vi.fn(),
  }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock("../../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe("CollapsibleSidebar", () => {
  const defaultProps = {
    isOpen: true,
    onToggle: vi.fn(),
    conversationId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("open state", () => {
    it("should render conversation list when open", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      expect(screen.getByText("Conversations")).toBeInTheDocument();
      expect(screen.getByText("Test Conversation 1")).toBeInTheDocument();
      expect(screen.getByText("Test Conversation 2")).toBeInTheDocument();
    });

    it("should render search input when open", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      expect(
        screen.getByPlaceholderText("Search conversations..."),
      ).toBeInTheDocument();
    });

    it("should render new conversation button when open", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      expect(screen.getByText("New Conversation")).toBeInTheDocument();
    });

    it("should render close button when open", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      expect(screen.getByLabelText("Close sidebar")).toBeInTheDocument();
    });

    it("should call onToggle when close button clicked", () => {
      const onToggle = vi.fn();
      renderWithRouter(
        <CollapsibleSidebar {...defaultProps} onToggle={onToggle} />,
      );

      fireEvent.click(screen.getByLabelText("Close sidebar"));
      expect(onToggle).toHaveBeenCalled();
    });
  });

  describe("collapsed state", () => {
    it("should render minimal sidebar when collapsed", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} isOpen={false} />);

      expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Open sidebar")).toBeInTheDocument();
      expect(screen.getByLabelText("New conversation")).toBeInTheDocument();
    });

    it("should call onToggle when open button clicked", () => {
      const onToggle = vi.fn();
      renderWithRouter(
        <CollapsibleSidebar
          {...defaultProps}
          isOpen={false}
          onToggle={onToggle}
        />,
      );

      fireEvent.click(screen.getByLabelText("Open sidebar"));
      expect(onToggle).toHaveBeenCalled();
    });
  });

  describe("active conversation", () => {
    it("should highlight active conversation", () => {
      renderWithRouter(
        <CollapsibleSidebar {...defaultProps} conversationId="conv-1" />,
      );

      const conversationItem = screen
        .getByText("Test Conversation 1")
        .closest('[role="button"]');
      expect(conversationItem).toHaveClass("bg-primary-100");
    });

    it("should not highlight inactive conversations", () => {
      renderWithRouter(
        <CollapsibleSidebar {...defaultProps} conversationId="conv-1" />,
      );

      const conversationItem = screen
        .getByText("Test Conversation 2")
        .closest('[role="button"]');
      expect(conversationItem).not.toHaveClass("bg-primary-100");
    });
  });

  describe("pinning", () => {
    it("should toggle pin when pin button clicked", async () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      // Hover to reveal actions
      const conversationItem = screen
        .getByText("Test Conversation 1")
        .closest("li");
      if (conversationItem) {
        fireEvent.mouseEnter(conversationItem);
      }

      const pinButton = screen.getAllByTitle("Pin")[0];
      fireEvent.click(pinButton);

      // Check localStorage was updated
      const pinnedIds = JSON.parse(
        localStorage.getItem("voiceassist_pinned_conversations") || "[]",
      );
      expect(pinnedIds).toContain("conv-1");
    });
  });

  describe("accessibility", () => {
    it("should have navigation landmark when open", () => {
      renderWithRouter(<CollapsibleSidebar {...defaultProps} />);

      const nav = screen.getByRole("navigation");
      expect(nav).toHaveAttribute("aria-label", "Conversation history");
    });
  });
});

describe("CollapsibleSidebar - Mobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Override useIsMobile to return true
    vi.doMock("../../../hooks/useIsMobile", () => ({
      useIsMobile: () => true,
    }));
  });

  it("should render nothing when closed on mobile", async () => {
    // Re-import with mobile mock
    vi.resetModules();
    vi.doMock("../../../hooks/useIsMobile", () => ({
      useIsMobile: () => true,
    }));

    const { CollapsibleSidebar: MobileSidebar } =
      await import("../CollapsibleSidebar");

    const { container } = render(
      <BrowserRouter>
        <MobileSidebar
          isOpen={false}
          onToggle={vi.fn()}
          conversationId={null}
        />
      </BrowserRouter>,
    );

    // On mobile when closed, should render null
    expect(container.firstChild).toBeNull();
  });
});
