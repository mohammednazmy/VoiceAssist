import { VoiceAssistApiClient } from "@voiceassist/api-client";

const gatewayBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://api.voiceassist.example.com/api";

export const docsApiClient = new VoiceAssistApiClient({
  baseURL: gatewayBaseUrl,
});

export { gatewayBaseUrl };
