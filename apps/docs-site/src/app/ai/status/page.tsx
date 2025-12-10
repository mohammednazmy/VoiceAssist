import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Implementation Status",
  description:
    "Single source of truth for all VoiceAssist component implementation status",
};

export default function ImplementationStatusPage() {
  return (
    <DocPage
      title="Implementation Status"
      description="Single source of truth for all component status and implementation progress"
      docPaths={["overview/IMPLEMENTATION_STATUS.md"]}
    />
  );
}
