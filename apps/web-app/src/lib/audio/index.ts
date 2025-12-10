/**
 * Audio Library
 *
 * Advanced audio processing utilities for voice communication.
 *
 * Phase 4: Duplex Audio Architecture
 */

// Duplex Audio Pipeline with AEC
export {
  DuplexAudioPipeline,
  createDuplexAudioPipeline,
  getDuplexAudioPipeline,
  destroyDuplexAudioPipeline,
  DEFAULT_DUPLEX_CONFIG,
  type DuplexAudioConfig,
  type AECState,
  type DuplexPipelineState,
  type DuplexStateChangeCallback,
  type AECStateCallback,
} from "./duplexAudioPipeline";
