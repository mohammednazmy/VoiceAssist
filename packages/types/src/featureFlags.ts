/**
 * VoiceAssist Feature Flag Shared Definitions
 *
 * Single source of truth for feature flag definitions.
 * These definitions are used across all applications (web-app, admin-panel, api-gateway).
 *
 * Naming Convention: {category}.{feature_name}
 * - category: ui | backend | admin | integration | experiment | ops
 * - feature_name: snake_case identifier
 *
 * Example: ui.unified_chat_voice, backend.rag_strategy, ops.maintenance_mode
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Unified categories for feature flags.
 * Must match Python FlagCategory enum exactly.
 */
export const FLAG_CATEGORIES = [
  "ui",
  "backend",
  "admin",
  "integration",
  "experiment",
  "ops",
] as const;

export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

/**
 * Feature flag value types.
 */
export const FLAG_TYPES = [
  "boolean",
  "string",
  "number",
  "json",
  "multivariate",
] as const;

export type FlagType = (typeof FLAG_TYPES)[number];

/**
 * Criticality levels for feature flags.
 */
export type FlagCriticality = "low" | "medium" | "high" | "critical";

/**
 * Feature flag dependencies.
 */
export interface FlagDependencies {
  /** Services that use this flag */
  services: string[];
  /** UI components that depend on this flag */
  components: string[];
  /** Other flags this flag depends on or affects */
  otherFlags: string[];
}

/**
 * Feature flag metadata.
 */
export interface FlagMetadata {
  /** Criticality level for the flag */
  criticality: FlagCriticality;
  /** Team or person responsible for this flag */
  owner?: string;
  /** URL to documentation about this flag */
  docsUrl?: string;
  /** Whether this flag is deprecated */
  deprecated?: boolean;
  /** Deprecation message with migration instructions */
  deprecatedMessage?: string;
  /** Whether this flag has been archived */
  archived?: boolean;
  /** Allowed values for string flags */
  allowedValues?: string[];
  /** Minimum value for number flags */
  min?: number;
  /** Maximum value for number flags */
  max?: number;
}

/**
 * Complete feature flag definition.
 */
export interface FeatureFlagDefinition {
  /** Full flag name with category prefix (e.g., "ui.unified_chat_voice") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping flags */
  category: FlagCategory;
  /** Type of flag value */
  type: FlagType;
  /** Default value when flag doesn't exist */
  defaultValue: unknown;
  /** Whether flag is enabled by default */
  defaultEnabled: boolean;
  /** Flag metadata */
  metadata: FlagMetadata;
  /** Dependencies for impact analysis */
  dependencies?: FlagDependencies;
}

// ============================================================================
// Feature Flag Definitions - Single Source of Truth
// ============================================================================

/**
 * All feature flags organized by category.
 * This is the single source of truth for flag definitions.
 */
