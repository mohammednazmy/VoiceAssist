/**
 * VoiceAssist Design Tokens - Animations
 * Motion design system for consistent, accessible animations
 *
 * Features:
 * - Reduced motion support via prefers-reduced-motion
 * - Medical UI optimized - subtle, non-distracting transitions
 * - Clear feedback for user interactions
 * - Healthcare-specific animations (critical alerts, vital sign indicators)
 *
 * @example
 * ```typescript
 * import { durations, easings, animations } from '@voiceassist/design-tokens';
 *
 * const style = {
 *   transition: `opacity ${durations.normal} ${easings.easeOut}`,
 * };
 * ```
 */

/**
 * Animation Durations
 * Based on human perception research:
 * - < 100ms: Feels instant
 * - 100-300ms: Quick, responsive
 * - 300-500ms: Noticeable, deliberate
 * - > 500ms: Slow, use sparingly
 */
export const durations = {
  /** Effectively instant (for reduced motion fallback) */
  instant: "0ms",
  /** Very fast - micro-interactions (50ms) */
  fastest: "50ms",
  /** Fast - button feedback, hover states (100ms) */
  fast: "100ms",
  /** Normal - most transitions (200ms) */
  normal: "200ms",
  /** Slow - larger movements, modals entering (300ms) */
  slow: "300ms",
  /** Slower - complex animations (500ms) */
  slower: "500ms",
  /** Slowest - page transitions, loading states (700ms) */
  slowest: "700ms",
} as const;

/**
 * Easing Functions
 * Based on Material Design motion principles
 */
export const easings = {
  /** Linear - constant speed (use sparingly) */
  linear: "linear",
  /** Ease In - starts slow, ends fast (exits) */
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  /** Ease Out - starts fast, ends slow (entrances) */
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  /** Ease In Out - slow start and end (emphasis) */
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Spring - bouncy effect (playful interactions) */
  spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  /** Overshoot - slight bounce at end (confirmations) */
  overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Anticipate - pull back before moving (important actions) */
  anticipate: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

/**
 * Animation Keyframes
 * Reusable keyframe definitions for common animations
 */
export const keyframes = {
  /** Fade in from transparent */
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },

  /** Fade out to transparent */
  fadeOut: {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },

  /** Slide up with fade */
  slideUp: {
    from: { transform: "translateY(8px)", opacity: 0 },
    to: { transform: "translateY(0)", opacity: 1 },
  },

  /** Slide down with fade */
  slideDown: {
    from: { transform: "translateY(-8px)", opacity: 0 },
    to: { transform: "translateY(0)", opacity: 1 },
  },

  /** Slide in from right */
  slideInRight: {
    from: { transform: "translateX(100%)", opacity: 0 },
    to: { transform: "translateX(0)", opacity: 1 },
  },

  /** Slide in from left */
  slideInLeft: {
    from: { transform: "translateX(-100%)", opacity: 0 },
    to: { transform: "translateX(0)", opacity: 1 },
  },

  /** Scale up from center */
  scaleIn: {
    from: { transform: "scale(0.95)", opacity: 0 },
    to: { transform: "scale(1)", opacity: 1 },
  },

  /** Scale down to center */
  scaleOut: {
    from: { transform: "scale(1)", opacity: 1 },
    to: { transform: "scale(0.95)", opacity: 0 },
  },

  /** Subtle pulse for attention */
  pulse: {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.7 },
  },

  /** Spin for loading indicators */
  spin: {
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
  },

  /** Bounce for emphasis */
  bounce: {
    "0%, 100%": { transform: "translateY(0)" },
    "50%": { transform: "translateY(-8px)" },
  },

  /** Shake for errors */
  shake: {
    "0%, 100%": { transform: "translateX(0)" },
    "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
    "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
  },
} as const;

/**
 * Medical-Specific Keyframes
 * Designed for healthcare UI patterns
 */
