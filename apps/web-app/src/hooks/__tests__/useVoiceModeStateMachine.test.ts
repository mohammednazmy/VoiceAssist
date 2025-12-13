/**
 * Tests for useVoiceModeStateMachine hook
 *
 * Tests the voice mode state machine that wraps useThinkerTalkerSession
 * with unified-interface-specific state transitions.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVoiceModeStateMachine } from "../useVoiceModeStateMachine";
import type { TTConnectionStatus } from "../useThinkerTalkerSession";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock voiceLog
vi.mock("../../lib/logger", () => ({
  voiceLog: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock store state
const mockStoreState = {
  voiceModeActive: false,
  voiceState: "idle" as "idle" | "listening" | "processing" | "responding" | "error" | "connecting",
  setVoiceState: vi.fn(),
  startListening: vi.fn(),
  stopListening: vi.fn(),
  startSpeaking: vi.fn(),
  stopSpeaking: vi.fn(),
  setPartialTranscript: vi.fn(),
  activateVoiceMode: vi.fn(),
  deactivateVoiceMode: vi.fn(),
};

vi.mock("../../stores/unifiedConversationStore", () => ({
  useUnifiedConversationStore: () => mockStoreState,
}));

vi.mock("../../stores/voiceSettingsStore", () => ({
  useVoiceSettingsStore: () => ({
    voice: "alloy",
    language: "en",
    vadSensitivity: 0.5,
  }),
}));

// Mock useThinkerTalkerSession
const mockTTSession = {
  status: "disconnected" as TTConnectionStatus,
  error: null as Error | null,
  transcript: null,
  partialTranscript: "",
  isSpeaking: false,
  metrics: {
    connectionTimeMs: null,
    sttLatencyMs: null,
    totalLatencyMs: null,
  },
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  resetFatalError: vi.fn(),
  isConnected: false,
  isMicPermissionDenied: false,
};

vi.mock("../useThinkerTalkerSession", () => ({
  useThinkerTalkerSession: vi.fn(() => mockTTSession),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function resetMocks() {
  vi.clearAllMocks();
  mockStoreState.voiceModeActive = false;
  mockStoreState.voiceState = "idle";
  mockTTSession.status = "disconnected";
  mockTTSession.error = null;
  mockTTSession.isSpeaking = false;
  mockTTSession.isConnected = false;
  mockTTSession.isMicPermissionDenied = false;
}

// ============================================================================
// Test Suites
// ============================================================================

describe("useVoiceModeStateMachine", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should initialize with idle state", () => {
      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.voiceState).toBe("idle");
      expect(result.current.isActive).toBe(false);
      expect(result.current.isListening).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isResponding).toBe(false);
      expect(result.current.hasError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should expose transcript state", () => {
      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.partialTranscript).toBe("");
      expect(result.current.finalTranscript).toBe("");
    });

    it("should expose metrics", () => {
      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.metrics).toEqual({
        connectionTimeMs: null,
        sttLatencyMs: null,
        responseLatencyMs: null,
      });
    });
  });

  describe("Activate", () => {
    it("should call connect and activate store on activate", async () => {
      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      await act(async () => {
        await result.current.activate();
      });

      expect(mockStoreState.activateVoiceMode).toHaveBeenCalled();
      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("connecting");
      expect(mockTTSession.connect).toHaveBeenCalled();
    });

    it("should handle activation errors", async () => {
      mockTTSession.connect.mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      await act(async () => {
        await result.current.activate();
      });

      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("error");
    });
  });

  describe("Deactivate", () => {
    it("should call disconnect and deactivate store", () => {
      mockStoreState.voiceModeActive = true;

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      act(() => {
        result.current.deactivate();
      });

      expect(mockTTSession.disconnect).toHaveBeenCalled();
      expect(mockStoreState.deactivateVoiceMode).toHaveBeenCalled();
      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("idle");
      expect(mockStoreState.setPartialTranscript).toHaveBeenCalledWith("");
    });
  });

  describe("Retry Connection", () => {
    it("should reset fatal error if mic permission was denied", async () => {
      mockTTSession.isMicPermissionDenied = true;

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      await act(async () => {
        await result.current.retryConnection();
      });

      expect(mockTTSession.resetFatalError).toHaveBeenCalled();
    });

    it("should attempt to activate after retry", async () => {
      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      await act(async () => {
        await result.current.retryConnection();
      });

      expect(mockStoreState.activateVoiceMode).toHaveBeenCalled();
      expect(mockTTSession.connect).toHaveBeenCalled();
    });
  });

  describe("Computed State Properties", () => {
    it("should compute isListening correctly", () => {
      mockStoreState.voiceState = "listening";

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.isListening).toBe(true);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isResponding).toBe(false);
    });

    it("should compute isProcessing correctly", () => {
      mockStoreState.voiceState = "processing";

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.isListening).toBe(false);
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.isResponding).toBe(false);
    });

    it("should compute isResponding correctly", () => {
      mockStoreState.voiceState = "responding";

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.isListening).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isResponding).toBe(true);
    });

    it("should compute hasError correctly", () => {
      mockStoreState.voiceState = "error";
      mockTTSession.error = new Error("Test error");

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.hasError).toBe(true);
      expect(result.current.error).toBeInstanceOf(Error);
    });

    it("should compute isActive from store", () => {
      mockStoreState.voiceModeActive = true;

      const { result } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      expect(result.current.isActive).toBe(true);
    });
  });

  describe("Callbacks", () => {
    it("should call onError callback on errors", async () => {
      const onError = vi.fn();
      const testError = new Error("Test error");

      // Get the onError callback from useThinkerTalkerSession mock
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123", onError }),
      );

      // Get the options passed to the mock
      const callArgs = mockImpl.mock.calls[0][0];

      // Simulate an error by calling the onError callback
      act(() => {
        callArgs?.onError?.(testError);
      });

      expect(onError).toHaveBeenCalledWith(testError);
      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("error");
    });

    it("should call onTranscriptComplete for final transcripts", async () => {
      const onTranscriptComplete = vi.fn();

      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({
          conversationId: "test-123",
          onTranscriptComplete,
        }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      // Simulate a final transcript
      act(() => {
        callArgs?.onTranscript?.({
          text: "Hello world",
          is_final: true,
          timestamp: Date.now(),
        });
      });

      expect(onTranscriptComplete).toHaveBeenCalledWith("Hello world");
      expect(mockStoreState.setPartialTranscript).toHaveBeenCalledWith("");
    });

    it("should update partial transcript for non-final transcripts", async () => {
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      // Simulate a partial transcript
      act(() => {
        callArgs?.onTranscript?.({
          text: "Hello wor",
          is_final: false,
          timestamp: Date.now(),
        });
      });

      expect(mockStoreState.setPartialTranscript).toHaveBeenCalledWith(
        "Hello wor",
      );
    });
  });

  describe("Connection Status Mapping", () => {
    it("should map 'connecting' status to 'connecting' state", async () => {
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      act(() => {
        callArgs?.onConnectionChange?.("connecting");
      });

      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("connecting");
    });

    it("should map 'connected' status to 'listening' state", async () => {
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      act(() => {
        callArgs?.onConnectionChange?.("connected");
      });

      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("listening");
      expect(mockStoreState.startListening).toHaveBeenCalled();
    });

    it("should map 'error' status to 'error' state", async () => {
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      act(() => {
        callArgs?.onConnectionChange?.("error");
      });

      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("error");
      expect(mockStoreState.stopListening).toHaveBeenCalled();
    });

    it("should map 'disconnected' status to 'idle' state", async () => {
      const { useThinkerTalkerSession } =
        await import("../useThinkerTalkerSession");
      const mockImpl = vi.mocked(useThinkerTalkerSession);

      renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      const callArgs = mockImpl.mock.calls[0][0];

      act(() => {
        callArgs?.onConnectionChange?.("disconnected");
      });

      expect(mockStoreState.setVoiceState).toHaveBeenCalledWith("idle");
    });
  });

  describe("Cleanup", () => {
    it("should disconnect on unmount if voice mode is active", () => {
      mockStoreState.voiceModeActive = true;

      const { unmount } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      unmount();

      expect(mockTTSession.disconnect).toHaveBeenCalled();
    });

    it("should not disconnect on unmount if voice mode is inactive", () => {
      mockStoreState.voiceModeActive = false;

      const { unmount } = renderHook(() =>
        useVoiceModeStateMachine({ conversationId: "test-123" }),
      );

      unmount();

      // disconnect should not be called (only from cleanup effect)
      expect(mockTTSession.disconnect).not.toHaveBeenCalled();
    });
  });
});
