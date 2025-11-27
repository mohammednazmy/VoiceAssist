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
      docPaths={["operations/OPERATIONS_OVERVIEW.md"]}
    />
  );
}
