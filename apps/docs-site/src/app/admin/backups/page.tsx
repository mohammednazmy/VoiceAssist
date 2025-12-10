import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Backups & Disaster Recovery",
  description:
    "Backup procedures, disaster recovery runbook, RTO/RPO targets, and data protection",
};

export default function BackupsPage() {
  return (
    <DocPage
      title="Backups & Disaster Recovery"
      description="Backup procedures, disaster recovery runbook, RTO/RPO targets, and data protection"
      docPaths={["DISASTER_RECOVERY_RUNBOOK.md", "RTO_RPO_DOCUMENTATION.md"]}
    />
  );
}
