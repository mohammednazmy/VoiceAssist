/**
 * CitationDisplay Component
 * Displays citations with expandable metadata, external links, and export functionality
 */

import { useState } from "react";
import type { Citation } from "../../types";
import { useToastContext } from "../../contexts/ToastContext";

export interface CitationDisplayProps {
  citations: Citation[];
  enableExport?: boolean;
}

const getSourceKey = (citation: Citation): string =>
  (citation.sourceType || citation.source || "unknown").toLowerCase();

const getSourceLabel = (citation: Citation): string => {
  const key = getSourceKey(citation);
  if (key === "kb") return "Knowledge Base";
  if (key === "pubmed") return "PubMed";
  if (key === "openevidence") return "OpenEvidence";
  if (key === "guideline") return "Guideline";
  if (key === "url") return "External Link";
  if (key === "doi") return "DOI";
  return "External";
};

// Helper function to export citations as Markdown
const exportAsMarkdown = (citations: Citation[]): string => {
  let markdown = "# Citations\n\n";

  citations.forEach((citation, index) => {
    markdown += `## ${index + 1}. `;
    markdown +=
      citation.title ||
      (citation.source === "kb" ? "Knowledge Base" : "External Link");
    if (citation.page) {
      markdown += ` (Page ${citation.page})`;
    }
    markdown += "\n\n";

    if (citation.snippet) {
      markdown += `> ${citation.snippet}\n\n`;
    }

    if (citation.reference) {
      markdown += `**Reference:** ${citation.reference}\n\n`;
    }

    if (citation.doi) {
      markdown += `**DOI:** [${citation.doi}](https://doi.org/${citation.doi})\n\n`;
    }

    if (citation.pubmedId) {
      markdown += `**PubMed:** [${citation.pubmedId}](https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}/)\n\n`;
    }

    if (citation.url) {
      markdown += `**URL:** ${citation.url}\n\n`;
    }

    if (citation.authors && citation.authors.length > 0) {
      markdown += `**Authors:** ${citation.authors.join(", ")}\n\n`;
    }

    if (citation.publicationYear) {
      markdown += `**Year:** ${citation.publicationYear}\n\n`;
    }

    if (citation.metadata && Object.keys(citation.metadata).length > 0) {
      markdown += "**Additional Information:**\n";
      Object.entries(citation.metadata).forEach(([key, value]) => {
        markdown += `- ${key}: ${value}\n`;
      });
      markdown += "\n";
    }

    markdown += "---\n\n";
  });

  return markdown;
};

// Helper function to trigger download
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Helper function to format a single citation for clipboard
const formatCitationForClipboard = (citation: Citation): string => {
  const parts: string[] = [];

  // Title or source
  const title =
    citation.title ||
    (citation.source === "kb" ? "Knowledge Base" : "External Link");
  parts.push(title);

  // Authors and year (academic style)
  if (citation.authors && citation.authors.length > 0) {
    const authorStr = citation.authors.join(", ");
    if (citation.publicationYear) {
      parts.push(`${authorStr} (${citation.publicationYear})`);
    } else {
      parts.push(authorStr);
    }
  } else if (citation.publicationYear) {
    parts.push(`(${citation.publicationYear})`);
  }

  // Journal/source info
  if (citation.journal) {
    parts.push(citation.journal);
  }

  // Page
  if (citation.page) {
    parts.push(`Page ${citation.page}`);
  }

  // Reference
  if (citation.reference) {
    parts.push(citation.reference);
  }

  // Snippet (quoted)
  if (citation.snippet) {
    parts.push(`"${citation.snippet}"`);
  }

  // DOI
  if (citation.doi) {
    parts.push(`DOI: ${citation.doi}`);
  }

  // PubMed
  if (citation.pubmedId) {
    parts.push(`PubMed: ${citation.pubmedId}`);
  }

  // URL
  if (citation.url) {
    parts.push(citation.url);
  }

  return parts.join("\n");
};

