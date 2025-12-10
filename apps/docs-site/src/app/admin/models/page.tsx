import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "AI Models & Orchestration",
  description:
    "AI model configuration, orchestration design, and LLM integration for VoiceAssist",
};

export default function ModelsPage() {
  return (
    <DocPage
      title="AI Models & Orchestration"
      description="AI model configuration, orchestration design, and LLM integration for VoiceAssist"
      docPaths={["ORCHESTRATION_DESIGN.md"]}
    />
  );
}
