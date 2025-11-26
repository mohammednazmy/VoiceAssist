import { Metadata } from "next";
import { getAllDocs } from "@/lib/docs";
import Link from "next/link";
import { DocsSearch } from "@/components/DocsSearch";

export const metadata: Metadata = {
  title: "All Documentation",
  description: "Complete index of all VoiceAssist documentation files",
};

export default function AllDocsPage() {
  const allDocs = getAllDocs();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          All Documentation
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Complete index of all markdown documentation files in the project.
          Search by name or filter by category.
        </p>
      </div>

      {/* Searchable Docs Index */}
      <DocsSearch docs={allDocs} />

      {/* Navigation */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            ← Back to Home
          </Link>
          <Link
            href="/architecture"
            className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Architecture →
          </Link>
        </div>
      </div>
    </div>
  );
}
