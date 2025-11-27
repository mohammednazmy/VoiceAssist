import { Metadata } from "next";
import { loadDoc } from "@/lib/docs";
import { loadMdxContent } from "@/lib/mdx";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Deployment",
  description:
    "VoiceAssist deployment guide for production and staging environments",
};

export default async function DeploymentPage() {
  const deploymentGuide = await loadMdxContent("operations/deployment.mdx");
  const adminDeployment = loadDoc("ADMIN_PANEL_DEPLOYMENT.md");
  const infraDoc = loadDoc("infra/INFRASTRUCTURE.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Deployment Guide
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Instructions for deploying VoiceAssist to production and staging
          environments, including server configuration and service management.
        </p>
      </div>

      {/* Deployment Targets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Production
          </h3>
          <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
            <li>• quran.asimo.io - Voice Mode Web App</li>
            <li>• kb.asimo.io - Admin Control Panel</li>
            <li>• docs.asimo.io - Documentation Hub</li>
          </ul>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Services
          </h3>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li>• quran-rtc.service - FastAPI backend</li>
            <li>• quran-ingest.service - KB ingestion</li>
            <li>• Apache2 - Reverse proxy</li>
          </ul>
        </div>
      </div>

      {/* Quick Commands */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Quick Commands
        </h3>
        <div className="space-y-2 font-mono text-sm">
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <code className="text-slate-700 dark:text-slate-300">
              sudo systemctl status quran-rtc
            </code>
          </div>
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <code className="text-slate-700 dark:text-slate-300">
              sudo systemctl restart quran-rtc
            </code>
          </div>
          <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <code className="text-slate-700 dark:text-slate-300">
              sudo journalctl -u quran-rtc -f
            </code>
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
          href="/operations/testing"
          className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Testing Guide →
        </Link>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {deploymentGuide && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <article className="prose prose-slate max-w-none dark:prose-invert">
              {deploymentGuide.content}
            </article>
          </div>
        )}

        {adminDeployment && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Admin Panel Deployment
            </h2>
            <MarkdownRenderer content={adminDeployment.content} />
          </div>
        )}

        {infraDoc && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Infrastructure
            </h2>
            <MarkdownRenderer content={infraDoc.content} />
          </div>
        )}
      </div>
    </div>
  );
}
