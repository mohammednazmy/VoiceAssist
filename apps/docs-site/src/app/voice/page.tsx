import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Voice Mode Documentation",
  description:
    "VoiceAssist Voice Mode documentation hub - architecture, pipeline, and implementation details",
};

export default function VoicePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Voice Mode Documentation
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Technical documentation for VoiceAssist&apos;s voice-first interface,
          including the Thinker/Talker pipeline, STT/TTS providers, and latency
          optimization.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/voice/architecture"
          className="block p-6 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Voice Mode Architecture
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Comprehensive technical reference covering the end-to-end pipeline,
            STT/LLM/TTS stack, streaming behavior, and latency targets.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-500 space-y-1">
            <li>• Thinker/Talker Pipeline</li>
            <li>• Deepgram STT & ElevenLabs TTS</li>
            <li>• VAD and Barge-in Support</li>
            <li>• Medical Intelligence Integration</li>
          </ul>
        </Link>

        <Link
          href="/user-guide/voice"
          className="block p-6 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Voice Mode User Guide
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            User-focused documentation for voice mode settings, features, and
            best practices.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-500 space-y-1">
            <li>• Voice Settings & Preferences</li>
            <li>• Push-to-Talk vs Always-On</li>
            <li>• Voice Commands</li>
            <li>• Troubleshooting</li>
          </ul>
        </Link>

        <Link
          href="/operations/debugging-voice"
          className="block p-6 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Voice Debugging
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Troubleshooting guide for WebSocket, STT, and TTS issues.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-500 space-y-1">
            <li>• WebSocket Connection Issues</li>
            <li>• Audio Quality Problems</li>
            <li>• Latency Diagnosis</li>
            <li>• Provider Fallback Testing</li>
          </ul>
        </Link>

        <Link
          href="/backend/websocket"
          className="block p-6 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            WebSocket Protocol
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Real-time communication protocol specification for voice
            interactions.
          </p>
          <ul className="text-sm text-gray-500 dark:text-gray-500 space-y-1">
            <li>• Connection Handshake</li>
            <li>• Message Types</li>
            <li>• Streaming Lifecycle</li>
            <li>• Error Handling</li>
          </ul>
        </Link>
      </div>
    </div>
  );
}
