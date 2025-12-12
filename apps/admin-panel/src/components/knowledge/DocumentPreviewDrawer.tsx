/**
 * DocumentPreviewDrawer component
 * Shows document structure preview including TOC, sections, figures, and page content
 */

import { useEffect, useState } from "react";
import { fetchAPI } from "../../lib/api";
import type { DocumentRow } from "./DocumentTable";
import { DocumentContentEditor } from "./DocumentContentEditor";
import { useProcessEnhanced } from "../../hooks/usePageContent";

interface TOCEntry {
  title: string;
  level: number;
  page_number: number | null;
  section_id: string;
}

interface Section {
  section_id: string;
  title: string;
  level: number;
  start_page: number | null;
  end_page: number | null;
}

interface Figure {
  figure_id: string;
  page_number: number;
  caption: string;
  description: string | null;
}

interface PageFigureRef {
  figure_id: string;
  caption?: string;
}

interface PageContent {
  page_number: number;
  text: string;
  word_count: number;
  figures: (string | PageFigureRef)[];
}

interface DocumentStructure {
  document_id: string;
  title: string;
  total_pages: number | null;
  has_toc: boolean;
  has_figures: boolean;
  structure: {
    toc?: TOCEntry[];
    sections?: Section[];
    figures?: Figure[];
    pages?: PageContent[];
    metadata?: Record<string, unknown>;
  } | null;
}

interface DocumentPreviewDrawerProps {
  open: boolean;
  document: DocumentRow | null;
  onClose: () => void;
  onNarrationUpdated?: (documentId: string) => void;
}

type TabType = "overview" | "toc" | "pages" | "figures";

