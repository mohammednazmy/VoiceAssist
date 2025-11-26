import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API Reference",
  description: "VoiceAssist REST API and WebSocket API reference documentation",
};

export default function ApiReferencePage() {
  const apiDoc = loadDoc("API_REFERENCE.md") || loadDoc("API.md");
  const endpointsDoc = loadDoc("ENDPOINTS.md");
  const kbFunctions = loadDoc("KB_FUNCTIONS_REFERENCE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          API Reference
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Complete reference for REST API endpoints, WebSocket events, and
          knowledge base function calls.
        </p>
      </div>

      {/* API Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            REST API
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
            HTTP endpoints for chat, auth, and knowledge base operations
          </p>
          <code className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
            https://api.example.com/v1/
          </code>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            WebSocket API
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-2">
            Real-time voice streaming and chat updates
          </p>
          <code className="text-xs bg-green-100 dark:bg-green-900 px-2 py-1 rounded">
            wss://api.example.com/ws/voice
          </code>
        </div>
      </div>

      {/* Endpoint Categories */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Endpoint Categories
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Authentication
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1 font-mono text-xs">
              <li>POST /auth/login</li>
              <li>POST /auth/register</li>
              <li>POST /auth/refresh</li>
              <li>GET /auth/oauth/{"{provider}"}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Chat
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1 font-mono text-xs">
              <li>POST /chat/message</li>
              <li>GET /chat/conversations</li>
              <li>GET /chat/history/{"{id}"}</li>
              <li>DELETE /chat/{"{id}"}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Knowledge Base
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1 font-mono text-xs">
              <li>POST /kb/search</li>
              <li>GET /kb/documents</li>
              <li>GET /kb/pages/{"{id}"}</li>
              <li>POST /kb/ingest</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Admin
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1 font-mono text-xs">
              <li>GET /admin/stats</li>
              <li>GET /admin/users</li>
              <li>POST /admin/config</li>
              <li>GET /admin/logs</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Related Links */}
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
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {apiDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={apiDoc.content} />
          </div>
        )}

        {endpointsDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Endpoints Reference
            </h2>
            <MarkdownRenderer content={endpointsDoc.content} />
          </div>
        )}

        {kbFunctions && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              KB Function Reference
            </h2>
            <MarkdownRenderer content={kbFunctions.content} />
          </div>
        )}
      </div>
    </div>
  );
}
