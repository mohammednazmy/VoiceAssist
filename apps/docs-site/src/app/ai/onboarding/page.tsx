import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "AI Agent Onboarding",
  description:
    "Quick start guide for AI coding assistants working with VoiceAssist",
};

export default function AIOnboardingPage() {
  return (
    <DocPage
      title="AI Agent Onboarding"
      description="Quick start guide for AI coding assistants working with VoiceAssist"
      docPaths={["ai/AGENT_ONBOARDING.md"]}
    />
  );
}
