import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Documentation System",
  description: "Validation scripts, quality gates, and documentation tooling",
};

export default function DocsSystemPage() {
  return (
    <DocPage
      title="Documentation System"
      description="Validation scripts, quality gates, and documentation tooling for VoiceAssist"
      docPaths={["INTERNAL_DOCS_SYSTEM.md"]}
    />
  );
}