export function CitationDisplay({
  citations,
  enableExport = true,
}: CitationDisplayProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const toast = useToastContext();

  const availableSources = Array.from(
    new Set(citations.map((citation) => getSourceKey(citation))),
  ).filter(Boolean);

  const filteredCitations =
    sourceFilter === "all"
      ? citations
      : citations.filter((citation) => getSourceKey(citation) === sourceFilter);

  const visibleCitations = filteredCitations;
  const totalCount = citations.length;
  const visibleCount = visibleCitations.length;
  const countLabel =
    sourceFilter === "all"
      ? totalCount === 1
        ? "1 Source"
        : `${totalCount} Sources`
      : `${visibleCount} of ${totalCount} Sources`;

  const formatSourceKey = (key: string) => {
    if (key === "kb") return "Knowledge Base";
    if (key === "pubmed") return "PubMed";
    if (key === "openevidence") return "OpenEvidence";
    if (key === "guideline") return "Guideline";
    if (key === "url") return "External Link";
    if (key === "doi") return "DOI";
    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyCitation = async (citation: Citation) => {
    try {
      const text = formatCitationForClipboard(citation);
      await navigator.clipboard.writeText(text);
      setCopiedId(citation.id);
      toast.success("Citation copied to clipboard");
      // Reset copied state after 2 seconds
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy citation");
    }
  };

  const handleExportMarkdown = () => {
    const markdown = exportAsMarkdown(visibleCitations);
    const timestamp = new Date().toISOString().split("T")[0];
    downloadFile(markdown, `citations-${timestamp}.md`, "text/markdown");
  };

  const handleExportText = () => {
    const markdown = exportAsMarkdown(visibleCitations);
    // Convert markdown to plain text (simple approach)
    const plainText = markdown
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/^>\s+/gm, '"')
      .replace(/^-\s+/gm, "• ");
    const timestamp = new Date().toISOString().split("T")[0];
    downloadFile(plainText, `citations-${timestamp}.txt`, "text/plain");
  };

  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-neutral-600">{countLabel}</div>

        {enableExport && citations.length > 0 && (
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportMarkdown}
              className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
              title="Export as Markdown"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 inline mr-1"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Markdown
            </button>
            <button
              onClick={handleExportText}
              className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
              title="Export as text"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 inline mr-1"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Text
            </button>
          </div>
        )}
      </div>

      {availableSources.length > 1 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter citations by source"
        >
          <button
            onClick={() => setSourceFilter("all")}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              sourceFilter === "all"
                ? "bg-primary-100 text-primary-800 border-primary-200"
                : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
            }`}
            aria-pressed={sourceFilter === "all"}
          >
            All sources
          </button>
          {availableSources.map((sourceKey) => (
            <button
              key={sourceKey}
              onClick={() => setSourceFilter(sourceKey)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                sourceFilter === sourceKey
                  ? "bg-primary-100 text-primary-800 border-primary-200"
                  : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
              }`}
              aria-pressed={sourceFilter === sourceKey}
            >
              {formatSourceKey(sourceKey)}
            </button>
          ))}
        </div>
      )}

      {visibleCount === 0 && totalCount > 0 && (
        <div className="text-xs text-neutral-500" role="status">
          No citations match this source filter.
        </div>
      )}

      {visibleCitations.map((citation, index) => {
        const isExpanded = expandedIds.has(citation.id);
        const sourceLabel =
          citation.title ||
          (citation.source === "kb" ? "Knowledge Base" : "External Link");

        return (
          <div
            key={citation.id}
            className="border border-neutral-200 rounded-md overflow-hidden"
          >
            {/* Citation Header */}
            <button
              onClick={() => toggleExpanded(citation.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-neutral-50 transition-colors"
              aria-expanded={isExpanded}
              aria-controls={`citation-${citation.id}`}
            >
              <div className="flex items-center space-x-2 text-left">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
                  {index + 1}
                </span>

                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-neutral-100 text-neutral-700 rounded-full">
                    {getSourceLabel(citation)}
                  </span>
                  {citation.source === "kb" ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4 text-neutral-500"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  ) : citation.source === "pubmed" || citation.pubmedId ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4 text-blue-600"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4 text-neutral-500"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                      />
                    </svg>
                  )}

                  <span className="text-sm font-medium text-neutral-700 truncate max-w-md">
                    {sourceLabel}
                    {citation.page && ` (Page ${citation.page})`}
                  </span>
                </div>
              </div>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`w-4 h-4 text-neutral-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div
                id={`citation-${citation.id}`}
                className="px-3 pb-3 space-y-2 bg-neutral-50"
              >
                {/* Copy button */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleCopyCitation(citation)}
                    className="inline-flex items-center space-x-1 text-xs text-neutral-600 hover:text-neutral-800 px-2 py-1 rounded hover:bg-neutral-200 transition-colors"
                    title="Copy citation to clipboard"
                    aria-label="Copy citation to clipboard"
                  >
                    {copiedId === citation.id ? (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4 text-green-600"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        <span className="text-green-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                          />
                        </svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Snippet */}
                {citation.snippet && (
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">
                      Excerpt:
                    </div>
                    <div className="text-sm text-neutral-700 italic bg-white p-2 rounded border border-neutral-200">
                      "{citation.snippet}"
                    </div>
                  </div>
                )}

                {/* Reference */}
                {citation.reference && (
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">
                      Reference:
                    </div>
                    <div className="text-sm text-neutral-700 font-mono bg-white p-2 rounded border border-neutral-200 break-all">
                      {citation.reference}
                    </div>
                  </div>
                )}

                {/* Authors and Year */}
                {(citation.authors || citation.publicationYear) && (
                  <div className="flex items-start space-x-4">
                    {citation.authors && citation.authors.length > 0 && (
                      <div className="flex-1">
                        <div className="text-xs font-medium text-neutral-600 mb-1">
                          Authors:
                        </div>
                        <div className="text-sm text-neutral-700 bg-white p-2 rounded border border-neutral-200">
                          {citation.authors.join(", ")}
                        </div>
                      </div>
                    )}
                    {citation.publicationYear && (
                      <div className="w-24">
                        <div className="text-xs font-medium text-neutral-600 mb-1">
                          Year:
                        </div>
                        <div className="text-sm text-neutral-700 bg-white p-2 rounded border border-neutral-200">
                          {citation.publicationYear}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Metadata */}
                {citation.metadata &&
                  Object.keys(citation.metadata).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-neutral-600 mb-1">
                        Additional Info:
                      </div>
                      <div className="text-sm text-neutral-700 bg-white p-2 rounded border border-neutral-200">
                        {Object.entries(citation.metadata).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="flex items-start space-x-2 mb-1 last:mb-0"
                            >
                              <span className="font-medium capitalize">
                                {key}:
                              </span>
                              <span>{String(value)}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {/* External Links */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {/* DOI Link */}
                  {citation.doi && (
                    <a
                      href={`https://doi.org/${citation.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 font-medium bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                      <span>DOI: {citation.doi}</span>
                    </a>
                  )}

                  {/* PubMed Link */}
                  {citation.pubmedId && (
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-sm text-green-600 hover:text-green-700 font-medium bg-green-50 hover:bg-green-100 px-3 py-1 rounded transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                      <span>PubMed: {citation.pubmedId}</span>
                    </a>
                  )}

                  {/* URL Link (for non-kb sources) */}
                  {citation.source !== "kb" &&
                    (citation.url ||
                      citation.reference?.startsWith("http")) && (
                      <a
                        href={citation.url || citation.reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium bg-primary-50 hover:bg-primary-100 px-3 py-1 rounded transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                          />
                        </svg>
                        <span>Open source</span>
                      </a>
                    )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
