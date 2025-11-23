/**
 * BranchSidebar Component Tests
 * Tests for the conversation branching sidebar
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BranchSidebar } from "../BranchSidebar";
import * as useBranchingModule from "../../../hooks/useBranching";

// Mock the useBranching hook
vi.mock("../../../hooks/useBranching");

describe("BranchSidebar", () => {
  const mockSwitchBranch = vi.fn();

  const defaultMockReturn = {
    branches: [],
    currentBranchId: "main",
    isLoading: false,
    error: null,
    createBranch: vi.fn(),
    switchBranch: mockSwitchBranch,
    loadBranches: vi.fn(),
    getBranchMessages: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBranchingModule.useBranching).mockReturnValue(
      defaultMockReturn,
    );
  });

  it("should not render when isOpen is false", () => {
    const { container } = render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={false}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render when isOpen is true", () => {
    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("should display header with title", () => {
    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Branches")).toBeInTheDocument();
  });

  it("should show empty state when no branches exist", () => {
    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("No branches yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Create a branch from any message/i),
    ).toBeInTheDocument();
  });

  it("should show loading state", () => {
    vi.mocked(useBranchingModule.useBranching).mockReturnValue({
      ...defaultMockReturn,
      isLoading: true,
    });

    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading branches...")).toBeInTheDocument();
  });

  it("should show error state", () => {
    vi.mocked(useBranchingModule.useBranching).mockReturnValue({
      ...defaultMockReturn,
      error: "Failed to load branches",
    });

    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error loading branches")).toBeInTheDocument();
    expect(screen.getByText("Failed to load branches")).toBeInTheDocument();
  });

  it("should render list of branches", () => {
    const mockBranches = [
      {
        branchId: "main",
        conversationId: "conv-1",
        parentMessageId: null,
        createdAt: "2025-01-01T00:00:00Z",
        lastActivity: "2025-01-02T00:00:00Z",
        messageCount: 10,
      },
      {
        branchId: "branch-001",
        conversationId: "conv-1",
        parentMessageId: "msg-5",
        createdAt: "2025-01-01T12:00:00Z",
        lastActivity: "2025-01-01T13:00:00Z",
        messageCount: 3,
      },
    ];

    vi.mocked(useBranchingModule.useBranching).mockReturnValue({
      ...defaultMockReturn,
      branches: mockBranches,
    });

    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText(/Branch 001/i)).toBeInTheDocument();
    expect(screen.getByText("10 messages")).toBeInTheDocument();
    expect(screen.getByText("3 messages")).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", () => {
    const mockOnClose = vi.fn();

    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    const closeButton = screen.getByLabelText("Close branch sidebar");
    closeButton.click();

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should have proper accessibility attributes", () => {
    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveAttribute("aria-label", "Conversation branches");
  });

  it("should display footer info", () => {
    render(
      <BranchSidebar
        sessionId="test-session"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        /Branches let you explore alternative conversation paths/i,
      ),
    ).toBeInTheDocument();
  });
});
