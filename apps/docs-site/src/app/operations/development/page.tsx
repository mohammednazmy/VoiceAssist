import { Metadata } from "next";
import { loadDoc, loadDocWithPrefix } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Development",
  description: "VoiceAssist development setup and contribution guidelines",
};

export default function DevelopmentPage() {
  const devSetup = loadDoc("DEVELOPMENT_SETUP.md") || loadDoc("DEV_SETUP.md");
  const contributing = loadDocWithPrefix("@root/CONTRIBUTING.md");
  const startHere = loadDoc("START_HERE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Development Setup
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Get started with local development, including environment setup,
          dependencies, and development workflow.
        </p>
      </div>

      {/* Prerequisites */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-4">
          Prerequisites
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <ul className="text-amber-700 dark:text-amber-300 space-y-2">
            <li>• Node.js 18+ (LTS recommended)</li>
            <li>• pnpm 8+ (package manager)</li>
            <li>• Python 3.11+</li>
          </ul>
          <ul className="text-amber-700 dark:text-amber-300 space-y-2">
            <li>• Git</li>
            <li>• VS Code (recommended)</li>
            <li>• OpenAI API key</li>
          </ul>
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Quick Start
        </h3>
        <div className="space-y-3 font-mono text-sm">
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <span className="text-slate-500 dark:text-slate-400">
              # Clone the repository
            </span>
            <br />
            <code className="text-slate-700 dark:text-slate-300">
              git clone https://github.com/your-org/VoiceAssist.git
            </code>
          </div>
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <span className="text-slate-500 dark:text-slate-400">
              # Install dependencies
            </span>
            <br />
            <code className="text-slate-700 dark:text-slate-300">
              pnpm install
            </code>
          </div>
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <span className="text-slate-500 dark:text-slate-400">
              # Start development servers
            </span>
            <br />
            <code className="text-slate-700 dark:text-slate-300">pnpm dev</code>
          </div>
        </div>
      </div>

      {/* Project Structure */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Project Structure
        </h3>
        <div className="font-mono text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <div>VoiceAssist/</div>
          <div className="pl-4">├── apps/</div>
          <div className="pl-8">
            ├── web-app/ <span className="text-gray-500"># React frontend</span>
          </div>
          <div className="pl-8">
            └── docs-site/{" "}
            <span className="text-gray-500"># Documentation site</span>
          </div>
          <div className="pl-4">
            ├── backend/{" "}
            <span className="text-gray-500"># Python FastAPI backend</span>
          </div>
          <div className="pl-4">
            ├── docs/{" "}
            <span className="text-gray-500"># Markdown documentation</span>
          </div>
          <div className="pl-4">
            ├── packages/{" "}
            <span className="text-gray-500"># Shared packages</span>
          </div>
          <div className="pl-4">
            └── turbo.json{" "}
            <span className="text-gray-500"># Turborepo config</span>
          </div>
        </div>
      </div>

      {/* Related Links */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/operations/testing"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Testing Guide →
        </Link>
        <Link
          href="/operations/deployment"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Deployment →
        </Link>
        <Link
          href="/architecture"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Architecture →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {devSetup && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <MarkdownRenderer content={devSetup.content} />
          </div>
        )}

        {contributing && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Contributing Guidelines
            </h2>
            <MarkdownRenderer content={contributing.content} />
          </div>
        )}

        {startHere && !devSetup && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Getting Started
            </h2>
            <MarkdownRenderer content={startHere.content} />
          </div>
        )}
      </div>
    </div>
  );
}
