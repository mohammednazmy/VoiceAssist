/**
 * Preference Store
 *
 * Persists and manages user barge-in preferences with
 * local and optional backend synchronization.
 *
 * Phase 8: Adaptive Personalization
 */

import type {
  UserBargeInPreferences,
  CalibrationResult,
  FeedbackPreferences,
  BackchannelFrequency,
  PersonalizationConfig,
} from "./types";
import {
  DEFAULT_FEEDBACK_PREFERENCES,
  DEFAULT_PERSONALIZATION_CONFIG,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Backend sync response
 */
interface SyncResponse {
  success: boolean;
  preferences?: UserBargeInPreferences;
  serverTimestamp?: number;
  error?: string;
}

/**
 * Preference change listener
 */
type PreferenceChangeListener = (
  preferences: UserBargeInPreferences,
  changedKeys: string[],
) => void;

// ============================================================================
// Preference Store
// ============================================================================

/**
 * Manages persistence and synchronization of user preferences
 */
export class PreferenceStore {
  private config: PersonalizationConfig;

  /** Current preferences */
  private preferences: UserBargeInPreferences | null = null;

  /** User ID */
  private userId: string;

  /** Storage key */
  private readonly storageKey: string;

  /** Backend sync endpoint */
  private syncEndpoint: string | null = null;

  /** Sync timer */
  private syncTimer: number | null = null;

  /** Change listeners */
  private listeners: Set<PreferenceChangeListener> = new Set();

  /** Pending changes for batched sync */
  private pendingChanges: Set<string> = new Set();

  /** Last sync time */
  private lastSyncTime: number = 0;

  constructor(
    userId: string = "anonymous",
    config: Partial<PersonalizationConfig> = {},
  ) {
    this.userId = userId;
    this.config = { ...DEFAULT_PERSONALIZATION_CONFIG, ...config };
    this.storageKey = `voiceassist_prefs_${userId}`;

    // Load from local storage
    this.loadFromStorage();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize with optional backend sync
   */
  async initialize(syncEndpoint?: string): Promise<UserBargeInPreferences> {
    this.syncEndpoint = syncEndpoint || null;

    // Try to sync with backend if available
    if (this.syncEndpoint && this.config.syncWithBackend) {
      await this.syncWithBackend();
    }

    // Start periodic sync
    if (this.syncEndpoint && this.config.syncWithBackend) {
      this.startPeriodicSync();
    }

    return this.getPreferences();
  }

  // ==========================================================================
  // Preference Access
  // ==========================================================================

  /**
   * Get current preferences
   */
  getPreferences(): UserBargeInPreferences {
    if (!this.preferences) {
      this.preferences = this.createDefaultPreferences();
    }
    return { ...this.preferences };
  }

  /**
   * Get specific preference value
   */
  get<K extends keyof UserBargeInPreferences>(
    key: K,
  ): UserBargeInPreferences[K] {
    return this.getPreferences()[key];
  }

  // ==========================================================================
  // Preference Updates
  // ==========================================================================

  /**
   * Update preferences
   */
  update(updates: Partial<UserBargeInPreferences>): UserBargeInPreferences {
    const changedKeys: string[] = [];

    // Ensure preferences exist
    if (!this.preferences) {
      this.preferences = this.createDefaultPreferences();
    }

    // Apply updates and track changes
    for (const [key, value] of Object.entries(updates)) {
      const typedKey = key as keyof UserBargeInPreferences;
      if (this.preferences[typedKey] !== value) {
        // Use Object.assign for type-safe property assignment
        Object.assign(this.preferences, { [key]: value });
        changedKeys.push(key);
        this.pendingChanges.add(key);
      }
    }

    if (changedKeys.length > 0) {
      this.preferences.lastUpdated = Date.now();

      // Save locally
      this.saveToStorage();

      // Notify listeners
      this.notifyListeners(changedKeys);

      // Schedule sync
      this.scheduleSyncIfNeeded();
    }

    return this.getPreferences();
  }

  /**
   * Set VAD sensitivity
   */
  setVadSensitivity(sensitivity: number): void {
    this.update({
      vadSensitivity: Math.max(0, Math.min(1, sensitivity)),
    });
  }

  /**
   * Set silence threshold
   */
  setSilenceThreshold(threshold: number): void {
    this.update({
      silenceThreshold: Math.max(0, Math.min(1, threshold)),
    });
  }

  /**
   * Set preferred language
   */
  setPreferredLanguage(language: string): void {
    this.update({ preferredLanguage: language });
  }

  /**
   * Set backchannel frequency
   */
  setBackchannelFrequency(frequency: BackchannelFrequency): void {
    this.update({ backchannelFrequency: frequency });
  }

  /**
   * Update feedback preferences
   */
  updateFeedbackPreferences(updates: Partial<FeedbackPreferences>): void {
    const currentFeedback = this.preferences?.feedbackPreferences || {
      ...DEFAULT_FEEDBACK_PREFERENCES,
    };
    this.update({
      feedbackPreferences: { ...currentFeedback, ...updates },
    });
  }

  /**
   * Add calibration result
   */
  addCalibrationResult(result: CalibrationResult): void {
    const history = [...(this.preferences?.calibrationHistory || [])];
    history.push(result);

    // Limit history size
    while (history.length > this.config.maxCalibrationHistory) {
      history.shift();
    }

    this.update({
      calibrationHistory: history,
      vadSensitivity: result.recommendedVadThreshold,
      silenceThreshold: result.recommendedSilenceThreshold,
    });
  }

  /**
   * Add custom backchannel phrase
   */
  addCustomBackchannel(phrase: string): void {
    const current = this.preferences?.customBackchannels || [];
    if (!current.includes(phrase)) {
      this.update({
        customBackchannels: [...current, phrase],
      });
    }
  }

  /**
   * Remove custom backchannel phrase
   */
  removeCustomBackchannel(phrase: string): void {
    const current = this.preferences?.customBackchannels || [];
    this.update({
      customBackchannels: current.filter((p) => p !== phrase),
    });
  }

  // ==========================================================================
  // Change Listeners
  // ==========================================================================

  /**
   * Subscribe to preference changes
   */
  onChange(listener: PreferenceChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(changedKeys: string[]): void {
    const prefs = this.getPreferences();
    this.listeners.forEach((listener) => listener(prefs, changedKeys));
  }

  // ==========================================================================
  // Backend Sync
  // ==========================================================================

  /**
   * Sync preferences with backend
   */
  async syncWithBackend(): Promise<boolean> {
    if (!this.syncEndpoint) return false;

    try {
      const response = await fetch(this.syncEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: this.userId,
          preferences: this.preferences,
          changedKeys: Array.from(this.pendingChanges),
          clientTimestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const result: SyncResponse = await response.json();

      if (result.success) {
        // Merge server preferences if newer
        if (
          result.preferences &&
          result.preferences.lastUpdated > (this.preferences?.lastUpdated || 0)
        ) {
          this.preferences = result.preferences;
          this.saveToStorage();
          this.notifyListeners(Object.keys(result.preferences));
        }

        this.pendingChanges.clear();
        this.lastSyncTime = Date.now();
        return true;
      }

      return false;
    } catch (error) {
      console.warn("[PreferenceStore] Sync failed:", error);
      return false;
    }
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = window.setInterval(() => {
      if (this.pendingChanges.size > 0) {
        this.syncWithBackend();
      }
    }, this.config.syncInterval);
  }

  /**
   * Stop periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.syncTimer) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Schedule sync if needed
   */
  private scheduleSyncIfNeeded(): void {
    if (!this.syncEndpoint || !this.config.syncWithBackend) return;

    // Debounce: sync after 5 seconds of no changes
    const debounceMs = 5000;
    setTimeout(() => {
      if (this.pendingChanges.size > 0) {
        this.syncWithBackend();
      }
    }, debounceMs);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save to local storage
   */
  private saveToStorage(): void {
    if (!this.preferences) return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch (error) {
      console.warn("[PreferenceStore] Failed to save:", error);
    }
  }

  /**
   * Load from local storage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate and merge with defaults
        this.preferences = {
          ...this.createDefaultPreferences(),
          ...parsed,
        };
      }
    } catch (error) {
      console.warn("[PreferenceStore] Failed to load:", error);
    }
  }

  /**
   * Create default preferences
   */
  private createDefaultPreferences(): UserBargeInPreferences {
    return {
      userId: this.userId,
      vadSensitivity: 0.5,
      silenceThreshold: 0.35,
      preferredLanguage: "en",
      backchannelFrequency: "normal",
      feedbackPreferences: { ...DEFAULT_FEEDBACK_PREFERENCES },
      calibrationHistory: [],
      lastUpdated: Date.now(),
      customBackchannels: [],
      interruptionMode: "balanced",
      adaptiveLearning: true,
    };
  }

  // ==========================================================================
  // Export/Import
  // ==========================================================================

  /**
   * Export preferences as JSON
   */
  export(): string {
    return JSON.stringify(this.getPreferences(), null, 2);
  }

  /**
   * Import preferences from JSON
   */
  import(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      if (imported.userId !== this.userId) {
        console.warn("[PreferenceStore] User ID mismatch, adjusting...");
        imported.userId = this.userId;
      }
      this.preferences = {
        ...this.createDefaultPreferences(),
        ...imported,
        lastUpdated: Date.now(),
      };
      this.saveToStorage();
      this.notifyListeners(Object.keys(imported));
      return true;
    } catch (error) {
      console.error("[PreferenceStore] Import failed:", error);
      return false;
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset to defaults
   */
  reset(): void {
    this.preferences = this.createDefaultPreferences();
    this.pendingChanges.clear();
    this.saveToStorage();
    this.notifyListeners(Object.keys(this.preferences));
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopPeriodicSync();
    this.listeners.clear();

    // Final sync
    if (this.pendingChanges.size > 0) {
      this.syncWithBackend();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PreferenceStore
 */
export function createPreferenceStore(
  userId?: string,
  config?: Partial<PersonalizationConfig>,
): PreferenceStore {
  return new PreferenceStore(userId, config);
}
