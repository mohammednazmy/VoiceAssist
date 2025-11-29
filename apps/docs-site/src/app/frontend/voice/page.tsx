import { Metadata } from "next";
import { loadDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Voice Mode",
  description:
    "VoiceAssist voice mode implementation and real-time audio pipeline",
};

export default function VoiceModePage() {
  const voicePipeline = loadDoc("VOICE_MODE_PIPELINE.md");
  const voiceSettings = loadDoc("VOICE_MODE_SETTINGS_GUIDE.md");
  const voiceReady = loadDoc("VOICE_STATE_2025-11-28.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Voice Mode
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Real-time voice interaction powered by OpenAI&apos;s Realtime API with
          bidirectional audio streaming and speech-to-text capabilities.
        </p>
      </div>

      {/* Voice Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="text-2xl mb-2">🎙️</div>
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-1">
            Speech Input
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            Real-time speech recognition with partial transcript preview
          </p>
        </div>
        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="text-2xl mb-2">🔊</div>
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
            Voice Output
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Natural voice synthesis with multiple voice options
          </p>
        </div>
        <div className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="text-2xl mb-2">⚡</div>
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-1">
            Low Latency
          </h3>
          <p className="text-sm text-purple-700 dark:text-purple-300">
            Optimized for minimal latency in voice interactions
          </p>
        </div>
      </div>

      {/* Implementation Status */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
          ✅ Implementation Status
        </h3>
        <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
          <li>• Voice metrics dashboard with latency indicators</li>
          <li>• Microphone permission handling UX</li>
          <li>• Keyboard shortcuts (Ctrl+Shift+V, Space for push-to-talk)</li>
          <li>• Responsive voice panel layout</li>
          <li>• Real-time transcript preview during speech</li>
        </ul>
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
          href="/frontend/web-app"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Web App →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {voicePipeline && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Voice Pipeline Architecture
            </h2>
            <MarkdownRenderer content={voicePipeline.content} />
          </div>
        )}

        {voiceSettings && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Voice Settings Guide
            </h2>
            <MarkdownRenderer content={voiceSettings.content} />
          </div>
        )}

        {voiceReady && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Voice Mode Status
            </h2>
            <MarkdownRenderer content={voiceReady.content} />
          </div>
        )}
      </div>
    </div>
  );
}
