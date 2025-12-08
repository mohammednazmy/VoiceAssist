/**
 * Navigation configuration for the documentation site.
 *
 * docPaths can use these prefixes to load documents from different locations:
 * - No prefix: Relative to docs/ directory (e.g., "START_HERE.md" → docs/START_HERE.md)
 * - @root/: Relative to project root (e.g., "@root/packages/ui/README.md" → packages/ui/README.md)
 *
 * Examples:
 *   docPaths: [
 *     "UNIFIED_ARCHITECTURE.md",              // → docs/UNIFIED_ARCHITECTURE.md
 *     "api-reference/rest-api.md",            // → docs/api-reference/rest-api.md
 *     "@root/services/api-gateway/README.md", // → services/api-gateway/README.md
 *     "@root/packages/ui/README.md",          // → packages/ui/README.md
 *   ]
 *
 * See docs.ts for the loadDocWithPrefix() implementation.
 */

export interface NavItem {
  title: string;
  href: string;
  description?: string;
  docPaths?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: "Start Here",
    items: [
      {
        title: "Welcome",
        href: "/",
        description: "Overview of VoiceAssist and quick navigation",
        docPaths: ["START_HERE.md"],
      },
      {
        title: "For Developers",
        href: "/start/developers",
        description: "Developer setup, architecture, and contribution guide",
        docPaths: ["start/developers.md"],
      },
      {
        title: "For Users",
        href: "/start/users",
        description: "Voice mode, text chat, and key features",
        docPaths: ["start/users.md"],
      },
      {
        title: "For Admins",
        href: "/start/admins",
        description: "Deployment, configuration, and monitoring",
        docPaths: ["start/admins.md"],
      },
      {
        title: "For AI Agents",
        href: "/start/ai-agents",
        description: "Quick reference for AI coding assistants",
        docPaths: ["admin-guide/for-ai-agents.md"],
      },
    ],
  },
  {
    title: "Getting Started",
    items: [
      {
        title: "Quick Start",
        href: "/getting-started/quick-start",
        description: "Five minute overview to get hands-on",
        docPaths: ["START_HERE.md"],
      },
      {
        title: "Installation",
        href: "/getting-started/installation",
        description: "Environment and deployment prerequisites",
        docPaths: ["INFRASTRUCTURE_SETUP.md"],
      },
      {
        title: "Configuration",
        href: "/getting-started/configuration",
        description: "Platform and environment configuration",
        docPaths: ["CONFIGURATION_REFERENCE.md"],
      },
    ],
  },
  {
    title: "User Guide",
    items: [
      {
        title: "Voice Mode",
        href: "/user-guide/voice",
        description: "Voice pipeline, settings, and readiness",
        docPaths: [
          "THINKER_TALKER_PIPELINE.md",
          "VOICE_MODE_PIPELINE.md",
          "VOICE_MODE_SETTINGS_GUIDE.md",
          "services/thinker-service.md",
          "services/talker-service.md",
          "api-reference/voice-pipeline-ws.md",
          "frontend/thinker-talker-hooks.md",
        ],
      },
      {
        title: "Text Mode",
        href: "/user-guide/text",
        description: "Chat interface and text-first workflows",
        docPaths: ["USER_GUIDE.md"],
      },
      {
        title: "Files",
        href: "/user-guide/files",
        description: "Working with files and Nextcloud integration",
        docPaths: ["NEXTCLOUD_INTEGRATION.md", "TOOLS_AND_INTEGRATIONS.md"],
      },
      {
        title: "Calendar & Email",
        href: "/user-guide/integrations",
        description: "Productivity tools and assistant commands",
        docPaths: ["TOOLS_AND_INTEGRATIONS.md"],
      },
      {
        title: "Web Search",
        href: "/user-guide/web-search",
        description: "Search workflows and citation handling",
        docPaths: ["SEMANTIC_SEARCH_DESIGN.md", "TOOLS_AND_INTEGRATIONS.md"],
      },
      {
        title: "Conversations",
        href: "/user-guide/conversations",
        description: "Managing history, exports, and controls",
        docPaths: ["USER_GUIDE.md", "MESSAGE_EDIT_PROGRESS.md"],
      },
      {
        title: "Tips & Tricks",
        href: "/user-guide/tips",
        description: "Best practices for high-quality answers",
        docPaths: ["USER_GUIDE.md"],
      },
    ],
  },
  {
    title: "Medical",
    items: [
      {
        title: "Overview",
        href: "/medical/overview",
        description: "Clinical capabilities and privacy controls",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "Medical Textbooks",
        href: "/medical/textbooks",
        description: "Textbook ingestion and citation workflows",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "Medical Journals",
        href: "/medical/journals",
        description: "Literature coverage and PubMed retrieval",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "Clinical Guidelines",
        href: "/medical/guidelines",
        description: "Guideline sources and update cadence",
        docPaths: ["SEMANTIC_SEARCH_DESIGN.md", "MEDICAL_FEATURES.md"],
      },
      {
        title: "OpenEvidence",
        href: "/medical/openevidence",
        description: "Evidence synthesis integration",
        docPaths: ["SEMANTIC_SEARCH_DESIGN.md"],
      },
      {
        title: "Medical Calculators",
        href: "/medical/calculators",
        description: "Built-in calculators and usage guidance",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "Use Cases",
        href: "/medical/use-cases",
        description: "Clinical scenarios and workflows",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "Privacy & HIPAA",
        href: "/medical/privacy",
        description: "Compliance and PHI handling",
        docPaths: ["HIPAA_COMPLIANCE_MATRIX.md", "SECURITY_COMPLIANCE.md"],
      },
    ],
  },
  {
    title: "Admin Guide",
    items: [
      {
        title: "Admin Panel Overview",
        href: "/admin/overview",
        description: "Console layout and major metrics",
        docPaths: ["ADMIN_PANEL_SPECS.md"],
      },
      {
        title: "Integration Guide",
        href: "/admin/integration",
        description:
          "Cross-app navigation, real-time events, and voice monitoring",
        docPaths: ["admin/ADMIN_PANEL_INTEGRATION_GUIDE.md"],
      },
      {
        title: "Real-Time Events",
        href: "/admin/realtime-events",
        description: "WebSocket events and Redis pub/sub",
        docPaths: ["admin/REALTIME_EVENTS_GUIDE.md"],
      },
      {
        title: "System Configuration",
        href: "/admin/system",
        description: "Environment variables and platform settings",
        docPaths: ["CONFIGURATION_REFERENCE.md", "ADMIN_PANEL_SPECS.md"],
      },
      {
        title: "AI Models",
        href: "/admin/models",
        description: "Model routing and optimization",
        docPaths: ["ORCHESTRATION_DESIGN.md"],
      },
      {
        title: "Knowledge Base",
        href: "/admin/knowledge-base",
        description: "Uploading and indexing clinical sources",
        docPaths: ["ADMIN_PANEL_SPECS.md", "NEXTCLOUD_INTEGRATION.md"],
      },
      {
        title: "Integrations",
        href: "/admin/integrations",
        description: "Nextcloud, calendar, email, and APIs",
        docPaths: ["NEXTCLOUD_INTEGRATION.md", "TOOLS_AND_INTEGRATIONS.md"],
      },
      {
        title: "User Management",
        href: "/admin/users",
        description: "Roles, access, and session controls",
        docPaths: ["ADMIN_PANEL_SPECS.md"],
      },
      {
        title: "Analytics",
        href: "/admin/analytics",
        description: "Metrics, cost tracking, and usage",
        docPaths: ["ADMIN_PANEL_SPECS.md"],
      },
      {
        title: "Security",
        href: "/admin/security",
        description: "Access control and audit logging",
        docPaths: ["SECURITY_COMPLIANCE.md"],
      },
      {
        title: "Backups",
        href: "/admin/backups",
        description: "Backup cadence and restoration plans",
        docPaths: ["DISASTER_RECOVERY_RUNBOOK.md"],
      },
      {
        title: "Troubleshooting",
        href: "/admin/troubleshooting",
        description: "Operational debugging guidance",
        docPaths: [
          "ADMIN_PANEL_DEPLOYMENT.md",
          "PRODUCTION_DEPLOYMENT_RUNBOOK.md",
        ],
      },
      {
        title: "Implementation Plan",
        href: "/admin/implementation-plan",
        description: "Comprehensive admin panel implementation roadmap",
        docPaths: ["admin/ADMIN_PANEL_IMPLEMENTATION_PLAN.md"],
      },
    ],
  },
  {
    title: "Development",
    items: [
      {
        title: "Architecture",
        href: "/dev/architecture",
        description: "System overview and component diagrams",
        docPaths: [
          "UNIFIED_ARCHITECTURE.md",
          "BACKEND_ARCHITECTURE.md",
          "FRONTEND_ARCHITECTURE.md",
          "REALTIME_ARCHITECTURE.md",
          "SECURITY_COMPLIANCE.md",
        ],
      },
      {
        title: "Contributing",
        href: "/dev/contributing",
        description: "Local setup and development flow",
        docPaths: ["DEVELOPMENT_SETUP.md"],
      },
      {
        title: "Extending VoiceAssist",
        href: "/dev/extending",
        description: "Adding tools and integrations",
        docPaths: ["TOOLS_AND_INTEGRATIONS.md"],
      },
      {
        title: "Documentation System",
        href: "/dev/docs-system",
        description: "Validation scripts and quality gates",
        docPaths: ["INTERNAL_DOCS_SYSTEM.md"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Debugging Index",
        href: "/operations/debugging",
        description: "Central hub for all troubleshooting documentation",
        docPaths: ["debugging/DEBUGGING_INDEX.md"],
      },
      {
        title: "Debugging Overview",
        href: "/operations/debugging-overview",
        description: "Where to look for issues and how to investigate",
        docPaths: ["debugging/DEBUGGING_OVERVIEW.md"],
      },
      {
        title: "Backend Debugging",
        href: "/operations/debugging-backend",
        description: "API Gateway, database, cache troubleshooting",
        docPaths: ["debugging/DEBUGGING_BACKEND.md"],
      },
      {
        title: "Frontend Debugging",
        href: "/operations/debugging-frontend",
        description: "Web app, React components, browser issues",
        docPaths: ["debugging/DEBUGGING_FRONTEND.md"],
      },
      {
        title: "Voice & Realtime",
        href: "/operations/debugging-voice",
        description: "WebSocket, STT, TTS troubleshooting",
        docPaths: ["debugging/DEBUGGING_VOICE_REALTIME.md"],
      },
      {
        title: "Docs Site Debugging",
        href: "/operations/debugging-docs",
        description: "Next.js, static export, Apache issues",
        docPaths: ["debugging/DEBUGGING_DOCS_SITE.md"],
      },
      {
        title: "Runbooks",
        href: "/operations/runbooks",
        description: "Step-by-step incident response procedures",
        docPaths: [
          "operations/OPERATIONS_OVERVIEW.md",
          "operations/runbooks/DEPLOYMENT.md",
          "operations/runbooks/INCIDENT_RESPONSE.md",
          "operations/runbooks/BACKUP_RESTORE.md",
          "operations/runbooks/SCALING.md",
          "operations/runbooks/MONITORING.md",
          "operations/runbooks/TROUBLESHOOTING.md",
          "operations/runbooks/DOCS_SITE_DEPLOYMENT_AND_TLS.md",
        ],
      },
    ],
  },
  {
    title: "For AI Agents",
    items: [
      {
        title: "Documentation Guide",
        href: "/ai/docs-guide",
        description: "How AI agents should navigate and use VoiceAssist docs",
        docPaths: ["admin-guide/for-ai-agents.md"],
      },
      {
        title: "Agent Onboarding",
        href: "/ai/onboarding",
        description: "Quick start guide for AI coding assistants",
        docPaths: ["ai/AGENT_ONBOARDING.md"],
      },
      {
        title: "Agent API Reference",
        href: "/ai/api",
        description: "Machine-readable JSON endpoints for agents",
        docPaths: ["ai/AGENT_API_REFERENCE.md"],
      },
      {
        title: "Implementation Status",
        href: "/ai/status",
        description: "Component status and what's implemented",
        docPaths: ["overview/IMPLEMENTATION_STATUS.md"],
      },
      {
        title: "Claude Execution Guide",
        href: "/ai/claude-guide",
        description: "Session startup, branching, and safety rules for Claude",
        docPaths: ["CLAUDE_EXECUTION_GUIDE.md"],
      },
      {
        title: "Claude Prompts",
        href: "/ai/claude-prompts",
        description: "Ready-to-use prompt templates for Claude sessions",
        docPaths: ["CLAUDE_PROMPTS.md"],
      },
      {
        title: "Agent Task Index",
        href: "/ai/task-index",
        description: "Common AI agent tasks and relevant documentation",
        docPaths: ["ai/AGENT_TASK_INDEX.md"],
      },
    ],
  },
  {
    title: "Voice",
    items: [
      {
        title: "Voice Documentation Hub",
        href: "/voice",
        description: "Voice Mode documentation overview and navigation",
        docPaths: ["VOICE_MODE_PIPELINE.md", "THINKER_TALKER_PIPELINE.md"],
      },
      {
        title: "Voice Mode Architecture",
        href: "/voice/architecture",
        description:
          "Comprehensive Voice Mode architecture: STT, LLM, TTS pipeline",
        docPaths: [
          "VOICE_MODE_PIPELINE.md",
          "THINKER_TALKER_PIPELINE.md",
          "services/thinker-service.md",
          "services/talker-service.md",
        ],
      },
      {
        title: "Natural Conversation Flow",
        href: "/voice/natural-conversation-flow",
        description:
          "Interrupted speech handling, hesitations, and barge-in detection",
        docPaths: [
          "voice/smart-conversational-voice-design.md",
          "VOICE_MODE_PIPELINE.md",
        ],
      },
      {
        title: "Silero VAD Integration",
        href: "/voice/silero-vad",
        description:
          "Neural network VAD for accurate speech detection and echo cancellation",
        docPaths: [
          "voice/adaptive-vad-presets.md",
          "voice/voice-configuration.md",
        ],
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "Voice Commands",
        href: "/reference/voice-commands",
        description: "Voice command catalogue",
        docPaths: ["VOICE_MODE_PIPELINE.md"],
      },
      {
        title: "Keyboard Shortcuts",
        href: "/reference/keyboard-shortcuts",
        description: "Power user navigation",
        docPaths: ["USER_GUIDE.md"],
      },
      {
        title: "Medical Sources",
        href: "/reference/sources",
        description: "Knowledge bases and update cycles",
        docPaths: ["MEDICAL_FEATURES.md"],
      },
      {
        title: "FAQ",
        href: "/reference/faq",
        description: "Common questions and answers",
        docPaths: ["USER_GUIDE.md"],
      },
      {
        title: "Glossary",
        href: "/reference/glossary",
        description: "Key terminology",
        docPaths: ["USER_GUIDE.md"],
      },
      {
        title: "Changelog",
        href: "/reference/changelog",
        description: "Release history",
        docPaths: ["FINAL_DOCUMENTATION_SUMMARY.md"],
      },
      {
        title: "API Reference",
        href: "/reference/api",
        description: "REST endpoints, gateway routing, and OpenAPI details",
        docPaths: [
          "API_REFERENCE.md",
          "api-reference/rest-api.md",
          "@root/services/api-gateway/README.md",
        ],
      },
      {
        title: "Packages",
        href: "/reference/packages",
        description: "Monorepo package READMEs and shared utilities",
        docPaths: [
          "@root/packages/api-client/README.md",
          "@root/packages/config/README.md",
          "@root/packages/design-tokens/README.md",
          "@root/packages/telemetry/README.md",
          "@root/packages/types/README.md",
          "@root/packages/ui/README.md",
          "@root/packages/utils/README.md",
        ],
      },
      {
        title: "Documentation Archive",
        href: "/reference/archive",
        description: "Historical documents preserved for context",
        docPaths: ["archive/README.md"],
      },
    ],
  },
];

export function getFlattenedNavigation(): NavItem[] {
  return navigation.flatMap((section) => section.items);
}

export function findNavItemByHref(href: string): NavItem | undefined {
  return getFlattenedNavigation().find((item) => item.href === href);
}
