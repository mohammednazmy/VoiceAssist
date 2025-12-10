import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "System Configuration",
  description:
    "System configuration reference and settings for VoiceAssist platform",
};

export default function SystemConfigPage() {
  return (
    <DocPage
      title="System Configuration"
      description="System configuration reference and settings for VoiceAssist platform"
      docPaths={["CONFIGURATION_REFERENCE.md", "INFRASTRUCTURE_SETUP.md"]}
    />
  );
}
