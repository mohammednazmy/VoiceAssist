import { Metadata } from "next";
import { loadMdxContent } from "@/lib/mdx";

export const metadata: Metadata = {
  title: "Voice Mode Architecture",
  description:
    "Comprehensive documentation of VoiceAssist Voice Mode implementation, covering the end-to-end pipeline, STT/LLM/TTS stack, streaming behavior, multilingual support, and medical intelligence.",
};

export default async function VoiceArchitecturePage() {
  const voiceDoc = await loadMdxContent("voice/voice-mode-architecture.mdx");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Voice Mode Architecture
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Comprehensive technical reference for the VoiceAssist Voice Mode
          implementation, covering the Thinker/Talker pipeline, providers, and
          latency characteristics.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Voice Mode Stack
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              STT Provider
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Deepgram (Primary)</li>
              <li>• Whisper (Fallback)</li>
              <li>• 100-150ms latency</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              LLM Layer
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• GPT-4o (Cloud)</li>
              <li>• Llama (Local/PHI)</li>
              <li>• Streaming tokens</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              TTS Provider
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• ElevenLabs (Primary)</li>
              <li>• OpenAI TTS (Fallback)</li>
              <li>• 28+ languages</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Latency Target
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• &lt;500ms end-to-end</li>
              <li>• Streaming at all stages</li>
              <li>• Barge-in support</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {voiceDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <article className="prose prose-slate max-w-none dark:prose-invert">
              {voiceDoc.content}
            </article>
          </div>
        )}

        {!voiceDoc && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Voice Mode documentation is loading...</p>
            <p className="text-sm mt-2">
              If this persists, check that voice-mode-architecture.mdx exists in
              src/content/voice/
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
