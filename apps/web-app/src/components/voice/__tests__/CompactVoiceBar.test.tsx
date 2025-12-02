/**
 * Tests for CompactVoiceBar component
 *
 * Tests the compact voice mode bar with mic button, transcript, and controls.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CompactVoiceBar } from "../CompactVoiceBar";
import type { TTToolCall } from "../../../hooks/useThinkerTalkerSession";

// ============================================================================
// Test Helpers
// ============================================================================

const defaultProps = {
  isConnected: false,
  isConnecting: false,
  isListening: false,
  isPlaying: false,
  isMicPermissionDenied: false,
  pipelineState: "idle",
  partialTranscript: "",
  currentToolCalls: [] as TTToolCall[],
  latencyMs: null as number | null,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onBargeIn: vi.fn(),
  onExpand: vi.fn(),
  onClose: vi.fn(),
  onOpenSettings: vi.fn(),
};

function renderCompactVoiceBar(props = {}) {
  return render(<CompactVoiceBar {...defaultProps} {...props} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("CompactVoiceBar", () => {
  describe("Rendering", () => {
    it("should render the compact voice bar", () => {
      renderCompactVoiceBar();

      expect(screen.getByTestId("compact-voice-bar")).toBeInTheDocument();
    });

    it("should render the mic button", () => {
      renderCompactVoiceBar();

      expect(screen.getByTestId("compact-mic-button")).toBeInTheDocument();
    });

    it("should render action buttons", () => {
      renderCompactVoiceBar();

      expect(screen.getByTestId("compact-settings-btn")).toBeInTheDocument();
      expect(screen.getByTestId("compact-expand-btn")).toBeInTheDocument();
      expect(screen.getByTestId("compact-close-btn")).toBeInTheDocument();
    });
  });

  describe("Mic Button States", () => {
    it("should show 'Start voice mode' when disconnected", () => {
      renderCompactVoiceBar({ isConnected: false });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label", "Start voice mode");
    });

    it("should show 'Connecting...' when connecting", () => {
      renderCompactVoiceBar({ isConnecting: true });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label", "Connecting...");
      expect(micButton).toBeDisabled();
    });

    it("should show 'Stop listening' when listening", () => {
      renderCompactVoiceBar({ isConnected: true, isListening: true });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label", "Stop listening");
    });

    it("should show 'Interrupt AI' when playing", () => {
      renderCompactVoiceBar({ isConnected: true, isPlaying: true });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label", "Interrupt AI");
    });

    it("should show 'Retry microphone access' when mic permission denied", () => {
      renderCompactVoiceBar({ isMicPermissionDenied: true });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute(
        "aria-label",
        "Retry microphone access",
      );
    });

    it("should show 'End voice mode' when connected but not listening or playing", () => {
      renderCompactVoiceBar({
        isConnected: true,
        isListening: false,
        isPlaying: false,
      });

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label", "End voice mode");
    });
  });

  describe("Mic Button Actions", () => {
    it("should call onConnect when clicking disconnected mic button", () => {
      const onConnect = vi.fn();
      renderCompactVoiceBar({ isConnected: false, onConnect });

      fireEvent.click(screen.getByTestId("compact-mic-button"));

      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it("should call onDisconnect when clicking listening mic button", () => {
      const onDisconnect = vi.fn();
      renderCompactVoiceBar({
        isConnected: true,
        isListening: true,
        onDisconnect,
      });

      fireEvent.click(screen.getByTestId("compact-mic-button"));

      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    it("should call onBargeIn when clicking playing mic button", () => {
      const onBargeIn = vi.fn();
      renderCompactVoiceBar({ isConnected: true, isPlaying: true, onBargeIn });

      fireEvent.click(screen.getByTestId("compact-mic-button"));

      expect(onBargeIn).toHaveBeenCalledTimes(1);
    });

    it("should not trigger action when connecting", () => {
      const onConnect = vi.fn();
      renderCompactVoiceBar({ isConnecting: true, onConnect });

      fireEvent.click(screen.getByTestId("compact-mic-button"));

      expect(onConnect).not.toHaveBeenCalled();
    });
  });

  describe("Transcript Display", () => {
    it("should show placeholder text when idle with no transcript", () => {
      renderCompactVoiceBar({ pipelineState: "idle", partialTranscript: "" });

      expect(
        screen.getByText("Tap mic to start speaking..."),
      ).toBeInTheDocument();
    });

    it("should show transcript text when available", () => {
      renderCompactVoiceBar({
        pipelineState: "listening",
        partialTranscript: "Hello world",
      });

      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("should show state label 'Listening' when listening", () => {
      renderCompactVoiceBar({ pipelineState: "listening" });

      expect(screen.getByText("Listening")).toBeInTheDocument();
    });

    it("should show state label 'Thinking' when processing", () => {
      renderCompactVoiceBar({ pipelineState: "processing" });

      expect(screen.getByText("Thinking")).toBeInTheDocument();
    });

    it("should show state label 'Speaking' when speaking", () => {
      renderCompactVoiceBar({ pipelineState: "speaking" });

      expect(screen.getByText("Speaking")).toBeInTheDocument();
    });
  });

  describe("Tool Calls Display", () => {
    it("should not show tool chips when no tool calls", () => {
      renderCompactVoiceBar({ currentToolCalls: [] });

      expect(screen.queryByText("kb_search")).not.toBeInTheDocument();
    });

    it("should show tool chip for active tool call", () => {
      const toolCalls: TTToolCall[] = [
        {
          id: "1",
          name: "kb_search",
          arguments: "{}",
          status: "running",
        },
      ];
      renderCompactVoiceBar({ currentToolCalls: toolCalls });

      expect(screen.getByText("kb search")).toBeInTheDocument();
    });

    it("should show multiple tool chips", () => {
      const toolCalls: TTToolCall[] = [
        { id: "1", name: "kb_search", arguments: "{}", status: "running" },
        { id: "2", name: "web_search", arguments: "{}", status: "pending" },
      ];
      renderCompactVoiceBar({ currentToolCalls: toolCalls });

      expect(screen.getByText("kb search")).toBeInTheDocument();
      expect(screen.getByText("web search")).toBeInTheDocument();
    });

    it("should show +N indicator for more than 2 tool calls", () => {
      const toolCalls: TTToolCall[] = [
        { id: "1", name: "tool1", arguments: "{}", status: "running" },
        { id: "2", name: "tool2", arguments: "{}", status: "running" },
        { id: "3", name: "tool3", arguments: "{}", status: "pending" },
        { id: "4", name: "tool4", arguments: "{}", status: "pending" },
      ];
      renderCompactVoiceBar({ currentToolCalls: toolCalls });

      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("Latency Badge", () => {
    it("should not show latency when null", () => {
      renderCompactVoiceBar({ latencyMs: null, isConnected: true });

      expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
    });

    it("should show latency when connected and available", () => {
      renderCompactVoiceBar({ latencyMs: 150, isConnected: true });

      expect(screen.getByText("150ms")).toBeInTheDocument();
    });

    it("should not show latency when disconnected", () => {
      renderCompactVoiceBar({ latencyMs: 150, isConnected: false });

      expect(screen.queryByText("150ms")).not.toBeInTheDocument();
    });
  });

  describe("Action Button Callbacks", () => {
    it("should call onOpenSettings when clicking settings button", () => {
      const onOpenSettings = vi.fn();
      renderCompactVoiceBar({ onOpenSettings });

      fireEvent.click(screen.getByTestId("compact-settings-btn"));

      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it("should call onExpand when clicking expand button", () => {
      const onExpand = vi.fn();
      renderCompactVoiceBar({ onExpand });

      fireEvent.click(screen.getByTestId("compact-expand-btn"));

      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when clicking close button", () => {
      const onClose = vi.fn();
      renderCompactVoiceBar({ onClose });

      fireEvent.click(screen.getByTestId("compact-close-btn"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on mic button", () => {
      renderCompactVoiceBar();

      const micButton = screen.getByTestId("compact-mic-button");
      expect(micButton).toHaveAttribute("aria-label");
    });

    it("should have aria-label on settings button", () => {
      renderCompactVoiceBar();

      const settingsBtn = screen.getByTestId("compact-settings-btn");
      expect(settingsBtn).toHaveAttribute("aria-label", "Voice settings");
    });

    it("should have aria-label on expand button", () => {
      renderCompactVoiceBar();

      const expandBtn = screen.getByTestId("compact-expand-btn");
      expect(expandBtn).toHaveAttribute("aria-label", "Expand details");
    });

    it("should have aria-label on close button", () => {
      renderCompactVoiceBar();

      const closeBtn = screen.getByTestId("compact-close-btn");
      expect(closeBtn).toHaveAttribute("aria-label", "Close voice mode");
    });
  });
});
