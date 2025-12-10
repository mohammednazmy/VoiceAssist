/**
 * A/B Testing & Experiments Types
 *
 * Type definitions for the experimentation and A/B testing system.
 * Supports feature flags, prompt variants, and UI experiments.
 */

/**
 * Experiment status
 */
export type ExperimentStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "archived";

/**
 * Variant allocation strategy
 */
export type AllocationStrategy = "random" | "deterministic" | "sticky";

/**
 * Experiment type
 */
export type ExperimentType =
  | "feature_flag"
  | "ab_test"
  | "multivariate"
  | "rollout";

/**
 * Experiment variant
 */
export interface Variant {
  /** Unique variant ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Traffic allocation percentage (0-100) */
  weight: number;
  /** Whether this is the control variant */
  isControl: boolean;
  /** Variant payload/configuration */
  payload?: Record<string, unknown>;
}

/**
 * Experiment definition
 */
export interface Experiment {
  /** Unique experiment ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Experiment type */
  type: ExperimentType;
  /** Current status */
  status: ExperimentStatus;
  /** Variants */
  variants: Variant[];
  /** Allocation strategy */
  allocationStrategy: AllocationStrategy;
  /** Start date (timestamp) */
  startDate?: number;
  /** End date (timestamp) */
  endDate?: number;
  /** Target audience filter */
  targeting?: ExperimentTargeting;
  /** Metrics to track */
  metrics: ExperimentMetric[];
  /** Owner/creator */
  owner?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * Experiment targeting rules
 */
export interface ExperimentTargeting {
  /** User IDs to include */
  userIds?: string[];
  /** User segments to target */
  segments?: string[];
  /** Device types */
  devices?: ("mobile" | "tablet" | "desktop")[];
  /** Percentage of users to include */
  percentage?: number;
  /** Custom attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Experiment metric definition
 */
export interface ExperimentMetric {
  /** Metric ID */
  id: string;
  /** Metric name */
  name: string;
  /** Metric type */
  type: "conversion" | "count" | "duration" | "custom";
  /** Whether this is the primary metric */
  isPrimary: boolean;
  /** Goal (higher/lower is better) */
  goal: "maximize" | "minimize";
}

/**
 * User's experiment assignment
 */
export interface ExperimentAssignment {
  /** Experiment ID */
  experimentId: string;
  /** Assigned variant ID */
  variantId: string;
  /** Assignment timestamp */
  assignedAt: number;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId: string;
  /** Whether assignment was forced */
  forced?: boolean;
}

/**
 * Experiment exposure event
 */
export interface ExperimentExposure {
  /** Experiment ID */
  experimentId: string;
  /** Variant ID */
  variantId: string;
  /** Exposure timestamp */
  timestamp: number;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId: string;
  /** Context (page, component, etc.) */
  context?: string;
}

/**
 * Experiment conversion event
 */
export interface ExperimentConversion {
  /** Experiment ID */
  experimentId: string;
  /** Variant ID */
  variantId: string;
  /** Metric ID */
  metricId: string;
  /** Conversion timestamp */
  timestamp: number;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId: string;
  /** Conversion value (if applicable) */
  value?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Experiment results
 */
export interface ExperimentResults {
  /** Experiment ID */
  experimentId: string;
  /** Results by variant */
  variants: VariantResults[];
  /** Statistical significance */
  significance: number;
  /** Whether results are significant */
  isSignificant: boolean;
  /** Recommended variant (if significant) */
  recommendedVariant?: string;
  /** Analysis timestamp */
  analyzedAt: number;
}

/**
 * Results for a single variant
 */
export interface VariantResults {
  /** Variant ID */
  variantId: string;
  /** Number of exposures */
  exposures: number;
  /** Results by metric */
  metrics: MetricResults[];
}

/**
 * Results for a single metric
 */
export interface MetricResults {
  /** Metric ID */
  metricId: string;
  /** Metric name */
  name: string;
  /** Total conversions */
  conversions: number;
  /** Conversion rate */
  conversionRate: number;
  /** Lift vs control (percentage) */
  lift?: number;
  /** Confidence interval */
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  /** P-value */
  pValue?: number;
}

/**
 * Feature flag definition (simplified experiment)
 */
export interface FeatureFlag {
  /** Flag key */
  key: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Whether flag is enabled */
  enabled: boolean;
  /** Default value */
  defaultValue: boolean;
  /** Targeting rules */
  targeting?: ExperimentTargeting;
  /** Rollout percentage */
  rolloutPercentage?: number;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * Experiment configuration for the service
 */
export interface ExperimentConfig {
  /** API endpoint for experiments */
  apiEndpoint: string;
  /** Cache duration in milliseconds */
  cacheDuration: number;
  /** Enable offline support */
  enableOffline: boolean;
  /** Default allocation strategy */
  defaultStrategy: AllocationStrategy;
}