export const FEATURE_FLAGS = {
  // -------------------------------------------------------------------------
  // UI Flags - Frontend toggles
  // -------------------------------------------------------------------------
  ui: {
    unified_chat_voice: {
      name: "ui.unified_chat_voice",
      description: "Enable unified chat and voice interface",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        docsUrl: "https://assistdocs.asimo.io/admin/feature-flags#ui",
      },
      dependencies: {
        services: ["web-app"],
        components: ["VoiceChat", "ChatInterface", "UnifiedChatContainer"],
        otherFlags: [],
      },
    },
    new_navigation: {
      name: "ui.new_navigation",
      description: "Enable new sidebar navigation layout",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app", "admin-panel"],
        components: ["Sidebar", "Navigation"],
        otherFlags: [],
      },
    },
    beta_features: {
      name: "ui.beta_features",
      description: "Enable beta/experimental UI features",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app"],
        components: [],
        otherFlags: [],
      },
    },
    dark_mode: {
      name: "ui.dark_mode",
      description: "Enable dark mode theme option",
      category: "ui" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app", "admin-panel"],
        components: ["ThemeProvider", "SettingsPanel"],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Backend Flags - API/service behavior
  // -------------------------------------------------------------------------
  backend: {
    rbac_enforcement: {
      name: "backend.rbac_enforcement",
      description: "Enable RBAC permission checks on admin endpoints",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
        owner: "security-team",
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["backend.rbac_strict_mode"],
      },
    },
    rbac_strict_mode: {
      name: "backend.rbac_strict_mode",
      description: "Enable strict RBAC mode (deny by default)",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "medium" as const,
        owner: "security-team",
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["backend.rbac_enforcement"],
      },
    },
    rag_strategy: {
      name: "backend.rag_strategy",
      description: "RAG query strategy (simple, multi_hop, hybrid)",
      category: "backend" as const,
      type: "string" as const,
      defaultValue: "simple",
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
        allowedValues: ["simple", "multi_hop", "hybrid"],
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    rag_max_results: {
      name: "backend.rag_max_results",
      description: "Maximum number of RAG search results to return",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 5,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        min: 1,
        max: 20,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    rag_score_threshold: {
      name: "backend.rag_score_threshold",
      description: "Minimum similarity score threshold for RAG results",
      category: "backend" as const,
      type: "number" as const,
      defaultValue: 0.2,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
        min: 0.0,
        max: 1.0,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    cache_enabled: {
      name: "backend.cache_enabled",
      description: "Enable multi-level caching (L1/L2)",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    async_indexing: {
      name: "backend.async_indexing",
      description: "Enable asynchronous document indexing",
      category: "backend" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Admin Flags - Admin panel features
  // -------------------------------------------------------------------------
  admin: {
    bulk_operations: {
      name: "admin.bulk_operations",
      description: "Enable bulk operations in admin panel",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["admin-panel"],
        components: ["BulkActionsToolbar", "DataTable"],
        otherFlags: [],
      },
    },
    advanced_analytics: {
      name: "admin.advanced_analytics",
      description: "Enable advanced analytics dashboard",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["admin-panel", "api-gateway"],
        components: ["AnalyticsDashboard"],
        otherFlags: [],
      },
    },
    audit_log_export: {
      name: "admin.audit_log_export",
      description: "Enable audit log export functionality",
      category: "admin" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: true,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["admin-panel", "api-gateway"],
        components: ["AuditLogPanel"],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Integration Flags - External services
  // -------------------------------------------------------------------------
  integration: {
    nextcloud: {
      name: "integration.nextcloud",
      description: "Enable Nextcloud integration features",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["integration.nextcloud_auto_index"],
      },
    },
    nextcloud_auto_index: {
      name: "integration.nextcloud_auto_index",
      description: "Enable automatic indexing of Nextcloud files",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: ["integration.nextcloud"],
      },
    },
    openai: {
      name: "integration.openai",
      description: "Enable OpenAI API for RAG queries",
      category: "integration" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Experiment Flags - A/B tests and experiments
  // -------------------------------------------------------------------------
  experiment: {
    onboarding_v2: {
      name: "experiment.onboarding_v2",
      description: "A/B test for new onboarding flow",
      category: "experiment" as const,
      type: "boolean" as const,
      defaultValue: null,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["web-app"],
        components: ["OnboardingWizard"],
        otherFlags: [],
      },
    },
    experimental_api: {
      name: "experiment.experimental_api",
      description: "Enable experimental API endpoints",
      category: "experiment" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },

  // -------------------------------------------------------------------------
  // Ops Flags - Operational controls
  // -------------------------------------------------------------------------
  ops: {
    maintenance_mode: {
      name: "ops.maintenance_mode",
      description: "Enable maintenance mode (read-only access)",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "critical" as const,
        owner: "ops-team",
      },
      dependencies: {
        services: ["api-gateway", "web-app", "admin-panel"],
        components: [],
        otherFlags: [],
      },
    },
    rate_limiting: {
      name: "ops.rate_limiting",
      description: "Enable API rate limiting",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "high" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    metrics_enabled: {
      name: "ops.metrics_enabled",
      description: "Enable Prometheus metrics collection",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    tracing_enabled: {
      name: "ops.tracing_enabled",
      description: "Enable OpenTelemetry distributed tracing",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: true,
      defaultEnabled: true,
      metadata: {
        criticality: "medium" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
    verbose_logging: {
      name: "ops.verbose_logging",
      description: "Enable verbose logging (debug level)",
      category: "ops" as const,
      type: "boolean" as const,
      defaultValue: false,
      defaultEnabled: false,
      metadata: {
        criticality: "low" as const,
      },
      dependencies: {
        services: ["api-gateway"],
        components: [],
        otherFlags: [],
      },
    },
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all feature flag definitions as a flat array.
 */
export function getAllFlags(): FeatureFlagDefinition[] {
  const allFlags: FeatureFlagDefinition[] = [];

  for (const category of FLAG_CATEGORIES) {
    const categoryFlags = FEATURE_FLAGS[category];
    if (categoryFlags) {
      for (const flag of Object.values(categoryFlags)) {
        allFlags.push(flag as FeatureFlagDefinition);
      }
    }
  }

  return allFlags;
}

/**
 * Get a flag definition by its full name.
 * @param name Full flag name (e.g., "ui.unified_chat_voice")
 */
export function getFlagByName(name: string): FeatureFlagDefinition | undefined {
  const [category, flagName] = name.split(".", 2);

  if (!category || !flagName) {
    return undefined;
  }

  const categoryFlags = FEATURE_FLAGS[category as FlagCategory];
  if (!categoryFlags) {
    return undefined;
  }

  return (categoryFlags as Record<string, FeatureFlagDefinition>)[flagName];
}

/**
 * Get all flag definitions for a specific category.
 */
export function getFlagsByCategory(
  category: FlagCategory,
): FeatureFlagDefinition[] {
  const categoryFlags = FEATURE_FLAGS[category];
  if (!categoryFlags) {
    return [];
  }

  return Object.values(categoryFlags) as FeatureFlagDefinition[];
}

/**
 * Validate a flag name matches the naming convention.
 * Pattern: {category}.{snake_case_name}
 */
export function isValidFlagName(name: string): boolean {
  const pattern =
    /^(ui|backend|admin|integration|experiment|ops)\.[a-z][a-z0-9_]*$/;
  return pattern.test(name);
}

/**
 * Get flag names grouped by category.
 */
export function getFlagNamesByCategory(): Record<FlagCategory, string[]> {
  const result: Record<FlagCategory, string[]> = {
    ui: [],
    backend: [],
    admin: [],
    integration: [],
    experiment: [],
    ops: [],
  };

  for (const category of FLAG_CATEGORIES) {
    const categoryFlags = FEATURE_FLAGS[category];
    if (categoryFlags) {
      result[category] = Object.values(categoryFlags).map(
        (f) => (f as FeatureFlagDefinition).name,
      );
    }
  }

  return result;
}

// ============================================================================
// Legacy Compatibility - Map old flag names to new names
// ============================================================================

/**
 * Map of old flag names to new dot-based names.
 * Used for migration from old naming convention.
 */
export const LEGACY_FLAG_NAME_MAP: Record<string, string> = {
  // Old name -> New name
  rbac_enforcement: "backend.rbac_enforcement",
  rbac_strict_mode: "backend.rbac_strict_mode",
  metrics_enabled: "ops.metrics_enabled",
  tracing_enabled: "ops.tracing_enabled",
  logging_verbose: "ops.verbose_logging",
  nextcloud_integration: "integration.nextcloud",
  openai_enabled: "integration.openai",
  nextcloud_auto_index: "integration.nextcloud_auto_index",
  rag_strategy: "backend.rag_strategy",
  rag_max_results: "backend.rag_max_results",
  rag_score_threshold: "backend.rag_score_threshold",
  cache_enabled: "backend.cache_enabled",
  async_indexing: "backend.async_indexing",
  beta_features: "ui.beta_features",
  experimental_api: "experiment.experimental_api",
};

/**
 * Resolve a flag name, handling legacy names.
 * @param name Flag name (old or new format)
 * @returns Resolved flag name in new format
 */
export function resolveFlagName(name: string): string {
  // If it's already in new format, return as-is
  if (name.includes(".")) {
    return name;
  }

  // Check if it's a legacy name
  return LEGACY_FLAG_NAME_MAP[name] || name;
}
