/**
 * PHI Pattern Definitions
 *
 * Regular expression patterns for detecting Protected Health Information (PHI).
 * These patterns mirror the backend PHI detection for client-side validation.
 *
 * @see services/api-gateway/app/services/phi_detector.py for backend equivalent
 */

/**
 * Types of PHI that can be detected
 */
export type PhiType =
  | "ssn"
  | "phone"
  | "email"
  | "mrn"
  | "account"
  | "ip_address"
  | "dob"
  | "name"
  | "address"
  | "credit_card";

/**
 * Pattern definitions for each PHI type
 * Each pattern includes:
 * - regex: The regular expression for matching
 * - description: Human-readable description
 * - severity: How sensitive this PHI type is
 */
export interface PhiPattern {
  type: PhiType;
  regex: RegExp;
  description: string;
  severity: "high" | "medium" | "low";
}

/**
 * PHI detection patterns
 * Note: These use global flag for multiple matches per string
 */
export const PHI_PATTERNS: PhiPattern[] = [
  {
    type: "ssn",
    regex: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
    description: "Social Security Number",
    severity: "high",
  },
  {
    type: "phone",
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    description: "Phone Number",
    severity: "medium",
  },
  {
    type: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    description: "Email Address",
    severity: "medium",
  },
  {
    type: "mrn",
    regex: /\b(?:MRN|mrn|medical record|record number)[\s:-]?\d{6,}\b/gi,
    description: "Medical Record Number",
    severity: "high",
  },
  {
    type: "account",
    regex: /\b(?:ACCT|acct|account)[\s:-]?\d{6,}\b/gi,
    description: "Account Number",
    severity: "medium",
  },
  {
    type: "ip_address",
    regex:
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    description: "IP Address",
    severity: "low",
  },
  {
    type: "dob",
    regex:
      /\b(?:born|dob|date of birth|birthday|d\.?o\.?b\.?)[\s:]*(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12][0-9]|3[01])[/-](?:19|20)\d{2}\b/gi,
    description: "Date of Birth",
    severity: "high",
  },
  {
    type: "credit_card",
    regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    description: "Credit Card Number",
    severity: "high",
  },
  {
    type: "address",
    regex:
      /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl)\.?(?:\s+(?:apt|suite|unit|#)\s*\d+)?\b/gi,
    description: "Street Address",
    severity: "medium",
  },
  {
    type: "name",
    regex: /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    description: "Personal Name",
    severity: "low", // Low because many false positives
  },
];

/**
 * Medical terms that should be excluded from name detection
 * These are common medical terms that could be false positives
 */
export const MEDICAL_TERM_EXCLUSIONS = new Set([
  // Common medical conditions
  "heart disease",
  "blood pressure",
  "diabetes mellitus",
  "atrial fibrillation",
  "chronic kidney",
  "coronary artery",
  "pulmonary embolism",
  "myocardial infarction",
  "congestive heart",
  "acute respiratory",
  "chronic obstructive",
  "urinary tract",
  "deep vein",
  "high blood",
  "low blood",

  // Anatomical terms
  "left ventricle",
  "right ventricle",
  "left atrium",
  "right atrium",
  "upper respiratory",
  "lower respiratory",
  "small intestine",
  "large intestine",

  // Medical procedures
  "physical therapy",
  "occupational therapy",
  "speech therapy",
  "blood transfusion",
  "organ transplant",

  // Medications (common two-word names)
  "lisinopril hydrochlorothiazide",
  "metformin hydrochloride",

  // Common medical phrases
  "medical history",
  "family history",
  "vital signs",
  "physical examination",
  "diagnostic imaging",
  "laboratory results",
  "treatment plan",
  "follow up",
  "chief complaint",
]);

/**
 * Common names that should still be flagged (high confidence names)
 * These override the medical term exclusions
 */
export const COMMON_NAMES_PATTERNS = [
  // First names followed by last names
  /\b(?:John|James|Robert|Michael|William|David|Richard|Joseph|Thomas|Charles|Mary|Patricia|Jennifer|Linda|Barbara|Elizabeth|Susan|Jessica|Sarah|Karen)\s+[A-Z][a-z]+\b/gi,
];

/**
 * Get pattern by type
 */
export function getPatternByType(type: PhiType): PhiPattern | undefined {
  return PHI_PATTERNS.find((p) => p.type === type);
}

/**
 * Get all high severity patterns
 */
export function getHighSeverityPatterns(): PhiPattern[] {
  return PHI_PATTERNS.filter((p) => p.severity === "high");
}

/**
 * Get human-readable description for PHI type
 */
export function getPhiTypeDescription(type: PhiType): string {
  const pattern = getPatternByType(type);
  return pattern?.description ?? type;
}
