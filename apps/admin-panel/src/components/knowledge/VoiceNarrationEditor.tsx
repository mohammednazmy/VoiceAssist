/**
 * VoiceNarrationEditor - Edit voice narration for a page
 *
 * Provides a text area for editing the AI-generated voice narration
 * with preview functionality.
 */

import { useState } from "react";

interface VoiceNarrationEditorProps {
  narration: string;
  onChange: (narration: string) => void;
  disabled?: boolean;
}

export function VoiceNarrationEditor({
  narration,
  onChange,
  disabled = false,
}: VoiceNarrationEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const wordCount = narration.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          <span className="text-sm font-medium text-slate-200">Voice Narration</span>
          <span className="text-xs text-slate-500">({wordCount} words)</span>
        </div>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </div>

      {showPreview ? (
        <div className="p-4">
          <div className="text-sm text-slate-300 leading-relaxed italic">
            "{narration || "No narration available"}"
          </div>
          <div className="mt-3 text-xs text-slate-500">
            This text will be read aloud by the voice assistant when summarizing this page.
          </div>
        </div>
      ) : (
        <div className="p-4">
          <textarea
            value={narration}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Enter a 2-3 sentence voice-friendly summary of the key educational content on this page..."
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            rows={4}
          />
          <div className="mt-2 text-xs text-slate-500">
            Keep narrations concise (2-3 sentences) and focused on key educational points.
          </div>
        </div>
      )}
    </div>
  );
}
