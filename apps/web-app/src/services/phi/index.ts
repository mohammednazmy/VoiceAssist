/**
 * PHI Detection Service
 *
 * Client-side Protected Health Information detection for HIPAA compliance.
 */

export {
  PhiDetector,
  phiDetector,
  createPhiDetector,
  type PhiDetectionResult,
  type PhiMatch,
  type PhiDetectorOptions,
} from "./PhiDetector";

export {
  type PhiType,
  type PhiPattern,
  PHI_PATTERNS,
  MEDICAL_TERM_EXCLUSIONS,
  getPatternByType,
  getHighSeverityPatterns,
  getPhiTypeDescription,
} from "./patterns";
