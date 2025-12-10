/**
 * Tests for useOfflineVoiceCapture hook
 *
 * Tests offline voice recording, IndexedDB storage, and sync functionality.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  useOfflineVoiceCapture,
  type OfflineRecording,
  type VoiceApiClient,
} from "../useOfflineVoiceCapture";

// Mock IndexedDB
const mockIndexedDB = {
  recordings: new Map<string, OfflineRecording>(),

  reset() {
    this.recordings.clear();
  },
};

// Mock IDBRequest
const createMockIDBRequest = <T>(
  result: T,
  error: Error | null = null,
): IDBRequest<T> => {
  const request = {
    result,
    error,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    readyState: "done" as IDBRequestReadyState,
    source: null,
    transaction: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  // Trigger callbacks in next tick
  setTimeout(() => {
    if (error && request.onerror) {
      request.onerror({ target: request } as unknown as Event);
    } else if (request.onsuccess) {
      request.onsuccess({ target: request } as unknown as Event);
    }
  }, 0);

  return request as unknown as IDBRequest<T>;
};

// Mock IDBObjectStore
const createMockObjectStore = () => ({
  put: vi.fn((record: OfflineRecording) => {
    mockIndexedDB.recordings.set(record.id, record);
    return createMockIDBRequest(undefined);
  }),
  get: vi.fn((key: string) => {
    const result = mockIndexedDB.recordings.get(key);
    return createMockIDBRequest(result);
  }),
  delete: vi.fn((key: string) => {
    mockIndexedDB.recordings.delete(key);
    return createMockIDBRequest(undefined);
  }),
  getAll: vi.fn(() => {
    return createMockIDBRequest(Array.from(mockIndexedDB.recordings.values()));
  }),
  index: vi.fn(() => ({
    getAll: vi.fn((value?: string) => {
      const results = Array.from(mockIndexedDB.recordings.values()).filter(
        (r) => {
          if (value === "pending") return r.status === "pending";
          return true;
        },
      );
      return createMockIDBRequest(results);
    }),
  })),
  createIndex: vi.fn(),
});

// Mock IDBDatabase
const mockStore = createMockObjectStore();
const createMockDatabase = () => ({
  objectStoreNames: { contains: () => true },
  createObjectStore: vi.fn(() => mockStore),
  transaction: vi.fn(() => ({
    objectStore: vi.fn(() => mockStore),
  })),
});

// Mock IDBOpenDBRequest
const createMockOpenDBRequest = () => {
  const db = createMockDatabase();
  const request = {
    result: db,
    error: null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
    readyState: "done" as IDBRequestReadyState,
    source: null,
    transaction: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  setTimeout(() => {
    if (request.onsuccess) {
      request.onsuccess({ target: request } as unknown as Event);
    }
  }, 0);

  return request;
};

// Setup IndexedDB mock
const mockIndexedDBOpen = vi.fn(() => createMockOpenDBRequest());
vi.stubGlobal("indexedDB", {
  open: mockIndexedDBOpen,
});

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: "inactive" | "recording" | "paused" = "inactive";
  stream: MediaStream;
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start() {
    this.state = "recording";
    // Simulate data available after a short delay
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({
          data: new Blob(["test audio"], { type: "audio/webm" }),
        } as BlobEvent);
      }
    }, 100);
  }

  stop() {
    this.state = "inactive";
    setTimeout(() => {
      if (this.onstop) {
        this.onstop();
      }
    }, 10);
  }
}

vi.stubGlobal("MediaRecorder", MockMediaRecorder);

// Mock MediaStream
class MockMediaStream {
  getTracks() {
    return [{ stop: vi.fn() }];
  }
}

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn(() =>
  Promise.resolve(new MockMediaStream() as unknown as MediaStream),
);

// Store original mediaDevices if it exists
const _originalMediaDevices = navigator.mediaDevices;

// Try to redefine mediaDevices - JSDOM may have it as non-configurable
try {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: mockGetUserMedia,
    },
    configurable: true,
    writable: true,
  });
} catch {
  // If we can't redefine the property, spy on the existing one
  if (navigator.mediaDevices) {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(
      mockGetUserMedia,
    );
  }
}

// Mock navigator.onLine
let mockOnline = true;
Object.defineProperty(navigator, "onLine", {
  get: () => mockOnline,
  configurable: true,
});

describe("useOfflineVoiceCapture", () => {
  const defaultOptions = {
    conversationId: "test-conv-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexedDB.reset();
    mockOnline = true;
    mockGetUserMedia.mockClear();
    mockGetUserMedia.mockResolvedValue(
      new MockMediaStream() as unknown as MediaStream,
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("initialization", () => {
    it("should initialize with default values", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      expect(result.current.isRecording).toBe(false);
      expect(result.current.recordingDuration).toBe(0);
      expect(result.current.pendingCount).toBe(0);
    });

    it("should detect offline mode when navigator is offline", async () => {
      mockOnline = false;

      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      await waitFor(() => {
        expect(result.current.isOfflineMode).toBe(true);
      });
    });

    it("should respect forceOffline option", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture({
          ...defaultOptions,
          forceOffline: true,
        }),
      );

      expect(result.current.isOfflineMode).toBe(true);
    });
  });

  describe("recording", () => {
    it("should start recording when startRecording is called", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it("should stop recording and save to IndexedDB", async () => {
      const onRecordingComplete = vi.fn();

      const { result } = renderHook(() =>
        useOfflineVoiceCapture({
          ...defaultOptions,
          onRecordingComplete,
        }),
      );

      await act(async () => {
        await result.current.startRecording();
      });

      let recording: OfflineRecording | null = null;
      await act(async () => {
        recording = await result.current.stopRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(recording).not.toBeNull();
      expect(recording?.conversationId).toBe("test-conv-123");
      expect(recording?.status).toBe("pending");
    });

    it("should cancel recording without saving", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);

      act(() => {
        result.current.cancelRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });

    it("should handle microphone permission errors", async () => {
      const onError = vi.fn();
      mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

      const { result } = renderHook(() =>
        useOfflineVoiceCapture({
          ...defaultOptions,
          onError,
        }),
      );

      await act(async () => {
        await result.current.startRecording();
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(result.current.isRecording).toBe(false);
    });
  });

  describe("sync functionality", () => {
    it("should not sync when offline", async () => {
      mockOnline = false;
      const mockApiClient: VoiceApiClient = {
        transcribeAudio: vi.fn().mockResolvedValue("transcribed text"),
      };

      const { result } = renderHook(() =>
        useOfflineVoiceCapture({
          ...defaultOptions,
          apiClient: mockApiClient,
        }),
      );

      await act(async () => {
        await result.current.syncPendingRecordings();
      });

      expect(mockApiClient.transcribeAudio).not.toHaveBeenCalled();
    });

    it("should not sync without apiClient", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      // Should not throw
      await act(async () => {
        await result.current.syncPendingRecordings();
      });
    });

    it("should handle sync errors gracefully", async () => {
      const onError = vi.fn();
      const mockApiClient: VoiceApiClient = {
        transcribeAudio: vi.fn().mockRejectedValue(new Error("Network error")),
      };

      // Add a pending recording
      const pendingRecording: OfflineRecording = {
        id: "rec-123",
        conversationId: "test-conv-123",
        audioBlob: new Blob(["test"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        duration: 5,
        createdAt: new Date(),
        status: "pending",
        retryCount: 0,
      };
      mockIndexedDB.recordings.set(pendingRecording.id, pendingRecording);

      const { result } = renderHook(() =>
        useOfflineVoiceCapture({
          ...defaultOptions,
          apiClient: mockApiClient,
          onError,
        }),
      );

      await act(async () => {
        await result.current.syncPendingRecordings();
      });

      // Error callback should be called
      expect(onError).toHaveBeenCalled();
    });
  });

  describe("offline mode toggle", () => {
    it("should allow setting offline mode manually", () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      expect(result.current.isOfflineMode).toBe(false);

      act(() => {
        result.current.setOfflineMode(true);
      });

      expect(result.current.isOfflineMode).toBe(true);
    });
  });

  describe("delete recording", () => {
    it("should delete a recording from storage", async () => {
      // Add a recording first
      const recording: OfflineRecording = {
        id: "rec-to-delete",
        conversationId: "test-conv-123",
        audioBlob: new Blob(["test"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        duration: 5,
        createdAt: new Date(),
        status: "pending",
        retryCount: 0,
      };
      mockIndexedDB.recordings.set(recording.id, recording);

      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      await act(async () => {
        await result.current.deleteRecording("rec-to-delete");
      });

      expect(mockIndexedDB.recordings.has("rec-to-delete")).toBe(false);
    });
  });

  describe("online/offline event handling", () => {
    it("should update offline mode when online event fires", async () => {
      mockOnline = false;

      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      await waitFor(() => {
        expect(result.current.isOfflineMode).toBe(true);
      });

      // Simulate coming back online
      mockOnline = true;
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => {
        expect(result.current.isOfflineMode).toBe(false);
      });
    });

    it("should update offline mode when offline event fires", async () => {
      const { result } = renderHook(() =>
        useOfflineVoiceCapture(defaultOptions),
      );

      expect(result.current.isOfflineMode).toBe(false);

      // Simulate going offline
      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(result.current.isOfflineMode).toBe(true);
    });
  });
});
