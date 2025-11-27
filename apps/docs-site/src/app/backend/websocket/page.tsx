import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { loadMdxContent } from "@/lib/mdx";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export const metadata: Metadata = {
  title: "WebSocket Protocol",
  description:
    "VoiceAssist WebSocket protocol specification for real-time communication",
};

export default async function WebSocketPage() {
  const websocketDoc = await loadMdxContent("backend/websocket-protocol.mdx");
  const legacySpec = loadDoc("WEBSOCKET_PROTOCOL.md");
  const realtimeSpec = loadClientImplDoc("REALTIME_PROXY_SPEC.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          WebSocket Protocol
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Real-time communication protocol for voice interactions and live
          updates using WebSocket connections.
        </p>
      </div>

      {/* Protocol Overview */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Protocol Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Voice Streaming
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Bidirectional audio streaming</li>
              <li>• Speech-to-text with partial results</li>
              <li>• Text-to-speech synthesis</li>
              <li>• Voice activity detection</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Message Types
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Session management</li>
              <li>• Audio input/output</li>
              <li>• Transcription events</li>
              <li>• Response streaming</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {websocketDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <article className="prose prose-slate max-w-none dark:prose-invert">
              {websocketDoc.content}
            </article>
          </div>
        )}

        {!websocketDoc && legacySpec && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={legacySpec.content} />
          </div>
        )}

        {realtimeSpec && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Realtime Proxy Specification
            </h2>
            <MarkdownRenderer content={realtimeSpec.content} />
          </div>
        )}
      </div>
    </div>
  );
}
