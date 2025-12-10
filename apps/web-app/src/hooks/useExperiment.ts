/**
 * Experiment Hooks
 *
 * React hooks for A/B testing and feature flags.
 *
 * @example
 * ```typescript
 * // Feature flag
 * const { isEnabled, isLoading } = useFeatureFlag('new_chat_ui');
 * if (isEnabled) {
 *   return <NewChatUI />;
 * }
 *
 * // A/B test
 * const { variant, isLoading } = useExperiment('prompt_experiment');
 * const prompt = variant?.payload?.prompt ?? defaultPrompt;
 *
 * // Track conversion
 * const { trackConversion } = useExperimentTracking();
 * onClick={() => trackConversion('prompt_experiment', 'click_send')}
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  experimentService,
  type Variant,
  type ExperimentAssignment,
  type ExperimentResults,
} from "../services/experiments";

/**
 * Options for experiment hooks
 */
export interface UseExperimentOptions {
  /** User ID for consistent bucketing */
  userId?: string;
  /** Skip experiment evaluation */
  skip?: boolean;
  /** Callback when variant is assigned */
  onAssignment?: (variant: Variant | null) => void;
}

/**
 * Return type for useFeatureFlag
 */
export interface UseFeatureFlagReturn {
  /** Whether the feature is enabled */
  isEnabled: boolean;
  /** Whether the check is in progress */
  isLoading: boolean;
  /** Refresh the flag status */
  refresh: () => Promise<void>;
}

/**
 * Hook for checking feature flags
 */
export function useFeatureFlag(
  flagKey: string,
  options: UseExperimentOptions = {},
): UseFeatureFlagReturn {
  const { userId, skip = false } = options;

  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(!skip);

  const checkFlag = useCallback(async () => {
    if (skip) return;

    setIsLoading(true);
    try {
      const enabled = await experimentService.isFeatureEnabled(flagKey);
      setIsEnabled(enabled);
    } catch (error) {
      console.error(`[useFeatureFlag] Error checking ${flagKey}:`, error);
      setIsEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, [flagKey, skip]);

  useEffect(() => {
    if (userId) {
      experimentService.setUserId(userId);
    }
    checkFlag();
  }, [userId, checkFlag]);

  return {
    isEnabled,
    isLoading,
    refresh: checkFlag,
  };
}

/**
 * Return type for useExperiment
 */
export interface UseExperimentReturn {
  /** Assigned variant (null if not assigned) */
  variant: Variant | null;
  /** Whether the experiment is loading */
  isLoading: boolean;
  /** Whether a variant is assigned */
  isAssigned: boolean;
  /** Whether this is the control variant */
  isControl: boolean;
  /** Track a conversion for this experiment */
  trackConversion: (metricId: string, value?: number) => Promise<void>;
  /** Force a specific variant (for testing) */
  forceVariant: (variantId: string) => void;
  /** Clear forced variant */
  clearForce: () => void;
}

/**
 * Hook for A/B testing experiments
 */
export function useExperiment(
  experimentId: string,
  options: UseExperimentOptions = {},
): UseExperimentReturn {
  const { userId, skip = false, onAssignment } = options;

  const [variant, setVariant] = useState<Variant | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);

  const onAssignmentRef = useRef(onAssignment);
  useEffect(() => {
    onAssignmentRef.current = onAssignment;
  }, [onAssignment]);

  const getVariant = useCallback(async () => {
    if (skip) return;

    setIsLoading(true);
    try {
      const assignedVariant = await experimentService.getVariant(experimentId);
      setVariant(assignedVariant);
      onAssignmentRef.current?.(assignedVariant);
    } catch (error) {
      console.error(
        `[useExperiment] Error getting variant for ${experimentId}:`,
        error,
      );
      setVariant(null);
    } finally {
      setIsLoading(false);
    }
  }, [experimentId, skip]);

  useEffect(() => {
    if (userId) {
      experimentService.setUserId(userId);
    }
    getVariant();
  }, [userId, getVariant]);

  const trackConversion = useCallback(
    async (metricId: string, value?: number) => {
      await experimentService.trackConversion(experimentId, metricId, value);
    },
    [experimentId],
  );

  const forceVariant = useCallback(
    (variantId: string) => {
      experimentService.forceVariant(experimentId, variantId);
      getVariant();
    },
    [experimentId, getVariant],
  );

  const clearForce = useCallback(() => {
    experimentService.clearForce(experimentId);
    getVariant();
  }, [experimentId, getVariant]);

  return {
    variant,
    isLoading,
    isAssigned: variant !== null,
    isControl: variant?.isControl ?? false,
    trackConversion,
    forceVariant,
    clearForce,
  };
}

/**
 * Return type for useExperimentTracking
 */
export interface UseExperimentTrackingReturn {
  /** Track a conversion */
  trackConversion: (
    experimentId: string,
    metricId: string,
    value?: number,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  /** Get all current assignments */
  assignments: ExperimentAssignment[];
  /** Force sync pending events */
  sync: () => Promise<void>;
}

/**
 * Hook for experiment tracking
 */
export function useExperimentTracking(): UseExperimentTrackingReturn {
  const [assignments, setAssignments] = useState<ExperimentAssignment[]>([]);

  useEffect(() => {
    setAssignments(experimentService.getAssignments());
  }, []);

  const trackConversion = useCallback(
    async (
      experimentId: string,
      metricId: string,
      value?: number,
      metadata?: Record<string, unknown>,
    ) => {
      await experimentService.trackConversion(
        experimentId,
        metricId,
        value,
        metadata,
      );
    },
    [],
  );

  const sync = useCallback(async () => {
    await experimentService.forceSync();
  }, []);

  return {
    trackConversion,
    assignments,
    sync,
  };
}

/**
 * Return type for useExperimentResults
 */
export interface UseExperimentResultsReturn {
  /** Experiment results */
  results: ExperimentResults | null;
  /** Whether results are loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Refresh results */
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching experiment results
 */
export function useExperimentResults(
  experimentId: string,
  options: { skip?: boolean; refreshInterval?: number } = {},
): UseExperimentResultsReturn {
  const { skip = false, refreshInterval } = options;

  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  const fetchResults = useCallback(async () => {
    if (skip) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await experimentService.getResults(experimentId);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [experimentId, skip]);

  useEffect(() => {
    fetchResults();

    if (refreshInterval) {
      const intervalId = setInterval(fetchResults, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchResults, refreshInterval]);

  return {
    results,
    isLoading,
    error,
    refresh: fetchResults,
  };
}

/**
 * Hook for variant-specific value selection
 */
export function useVariantValue<T>(
  experimentId: string,
  variantValues: Record<string, T>,
  defaultValue: T,
  options: UseExperimentOptions = {},
): { value: T; isLoading: boolean; variant: Variant | null } {
  const { variant, isLoading } = useExperiment(experimentId, options);

  const value =
    variant && variantValues[variant.id]
      ? variantValues[variant.id]
      : defaultValue;

  return {
    value,
    isLoading,
    variant,
  };
}
