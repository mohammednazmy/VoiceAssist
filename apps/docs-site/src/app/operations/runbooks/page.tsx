import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Operations Runbooks",
  description: "Step-by-step incident response procedures",
};

export default function RunbooksPage() {
  return (
    <DocPage
      title="Operations Runbooks"
      description="Step-by-step incident response procedures for common operational scenarios"
      docPaths={[
        "operations/OPERATIONS_OVERVIEW.md",
        "operations/runbooks/DEPLOYMENT.md",
        "operations/runbooks/INCIDENT_RESPONSE.md",
        "operations/runbooks/BACKUP_RESTORE.md",
        "operations/runbooks/SCALING.md",
        "operations/runbooks/MONITORING.md",
        "operations/runbooks/TROUBLESHOOTING.md",
        "operations/runbooks/DOCS_SITE_DEPLOYMENT_AND_TLS.md",
      ]}
    />
  );
}
