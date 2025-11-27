/**
 * Client-Side PHI Detection Service
 *
 * Mirrors backend PHI detection for real-time warnings before submission.
 * Uses pattern matching similar to services/api-gateway/app/services/phi_detector.py
 *
 * IMPORTANT: This is a defensive layer. Backend validation is still authoritative.
 *
 * @example
 * ```typescript
 * import { phiDetector } from '@/services/phi/PhiDetector';
 *
 * const result = phiDetector.detect('Patient SSN: 123-45-6789');
 * if (result.containsPhi) {
 *   console.warn('PHI detected:', result.phiTypes);
 * }
 * ```
 */

import {
  PhiType,
  PHI_PATTERNS,
  MEDICAL_TERM_EXCLUSIONS,
  getPhiTypeDescription,
} from "./patterns";

/**
 * Result of PHI detection
 */
export interface PhiDetectionResult {
  /** Whether PHI was detected */
  containsPhi: boolean;
  /** Types of PHI detected */
  phiTypes: PhiType[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Individual matches found */
  matches: PhiMatch[];
  /** Total count of matches */
  matchCount: number;
  /** Highest severity level found */
  highestSeverity: "high" | "medium" | "low" | null;
}

/**
 * Individual PHI match
 */
export interface PhiMatch {
  /** Type of PHI */
  type: PhiType;
  /** The matched value */
  value: string;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
  /** Redacted version of the value */
  redacted: string;
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: "high" | "medium" | "low";
}

/**
 * Options for PHI detection
 */
export interface PhiDetectorOptions {
  /** Types of PHI to detect (default: all) */
  typesToDetect?: PhiType[];
  /** Minimum severity to report (default: 'low') */
  minSeverity?: "high" | "medium" | "low";
  /** Whether to include potential name matches (prone to false positives) */
  includeNames?: boolean;
}

/**
 * PHI Detector class
 */
export class PhiDetector {
  private options: Required<PhiDetectorOptions>;

  constructor(options: PhiDetectorOptions = {}) {
    this.options = {
      typesToDetect: options.typesToDetect ?? PHI_PATTERNS.map((p) => p.type),
      minSeverity: options.minSeverity ?? "low",
      includeNames: options.includeNames ?? false,
    };
  }

  /**
   * Detect PHI in text
   */
  detect(text: string): PhiDetectionResult {
    if (!text || typeof text !== "string") {
      return this.createEmptyResult();
    }

    const matches: PhiMatch[] = [];
    const phiTypes = new Set<PhiType>();
    const severityOrder = { high: 3, medium: 2, low: 1 };
    let highestSeverity: "high" | "medium" | "low" | null = null;

    // Filter patterns based on options
    const patternsToCheck = PHI_PATTERNS.filter((pattern) => {
      // Check if this type should be detected
      if (!this.options.typesToDetect.includes(pattern.type)) {
        return false;
      }

      // Check severity threshold
      if (
        severityOrder[pattern.severity] <
        severityOrder[this.options.minSeverity]
      ) {
        return false;
      }

      // Special handling for names
      if (pattern.type === "name" && !this.options.includeNames) {
        return false;
      }

      return true;
    });

    for (const pattern of patternsToCheck) {
      // Create new regex instance to reset lastIndex
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedValue = match[0];

        // Skip medical terms for name detection
        if (pattern.type === "name" && this.isMedicalTerm(matchedValue)) {
          continue;
        }

        // Skip obvious false positives for IP addresses (localhost, etc.)
        if (
          pattern.type === "ip_address" &&
          this.isExcludedIpAddress(matchedValue)
        ) {
          continue;
        }

        // Add match
        matches.push({
          type: pattern.type,
          value: matchedValue,
          startIndex: match.index,
          endIndex: match.index + matchedValue.length,
          redacted: this.redactValue(pattern.type, matchedValue),
          description: pattern.description,
          severity: pattern.severity,
        });

        phiTypes.add(pattern.type);

        // Track highest severity
        if (
          !highestSeverity ||
          severityOrder[pattern.severity] > severityOrder[highestSeverity]
        ) {
          highestSeverity = pattern.severity;
        }
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.startIndex - b.startIndex);

    return {
      containsPhi: matches.length > 0,
      phiTypes: Array.from(phiTypes),
      confidence: this.calculateConfidence(matches),
      matches,
      matchCount: matches.length,
      highestSeverity,
    };
  }

