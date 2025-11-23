/**
 * Export Dialog Component
 * Dialog for exporting conversations to PDF or Markdown
 */

import { useState } from 'react';
import { Button } from '@voiceassist/ui';
import type { Message } from '@voiceassist/types';
import {
  exportConversationToMarkdown,
  exportConversationToPDF,
} from '../../utils/exportConversation';

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationTitle: string;
  messages: Message[];
}

export function ExportDialog({
  isOpen,
  onClose,
  conversationTitle,
  messages,
}: ExportDialogProps) {
  const [format, setFormat] = useState<'markdown' | 'pdf'>('markdown');
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeCitations, setIncludeCitations] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      if (format === 'markdown') {
        exportConversationToMarkdown(
          conversationTitle,
          messages,
          includeTimestamps,
          includeCitations
        );
      } else {
        exportConversationToPDF(
          conversationTitle,
          messages,
          includeTimestamps,
          includeCitations
        );
      }

      // Close dialog after short delay
      setTimeout(() => {
        onClose();
        setIsExporting(false);
      }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to export conversation');
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const messageCount = messages.length;
  const citationCount = messages.reduce((count, msg) => {
    const citations = msg.metadata?.citations || msg.citations || [];
    return count + citations.length;
  }, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-labelledby="export-dialog-title"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            id="export-dialog-title"
            className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            Export Conversation
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close dialog"
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

        {/* Content Stats */}
        <div className="mb-6 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {conversationTitle}
          </h3>
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <p>{messageCount} messages</p>
            {citationCount > 0 && <p>{citationCount} citations</p>}
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            Export Format
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('markdown')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                format === 'markdown'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
              }`}
            >
              <div className="flex flex-col items-center space-y-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className={`w-6 h-6 ${
                    format === 'markdown'
                      ? 'text-primary-600'
                      : 'text-neutral-500'
                  }`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span
                  className={`text-sm font-medium ${
                    format === 'markdown'
                      ? 'text-primary-700 dark:text-primary-400'
                      : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  Markdown
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                format === 'pdf'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
              }`}
            >
              <div className="flex flex-col items-center space-y-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className={`w-6 h-6 ${
                    format === 'pdf' ? 'text-primary-600' : 'text-neutral-500'
                  }`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                  />
                </svg>
                <span
                  className={`text-sm font-medium ${
                    format === 'pdf'
                      ? 'text-primary-700 dark:text-primary-400'
                      : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  PDF
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="mb-6 space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTimestamps}
              onChange={(e) => setIncludeTimestamps(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Include timestamps
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCitations}
              onChange={(e) => setIncludeCitations(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Include citations {citationCount > 0 && `(${citationCount})`}
            </span>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || messages.length === 0}
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4 mr-2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Export
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
