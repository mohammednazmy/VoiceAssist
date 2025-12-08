/**
 * Intelligent Barge-In System
 *
 * World-class voice interruption detection and handling for natural
 * conversational AI interactions.
 *
 * Features:
 * - Neural VAD (<30ms speech detection)
 * - Multilingual backchannel detection
 * - Context-aware interruption classification
 * - Adaptive personalization
 * - Tool-call safe interruption handling
 *
 * Natural Conversation Flow: Phase 1 - Frontend Integration
 */

// Export types
export * from "./types";

// Export the main hook
export {
  useIntelligentBargeIn,
  type UseIntelligentBargeInOptions,
} from "./useIntelligentBargeIn";
export { useIntelligentBargeIn as default } from "./useIntelligentBargeIn";
