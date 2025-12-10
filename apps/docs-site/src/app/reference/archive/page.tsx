import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Documentation Archive",
  description: "Historical VoiceAssist documentation preserved for reference",
};

export default function ArchivePage() {
  return (
    <DocPage
      title="Documentation Archive"
      description="Archived documentation, session notes, and historical context."
      docPaths={["archive/README.md"]}
    />
  );
}
