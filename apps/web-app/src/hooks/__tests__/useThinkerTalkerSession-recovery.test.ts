/**
 * useThinkerTalkerSession Hook Tests - Recovery Snapshot Handling
 *
 * Focus: session.resume.ack with pipeline_state and privacy-aware
 * transcript handling (storeTranscriptHistory = false on backend).
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

// Helper to establish connection and be ready for messages
async function connectReady(
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

describe("useThinkerTalkerSession - Recovery Snapshot Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.clearInstances();
  });

  afterEach(() => {
    MockWebSocket.clearInstances();
  });

  it("applies recovered pipeline_state while keeping transcript empty when backend omits history", async () => {
    const onPipelineStateChange = vi.fn();

    const { result } = renderHook(() =>
      useThinkerTalkerSession({ onPipelineStateChange }),
    );

    const ws = await connectReady(result);

    // Sanity: initial transcript / partials are empty
    expect(result.current.transcript).toBe("");
    expect(result.current.partialTranscript).toBe("");

    // Simulate backend sending a recovery ACK snapshot for a session where
    // storeTranscriptHistory=false. In that case, the server clears
    // partial_transcript/partial_response but still sends pipeline_state.
    await act(async () => {
      ws.receiveMessage({
        type: "session.resume.ack",
        recovery_state: "full",
        conversation_id: "conv-123",
        partial_transcript: "",
        partial_response: "",
        missed_message_count: 0,
        pipeline_state: "processing",
      });
    });

    await waitFor(() => {
      // Voice state should reflect recovered pipeline_state
      expect(result.current.pipelineState).toBe("processing");
    });

    // Transcript/partials should remain empty (no recovery of text when
    // history is not persisted on the backend).
    expect(result.current.transcript).toBe("");
    expect(result.current.partialTranscript).toBe("");

    // onPipelineStateChange should be called with recovered state
    expect(onPipelineStateChange).toHaveBeenCalledWith(
      "processing",
      "recovered",
    );
  });

  it("applies recovered error pipeline_state without restoring transcripts", async () => {
    const onPipelineStateChange = vi.fn();

    const { result } = renderHook(() =>
      useThinkerTalkerSession({ onPipelineStateChange }),
    );

    const ws = await connectReady(result);

    // Sanity: initial transcript / partials are empty
    expect(result.current.transcript).toBe("");
    expect(result.current.partialTranscript).toBe("");

    await act(async () => {
      ws.receiveMessage({
        type: "session.resume.ack",
        recovery_state: "full",
        conversation_id: "conv-error",
        // Backend has store_transcript_history=false in this scenario,
        // so transcript fields are omitted but pipeline_state is "error".
        partial_transcript: "",
        partial_response: "",
        missed_message_count: 0,
        pipeline_state: "error",
      });
    });

    await waitFor(() => {
      expect(result.current.pipelineState).toBe("error");
    });

    expect(result.current.transcript).toBe("");
    expect(result.current.partialTranscript).toBe("");

    expect(onPipelineStateChange).toHaveBeenCalledWith("error", "recovered");
  });
});
