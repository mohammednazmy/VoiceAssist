/**
 * CollapsibleContextPane Tests
 * Tests context pane tabs, citations, clinical context, and branches
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleContextPane } from "../CollapsibleContextPane";

// Mock stores
vi.mock("../../../stores/unifiedConversationStore", () => ({
  useUnifiedConversationStore: (selector: (state: any) => any) => {
    const state = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Test response",
          metadata: {
            citations: [
              {
                id: "cit-1",
                title: "Test Citation",
                reference: "Test Reference",
                url: "https://example.com",
              },
            ],
          },
        },
      ],
    };
    return selector(state);
  },
}));

vi.mock("../../../hooks/useClinicalContext", () => ({
  useClinicalContext: () => ({
    context: null,
    isLoading: false,
    error: null,
    saveContext: vi.fn(),
    deleteContext: vi.fn(),
    hasContext: false,
  }),
}));

vi.mock("../../../hooks/useBranching", () => ({
  useBranching: () => ({
    branches: [],
    currentBranchId: "main",
    isLoading: false,
    error: null,
    switchBranch: vi.fn(),
  }),
}));

vi.mock("../../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

describe("CollapsibleContextPane", () => {
  const defaultProps = {
    isOpen: true,
    onToggle: vi.fn(),
    conversationId: "conv-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("open state", () => {
    it("should render tabs when open", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      expect(screen.getByText("Citations")).toBeInTheDocument();
      expect(screen.getByText("Clinical")).toBeInTheDocument();
      expect(screen.getByText("Branches")).toBeInTheDocument();
    });

    it("should render header with close button", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      expect(screen.getByText("Context")).toBeInTheDocument();
      expect(screen.getByLabelText("Close context pane")).toBeInTheDocument();
    });

    it("should call onToggle when close button clicked", () => {
      const onToggle = vi.fn();
      render(<CollapsibleContextPane {...defaultProps} onToggle={onToggle} />);

      fireEvent.click(screen.getByLabelText("Close context pane"));
      expect(onToggle).toHaveBeenCalled();
    });
  });

  describe("collapsed state", () => {
    it("should render minimal pane when collapsed", () => {
      render(<CollapsibleContextPane {...defaultProps} isOpen={false} />);

      expect(screen.queryByText("Context")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Open context pane")).toBeInTheDocument();
    });

    it("should call onToggle when open button clicked", () => {
      const onToggle = vi.fn();
      render(
        <CollapsibleContextPane
          {...defaultProps}
          isOpen={false}
          onToggle={onToggle}
        />,
      );

      fireEvent.click(screen.getByLabelText("Open context pane"));
      expect(onToggle).toHaveBeenCalled();
    });
  });

  describe("tabs", () => {
    it("should show citations tab by default", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      const citationsTab = screen.getByRole("tab", { name: /citations/i });
      expect(citationsTab).toHaveAttribute("aria-selected", "true");
    });

    it("should switch to clinical tab when clicked", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      fireEvent.click(screen.getByText("Clinical"));

      const clinicalTab = screen.getByRole("tab", { name: /clinical/i });
      expect(clinicalTab).toHaveAttribute("aria-selected", "true");
    });

    it("should switch to branches tab when clicked", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      fireEvent.click(screen.getByText("Branches"));

      const branchesTab = screen.getByRole("tab", { name: /branches/i });
      expect(branchesTab).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("citations tab", () => {
    it("should render citation from message", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      expect(screen.getByText("Test Citation")).toBeInTheDocument();
    });

    it("should render search input", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      expect(
        screen.getByPlaceholderText("Search citations..."),
      ).toBeInTheDocument();
    });

    it("should filter citations by search", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search citations...");
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });

      expect(
        screen.getByText("No citations match your search"),
      ).toBeInTheDocument();
    });

    it("should show citation count", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      expect(screen.getByText(/1 of 1 citations/i)).toBeInTheDocument();
    });
  });

  describe("clinical tab", () => {
    it("should show empty state when no context", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      fireEvent.click(screen.getByText("Clinical"));

      expect(screen.getByText("No clinical context")).toBeInTheDocument();
      expect(screen.getByText("Add Context")).toBeInTheDocument();
    });
  });

  describe("branches tab", () => {
    it("should show empty state when no branches", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      fireEvent.click(screen.getByText("Branches"));

      expect(screen.getByText("No branches")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have aside landmark when open", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      const aside = screen.getByRole("complementary");
      expect(aside).toHaveAttribute("aria-label", "Context and references");
    });

    it("should have tablist with proper aria attributes", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      const tablist = screen.getByRole("tablist");
      expect(tablist).toHaveAttribute("aria-label", "Context pane sections");
    });

    it("should have tabpanel for active tab", () => {
      render(<CollapsibleContextPane {...defaultProps} />);

      const tabpanel = screen.getByRole("tabpanel");
      expect(tabpanel).toHaveAttribute("id", "citations-panel");
    });
  });
});

describe("CollapsibleContextPane - Mobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render nothing when closed on mobile", async () => {
    vi.resetModules();
    vi.doMock("../../../hooks/useIsMobile", () => ({
      useIsMobile: () => true,
    }));

    const { CollapsibleContextPane: MobilePane } =
      await import("../CollapsibleContextPane");

    const { container } = render(
      <MobilePane isOpen={false} onToggle={vi.fn()} conversationId="conv-1" />,
    );

    expect(container.firstChild).toBeNull();
  });
});
