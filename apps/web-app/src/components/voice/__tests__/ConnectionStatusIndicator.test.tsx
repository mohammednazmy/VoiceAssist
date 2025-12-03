/**
 * Tests for ConnectionStatusIndicator component
 *
 * Tests the compact voice mode connection status indicator.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ConnectionStatusIndicator,
  type ConnectionStatus,
} from "../ConnectionStatusIndicator";

describe("ConnectionStatusIndicator", () => {
  describe("Status Display", () => {
    const statuses: ConnectionStatus[] = [
      "disconnected",
      "connecting",
      "connected",
      "reconnecting",
      "error",
      "failed",
      "expired",
      "mic_permission_denied",
    ];

    it.each(statuses)("should render '%s' status correctly", (status) => {
      render(<ConnectionStatusIndicator status={status} />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toBeInTheDocument();
    });

    it("should display 'Disconnected' label for disconnected status", () => {
      render(<ConnectionStatusIndicator status="disconnected" />);

      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("should display 'Connecting...' label for connecting status", () => {
      render(<ConnectionStatusIndicator status="connecting" />);

      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    it("should display 'Connected' label for connected status", () => {
      render(<ConnectionStatusIndicator status="connected" />);

      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("should display 'Reconnecting...' label for reconnecting status", () => {
      render(<ConnectionStatusIndicator status="reconnecting" />);

      expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    });

    it("should display 'Error' label for error status", () => {
      render(<ConnectionStatusIndicator status="error" />);

      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("should display 'Failed' label for failed status", () => {
      render(<ConnectionStatusIndicator status="failed" />);

      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("should display 'Expired' label for expired status", () => {
      render(<ConnectionStatusIndicator status="expired" />);

      expect(screen.getByText("Expired")).toBeInTheDocument();
    });

    it("should display 'Mic Blocked' label for mic_permission_denied status", () => {
      render(<ConnectionStatusIndicator status="mic_permission_denied" />);

      expect(screen.getByText("Mic Blocked")).toBeInTheDocument();
    });
  });

  describe("Offline Mode", () => {
    it("should display 'Offline' when offline mode is active and not connected", () => {
      render(
        <ConnectionStatusIndicator
          status="disconnected"
          isOfflineMode={true}
        />,
      );

      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    it("should display normal status when offline but connected", () => {
      render(
        <ConnectionStatusIndicator status="connected" isOfflineMode={true} />,
      );

      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("should display 'Recording' when offline recording", () => {
      render(
        <ConnectionStatusIndicator
          status="disconnected"
          isOfflineMode={true}
          isOfflineRecording={true}
        />,
      );

      expect(screen.getByText("Recording")).toBeInTheDocument();
    });
  });

  describe("Reconnect Attempts", () => {
    it("should show reconnect attempt count in tooltip", () => {
      render(
        <ConnectionStatusIndicator
          status="reconnecting"
          reconnectAttempts={3}
        />,
      );

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveAttribute("title", "Reconnecting... (attempt 3)");
    });

    it("should not show attempt count when zero", () => {
      render(
        <ConnectionStatusIndicator
          status="reconnecting"
          reconnectAttempts={0}
        />,
      );

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveAttribute("title", "Reconnecting...");
    });
  });

  describe("Accessibility", () => {
    it("should have role='status'", () => {
      render(<ConnectionStatusIndicator status="connected" />);

      const indicator = screen.getByRole("status");
      expect(indicator).toBeInTheDocument();
    });

    it("should have aria-label for screen readers", () => {
      render(<ConnectionStatusIndicator status="connected" />);

      const indicator = screen.getByRole("status");
      expect(indicator).toHaveAttribute(
        "aria-label",
        "Connection status: Connected",
      );
    });

    it("should update aria-label based on status", () => {
      render(<ConnectionStatusIndicator status="error" />);

      const indicator = screen.getByRole("status");
      expect(indicator).toHaveAttribute(
        "aria-label",
        "Connection status: Error",
      );
    });
  });

  describe("Styling", () => {
    it("should apply custom className", () => {
      render(
        <ConnectionStatusIndicator
          status="connected"
          className="custom-class"
        />,
      );

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveClass("custom-class");
    });

    it("should apply pulse animation for connecting status", () => {
      render(<ConnectionStatusIndicator status="connecting" />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveClass("animate-pulse");
    });

    it("should apply pulse animation for reconnecting status", () => {
      render(<ConnectionStatusIndicator status="reconnecting" />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveClass("animate-pulse");
    });

    it("should not apply pulse animation for connected status", () => {
      render(<ConnectionStatusIndicator status="connected" />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).not.toHaveClass("animate-pulse");
    });

    it("should apply green colors for connected status", () => {
      render(<ConnectionStatusIndicator status="connected" />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveClass("text-green-600");
      expect(indicator).toHaveClass("bg-green-50");
    });

    it("should apply red colors for error status", () => {
      render(<ConnectionStatusIndicator status="error" />);

      const indicator = screen.getByTestId("connection-status-indicator");
      expect(indicator).toHaveClass("text-red-600");
      expect(indicator).toHaveClass("bg-red-50");
    });
  });

  describe("Icons", () => {
    it("should render spinner icon for connecting status", () => {
      const { container } = render(
        <ConnectionStatusIndicator status="connecting" />,
      );

      // Check for SVG with animate-spin class (spinner)
      const spinner = container.querySelector("svg.animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("should render warning icon for error status", () => {
      const { container } = render(
        <ConnectionStatusIndicator status="error" />,
      );

      // Check for SVG (warning icon)
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should render dot for connected status", () => {
      const { container } = render(
        <ConnectionStatusIndicator status="connected" />,
      );

      // Check for span with rounded-full class (dot)
      const dot = container.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();
    });
  });
});
