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

import { useState, useCallback } from "react";
import { useThinkerTalkerVoiceMode } from "../../hooks/useThinkerTalkerVoiceMode";
import type {
  TTToolCall,
  TTVoiceMetrics,
} from "../../hooks/useThinkerTalkerSession";
import { CompactVoiceBar } from "./CompactVoiceBar";
import { VoiceExpandedDrawer } from "./VoiceExpandedDrawer";
import { VoiceModeSettings } from "./VoiceModeSettings";
import { EmotionIndicator } from "./EmotionIndicator";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";

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
      voice_id: elevenlabsVoiceId || "TxGEqnHWrfWFTfGW9XjX", // Josh as default
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

  // Handle close - disconnect if connected
  const handleClose = useCallback(() => {
    if (voiceMode.isConnected) {
      voiceMode.disconnect();
    }
    onClose?.();
  }, [voiceMode, onClose]);

  return (
    <div data-testid="thinker-talker-voice-panel">
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
      />

      {/* Settings Modal */}
      <VoiceModeSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default ThinkerTalkerVoicePanel;
