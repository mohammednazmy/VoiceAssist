/**
 * PHI Detection Hook
 *
 * React hook for real-time PHI detection in user input.
 * Provides debounced detection, warning state management, and sanitization.
 *
 * @example
 * ```typescript
 * const { checkText, result, showWarning, sanitizeText } = usePhiDetection({
 *   debounceMs: 300,
 *   onPhiDetected: (result) => console.log('PHI found:', result),
 * });
 *
 * // In a form input handler
 * const handleChange = (e) => {
 *   checkText(e.target.value);
 * };
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";
import {
  phiDetector,
  createPhiDetector,
  PhiDetectionResult,
  PhiDetectorOptions,
  PhiType,
} from "../services/phi";

/**
 * Options for the PHI detection hook
 */
export interface UsePhiDetectionOptions extends PhiDetectorOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Callback when PHI is detected */
  onPhiDetected?: (result: PhiDetectionResult) => void;
  /** Callback when warning is dismissed */
  onWarningDismissed?: () => void;
  /** Callback when user acknowledges and proceeds */
  onAcknowledgeAndProceed?: (text: string, result: PhiDetectionResult) => void;
  /** Auto-dismiss warning after sanitization */
  autoDismissOnSanitize?: boolean;
}

/**
 * Return type for the PHI detection hook
 */
export interface UsePhiDetectionReturn {
  /** Check text for PHI */
  checkText: (text: string) => void;
  /** Current detection result */
  result: PhiDetectionResult | null;
  /** Whether to show warning UI */
  showWarning: boolean;
  /** Dismiss the warning */
  dismissWarning: () => void;
  /** Get sanitized version of the text */
  sanitizeText: () => string;
  /** Acknowledge warning and proceed with original text */
  acknowledgeAndProceed: () => string;
  /** Current text being checked */
  currentText: string;
  /** Whether detection is pending */
  isPending: boolean;
  /** Get summary of detected PHI */
  getSummary: () => string;
  /** Check if a specific PHI type was detected */
  hasPhiType: (type: PhiType) => boolean;
  /** Reset the hook state */
  reset: () => void;
}

/**
 * PHI Detection Hook
 */
export function usePhiDetection(
  options: UsePhiDetectionOptions = {},
): UsePhiDetectionReturn {
  const {
    debounceMs = 300,
    onPhiDetected,
    onWarningDismissed,
    onAcknowledgeAndProceed,
    autoDismissOnSanitize = false,
    ...detectorOptions
  } = options;

  // State
  const [text, setText] = useState("");
  const [result, setResult] = useState<PhiDetectionResult | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Refs for callbacks to avoid stale closures
  const onPhiDetectedRef = useRef(onPhiDetected);
  const onWarningDismissedRef = useRef(onWarningDismissed);
  const onAcknowledgeAndProceedRef = useRef(onAcknowledgeAndProceed);

  useEffect(() => {
    onPhiDetectedRef.current = onPhiDetected;
    onWarningDismissedRef.current = onWarningDismissed;
    onAcknowledgeAndProceedRef.current = onAcknowledgeAndProceed;
  }, [onPhiDetected, onWarningDismissed, onAcknowledgeAndProceed]);

  // Create detector with custom options if provided
  const detector = useRef(
    Object.keys(detectorOptions).length > 0
      ? createPhiDetector(detectorOptions)
      : phiDetector,
  );

  // Debounced text for detection
  const debouncedText = useDebounce(text, debounceMs);

  // Run detection when debounced text changes
  useEffect(() => {
    if (debouncedText) {
      setIsPending(false);
      const detection = detector.current.detect(debouncedText);
      setResult(detection);

      if (detection.containsPhi) {
        setShowWarning(true);
        onPhiDetectedRef.current?.(detection);
      } else {
        setShowWarning(false);
      }
    } else {
      setResult(null);
      setShowWarning(false);
      setIsPending(false);
    }
  }, [debouncedText]);

  // Check text for PHI
  const checkText = useCallback(
    (newText: string) => {
      setText(newText);
      if (newText !== text) {
        setIsPending(true);
      }
    },
    [text],
  );

  // Sanitize text by redacting PHI
  const sanitizeText = useCallback(() => {
    const sanitized = detector.current.sanitize(text);

    if (autoDismissOnSanitize) {
      setShowWarning(false);
    }

    return sanitized;
  }, [text, autoDismissOnSanitize]);

  // Dismiss warning
  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    onWarningDismissedRef.current?.();
  }, []);

  // Acknowledge warning and proceed with original text
  const acknowledgeAndProceed = useCallback(() => {
    if (result) {
      // Log for audit purposes
      console.info("[PHI] User acknowledged PHI warning and proceeded", {
        phiTypes: result.phiTypes,
        matchCount: result.matchCount,
        timestamp: new Date().toISOString(),
      });

      onAcknowledgeAndProceedRef.current?.(text, result);
    }

    setShowWarning(false);
    return text;
  }, [text, result]);

  // Get summary of detected PHI
  const getSummary = useCallback(() => {
    if (!result) {
      return "No text checked";
    }
    return detector.current.getSummary(result);
  }, [result]);

  // Check if specific PHI type was detected
  const hasPhiType = useCallback(
    (type: PhiType) => {
      return result?.phiTypes.includes(type) ?? false;
    },
    [result],
  );

  // Reset hook state
  const reset = useCallback(() => {
    setText("");
    setResult(null);
    setShowWarning(false);
    setIsPending(false);
  }, []);

  return {
    checkText,
    result,
    showWarning,
    dismissWarning,
    sanitizeText,
    acknowledgeAndProceed,
    currentText: text,
    isPending,
    getSummary,
    hasPhiType,
    reset,
  };
}

/**
 * Simple PHI check hook for one-time validation
 */
export function usePhiCheck() {
  const checkForPhi = useCallback((text: string): PhiDetectionResult => {
    return phiDetector.detect(text);
  }, []);

  const sanitize = useCallback((text: string): string => {
    return phiDetector.sanitize(text);
  }, []);

  const containsPhi = useCallback((text: string): boolean => {
    return phiDetector.detect(text).containsPhi;
  }, []);

  return {
    checkForPhi,
    sanitize,
    containsPhi,
  };
}
