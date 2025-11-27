import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Backend Debugging",
  description: "API Gateway, database, and cache troubleshooting",
};

export default function BackendDebuggingPage() {
  return (
    <DocPage
      title="Backend Debugging"
      description="Troubleshooting guide for API Gateway, database, cache, and backend services"
      docPaths={["debugging/DEBUGGING_BACKEND.md"]}
    />
  );
}
