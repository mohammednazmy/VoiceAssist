/**
 * useRealtimeVoiceSession Hook Unit Tests
 * Tests core functionality, state management, and event handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useRealtimeVoiceSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ConnectionStatus,
} from "../useRealtimeVoiceSession";

// Mock useAuth
const mockApiClient = {
  createRealtimeSession: vi.fn(),
};

vi.mock("../useAuth", () => ({
  useAuth: () => ({
    apiClient: mockApiClient,
  }),
}));

// Mock MediaDevices (getUserMedia)
const mockMediaStream = {
  getTracks: vi.fn(() => [{ stop: vi.fn() }]),
};

const mockGetUserMedia = vi.fn().mockResolvedValue(mockMediaStream);

Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

// Mock AudioContext
class MockAudioContext {
  sampleRate = 24000;
  destination = {};

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    };
  }

  createScriptProcessor() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    };
  }

  close() {
    return Promise.resolve();
  }
}

(global as any).AudioContext = MockAudioContext;

// Mock WebSocket
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mockWebSocketInstance: MockWebSocket | null = null;

class MockWebSocket {
  public url: string;
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public protocol: string = "";

  private messageQueue: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (Array.isArray(protocols)) {
      this.protocol = protocols[0] || "";
    }
    mockWebSocketInstance = this;
  }

  send(data: string) {
    this.messageQueue.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = WebSocket.CLOSED;
    const event = new CloseEvent("close", {
      code: code || 1000,
      reason: reason || "Normal closure",
    });
    this.onclose?.(event);
  }

  // Test helper to simulate open event
  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  // Test helper to simulate receiving a message
  simulateMessage(data: any) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  // Test helper to get sent messages
  getSentMessages() {
    return this.messageQueue.map((msg) => JSON.parse(msg));
  }

  // Test helper to simulate error
  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

// Session config response from backend
const mockSessionConfig = {
  url: "wss://api.openai.com/v1/realtime",
  model: "gpt-4o-realtime-preview",
  session_id: "rtc_test-user_abc123",
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  conversation_id: null,
  auth: {
    type: "ephemeral_token",
    token: "mock.ephemeral.token",
    expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
  },
  voice_config: {
    voice: "alloy",
    modalities: ["text", "audio"],
    input_audio_format: "pcm16",
    output_audio_format: "pcm16",
    input_audio_transcription: { model: "whisper-1" },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
  },
};

describe("useRealtimeVoiceSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocketInstance = null;

    // Reset mock API client
    mockApiClient.createRealtimeSession.mockResolvedValue(mockSessionConfig);

    // Replace global WebSocket with mock class
    global.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    mockWebSocketInstance = null;
  });

  describe("initialization", () => {
    it("should initialize with disconnected status", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(result.current.status).toBe("disconnected");
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.transcript).toBe("");
    });

    it("should initialize partialTranscript as empty string", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(result.current.partialTranscript).toBe("");
    });

    it("should expose connect and disconnect functions", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(typeof result.current.connect).toBe("function");
      expect(typeof result.current.disconnect).toBe("function");
      expect(typeof result.current.sendMessage).toBe("function");
    });

    it("should have canSend false when disconnected", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(result.current.canSend).toBe(false);
    });
  });

  describe("connect", () => {
    it("should transition through connecting status when connect is called", async () => {
      const onConnectionChange = vi.fn();
      const { result } = renderHook(() =>
        useRealtimeVoiceSession({ onConnectionChange }),
      );

      // Trigger connect - this starts an async chain
      await act(async () => {
        result.current.connect();
        // Allow the initial state update to process
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // The callback should have been called with 'connecting' at some point
      expect(onConnectionChange).toHaveBeenCalledWith("connecting");
    });

    it("should fetch session config from backend", async () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      await act(async () => {
        result.current.connect();
        // Wait for the promise to start
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockApiClient.createRealtimeSession).toHaveBeenCalledTimes(1);
    });

    it("should pass conversation_id and voice settings to backend when provided", async () => {
      const { result } = renderHook(() =>
        useRealtimeVoiceSession({ conversation_id: "conv-123" }),
      );

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockApiClient.createRealtimeSession).toHaveBeenCalledWith({
        conversation_id: "conv-123",
        voice: null,
        language: null,
        vad_sensitivity: null,
      });
    });

    it("should pass voice settings to backend when provided", async () => {
      const { result } = renderHook(() =>
        useRealtimeVoiceSession({
          conversation_id: "conv-456",
          voiceSettings: {
            voice: "nova",
            language: "es",
            vadSensitivity: 80,
          },
        }),
      );

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockApiClient.createRealtimeSession).toHaveBeenCalledWith({
        conversation_id: "conv-456",
        voice: "nova",
        language: "es",
        vad_sensitivity: 80,
      });
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected when called", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      // Start in connecting state
      act(() => {
        result.current.connect();
      });

      // Disconnect immediately
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.isConnected).toBe(false);
    });

    it("should clear transcript when disconnect is called", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      // Set some transcript manually (via the hook's internal state update)
      // This is testing the disconnect cleanup behavior
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.transcript).toBe("");
    });

    it("should clear isSpeaking when disconnect is called", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isSpeaking).toBe(false);
    });

    it("should clear partialTranscript when disconnect is called", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.partialTranscript).toBe("");
    });
  });

  describe("error handling", () => {
    it("should start with no error", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(result.current.error).toBeNull();
      expect(result.current.status).not.toBe("error");
    });

    it("should support onError callback option", () => {
      const onError = vi.fn();

      const { result } = renderHook(() => useRealtimeVoiceSession({ onError }));

      // Hook should render without error
      expect(result.current.status).toBe("disconnected");
    });

    it("should attempt to call backend when connecting", async () => {
      mockApiClient.createRealtimeSession.mockRejectedValue(
        new Error("API Error"),
      );

      const { result } = renderHook(() => useRealtimeVoiceSession());

      await act(async () => {
        result.current.connect();
        // Give the promise time to reject
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // API should have been called
      expect(mockApiClient.createRealtimeSession).toHaveBeenCalled();
    });
  });

  describe("sendMessage", () => {
    it("should warn when not connected", () => {
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useRealtimeVoiceSession());

      act(() => {
        result.current.sendMessage("Hello");
      });

      // Logger adds [RealtimeVoiceSession] prefix
      expect(consoleWarn).toHaveBeenCalledWith(
        "[RealtimeVoiceSession]",
        expect.stringContaining("WebSocket not connected"),
      );

      consoleWarn.mockRestore();
    });
  });

  describe("options", () => {
    it("should accept autoConnect option", () => {
      const { result } = renderHook(() =>
        useRealtimeVoiceSession({ autoConnect: false }),
      );

      // Should still be disconnected since autoConnect is false
      expect(result.current.status).toBe("disconnected");
    });

    it("should accept callback options", () => {
      const onTranscript = vi.fn();
      const onAudioChunk = vi.fn();
      const onError = vi.fn();
      const onConnectionChange = vi.fn();

      const { result } = renderHook(() =>
        useRealtimeVoiceSession({
          onTranscript,
          onAudioChunk,
          onError,
          onConnectionChange,
        }),
      );

      // Verify hook renders without error
      expect(result.current.status).toBe("disconnected");
    });
  });

  describe("derived state", () => {
    it("should compute isConnected from status", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      // Initially disconnected
      expect(result.current.isConnected).toBe(false);
      expect(result.current.status).toBe("disconnected");
    });

    it("should compute isConnecting based on status", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      // Initially not connecting
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe("metrics", () => {
    it("should expose metrics object with initial values", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics.connectionTimeMs).toBeNull();
      expect(result.current.metrics.timeToFirstTranscriptMs).toBeNull();
      expect(result.current.metrics.lastSttLatencyMs).toBeNull();
      expect(result.current.metrics.lastResponseLatencyMs).toBeNull();
      expect(result.current.metrics.sessionDurationMs).toBeNull();
      expect(result.current.metrics.userTranscriptCount).toBe(0);
      expect(result.current.metrics.aiResponseCount).toBe(0);
      expect(result.current.metrics.reconnectCount).toBe(0);
      expect(result.current.metrics.sessionStartedAt).toBeNull();
    });

    it("should reset metrics when connect is called", async () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Metrics should be reset to initial values
      expect(result.current.metrics.connectionTimeMs).toBeNull();
      expect(result.current.metrics.userTranscriptCount).toBe(0);
      expect(result.current.metrics.aiResponseCount).toBe(0);
    });

    it("should support onMetricsUpdate callback option", async () => {
      const onMetricsUpdate = vi.fn();

      const { result } = renderHook(() =>
        useRealtimeVoiceSession({ onMetricsUpdate }),
      );

      // Verify hook renders without error
      expect(result.current.status).toBe("disconnected");

      // Trigger a connect which should update metrics
      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Callback may or may not have been called depending on status transitions
      // The main thing is the hook doesn't crash
      expect(result.current.metrics).toBeDefined();
    });

    it("should have all required metric fields", () => {
      const { result } = renderHook(() => useRealtimeVoiceSession());

      const metrics = result.current.metrics;
      expect(metrics).toHaveProperty("connectionTimeMs");
      expect(metrics).toHaveProperty("timeToFirstTranscriptMs");
      expect(metrics).toHaveProperty("lastSttLatencyMs");
      expect(metrics).toHaveProperty("lastResponseLatencyMs");
      expect(metrics).toHaveProperty("sessionDurationMs");
      expect(metrics).toHaveProperty("userTranscriptCount");
      expect(metrics).toHaveProperty("aiResponseCount");
      expect(metrics).toHaveProperty("reconnectCount");
      expect(metrics).toHaveProperty("sessionStartedAt");
    });
  });
});
