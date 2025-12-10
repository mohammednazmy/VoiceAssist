import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Knowledge Base Management",
  description:
    "Knowledge base architecture, semantic search, and content management for VoiceAssist",
};

export default function KnowledgeBasePage() {
  return (
    <DocPage
      title="Knowledge Base Management"
      description="Knowledge base architecture, semantic search, and content management for VoiceAssist"
      docPaths={["SEMANTIC_SEARCH_DESIGN.md"]}
    />
  );
}
