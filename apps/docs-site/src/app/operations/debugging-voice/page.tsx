import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Voice & Realtime Debugging",
  description: "WebSocket, STT, and TTS troubleshooting",
};

export default function VoiceDebuggingPage() {
  return (
    <DocPage
      title="Voice & Realtime Debugging"
      description="Troubleshooting guide for WebSocket, speech-to-text, text-to-speech, and realtime features"
      docPaths={["debugging/DEBUGGING_VOICE_REALTIME.md"]}
    />
  );
}
