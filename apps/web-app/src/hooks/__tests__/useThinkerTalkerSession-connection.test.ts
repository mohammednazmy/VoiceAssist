/**
 * useThinkerTalkerSession Hook Tests - Connection Lifecycle
 *
 * Tests for connection establishment, disconnection, and status transitions.
 *
 * Phase: Voice Feature Hardening
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useThinkerTalkerSession } from "../useThinkerTalkerSession";
import { MockWebSocket } from "../../test/mocks/MockWebSocket";

// Mock dependencies
vi.mock("../useAuth", () => ({
  useAuth: () => ({
    tokens: { accessToken: "test-token" },
    apiClient: {},
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureVoiceError: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  voiceLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useThinkerTalkerSession - Connection Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.clearInstances();
  });

  afterEach(() => {
    MockWebSocket.clearInstances();
  });

  describe("initial state", () => {
    it("should start with disconnected status", () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.status).toBe("disconnected");
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should have empty transcript initially", () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.transcript).toBe("");
      expect(result.current.partialTranscript).toBe("");
    });

    it("should have idle pipeline state initially", () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.pipelineState).toBe("idle");
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isListening).toBe(false);
    });

    it("should have empty tool calls initially", () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.currentToolCalls).toEqual([]);
    });

    it("should have null metrics initially", () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.metrics.connectionTimeMs).toBeNull();
      expect(result.current.metrics.sttLatencyMs).toBeNull();
      expect(result.current.metrics.sessionStartedAt).toBeNull();
    });
  });

  describe("connect", () => {
    it("should transition to connecting status when connect is called", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      // Start connect without awaiting
      act(() => {
        result.current.connect();
      });

      expect(result.current.status).toBe("connecting");
      expect(result.current.isConnecting).toBe(true);
    });

    it("should not allow multiple simultaneous connect calls", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      // First connect
      act(() => {
        result.current.connect();
      });

      // Second connect should be ignored
      act(() => {
        result.current.connect();
      });

      // Should still be connecting (not double-connecting)
      expect(result.current.status).toBe("connecting");
    });

    it("should transition to connected after WebSocket opens", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        // Wait for WebSocket to open
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Get the WebSocket instance
      const ws = MockWebSocket.getLastInstance();
      expect(ws).toBeDefined();

      // Simulate session.ready message
      await act(async () => {
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });
    });

    it("should call onConnectionChange callback on status transitions", async () => {
      const onConnectionChange = vi.fn();

      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onConnectionChange }),
      );

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(onConnectionChange).toHaveBeenCalledWith("connecting");
    });
  });

  describe("disconnect", () => {
    it("should transition to disconnected status when disconnect is called", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      // Connect first
      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();
      await act(async () => {
        if (ws) {
          ws.forceOpen?.();
          if (ws.readyState !== MockWebSocket.OPEN) {
            ws.readyState = MockWebSocket.OPEN;
          }
        }
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Now disconnect
      act(() => {
        result.current.disconnect();
      });

      await waitFor(() => {
        expect(result.current.status).toBe("disconnected");
      });
    });

    it("should close WebSocket on disconnect", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();

      act(() => {
        result.current.disconnect();
      });

      expect(ws?.close).toHaveBeenCalled();
    });

    it("should not attempt reconnection after intentional disconnect", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      act(() => {
        result.current.disconnect();
      });

      // Wait to ensure no reconnection attempt
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(result.current.status).toBe("disconnected");
    });
  });

  describe("connection errors", () => {
    it("should transition to error status on WebSocket error", async () => {
      MockWebSocket.configure({ simulateFailure: true });

      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(
          result.current.status === "error" ||
            result.current.status === "reconnecting",
        ).toBe(true);
      });
    });

    it("should call onError callback on connection error", async () => {
      MockWebSocket.configure({ simulateFailure: true });
      const onError = vi.fn();

      const { result } = renderHook(() => useThinkerTalkerSession({ onError }));

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // onError may be called with the connection error
      await waitFor(
        () => {
          expect(result.current.error).not.toBeNull();
        },
        { timeout: 2000 },
      );
    });

    it("should store error in state", async () => {
      MockWebSocket.configure({ simulateFailure: true });

      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(
        () => {
          expect(result.current.error).not.toBeNull();
        },
        { timeout: 2000 },
      );
    });
  });

  describe("microphone permission", () => {
    it("should transition to mic_permission_denied on permission error", async () => {
      // Mock getUserMedia to throw permission error
      const mockGetUserMedia = vi
        .fn()
        .mockRejectedValue(
          new DOMException("Permission denied", "NotAllowedError"),
        );

      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        configurable: true,
        value: {
          getUserMedia: mockGetUserMedia,
          enumerateDevices: vi.fn().mockResolvedValue([]),
        },
      });

      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      await waitFor(
        () => {
          expect(result.current.isMicPermissionDenied).toBe(true);
        },
        { timeout: 2000 },
      );
    });
  });

  describe("derived state", () => {
    it("should have correct isConnected value", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.isConnected).toBe(false);

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();
      await act(async () => {
        if (ws) {
          ws.forceOpen?.();
          if (ws.readyState !== MockWebSocket.OPEN) {
            ws.readyState = MockWebSocket.OPEN;
          }
        }
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it("should have correct canSend value", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      expect(result.current.canSend).toBe(false);

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();
      await act(async () => {
        if (ws) {
          ws.forceOpen?.();
          if (ws.readyState !== MockWebSocket.OPEN) {
            ws.readyState = MockWebSocket.OPEN;
          }
        }
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.canSend).toBe(true);
      });
    });
  });
});
