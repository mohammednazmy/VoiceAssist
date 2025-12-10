/**
 * Tests for VoiceActivityIndicator component
 *
 * Tests the animated visualization showing voice activity states.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoiceActivityIndicator } from "../VoiceActivityIndicator";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock requestAnimationFrame
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafId: number;

beforeEach(() => {
  vi.clearAllMocks();
  rafCallbacks = new Map();
  rafId = 0;

  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, callback);
    return id;
  });

  globalThis.cancelAnimationFrame = vi.fn((id: number) => {
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRAF;
  globalThis.cancelAnimationFrame = originalCAF;
});

// ============================================================================
// Test Helpers
// ============================================================================

const defaultProps = {
  isSpeaking: false,
  isSynthesizing: false,
  isConnected: true,
};

function renderIndicator(props = {}) {
  return render(<VoiceActivityIndicator {...defaultProps} {...props} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("VoiceActivityIndicator", () => {
  describe("Visibility", () => {
    it("should render when connected", () => {
      renderIndicator({ isConnected: true });

      expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("should not render when not connected", () => {
      const { container } = renderIndicator({ isConnected: false });

      expect(container.firstChild).toBeNull();
    });
  });

  describe("State Labels", () => {
    it("should show 'Ready' when idle", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: false,
        isSynthesizing: false,
      });

      expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("should show 'Listening...' when user is speaking", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: true,
        isSynthesizing: false,
      });

      expect(screen.getByText("Listening...")).toBeInTheDocument();
    });

    it("should show 'Speaking...' when AI is synthesizing", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: false,
        isSynthesizing: true,
      });

      expect(screen.getByText("Speaking...")).toBeInTheDocument();
    });

    it("should prioritize user speaking over AI synthesizing", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: true,
        isSynthesizing: true,
      });

      expect(screen.getByText("Listening...")).toBeInTheDocument();
    });
  });

  describe("Text Colors", () => {
    it("should have neutral color when idle", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: false,
        isSynthesizing: false,
      });

      const label = screen.getByText("Ready");
      expect(label).toHaveClass("text-neutral-400");
    });

    it("should have green color when listening", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: true,
        isSynthesizing: false,
      });

      const label = screen.getByText("Listening...");
      expect(label).toHaveClass("text-green-600");
    });

    it("should have blue color when speaking", () => {
      renderIndicator({
        isConnected: true,
        isSpeaking: false,
        isSynthesizing: true,
      });

      const label = screen.getByText("Speaking...");
      expect(label).toHaveClass("text-blue-600");
    });
  });

  describe("Canvas Element", () => {
    it("should render canvas with correct dimensions", () => {
      renderIndicator({ isConnected: true });

      const canvas = document.querySelector("canvas");
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveAttribute("width", "120");
      expect(canvas).toHaveAttribute("height", "48");
    });

    it("should have aria-hidden on canvas for accessibility", () => {
      renderIndicator({ isConnected: true });

      const canvas = document.querySelector("canvas");
      expect(canvas).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Animation", () => {
    it("should start animation when connected", async () => {
      renderIndicator({ isConnected: true });

      await waitFor(() => {
        expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
      });
    });

    it("should cancel animation on unmount", async () => {
      const { unmount } = renderIndicator({ isConnected: true });

      await waitFor(() => {
        expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
      });

      unmount();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should cancel animation when disconnected", async () => {
      const { rerender } = renderIndicator({ isConnected: true });

      await waitFor(() => {
        expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
      });

      rerender(
        <VoiceActivityIndicator {...defaultProps} isConnected={false} />,
      );

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("Custom Class Name", () => {
    it("should apply custom className to container", () => {
      const { container } = renderIndicator({
        isConnected: true,
        className: "custom-class",
      });

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Transition Classes", () => {
    it("should have transition classes on label", () => {
      renderIndicator({ isConnected: true });

      const label = screen.getByText("Ready");
      expect(label).toHaveClass("transition-colors");
      expect(label).toHaveClass("duration-200");
    });
  });
});
