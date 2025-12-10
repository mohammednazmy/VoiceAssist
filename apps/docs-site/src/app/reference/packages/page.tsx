import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Shared Packages",
  description:
    "VoiceAssist monorepo shared packages (api-client, config, design-tokens, telemetry, types, ui, utils)",
};

export default function PackagesPage() {
  return (
    <DocPage
      title="Shared Packages"
      description="Documentation for the shared packages used across the VoiceAssist frontend apps."
      docPaths={[
        "@root/packages/api-client/README.md",
        "@root/packages/config/README.md",
        "@root/packages/design-tokens/README.md",
        "@root/packages/telemetry/README.md",
        "@root/packages/types/README.md",
        "@root/packages/ui/README.md",
        "@root/packages/utils/README.md",
      ]}
    />
  );
}
