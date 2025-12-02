import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "User Management",
  description:
    "User administration, roles, permissions, and access control for VoiceAssist",
};

export default function UsersPage() {
  return (
    <DocPage
      title="User Management"
      description="User administration, roles, permissions, and access control for VoiceAssist"
      docPaths={["ADMIN_PANEL_SPECS.md"]}
    />
  );
}
