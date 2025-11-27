import { VoiceAssistApiClient } from "@voiceassist/api-client";

// Base URL should NOT include /api prefix - API endpoints already include the path
const gatewayBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://api.voiceassist.example.com";

export const docsApiClient = new VoiceAssistApiClient({
  baseURL: gatewayBaseUrl,
});

export { gatewayBaseUrl };
