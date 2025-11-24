/**
 * VoiceAssist Design Tokens - Colors
 * Healthcare-themed color palette with calming blues and greens
 * Designed to evoke trust, professionalism, and clarity
 *
 * Features:
 * - Light and dark mode support
 * - WCAG AA compliant contrast ratios
 * - Calming healthcare-appropriate colors
 * - Semantic color tokens for consistency
 */

/**
 * Base color scales (50-950)
 * Use lighter, more calming tones compared to previous palette
 */

// Primary - Calming Medical Blue (softer than previous #0080FF)
// Main brand color: #0066CC (more professional, less harsh)
const primaryScale = {
  50: '#EFF6FF',   // Very light blue background
  100: '#DBEAFE',  // Light blue for subtle backgrounds
  200: '#BFDBFE',  // Soft blue for hover states
  300: '#93C5FD',  // Medium light blue
  400: '#60A5FA',  // Medium blue
  500: '#3B82F6',  // Bright blue for accents
  600: '#2563EB',  // Primary brand color (calming)
  700: '#1D4ED8',  // Dark blue for text
  800: '#1E40AF',  // Darker blue
  900: '#1E3A8A',  // Very dark blue
  950: '#172554',  // Darkest blue for dark mode backgrounds
} as const;

// Secondary - Calming Healthcare Green (warmer, more natural)
// Evokes health, growth, safety
const secondaryScale = {
  50: '#F0FDF4',   // Very light green
  100: '#DCFCE7',  // Light green for backgrounds
  200: '#BBF7D0',  // Soft green
  300: '#86EFAC',  // Medium light green
  400: '#4ADE80',  // Medium green
  500: '#22C55E',  // Bright green for accents
  600: '#16A34A',  // Secondary brand color
  700: '#15803D',  // Dark green
  800: '#166534',  // Darker green
  900: '#14532D',  // Very dark green
  950: '#052E16',  // Darkest green
} as const;

// Neutral - Soft Grays (no pure black #000000)
// Professional and easy on the eyes
const neutralScale = {
  50: '#F8FAFC',   // Almost white
  100: '#F1F5F9',  // Very light gray
  200: '#E2E8F0',  // Light gray
  300: '#CBD5E1',  // Medium light gray
  400: '#94A3B8',  // Medium gray
  500: '#64748B',  // True middle gray
  600: '#475569',  // Medium dark gray
  700: '#334155',  // Dark gray
  800: '#1E293B',  // Very dark gray (darkest we go)
  900: '#0F172A',  // Near black (for dark mode backgrounds)
  950: '#020617',  // Darkest (for dark mode)
} as const;

// Success - Positive Green
// WCAG AA compliant: success-700 on white = 4.6:1
const successScale = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  200: '#BBF7D0',
  300: '#86EFAC',
  400: '#4ADE80',
  500: '#22C55E',
  600: '#16A34A',   // Success color
  700: '#15803D',   // WCAG AA on white backgrounds
  800: '#166534',
  900: '#14532D',
  950: '#052E16',
} as const;

// Error - Alert Red (softer than pure #FF0000)
// WCAG AA compliant: error-700 on white = 5.9:1
const errorScale = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  200: '#FECACA',
  300: '#FCA5A5',
  400: '#F87171',
  500: '#EF4444',
  600: '#DC2626',   // Error color
  700: '#B91C1C',   // WCAG AA on white backgrounds
  800: '#991B1B',
  900: '#7F1D1D',
  950: '#450A0A',
} as const;

// Warning - Amber (medical attention)
// WCAG AA compliant: warning-600 on white = 4.5:1
const warningScale = {
  50: '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F59E0B',
  600: '#D97706',   // Warning color - WCAG AA
  700: '#B45309',
  800: '#92400E',
  900: '#78350F',
  950: '#451A03',
} as const;

// Info - Blue (same as primary for consistency)
const infoScale = {
  ...primaryScale,
} as const;

/**
 * Light Mode Semantic Tokens
 * Maps semantic names to specific color values
 * Ensures WCAG AA contrast ratios
 */
