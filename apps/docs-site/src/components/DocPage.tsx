import { loadDoc } from "@/lib/docs";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface DocPageProps {
  title: string;
  description?: string;
  docPaths: string[];
}

function formatDocName(docPath: string) {
  const name = docPath.split("/").pop() || docPath;
  return name.replace(/_/g, " ").replace(/\.md$/i, "");
}

export function DocPage({ title, description, docPaths }: DocPageProps) {
  const loadedDocs = docPaths
    .map((path) => ({ path, doc: loadDoc(path) }))
    .filter((entry) => entry.doc !== null) as {
    path: string;
    doc: NonNullable<ReturnType<typeof loadDoc>>;
  }[];

  const combinedContent = loadedDocs
    .map((entry) => entry.doc.content)
    .join("\n\n---\n\n");

  return (
    <div className="space-y-8">
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
