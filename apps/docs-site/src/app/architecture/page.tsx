import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Architecture",
  description: "VoiceAssist system architecture and design documentation",
};

export default function ArchitecturePage() {
  // Try to load architecture docs in order of preference
  const architectureDoc =
    loadClientImplDoc("ARCHITECTURE_OVERVIEW.md") ||
    loadDoc("ARCHITECTURE.md") ||
    loadDoc("UNIFIED_ARCHITECTURE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          System Architecture
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Overview of the VoiceAssist system architecture, including frontend,
          backend, and infrastructure components.
        </p>
      </div>

      {/* Architecture Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/backend/architecture"
          className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Backend Architecture
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            API services, data layer, and infrastructure
          </p>
        </Link>
        <Link
          href="/frontend/web-app"
          className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Frontend Architecture
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Web app, admin panel, and client libraries
          </p>
        </Link>
        <Link
          href="/backend/websocket"
          className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            WebSocket Protocol
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Real-time communication protocol specification
          </p>
        </Link>
        <Link
          href="/backend/data-model"
          className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Data Model
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Database schema and data relationships
          </p>
        </Link>
      </div>

      {/* Architecture Content */}
      {architectureDoc ? (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
          <MarkdownRenderer content={architectureDoc.content} />
        </div>
      ) : (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
            Architecture Overview
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300">
            VoiceAssist is built as a modern, scalable medical AI assistant
            platform with the following key components:
          </p>
          <ul className="mt-4 space-y-2 text-yellow-700 dark:text-yellow-300">
            <li>
              • React-based web application with voice and text interfaces
            </li>
            <li>
              • FastAPI backend with WebSocket support for real-time
              interactions
            </li>
            <li>• PostgreSQL database with vector search capabilities</li>
            <li>• Integration with OpenAI GPT-4 and Realtime API</li>
            <li>• Knowledge base system for medical literature</li>
          </ul>
        </div>
      )}
    </div>
  );
}
