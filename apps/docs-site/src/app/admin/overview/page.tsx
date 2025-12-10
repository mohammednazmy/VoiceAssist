import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Admin Panel Overview",
  description:
    "Overview of VoiceAssist admin panel features, capabilities, and architecture",
};

export default function AdminOverviewPage() {
  return (
    <DocPage
      title="Admin Panel Overview"
      description="Overview of VoiceAssist admin panel features, capabilities, and architecture"
      docPaths={[
        "ADMIN_PANEL_SPECS.md",
        "ADMIN_PANEL_IMPLEMENTATION_SUMMARY.md",
      ]}
    />
  );
}