export const medicalKeyframes = {
  /** Critical alert pulse - draws attention to critical values */
  criticalPulse: {
    "0%, 100%": {
      boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.4)",
      borderColor: "var(--color-error-500, #EF4444)",
    },
    "50%": {
      boxShadow: "0 0 0 8px rgba(239, 68, 68, 0)",
      borderColor: "var(--color-error-600, #DC2626)",
    },
  },

  /** Warning pulse - less urgent than critical */
  warningPulse: {
    "0%, 100%": {
      boxShadow: "0 0 0 0 rgba(245, 158, 11, 0.3)",
      borderColor: "var(--color-warning-500, #F59E0B)",
    },
    "50%": {
      boxShadow: "0 0 0 6px rgba(245, 158, 11, 0)",
      borderColor: "var(--color-warning-600, #D97706)",
    },
  },

  /** Heartbeat - for vital sign indicators */
  heartbeat: {
    "0%, 40%, 100%": { transform: "scale(1)" },
    "20%": { transform: "scale(1.15)" },
    "30%": { transform: "scale(0.95)" },
  },

  /** Breathing indicator - for ongoing processes */
  breathe: {
    "0%, 100%": { transform: "scale(1)", opacity: 1 },
    "50%": { transform: "scale(1.05)", opacity: 0.8 },
  },

  /** Processing dots - for loading states */
  processingDot: {
    "0%, 80%, 100%": { transform: "scale(0.6)", opacity: 0.5 },
    "40%": { transform: "scale(1)", opacity: 1 },
  },

  /** Recording pulse - for voice recording indicator */
  recordingPulse: {
    "0%, 100%": {
      boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.7)",
      backgroundColor: "var(--color-error-500, #EF4444)",
    },
    "70%": {
      boxShadow: "0 0 0 10px rgba(239, 68, 68, 0)",
      backgroundColor: "var(--color-error-600, #DC2626)",
    },
  },
} as const;

/**
 * Preset Animations
 * Ready-to-use animation configurations
 */
