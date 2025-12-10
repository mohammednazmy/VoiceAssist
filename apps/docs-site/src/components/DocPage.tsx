import { loadDocWithPrefix, DocMetadata, DocStatus } from "@/lib/docs";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface DocPageProps {
  title: string;
  description?: string;
  docPaths: string[];
}

function formatDocName(docPath: string) {
  // Remove @root/ prefix for display
  const cleanPath = docPath.replace(/^@root\//, "");
  const name = cleanPath.split("/").pop() || cleanPath;
  return name.replace(/_/g, " ").replace(/\.md$/i, "");
}

/** Status badge color mapping */
const STATUS_COLORS: Record<DocStatus, string> = {
  stable:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  experimental:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  draft:
    "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  deprecated:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

/** Stability badge color mapping */
const STABILITY_COLORS: Record<string, string> = {
  production:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  beta: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  experimental:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  legacy:
    "bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900/30 dark:text-stone-300 dark:border-stone-800",
};

function StatusBadge({ status }: { status: DocStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors}`}
    >
      {status}
    </span>
  );
}

function StabilityBadge({ stability }: { stability: string }) {
  const colors = STABILITY_COLORS[stability] || STABILITY_COLORS.beta;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors}`}
    >
      {stability}
    </span>
  );
}

function MetadataBar({ metadata }: { metadata: DocMetadata }) {
  const hasMetadata =
    metadata.status ||
    metadata.owner ||
    metadata.lastUpdated ||
    (metadata.audience && metadata.audience.length > 0);

  if (!hasMetadata) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900/50">
      {metadata.status && <StatusBadge status={metadata.status} />}

      {metadata.owner && (
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="capitalize">{metadata.owner}</span>
        </span>
      )}

      {metadata.lastUpdated && (
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{metadata.lastUpdated}</span>
        </span>
      )}

      {metadata.audience && metadata.audience.length > 0 && (
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span className="capitalize">{metadata.audience.join(", ")}</span>
        </span>
      )}

      {metadata.tags && metadata.tags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <svg
            className="h-4 w-4 text-gray-500 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          <div className="flex flex-wrap gap-1">
            {metadata.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocPage({ title, description, docPaths }: DocPageProps) {
  const loadedDocs = docPaths
    .map((path) => ({ path, doc: loadDocWithPrefix(path) }))
    .filter((entry) => entry.doc !== null) as {
    path: string;
    doc: NonNullable<ReturnType<typeof loadDocWithPrefix>>;
  }[];

  const combinedContent = loadedDocs
    .map((entry) => entry.doc.content)
    .join("\n\n---\n\n");

  // Get metadata from the first loaded doc (primary doc)
  const primaryMetadata =
    loadedDocs.length > 0 ? loadedDocs[0].doc.frontmatter : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
          VoiceAssist Docs
        </p>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>
        {description ? (
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {description}
          </p>
        ) : null}
      </header>

      {primaryMetadata && <MetadataBar metadata={primaryMetadata} />}

      {loadedDocs.length > 0 ? (
        <MarkdownRenderer content={combinedContent} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <p className="font-semibold">Content coming soon</p>
          <p className="mt-2 text-sm">
            Add one of the following markdown files under docs/ to populate this
            page:
          </p>
          <ul className="mt-2 list-disc list-inside text-sm text-gray-600 dark:text-gray-300">
            {docPaths.map((path) => (
              <li key={path}>{formatDocName(path)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
