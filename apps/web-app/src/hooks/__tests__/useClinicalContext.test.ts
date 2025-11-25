/**
 * useClinicalContext Hook Tests
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { useClinicalContext } from "../useClinicalContext";
import { useAuth } from "../useAuth";
import type { ClinicalContext } from "@voiceassist/types";

// Mock useAuth
vi.mock("../useAuth");

const mockApiClient = {
  getCurrentClinicalContext: vi.fn(),
  createClinicalContext: vi.fn(),
  updateClinicalContext: vi.fn(),
  deleteClinicalContext: vi.fn(),
};

describe("useClinicalContext", () => {
  beforeEach(() => {
    (useAuth as Mock).mockReturnValue({
      apiClient: mockApiClient,
    });
    vi.clearAllMocks();
  });

  it("should initialize with null context", () => {
    const { result } = renderHook(() => useClinicalContext());

    expect(result.current.context).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.hasContext).toBe(false);
  });

  it("should load context when sessionId is provided", async () => {
    const mockContext: ClinicalContext = {
      id: "ctx-1",
      userId: "user-1",
      sessionId: "session-1",
      age: 45,
      gender: "male",
      problems: ["Hypertension"],
      medications: ["Lisinopril 10mg"],
      allergies: [],
      vitals: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    mockApiClient.getCurrentClinicalContext.mockResolvedValue(mockContext);

    const { result } = renderHook(() => useClinicalContext("session-1"));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.context).toEqual(mockContext);
    expect(result.current.hasContext).toBe(true);
    expect(mockApiClient.getCurrentClinicalContext).toHaveBeenCalledWith(
      "session-1",
    );
  });

  it("should handle 404 gracefully when no context exists", async () => {
    mockApiClient.getCurrentClinicalContext.mockRejectedValue({
      response: { status: 404 },
      message: "Not found",
    });

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.context).toBeNull();
    expect(result.current.error).toBeNull(); // 404 should not set error
  });

  it("should set error for non-404 failures", async () => {
    mockApiClient.getCurrentClinicalContext.mockRejectedValue({
      response: { status: 500 },
      message: "Server error",
    });

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.context).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("should create new context", async () => {
    const newContext: ClinicalContext = {
      id: "ctx-2",
      userId: "user-1",
      sessionId: "session-1",
      age: 30,
      gender: "female",
      problems: [],
      medications: [],
      allergies: [],
      vitals: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    mockApiClient.createClinicalContext.mockResolvedValue(newContext);

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(async () => {
      await result.current.createContext({ age: 30, gender: "female" });
    });

    expect(result.current.context).toEqual(newContext);
    expect(mockApiClient.createClinicalContext).toHaveBeenCalledWith({
      age: 30,
      gender: "female",
      sessionId: "session-1",
    });
  });

  it("should update existing context", async () => {
    const existingContext: ClinicalContext = {
      id: "ctx-1",
      userId: "user-1",
      sessionId: "session-1",
      age: 45,
      gender: "male",
      problems: [],
      medications: [],
      allergies: [],
      vitals: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const updatedContext: ClinicalContext = {
      ...existingContext,
      age: 46,
    };

    mockApiClient.getCurrentClinicalContext.mockResolvedValue(existingContext);
    mockApiClient.updateClinicalContext.mockResolvedValue(updatedContext);

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.context).toEqual(existingContext);
    });

    await waitFor(async () => {
      await result.current.updateContext({ age: 46 });
    });

    expect(result.current.context).toEqual(updatedContext);
    expect(mockApiClient.updateClinicalContext).toHaveBeenCalledWith("ctx-1", {
      age: 46,
    });
  });

  it("should delete context", async () => {
    const existingContext: ClinicalContext = {
      id: "ctx-1",
      userId: "user-1",
      sessionId: "session-1",
      age: 45,
      gender: "male",
      problems: [],
      medications: [],
      allergies: [],
      vitals: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    mockApiClient.getCurrentClinicalContext.mockResolvedValue(existingContext);
    mockApiClient.deleteClinicalContext.mockResolvedValue(undefined);

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.context).toEqual(existingContext);
    });

    await waitFor(async () => {
      await result.current.deleteContext();
    });

    expect(result.current.context).toBeNull();
    expect(mockApiClient.deleteClinicalContext).toHaveBeenCalledWith("ctx-1");
  });

  it("should clear context locally", async () => {
    // First load a context
    const existingContext: ClinicalContext = {
      id: "ctx-1",
      userId: "user-1",
      sessionId: "session-1",
      age: 45,
      gender: "male",
      problems: [],
      medications: [],
      allergies: [],
      vitals: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    mockApiClient.getCurrentClinicalContext.mockResolvedValue(existingContext);

    const { result } = renderHook(() => useClinicalContext("session-1"));

    await waitFor(() => {
      expect(result.current.context).toEqual(existingContext);
    });

    // Now clear it
    act(() => {
      result.current.clearContext();
    });

    expect(result.current.context).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
