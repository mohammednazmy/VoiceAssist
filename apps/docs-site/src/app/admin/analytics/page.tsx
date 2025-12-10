import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Analytics & Metrics",
  description:
    "Platform analytics, usage metrics, performance monitoring, and observability",
};

export default function AnalyticsPage() {
  return (
    <DocPage
      title="Analytics & Metrics"
      description="Platform analytics, usage metrics, performance monitoring, and observability"
      docPaths={["OBSERVABILITY.md", "PERFORMANCE_BENCHMARKS.md"]}
    />
  );
}
