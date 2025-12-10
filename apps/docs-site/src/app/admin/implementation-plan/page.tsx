import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Admin Panel Implementation Plan",
  description:
    "Comprehensive implementation plan for making admin.asimo.io the canonical operational mission control for VoiceAssist",
};

export default function AdminImplementationPlanPage() {
  return (
    <DocPage
      title="Admin Panel Implementation Plan"
      description="Comprehensive implementation plan for making admin.asimo.io the canonical operational mission control for VoiceAssist"
      docPaths={["admin/ADMIN_PANEL_IMPLEMENTATION_PLAN.md"]}
    />
  );
}
