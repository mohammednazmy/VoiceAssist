import { Metadata } from "next";
import { loadDoc, loadClientImplDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export const metadata: Metadata = {
  title: "Admin Panel",
  description: "VoiceAssist admin panel documentation and configuration guide",
};

export default function AdminPanelPage() {
  const adminSpec =
    loadClientImplDoc("ADMIN_PANEL_FEATURE_SPECS.md") ||
    loadDoc("ADMIN_PANEL_SPECS.md");
  const adminSummary = loadDoc("ADMIN_PANEL_IMPLEMENTATION_SUMMARY.md");
  const adminDeployment = loadDoc("ADMIN_PANEL_DEPLOYMENT.md");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Admin Panel
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Administrative interface for managing the VoiceAssist platform,
          including knowledge base management, model configuration, and system
          monitoring.
        </p>
      </div>

      {/* Admin Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <h3 className="font-semibold text-indigo-800 dark:text-indigo-200 mb-2">
            Knowledge Base
          </h3>
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            Upload and manage medical textbooks, journals, and guidelines
          </p>
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Model Configuration
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Configure AI models, prompts, and response settings
          </p>
        </div>
        <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
          <h3 className="font-semibold text-cyan-800 dark:text-cyan-200 mb-2">
            User Management
          </h3>
          <p className="text-sm text-cyan-700 dark:text-cyan-300">
            Manage users, roles, and access permissions
          </p>
        </div>
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg">
          <h3 className="font-semibold text-rose-800 dark:text-rose-200 mb-2">
            Analytics
          </h3>
          <p className="text-sm text-rose-700 dark:text-rose-300">
            Usage metrics, performance monitoring, and reporting
          </p>
        </div>
      </div>

      {/* Admin URL */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-8">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Admin Panel URL:</strong>{" "}
          <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
            https://kb.localhost
          </code>
        </p>
      </div>

      {/* Documentation Content */}
      <div className="space-y-12">
        {adminSpec && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Feature Specifications
            </h2>
            <MarkdownRenderer content={adminSpec.content} />
          </div>
        )}

        {adminSummary && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Implementation Summary
            </h2>
            <MarkdownRenderer content={adminSummary.content} />
          </div>
        )}

        {adminDeployment && (
          <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Deployment Guide
            </h2>
            <MarkdownRenderer content={adminDeployment.content} />
          </div>
        )}
      </div>
    </div>
  );
}
