/**
 * Feature Flag Test Helpers
 *
 * Utilities for testing components with feature flags.
 * Allows overriding feature flags in tests without hitting the backend.
 *
 * @example
 * ```typescript
 * import { setFeatureFlags, resetFeatureFlags } from '@/test/featureFlagHelpers';
 * import { UI_FLAGS } from '@/lib/featureFlags';
 *
 * describe('UnifiedChatVoice', () => {
 *   beforeEach(() => {
 *     setFeatureFlags({ [UI_FLAGS.UNIFIED_CHAT_VOICE]: true });
 *   });
 *
 *   afterEach(() => {
 *     resetFeatureFlags();
 *   });
 *
 *   it('renders unified interface when flag is enabled', () => {
 *     // Component will see flag as enabled
 *   });
 * });
 * ```
 */

import { vi } from "vitest";
import type { UIFlagKey } from "../lib/featureFlags";
import { UI_FLAG_DEFAULTS } from "../lib/featureFlags";

/**
 * Storage for overridden feature flag values
 */
let flagOverrides: Map<string, boolean> = new Map();

/**
 * Whether we're in test mode with overrides active
 */
let overridesActive = false;

/**
 * Original experimentService.isFeatureEnabled reference
 */
let originalIsFeatureEnabled: ((flagKey: string) => Promise<boolean>) | null =
  null;

/**
 * Set feature flag overrides for testing
 *
 * @param flags - Object mapping flag keys to their test values
 *
 * @example
 * setFeatureFlags({
 *   unified_chat_voice_ui: true,
 *   new_navigation: false,
 * });
 */
export function setFeatureFlags(
  flags: Partial<Record<UIFlagKey, boolean>>,
): void {
  Object.entries(flags).forEach(([key, value]) => {
    flagOverrides.set(key, value);
  });
  overridesActive = true;
}

/**
 * Enable a single feature flag for testing
 *
 * @param flagKey - The flag key to enable
 *
 * @example
 * enableFeatureFlag(UI_FLAGS.UNIFIED_CHAT_VOICE);
 */
export function enableFeatureFlag(flagKey: UIFlagKey): void {
  flagOverrides.set(flagKey, true);
  overridesActive = true;
}

/**
 * Disable a single feature flag for testing
 *
 * @param flagKey - The flag key to disable
 *
 * @example
 * disableFeatureFlag(UI_FLAGS.UNIFIED_CHAT_VOICE);
 */
export function disableFeatureFlag(flagKey: UIFlagKey): void {
  flagOverrides.set(flagKey, false);
  overridesActive = true;
}

/**
 * Reset all feature flag overrides
 *
 * Call this in afterEach() to clean up between tests.
 *
 * @example
 * afterEach(() => {
 *   resetFeatureFlags();
 * });
 */
export function resetFeatureFlags(): void {
  flagOverrides.clear();
  overridesActive = false;
}

/**
 * Get the test value for a feature flag
 *
 * Returns the override value if set, otherwise the default.
 * This is used internally by the mocked experimentService.
 *
 * @param flagKey - The flag key to check
 * @returns The test value for the flag
 */
export function getTestFlagValue(flagKey: string): boolean {
  if (flagOverrides.has(flagKey)) {
    return flagOverrides.get(flagKey)!;
  }
  return UI_FLAG_DEFAULTS[flagKey as UIFlagKey] ?? false;
}

/**
 * Check if feature flag overrides are active
 */
export function areOverridesActive(): boolean {
  return overridesActive;
}

/**
 * Mock the experimentService for testing
 *
 * This mocks the experimentService.isFeatureEnabled method to use
 * test overrides instead of calling the backend.
 *
 * Call this in your test setup (e.g., beforeAll or test/setup.ts).
 *
 * @example
 * // In test/setup.ts or beforeAll
 * mockExperimentService();
 *
 * // In your test
 * setFeatureFlags({ unified_chat_voice_ui: true });
 * // Now useFeatureFlag('unified_chat_voice_ui') returns { isEnabled: true }
 */
export function mockExperimentService(): void {
  // Dynamic import to avoid circular dependencies
  // This will be called at test setup time
  vi.mock("../services/experiments", async (importOriginal) => {
    const original =
      await importOriginal<typeof import("../services/experiments")>();

    return {
      ...original,
      experimentService: {
        ...original.experimentService,
        isFeatureEnabled: vi.fn(async (flagKey: string) => {
          if (areOverridesActive()) {
            return getTestFlagValue(flagKey);
          }
          // Return default if no override
          return UI_FLAG_DEFAULTS[flagKey as UIFlagKey] ?? false;
        }),
      },
    };
  });
}

/**
 * Create a mock useFeatureFlag hook for testing
 *
 * Returns a hook implementation that uses test overrides.
 * Useful for mocking the hook directly in specific tests.
 *
 * @example
 * vi.mock('@/hooks/useExperiment', () => ({
 *   useFeatureFlag: createMockUseFeatureFlag(),
 * }));
 */
export function createMockUseFeatureFlag() {
  return (flagKey: string) => ({
    isEnabled: getTestFlagValue(flagKey),
    isLoading: false,
    refresh: vi.fn(),
  });
}

/**
 * Enable all UI feature flags for testing
 *
 * Useful for testing full new UI without specifying each flag.
 *
 * @example
 * beforeEach(() => {
 *   enableAllUIFlags();
 * });
 */
export function enableAllUIFlags(): void {
  Object.keys(UI_FLAG_DEFAULTS).forEach((key) => {
    flagOverrides.set(key, true);
  });
  overridesActive = true;
}

/**
 * Disable all UI feature flags for testing
 *
 * Useful for testing legacy UI behavior.
 *
 * @example
 * beforeEach(() => {
 *   disableAllUIFlags();
 * });
 */
export function disableAllUIFlags(): void {
  Object.keys(UI_FLAG_DEFAULTS).forEach((key) => {
    flagOverrides.set(key, false);
  });
  overridesActive = true;
}

/**
 * Get all current feature flag test values
 *
 * Useful for debugging test state.
 *
 * @returns Object with all flag values
 */
export function getAllTestFlagValues(): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  // Start with defaults
  Object.entries(UI_FLAG_DEFAULTS).forEach(([key, value]) => {
    result[key] = value;
  });

  // Apply overrides
  flagOverrides.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}
