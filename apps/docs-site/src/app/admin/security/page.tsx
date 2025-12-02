import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Security & Compliance",
  description:
    "Security policies, HIPAA compliance, PHI handling, and audit controls",
};

export default function SecurityPage() {
  return (
    <DocPage
      title="Security & Compliance"
      description="Security policies, HIPAA compliance, PHI handling, and audit controls"
      docPaths={["SECURITY_COMPLIANCE.md", "HIPAA_COMPLIANCE_MATRIX.md"]}
    />
  );
}
