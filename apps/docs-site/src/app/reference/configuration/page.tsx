import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";
import { gatewayBaseUrl } from "@/lib/apiClient";

export const metadata: Metadata = {
  title: "Configuration",
  description:
    "VoiceAssist configuration reference for environment variables and settings",
};

export default function ConfigurationPage() {
  const configDoc = loadDoc("CONFIGURATION.md") || loadDoc("CONFIG.md");
  const envDoc = loadDoc("ENV_VARIABLES.md");
  const settingsGuide = loadDoc("VOICE_MODE_SETTINGS_GUIDE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Configuration Reference
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Environment variables, application settings, and configuration options
          for all VoiceAssist components.
        </p>
      </div>

      {/* Config Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Backend (.env)
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• OPENAI_API_KEY</li>
            <li>• DATABASE_URL</li>
            <li>• REDIS_URL</li>
            <li>• JWT_SECRET</li>
          </ul>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Frontend (.env)
          </h3>
          <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
            <li>• VITE_API_URL</li>
            <li>• VITE_WS_URL</li>
            <li>• VITE_OAUTH_PROVIDERS</li>
            <li>• VITE_ENABLE_VOICE</li>
          </ul>
        </div>
      </div>

      <div className="mb-8 p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <h3 className="font-semibold text-indigo-800 dark:text-indigo-100 mb-2">
          Gateway Configuration
        </h3>
        <p className="text-sm text-indigo-700 dark:text-indigo-200">
          All applications now share the production gateway via <code className="px-1 py-0.5 rounded bg-white/70 dark:bg-indigo-800/60 text-xs">
            {gatewayBaseUrl}
          </code>{" "}
          by default. Override <code className="px-1 py-0.5 rounded bg-white/70 dark:bg-indigo-800/60 text-xs">VITE_API_URL</code> or
          <code className="px-1 py-0.5 rounded bg-white/70 dark:bg-indigo-800/60 text-xs">NEXT_PUBLIC_API_URL</code> to target a different environment.
        </p>
      </div>

      {/* Environment Setup */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Environment Setup
        </h3>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Backend Configuration
            </h4>
            <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded font-mono text-xs">
              <div className="text-slate-500"># Copy example and configure</div>
              <div className="text-slate-700 dark:text-slate-300">
                cp backend/.env.example backend/.env
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Frontend Configuration
            </h4>
            <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded font-mono text-xs">
              <div className="text-slate-500"># Copy example and configure</div>
              <div className="text-slate-700 dark:text-slate-300">
                cp apps/web-app/.env.example apps/web-app/.env
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Important Settings */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-4">
          Required Settings
        </h3>
        <div className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
          <p>
            <strong>OPENAI_API_KEY:</strong> Required for chat and voice
            features. Get yours at{" "}
            <a href="https://platform.openai.com" className="underline">
              platform.openai.com
            </a>
          </p>
          <p>
            <strong>JWT_SECRET:</strong> Required for authentication. Generate a
            secure random string.
          </p>
          <p>
            <strong>DATABASE_URL:</strong> SQLite path or PostgreSQL connection
            string.
          </p>
        </div>
      </div>

      {/* Related Links */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/operations/deployment"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Deployment Guide →
        </Link>
        <Link
          href="/operations/development"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Development Setup →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {configDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={configDoc.content} />
          </div>
        )}

        {envDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Environment Variables
            </h2>
            <MarkdownRenderer content={envDoc.content} />
          </div>
        )}

        {settingsGuide && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Voice Settings Guide
            </h2>
            <MarkdownRenderer content={settingsGuide.content} />
          </div>
        )}
      </div>
    </div>
  );
}
