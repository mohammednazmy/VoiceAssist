/**
 * Shared Tailwind CSS Configuration
 * Uses @voiceassist/design-tokens for consistent theming
 * Supports light and dark modes
 */

const {
  lightColors,
  typography,
  spacing,
  borderRadius,
  shadows,
  zIndex,
} = require('@voiceassist/design-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],

  // Dark mode using class strategy (controlled by ThemeProvider)
  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      // Colors - use light mode colors as base
      // Dark mode overrides are handled via CSS variables
      colors: {
        primary: lightColors.primary,
        secondary: lightColors.secondary,
        neutral: lightColors.neutral,
        success: lightColors.success,
        error: lightColors.error,
        warning: lightColors.warning,
        info: lightColors.info,

        // Semantic colors for light mode
        background: {
          primary: lightColors.background.primary,
          secondary: lightColors.background.secondary,
          tertiary: lightColors.background.tertiary,
          elevated: lightColors.background.elevated,
          inverse: lightColors.background.inverse,
        },

        text: {
          primary: lightColors.text.primary,
          secondary: lightColors.text.secondary,
          tertiary: lightColors.text.tertiary,
          disabled: lightColors.text.disabled,
          inverse: lightColors.text.inverse,
          link: lightColors.text.link,
          success: lightColors.text.success,
          error: lightColors.text.error,
          warning: lightColors.text.warning,
        },

        border: {
          default: lightColors.border.default,
          subtle: lightColors.border.subtle,
          strong: lightColors.border.strong,
          focus: lightColors.border.focus,
          success: lightColors.border.success,
          error: lightColors.border.error,
          warning: lightColors.border.warning,
        },
      },

      // Typography
      fontFamily: {
        sans: typography.fontFamily.sans.split(', '),
        mono: typography.fontFamily.mono.split(', '),
      },
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      letterSpacing: typography.letterSpacing,

      // Spacing & Layout
      spacing: spacing,
      borderRadius: borderRadius,
      boxShadow: shadows,
      zIndex: zIndex,

      // Transitions
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },

      // Animation
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-from-top': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-from-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-from-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-in-out',
        'fade-out': 'fade-out 200ms ease-in-out',
        'slide-in-from-top': 'slide-in-from-top 200ms ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 200ms ease-out',
        'slide-in-from-left': 'slide-in-from-left 200ms ease-out',
        'slide-in-from-right': 'slide-in-from-right 200ms ease-out',
      },
    },
  },

  plugins: [],
};
