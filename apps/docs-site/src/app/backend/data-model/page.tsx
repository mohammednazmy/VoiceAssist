import { Metadata } from "next";
import { loadDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Model",
  description:
    "VoiceAssist data model, database schema, and entity relationships",
};

export default function DataModelPage() {
  const dataModel = loadDoc("DATA_MODEL.md");
  const schemaDoc = loadDoc("SCHEMA.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Data Model
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Database schema, entity relationships, and data structures used
          throughout the VoiceAssist platform.
        </p>
      </div>

      {/* Key Entities */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Conversations
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Chat sessions with messages, context, and metadata
          </p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Knowledge Base
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            Documents, pages, embeddings, and semantic search data
          </p>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
            Users
          </h3>
          <p className="text-sm text-purple-700 dark:text-purple-300">
            User accounts, sessions, and preferences
          </p>
        </div>
      </div>

      {/* Related Links */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/backend/architecture"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Backend Architecture →
        </Link>
        <Link
          href="/reference/api"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          API Reference →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {dataModel && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={dataModel.content} />
          </div>
        )}

        {schemaDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Schema Reference
            </h2>
            <MarkdownRenderer content={schemaDoc.content} />
          </div>
        )}

        {!dataModel && !schemaDoc && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Database Overview
            </h2>
            <ul className="space-y-3 text-gray-600 dark:text-gray-400">
              <li>
                • <strong>SQLite:</strong> Primary database for conversations
                and KB metadata
              </li>
              <li>
                • <strong>Vector Storage:</strong> Embeddings for semantic
                search
              </li>
              <li>
                • <strong>Redis:</strong> Session cache and real-time state
              </li>
              <li>
                • <strong>PostgreSQL:</strong> Future migration path for scale
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
