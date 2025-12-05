/**
 * Voice Constants - Single Source of Truth (Frontend)
 *
 * All default voice configurations should be defined here.
 * Other components should import from this file to prevent inconsistencies.
 *
 * When changing the default voice, only this file needs to be updated.
 *
 * IMPORTANT: Keep this in sync with backend voice_constants.py
 */

// =============================================================================
// ElevenLabs Voice IDs
// =============================================================================

export const ElevenLabsVoices = {
  // Premium voices
  BRIAN: "nPczCjzI2devNBz1zQrb", // Male, natural, warm
  JOSH: "TxGEqnHWrfWFTfGW9XjX", // Male, deep, authoritative
  RACHEL: "21m00Tcm4TlvDq8ikWAM", // Female, clear, professional
  ADAM: "pNInz6obpgDQGcFmaJgB", // Male, deep, narrator
  BELLA: "EXAVITQu4vr4xnSDxMaL", // Female, soft, storytelling
  ELLI: "MF3mGyEYCl7XYWbV9V6O", // Female, young, friendly
  SAM: "yoZ06aMxZJJ28mfd3POQ", // Male, young, casual

  // Arabic voices
  LAYLA: "XB0fDUnXU5powFXDhCwa", // Female, Arabic
} as const;

export type ElevenLabsVoiceId =
  (typeof ElevenLabsVoices)[keyof typeof ElevenLabsVoices];

// Voice metadata for UI display
export const VoiceInfo: Record<
  ElevenLabsVoiceId,
  { name: string; gender: "male" | "female"; style: string }
> = {
  [ElevenLabsVoices.BRIAN]: { name: "Brian", gender: "male", style: "warm" },
  [ElevenLabsVoices.JOSH]: {
    name: "Josh",
    gender: "male",
    style: "authoritative",
  },
  [ElevenLabsVoices.RACHEL]: {
    name: "Rachel",
    gender: "female",
    style: "professional",
  },
  [ElevenLabsVoices.ADAM]: { name: "Adam", gender: "male", style: "narrator" },
  [ElevenLabsVoices.BELLA]: { name: "Bella", gender: "female", style: "soft" },
  [ElevenLabsVoices.ELLI]: {
    name: "Elli",
    gender: "female",
    style: "friendly",
  },
  [ElevenLabsVoices.SAM]: { name: "Sam", gender: "male", style: "casual" },
  [ElevenLabsVoices.LAYLA]: {
    name: "Layla",
    gender: "female",
    style: "arabic",
  },
};

// =============================================================================
// Default Voice Configuration
// =============================================================================

/**
 * THE SINGLE SOURCE OF TRUTH FOR DEFAULT VOICE (Frontend)
 *
 * Change this ONE value to update the default voice across the frontend.
 * Must be kept in sync with backend voice_constants.py
 */
export const DEFAULT_VOICE_ID: ElevenLabsVoiceId = ElevenLabsVoices.BRIAN;
export const DEFAULT_VOICE_NAME = "Brian";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get voice name from voice ID
 */
export function getVoiceName(voiceId: string): string {
  const info = VoiceInfo[voiceId as ElevenLabsVoiceId];
  return info?.name ?? "Unknown";
}

/**
 * Check if a voice ID is valid
 */
export function isValidVoiceId(voiceId: string): voiceId is ElevenLabsVoiceId {
  return Object.values(ElevenLabsVoices).includes(
    voiceId as ElevenLabsVoiceId,
  );
}

/**
 * Get all available voices for a selector
 */
export function getAvailableVoices(): Array<{
  id: ElevenLabsVoiceId;
  name: string;
  gender: "male" | "female";
  style: string;
}> {
  return Object.entries(VoiceInfo).map(([id, info]) => ({
    id: id as ElevenLabsVoiceId,
    ...info,
  }));
}
