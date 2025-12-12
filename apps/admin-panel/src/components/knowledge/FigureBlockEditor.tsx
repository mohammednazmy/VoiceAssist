/**
 * FigureBlockEditor - Edit figure content blocks
 *
 * Provides fields for editing figure caption and AI-generated description.
 */

import type { ContentBlock } from "../../hooks/usePageContent";

interface FigureBlockEditorProps {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  disabled?: boolean;
}

export function FigureBlockEditor({
  block,
  onChange,
  disabled = false,
}: FigureBlockEditorProps) {
  const handleCaptionChange = (value: string) => {
    onChange({ ...block, caption: value });
  };

  const handleDescriptionChange = (value: string) => {
    onChange({ ...block, description: value });
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <svg
          className="h-4 w-4 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium text-slate-200">Figure</span>
        {block.figure_id && (
          <span className="text-xs text-slate-500">{block.figure_id}</span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Caption */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Caption</label>
          <input
            type="text"
            value={block.caption || ""}
            onChange={(e) => handleCaptionChange(e.target.value)}
            disabled={disabled}
            placeholder="Figure caption (e.g., Figure 1.1: Cardiac auscultation points)"
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          />
        </div>

        {/* AI Description */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Voice Description (AI-generated)
          </label>
          <textarea
            value={block.description || ""}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            disabled={disabled}
            placeholder="Detailed description of what the figure shows, suitable for voice narration..."
            rows={4}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none disabled:opacity-50"
          />
          <div className="mt-1 text-xs text-slate-500">
            This description will be read aloud when a user asks about this figure.
          </div>
        </div>
      </div>
    </div>
  );
}
