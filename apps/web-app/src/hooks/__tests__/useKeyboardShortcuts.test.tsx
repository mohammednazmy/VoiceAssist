/**
 * Tests for useKeyboardShortcuts hook
 */

import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

// Wrapper for router context
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("voice mode shortcuts", () => {
    it("should call onToggleVoicePanel on Ctrl+Shift+V", () => {
      const onToggleVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleVoicePanel,
          }),
        { wrapper },
      );

      // Simulate Ctrl+Shift+V on non-Mac
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "V",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onToggleVoicePanel).toHaveBeenCalledTimes(1);
    });

    it("should call onToggleVoicePanel on Cmd+Shift+V (Mac)", () => {
      const onToggleVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleVoicePanel,
          }),
        { wrapper },
      );

      // Simulate Cmd+Shift+V on Mac
      Object.defineProperty(navigator, "platform", {
        value: "MacIntel",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "v",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onToggleVoicePanel).toHaveBeenCalledTimes(1);
    });

    it("should call onCloseVoicePanel on Escape when voice panel is open", () => {
      const onCloseVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onCloseVoicePanel,
            isVoicePanelOpen: true,
          }),
        { wrapper },
      );

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onCloseVoicePanel).toHaveBeenCalledTimes(1);
    });

    it("should NOT call onCloseVoicePanel on Escape when voice panel is closed", () => {
      const onCloseVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onCloseVoicePanel,
            isVoicePanelOpen: false,
          }),
        { wrapper },
      );

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onCloseVoicePanel).not.toHaveBeenCalled();
    });

    it("should prevent default on Ctrl+Shift+V", () => {
      const onToggleVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleVoicePanel,
          }),
        { wrapper },
      );

      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "V",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe("existing shortcuts", () => {
    it("should call onToggleBranchSidebar on Ctrl+B", () => {
      const onToggleBranchSidebar = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleBranchSidebar,
          }),
        { wrapper },
      );

      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onToggleBranchSidebar).toHaveBeenCalledTimes(1);
    });

    it("should call onShowShortcuts on Ctrl+/", () => {
      const onShowShortcuts = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onShowShortcuts,
          }),
        { wrapper },
      );

      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "/",
        ctrlKey: true,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    });

    it("should call onToggleClinicalContext on Ctrl+I", () => {
      const onToggleClinicalContext = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleClinicalContext,
          }),
        { wrapper },
      );

      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "i",
        ctrlKey: true,
        bubbles: true,
      });

      window.dispatchEvent(event);

      expect(onToggleClinicalContext).toHaveBeenCalledTimes(1);
    });
  });

  describe("shortcut priority", () => {
    it("should prioritize voice panel close over other Escape handlers", () => {
      const onCloseVoicePanel = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onCloseVoicePanel,
            isVoicePanelOpen: true,
          }),
        { wrapper },
      );

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      window.dispatchEvent(event);

      expect(onCloseVoicePanel).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should remove event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(
        () =>
          useKeyboardShortcuts({
            onToggleVoicePanel: vi.fn(),
          }),
        { wrapper },
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );
    });
  });
});
