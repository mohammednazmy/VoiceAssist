/**
 * Shared Tailwind CSS Configuration
 * Uses @voiceassist/design-tokens for consistent theming
 */

const { colors, typography, spacing, borderRadius, shadows, zIndex } = require('@voiceassist/design-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        neutral: colors.neutral,
        success: colors.success,
        error: colors.error,
        warning: colors.warning,
        info: colors.info,
        background: colors.background,
        border: colors.border,
      },
      fontFamily: {
        sans: typography.fontFamily.sans.split(', '),
        mono: typography.fontFamily.mono.split(', '),
      },
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      letterSpacing: typography.letterSpacing,
      spacing: spacing,
      borderRadius: borderRadius,
      boxShadow: shadows,
      zIndex: zIndex,
    },
  },
  plugins: [],
};
