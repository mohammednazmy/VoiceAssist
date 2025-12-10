import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Frontend Debugging",
  description: "Web app, React components, and browser troubleshooting",
};

export default function FrontendDebuggingPage() {
  return (
    <DocPage
      title="Frontend Debugging"
      description="Troubleshooting guide for web app, React components, and browser issues"
      docPaths={["debugging/DEBUGGING_FRONTEND.md"]}
    />
  );
}
