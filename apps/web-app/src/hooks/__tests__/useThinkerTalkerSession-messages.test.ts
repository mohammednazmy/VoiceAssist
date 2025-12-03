/**
 * useThinkerTalkerSession Hook Tests - Message Handling
 *
 * Tests for handling various WebSocket messages from the backend.
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

// Helper to establish connection
async function connectHook(
  result: ReturnType<
    typeof renderHook<ReturnType<typeof useThinkerTalkerSession>, unknown>
  >["result"],
): Promise<MockWebSocket> {
  await act(async () => {
    result.current.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  const ws = MockWebSocket.getLastInstance()!;
  await act(async () => {
    ws.receiveMessage({
      type: "session.ready",
      session_id: "test-session-123",
    });
  });

  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });

  return ws;
}

describe("useThinkerTalkerSession - Message Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.clearInstances();
  });

  afterEach(() => {
    MockWebSocket.clearInstances();
  });

  describe("session.ready", () => {
    it("should transition to ready status on session.ready message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();

      await act(async () => {
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
        expect(result.current.isReady).toBe(true);
      });
    });

    it("should update connection time metric on session.ready", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());

      await act(async () => {
        result.current.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ws = MockWebSocket.getLastInstance();

      await act(async () => {
        ws?.receiveMessage({
          type: "session.ready",
          session_id: "test-session-123",
        });
      });

      await waitFor(() => {
        expect(result.current.metrics.connectionTimeMs).not.toBeNull();
        expect(result.current.metrics.connectionTimeMs).toBeGreaterThanOrEqual(
          0,
        );
      });
    });
  });

  describe("transcript events", () => {
    it("should update partialTranscript on transcript.partial message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.partial",
          text: "Hello, how are",
          is_final: false,
        });
      });

      await waitFor(() => {
        expect(result.current.partialTranscript).toBe("Hello, how are");
      });
    });

    it("should update transcript on transcript.final message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.final",
          text: "Hello, how are you?",
          is_final: true,
        });
      });

      await waitFor(() => {
        expect(result.current.transcript).toBe("Hello, how are you?");
      });
    });

    it("should call onTranscript callback on transcript events", async () => {
      const onTranscript = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onTranscript }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.final",
          text: "Test transcript",
          is_final: true,
          timestamp: Date.now(),
        });
      });

      await waitFor(() => {
        expect(onTranscript).toHaveBeenCalledWith(
          expect.objectContaining({
            text: "Test transcript",
            is_final: true,
          }),
        );
      });
    });

    it("should increment userUtteranceCount on final transcript", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      const initialCount = result.current.metrics.userUtteranceCount;

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.final",
          text: "Hello",
          is_final: true,
        });
      });

      await waitFor(() => {
        expect(result.current.metrics.userUtteranceCount).toBe(
          initialCount + 1,
        );
      });
    });
  });

  describe("response events", () => {
    it("should call onResponseDelta callback on response.delta message", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Hello ",
          message_id: "msg-123",
        });
      });

      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledWith("Hello ", "msg-123");
      });
    });

    it("should call onResponseComplete callback on response.complete message", async () => {
      const onResponseComplete = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseComplete }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "response.complete",
          content: "Hello, I'm here to help!",
          message_id: "msg-123",
        });
      });

      await waitFor(() => {
        expect(onResponseComplete).toHaveBeenCalledWith(
          "Hello, I'm here to help!",
          "msg-123",
        );
      });
    });

    it("should increment aiResponseCount on response complete", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      const initialCount = result.current.metrics.aiResponseCount;

      await act(async () => {
        ws.receiveMessage({
          type: "response.complete",
          content: "Response content",
          message_id: "msg-123",
        });
      });

      await waitFor(() => {
        expect(result.current.metrics.aiResponseCount).toBe(initialCount + 1);
      });
    });
  });

  describe("audio events", () => {
    it("should call onAudioChunk callback on audio.chunk message", async () => {
      const onAudioChunk = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onAudioChunk }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "audio.chunk",
          audio: "base64encodedaudiodata",
        });
      });

      await waitFor(() => {
        expect(onAudioChunk).toHaveBeenCalledWith("base64encodedaudiodata");
      });
    });

    it("should set isSpeaking to true during audio playback", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "pipeline.state",
          state: "speaking",
        });
      });

      await waitFor(() => {
        expect(result.current.isSpeaking).toBe(true);
      });
    });
  });

  describe("pipeline.state events", () => {
    it("should update pipelineState on pipeline.state message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "pipeline.state",
          state: "listening",
        });
      });

      await waitFor(() => {
        expect(result.current.pipelineState).toBe("listening");
        expect(result.current.isListening).toBe(true);
      });
    });

    it("should call onPipelineStateChange callback on state change", async () => {
      const onPipelineStateChange = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onPipelineStateChange }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "pipeline.state",
          state: "processing",
        });
      });

      await waitFor(() => {
        expect(onPipelineStateChange).toHaveBeenCalledWith("processing");
      });
    });

    it("should set isProcessing correctly", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "pipeline.state",
          state: "processing",
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true);
      });

      await act(async () => {
        ws.receiveMessage({
          type: "pipeline.state",
          state: "speaking",
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
    });
  });

  describe("tool call events", () => {
    it("should add tool call to currentToolCalls on tool.call message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "tool.call",
          id: "tool-123",
          name: "search",
          arguments: { query: "test" },
          status: "running",
        });
      });

      await waitFor(() => {
        expect(result.current.currentToolCalls).toHaveLength(1);
        expect(result.current.currentToolCalls[0]).toMatchObject({
          id: "tool-123",
          name: "search",
          status: "running",
        });
      });
    });

    it("should call onToolCall callback on tool.call message", async () => {
      const onToolCall = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onToolCall }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "tool.call",
          id: "tool-123",
          name: "search",
          arguments: { query: "test" },
          status: "running",
        });
      });

      await waitFor(() => {
        expect(onToolCall).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "tool-123",
            name: "search",
          }),
        );
      });
    });

    it("should update tool call on tool.result message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      // First add the tool call
      await act(async () => {
        ws.receiveMessage({
          type: "tool.call",
          id: "tool-123",
          name: "search",
          arguments: { query: "test" },
          status: "running",
        });
      });

      // Then update with result
      await act(async () => {
        ws.receiveMessage({
          type: "tool.result",
          id: "tool-123",
          status: "completed",
          result: { results: ["item1", "item2"] },
        });
      });

      await waitFor(() => {
        const toolCall = result.current.currentToolCalls.find(
          (tc) => tc.id === "tool-123",
        );
        expect(toolCall?.status).toBe("completed");
        expect(toolCall?.result).toEqual({ results: ["item1", "item2"] });
      });
    });

    it("should call onToolResult callback on tool.result message", async () => {
      const onToolResult = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onToolResult }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "tool.call",
          id: "tool-123",
          name: "search",
          arguments: {},
          status: "running",
        });
      });

      await act(async () => {
        ws.receiveMessage({
          type: "tool.result",
          id: "tool-123",
          status: "completed",
          result: { data: "test" },
        });
      });

      await waitFor(() => {
        expect(onToolResult).toHaveBeenCalled();
      });
    });

    it("should increment toolCallCount on tool call", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      const initialCount = result.current.metrics.toolCallCount;

      await act(async () => {
        ws.receiveMessage({
          type: "tool.call",
          id: "tool-123",
          name: "search",
          arguments: {},
          status: "running",
        });
      });

      await waitFor(() => {
        expect(result.current.metrics.toolCallCount).toBe(initialCount + 1);
      });
    });
  });

  describe("error events", () => {
    it("should set error on error message from backend", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "error",
          message: "Pipeline error occurred",
          code: "PIPELINE_ERROR",
        });
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });
    });

    it("should call onError callback on error message", async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useThinkerTalkerSession({ onError }));
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "error",
          message: "Test error",
          code: "TEST_ERROR",
        });
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe("pong events (heartbeat)", () => {
    it("should handle pong messages without error", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      // Should not throw
      await act(async () => {
        ws.receiveMessage({
          type: "pong",
          timestamp: Date.now(),
        });
      });

      expect(result.current.status).toBe("ready");
    });
  });
});
