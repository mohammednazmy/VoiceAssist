/**
 * VoiceAssist Design Tokens - Breakpoints
 * Responsive design system with mobile-first approach
 *
 * Features:
 * - Mobile-first breakpoint scale
 * - Container width constraints
 * - Semantic breakpoint names
 * - Media query helpers
 *
 * @example
 * ```typescript
 * import { breakpoints, containers, mediaQueries } from '@voiceassist/design-tokens';
 *
 * // Use in CSS-in-JS
 * const styles = {
 *   [mediaQueries.md]: {
 *     padding: '1.5rem',
 *   },
 * };
 *
 * // Use in Tailwind config
 * module.exports = {
 *   theme: {
 *     screens: breakpoints,
 *   },
 * };
 * ```
 */

/**
 * Breakpoint Values
 * Mobile-first approach: styles apply at this width and above
 *
 * Based on common device sizes:
 * - xs: Small phones (portrait)
 * - sm: Large phones, small tablets (portrait)
 * - md: Tablets (portrait), small laptops
 * - lg: Laptops, tablets (landscape)
 * - xl: Desktops
 * - 2xl: Large desktops, monitors
 */
export const breakpoints = {
  /** Extra small - 480px (small phones) */
  xs: "480px",
  /** Small - 640px (large phones, small tablets) */
  sm: "640px",
  /** Medium - 768px (tablets portrait) */
  md: "768px",
  /** Large - 1024px (tablets landscape, laptops) */
  lg: "1024px",
  /** Extra large - 1280px (desktops) */
  xl: "1280px",
  /** 2x Extra large - 1536px (large desktops) */
  "2xl": "1536px",
} as const;

/**
 * Breakpoint Values as Numbers (in pixels)
 * Useful for JavaScript calculations
 */
export const breakpointValues = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/**
 * Container Max Widths
 * Maximum content widths at each breakpoint
 * Provides comfortable reading and layout constraints
 */
export const containers = {
  /** Extra small - full width with padding */
  xs: "100%",
  /** Small - 600px */
  sm: "600px",
  /** Medium - 720px */
  md: "720px",
  /** Large - 960px */
  lg: "960px",
  /** Extra large - 1140px */
  xl: "1140px",
  /** 2x Extra large - 1320px */
  "2xl": "1320px",
  /** Full - 100% (no constraint) */
  full: "100%",
  /** Prose - optimal reading width (65-75 characters) */
  prose: "65ch",
  /** Narrow - for forms, cards (500px) */
  narrow: "500px",
  /** Wide - for dashboards (1600px) */
  wide: "1600px",
} as const;

/**
 * Media Query Strings
 * Ready-to-use media query strings for CSS-in-JS
 */
export const mediaQueries = {
  /** Min-width: 480px */
  xs: `@media (min-width: ${breakpoints.xs})`,
  /** Min-width: 640px */
  sm: `@media (min-width: ${breakpoints.sm})`,
  /** Min-width: 768px */
  md: `@media (min-width: ${breakpoints.md})`,
  /** Min-width: 1024px */
  lg: `@media (min-width: ${breakpoints.lg})`,
  /** Min-width: 1280px */
  xl: `@media (min-width: ${breakpoints.xl})`,
  /** Min-width: 1536px */
  "2xl": `@media (min-width: ${breakpoints["2xl"]})`,

  // Max-width queries (for desktop-first or overrides)
  /** Max-width: 479px */
  xsMax: `@media (max-width: 479px)`,
  /** Max-width: 639px */
  smMax: `@media (max-width: 639px)`,
  /** Max-width: 767px */
  mdMax: `@media (max-width: 767px)`,
  /** Max-width: 1023px */
  lgMax: `@media (max-width: 1023px)`,
  /** Max-width: 1279px */
  xlMax: `@media (max-width: 1279px)`,
  /** Max-width: 1535px */
  "2xlMax": `@media (max-width: 1535px)`,

  // Range queries
  /** 480px to 639px */
  xsOnly: `@media (min-width: ${breakpoints.xs}) and (max-width: 639px)`,
  /** 640px to 767px */
  smOnly: `@media (min-width: ${breakpoints.sm}) and (max-width: 767px)`,
  /** 768px to 1023px */
  mdOnly: `@media (min-width: ${breakpoints.md}) and (max-width: 1023px)`,
  /** 1024px to 1279px */
  lgOnly: `@media (min-width: ${breakpoints.lg}) and (max-width: 1279px)`,
  /** 1280px to 1535px */
  xlOnly: `@media (min-width: ${breakpoints.xl}) and (max-width: 1535px)`,

  // Accessibility queries
  /** User prefers reduced motion */
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  /** User prefers more motion (default) */
  motionOK: "@media (prefers-reduced-motion: no-preference)",
  /** User prefers high contrast */
  highContrast: "@media (prefers-contrast: high)",
  /** User prefers dark mode */
  darkMode: "@media (prefers-color-scheme: dark)",
  /** User prefers light mode */
  lightMode: "@media (prefers-color-scheme: light)",

  // Device-specific queries
  /** Touch-capable devices */
  touch: "@media (hover: none) and (pointer: coarse)",
  /** Mouse/trackpad devices */
  mouse: "@media (hover: hover) and (pointer: fine)",
  /** Devices with hover support */
  hover: "@media (hover: hover)",
  /** Portrait orientation */
  portrait: "@media (orientation: portrait)",
  /** Landscape orientation */
  landscape: "@media (orientation: landscape)",

  // Print
  /** Print styles */
  print: "@media print",
  /** Screen only (not print) */
  screen: "@media screen",
} as const;

