import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Debugging Index",
  description: "Central hub for all VoiceAssist troubleshooting documentation",
};

export default function DebuggingIndexPage() {
  return (
    <DocPage
      title="Debugging Index"
      description="Central hub for all VoiceAssist troubleshooting documentation - logs, metrics, health endpoints, and debugging guides by subsystem"
      docPaths={["debugging/DEBUGGING_INDEX.md"]}
    />
  );
}
