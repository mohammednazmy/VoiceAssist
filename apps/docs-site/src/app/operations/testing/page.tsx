import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Testing",
  description: "VoiceAssist testing guide for unit, integration, and E2E tests",
};

export default function TestingPage() {
  const testingGuide = loadDoc("TESTING_GUIDE.md");
  const e2eTests = loadClientImplDoc("E2E_TESTING.md");
  const testingResults = loadDoc("TESTING_RESULTS_2025-11-22.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Testing Guide
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Comprehensive testing strategies including unit tests, integration
          tests, and end-to-end testing with Playwright.
        </p>
      </div>

      {/* Test Types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Unit Tests
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
            Component and function-level testing with Vitest
          </p>
          <code className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
            pnpm test
          </code>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Integration
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-2">
            API and service integration testing
          </p>
          <code className="text-xs bg-green-100 dark:bg-green-900 px-2 py-1 rounded">
            pytest tests/
          </code>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
            E2E Tests
          </h3>
          <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
            Full user flow testing with Playwright
          </p>
          <code className="text-xs bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded">
            pnpm test:e2e
          </code>
        </div>
      </div>

      {/* Test Coverage Areas */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Test Coverage Areas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Frontend
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1">
              <li>• React component rendering</li>
              <li>• Hook behavior (useAuth, useChat)</li>
              <li>• State management</li>
              <li>• User interactions</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
              Backend
            </h4>
            <ul className="text-slate-600 dark:text-slate-400 space-y-1">
              <li>• API endpoint responses</li>
              <li>• Authentication flows</li>
              <li>• Knowledge base queries</li>
              <li>• WebSocket connections</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Related Links */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/operations/development"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Development Setup →
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
        {testingGuide && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={testingGuide.content} />
          </div>
        )}

        {e2eTests && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              E2E Testing Guide
            </h2>
            <MarkdownRenderer content={e2eTests.content} />
          </div>
        )}

        {testingResults && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Latest Test Results
            </h2>
            <MarkdownRenderer content={testingResults.content} />
          </div>
        )}

        {!testingGuide && !e2eTests && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Running Tests
            </h2>
            <div className="space-y-4 text-gray-600 dark:text-gray-400">
              <div>
                <h3 className="font-medium mb-2">Frontend Tests (Vitest)</h3>
                <code className="block bg-gray-200 dark:bg-gray-700 p-2 rounded">
                  cd apps/web-app && pnpm test
                </code>
              </div>
              <div>
                <h3 className="font-medium mb-2">Backend Tests (Pytest)</h3>
                <code className="block bg-gray-200 dark:bg-gray-700 p-2 rounded">
                  cd backend && pytest tests/ -v
                </code>
              </div>
              <div>
                <h3 className="font-medium mb-2">E2E Tests (Playwright)</h3>
                <code className="block bg-gray-200 dark:bg-gray-700 p-2 rounded">
                  pnpm test:e2e
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
