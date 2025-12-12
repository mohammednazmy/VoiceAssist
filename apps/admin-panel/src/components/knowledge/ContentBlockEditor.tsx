/**
 * ContentBlockEditor - Edit individual content blocks
 *
 * Switches between different editor types based on block type:
 * - text/heading: Text area
 * - table: TableBlockEditor
 * - figure: FigureBlockEditor
 */

import type { ContentBlock } from "../../hooks/usePageContent";
import { TableBlockEditor } from "./TableBlockEditor";
import { FigureBlockEditor } from "./FigureBlockEditor";

interface ContentBlockEditorProps {
  block: ContentBlock;
  index: number;
  onChange: (block: ContentBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
}

export function ContentBlockEditor({
  block,
  index,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  disabled = false,
}: ContentBlockEditorProps) {
  // Render different editors based on block type
  switch (block.type) {
    case "table":
      return (
        <BlockWrapper
          index={index}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
        >
          <TableBlockEditor block={block} onChange={onChange} disabled={disabled} />
        </BlockWrapper>
      );

    case "figure":
      return (
        <BlockWrapper
          index={index}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
        >
          <FigureBlockEditor block={block} onChange={onChange} disabled={disabled} />
        </BlockWrapper>
      );

    case "heading":
      return (
        <BlockWrapper
          index={index}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
        >
          <HeadingBlockEditor block={block} onChange={onChange} disabled={disabled} />
        </BlockWrapper>
      );

    case "text":
    default:
      return (
        <BlockWrapper
          index={index}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
        >
          <TextBlockEditor block={block} onChange={onChange} disabled={disabled} />
        </BlockWrapper>
      );
  }
}

// Wrapper with reorder/delete controls
function BlockWrapper({
  index,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  disabled,
  children,
}: {
  index: number;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      {/* Reorder/Delete controls */}
      {!disabled && (
        <div className="absolute -left-10 top-0 bottom-0 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-xs text-slate-600 text-center">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Delete button */}
      {!disabled && (
        <button
          onClick={onDelete}
          className="absolute -right-2 -top-2 hidden group-hover:flex items-center justify-center h-6 w-6 bg-rose-600 text-white rounded-full text-sm hover:bg-rose-500 z-10"
          title="Delete block"
        >
          &times;
        </button>
      )}

      {children}
    </div>
  );
}

// Text block editor
function TextBlockEditor({
  block,
  onChange,
  disabled,
}: {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <svg
          className="h-4 w-4 text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h7"
          />
        </svg>
        <span className="text-sm font-medium text-slate-200">Text</span>
      </div>
      <div className="p-4">
        <textarea
          value={block.content || ""}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          disabled={disabled}
          placeholder="Enter text content..."
          rows={4}
          className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:opacity-50"
        />
      </div>
    </div>
  );
}

// Heading block editor
function HeadingBlockEditor({
  block,
  onChange,
  disabled,
}: {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <svg
          className="h-4 w-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
        <span className="text-sm font-medium text-slate-200">Heading</span>
      </div>
      <div className="p-4">
        <input
          type="text"
          value={block.content || ""}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          disabled={disabled}
          placeholder="Enter heading text..."
          className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-base font-semibold text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
