/**
 * VoiceAssist Design Tokens
 * Centralized design system tokens for colors, typography, spacing, and more
 *
 * @example
 * ```typescript
 * import { colors, typography, spacing, animations, breakpoints } from '@voiceassist/design-tokens';
 *
 * const primaryColor = colors.primary[500];
 * const bodyFont = typography.fontFamily.sans;
 * const baseSpacing = spacing[4];
 * const fadeIn = animations.fadeIn;
 * const tablet = breakpoints.md;
 * ```
 */

// Colors
export { colors, lightColors, darkColors } from "./colors";
export type { ColorScale, LightColors, DarkColors, ColorMode } from "./colors";

// Typography
export {
  typography,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  typographyPresets,
} from "./typography";
export type {
  FontFamily,
  FontSize,
  FontWeight,
  LineHeight,
  LetterSpacing,
  TypographyPreset,
} from "./typography";

// Spacing
export { spacing, borderRadius, shadows, zIndex } from "./spacing";
export type {
  SpacingToken,
  BorderRadiusToken,
  ShadowToken,
  ZIndexToken,
} from "./spacing";

// Animations
export {
  durations,
  easings,
  keyframes,
  medicalKeyframes,
  animations,
  reducedMotionAnimations,
  transitions,
  createAnimationString,
  createKeyframesCSS,
} from "./animations";
export type {
  Duration,
  Easing,
  Keyframe,
  MedicalKeyframe,
  Animation,
  Transition,
  AnimationConfig,
} from "./animations";

// Breakpoints
export {
  breakpoints,
  breakpointValues,
  containers,
  mediaQueries,
  deviceBreakpoints,
  gridColumns,
  sidebarWidths,
  headerHeights,
  tailwindScreens,
  matchesBreakpoint,
  getCurrentBreakpoint,
  minWidth,
  maxWidth,
  between,
} from "./breakpoints";
export type {
  Breakpoint,
  Container,
  MediaQuery,
  DeviceBreakpoint,
} from "./breakpoints";

// Elevation (shadows with semantic naming)
export {
  shadowValues,
  shadowValuesDark,
  elevation,
  elevationDark,
  focusRings,
  focusRingsDark,
  componentShadows,
  medicalComponentShadows,
  combineShadows,
  coloredShadow,
  getThemedShadow,
  getThemedElevation,
  getThemedFocusRing,
} from "./elevation";
export type {
  ShadowValue,
  ElevationLevel,
  FocusRing,
  ComponentShadow,
  MedicalComponentShadow,
} from "./elevation";

// Combined exports for convenience
export const tokens = {
  colors: require("./colors").colors,
  typography: require("./typography").typography,
  spacing: require("./spacing").spacing,
  borderRadius: require("./spacing").borderRadius,
  shadows: require("./spacing").shadows,
  zIndex: require("./spacing").zIndex,
  animations: require("./animations").animations,
  durations: require("./animations").durations,
  easings: require("./animations").easings,
  breakpoints: require("./breakpoints").breakpoints,
  mediaQueries: require("./breakpoints").mediaQueries,
  elevation: require("./elevation").elevation,
  focusRings: require("./elevation").focusRings,
};

export const designSystem = {
  light: {
    colors: require("./colors").lightColors,
    elevation: require("./elevation").elevation,
    focus: require("./elevation").focusRings,
  },
  dark: {
    colors: require("./colors").darkColors,
    elevation: require("./elevation").elevationDark,
    focus: require("./elevation").focusRingsDark,
  },
  typography: require("./typography").typography,
  spacing: require("./spacing").spacing,
  borderRadius: require("./spacing").borderRadius,
  shadows: require("./spacing").shadows,
};
