/**
 * CitationDisplay Component
 * Displays citations with expandable metadata
 */

import { useState } from 'react';
import type { Citation } from '@voiceassist/types';

export interface CitationDisplayProps {
  citations: Citation[];
}

export function CitationDisplay({ citations }: CitationDisplayProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-neutral-600">
        {citations.length === 1 ? '1 Source' : `${citations.length} Sources`}
      </div>

      {citations.map((citation, index) => {
        const isExpanded = expandedIds.has(citation.id);

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
                  {citation.source === 'kb' ? (
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
                    {citation.source === 'kb' ? 'Knowledge Base' : 'External Link'}
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
                  isExpanded ? 'rotate-180' : ''
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
                {/* Snippet */}
                {citation.snippet && (
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">Excerpt:</div>
                    <div className="text-sm text-neutral-700 italic bg-white p-2 rounded border border-neutral-200">
                      "{citation.snippet}"
                    </div>
                  </div>
                )}

                {/* Reference */}
                <div>
                  <div className="text-xs font-medium text-neutral-600 mb-1">Reference:</div>
                  <div className="text-sm text-neutral-700 font-mono bg-white p-2 rounded border border-neutral-200 break-all">
                    {citation.reference}
                  </div>
                </div>

                {/* Additional Metadata */}
                {citation.metadata && Object.keys(citation.metadata).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">
                      Additional Info:
                    </div>
                    <div className="text-sm text-neutral-700 bg-white p-2 rounded border border-neutral-200">
                      {Object.entries(citation.metadata).map(([key, value]) => (
                        <div key={key} className="flex items-start space-x-2 mb-1 last:mb-0">
                          <span className="font-medium capitalize">{key}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* External Link Button */}
                {citation.source === 'url' && (
                  <a
                    href={citation.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <span>Open source</span>
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
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
