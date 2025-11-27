/**
 * A/B Testing & Experiments Service
 *
 * Manages experiment assignments, feature flags, and experiment tracking.
 * Supports deterministic assignment, caching, and offline fallbacks.
 *
 * @example
 * ```typescript
 * import { experimentService } from '@/services/experiments';
 *
 * // Check feature flag
 * const isEnabled = await experimentService.isFeatureEnabled('new_chat_ui');
 *
 * // Get experiment variant
 * const variant = await experimentService.getVariant('prompt_experiment');
 * if (variant.id === 'variant_a') {
 *   // Use variant A prompt
 * }
 *
 * // Track conversion
 * await experimentService.trackConversion('prompt_experiment', 'positive_feedback');
 * ```
 */

import {
  type Experiment,
  type Variant,
  type ExperimentAssignment,
  type ExperimentExposure,
  type ExperimentConversion,
  type ExperimentResults,
  type FeatureFlag,
  type ExperimentConfig,
  type AllocationStrategy,
} from "./types";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExperimentConfig = {
  apiEndpoint: "/api/experiments",
  cacheDuration: 300000, // 5 minutes
  enableOffline: true,
  defaultStrategy: "deterministic",
};

/**
 * Cache entry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Experiment Service class
 */
class ExperimentService {
  private config: ExperimentConfig;
  private sessionId: string;
  private userId: string | null = null;
  private experimentCache: Map<string, CacheEntry<Experiment>> = new Map();
  private flagCache: Map<string, CacheEntry<FeatureFlag>> = new Map();
  private assignments: Map<string, ExperimentAssignment> = new Map();
  private pendingEvents: (ExperimentExposure | ExperimentConversion)[] = [];
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ExperimentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.loadAssignmentsFromStorage();
    this.startEventSync();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `exp-session-${timestamp}-${random}`;
  }

  /**
   * Set the current user ID
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Load assignments from localStorage
   */
  private loadAssignmentsFromStorage(): void {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = localStorage.getItem("experiment_assignments");
      if (stored) {
        const data = JSON.parse(stored) as ExperimentAssignment[];
        data.forEach((assignment) => {
          this.assignments.set(assignment.experimentId, assignment);
        });
      }
    } catch (error) {
      console.warn("[ExperimentService] Failed to load assignments:", error);
    }
  }

  /**
   * Save assignments to localStorage
   */
  private saveAssignmentsToStorage(): void {
    if (typeof localStorage === "undefined") return;

    try {
      const data = Array.from(this.assignments.values());
      localStorage.setItem("experiment_assignments", JSON.stringify(data));
    } catch (error) {
      console.warn("[ExperimentService] Failed to save assignments:", error);
    }
  }

  /**
   * Start event sync interval
   */
  private startEventSync(): void {
    if (this.syncIntervalId) return;

    this.syncIntervalId = setInterval(() => {
      this.syncEvents();
    }, 30000); // Sync every 30 seconds
  }

  /**
   * Stop event sync
   */
  stopEventSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Sync pending events to the backend
   */
  private async syncEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return;

    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      await fetch(`${this.config.apiEndpoint}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      // Re-add events on failure
      this.pendingEvents = [...events, ...this.pendingEvents];
      console.warn("[ExperimentService] Failed to sync events:", error);
    }
  }

  /**
   * Check if a feature flag is enabled
   */
  async isFeatureEnabled(flagKey: string): Promise<boolean> {
    try {
      const flag = await this.getFeatureFlag(flagKey);
      if (!flag) return false;

      // If not enabled globally, return false
      if (!flag.enabled) return false;

      // Check targeting
      if (flag.targeting) {
        if (!this.matchesTargeting(flag.targeting)) {
          return flag.defaultValue;
        }
      }

      // Check rollout percentage
      if (
        flag.rolloutPercentage !== undefined &&
        flag.rolloutPercentage < 100
      ) {
        const hash = this.hashString(
          `${flagKey}:${this.userId || this.sessionId}`,
        );
        const bucket = (hash % 100) + 1;
        return bucket <= flag.rolloutPercentage;
      }

      return true;
    } catch (error) {
      console.warn(
        `[ExperimentService] Failed to check flag ${flagKey}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get a feature flag definition
   */
  private async getFeatureFlag(flagKey: string): Promise<FeatureFlag | null> {
    // Check cache
    const cached = this.flagCache.get(flagKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/flags/${flagKey}`,
      );
      if (!response.ok) return null;

      const flag = await response.json();
      this.flagCache.set(flagKey, { data: flag, timestamp: Date.now() });
      return flag;
    } catch (error) {
      console.warn(
        `[ExperimentService] Failed to fetch flag ${flagKey}:`,
        error,
      );
      return cached?.data ?? null;
    }
  }

  /**
   * Get the assigned variant for an experiment
   */
  async getVariant(experimentId: string): Promise<Variant | null> {
    // Check existing assignment
    const existingAssignment = this.assignments.get(experimentId);
    if (existingAssignment) {
      const experiment = await this.getExperiment(experimentId);
      if (experiment) {
        const variant = experiment.variants.find(
          (v) => v.id === existingAssignment.variantId,
        );
        if (variant) {
          this.trackExposure(experimentId, variant.id);
          return variant;
        }
      }
    }

    // Get experiment and assign variant
    const experiment = await this.getExperiment(experimentId);
    if (!experiment || experiment.status !== "running") return null;

    // Check targeting
    if (experiment.targeting && !this.matchesTargeting(experiment.targeting)) {
      return null;
    }

    // Assign variant
    const variant = this.assignVariant(experiment);
    if (!variant) return null;

    // Store assignment
    const assignment: ExperimentAssignment = {
      experimentId,
      variantId: variant.id,
      assignedAt: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
    };
    this.assignments.set(experimentId, assignment);
    this.saveAssignmentsToStorage();

    // Track exposure
    this.trackExposure(experimentId, variant.id);

    return variant;
  }

  /**
   * Get an experiment definition
   */
  private async getExperiment(
    experimentId: string,
  ): Promise<Experiment | null> {
    // Check cache
    const cached = this.experimentCache.get(experimentId);
    if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/experiments/${experimentId}`,
      );
      if (!response.ok) return null;

      const experiment = await response.json();
      this.experimentCache.set(experimentId, {
        data: experiment,
        timestamp: Date.now(),
      });
      return experiment;
    } catch (error) {
      console.warn(
        `[ExperimentService] Failed to fetch experiment ${experimentId}:`,
        error,
      );
      return cached?.data ?? null;
    }
  }

  /**
   * Assign a variant based on allocation strategy
   */
  private assignVariant(experiment: Experiment): Variant | null {
    const strategy =
      experiment.allocationStrategy || this.config.defaultStrategy;
    const variants = experiment.variants.filter((v) => v.weight > 0);

    if (variants.length === 0) return null;

    switch (strategy) {
      case "random":
        return this.randomAssignment(variants);
      case "deterministic":
        return this.deterministicAssignment(experiment.id, variants);
      case "sticky":
      default:
        return this.deterministicAssignment(experiment.id, variants);
    }
  }

  /**
   * Random variant assignment
   */
  private randomAssignment(variants: Variant[]): Variant {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of variants) {
      random -= variant.weight;
      if (random <= 0) return variant;
    }

    return variants[variants.length - 1];
  }

  /**
   * Deterministic variant assignment (same user always gets same variant)
   */
  private deterministicAssignment(
    experimentId: string,
    variants: Variant[],
  ): Variant {
    const hashKey = `${experimentId}:${this.userId || this.sessionId}`;
    const hash = this.hashString(hashKey);
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let bucket = (hash % totalWeight) + 1;

    for (const variant of variants) {
      bucket -= variant.weight;
      if (bucket <= 0) return variant;
    }

    return variants[variants.length - 1];
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  /**
   * Check if user matches targeting rules
   */
  private matchesTargeting(
    targeting: NonNullable<Experiment["targeting"]>,
  ): boolean {
    // Check user IDs
    if (targeting.userIds && this.userId) {
      if (!targeting.userIds.includes(this.userId)) {
        return false;
      }
    }

    // Check percentage
    if (targeting.percentage !== undefined && targeting.percentage < 100) {
      const hash = this.hashString(this.userId || this.sessionId);
      const bucket = (hash % 100) + 1;
      if (bucket > targeting.percentage) {
        return false;
      }
    }

    // Check device type
    if (targeting.devices && typeof window !== "undefined") {
      const deviceType = this.getDeviceType();
      if (!targeting.devices.includes(deviceType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get device type
   */
  private getDeviceType(): "mobile" | "tablet" | "desktop" {
    if (typeof window === "undefined") return "desktop";

    const width = window.innerWidth;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }

  /**
   * Track an experiment exposure
   */
  private trackExposure(
    experimentId: string,
    variantId: string,
    context?: string,
  ): void {
    const exposure: ExperimentExposure = {
      experimentId,
      variantId,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      context,
    };

    this.pendingEvents.push(exposure);
  }

  /**
   * Track a conversion event
   */
  async trackConversion(
    experimentId: string,
    metricId: string,
    value?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const assignment = this.assignments.get(experimentId);
    if (!assignment) return;

    const conversion: ExperimentConversion = {
      experimentId,
      variantId: assignment.variantId,
      metricId,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      value,
      metadata,
    };

    this.pendingEvents.push(conversion);
  }

  /**
   * Force an experiment assignment (for testing)
   */
  forceVariant(experimentId: string, variantId: string): void {
    const assignment: ExperimentAssignment = {
      experimentId,
      variantId,
      assignedAt: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      forced: true,
    };

    this.assignments.set(experimentId, assignment);
    this.saveAssignmentsToStorage();
  }

  /**
   * Clear a forced assignment
   */
  clearForce(experimentId: string): void {
    const assignment = this.assignments.get(experimentId);
    if (assignment?.forced) {
      this.assignments.delete(experimentId);
      this.saveAssignmentsToStorage();
    }
  }

  /**
   * Get current assignments
   */
  getAssignments(): ExperimentAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Get experiment results from the API
   */
  async getResults(experimentId: string): Promise<ExperimentResults | null> {
    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/experiments/${experimentId}/results`,
      );
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.warn(
        `[ExperimentService] Failed to fetch results for ${experimentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.experimentCache.clear();
    this.flagCache.clear();
  }

  /**
   * Force sync pending events
   */
  async forceSync(): Promise<void> {
    await this.syncEvents();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopEventSync();
    this.syncEvents(); // Final sync attempt
  }
}

/**
 * Singleton instance
 */
export const experimentService = new ExperimentService();

/**
 * Create a new experiment service instance with custom config
 */
export function createExperimentService(
  config: Partial<ExperimentConfig>,
): ExperimentService {
  return new ExperimentService(config);
}

// Re-export types
export type {
  Experiment,
  Variant,
  ExperimentAssignment,
  ExperimentExposure,
  ExperimentConversion,
  ExperimentResults,
  FeatureFlag,
  ExperimentConfig,
  AllocationStrategy,
};
