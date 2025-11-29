/**
 * Citation Sidebar
 * Display and navigate all citations from the current conversation
 */

import { useState, useMemo } from "react";
import { CitationDisplay } from "../chat/CitationDisplay";
import type { Citation } from "../../types";
import type { Message } from "@voiceassist/types";

/** Type filter options */
type TypeFilter =
  | "all"
  | "kb"
  | "pubmed"
  | "guideline"
  | "openevidence"
  | "external";

/** Citation with message reference for jump-to functionality */
interface CitationWithMessage {
  citation: Citation;
  messageId: string;
  messageRole: string;
  messageIndex: number;
}

export interface CitationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  /** Called when user clicks jump-to for a citation */
  onJumpToMessage?: (messageId: string) => void;
}

export function CitationSidebar({
  isOpen,
  onClose,
  messages,
  onJumpToMessage,
}: CitationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [messageFilter, setMessageFilter] = useState<string>("all");

  // Aggregate all citations from all messages with message references
  const { allCitationsWithMessages, messageOptions } = useMemo(() => {
    const citationsMap = new Map<string, CitationWithMessage>();
    const messagesWithCitations: Array<{
      id: string;
      label: string;
      index: number;
    }> = [];

    messages.forEach((message, index) => {
      // Check metadata.citations first, then top-level citations
      const citations = message.metadata?.citations || message.citations || [];

      if (citations.length > 0) {
        // Build message label for filter dropdown
        const roleLabel = message.role === "user" ? "You" : "Assistant";
        const timestamp = new Date(message.timestamp).toLocaleTimeString(
          "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        );
        messagesWithCitations.push({
          id: message.id,
          label: `${roleLabel} · ${timestamp}`,
          index: index + 1,
        });

        citations.forEach((citation: Citation) => {
          if (!citationsMap.has(citation.id)) {
            citationsMap.set(citation.id, {
              citation,
              messageId: message.id,
              messageRole: message.role,
              messageIndex: index + 1,
            });
          }
        });
      }
    });

    return {
      allCitationsWithMessages: Array.from(citationsMap.values()),
      messageOptions: messagesWithCitations,
    };
  }, [messages]);

  // Get unique citations for display count
  const allCitations = useMemo(
    () => allCitationsWithMessages.map((c) => c.citation),
    [allCitationsWithMessages],
  );

  // Helper to determine citation type category
  const getCitationType = (citation: Citation): TypeFilter => {
    // Check for guidelines first (sourceType takes precedence)
    if (
      citation.sourceType === "guideline" ||
      citation.title?.toLowerCase().includes("guideline")
    ) {
      return "guideline";
    }
    if (
      citation.sourceType === "openevidence" ||
      citation.source === "openevidence"
    ) {
      return "openevidence";
    }
    // Check for PubMed (source or pubmedId, not just DOI)
    if (citation.source === "pubmed" || citation.pubmedId) {
      return "pubmed";
    }
    // KB is the default for knowledge base
    if (citation.source === "kb") {
      return "kb";
    }
    // Default to external bucket for everything else
    return "external";
  };

  // Filter citations based on search, type, and message filters
  const filteredCitationsWithMessages = useMemo(() => {
    return allCitationsWithMessages.filter((item) => {
      const { citation, messageId } = item;

      // Type filter
      if (typeFilter !== "all" && getCitationType(citation) !== typeFilter) {
        return false;
      }

      // Message filter
      if (messageFilter !== "all" && messageId !== messageFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          citation.title,
          citation.subtitle,
          citation.reference,
          citation.snippet,
          citation.authors?.join(" "),
          citation.location,
          citation.doi,
          citation.pubmedId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [allCitationsWithMessages, typeFilter, messageFilter, searchQuery]);

  // Extract just the citations for CitationDisplay
  const filteredCitations = useMemo(
    () => filteredCitationsWithMessages.map((c) => c.citation),
    [filteredCitationsWithMessages],
  );

  if (!isOpen) {
    return null;
  }

  const hasCitations = allCitations.length > 0;

  return (
    <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto">
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 bg-black/50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-lg md:relative md:w-80 md:shadow-none overflow-y-auto"
        role="complementary"
        aria-label="Citations"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Citations
          </h2>
          <div className="flex items-center gap-2">
            {hasCitations && (
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {filteredCitations.length} of {allCitations.length}
              </span>
            )}
            <button
              onClick={onClose}
              className="md:hidden p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Close citation sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters Section */}
        {hasCitations && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search citations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-neutral-800 dark:text-neutral-100"
                data-testid="citation-search-input"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 absolute left-3 top-2.5 text-neutral-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  aria-label="Clear search"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Type Filter Pills */}
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by type"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "kb", label: "Knowledge Base" },
                  { value: "pubmed", label: "PubMed / DOI" },
                  { value: "guideline", label: "Guidelines" },
                  { value: "openevidence", label: "OpenEvidence" },
                  { value: "external", label: "External" },
                ] as const
              )
                .filter(
                  (option) =>
                    option.value === "all" ||
                    allCitations.some(
                      (citation) => getCitationType(citation) === option.value,
                    ),
                )
                .map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTypeFilter(option.value)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                      typeFilter === option.value
                        ? "bg-primary-500 text-white"
                        : "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    }`}
                    aria-pressed={typeFilter === option.value}
                    data-testid={`type-filter-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
            </div>

            {/* Message Filter Dropdown */}
            {messageOptions.length > 1 && (
              <div>
                <label
                  htmlFor="message-filter"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Filter by message
                </label>
                <select
                  id="message-filter"
                  value={messageFilter}
                  onChange={(e) => setMessageFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-neutral-800 dark:text-neutral-100"
                  data-testid="message-filter-select"
                >
                  <option value="all">All messages</option>
                  {messageOptions.map((msg) => (
                    <option key={msg.id} value={msg.id}>
                      Message #{msg.index} ({msg.label})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {!hasCitations ? (
            // Empty state
            <div className="text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-16 h-16 mx-auto mb-4 text-neutral-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                No citations yet
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Citations will appear here as you chat
              </p>
            </div>
          ) : filteredCitations.length === 0 ? (
            // No results from search
            <div className="text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-16 h-16 mx-auto mb-4 text-neutral-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                No citations found
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                Try adjusting your search query
              </p>
            </div>
          ) : (
            // Display citations with jump-to functionality
            <div className="space-y-4">
              {filteredCitationsWithMessages.map((item) => (
                <div
                  key={item.citation.id}
                  className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700"
                  data-testid={`citation-item-${item.citation.id}`}
                >
                  {/* Citation content */}
                  <CitationDisplay
                    citations={[item.citation]}
                    enableExport={true}
                  />

                  {/* Jump to message button */}
                  {onJumpToMessage && (
                    <button
                      type="button"
                      onClick={() => onJumpToMessage(item.messageId)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded-md transition-colors"
                      data-testid={`jump-to-message-${item.citation.id}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                      Jump to message #{item.messageIndex}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 flex-shrink-0 text-blue-600 mt-0.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <p>
              Citations are automatically collected from AI responses and
              provide sources for medical information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
