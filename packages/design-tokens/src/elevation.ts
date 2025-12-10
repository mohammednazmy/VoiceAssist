/**
 * VoiceAssist Design Tokens - Elevation
 * Semantic elevation system for visual hierarchy and depth
 *
 * Features:
 * - Material Design-inspired elevation levels
 * - Light and dark mode support
 * - Semantic naming for consistent usage
 * - Focus ring styles for accessibility
 *
 * @example
 * ```typescript
 * import { elevation, focusRings } from '@voiceassist/design-tokens';
 *
 * const cardStyles = {
 *   boxShadow: elevation.raised,
 * };
 *
 * const buttonStyles = {
 *   '&:focus-visible': {
 *     boxShadow: focusRings.default,
 *   },
 * };
 * ```
 */

/**
 * Raw Shadow Values
 * Building blocks for elevation system
 */
export const shadowValues = {
  /** No shadow */
  none: "none",
  /** Extra small - subtle depth hint */
  xs: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  /** Small - slight elevation */
  sm: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
  /** Base/Medium - standard card shadow */
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  /** Large - elevated elements */
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  /** Extra large - prominent elements */
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
  /** 2x Extra large - highest elevation */
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  /** Inner shadow - inset elements */
  inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",
} as const;

/**
 * Dark Mode Shadow Values
 * Adjusted for dark backgrounds
 */
export const shadowValuesDark = {
  none: "none",
  xs: "0 1px 2px 0 rgba(0, 0, 0, 0.2)",
  sm: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)",
} as const;

/**
 * Semantic Elevation Levels
 * Use these for consistent depth hierarchy
 *
 * Level 0: Base surface (no elevation)
 * Level 1: Raised elements (cards, panels)
 * Level 2: Overlay elements (dropdowns, tooltips)
 * Level 3: Modal backdrops
 * Level 4: Modal dialogs
 * Level 5: Floating elements (FABs)
 */
export const elevation = {
  /** Level 0: Base surface - no shadow */
  surface: shadowValues.none,
  /** Level 1: Slightly raised - cards, tiles */
  raised: shadowValues.sm,
  /** Level 2: Overlay - dropdowns, tooltips, popovers */
  overlay: shadowValues.md,
  /** Level 3: Elevated - sticky headers, sidebars */
  elevated: shadowValues.lg,
  /** Level 4: Modal - dialogs, sheets */
  modal: shadowValues.xl,
  /** Level 5: Floating - FABs, floating buttons */
  floating: shadowValues["2xl"],
  /** Inset - input fields, pressed states */
  inset: shadowValues.inner,
} as const;

/**
 * Dark Mode Elevation
 */
export const elevationDark = {
  surface: shadowValuesDark.none,
  raised: shadowValuesDark.sm,
  overlay: shadowValuesDark.md,
  elevated: shadowValuesDark.lg,
  modal: shadowValuesDark.xl,
  floating: shadowValuesDark["2xl"],
  inset: shadowValuesDark.inner,
} as const;

/**
 * Focus Ring Styles
 * Accessible focus indicators for interactive elements
 *
 * WCAG 2.1 AA requires:
 * - Focus indicator must be visible
 * - Contrast ratio of at least 3:1
 * - At least 2px outline or equivalent
 */
export const focusRings = {
  /** Default focus ring - primary color */
  default: "0 0 0 3px rgba(59, 130, 246, 0.3)",
  /** Primary focus ring - stronger visibility */
  primary: "0 0 0 3px rgba(59, 130, 246, 0.5)",
  /** Error focus ring - for error states */
  error: "0 0 0 3px rgba(239, 68, 68, 0.3)",
  /** Success focus ring - for success states */
  success: "0 0 0 3px rgba(34, 197, 94, 0.3)",
  /** Warning focus ring - for warning states */
  warning: "0 0 0 3px rgba(245, 158, 11, 0.3)",
  /** Inset focus ring - for inputs */
  inset: "inset 0 0 0 2px rgba(59, 130, 246, 0.5)",
  /** White focus ring - for dark backgrounds */
  white: "0 0 0 3px rgba(255, 255, 255, 0.5)",
  /** None - explicitly no focus ring */
  none: "none",
} as const;

/**
 * Dark Mode Focus Rings
 * Adjusted opacity for dark backgrounds
 */
export const focusRingsDark = {
  default: "0 0 0 3px rgba(96, 165, 250, 0.4)",
  primary: "0 0 0 3px rgba(96, 165, 250, 0.6)",
  error: "0 0 0 3px rgba(248, 113, 113, 0.4)",
  success: "0 0 0 3px rgba(74, 222, 128, 0.4)",
  warning: "0 0 0 3px rgba(251, 191, 36, 0.4)",
  inset: "inset 0 0 0 2px rgba(96, 165, 250, 0.6)",
  white: "0 0 0 3px rgba(255, 255, 255, 0.3)",
  none: "none",
} as const;

/**
 * Component-Specific Shadows
 * Pre-defined shadows for common UI components
 */
