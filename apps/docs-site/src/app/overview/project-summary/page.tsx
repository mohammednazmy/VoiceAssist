import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Project Summary",
  description: "VoiceAssist project overview, goals, and current status",
};

export default function ProjectSummaryPage() {
  const projectSummary =
    loadDoc("PROJECT_SUMMARY.md") || loadDoc("OVERVIEW.md");
  const implementationSummary = loadDoc(
    "ADMIN_PANEL_IMPLEMENTATION_SUMMARY.md",
  );
  const changelog = loadDoc("FINAL_DOCUMENTATION_SUMMARY.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Project Summary
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          VoiceAssist is an AI-powered medical assistant platform providing
          voice and text interfaces for clinical knowledge queries.
        </p>
      </div>

      {/* Project Goals */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-4">
          Project Goals
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul className="text-blue-700 dark:text-blue-300 space-y-2">
            <li>• Real-time voice interaction with medical AI</li>
            <li>• Knowledge base with semantic search</li>
            <li>• Citation and source attribution</li>
          </ul>
          <ul className="text-blue-700 dark:text-blue-300 space-y-2">
            <li>• Multi-language support (English, Arabic)</li>
            <li>• Admin panel for content management</li>
            <li>• Low-latency response times (&lt;200ms)</li>
          </ul>
        </div>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="text-2xl mb-2">✅</div>
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-1">
            Completed
          </h3>
          <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
            <li>• Voice mode implementation</li>
            <li>• Knowledge base search</li>
            <li>• Admin panel MVP</li>
            <li>• Authentication system</li>
          </ul>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="text-2xl mb-2">🔄</div>
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
            In Progress
          </h3>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li>• Voice quality improvements</li>
            <li>• Mobile app development</li>
            <li>• Enhanced personalization</li>
          </ul>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="text-2xl mb-2">📋</div>
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-1">
            Planned
          </h3>
          <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
            <li>• Multimodal content support</li>
            <li>• Advanced analytics</li>
            <li>• API rate limiting</li>
          </ul>
        </div>
      </div>

      {/* Technology Stack */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Technology Stack
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl mb-1">⚛️</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              React
            </div>
            <div className="text-xs text-slate-500">Frontend</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">🐍</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              FastAPI
            </div>
            <div className="text-xs text-slate-500">Backend</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">🤖</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              OpenAI
            </div>
            <div className="text-xs text-slate-500">AI/Voice</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">🗄️</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              SQLite
            </div>
            <div className="text-xs text-slate-500">Database</div>
          </div>
        </div>
      </div>

      {/* Related Links */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/architecture"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Architecture →
        </Link>
        <Link
          href="/operations/development"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Getting Started →
        </Link>
        <Link
          href="/reference/all-docs"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          All Documentation →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {projectSummary && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={projectSummary.content} />
          </div>
        )}

        {implementationSummary && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Implementation Summary
            </h2>
            <MarkdownRenderer content={implementationSummary.content} />
          </div>
        )}

        {changelog && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Recent Changes
            </h2>
            <MarkdownRenderer content={changelog.content} />
          </div>
        )}
      </div>
    </div>
  );
}
