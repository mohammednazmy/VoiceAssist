import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Third-party integrations including Nextcloud, calendar services, and external tools",
};

export default function IntegrationsPage() {
  return (
    <DocPage
      title="Integrations"
      description="Third-party integrations including Nextcloud, calendar services, and external tools"
      docPaths={["NEXTCLOUD_INTEGRATION.md", "TOOLS_AND_INTEGRATIONS.md"]}
    />
  );
}
