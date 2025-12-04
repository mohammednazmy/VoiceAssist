/**
 * SpeakerAttributedTranscript - Multi-Speaker Transcript Display
 *
 * Displays transcripts with speaker attribution from the speaker
 * diarization service. Part of Voice Mode v4.1 Phase 3.
 *
 * Features:
 * - Color-coded speaker indicators
 * - Speaker name labels and legend
 * - Timestamp display for each segment
 * - Current speaker highlighting
 * - Confidence indicators
 * - Auto-scroll to latest segment
 *
 * Reference: docs/voice/speaker-diarization-service.md
 */

import { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "../ui/Tooltip";

export interface SpeakerSegment {
  /** Speaker identifier (e.g., "SPEAKER_00") */
  speakerId: string;
  /** Transcript text for this segment */
  text: string;
  /** Segment start time in milliseconds */
  startMs: number;
  /** Segment end time in milliseconds */
  endMs: number;
  /** Detection confidence (0-1) */
  confidence: number;
}

export interface SpeakerProfile {
  /** Speaker identifier */
  speakerId: string;
  /** Display name (user-assigned or auto-generated) */
  name?: string;
  /** Total speaking time in milliseconds */
  totalSpeakingMs?: number;
}

interface SpeakerAttributedTranscriptProps {
  /** List of speaker segments with transcripts */
  segments: SpeakerSegment[];
  /** Map of speaker IDs to profiles */
  speakerProfiles: Map<string, SpeakerProfile>;
  /** Currently speaking speaker ID */
  currentSpeaker?: string;
  /** Whether to show speaker legend */
  showLegend?: boolean;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Whether to show confidence indicators */
  showConfidence?: boolean;
  /** Whether to auto-scroll to latest segment */
  autoScroll?: boolean;
  /** Callback when a speaker name is clicked (for editing) */
  onSpeakerClick?: (speakerId: string) => void;
  /** Custom class name */
  className?: string;
}

const SPEAKER_COLORS = [
  {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
  },
  {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-300 dark:border-green-700",
  },
  {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-700",
  },
  {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-700",
  },
];

function getSpeakerColorIndex(speakerId: string): number {
  // Extract number from speaker ID (e.g., "SPEAKER_01" -> 1)
  const match = speakerId.match(/(\d+)$/);
  const index = match ? parseInt(match[1], 10) : 0;
  return index % SPEAKER_COLORS.length;
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function SpeakerAttributedTranscript({
  segments,
  speakerProfiles,
  currentSpeaker,
  showLegend = true,
  showTimestamps = true,
  showConfidence = false,
  autoScroll = true,
  onSpeakerClick,
  className,
}: SpeakerAttributedTranscriptProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest segment
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [segments, autoScroll]);

  // Get unique speakers from segments
  const uniqueSpeakers = useMemo(() => {
    const speakerIds = new Set(segments.map((s) => s.speakerId));
    return Array.from(speakerIds);
  }, [segments]);

  const getSpeakerName = (speakerId: string): string => {
    const profile = speakerProfiles.get(speakerId);
    return profile?.name || speakerId.replace("SPEAKER_", "Speaker ");
  };

  if (segments.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-8",
          "text-neutral-500 dark:text-neutral-400",
          "bg-neutral-50 dark:bg-neutral-800/50 rounded-lg",
          className,
        )}
      >
        <div className="text-center">
          <div className="text-lg mb-1">No transcript yet</div>
          <div className="text-sm">Speak to start the conversation</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("speaker-transcript", className)}>
      {/* Speaker Legend */}
      {showLegend && uniqueSpeakers.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {uniqueSpeakers.map((speakerId) => {
            const colorIndex = getSpeakerColorIndex(speakerId);
            const colors = SPEAKER_COLORS[colorIndex];
            const profile = speakerProfiles.get(speakerId);

            return (
              <Tooltip
                key={speakerId}
                content={
                  <div>
                    <div>{speakerId}</div>
                    {profile?.totalSpeakingMs && (
                      <div>
                        Speaking time: {formatTime(profile.totalSpeakingMs)}
                      </div>
                    )}
                  </div>
                }
              >
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
                    "border transition-all",
                    colors.bg,
                    colors.text,
                    colors.border,
                    currentSpeaker === speakerId &&
                      "ring-2 ring-blue-500 ring-offset-1",
                    onSpeakerClick && "cursor-pointer hover:opacity-80",
                  )}
                  onClick={() => onSpeakerClick?.(speakerId)}
                  type="button"
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      currentSpeaker === speakerId && "animate-pulse",
                      colors.bg.replace("bg-", "bg-").replace("/30", ""),
                    )}
                    style={{
                      backgroundColor:
                        colorIndex === 0
                          ? "#3b82f6"
                          : colorIndex === 1
                            ? "#22c55e"
                            : colorIndex === 2
                              ? "#a855f7"
                              : "#f97316",
                    }}
                  />
                  <span className="font-medium">
                    {getSpeakerName(speakerId)}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* Transcript Segments */}
      <div
        ref={scrollContainerRef}
        className="space-y-3 max-h-96 overflow-y-auto"
      >
        {segments.map((segment, index) => {
          const colorIndex = getSpeakerColorIndex(segment.speakerId);
          const colors = SPEAKER_COLORS[colorIndex];
          const isCurrentSpeaker = segment.speakerId === currentSpeaker;

          return (
            <div
              key={`${segment.speakerId}-${segment.startMs}-${index}`}
              className={cn("flex gap-3", isCurrentSpeaker && "animate-pulse")}
            >
              {/* Speaker Avatar */}
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full",
                  "flex items-center justify-center",
                  "text-xs font-medium",
                  colors.bg,
                  colors.text,
                  colors.border,
                  "border",
                )}
              >
                {segment.speakerId.replace("SPEAKER_", "")}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header with speaker name and timestamp */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-xs font-medium", colors.text)}>
                    {getSpeakerName(segment.speakerId)}
                  </span>

                  {showTimestamps && (
                    <span className="text-xs text-neutral-400">
                      {formatTime(segment.startMs)} -{" "}
                      {formatTime(segment.endMs)}
                    </span>
                  )}

                  {showConfidence && (
                    <Tooltip
                      content={`Confidence: ${Math.round(segment.confidence * 100)}%`}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          segment.confidence > 0.8
                            ? "bg-green-500"
                            : segment.confidence > 0.5
                              ? "bg-yellow-500"
                              : "bg-red-500",
                        )}
                      />
                    </Tooltip>
                  )}
                </div>

                {/* Transcript text */}
                <div className="text-sm text-neutral-900 dark:text-neutral-100">
                  {segment.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook to manage speaker diarization state
 */
export function useSpeakerDiarization() {
  // In production, this would connect to the diarization WebSocket
  // For now, return demo state

  const segments: SpeakerSegment[] = [];
  const speakerProfiles = new Map<string, SpeakerProfile>();
  const currentSpeaker: string | undefined = undefined;
  const isProcessing = false;

  return {
    segments,
    speakerProfiles,
    currentSpeaker,
    isProcessing,
    addSegment: (_segment: SpeakerSegment) => {},
    updateSpeakerName: (_speakerId: string, _name: string) => {},
    clearSegments: () => {},
  };
}

export default SpeakerAttributedTranscript;
