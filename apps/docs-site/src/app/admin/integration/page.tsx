import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Admin Panel Integration Guide",
  description:
    "Comprehensive guide for the VoiceAssist admin panel with cross-app navigation, real-time events, and voice monitoring",
};

export default function AdminIntegrationPage() {
  return (
    <DocPage
      title="Admin Panel Integration Guide"
      description="Comprehensive guide for the VoiceAssist admin panel with cross-app navigation, real-time events, and voice monitoring"
      docPaths={["admin/ADMIN_PANEL_INTEGRATION_GUIDE.md"]}
    />
  );
}
