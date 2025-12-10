import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { getGitHubEditUrl, listAllDocPaths, loadDoc } from "@/lib/docs";

interface DocPageProps {
  params: { slug: string[] };
}

/**
 * Generate static params for all docs at build time (required for output: export)
 */
export function generateStaticParams() {
  const docPaths = listAllDocPaths();
  return docPaths.map((docPath) => ({
    slug: docPath.split("/"),
  }));
}

const formatTitle = (slugParts: string[]) =>
  slugParts[slugParts.length - 1]
    ?.replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Document";

export function generateMetadata({ params }: DocPageProps): Metadata {
  const relativePath = `${params.slug.join("/")}.md`;
  const doc = loadDoc(relativePath);
  const title = doc?.frontmatter.title || formatTitle(params.slug);

  return {
    title: `${title} | Docs`,
    description:
      doc?.frontmatter.description ||
      `Documentation page for ${title} sourced from the docs directory.`,
  };
}

export default function DocPage({ params }: DocPageProps) {
  const slugParts = Array.isArray(params.slug) ? params.slug : [params.slug];
  const relativePath = `${slugParts.map(decodeURIComponent).join("/")}.md`;
  const doc = loadDoc(relativePath);

  if (!doc) {
    return notFound();
  }

  const title = doc.frontmatter.title || formatTitle(slugParts);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Docs / Raw</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sourced from{" "}
            <code className="font-mono text-xs">docs/{relativePath}</code>
          </p>
        </div>
        <a
          href={getGitHubEditUrl(relativePath)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:border-primary-500 dark:hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          Edit on GitHub
        </a>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <MarkdownRenderer content={doc.content} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/reference/all-docs"
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          ← All documentation
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
