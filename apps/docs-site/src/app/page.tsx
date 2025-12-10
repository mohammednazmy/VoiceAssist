import Link from "next/link";
import { loadDoc } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export default function HomePage() {
  const startHereDoc = loadDoc("START_HERE.md");

  return (
    <div>
      {/* Hero Section */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          VoiceAssist Documentation
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Enterprise Medical AI Assistant - Comprehensive documentation for
          developers, administrators, and users.
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          <QuickLinkCard
            title="Getting Started"
            description="Learn the basics and get up and running quickly"
            href="/getting-started/quick-start"
            icon="🚀"
          />
          <QuickLinkCard
            title="Voice Mode"
            description="Understand the real-time voice pipeline"
            href="/user-guide/voice"
            icon="🎙️"
          />
          <QuickLinkCard
            title="Medical Features"
            description="See how the clinical knowledge base works"
            href="/medical/overview"
            icon="🩺"
          />
          <QuickLinkCard
            title="Admin Guide"
            description="Configure users, models, and integrations"
            href="/admin/overview"
            icon="🛠️"
          />
          <QuickLinkCard
            title="Configuration"
            description="Tune environment and platform settings"
            href="/getting-started/configuration"
            icon="⚙️"
          />
          <QuickLinkCard
            title="Reference"
            description="Commands, shortcuts, and glossary"
            href="/reference/voice-commands"
            icon="📖"
          />
        </div>
      </div>

      {/* Start Here Content */}
      {startHereDoc ? (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-8">
          <MarkdownRenderer content={startHereDoc.content} />
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Welcome to VoiceAssist
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This documentation site provides comprehensive guides for the
            VoiceAssist medical AI assistant platform.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/architecture"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              View Architecture →
            </Link>
            <Link
              href="/reference/all-docs"
              className="inline-flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Browse All Docs
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickLinkCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="group block p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all"
    >
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </Link>
  );
}
