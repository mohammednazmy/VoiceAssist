/**
 * VoiceAssist Design Tokens
 * Centralized design system tokens for colors, typography, spacing, and more
 *
 * @example
 * ```typescript
 * import { colors, typography, spacing } from '@voiceassist/design-tokens';
 *
 * const primaryColor = colors.primary[500];
 * const bodyFont = typography.fontFamily.sans;
 * const baseSpacing = spacing[4];
 * ```
 */

export { colors, lightColors, darkColors } from './colors';
export type { ColorScale, LightColors, DarkColors, ColorMode } from './colors';

export { typography, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, typographyPresets } from './typography';
export type { FontFamily, FontSize, FontWeight, LineHeight, LetterSpacing, TypographyPreset } from './typography';

export { spacing, borderRadius, shadows, zIndex } from './spacing';
export type { SpacingToken, BorderRadiusToken, ShadowToken, ZIndexToken } from './spacing';

// Combined exports for convenience
export const tokens = {
  colors: require('./colors').colors,
  typography: require('./typography').typography,
  spacing: require('./spacing').spacing,
  borderRadius: require('./spacing').borderRadius,
  shadows: require('./spacing').shadows,
  zIndex: require('./spacing').zIndex,
};
