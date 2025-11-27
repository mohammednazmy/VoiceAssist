# @voiceassist/design-tokens

Design tokens package for VoiceAssist applications. Provides a centralized, type-safe design system with colors, typography, spacing, and other visual primitives.

## Installation

This package is part of the VoiceAssist monorepo and is automatically available to all apps via pnpm workspaces.

```bash
# In any app or package
pnpm add @voiceassist/design-tokens
```

## Usage

### Colors

```typescript
import { colors } from "@voiceassist/design-tokens";

// Primary brand color
const primary = colors.primary[500]; // #0080FF

// Semantic colors
const success = colors.success[500]; // #00C369
const error = colors.error[500]; // #FF0000

// Background colors
const bg = colors.background.primary; // #FFFFFF
```

### Typography

```typescript
import { typography } from "@voiceassist/design-tokens";

// Font families
const sansFont = typography.fontFamily.sans;
const monoFont = typography.fontFamily.mono;

// Font sizes
const bodySize = typography.fontSize.base; // 1rem (16px)
const headingSize = typography.fontSize["3xl"]; // 1.875rem (30px)

// Font weights
const bold = typography.fontWeight.bold; // 700
```

### Spacing

```typescript
import { spacing, borderRadius, shadows, zIndex } from "@voiceassist/design-tokens";

// Spacing (4px/8px grid)
const sm = spacing[2]; // 0.5rem (8px)
const md = spacing[4]; // 1rem (16px)
const lg = spacing[8]; // 2rem (32px)

// Border radius
const rounded = borderRadius.md; // 0.375rem (6px)

// Shadows
const cardShadow = shadows.md;

// Z-index
const modalZ = zIndex.modal; // 1400
```

## Design Principles

### Color Palette

- **Medical Blue** (#0080FF): Primary brand color, evokes trust and professionalism
- **Medical Teal** (#00AFAF): Secondary color, provides visual interest
- **Professional Grays**: Neutral tones for text and backgrounds
- **Semantic Colors**: Success (green), error (red), warning (amber), info (blue)

### Typography

- **System Fonts**: Native fonts for optimal performance and familiarity
- **Rem Units**: All font sizes use rem for accessibility
- **Clear Hierarchy**: 10 predefined sizes from xs (12px) to 7xl (72px)

### Spacing

- **4px/8px Grid**: All spacing follows a consistent grid
- **Rem Units**: Ensures accessibility with user font-size preferences
- **Generous Scale**: Ranges from 2px (0.5) to 384px (96)

## Tailwind Integration

These tokens are designed to integrate seamlessly with Tailwind CSS. See the `@voiceassist/config` package for the Tailwind configuration.

## Themed usage

Use the `designSystem` export for a WCAG-conscious bundle of light/dark palettes, elevation, focus, and spacing tokens:

```ts
import { designSystem } from "@voiceassist/design-tokens";

const cardBackground = designSystem.light.colors.surface.card; // WCAG AA on text.primary
const focusRing = designSystem.light.focus.strong; // 3px blue outline
const darkShadow = designSystem.dark.elevation.lg;
```

All text/background pairs in the palette have been verified for WCAG 2.1 AA contrast, and focus ring tokens are 3px/2px outlines for keyboard visibility.

## TypeScript Support

All tokens are fully typed with TypeScript for autocomplete and type safety:

```typescript
import type { ColorCategory, FontSize, SpacingToken } from "@voiceassist/design-tokens";

const category: ColorCategory = "primary";
const size: FontSize = "lg";
```

## Contributing

When adding new tokens:

1. Follow the existing naming conventions
2. Maintain the 4px/8px grid for spacing
3. Update TypeScript types
4. Document new tokens in this README
5. Rebuild the package: `pnpm build`
