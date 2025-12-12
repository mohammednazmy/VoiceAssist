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
    it("should update partialTranscript on transcript.delta message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.delta",
          text: "Hello, how are",
        });
      });

      await waitFor(() => {
        expect(result.current.partialTranscript).toBe("Hello, how are");
      });
    });

    it("should update transcript on transcript.complete message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "transcript.complete",
          text: "Hello, how are you?",
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
          type: "transcript.complete",
          text: "Test transcript",
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
          type: "transcript.complete",
          text: "Hello",
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
    it("should call onAudioChunk callback on audio.output message", async () => {
      const onAudioChunk = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onAudioChunk }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "audio.output",
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
          type: "voice.state",
          state: "speaking",
        });
      });

      await waitFor(() => {
        expect(result.current.isSpeaking).toBe(true);
      });
    });
  });

  describe("voice.state events", () => {
    it("should update pipelineState on voice.state message", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "voice.state",
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
          type: "voice.state",
          state: "processing",
        });
      });

      await waitFor(() => {
        // Callback signature is (state, reason?) - reason may be undefined
        expect(onPipelineStateChange).toHaveBeenCalled();
        expect(onPipelineStateChange.mock.calls[0][0]).toBe("processing");
      });
    });

    it("should set isProcessing correctly", async () => {
      const { result } = renderHook(() => useThinkerTalkerSession());
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "voice.state",
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

    it("should call onPushToTalkRecommended when backend sets flag", async () => {
      const onPushToTalkRecommended = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onPushToTalkRecommended }),
      );
      const ws = await connectHook(result);

      await act(async () => {
        ws.receiveMessage({
          type: "voice.state",
          state: "listening",
          push_to_talk_recommended: true,
        });
      });

      await waitFor(() => {
        expect(onPushToTalkRecommended).toHaveBeenCalledTimes(1);
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
          tool_id: "tool-123",
          tool_name: "search",
          arguments: { query: "test" },
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
          tool_id: "tool-123",
          tool_name: "search",
          arguments: { query: "test" },
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
          tool_id: "tool-123",
          tool_name: "search",
          arguments: { query: "test" },
        });
      });

      // Then update with result
      await act(async () => {
        ws.receiveMessage({
          type: "tool.result",
          tool_call_id: "tool-123",
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
          tool_id: "tool-123",
          tool_name: "search",
          arguments: {},
        });
      });

      await act(async () => {
        ws.receiveMessage({
          type: "tool.result",
          tool_call_id: "tool-123",
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
          tool_id: "tool-123",
          tool_name: "search",
          arguments: {},
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

  describe("sequence validation", () => {
    it("should process in-order messages immediately", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      // Send messages with sequential sequence numbers
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "First",
          message_id: "msg-1",
          seq: 0,
        });
      });

      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Second",
          message_id: "msg-2",
          seq: 1,
        });
      });

      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledTimes(2);
        expect(onResponseDelta).toHaveBeenNthCalledWith(1, "First", "msg-1");
        expect(onResponseDelta).toHaveBeenNthCalledWith(2, "Second", "msg-2");
      });
    });

    it("should buffer out-of-order messages and process when gap fills", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      // Send message seq=1 before seq=0 (out of order)
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Second",
          message_id: "msg-2",
          seq: 1,
        });
      });

      // Second message should be buffered, not processed yet
      await waitFor(() => {
        expect(onResponseDelta).not.toHaveBeenCalled();
      });

      // Now send seq=0 to fill the gap
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "First",
          message_id: "msg-1",
          seq: 0,
        });
      });

      // Both messages should now be processed in order
      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledTimes(2);
        expect(onResponseDelta).toHaveBeenNthCalledWith(1, "First", "msg-1");
        expect(onResponseDelta).toHaveBeenNthCalledWith(2, "Second", "msg-2");
      });
    });

    it("should ignore old/duplicate messages", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      // Process message seq=0
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "First",
          message_id: "msg-1",
          seq: 0,
        });
      });

      // Process message seq=1
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Second",
          message_id: "msg-2",
          seq: 1,
        });
      });

      // Send duplicate message with seq=0 (already processed)
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Duplicate",
          message_id: "msg-1",
          seq: 0,
        });
      });

      // Only 2 messages should be processed (duplicate ignored)
      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledTimes(2);
      });
    });

    it("should process messages without sequence number immediately (legacy)", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      // Send message without sequence number
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "Legacy",
          message_id: "msg-legacy",
          // No seq field
        });
      });

      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledWith("Legacy", "msg-legacy");
      });
    });

    it("should handle batch messages and update sequence correctly", async () => {
      const onResponseDelta = vi.fn();
      const { result } = renderHook(() =>
        useThinkerTalkerSession({ onResponseDelta }),
      );
      const ws = await connectHook(result);

      // Send a batch of messages
      await act(async () => {
        ws.receiveMessage({
          type: "batch",
          count: 3,
          seq: 0,
          messages: [
            {
              type: "response.delta",
              delta: "Batch1",
              message_id: "b1",
              seq: 0,
            },
            {
              type: "response.delta",
              delta: "Batch2",
              message_id: "b2",
              seq: 1,
            },
            {
              type: "response.delta",
              delta: "Batch3",
              message_id: "b3",
              seq: 2,
            },
          ],
        });
      });

      // All batch messages should be processed
      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledTimes(3);
      });

      // Send next message with seq=3 (should work since batch updated expected seq)
      await act(async () => {
        ws.receiveMessage({
          type: "response.delta",
          delta: "AfterBatch",
          message_id: "msg-after",
          seq: 3,
        });
      });

      await waitFor(() => {
        expect(onResponseDelta).toHaveBeenCalledTimes(4);
        expect(onResponseDelta).toHaveBeenLastCalledWith(
          "AfterBatch",
          "msg-after",
        );
      });
    });
  });
});