export const animations = {
  /** Fade in - general entrance */
  fadeIn: {
    keyframes: keyframes.fadeIn,
    duration: durations.normal,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Fade out - general exit */
  fadeOut: {
    keyframes: keyframes.fadeOut,
    duration: durations.normal,
    easing: easings.easeIn,
    fillMode: "forwards" as const,
  },

  /** Slide up - toasts, modals entering from bottom */
  slideUp: {
    keyframes: keyframes.slideUp,
    duration: durations.normal,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Slide down - dropdowns, menus entering */
  slideDown: {
    keyframes: keyframes.slideDown,
    duration: durations.normal,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Slide in right - side panels, notifications */
  slideInRight: {
    keyframes: keyframes.slideInRight,
    duration: durations.slow,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Slide in left - navigation, drawers */
  slideInLeft: {
    keyframes: keyframes.slideInLeft,
    duration: durations.slow,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Scale in - modals, dialogs */
  scaleIn: {
    keyframes: keyframes.scaleIn,
    duration: durations.normal,
    easing: easings.easeOut,
    fillMode: "forwards" as const,
  },

  /** Scale out - closing modals */
  scaleOut: {
    keyframes: keyframes.scaleOut,
    duration: durations.fast,
    easing: easings.easeIn,
    fillMode: "forwards" as const,
  },

  /** Pulse - drawing attention */
  pulse: {
    keyframes: keyframes.pulse,
    duration: durations.slower,
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },

  /** Spin - loading spinners */
  spin: {
    keyframes: keyframes.spin,
    duration: "1s",
    easing: easings.linear,
    iterationCount: "infinite" as const,
  },

  /** Bounce - success, celebrations */
  bounce: {
    keyframes: keyframes.bounce,
    duration: durations.slower,
    easing: easings.easeOut,
    iterationCount: 2,
  },

  /** Shake - error feedback */
  shake: {
    keyframes: keyframes.shake,
    duration: durations.slow,
    easing: easings.easeInOut,
    fillMode: "forwards" as const,
  },

  /** Critical pulse - critical vital signs */
  criticalPulse: {
    keyframes: medicalKeyframes.criticalPulse,
    duration: "1.5s",
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },

  /** Warning pulse - warning states */
  warningPulse: {
    keyframes: medicalKeyframes.warningPulse,
    duration: "2s",
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },

  /** Heartbeat - vital sign indicators */
  heartbeat: {
    keyframes: medicalKeyframes.heartbeat,
    duration: "1s",
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },

  /** Breathe - subtle ongoing process */
  breathe: {
    keyframes: medicalKeyframes.breathe,
    duration: "3s",
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },

  /** Recording pulse - voice recording */
  recordingPulse: {
    keyframes: medicalKeyframes.recordingPulse,
    duration: "1.2s",
    easing: easings.easeInOut,
    iterationCount: "infinite" as const,
  },
} as const;

/**
 * Reduced Motion Alternatives
 * Safe animations for users who prefer reduced motion
 */
export const reducedMotionAnimations = {
  fadeIn: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  fadeOut: {
    keyframes: keyframes.fadeOut,
    duration: durations.instant,
    easing: easings.linear,
  },
  slideUp: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  slideDown: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  slideInRight: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  slideInLeft: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  scaleIn: {
    keyframes: keyframes.fadeIn,
    duration: durations.instant,
    easing: easings.linear,
  },
  scaleOut: {
    keyframes: keyframes.fadeOut,
    duration: durations.instant,
    easing: easings.linear,
  },
  pulse: null, // Disable continuous animations
  spin: null,
  bounce: null,
  shake: null,
  criticalPulse: null,
  warningPulse: null,
  heartbeat: null,
  breathe: null,
  recordingPulse: null,
} as const;

/**
 * CSS Transition Presets
 * Common transition strings for inline styles
 */
export const transitions = {
  /** No transition */
  none: "none",
  /** Default - all properties */
  all: `all ${durations.normal} ${easings.easeInOut}`,
  /** Fast - quick feedback */
  fast: `all ${durations.fast} ${easings.easeOut}`,
  /** Slow - deliberate changes */
  slow: `all ${durations.slow} ${easings.easeInOut}`,
  /** Colors only */
  colors: `color ${durations.normal} ${easings.easeOut}, background-color ${durations.normal} ${easings.easeOut}, border-color ${durations.normal} ${easings.easeOut}`,
  /** Opacity only */
  opacity: `opacity ${durations.normal} ${easings.easeOut}`,
  /** Transform only */
  transform: `transform ${durations.normal} ${easings.easeOut}`,
  /** Shadow only */
  shadow: `box-shadow ${durations.normal} ${easings.easeOut}`,
} as const;

/**
 * Type exports
 */
export type Duration = keyof typeof durations;
export type Easing = keyof typeof easings;
export type Keyframe = keyof typeof keyframes;
export type MedicalKeyframe = keyof typeof medicalKeyframes;
export type Animation = keyof typeof animations;
export type Transition = keyof typeof transitions;

/**
 * Animation configuration type
 */
export interface AnimationConfig {
  keyframes: Record<string, Record<string, string | number>>;
  duration: string;
  easing: string;
  fillMode?: "forwards" | "backwards" | "both" | "none";
  iterationCount?: number | "infinite";
  delay?: string;
}

/**
 * Helper to generate CSS animation string
 */
export function createAnimationString(
  name: string,
  config: Omit<AnimationConfig, "keyframes">,
): string {
  const parts = [name, config.duration, config.easing];

  if (config.delay) {
    parts.push(config.delay);
  }

  if (config.iterationCount) {
    parts.push(String(config.iterationCount));
  }

  if (config.fillMode) {
    parts.push(config.fillMode);
  }

  return parts.join(" ");
}

/**
 * Helper to generate keyframes CSS
 */
export function createKeyframesCSS(
  name: string,
  frames: Record<string, Record<string, string | number>>,
): string {
  const frameStrings = Object.entries(frames)
    .map(([key, styles]) => {
      const styleString = Object.entries(styles)
        .map(([prop, value]) => {
          // Convert camelCase to kebab-case
          const kebabProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
          return `${kebabProp}: ${value};`;
        })
        .join(" ");
      return `${key} { ${styleString} }`;
    })
    .join(" ");

  return `@keyframes ${name} { ${frameStrings} }`;
}
