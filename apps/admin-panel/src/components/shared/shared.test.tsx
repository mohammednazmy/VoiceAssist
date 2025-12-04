/**
 * Tests for shared admin panel components - Sprint 5
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatCard,
  LoadingState,
  LoadingGrid,
  LoadingTable,
  ErrorState,
  EmptyState,
  DataPanel,
  TabGroup,
  ConfirmDialog,
  RefreshButton,
  HelpTooltip,
} from "./index";

describe("PageContainer", () => {
  it("should render children", () => {
    render(
      <PageContainer>
        <div data-testid="child">Content</div>
      </PageContainer>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <PageContainer className="custom-class">Content</PageContainer>,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

describe("PageHeader", () => {
  it("should render title", () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should render description", () => {
    render(<PageHeader title="Title" description="Test description" />);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("should render status badge", () => {
    render(
      <PageHeader
        title="Title"
        status={{ type: "healthy", label: "Online" }}
      />,
    );
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("should render actions", () => {
    render(<PageHeader title="Title" actions={<button>Action</button>} />);
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("should render with healthy status", () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("should render custom label", () => {
    render(<StatusBadge status="connected" label="Live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("should format status with underscores", () => {
    render(<StatusBadge status="not_configured" />);
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
  });

  it("should apply correct colors for different statuses", () => {
    const { rerender } = render(<StatusBadge status="healthy" />);
    expect(screen.getByText("Healthy").closest("span")).toHaveClass(
      "text-green-400",
    );

    rerender(<StatusBadge status="error" />);
    expect(screen.getByText("Error").closest("span")).toHaveClass(
      "text-red-400",
    );

    rerender(<StatusBadge status="degraded" />);
    expect(screen.getByText("Degraded").closest("span")).toHaveClass(
      "text-yellow-400",
    );
  });
});

describe("StatCard", () => {
  it("should render title and value", () => {
    render(<StatCard title="Total Users" value={100} />);
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("should format large numbers", () => {
    render(<StatCard title="Requests" value={1000000} />);
    expect(screen.getByText("1,000,000")).toBeInTheDocument();
  });

  it("should render icon", () => {
    render(<StatCard title="Users" value={10} icon="👥" />);
    expect(screen.getByText("👥")).toBeInTheDocument();
  });

  it("should render subtitle", () => {
    render(<StatCard title="Users" value={10} subtitle="Last 24h" />);
    expect(screen.getByText("Last 24h")).toBeInTheDocument();
  });

  it("should be clickable when onClick provided", () => {
    const onClick = vi.fn();
    render(<StatCard title="Users" value={10} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("LoadingState", () => {
  it("should render default skeletons", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it("should render custom children", () => {
    render(
      <LoadingState>
        <div data-testid="custom">Custom loading</div>
      </LoadingState>,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });
});

describe("LoadingGrid", () => {
  it("should render specified number of cards", () => {
    const { container } = render(<LoadingGrid count={6} />);
    // Each card has animate-pulse on the container, so count the direct card elements
    const cards = container.querySelectorAll(".rounded-lg.animate-pulse");
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });

  it("should use default count of 4", () => {
    const { container } = render(<LoadingGrid />);
    // Default is 4 cards
    const cards = container.querySelectorAll(".rounded-lg.animate-pulse");
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });
});

describe("LoadingTable", () => {
  it("should render specified number of rows", () => {
    const { container } = render(<LoadingTable rows={3} cols={4} />);
    // Count the row divs with animate-pulse class
    const rows = container.querySelectorAll(".divide-y > .animate-pulse");
    expect(rows.length).toBe(3);
  });
});

describe("ErrorState", () => {
  it("should render error message", () => {
    render(<ErrorState message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should have alert role", () => {
    render(<ErrorState message="Error" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("should call onRetry when retry button clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should use custom retry label", () => {
    render(
      <ErrorState message="Error" onRetry={() => {}} retryLabel="Try Again" />,
    );
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("should render message", () => {
    render(<EmptyState message="No data available" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("should render title when provided", () => {
    render(<EmptyState title="Empty" message="No data" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("should render action button", () => {
    const onClick = vi.fn();
    render(
      <EmptyState message="No data" action={{ label: "Add Item", onClick }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should render custom icon", () => {
    render(<EmptyState message="No data" icon="🔍" />);
    expect(screen.getByText("🔍")).toBeInTheDocument();
  });
});

describe("DataPanel", () => {
  it("should render children", () => {
    render(
      <DataPanel>
        <div data-testid="content">Content</div>
      </DataPanel>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("should render title", () => {
    render(<DataPanel title="Panel Title">Content</DataPanel>);
    expect(screen.getByText("Panel Title")).toBeInTheDocument();
  });

  it("should render header action", () => {
    render(
      <DataPanel headerAction={<button>Action</button>}>Content</DataPanel>,
    );
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});

describe("TabGroup", () => {
  const tabs = [
    { id: "tab1", label: "Tab 1" },
    { id: "tab2", label: "Tab 2" },
    { id: "tab3", label: "Tab 3", disabled: true },
  ];

  it("should render all tabs", () => {
    render(<TabGroup tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 3" })).toBeInTheDocument();
  });

  it("should mark active tab as selected", () => {
    render(<TabGroup tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("should call onTabChange when tab clicked", () => {
    const onTabChange = vi.fn();
    render(<TabGroup tabs={tabs} activeTab="tab1" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tab 2" }));
    expect(onTabChange).toHaveBeenCalledWith("tab2");
  });

  it("should disable tab when disabled is true", () => {
    render(<TabGroup tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Tab 3" })).toBeDisabled();
  });

  it("should render tab count", () => {
    const tabsWithCount = [{ id: "tab1", label: "Items", count: 5 }];
    render(
      <TabGroup tabs={tabsWithCount} activeTab="tab1" onTabChange={() => {}} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("should not render when closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Confirm"
        message="Are you sure?"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render when open", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Confirm Action"
        message="Are you sure?"
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
  });

  it("should call onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Confirm"
        message="Sure?"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={() => {}}
        title="Confirm"
        message="Sure?"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should show loading state", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Confirm"
        message="Sure?"
        isLoading={true}
      />,
    );
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });
});

describe("RefreshButton", () => {
  it("should render with default label", () => {
    render(<RefreshButton onClick={() => {}} />);
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("should call onClick when clicked", () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should show loading state", () => {
    render(<RefreshButton onClick={() => {}} isLoading={true} />);
    expect(screen.getByText("Refreshing...")).toBeInTheDocument();
  });

  it("should be disabled when loading", () => {
    render(<RefreshButton onClick={() => {}} isLoading={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should use custom label", () => {
    render(<RefreshButton onClick={() => {}} label="Reload" />);
    expect(screen.getByText("Reload")).toBeInTheDocument();
  });
});

describe("HelpTooltip", () => {
  it("should render help icon button", () => {
    render(<HelpTooltip topic="feature-flags" />);
    expect(
      screen.getByRole("button", { name: /help: feature flags/i }),
    ).toBeInTheDocument();
  });

  it("should show tooltip on hover", async () => {
    render(<HelpTooltip topic="feature-flags" trigger="hover" />);
    const button = screen.getByRole("button", { name: /help/i });

    fireEvent.mouseEnter(button);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Feature Flags")).toBeInTheDocument();
  });

  it("should show tooltip on click when trigger is click", () => {
    render(<HelpTooltip topic="feature-flags" trigger="click" />);
    const button = screen.getByRole("button", { name: /help/i });

    fireEvent.click(button);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("should hide tooltip on mouseLeave", () => {
    render(<HelpTooltip topic="feature-flags" trigger="hover" />);
    const button = screen.getByRole("button", { name: /help/i });

    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("should include documentation link", () => {
    render(<HelpTooltip topic="feature-flags" trigger="hover" />);
    const button = screen.getByRole("button", { name: /help/i });

    fireEvent.mouseEnter(button);

    expect(screen.getByText("View docs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view docs/i })).toHaveAttribute(
      "href",
      expect.stringContaining("admin-guide/feature-flags"),
    );
  });

  it("should show tips when available", () => {
    render(<HelpTooltip topic="feature-flags" trigger="hover" />);
    const button = screen.getByRole("button", { name: /help/i });

    fireEvent.mouseEnter(button);

    expect(screen.getByText("Tips")).toBeInTheDocument();
  });

  it("should apply different sizes", () => {
    const { rerender } = render(
      <HelpTooltip topic="feature-flags" size="xs" />,
    );
    expect(screen.getByRole("button")).toHaveClass("w-3.5", "h-3.5");

    rerender(<HelpTooltip topic="feature-flags" size="md" />);
    expect(screen.getByRole("button")).toHaveClass("w-5", "h-5");
  });

  it("should return null for unknown topic", () => {
    // Mock console.warn to avoid noise in tests
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <HelpTooltip topic={"unknown-topic" as any} />,
    );
    expect(container.firstChild).toBeNull();

    warnSpy.mockRestore();
  });
});
