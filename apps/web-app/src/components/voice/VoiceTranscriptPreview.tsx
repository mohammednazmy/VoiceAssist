/**
 * VoiceTranscriptPreview
 * Displays live streaming speech-to-text preview while user speaks
 *
 * Features:
 * - Shows partial transcript in real-time as user speaks
 * - Subtle visual styling to indicate "in progress" state
 * - Accessible with aria-live for screen readers
 * - Auto-clears when speech completes
 */

export interface VoiceTranscriptPreviewProps {
  /** Current partial/streaming transcript text */
  partialTranscript: string;
  /** Whether the user is currently speaking */
  isSpeaking: boolean;
}

export function VoiceTranscriptPreview({
  partialTranscript,
  isSpeaking,
}: VoiceTranscriptPreviewProps) {
  // Only show when speaking and there's partial text
  if (!isSpeaking || !partialTranscript) {
    return null;
  }

  return (
    <div
      className="p-3 bg-blue-50/70 border border-blue-200/50 rounded-lg"
      data-testid="voice-transcript-preview"
    >
      <div className="flex items-start space-x-2">
        {/* Listening indicator */}
        <div className="flex items-center space-x-1 flex-shrink-0 mt-0.5">
          <span
            className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-blue-600">Listening</span>
        </div>

        {/* Live transcript with aria-live for accessibility */}
        <div
          className="flex-1 min-w-0"
          role="status"
          aria-live="polite"
          aria-atomic="false"
        >
          <p
            className="text-sm text-blue-700 italic leading-relaxed"
            data-testid="partial-transcript-text"
          >
            {partialTranscript}
            {/* Blinking cursor to indicate more text coming */}
            <span
              className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-text-bottom"
              aria-hidden="true"
            />
          </p>
        </div>
      </div>
    </div>
  );
}
