// Base URL should NOT include /api prefix - API endpoints already include the path
export const gatewayBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://api.voiceassist.example.com";
