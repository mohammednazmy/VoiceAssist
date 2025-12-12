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
 * - Document navigation with page/section tracking
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 * Phase 11: Compact Voice Mode UI
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useThinkerTalkerVoiceMode } from "../../hooks/useThinkerTalkerVoiceMode";
import { useVoiceDocumentSession } from "../../hooks/useVoiceDocumentSession";
import type {
  TTToolCall,
  TTVoiceMetrics,
} from "../../hooks/useThinkerTalkerSession";
import { CompactVoiceBar } from "./CompactVoiceBar";
import { VoiceExpandedDrawer } from "./VoiceExpandedDrawer";
import { VoiceModeSettings } from "./VoiceModeSettings";
import { EmotionIndicator } from "./EmotionIndicator";
import { ThinkingFeedbackPanel } from "./ThinkingFeedbackPanel";
import {
  DocumentContextIndicator,
  DocumentNavigationHints,
} from "./DocumentContextIndicator";
import { useVoiceSettingsStore } from "../../stores/voiceSettingsStore";
import { DEFAULT_VOICE_ID } from "../../lib/voiceConstants";

// ============================================================================
// Types
// ============================================================================

export interface ThinkerTalkerVoicePanelProps {
  /** Conversation ID for context */
  conversationId?: string;
  /** Document ID to start a document session (from URL params) */
  documentId?: string;
  /** Document title (from URL params) */
  documentTitle?: string;
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
  documentId,
  documentTitle,
  onClose,
  onUserMessage,
  onAssistantMessage,
  onMetricsUpdate,
}: ThinkerTalkerVoicePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [followDocument, setFollowDocument] = useState<boolean>(
    Boolean(documentId),
  );
  const [readingModeEnabled, setReadingModeEnabled] = useState<boolean>(false);
  const [readingSpeed, setReadingSpeed] = useState<"slow" | "normal" | "fast">(
    "normal",
  );
  const [readingDetail, setReadingDetail] = useState<"short" | "full">("full");
  const [phiMode, setPhiMode] = useState<"clinical" | "demo">("clinical");

  // Track "awaiting LLM response" state for reliable thinking indicator
  // This persists even if the backend's "processing" state is brief
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const lastTranscriptRef = useRef<string>("");

  // Voice settings from store
  const { elevenlabsVoiceId, language, vadSensitivity, setVoiceModeType } =
    useVoiceSettingsStore();

  // Document session hook for voice document navigation
  const documentSession = useVoiceDocumentSession({
    conversationId: conversationId || "",
    autoLoad: Boolean(conversationId),
  });

  // Start or end document session based on "Follow this document" toggle
  useEffect(() => {
    if (!conversationId || !documentId) return;

    if (
      followDocument &&
      !documentSession.isActive &&
      !documentSession.isLoading
    ) {
      documentSession.startSession(documentId).catch((err) => {
        console.error(
          "[ThinkerTalkerVoicePanel] Failed to start document session:",
          err,
        );
      });
    }

    if (
      !followDocument &&
      documentSession.isActive &&
      !documentSession.isLoading
    ) {
      documentSession.endSession().catch((err) => {
        console.error(
          "[ThinkerTalkerVoicePanel] Failed to end document session:",
          err,
        );
      });
    }
  }, [
    conversationId,
    documentId,
    followDocument,
    documentSession.isActive,
    documentSession.isLoading,
    documentSession,
  ]);

  // T/T Voice Mode hook
  const voiceMode = useThinkerTalkerVoiceMode({
    conversation_id: conversationId,
    voiceSettings: {
      voice_id: elevenlabsVoiceId || DEFAULT_VOICE_ID, // From voiceConstants.ts
      language,
      barge_in_enabled: true,
      vad_sensitivity: vadSensitivity, // 0-100 from settings
    },
    // Long-form document reading + PHI-conscious controls
    readingModeEnabled,
    readingSpeed,
    readingDetail,
    phiMode,
    onUserTranscript: (text, isFinal) => {
      if (isFinal) {
        // Track that we're awaiting LLM response (for thinking indicator)
        lastTranscriptRef.current = text;
        setIsAwaitingResponse(true);
        onUserMessage?.(text);
      }
    },
    onAIResponse: (text, isFinal) => {
      // Clear "awaiting response" state when we receive any AI response
      setIsAwaitingResponse(false);
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

  // Clear "awaiting response" state when AI starts playing audio or speaking
  // This is a backup in case onAIResponse callback isn't called in time
  useEffect(() => {
    if (voiceMode.isPlaying || voiceMode.pipelineState === "speaking") {
      setIsAwaitingResponse(false);
    }
  }, [voiceMode.isPlaying, voiceMode.pipelineState]);

  // Clear "awaiting response" state on disconnect
  useEffect(() => {
    if (!voiceMode.isConnected) {
      setIsAwaitingResponse(false);
      lastTranscriptRef.current = "";
    }
  }, [voiceMode.isConnected]);

  // When KB source chips in the chat timeline are clicked, open the
  // expanded drawer so clinicians can see full KB details without
  // hunting for the voice controls.
  useEffect(() => {
    const handler = () => {
      setIsExpanded(true);
    };

    window.addEventListener("voiceassist:kbdrawer_open", handler);
    return () => {
      window.removeEventListener("voiceassist:kbdrawer_open", handler);
    };
  }, []);

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
  }, [voiceMode.isConnected, voiceMode.isConnecting]);

  // Handle close - disconnect if connected
  const handleClose = useCallback(() => {
    if (voiceMode.isConnected) {
      voiceMode.disconnect();
    }
    onClose?.();
  }, [voiceMode, onClose]);

  const handleRetryVoice = useCallback(() => {
    // Clear the current error, then attempt a fresh connection.
    // We don't hard-reset messages; this just restarts the voice
    // session so clinicians can continue dictation or conversation.
    voiceMode.resetError();
    if (voiceMode.isConnected) {
      voiceMode.disconnect();
    }
    voiceMode.connect();
  }, [voiceMode]);

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
                // Backend is in processing state
                voiceMode.pipelineState === "processing" ||
                // Tool calls are active
                voiceMode.currentToolCalls.length > 0 ||
                // Awaiting LLM response: set after final transcript, cleared when AI responds
                // This reliably tracks the "thinking" gap even if backend state is brief
                isAwaitingResponse
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

        {/* Document context indicator - shows when a document session is active */}
        {(documentSession.isActive || documentSession.isLoading) && (
          <div className="mb-2 mt-2 space-y-2">
            {/* Document binding, reading mode, and PHI-conscious controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-blue-500"
                    checked={followDocument}
                    onChange={(e) => setFollowDocument(e.target.checked)}
                  />
                  <span className="font-medium text-slate-200">
                    Follow this document
                  </span>
                </label>
                {documentTitle && (
                  <span className="max-w-[180px] truncate text-slate-500">
                    {documentTitle}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Reading mode toggle */}
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-blue-500"
                    checked={readingModeEnabled}
                    onChange={(e) =>
                      setReadingModeEnabled(e.target.checked)
                    }
                  />
                  <span className="text-slate-400">Reading mode</span>
                </label>
                {/* Reading pacing: speed */}
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-400">Speed</span>
                  <select
                    className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-200"
                    value={readingSpeed}
                    onChange={(e) =>
                      setReadingSpeed(
                        e.target.value as "slow" | "normal" | "fast",
                      )
                    }
                  >
                    <option value="slow">Slower</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Faster</option>
                  </select>
                </label>
                {/* Reading detail: summary vs full */}
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-400">Detail</span>
                  <select
                    className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-200"
                    value={readingDetail}
                    onChange={(e) =>
                      setReadingDetail(
                        e.target.value as "short" | "full",
                      )
                    }
                  >
                    <option value="short">Summary</option>
                    <option value="full">Full text</option>
                  </select>
                </label>
                {/* PHI-conscious demo mode toggle */}
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-amber-500"
                    checked={phiMode === "demo"}
                    onChange={(e) =>
                      setPhiMode(e.target.checked ? "demo" : "clinical")
                    }
                  />
                  <span className="text-amber-300">PHI-conscious demo</span>
                </label>
              </div>
            </div>

            <DocumentContextIndicator
              session={documentSession.session}
              isLoading={documentSession.isLoading}
              onEndSession={() => setFollowDocument(false)}
              size="sm"
            />

            {/* Document navigation voice hints */}
            {documentSession.session && (
              <DocumentNavigationHints
                visible
                currentPage={documentSession.session.current_page}
                totalPages={documentSession.session.total_pages}
                hasToc={documentSession.session.has_toc}
                hasFigures={documentSession.session.has_figures}
              />
            )}
          </div>
        )}

        {/* High-noise hint: suggest push-to-talk when backend recommends it */}
        {voiceMode.pushToTalkRecommended && (
          <div className="mb-2 mt-2 flex items-center justify-between rounded border border-amber-600 bg-amber-900/70 px-3 py-2 text-xs text-amber-50">
            <p className="mr-3">
              High background noise detected. Push-to-talk mode is recommended
              for more reliable voice capture in this environment.
            </p>
            <button
              type="button"
              onClick={() => setVoiceModeType("push-to-talk")}
              className="inline-flex items-center rounded bg-amber-600 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-500"
            >
              Use push-to-talk
            </button>
          </div>
        )}

        {/* Minimal error affordance */}
        {voiceMode.error && (
          <div className="mb-2 mt-2 flex items-center justify-between rounded border border-red-700 bg-red-950/70 px-3 py-2 text-xs text-red-100">
            <p className="mr-3">
              Voice had a connection issue. You can safely retry; no audio or
              transcripts were lost.
            </p>
            <button
              type="button"
              onClick={handleRetryVoice}
              className="inline-flex items-center rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              Retry voice
            </button>
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