export const componentShadows = {
  /** Card - standard content container */
  card: {
    default: shadowValues.sm,
    hover: shadowValues.md,
    active: shadowValues.xs,
  },
  /** Button - interactive elements */
  button: {
    default: shadowValues.xs,
    hover: shadowValues.sm,
    active: shadowValues.none,
    disabled: shadowValues.none,
  },
  /** Input - form fields */
  input: {
    default: shadowValues.none,
    focus: focusRings.inset,
    error: focusRings.error,
  },
  /** Dropdown - menus and selects */
  dropdown: {
    default: shadowValues.lg,
    nested: shadowValues.md,
  },
  /** Modal - dialogs and sheets */
  modal: {
    default: shadowValues.xl,
    backdrop: "0 0 0 100vmax rgba(0, 0, 0, 0.5)",
  },
  /** Toast - notifications */
  toast: {
    default: shadowValues.lg,
    success: `${shadowValues.lg}, inset 0 2px 0 0 rgba(34, 197, 94, 0.5)`,
    error: `${shadowValues.lg}, inset 0 2px 0 0 rgba(239, 68, 68, 0.5)`,
    warning: `${shadowValues.lg}, inset 0 2px 0 0 rgba(245, 158, 11, 0.5)`,
    info: `${shadowValues.lg}, inset 0 2px 0 0 rgba(59, 130, 246, 0.5)`,
  },
  /** Tooltip - contextual help */
  tooltip: {
    default: shadowValues.md,
  },
  /** Popover - interactive overlays */
  popover: {
    default: shadowValues.lg,
  },
  /** Sidebar - navigation panels */
  sidebar: {
    default: shadowValues.lg,
    collapsed: shadowValues.sm,
  },
  /** Header - sticky navigation */
  header: {
    default: shadowValues.sm,
    scrolled: shadowValues.md,
  },
  /** Fab - floating action button */
  fab: {
    default: shadowValues.xl,
    hover: shadowValues["2xl"],
    active: shadowValues.lg,
  },
} as const;

/**
 * Medical-Specific Component Shadows
 * Shadows for healthcare UI components
 */
export const medicalComponentShadows = {
  /** Vital sign card - patient monitoring */
  vitalSign: {
    normal: shadowValues.sm,
    warning: `${shadowValues.sm}, 0 0 0 2px rgba(245, 158, 11, 0.3)`,
    critical: `${shadowValues.md}, 0 0 0 2px rgba(239, 68, 68, 0.5)`,
  },
  /** Alert banner - clinical alerts */
  alert: {
    info: `${shadowValues.sm}, inset 4px 0 0 0 rgba(59, 130, 246, 1)`,
    warning: `${shadowValues.sm}, inset 4px 0 0 0 rgba(245, 158, 11, 1)`,
    critical: `${shadowValues.md}, inset 4px 0 0 0 rgba(239, 68, 68, 1)`,
    success: `${shadowValues.sm}, inset 4px 0 0 0 rgba(34, 197, 94, 1)`,
  },
  /** Medication card - drug information */
  medication: {
    default: shadowValues.sm,
    interaction: `${shadowValues.sm}, 0 0 0 2px rgba(245, 158, 11, 0.4)`,
    contraindicated: `${shadowValues.sm}, 0 0 0 2px rgba(239, 68, 68, 0.4)`,
  },
  /** Timeline - patient history */
  timeline: {
    default: shadowValues.xs,
    active: shadowValues.sm,
  },
  /** Recording indicator - voice input */
  recording: {
    default: "0 0 0 4px rgba(239, 68, 68, 0.2)",
    active: "0 0 0 8px rgba(239, 68, 68, 0.3)",
  },
} as const;

/**
 * Type Exports
 */
export type ShadowValue = keyof typeof shadowValues;
export type ElevationLevel = keyof typeof elevation;
export type FocusRing = keyof typeof focusRings;
export type ComponentShadow = keyof typeof componentShadows;
export type MedicalComponentShadow = keyof typeof medicalComponentShadows;

/**
 * Helper function to combine shadows
 */
export function combineShadows(...shadows: string[]): string {
  return shadows.filter((s) => s && s !== "none").join(", ") || "none";
}

/**
 * Helper function to create color-tinted shadow
 */
export function coloredShadow(
  color: string,
  opacity: number = 0.2,
  blur: number = 8,
  spread: number = 0,
): string {
  return `0 4px ${blur}px ${spread}px ${color}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

/**
 * Helper function to get theme-appropriate shadow
 */
export function getThemedShadow(
  level: ShadowValue,
  isDark: boolean = false,
): string {
  return isDark ? shadowValuesDark[level] : shadowValues[level];
}

/**
 * Helper function to get theme-appropriate elevation
 */
export function getThemedElevation(
  level: ElevationLevel,
  isDark: boolean = false,
): string {
  return isDark ? elevationDark[level] : elevation[level];
}

/**
 * Helper function to get theme-appropriate focus ring
 */
export function getThemedFocusRing(
  type: FocusRing,
  isDark: boolean = false,
): string {
  return isDark ? focusRingsDark[type] : focusRings[type];
}
