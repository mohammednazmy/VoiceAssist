/**
 * Accessibility Settings - Phase 12: Accessibility & Compliance
 *
 * User-facing accessibility preferences panel.
 * Allows users to customize their accessibility experience.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

// Accessibility settings interface
export interface AccessibilitySettingsState {
  // Motion
  reduceMotion: boolean;

  // Visual
  highContrast: boolean;
  largeText: boolean;
  dyslexicFont: boolean;

  // Audio
  screenReaderMode: boolean;
  audioDescriptions: boolean;

  // Keyboard
  keyboardShortcuts: boolean;
  focusHighlight: boolean;

  // Other
  prefersReducedData: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettingsState = {
  reduceMotion: false,
  highContrast: false,
  largeText: false,
  dyslexicFont: false,
  screenReaderMode: false,
  audioDescriptions: false,
  keyboardShortcuts: true,
  focusHighlight: true,
  prefersReducedData: false,
};

const STORAGE_KEY = "voiceassist-accessibility-settings";

interface AccessibilityContextValue {
  settings: AccessibilitySettingsState;
  updateSetting: <K extends keyof AccessibilitySettingsState>(
    key: K,
    value: AccessibilitySettingsState[K],
  ) => void;
  resetSettings: () => void;
}

const AccessibilityContext = createContext<
  AccessibilityContextValue | undefined
>(undefined);

// Load settings from storage
function loadSettings(): AccessibilitySettingsState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to load accessibility settings:", e);
  }

  // Check system preferences
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const prefersHighContrast = window.matchMedia(
    "(prefers-contrast: more)",
  ).matches;

  return {
    ...DEFAULT_SETTINGS,
    reduceMotion: prefersReducedMotion,
    highContrast: prefersHighContrast,
  };
}

// Save settings to storage
function saveSettings(settings: AccessibilitySettingsState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save accessibility settings:", e);
  }
}

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export function AccessibilityProvider({
  children,
}: AccessibilityProviderProps) {
  const [settings, setSettings] =
    useState<AccessibilitySettingsState>(loadSettings);

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement;

    // Reduced motion
    root.classList.toggle("reduce-motion", settings.reduceMotion);

    // High contrast
    root.classList.toggle("high-contrast", settings.highContrast);

    // Large text
    root.classList.toggle("large-text", settings.largeText);

    // Dyslexic font
    root.classList.toggle("dyslexic-font", settings.dyslexicFont);

    // Focus highlight
    root.classList.toggle("focus-highlight", settings.focusHighlight);

    // Save settings
    saveSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof AccessibilitySettingsState>(
      key: K,
      value: AccessibilitySettingsState[K],
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AccessibilityContext.Provider
      value={{ settings, updateSetting, resetSettings }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilitySettings(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);

  if (!context) {
    // Return no-op functions if used outside provider
    return {
      settings: DEFAULT_SETTINGS,
      updateSetting: () => {},
      resetSettings: () => {},
    };
  }

  return context;
}

// Settings Panel Component
interface AccessibilitySettingsPanelProps {
  className?: string;
  onClose?: () => void;
}

export function AccessibilitySettings({
  className = "",
  onClose,
}: AccessibilitySettingsPanelProps) {
  const { settings, updateSetting, resetSettings } = useAccessibilitySettings();

  const settingSections = [
    {
      title: "Motion",
      settings: [
        {
          key: "reduceMotion" as const,
          label: "Reduce motion",
          description: "Minimize animations and transitions",
        },
      ],
    },
    {
      title: "Visual",
      settings: [
        {
          key: "highContrast" as const,
          label: "High contrast",
          description: "Increase contrast for better visibility",
        },
        {
          key: "largeText" as const,
          label: "Large text",
          description: "Increase font sizes throughout the app",
        },
        {
          key: "dyslexicFont" as const,
          label: "Dyslexic-friendly font",
          description: "Use OpenDyslexic font for easier reading",
        },
      ],
    },
    {
      title: "Keyboard & Focus",
      settings: [
        {
          key: "keyboardShortcuts" as const,
          label: "Keyboard shortcuts",
          description: "Enable keyboard shortcuts for common actions",
        },
        {
          key: "focusHighlight" as const,
          label: "Enhanced focus indicators",
          description: "Show more visible focus outlines",
        },
      ],
    },
    {
      title: "Screen Reader",
      settings: [
        {
          key: "screenReaderMode" as const,
          label: "Screen reader mode",
          description: "Optimize interface for screen readers",
        },
        {
          key: "audioDescriptions" as const,
          label: "Audio descriptions",
          description: "Play audio descriptions for visual content",
        },
      ],
    },
  ];

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 max-w-md ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">
          Accessibility Settings
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-neutral-700 rounded-md hover:bg-neutral-100"
            aria-label="Close accessibility settings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-6">
        {settingSections.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-medium text-neutral-700 mb-3">
              {section.title}
            </h3>
            <div className="space-y-3">
              {section.settings.map((setting) => (
                <label
                  key={setting.key}
                  className="flex items-start space-x-3 cursor-pointer"
                >
                  <div className="flex items-center h-5">
                    <input
                      type="checkbox"
                      checked={settings[setting.key]}
                      onChange={(e) =>
                        updateSetting(setting.key, e.target.checked)
                      }
                      className="
                        h-4 w-4 rounded border-neutral-300 text-primary-600
                        focus:ring-primary-500 focus:ring-offset-2
                      "
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-neutral-900">
                      {setting.label}
                    </span>
                    <p className="text-xs text-neutral-500">
                      {setting.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-neutral-200">
        <button
          onClick={resetSettings}
          className="text-sm text-neutral-600 hover:text-neutral-800"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export default AccessibilitySettings;
