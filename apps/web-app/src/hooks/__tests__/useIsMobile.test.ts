/**
 * useIsMobile Hook Tests
 * Tests mobile viewport detection functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "../useIsMobile";

describe("useIsMobile", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let removeEventListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListenerMock = vi.fn();
    removeEventListenerMock = vi.fn();

    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }));

    vi.stubGlobal("matchMedia", matchMediaMock);
    vi.stubGlobal("innerWidth", 1024);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return false for desktop viewport", () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("should return true for mobile viewport", () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("should set up media query listener on mount", () => {
    renderHook(() => useIsMobile());
    expect(addEventListenerMock).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("should clean up listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(removeEventListenerMock).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("should update when viewport changes", () => {
    let changeHandler: ((e: { matches: boolean }) => void) | null = null;

    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (
        event: string,
        handler: (e: { matches: boolean }) => void,
      ) => {
        if (event === "change") {
          changeHandler = handler;
        }
      },
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate viewport change to mobile
    act(() => {
      if (changeHandler) {
        changeHandler({ matches: true });
      }
    });

    expect(result.current).toBe(true);
  });

  it("should query correct breakpoint (767px)", () => {
    renderHook(() => useIsMobile());
    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 767px)");
  });
});