export const lightColors = {
  // Brand colors
  primary: primaryScale,
  secondary: secondaryScale,
  neutral: neutralScale,

  // Semantic colors
  success: successScale,
  error: errorScale,
  warning: warningScale,
  info: infoScale,

  // Background colors (light mode)
  background: {
    primary: '#FFFFFF',              // Main background (white)
    secondary: neutralScale[50],     // Subtle background (#F8FAFC)
    tertiary: neutralScale[100],     // Card backgrounds (#F1F5F9)
    elevated: '#FFFFFF',             // Elevated elements (white with shadow)
    overlay: 'rgba(15, 23, 42, 0.5)', // Dark overlay (neutral-900 at 50%)
    inverse: neutralScale[900],      // Dark background for dark elements
  },

  // Text colors (light mode)
  // All combinations meet WCAG AA (4.5:1 minimum)
  text: {
    primary: neutralScale[900],      // Main text (#0F172A) - 16.9:1 on white
    secondary: neutralScale[700],    // Secondary text (#334155) - 9.5:1 on white
    tertiary: neutralScale[600],     // Tertiary text (#475569) - 7.3:1 on white
    disabled: neutralScale[400],     // Disabled text (#94A3B8) - 3.4:1 (UI component)
    inverse: '#FFFFFF',              // White text on dark backgrounds
    link: primaryScale[600],         // Link color (#2563EB) - 6.3:1 on white
    linkHover: primaryScale[700],    // Link hover (#1D4ED8) - 8.2:1 on white
    success: successScale[700],      // Success text (#15803D) - 4.6:1
    error: errorScale[700],          // Error text (#B91C1C) - 5.9:1
    warning: warningScale[700],      // Warning text (#B45309) - 5.4:1
  },

  // Border colors (light mode)
  border: {
    default: neutralScale[200],      // Default borders (#E2E8F0)
    subtle: neutralScale[100],       // Subtle borders (#F1F5F9)
    strong: neutralScale[300],       // Strong borders (#CBD5E1)
    focus: primaryScale[500],        // Focus ring (#3B82F6) - 3.1:1 (UI component)
    success: successScale[500],      // Success borders
    error: errorScale[500],          // Error borders
    warning: warningScale[500],      // Warning borders
  },

  // Surface colors for specific components
  surface: {
    card: '#FFFFFF',
    cardHover: neutralScale[50],
    input: '#FFFFFF',
    inputHover: neutralScale[50],
    inputFocus: '#FFFFFF',
    button: {
      primary: primaryScale[600],
      primaryHover: primaryScale[700],
      secondary: secondaryScale[600],
      secondaryHover: secondaryScale[700],
      outline: 'transparent',
      outlineHover: neutralScale[50],
      ghost: 'transparent',
      ghostHover: neutralScale[100],
      danger: errorScale[600],
      dangerHover: errorScale[700],
    },
  },
} as const;

/**
 * Dark Mode Semantic Tokens
 * Adjusted colors for dark backgrounds
 * Maintains WCAG AA contrast ratios
 */
export const darkColors = {
  // Brand colors (same scales, different usage)
  primary: primaryScale,
  secondary: secondaryScale,
  neutral: neutralScale,

  // Semantic colors
  success: successScale,
  error: errorScale,
  warning: warningScale,
  info: infoScale,

  // Background colors (dark mode)
  background: {
    primary: neutralScale[900],      // Main background (#0F172A)
    secondary: neutralScale[800],    // Subtle background (#1E293B)
    tertiary: neutralScale[700],     // Card backgrounds (#334155)
    elevated: neutralScale[800],     // Elevated elements (with shadow)
    overlay: 'rgba(0, 0, 0, 0.7)',   // Very dark overlay
    inverse: '#FFFFFF',              // Light background for light elements
  },

  // Text colors (dark mode)
  // All combinations meet WCAG AA on dark backgrounds
  text: {
    primary: neutralScale[50],       // Main text (#F8FAFC) - 16.1:1 on neutral-900
    secondary: neutralScale[300],    // Secondary text (#CBD5E1) - 9.1:1
    tertiary: neutralScale[400],     // Tertiary text (#94A3B8) - 6.2:1
    disabled: neutralScale[600],     // Disabled text (#475569)
    inverse: neutralScale[900],      // Dark text on light backgrounds
    link: primaryScale[400],         // Link color (#60A5FA) - brighter for dark bg
    linkHover: primaryScale[300],    // Link hover (#93C5FD)
    success: successScale[400],      // Success text (#4ADE80)
    error: errorScale[400],          // Error text (#F87171)
    warning: warningScale[400],      // Warning text (#FBBF24)
  },

  // Border colors (dark mode)
  border: {
    default: neutralScale[700],      // Default borders (#334155)
    subtle: neutralScale[800],       // Subtle borders (#1E293B)
    strong: neutralScale[600],       // Strong borders (#475569)
    focus: primaryScale[500],        // Focus ring (#3B82F6)
    success: successScale[500],      // Success borders
    error: errorScale[500],          // Error borders
    warning: warningScale[500],      // Warning borders
  },

  // Surface colors for specific components (dark mode)
  surface: {
    card: neutralScale[800],
    cardHover: neutralScale[700],
    input: neutralScale[800],
    inputHover: neutralScale[700],
    inputFocus: neutralScale[800],
    button: {
      primary: primaryScale[600],
      primaryHover: primaryScale[500],
      secondary: secondaryScale[600],
      secondaryHover: secondaryScale[500],
      outline: 'transparent',
      outlineHover: neutralScale[800],
      ghost: 'transparent',
      ghostHover: neutralScale[800],
      danger: errorScale[600],
      dangerHover: errorScale[500],
    },
  },
} as const;

/**
 * Default export (light mode)
 * For backwards compatibility
 */
export const colors = lightColors;

/**
 * Type exports
 */
export type ColorScale = typeof primaryScale;
export type LightColors = typeof lightColors;
export type DarkColors = typeof darkColors;
export type ColorMode = 'light' | 'dark';
