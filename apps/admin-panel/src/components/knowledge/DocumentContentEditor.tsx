/**
 * DocumentContentEditor - Main editor container for enhanced PDF content
 *
 * Provides a split view with:
 * - Left: Rendered page image
 * - Right: Content blocks and voice narration editors
 *
 * Features:
 * - Page navigation
 * - Save changes
 * - Regenerate AI analysis
 */

import { useState, useCallback, useEffect } from "react";
import {
  usePageContent,
  useSavePageContent,
  useRegeneratePageAI,
  type ContentBlock,
  type PageContent,
} from "../../hooks/usePageContent";
import { PageImageViewer } from "./PageImageViewer";
import { ContentBlockEditor } from "./ContentBlockEditor";
import { VoiceNarrationEditor } from "./VoiceNarrationEditor";

interface DocumentContentEditorProps {
  documentId: string;
  documentTitle: string;
  totalPages: number;
  initialPage?: number;
  onClose: () => void;
}

export function DocumentContentEditor({
  documentId,
  documentTitle,
  totalPages,
  initialPage = 1,
  onClose,
}: DocumentContentEditorProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [voiceNarration, setVoiceNarration] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // API hooks
  const { data, loading, error, refetch: _refetch } = usePageContent(documentId, currentPage);
  const { savePageContent, saving, error: saveError } = useSavePageContent();
  const { regeneratePage, regenerating, error: regenerateError } = useRegeneratePageAI();

  // Extract page content from response
  const pageContent: PageContent | null = data?.page || null;

  // Sync local state with fetched data
  useEffect(() => {
    if (pageContent) {
      setContentBlocks(pageContent.content_blocks || []);
      setVoiceNarration(pageContent.voice_narration || "");
      setIsDirty(false);
    }
  }, [pageContent]);

  // Handle block changes
  const handleBlockChange = useCallback((index: number, block: ContentBlock) => {
    setContentBlocks((prev) => {
      const updated = [...prev];
      updated[index] = block;
      return updated;
    });
    setIsDirty(true);
  }, []);

  const handleBlockDelete = useCallback((index: number) => {
    setContentBlocks((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }, []);

  const handleBlockMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setContentBlocks((prev) => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
    setIsDirty(true);
  }, []);

  const handleBlockMoveDown = useCallback((index: number) => {
    setContentBlocks((prev) => {
      if (index >= prev.length - 1) return prev;
      const updated = [...prev];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      return updated;
    });
    setIsDirty(true);
  }, []);

  const handleNarrationChange = useCallback((narration: string) => {
    setVoiceNarration(narration);
    setIsDirty(true);
  }, []);

  // Add new block
  const handleAddBlock = useCallback((type: ContentBlock["type"]) => {
    const newBlock: ContentBlock = { type };
    if (type === "text" || type === "heading") {
      newBlock.content = "";
    } else if (type === "table") {
      newBlock.headers = ["Column 1", "Column 2"];
      newBlock.rows = [["", ""]];
    } else if (type === "figure") {
      newBlock.figure_id = `fig_${Date.now()}`;
      newBlock.caption = "";
      newBlock.description = "";
    }
    setContentBlocks((prev) => [...prev, newBlock]);
    setIsDirty(true);
  }, []);

  // Save changes
  const handleSave = async () => {
    const success = await savePageContent(
      documentId,
      currentPage,
      contentBlocks,
      voiceNarration
    );
    if (success) {
      setIsDirty(false);
    }
  };

  // Regenerate AI analysis
  const handleRegenerate = async () => {
    const result = await regeneratePage(documentId, currentPage);
    if (result) {
      setContentBlocks(result.content_blocks || []);
      setVoiceNarration(result.voice_narration || "");
      setIsDirty(false);
    }
  };

  // Page navigation
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Confirm before closing if dirty
  const handleClose = () => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <div className="text-sm font-medium text-slate-100 truncate max-w-md">
              {documentTitle}
            </div>
            <div className="text-xs text-slate-500">Edit Enhanced Content</div>
          </div>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-slate-300 min-w-[100px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-3 py-1.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-md border border-slate-700 disabled:opacity-50"
          >
            {regenerating ? "Regenerating..." : "Regenerate AI"}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`px-4 py-1.5 text-sm font-medium rounded-md ${
              isDirty
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-slate-700 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : isDirty ? "Save Changes" : "Saved"}
          </button>
        </div>
      </div>

      {/* Error Messages */}
      {(error || saveError || regenerateError) && (
        <div className="px-6 py-2 bg-rose-950/50 border-b border-rose-900 text-sm text-rose-200">
          {error || saveError || regenerateError}
        </div>
      )}

      {/* Main Content */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left Panel: Page Image */}
        <div className="w-1/2 border-r border-slate-800">
          <PageImageViewer
            documentId={documentId}
            pageNumber={currentPage}
            className="h-full"
          />
        </div>

        {/* Right Panel: Content Editor */}
        <div className="w-1/2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-8 w-8 border-2 border-slate-600 border-t-blue-500 rounded-full" />
            </div>
          ) : !pageContent ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <svg className="h-12 w-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No enhanced content available for this page</p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="mt-4 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
              >
                {regenerating ? "Analyzing..." : "Analyze with AI"}
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Content Blocks */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-slate-300">
                    Content Blocks ({contentBlocks.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <AddBlockButton type="text" onClick={() => handleAddBlock("text")} />
                    <AddBlockButton type="heading" onClick={() => handleAddBlock("heading")} />
                    <AddBlockButton type="table" onClick={() => handleAddBlock("table")} />
                    <AddBlockButton type="figure" onClick={() => handleAddBlock("figure")} />
                  </div>
                </div>

                <div className="space-y-4 pl-10">
                  {contentBlocks.map((block, index) => (
                    <ContentBlockEditor
                      key={index}
                      block={block}
                      index={index}
                      onChange={(updated) => handleBlockChange(index, updated)}
                      onDelete={() => handleBlockDelete(index)}
                      onMoveUp={() => handleBlockMoveUp(index)}
                      onMoveDown={() => handleBlockMoveDown(index)}
                      isFirst={index === 0}
                      isLast={index === contentBlocks.length - 1}
                    />
                  ))}
                </div>

                {contentBlocks.length === 0 && (
                  <div className="text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-lg">
                    <p className="text-sm">No content blocks</p>
                    <p className="text-xs mt-1">Add blocks using the buttons above or regenerate AI analysis</p>
                  </div>
                )}
              </div>

              {/* Voice Narration */}
              <VoiceNarrationEditor
                narration={voiceNarration}
                onChange={handleNarrationChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add block button helper
function AddBlockButton({
  type,
  onClick,
}: {
  type: ContentBlock["type"];
  onClick: () => void;
}) {
  const icons: Record<string, JSX.Element> = {
    text: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
    ),
    heading: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    ),
    table: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    ),
    figure: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    ),
  };

  const labels: Record<string, string> = {
    text: "Text",
    heading: "Heading",
    table: "Table",
    figure: "Figure",
  };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded border border-slate-700"
      title={`Add ${labels[type]}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[type]}
      </svg>
      <span>+ {labels[type]}</span>
    </button>
  );
}
