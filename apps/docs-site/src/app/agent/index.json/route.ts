/**
 * Agent Index API
 *
 * Provides a structured index of all documentation for AI agents.
 * Returns metadata about the documentation system and available endpoints.
 *
 * GET /agent/index.json
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const index = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    description: "VoiceAssist Documentation API for AI Agents",
    project: {
      name: "VoiceAssist",
      description:
        "Enterprise-grade, HIPAA-compliant medical AI assistant platform",
      repository: "https://github.com/mohammednazmy/VoiceAssist",
    },
    endpoints: {
      index: {
        url: "/agent/index.json",
        description: "This index - documentation system metadata",
      },
      docs: {
        url: "/agent/docs.json",
        description: "Full document list with metadata",
      },
      search: {
        url: "/agent/search",
        description: "Search documentation (query param: q)",
        example: "/agent/search?q=authentication",
      },
      sitemap: {
        url: "/sitemap.xml",
        description: "XML sitemap for all documentation pages",
      },
    },
    documentation: {
      architecture: {
        slug: "architecture/unified",
        description: "System architecture overview",
      },
      api_reference: {
        slug: "api-reference/rest-api",
        description: "REST API documentation",
      },
      agent_onboarding: {
        slug: "ai/agent-onboarding",
        description: "Quick start guide for AI agents",
      },
      implementation_status: {
        slug: "overview/implementation-status",
        description: "Component status and roadmap",
      },
    },
    metadata_schema: {
      required_fields: ["title", "slug", "status", "lastUpdated"],
      status_values: ["draft", "experimental", "stable", "deprecated"],
      stability_values: ["production", "beta", "experimental", "legacy"],
      audience_values: [
        "human",
        "agent",
        "backend",
        "frontend",
        "devops",
        "admin",
        "user",
      ],
    },
    tips: [
      "Use /agent/docs.json to get all documents with metadata",
      "Filter by audience=['agent'] for AI-specific documentation",
      "Check status='stable' for production-ready docs",
      "The 'summary' field provides a one-line description",
    ],
  };

  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