/**
 * Semantic Breakpoint Names
 * Human-readable names for common use cases
 */
export const deviceBreakpoints = {
  /** Mobile phones (< 640px) */
  mobile: breakpoints.sm,
  /** Tablets (>= 768px) */
  tablet: breakpoints.md,
  /** Laptops and desktops (>= 1024px) */
  desktop: breakpoints.lg,
  /** Large monitors (>= 1280px) */
  largeDesktop: breakpoints.xl,
} as const;

/**
 * Grid Columns at Each Breakpoint
 * Default column counts for responsive grids
 */
export const gridColumns = {
  /** Extra small - 1 column */
  xs: 1,
  /** Small - 2 columns */
  sm: 2,
  /** Medium - 3 columns */
  md: 3,
  /** Large - 4 columns */
  lg: 4,
  /** Extra large - 4 columns */
  xl: 4,
  /** 2x Extra large - 6 columns */
  "2xl": 6,
} as const;

/**
 * Sidebar Widths at Each Breakpoint
 * Common sidebar widths for app layouts
 */
export const sidebarWidths = {
  /** Collapsed - icon only (64px) */
  collapsed: "64px",
  /** Compact - narrow (200px) */
  compact: "200px",
  /** Default - standard (256px) */
  default: "256px",
  /** Wide - spacious (320px) */
  wide: "320px",
  /** Full - mobile overlay (100%) */
  full: "100%",
} as const;

/**
 * Header Heights at Each Breakpoint
 */
export const headerHeights = {
  /** Mobile header (56px) */
  mobile: "56px",
  /** Desktop header (64px) */
  desktop: "64px",
  /** Compact header (48px) */
  compact: "48px",
} as const;

/**
 * Type Exports
 */
export type Breakpoint = keyof typeof breakpoints;
export type Container = keyof typeof containers;
export type MediaQuery = keyof typeof mediaQueries;
export type DeviceBreakpoint = keyof typeof deviceBreakpoints;

/**
 * Helper Functions
 */

/**
 * Check if window matches a breakpoint (client-side only)
 */
export function matchesBreakpoint(breakpoint: Breakpoint): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(min-width: ${breakpoints[breakpoint]})`).matches;
}

/**
 * Get current breakpoint name (client-side only)
 */
export function getCurrentBreakpoint(): Breakpoint | null {
  if (typeof window === "undefined") return null;

  const width = window.innerWidth;
  if (width >= breakpointValues["2xl"]) return "2xl";
  if (width >= breakpointValues.xl) return "xl";
  if (width >= breakpointValues.lg) return "lg";
  if (width >= breakpointValues.md) return "md";
  if (width >= breakpointValues.sm) return "sm";
  if (width >= breakpointValues.xs) return "xs";
  return null;
}

/**
 * Create a min-width media query string
 */
export function minWidth(px: number | string): string {
  const value = typeof px === "number" ? `${px}px` : px;
  return `@media (min-width: ${value})`;
}

/**
 * Create a max-width media query string
 */
export function maxWidth(px: number | string): string {
  const value = typeof px === "number" ? `${px}px` : px;
  return `@media (max-width: ${value})`;
}

/**
 * Create a width range media query string
 */
export function between(
  minPx: number | string,
  maxPx: number | string,
): string {
  const min = typeof minPx === "number" ? `${minPx}px` : minPx;
  const max = typeof maxPx === "number" ? `${maxPx}px` : maxPx;
  return `@media (min-width: ${min}) and (max-width: ${max})`;
}

/**
 * Tailwind-compatible screens config
 */
export const tailwindScreens = {
  xs: breakpoints.xs,
  sm: breakpoints.sm,
  md: breakpoints.md,
  lg: breakpoints.lg,
  xl: breakpoints.xl,
  "2xl": breakpoints["2xl"],
} as const;
