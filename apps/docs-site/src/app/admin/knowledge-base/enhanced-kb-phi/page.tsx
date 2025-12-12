import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Enhanced KB Editing & PHI Controls",
  description:
    "Admin guide for enhanced knowledge base editing, PHI risk indicators, PHI-conscious RAG testing, and maintenance tooling.",
};

export default function EnhancedKbPhiPage() {
  return (
    <DocPage
      title="Enhanced KB Editing & PHI Controls"
      description="How admins can use enhanced KB editing, PHI risk badges/filters, the PHI-conscious RAG test panel, and the phi_risk maintenance script."
      docPaths={["admin/ENHANCED_KB_PHI_CONTROLS.md"]}
    />
  );
}

