import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Docs Site Debugging",
  description: "Next.js, static export, and Apache troubleshooting",
};

export default function DocsDebuggingPage() {
  return (
    <DocPage
      title="Docs Site Debugging"
      description="Troubleshooting guide for documentation site, Next.js static export, and Apache issues"
      docPaths={["debugging/DEBUGGING_DOCS_SITE.md"]}
    />
  );
}
