/**
 * Tests for MetricCard component
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricCard, MetricCardProps } from "../MetricCard";

const defaultProps: MetricCardProps = {
  title: "Active Users",
  value: 42,
  icon: "👤",
  color: "blue",
};

describe("MetricCard", () => {
  it("renders title and value", () => {
    render(<MetricCard {...defaultProps} />);
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<MetricCard {...defaultProps} />);
    expect(screen.getByText("👤")).toBeInTheDocument();
  });

  it("applies blue color theme", () => {
    const { container } = render(<MetricCard {...defaultProps} color="blue" />);
    expect(container.firstChild).toHaveClass("from-blue-900/50");
  });

  it("applies green color theme", () => {
    const { container } = render(
      <MetricCard {...defaultProps} color="green" />,
    );
    expect(container.firstChild).toHaveClass("from-green-900/50");
  });

  it("applies purple color theme", () => {
    const { container } = render(
      <MetricCard {...defaultProps} color="purple" />,
    );
    expect(container.firstChild).toHaveClass("from-purple-900/50");
  });

  it("does not render controls by default", () => {
    render(<MetricCard {...defaultProps} />);
    expect(screen.queryByText("Auto-refresh on")).not.toBeInTheDocument();
    expect(screen.queryByText("Pause")).not.toBeInTheDocument();
    expect(screen.queryByText("Refresh now")).not.toBeInTheDocument();
  });

  describe("with controls", () => {
    const onToggleAutoRefresh = vi.fn();
    const onTogglePause = vi.fn();
    const onRefresh = vi.fn();

    const controlProps: MetricCardProps = {
      ...defaultProps,
      showControls: true,
      autoRefresh: true,
      isPaused: false,
      onToggleAutoRefresh,
      onTogglePause,
      onRefresh,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("renders auto-refresh button when controls shown", () => {
      render(<MetricCard {...controlProps} />);
      expect(screen.getByText("Auto-refresh on")).toBeInTheDocument();
    });

    it("renders auto-refresh off state", () => {
      render(<MetricCard {...controlProps} autoRefresh={false} />);
      expect(screen.getByText("Auto-refresh off")).toBeInTheDocument();
    });

    it("renders pause button when controls shown", () => {
      render(<MetricCard {...controlProps} />);
      expect(screen.getByText("Pause")).toBeInTheDocument();
    });

    it("renders resume button when paused", () => {
      render(<MetricCard {...controlProps} isPaused={true} />);
      expect(screen.getByText("Resume")).toBeInTheDocument();
    });

    it("renders refresh now button", () => {
      render(<MetricCard {...controlProps} />);
      expect(screen.getByText("Refresh now")).toBeInTheDocument();
    });

    it("calls onToggleAutoRefresh when auto-refresh button clicked", () => {
      render(<MetricCard {...controlProps} />);
      fireEvent.click(screen.getByText("Auto-refresh on"));
      expect(onToggleAutoRefresh).toHaveBeenCalledTimes(1);
    });

    it("calls onTogglePause when pause button clicked", () => {
      render(<MetricCard {...controlProps} />);
      fireEvent.click(screen.getByText("Pause"));
      expect(onTogglePause).toHaveBeenCalledTimes(1);
    });

    it("calls onRefresh when refresh now button clicked", () => {
      render(<MetricCard {...controlProps} />);
      fireEvent.click(screen.getByText("Refresh now"));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("connection status", () => {
    it("does not render status when connectionStatus not provided", () => {
      render(<MetricCard {...defaultProps} showControls={true} />);
      // No status indicator should be present
      expect(screen.queryByText("open")).not.toBeInTheDocument();
      expect(screen.queryByText("closed")).not.toBeInTheDocument();
    });

    it("renders open status with correct styling", () => {
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          connectionStatus="open"
        />,
      );
      const statusText = screen.getByText("open");
      expect(statusText).toBeInTheDocument();
      expect(statusText.closest("div")).toHaveClass("text-emerald-400");
    });

    it("renders connecting status", () => {
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          connectionStatus="connecting"
        />,
      );
      expect(screen.getByText("connecting")).toBeInTheDocument();
    });

    it("renders error status with correct styling", () => {
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          connectionStatus="error"
        />,
      );
      const statusText = screen.getByText("error");
      expect(statusText).toBeInTheDocument();
      expect(statusText.closest("div")).toHaveClass("text-red-400");
    });

    it("renders closed status", () => {
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          connectionStatus="closed"
        />,
      );
      expect(screen.getByText("closed")).toBeInTheDocument();
    });

    it("renders reconnecting status", () => {
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          connectionStatus="reconnecting"
        />,
      );
      expect(screen.getByText("reconnecting")).toBeInTheDocument();
    });
  });

  describe("last updated", () => {
    it("renders last updated time when provided", () => {
      const lastUpdated = "2025-11-28T12:00:00.000Z";
      render(
        <MetricCard
          {...defaultProps}
          showControls={true}
          lastUpdated={lastUpdated}
        />,
      );
      expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    });

    it("does not render last updated when not provided", () => {
      render(<MetricCard {...defaultProps} showControls={true} />);
      expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
    });
  });
});
