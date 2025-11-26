import { Metadata } from "next";
import { getAllDocs, listDocsInDirectory } from "@/lib/docs";
import Link from "next/link";

export const metadata: Metadata = {
  title: "All Documentation",
  description: "Complete index of all VoiceAssist documentation files",
};

export default function AllDocsPage() {
  const allDocs = getAllDocs();
  const clientImplDocs = listDocsInDirectory("client-implementation");
  const infraDocs = listDocsInDirectory("infra");
  const overviewDocs = listDocsInDirectory("overview");
  const voiceDocs = listDocsInDirectory("voice");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          All Documentation
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Complete index of all markdown documentation files in the project. Use
          this page to find specific documents or explore the full
          documentation.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {allDocs.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Root Docs
          </div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {clientImplDocs.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Client Implementation
          </div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {overviewDocs.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Overview
          </div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
            {voiceDocs.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Voice</div>
        </div>
      </div>

      {/* Document Lists */}
      <div className="space-y-8">
        {/* All Docs by Category */}
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="font-semibold text-blue-800 dark:text-blue-200">
              All Documentation ({allDocs.length} files)
            </h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {allDocs.map((doc) => (
                <div
                  key={doc.path}
                  className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                  title={doc.path}
                >
                  {doc.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Client Implementation */}
        {clientImplDocs.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="bg-green-50 dark:bg-green-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="font-semibold text-green-800 dark:text-green-200">
                Client Implementation ({clientImplDocs.length} files)
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {clientImplDocs.map((doc) => (
                  <div
                    key={doc}
                    className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                    title={doc}
                  >
                    {doc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Overview */}
        {overviewDocs.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="bg-purple-50 dark:bg-purple-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="font-semibold text-purple-800 dark:text-purple-200">
                Overview ({overviewDocs.length} files)
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {overviewDocs.map((doc) => (
                  <div
                    key={doc}
                    className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                    title={doc}
                  >
                    {doc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Voice */}
        {voiceDocs.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="font-semibold text-amber-800 dark:text-amber-200">
                Voice ({voiceDocs.length} files)
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {voiceDocs.map((doc) => (
                  <div
                    key={doc}
                    className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                    title={doc}
                  >
                    {doc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Infrastructure */}
        {infraDocs.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div className="bg-cyan-50 dark:bg-cyan-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="font-semibold text-cyan-800 dark:text-cyan-200">
                Infrastructure ({infraDocs.length} files)
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {infraDocs.map((doc) => (
                  <div
                    key={doc}
                    className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate"
                    title={doc}
                  >
                    {doc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

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
