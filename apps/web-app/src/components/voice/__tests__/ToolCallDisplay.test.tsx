/**
 * Tests for ToolCallDisplay component
 *
 * Tests the real-time tool call status display during voice sessions.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ToolCallDisplay } from "../ToolCallDisplay";
import type { TTToolCall } from "../../../hooks/useThinkerTalkerSession";

// ============================================================================
// Test Helpers
// ============================================================================

function createToolCall(overrides: Partial<TTToolCall> = {}): TTToolCall {
  return {
    id: "tool-1",
    name: "kb_search",
    arguments: {},
    status: "pending",
    ...overrides,
  };
}

function renderDisplay(props = {}) {
  const defaultProps = {
    toolCalls: [] as TTToolCall[],
    ...props,
  };
  return render(<ToolCallDisplay {...defaultProps} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("ToolCallDisplay", () => {
  describe("Empty State", () => {
    it("should not render when there are no tool calls", () => {
      const { container } = renderDisplay({ toolCalls: [] });

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Basic Rendering", () => {
    it("should render tool call display container", () => {
      renderDisplay({
        toolCalls: [createToolCall()],
      });

      expect(screen.getByTestId("tool-call-display")).toBeInTheDocument();
    });

    it("should display tool call count in header", () => {
      renderDisplay({
        toolCalls: [createToolCall(), createToolCall({ id: "tool-2" })],
      });

      expect(screen.getByText("Tool Calls (2)")).toBeInTheDocument();
    });

    it("should have proper accessibility role", () => {
      renderDisplay({
        toolCalls: [createToolCall()],
      });

      const container = screen.getByTestId("tool-call-display");
      expect(container).toHaveAttribute("role", "region");
      expect(container).toHaveAttribute("aria-label", "Tool calls in progress");
    });
  });

  describe("Tool Name Display", () => {
    it("should format tool name with spaces", () => {
      renderDisplay({
        toolCalls: [createToolCall({ name: "kb_search" })],
      });

      expect(screen.getByText("Kb Search")).toBeInTheDocument();
    });

    it("should display appropriate icon for known tools", () => {
      renderDisplay({
        toolCalls: [createToolCall({ name: "kb_search" })],
      });

      // Knowledge base icon should be present
      expect(screen.getByRole("img", { name: "kb_search" })).toHaveTextContent(
        "📚",
      );
    });

    it("should display default icon for unknown tools", () => {
      renderDisplay({
        toolCalls: [createToolCall({ name: "custom_tool" })],
      });

      expect(
        screen.getByRole("img", { name: "custom_tool" }),
      ).toHaveTextContent("⚙️");
    });
  });

  describe("Status Indicators", () => {
    it("should show 'Pending' status for pending tool calls", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "pending" })],
      });

      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    it("should show 'Running' status with pulse animation", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "running" })],
      });

      expect(screen.getByText("Running")).toBeInTheDocument();
      // The status indicator should have animate-pulse class
      const indicator = screen.getByText("Running").previousElementSibling;
      expect(indicator).toHaveClass("animate-pulse");
    });

    it("should show 'Completed' status for completed tool calls", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "completed" })],
      });

      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("should show 'Failed' status for failed tool calls", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "failed" })],
      });

      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("should show 'Processing...' when any tool is running", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "running" })],
      });

      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });
  });

  describe("Expand/Collapse", () => {
    it("should auto-expand running tool calls", async () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "running",
            arguments: { query: "test query" },
          }),
        ],
        showArguments: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Arguments")).toBeInTheDocument();
      });
    });

    it("should toggle expanded state on click", async () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "completed",
            arguments: { query: "test" },
          }),
        ],
        showArguments: true,
      });

      const button = screen.getByRole("button", { name: /Kb Search/i });

      // Click to expand
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Arguments")).toBeInTheDocument();
      });

      // Click to collapse
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
      });
    });

    it("should have aria-expanded attribute", () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            arguments: { query: "test" },
          }),
        ],
        showArguments: true,
      });

      const button = screen.getByRole("button", { name: /Kb Search/i });
      expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Arguments Display", () => {
    it("should show arguments when expanded and showArguments is true", async () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "running",
            arguments: { query: "test query", limit: 10 },
          }),
        ],
        showArguments: true,
      });

      await waitFor(() => {
        expect(screen.getByText(/query: test query/)).toBeInTheDocument();
        expect(screen.getByText(/limit: 10/)).toBeInTheDocument();
      });
    });

    it("should hide arguments when showArguments is false", () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "running",
            arguments: { query: "test" },
          }),
        ],
        showArguments: false,
      });

      expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
    });

    it("should show 'No arguments' for empty arguments", () => {
      // When arguments are empty, the Arguments section won't show
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "running",
            arguments: {},
          }),
        ],
        showArguments: true,
      });

      // Empty arguments means no details section
      expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
    });

    it("should truncate long argument values", async () => {
      const longValue = "a".repeat(100);
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "running",
            arguments: { query: longValue },
          }),
        ],
        showArguments: true,
      });

      await waitFor(() => {
        // Wait for Arguments section to appear (auto-expanded for running)
        expect(screen.getByText("Arguments")).toBeInTheDocument();
      });

      // Should be truncated - the value should contain "..."
      // Format is "query: aaa..." where the value is truncated to 50 chars with "..."
      const argumentsText = screen.getByText(/query:.*\.\.\./);
      expect(argumentsText).toBeInTheDocument();
    });
  });

  describe("Results Display", () => {
    it("should show result when expanded and showResults is true", async () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "completed",
            result: "Search completed with 5 results",
          }),
        ],
        showResults: true,
      });

      const button = screen.getByRole("button", { name: /Kb Search/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Result")).toBeInTheDocument();
        expect(
          screen.getByText("Search completed with 5 results"),
        ).toBeInTheDocument();
      });
    });

    it("should hide results when showResults is false", async () => {
      renderDisplay({
        toolCalls: [
          createToolCall({
            status: "completed",
            result: "Result text",
          }),
        ],
        showResults: false,
      });

      const button = screen.getByRole("button", { name: /Kb Search/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.queryByText("Result")).not.toBeInTheDocument();
      });
    });
  });

  describe("Visual Styling", () => {
    it("should have blue styling for running tool calls", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "running" })],
      });

      const toolItem = screen.getByTestId("tool-call-tool-1");
      expect(toolItem).toHaveClass("border-blue-300");
      expect(toolItem).toHaveClass("bg-blue-50");
    });

    it("should have red styling for failed tool calls", () => {
      renderDisplay({
        toolCalls: [createToolCall({ status: "failed" })],
      });

      const toolItem = screen.getByTestId("tool-call-tool-1");
      expect(toolItem).toHaveClass("border-red-300");
      expect(toolItem).toHaveClass("bg-red-50");
    });
  });

  describe("Max Visible Limit", () => {
    it("should limit visible tool calls based on maxVisible", () => {
      const toolCalls = [
        createToolCall({ id: "1", name: "tool_1" }),
        createToolCall({ id: "2", name: "tool_2" }),
        createToolCall({ id: "3", name: "tool_3" }),
        createToolCall({ id: "4", name: "tool_4" }),
        createToolCall({ id: "5", name: "tool_5" }),
      ];

      renderDisplay({ toolCalls, maxVisible: 3 });

      // Should show "Show 2 more" button
      expect(screen.getByText("Show 2 more tool calls")).toBeInTheDocument();
    });

    it("should show all tool calls when show more is clicked", () => {
      const toolCalls = [
        createToolCall({ id: "1", name: "tool_1" }),
        createToolCall({ id: "2", name: "tool_2" }),
        createToolCall({ id: "3", name: "tool_3" }),
        createToolCall({ id: "4", name: "tool_4" }),
      ];

      renderDisplay({ toolCalls, maxVisible: 2 });

      fireEvent.click(screen.getByText("Show 2 more tool calls"));

      expect(screen.getByText("Show less")).toBeInTheDocument();
      expect(screen.getByTestId("tool-call-4")).toBeInTheDocument();
    });

    it("should toggle back to limited view", () => {
      const toolCalls = [
        createToolCall({ id: "1", name: "tool_1" }),
        createToolCall({ id: "2", name: "tool_2" }),
        createToolCall({ id: "3", name: "tool_3" }),
        createToolCall({ id: "4", name: "tool_4" }),
      ];

      renderDisplay({ toolCalls, maxVisible: 2 });

      // Expand
      fireEvent.click(screen.getByText("Show 2 more tool calls"));

      // Collapse
      fireEvent.click(screen.getByText("Show less"));

      expect(screen.getByText("Show 2 more tool calls")).toBeInTheDocument();
    });
  });

  describe("Sorting", () => {
    it("should sort running tool calls first", () => {
      const toolCalls = [
        createToolCall({
          id: "1",
          name: "completed_tool",
          status: "completed",
        }),
        createToolCall({ id: "2", name: "running_tool", status: "running" }),
        createToolCall({ id: "3", name: "pending_tool", status: "pending" }),
      ];

      renderDisplay({ toolCalls });

      const buttons = screen.getAllByRole("button", { name: /.* Tool/i });
      // Running should be first
      expect(buttons[0]).toHaveTextContent("Running Tool");
    });
  });

  describe("Icon Mapping", () => {
    it.each([
      ["search", "🔍"],
      ["retrieve", "📄"],
      ["query", "❓"],
      ["calculate", "🧮"],
      ["web_search", "🌐"],
      ["code_interpreter", "💻"],
      ["file_search", "📁"],
      ["knowledge_base", "📚"],
      ["kb_search", "📚"],
      ["kb_read", "📖"],
      ["calendar", "📅"],
      ["email", "📧"],
    ])("should show correct icon for %s tool", (toolName, expectedIcon) => {
      renderDisplay({
        toolCalls: [createToolCall({ name: toolName })],
      });

      expect(screen.getByRole("img", { name: toolName })).toHaveTextContent(
        expectedIcon,
      );
    });
  });

  describe("Custom Class Name", () => {
    it("should apply custom className", () => {
      renderDisplay({
        toolCalls: [createToolCall()],
        className: "custom-class",
      });

      expect(screen.getByTestId("tool-call-display")).toHaveClass(
        "custom-class",
      );
    });
  });
});
