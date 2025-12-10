import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Agent API Reference",
  description: "Machine-readable JSON API endpoints for AI agents",
};

export default function AgentAPIPage() {
  return (
    <DocPage
      title="Agent API Reference"
      description="Machine-readable JSON endpoints for AI agents to discover and search documentation"
      docPaths={["ai/AGENT_API_REFERENCE.md"]}
    />
  );
}
