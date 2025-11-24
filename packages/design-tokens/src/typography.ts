/**
 * VoiceAssist Design Tokens - Typography
 * Modern typography system using Inter font
 * Optimized for readability and medical content
 *
 * Features:
 * - Inter variable font for modern, professional look
 * - Optimized line heights for each font size
 * - Semantic typography presets for components
 * - Accessible font sizes (minimum 14px for body text)
 */

/**
 * Font Families
 * Inter is a modern sans-serif optimized for UI
 * JetBrains Mono for code blocks
 */
export const fontFamily = {
  sans: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ].join(', '),

  mono: [
    'JetBrains Mono',
    'SF Mono',
    'Monaco',
    'Inconsolata',
    'Fira Code',
    'Consolas',
    'Courier New',
    'monospace',
  ].join(', '),
} as const;

/**
 * Font Sizes with Line Heights
 * Using Tailwind's [fontSize, lineHeight] format
 * All sizes use rem for accessibility
 */
export const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px / 16px line-height
  sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px / 20px line-height
  base: ['1rem', { lineHeight: '1.5rem' }],     // 16px / 24px line-height (default)
  lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px / 28px line-height
  xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px / 28px line-height
  '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px / 32px line-height
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px / 36px line-height
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px / 40px line-height
  '5xl': ['3rem', { lineHeight: '1' }],         // 48px / 1 (tight for hero)
  '6xl': ['3.75rem', { lineHeight: '1' }],      // 60px / 1
  '7xl': ['4.5rem', { lineHeight: '1' }],       // 72px / 1
} as const;

/**
 * Font Weights
 * Inter supports all these weights (variable font)
 */
export const fontWeight = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
} as const;

/**
 * Line Heights (standalone)
 * For custom combinations
 */
export const lineHeight = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

/**
 * Letter Spacing
 * Subtle adjustments for different contexts
 */
export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;

/**
 * Typography Presets for Components
 * Semantic presets that combine size, weight, and line-height
 * Use these for consistency across the app
 */
export const typographyPresets = {
  // Headings
  h1: {
    fontSize: fontSize['4xl'][0],
    lineHeight: fontSize['4xl'][1].lineHeight,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },

  h2: {
    fontSize: fontSize['3xl'][0],
    lineHeight: fontSize['3xl'][1].lineHeight,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },

  h3: {
    fontSize: fontSize['2xl'][0],
    lineHeight: fontSize['2xl'][1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },

  h4: {
    fontSize: fontSize.xl[0],
    lineHeight: fontSize.xl[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },

  h5: {
    fontSize: fontSize.lg[0],
    lineHeight: fontSize.lg[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },

  h6: {
    fontSize: fontSize.base[0],
    lineHeight: fontSize.base[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  },

  // Body text
  body: {
    fontSize: fontSize.base[0],
    lineHeight: fontSize.base[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },

  bodyLarge: {
    fontSize: fontSize.lg[0],
    lineHeight: fontSize.lg[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },

  bodySmall: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },

  // UI elements
  button: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },

  buttonLarge: {
    fontSize: fontSize.base[0],
    lineHeight: fontSize.base[1].lineHeight,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },

  caption: {
    fontSize: fontSize.xs[0],
    lineHeight: fontSize.xs[1].lineHeight,
    fontWeight: fontWeight.normal,
    letterSpacing: letterSpacing.normal,
  },

  overline: {
    fontSize: fontSize.xs[0],
    lineHeight: fontSize.xs[1].lineHeight,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
  },

  label: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.normal,
  },

  // Code
  code: {
    fontSize: fontSize.sm[0],
    lineHeight: fontSize.sm[1].lineHeight,
    fontFamily: fontFamily.mono,
    fontWeight: fontWeight.normal,
  },

  codeBlock: {
    fontSize: fontSize.sm[0],
    lineHeight: lineHeight.relaxed,
    fontFamily: fontFamily.mono,
    fontWeight: fontWeight.normal,
  },
} as const;

/**
 * Main export (Tailwind-compatible format)
 */
export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  presets: typographyPresets,
} as const;

/**
 * Type exports
 */
export type FontFamily = keyof typeof fontFamily;
export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
export type LineHeight = keyof typeof lineHeight;
export type LetterSpacing = keyof typeof letterSpacing;
export type TypographyPreset = keyof typeof typographyPresets;
