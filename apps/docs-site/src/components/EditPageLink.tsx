/**
 * EditPageLink Component
 * Shows "Edit this page on GitHub" and "Report an issue" links for documentation pages
 */

import { getGitHubEditUrl } from "@/lib/docs";

const GITHUB_REPO = "mohammednazmy/VoiceAssist";

export interface EditPageLinkProps {
  /** Path relative to docs/ directory */
  docPath: string;
}

export function EditPageLink({ docPath }: EditPageLinkProps) {
  const editUrl = getGitHubEditUrl(docPath);
  const issueUrl = `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(`Docs: ${docPath}`)}&labels=documentation&body=${encodeURIComponent(`## Documentation Issue\n\n**Page:** \`${docPath}\`\n\n**Issue Description:**\n\n<!-- Describe the issue with the documentation -->\n`)}`;

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-4">
      <a
        href={editUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
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
            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
          />
        </svg>
        Edit this page on GitHub
      </a>
      <span className="text-gray-300 dark:text-gray-600">|</span>
      <a
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
      >
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
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
        Report an issue
      </a>
    </div>
  );
}