export function DocumentPreviewDrawer({
  open,
  document,
  onClose,
  onNarrationUpdated,
}: DocumentPreviewDrawerProps) {
  const [structure, setStructure] = useState<DocumentStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [showContentEditor, setShowContentEditor] = useState(false);
  const {
    processDocument,
    processing: processingEnhanced,
    error: processError,
    clearError: clearProcessError,
  } = useProcessEnhanced();

  useEffect(() => {
    const loadStructure = async () => {
      if (!open || !document) return;
      setLoading(true);
      setError(null);
      setActiveTab("overview");
      setSelectedPage(null);

      try {
        const response = await fetchAPI<{ data: DocumentStructure }>(
          `/api/admin/kb/documents/${document.id}/structure`
        );
        setStructure(response.data ?? response);
      } catch (err: unknown) {
        console.warn("Failed to load document structure:", err);
        setError("Document structure unavailable. This document may not have been processed with structure extraction.");
        // Create a fallback structure
        setStructure({
          document_id: document.id,
          title: document.name,
          total_pages: document.totalPages ?? null,
          has_toc: document.hasToc ?? false,
          has_figures: document.hasFigures ?? false,
          structure: null,
        });
      } finally {
        setLoading(false);
      }
    };

    loadStructure();
  }, [document, open]);

  if (!open || !document) return null;

  const processingStage = document.processingStage;
  const processingProgress = document.processingProgress;

  const enhancedStatusText = (() => {
    if (!processingStage || processingStage === "pending") return null;

    const progressValue =
      typeof processingProgress === "number"
        ? Math.max(0, Math.min(100, Math.round(processingProgress)))
        : undefined;

    if (processingStage === "complete") {
      return "Enhanced processing complete";
    }

    if (processingStage === "failed") {
      return "Enhanced processing failed – you can retry.";
    }

    const label =
      processingStage === "extracting"
        ? "Extracting"
        : processingStage === "analyzing"
          ? "Analyzing"
          : processingStage === "indexing"
            ? "Indexing"
            : processingStage;

    if (progressValue && progressValue > 0) {
      return `${label}… ${progressValue}%`;
    }
    return `${label}…`;
  })();

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    {
      id: "toc",
      label: "Contents",
      count: structure?.structure?.toc?.length ?? 0,
    },
    {
      id: "pages",
      label: "Pages",
      count: structure?.total_pages ?? 0,
    },
    {
      id: "figures",
      label: "Figures",
      count: structure?.structure?.figures?.length ?? 0,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-2xl h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm uppercase tracking-wide text-slate-500">
                Document Preview
              </div>
              <div className="text-lg font-semibold text-slate-100 mt-1">
                {document.name}
              </div>
              {enhancedStatusText && (
                <div className="mt-1 text-[11px] text-slate-400">
                  Enhanced processing:{" "}
                  <span className="text-slate-200">{enhancedStatusText}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Enhanced Processing / Edit Content Button */}
              {document.hasEnhancedStructure ? (
                <button
                  className="px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-700 rounded-md flex items-center gap-1.5"
                  onClick={() => {
                    clearProcessError();
                    setShowContentEditor(true);
                  }}
                  title="Edit enhanced content"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Content
                </button>
              ) : (
                <button
                  className="px-3 py-1.5 text-sm text-emerald-300 hover:text-emerald-200 border border-emerald-700 hover:border-emerald-600 rounded-md flex items-center gap-1.5 disabled:opacity-60"
                  onClick={async () => {
                    clearProcessError();
                    const ok = await processDocument(document.id);
                    if (ok) {
                      // After successful processing, open editor on first page
                      setShowContentEditor(true);
                    }
                  }}
                  disabled={processingEnhanced}
                  title={
                    processingStage === "failed"
                      ? "Retry enhanced GPT-4 Vision processing for this PDF"
                      : "Run enhanced GPT-4 Vision processing for this PDF"
                  }
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {processingEnhanced
                    ? "Processing…"
                    : processingStage === "failed"
                      ? "Retry processing"
                      : "Process with AI"}
                </button>
              )}
              {document.hasEnhancedStructure && (
                <button
                  className="px-3 py-1.5 text-xs text-purple-300 hover:text-purple-100 border border-purple-700 hover:border-purple-500 rounded-md flex items-center gap-1.5"
                  onClick={async () => {
                    try {
                      await fetchAPI(`/api/audio/admin/documents/${document.id}/generate-all`, {
                        method: "POST",
                      });
                      if (onNarrationUpdated) {
                        onNarrationUpdated(document.id);
                      }
                    } catch (err) {
                      // eslint-disable-next-line no-console
                      console.error("Failed to generate narrations", err);
                      alert(
                        "Failed to generate narrations for this document. Please check logs for details.",
                      );
                    }
                  }}
                  title="Pre-generate voice narrations for all pages in this enhanced document"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l7 3.5-7 3.5"
                    />
                  </svg>
                  Generate narrations
                </button>
              )}
              <button
                className="text-slate-400 hover:text-slate-100 p-2 rounded-md hover:bg-slate-800"
                onClick={onClose}
                aria-label="Close preview drawer"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1.5 text-xs ${activeTab === tab.id ? "text-blue-200" : "text-slate-500"}`}>
                    ({tab.count})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {processError && (
            <div className="mb-3 text-xs text-rose-300 bg-rose-950/50 border border-rose-900/60 rounded px-3 py-2">
              {processError}
            </div>
          )}
          {loading && (
            <div className="space-y-4">
              <div className="h-4 w-40 bg-slate-800 rounded animate-pulse" />
              <div className="h-20 bg-slate-800 rounded animate-pulse" />
              <div className="h-20 bg-slate-800 rounded animate-pulse" />
            </div>
          )}

          {error && (
            <div className="mb-4 text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded p-3">
              {error}
            </div>
          )}

          {!loading && activeTab === "overview" && (
            <OverviewTab document={document} structure={structure} />
          )}

          {!loading && activeTab === "toc" && (
            <TOCTab structure={structure} onSelectPage={setSelectedPage} />
          )}

          {!loading && activeTab === "pages" && (
            <PagesTab
              structure={structure}
              selectedPage={selectedPage}
              onSelectPage={setSelectedPage}
            />
          )}

          {!loading && activeTab === "figures" && (
            <FiguresTab structure={structure} onSelectPage={setSelectedPage} />
          )}
        </div>
      </div>

      {/* Content Editor Modal */}
      {showContentEditor && document && (
        <DocumentContentEditor
          documentId={document.id}
          documentTitle={document.name}
          totalPages={structure?.total_pages || document.totalPages || 1}
          initialPage={selectedPage || 1}
          onClose={() => setShowContentEditor(false)}
        />
      )}
    </div>
  );
}

// Overview Tab
function OverviewTab({
  document,
  structure,
}: {
  document: DocumentRow;
  structure: DocumentStructure | null;
}) {
  const stats = [
    { label: "Total Pages", value: structure?.total_pages ?? "N/A" },
    { label: "Chunks Indexed", value: document.chunksIndexed ?? 0 },
    { label: "Document Type", value: document.type || "Unknown" },
    { label: "Source", value: document.sourceType || "system" },
  ];

  const features = [
    { label: "Table of Contents", enabled: structure?.has_toc },
    { label: "Figures Detected", enabled: structure?.has_figures },
    { label: "Indexed", enabled: document.status === "indexed" },
    { label: "Public", enabled: document.isPublic },
    { label: "PHI Risk", enabled: !!document.phiRisk && document.phiRisk !== "none" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {stat.label}
            </div>
            <div className="text-xl font-semibold text-slate-100 mt-1">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Features</h3>
        <div className="grid grid-cols-2 gap-2">
          {features.map((feature) => (
            <div
              key={feature.label}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  feature.enabled ? "bg-emerald-500" : "bg-slate-600"
                }`}
              />
              <span className={feature.enabled ? "text-slate-200" : "text-slate-500"}>
                {feature.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      {structure?.structure?.metadata && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3">Metadata</h3>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm">
            <pre className="text-slate-400 overflow-x-auto">
              {JSON.stringify(structure.structure.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Last Indexed */}
      {document.lastIndexedAt && (
        <div className="text-xs text-slate-500">
          Last indexed: {new Date(document.lastIndexedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// TOC Tab
function TOCTab({
  structure,
  onSelectPage,
}: {
  structure: DocumentStructure | null;
  onSelectPage: (page: number) => void;
}) {
  const toc = structure?.structure?.toc ?? [];

  if (toc.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <svg className="h-12 w-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No table of contents available</p>
        <p className="text-xs mt-1">This document may not have an embedded TOC</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {toc.map((entry, index) => (
        <button
          key={`${entry.section_id}-${index}`}
          onClick={() => entry.page_number && onSelectPage(entry.page_number)}
          className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-800 transition-colors ${
            entry.page_number ? "cursor-pointer" : "cursor-default"
          }`}
          style={{ paddingLeft: `${(entry.level - 1) * 16 + 12}px` }}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm ${entry.level === 1 ? "font-medium text-slate-100" : "text-slate-300"}`}>
              {entry.title}
            </span>
            {entry.page_number && (
              <span className="text-xs text-slate-500">p. {entry.page_number}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// Pages Tab
function PagesTab({
  structure,
  selectedPage,
  onSelectPage,
}: {
  structure: DocumentStructure | null;
  selectedPage: number | null;
  onSelectPage: (page: number | null) => void;
}) {
  const pages = structure?.structure?.pages ?? [];
  const totalPages = structure?.total_pages ?? 0;

  if (totalPages === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <svg className="h-12 w-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p>No page content available</p>
      </div>
    );
  }

  // If a page is selected, show its content
  if (selectedPage !== null) {
    const pageContent = pages.find((p) => p.page_number === selectedPage);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelectPage(null)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to all pages
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => selectedPage > 1 && onSelectPage(selectedPage - 1)}
              disabled={selectedPage <= 1}
              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-slate-400">
              Page {selectedPage} of {totalPages}
            </span>
            <button
              onClick={() => selectedPage < totalPages && onSelectPage(selectedPage + 1)}
              disabled={selectedPage >= totalPages}
              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
            <span>Page {selectedPage}</span>
            {pageContent?.word_count && <span>{pageContent.word_count} words</span>}
          </div>
          {pageContent?.text ? (
            <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
              {pageContent.text.slice(0, 2000)}
              {pageContent.text.length > 2000 && (
                <span className="text-slate-500">... (truncated)</span>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">
              Page content not available
            </div>
          )}
          {pageContent?.figures && pageContent.figures.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-2">Figures on this page:</div>
              <div className="flex flex-wrap gap-2">
                {pageContent.figures.map((fig, idx) => {
                  // Handle both string and object formats
                  const figId = typeof fig === 'string' ? fig : fig.figure_id;
                  const caption = typeof fig === 'object' && fig.caption ? fig.caption : null;
                  return (
                    <span
                      key={figId || idx}
                      className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
                      title={caption || undefined}
                    >
                      {figId}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show page grid
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">
        {totalPages} pages total
        {pages.length > 0 && ` (${pages.length} with extracted content)`}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
          const hasContent = pages.some((p) => p.page_number === pageNum);
          return (
            <button
              key={pageNum}
              onClick={() => onSelectPage(pageNum)}
              className={`aspect-[3/4] rounded border text-sm font-medium transition-colors ${
                hasContent
                  ? "bg-blue-950/50 border-blue-800 text-blue-300 hover:bg-blue-900/50"
                  : "bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-700/50"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Figures Tab
function FiguresTab({
  structure,
  onSelectPage,
}: {
  structure: DocumentStructure | null;
  onSelectPage: (page: number) => void;
}) {
  const figures = structure?.structure?.figures ?? [];

  if (figures.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <svg className="h-12 w-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p>No figures detected</p>
        <p className="text-xs mt-1">This document may not contain figures or they were not detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {figures.map((figure) => (
        <button
          key={figure.figure_id}
          onClick={() => onSelectPage(figure.page_number)}
          className="w-full text-left bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200 truncate">
                {figure.figure_id}
              </div>
              {figure.caption && (
                <div className="text-sm text-slate-400 mt-1 line-clamp-2">
                  {figure.caption}
                </div>
              )}
              {figure.description && (
                <div className="text-xs text-slate-500 mt-2 line-clamp-2">
                  {figure.description}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 text-xs text-slate-500">
              p. {figure.page_number}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
