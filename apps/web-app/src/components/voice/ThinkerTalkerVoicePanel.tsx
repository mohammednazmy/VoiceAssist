/**
 * ThinkerTalkerVoicePanel
 *
 * Voice mode panel using the Thinker/Talker pipeline instead of OpenAI Realtime API.
 * Features:
 * - Unified conversation context with chat mode
 * - Full tool/RAG support in voice
 * - Real-time tool call visualization
 * - ElevenLabs streaming TTS
 * - Barge-in support
 * - Compact mode (~80px) that doesn't obscure chat
 * - Expandable drawer for detailed metrics and tool calls
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 * Phase 11: Compact Voice Mode UI
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useThinkerTalkerVoiceMode } from "../../hooks/useThinkerTalkerVoiceMode";
import type {
  TTToolCall,
  TTVoiceMetrics,
} from "../../hooks/useThinkerTalkerSession";
import { CompactVoiceBar } from "./CompactVoiceBar";
import { VoiceExpandedDrawer } from "./VoiceExpandedDrawer";
import { VoiceModeSettings } from "./VoiceModeSettings";
import { EmotionIndicator } from "./EmotionIndicator";
import { ThinkingFeedbackPanel } from "./ThinkingFeedbackPanel";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";
import { DEFAULT_VOICE_ID } from "../../lib/voiceConstants";

// ============================================================================
// Types
// ============================================================================

export interface ThinkerTalkerVoicePanelProps {
  /** Conversation ID for context */
  conversationId?: string;
  /** Called when panel should close */
  onClose?: () => void;
  /** Called when user transcript is received */
  onUserMessage?: (content: string) => void;
  /** Called when AI response is received */
  onAssistantMessage?: (content: string) => void;
  /** Called when metrics are updated */
  onMetricsUpdate?: (metrics: TTVoiceMetrics) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function ThinkerTalkerVoicePanel({
  conversationId,
  onClose,
  onUserMessage,
  onAssistantMessage,
  onMetricsUpdate,
}: ThinkerTalkerVoicePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Voice settings from store
  const { elevenlabsVoiceId, language, vadSensitivity } =
    useVoiceSettingsStore();

  // T/T Voice Mode hook
  const voiceMode = useThinkerTalkerVoiceMode({
    conversation_id: conversationId,
    voiceSettings: {
      voice_id: elevenlabsVoiceId || DEFAULT_VOICE_ID, // From voiceConstants.ts
      language,
      barge_in_enabled: true,
      vad_sensitivity: vadSensitivity, // 0-100 from settings
    },
    onUserTranscript: (text, isFinal) => {
      if (isFinal) {
        onUserMessage?.(text);
      }
    },
    onAIResponse: (text, isFinal) => {
      if (isFinal) {
        onAssistantMessage?.(text);
      }
    },
    onToolCall: (toolCall: TTToolCall) => {
      console.log("[ThinkerTalkerVoicePanel] Tool call:", toolCall.name);
    },
    onMetricsUpdate: (metrics: TTVoiceMetrics) => {
      onMetricsUpdate?.(metrics);
    },
  });

  // Map metrics to VoiceMetrics format for the drawer
  const mappedMetrics = {
    connectionTimeMs: voiceMode.metrics.connectionTimeMs,
    timeToFirstTranscriptMs: voiceMode.metrics.sttLatencyMs,
    lastSttLatencyMs: voiceMode.metrics.sttLatencyMs,
    lastResponseLatencyMs: voiceMode.metrics.totalLatencyMs,
    sessionDurationMs: voiceMode.metrics.sessionDurationMs,
    userTranscriptCount: voiceMode.metrics.userUtteranceCount,
    aiResponseCount: voiceMode.metrics.aiResponseCount,
    reconnectCount: voiceMode.metrics.reconnectCount,
    sessionStartedAt: voiceMode.metrics.sessionStartedAt,
  };

  // Auto-connect when panel opens (single-click voice activation)
  // Store connect function in ref to avoid triggering effect on every render
  const connectRef = useRef(voiceMode.connect);
  connectRef.current = voiceMode.connect;

  const hasAutoConnected = useRef(false);
  useEffect(() => {
    // Only auto-connect once when panel mounts
    if (
      !hasAutoConnected.current &&
      !voiceMode.isConnected &&
      !voiceMode.isConnecting
    ) {
      hasAutoConnected.current = true;
      connectRef.current();
    }
    // Note: We intentionally exclude voiceMode.connect from dependencies
    // because the ref ensures we always use the latest function,
    // and we only want this effect to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode.isConnected, voiceMode.isConnecting]);

  // Handle close - disconnect if connected
  const handleClose = useCallback(() => {
    if (voiceMode.isConnected) {
      voiceMode.disconnect();
    }
    onClose?.();
  }, [voiceMode, onClose]);

  return (
    <div data-testid="thinker-talker-voice-panel">
      <div data-testid="voice-mode-panel" aria-label="Voice mode panel">
        {/* Expanded drawer (slides up above compact bar) */}
        <VoiceExpandedDrawer
          isOpen={isExpanded}
          onCollapse={() => setIsExpanded(false)}
          metrics={mappedMetrics}
          isConnected={voiceMode.isConnected}
          toolCalls={voiceMode.currentToolCalls}
          error={voiceMode.error}
          onDismissError={voiceMode.resetError}
          ttfaMs={voiceMode.ttfaMs}
        />

        {/* Phase 1: Emotion indicator (floats above compact bar when emotion detected) */}
        {voiceMode.isConnected && voiceMode.currentEmotion && (
          <div className="absolute bottom-24 right-4 z-10">
            <EmotionIndicator
              emotion={voiceMode.currentEmotion}
              size="sm"
              showDetails={false}
            />
          </div>
        )}

        {/* Thinking feedback: audio tones + visual indicator during processing */}
        {voiceMode.isConnected && (
          <div className="absolute bottom-24 left-4 z-10">
            <ThinkingFeedbackPanel
              isThinking={
                voiceMode.pipelineState === "processing" ||
                voiceMode.currentToolCalls.length > 0
              }
              isTTSPlaying={voiceMode.isPlaying}
              size="sm"
              showLabel={true}
              label={
                voiceMode.currentToolCalls.length > 0
                  ? `Running ${voiceMode.currentToolCalls[0]?.name || "tool"}...`
                  : "Thinking..."
              }
              thinkingSource={voiceMode.thinkingSource}
            />
          </div>
        )}

        {/* Compact bar (always visible) */}
        <CompactVoiceBar
          isConnected={voiceMode.isConnected}
          isConnecting={voiceMode.isConnecting}
          isListening={voiceMode.isListening}
          isPlaying={voiceMode.isPlaying}
          isMicPermissionDenied={voiceMode.isMicPermissionDenied}
          pipelineState={voiceMode.pipelineState}
          partialTranscript={voiceMode.partialTranscript}
          currentToolCalls={voiceMode.currentToolCalls}
          latencyMs={voiceMode.metrics.totalLatencyMs}
          onConnect={voiceMode.connect}
          onDisconnect={voiceMode.disconnect}
          onBargeIn={voiceMode.bargeIn}
          onExpand={() => setIsExpanded(true)}
          onClose={handleClose}
          onOpenSettings={() => {
            console.log(
              "[ThinkerTalkerVoicePanel] Settings button clicked, setting showSettings to true",
            );
            setShowSettings(true);
          }}
          isContinuationExpected={voiceMode.isContinuationExpected}
          networkQuality={voiceMode.networkQuality}
        />

        {/* Settings Modal */}
        <VoiceModeSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </div>
    </div>
  );
}

export default ThinkerTalkerVoicePanel;
