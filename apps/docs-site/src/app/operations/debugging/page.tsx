import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Debugging Overview",
  description: "Where to look for issues and how to investigate VoiceAssist",
};

export default function DebuggingOverviewPage() {
  return (
    <DocPage
      title="Debugging Overview"
      description="High-level guide on how to debug VoiceAssist - logs, metrics, common symptoms, and where to look"
      docPaths={["debugging/DEBUGGING_OVERVIEW.md"]}
    />
  );
}
