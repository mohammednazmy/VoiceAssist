/**
 * Unified Conversation Store Unit Tests
 * Focus: voice state transition guards / invariants
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useUnifiedConversationStore } from "../unifiedConversationStore";
import { mapPipelineStateToVoiceState } from "../../hooks/useThinkerTalkerVoiceMode";

describe("unifiedConversationStore - voice state guards", () => {
  beforeEach(() => {
    // Reset store before each test
    useUnifiedConversationStore.setState((state) => ({
      ...state,
      voiceModeActive: false,
      voiceState: "idle",
      isListening: false,
      isSpeaking: false,
      partialTranscript: "",
      voiceConnectionStatus: "disconnected",
      voiceError: null,
    }));
  });

  describe("voice state + pipeline mapping contract", () => {
    it("applies mapped voice states when connected and voice mode is active", () => {
      // Start from a clean, connected, active voice mode
      useUnifiedConversationStore.setState((state) => ({
        ...state,
        voiceModeActive: true,
        voiceConnectionStatus: "connected",
        voiceState: "idle",
      }));

      const store = useUnifiedConversationStore.getState();

      // For each pipeline state, map to voice state and apply via setVoiceState
      const examples: Array<["listening" | "processing" | "speaking" | "idle" | "cancelled" | "error", string]> =
        [
          ["listening", "listening"],
          ["processing", "processing"],
          ["speaking", "responding"], // speaking → responding
          ["idle", "idle"],
          ["cancelled", "idle"],
          ["error", "error"],
        ];

      for (const [pipelineState, expectedVoiceState] of examples) {
        const mapped = mapPipelineStateToVoiceState(pipelineState);
        store.setVoiceState(mapped);
        expect(useUnifiedConversationStore.getState().voiceState).toBe(
          expectedVoiceState,
        );
      }
    });

    it("never keeps active voice states when connection is disconnected", () => {
      // Mark connection as disconnected
      useUnifiedConversationStore.setState((state) => ({
        ...state,
        voiceModeActive: true,
        voiceConnectionStatus: "disconnected",
        voiceState: "idle",
      }));

      const store = useUnifiedConversationStore.getState();

      // Map a speaking pipeline state to voice state and apply it
      const mapped = mapPipelineStateToVoiceState("speaking");
      store.setVoiceState(mapped);

      const { voiceState, isListening, isSpeaking, voiceConnectionStatus } =
        useUnifiedConversationStore.getState();

      expect(voiceConnectionStatus).toBe("disconnected");
      expect(isListening).toBe(false);
      expect(isSpeaking).toBe(false);
      // Guards should coerce back to idle/error instead of staying in an active state
      expect(["idle", "error"]).toContain(voiceState);
    });
  });

  it("does not enter listening when disconnected", () => {
    const store = useUnifiedConversationStore.getState();

    // Explicitly mark voice as disconnected and inactive
    store.setVoiceConnectionStatus("disconnected");
    expect(useUnifiedConversationStore.getState().voiceState).toBe("idle");

    // Attempt to start listening while disconnected
    useUnifiedConversationStore.getState().startListening();

    const { voiceState, isListening } =
      useUnifiedConversationStore.getState();
    expect(isListening).toBe(false);
    expect(voiceState === "idle" || voiceState === "error").toBe(true);
  });

  it("coerces active states back to idle when connection becomes disconnected", () => {
    const store = useUnifiedConversationStore.getState();

    // Simulate an active listening state while connected
    store.setVoiceConnectionStatus("connected");
    useUnifiedConversationStore.setState({
      ...useUnifiedConversationStore.getState(),
      voiceModeActive: true,
      voiceState: "listening",
      isListening: true,
    });

    // Now transition connection to disconnected
    store.setVoiceConnectionStatus("disconnected");

    const { voiceState, isListening, isSpeaking, voiceConnectionStatus } =
      useUnifiedConversationStore.getState();

    expect(voiceConnectionStatus).toBe("disconnected");
    expect(isListening).toBe(false);
    expect(isSpeaking).toBe(false);
    expect(voiceState === "idle" || voiceState === "error").toBe(true);
  });

  it("does not keep responding state when voice mode is inactive", () => {
    // Force responding state while voice mode is inactive
    useUnifiedConversationStore.setState({
      ...useUnifiedConversationStore.getState(),
      voiceModeActive: false,
    });

    useUnifiedConversationStore.getState().setVoiceState("responding");

    const { voiceState } = useUnifiedConversationStore.getState();
    expect(voiceState === "idle" || voiceState === "error").toBe(true);
  });

  it("clears listening/speaking when an error is set", () => {
    const store = useUnifiedConversationStore.getState();

    // Simulate an active voice session
    useUnifiedConversationStore.setState({
      ...useUnifiedConversationStore.getState(),
      voiceModeActive: true,
      voiceConnectionStatus: "connected",
      isListening: true,
      isSpeaking: true,
      voiceState: "listening",
    });

    // Surface an error via setVoiceError
    store.setVoiceError({
      code: "test_error",
      message: "Simulated error",
      timestamp: Date.now(),
      retryCount: 0,
    });

    const { voiceState, isListening, isSpeaking } =
      useUnifiedConversationStore.getState();

    expect(voiceState).toBe("error");
    expect(isListening).toBe(false);
    expect(isSpeaking).toBe(false);
  });
});
