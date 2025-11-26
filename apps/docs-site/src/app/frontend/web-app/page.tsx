import { Metadata } from "next";
import { loadClientImplDoc, loadDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Web App",
  description:
    "VoiceAssist web application documentation and feature specifications",
};

export default function WebAppPage() {
  const webAppSpec =
    loadClientImplDoc("WEB_APP_FEATURE_SPECS.md") ||
    loadDoc("WEB_APP_SPECS.md");
  const phase3Plan = loadClientImplDoc("FRONTEND_PHASE3_PLAN.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Web Application
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          The VoiceAssist web application provides a modern, responsive
          interface for interacting with the medical AI assistant through text
          and voice.
        </p>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Chat Interface
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Markdown rendering, citations, code blocks, and message management
          </p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Voice Mode
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            Real-time voice interaction with OpenAI Realtime API
          </p>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
            Clinical Context
          </h3>
          <p className="text-sm text-purple-700 dark:text-purple-300">
            Patient context panels for medical consultations
          </p>
        </div>
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
            Citations
          </h3>
          <p className="text-sm text-orange-700 dark:text-orange-300">
            Source attribution and evidence display
          </p>
        </div>
      </div>

      {/* Related Pages */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/frontend/voice"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Voice Mode Details →
        </Link>
        <Link
          href="/operations/testing"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Testing Guide →
        </Link>
      </div>

      {/* Main Content */}
      <div className="space-y-12">
        {webAppSpec && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Feature Specifications
            </h2>
            <MarkdownRenderer content={webAppSpec.content} />
          </div>
        )}

        {phase3Plan && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Phase 3 Implementation Plan
            </h2>
            <MarkdownRenderer content={phase3Plan.content} />
          </div>
        )}

        {!webAppSpec && !phase3Plan && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Web App Overview
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The web application is built with React, TypeScript, and Tailwind
              CSS. It provides both text and voice interfaces for medical AI
              interactions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
