/**
 * A/B Testing & Experiments Service
 *
 * Provides experiment management and feature flags for continuous improvement.
 */

export {
  experimentService,
  createExperimentService,
  type Experiment,
  type Variant,
  type ExperimentAssignment,
  type ExperimentExposure,
  type ExperimentConversion,
  type ExperimentResults,
  type FeatureFlag,
  type ExperimentConfig,
  type AllocationStrategy,
} from "./ExperimentService";

export type {
  ExperimentStatus,
  ExperimentType,
  ExperimentTargeting,
  ExperimentMetric,
  VariantResults,
  MetricResults,
} from "./types";
