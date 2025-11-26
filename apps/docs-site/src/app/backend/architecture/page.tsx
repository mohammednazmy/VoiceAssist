import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Backend Architecture",
  description: "VoiceAssist backend architecture and API documentation",
};

export default function BackendArchitecturePage() {
  const backendArch = loadDoc("BACKEND_ARCHITECTURE.md");
  const technicalArch = loadClientImplDoc("TECHNICAL_ARCHITECTURE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Backend Architecture
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          The VoiceAssist backend is built with FastAPI and provides REST APIs,
          WebSocket connections, and integrations with OpenAI services.
        </p>
      </div>

      {/* Technology Stack */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-2xl mb-2">🐍</div>
          <div className="font-medium text-gray-900 dark:text-white">
            Python
          </div>
          <div className="text-xs text-gray-500">3.11+</div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-2xl mb-2">⚡</div>
          <div className="font-medium text-gray-900 dark:text-white">
            FastAPI
          </div>
          <div className="text-xs text-gray-500">Async REST</div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-2xl mb-2">🐘</div>
          <div className="font-medium text-gray-900 dark:text-white">
            PostgreSQL
          </div>
          <div className="text-xs text-gray-500">Database</div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <div className="text-2xl mb-2">🔴</div>
          <div className="font-medium text-gray-900 dark:text-white">Redis</div>
          <div className="text-xs text-gray-500">Caching</div>
        </div>
      </div>

      {/* Related Documentation */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/backend/websocket"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          WebSocket Protocol →
        </Link>
        <Link
          href="/backend/data-model"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Data Model →
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
        {backendArch && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={backendArch.content} />
          </div>
        )}

        {technicalArch && !backendArch && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={technicalArch.content} />
          </div>
        )}

        {!backendArch && !technicalArch && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Backend Services
            </h2>
            <ul className="space-y-3 text-gray-600 dark:text-gray-400">
              <li>
                • <strong>API Gateway:</strong> FastAPI-based REST endpoints
              </li>
              <li>
                • <strong>Chat Service:</strong> Conversation management and AI
                interactions
              </li>
              <li>
                • <strong>Voice Service:</strong> WebSocket proxy for OpenAI
                Realtime API
              </li>
              <li>
                • <strong>Knowledge Base:</strong> Vector search and document
                retrieval
              </li>
              <li>
                • <strong>Auth Service:</strong> JWT authentication and OAuth
                integration
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
