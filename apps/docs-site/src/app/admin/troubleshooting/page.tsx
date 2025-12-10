import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Troubleshooting Guide",
  description:
    "Debugging guides, common issues, and troubleshooting procedures for VoiceAssist",
};

export default function TroubleshootingPage() {
  return (
    <DocPage
      title="Troubleshooting Guide"
      description="Debugging guides, common issues, and troubleshooting procedures for VoiceAssist"
      docPaths={[
        "debugging/DEBUGGING_DOCS_SITE.md",
        "debugging/DEBUGGING_FRONTEND.md",
      ]}
    />
  );
}
