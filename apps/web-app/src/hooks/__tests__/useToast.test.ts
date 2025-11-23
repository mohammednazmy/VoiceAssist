/**
 * useToast Hook Tests
 */

import { renderHook, act } from "@testing-library/react";
import { useToast } from "../useToast";

describe("useToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should initialize with empty toasts", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it("should add a success toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success("Success message");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      type: "success",
      message: "Success message",
    });
  });

  it("should add an error toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.error("Error message", "Error description");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      type: "error",
      message: "Error message",
      description: "Error description",
    });
  });

  it("should add a warning toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.warning("Warning message");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      type: "warning",
      message: "Warning message",
    });
  });

  it("should add an info toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.info("Info message");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      type: "info",
      message: "Info message",
    });
  });

  it("should add multiple toasts", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success("Success 1");
      result.current.error("Error 1");
      result.current.warning("Warning 1");
    });

    expect(result.current.toasts).toHaveLength(3);
  });

  it("should dismiss a toast by id", () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;
    act(() => {
      toastId = result.current.success("Success message");
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss(toastId);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("should dismiss all toasts", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success("Success 1");
      result.current.error("Error 1");
      result.current.warning("Warning 1");
    });

    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.dismissAll();
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("should auto-dismiss toast after duration", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success("Auto-dismiss", undefined, 5000);
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("should not auto-dismiss if duration is 0", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success("No auto-dismiss", undefined, 0);
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it("should return unique toast IDs", () => {
    const { result } = renderHook(() => useToast());

    let id1: string, id2: string, id3: string;
    act(() => {
      id1 = result.current.success("Toast 1");
      id2 = result.current.error("Toast 2");
      id3 = result.current.warning("Toast 3");
    });

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });
});