  /**
   * Sanitize text by redacting detected PHI
   */
  sanitize(text: string): string {
    const result = this.detect(text);

    if (!result.containsPhi) {
      return text;
    }

    let sanitized = text;

    // Process matches in reverse order to preserve indices
    const sortedMatches = [...result.matches].sort(
      (a, b) => b.startIndex - a.startIndex,
    );

    for (const match of sortedMatches) {
      sanitized =
        sanitized.slice(0, match.startIndex) +
        match.redacted +
        sanitized.slice(match.endIndex);
    }

    return sanitized;
  }

  /**
   * Get a summary of detected PHI types
   */
  getSummary(result: PhiDetectionResult): string {
    if (!result.containsPhi) {
      return "No PHI detected";
    }

    const typeDescriptions = result.phiTypes.map((type) =>
      getPhiTypeDescription(type),
    );
    const uniqueDescriptions = [...new Set(typeDescriptions)];

    if (uniqueDescriptions.length === 1) {
      return `${result.matchCount} ${uniqueDescriptions[0]}${result.matchCount > 1 ? "s" : ""} detected`;
    }

    return `${result.matchCount} PHI items detected: ${uniqueDescriptions.join(", ")}`;
  }

  /**
   * Create an empty result
   */
  private createEmptyResult(): PhiDetectionResult {
    return {
      containsPhi: false,
      phiTypes: [],
      confidence: 1,
      matches: [],
      matchCount: 0,
      highestSeverity: null,
    };
  }

  /**
   * Check if text is a medical term (to exclude from name detection)
   */
  private isMedicalTerm(text: string): boolean {
    const normalized = text.toLowerCase();
    return MEDICAL_TERM_EXCLUSIONS.has(normalized);
  }

  /**
   * Check if IP address should be excluded (localhost, private ranges)
   */
  private isExcludedIpAddress(ip: string): boolean {
    // Exclude localhost
    if (ip === "127.0.0.1" || ip === "0.0.0.0") {
      return true;
    }

    // Exclude private IP ranges
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true; // 10.x.x.x
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16-31.x.x
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.x.x

    return false;
  }

  /**
   * Create redacted version of a value
   */
  private redactValue(type: PhiType, value: string): string {
    const length = value.length;

    switch (type) {
      case "ssn":
        return "[SSN REDACTED]";
      case "phone":
        return "[PHONE REDACTED]";
      case "email":
        return "[EMAIL REDACTED]";
      case "mrn":
        return "[MRN REDACTED]";
      case "account":
        return "[ACCOUNT REDACTED]";
      case "ip_address":
        return "[IP REDACTED]";
      case "dob":
        return "[DOB REDACTED]";
      case "credit_card":
        return "[CC REDACTED]";
      case "address":
        return "[ADDRESS REDACTED]";
      case "name":
        return "[NAME REDACTED]";
      default:
        return `[${"*".repeat(Math.min(length, 10))}]`;
    }
  }

  /**
   * Calculate confidence score based on matches
   * Higher confidence for more specific patterns (SSN, MRN) vs generic (names)
   */
  private calculateConfidence(matches: PhiMatch[]): number {
    if (matches.length === 0) {
      return 1;
    }

    // Weight by severity
    const weights = {
      high: 0.95,
      medium: 0.85,
      low: 0.6,
    };

    const totalWeight = matches.reduce(
      (sum, match) => sum + weights[match.severity],
      0,
    );
    return totalWeight / matches.length;
  }
}

/**
 * Singleton instance with default options
 */
export const phiDetector = new PhiDetector();

/**
 * Create a detector with custom options
 */
export function createPhiDetector(options: PhiDetectorOptions): PhiDetector {
  return new PhiDetector(options);
}
