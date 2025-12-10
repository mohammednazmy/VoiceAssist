# @voiceassist/config

Shared configuration files for VoiceAssist applications.

## Installation

```bash
pnpm add @voiceassist/config
```

## Contents

This package provides shared configuration for:

- **ESLint** - Code linting rules
- **Tailwind CSS** - Styling configuration with design tokens
- **TypeScript** - Compiler configurations
- **i18n** - Internationalization settings

## Usage

### ESLint

Extend the shared ESLint configuration in your `.eslintrc.js`:

```javascript
module.exports = {
  extends: ["@voiceassist/config/eslint"],
  // Add project-specific overrides
};
```

### Tailwind CSS

Use the shared Tailwind configuration in your `tailwind.config.js`:

```javascript
const sharedConfig = require("@voiceassist/config/tailwind");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [sharedConfig],
  content: ["./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  // Project-specific customizations
};
```

The Tailwind config includes:

- Color system from `@voiceassist/design-tokens`
- Typography scale
- Spacing system
- Border radius tokens
- Shadow system
- Dark mode support via class strategy

### TypeScript

Extend one of the base TypeScript configurations:

**Base configuration** (`tsconfig.base.json`):

```json
{
  "extends": "@voiceassist/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**React configuration** (`tsconfig.react.json`):

```json
{
  "extends": "@voiceassist/config/tsconfig.react.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

### i18n

Use the shared i18n configuration:

```typescript
import { i18nConfig } from "@voiceassist/config/i18n";

// Configure your i18n library with these settings
```

## Configuration Details

### Tailwind CSS Tokens

The Tailwind configuration integrates with design tokens:

```javascript
// Available color scales
colors: {
  primary,    // Blue palette
  secondary,  // Purple palette
  neutral,    // Gray palette
  success,    // Green palette
  error,      // Red palette
  warning,    // Yellow palette
  info,       // Cyan palette
}

// Semantic colors
background: { primary, secondary, tertiary, elevated, inverse }
text: { primary, secondary, tertiary, disabled, inverse, link }
border: { default, subtle, strong, focus }
```

### Dark Mode

Dark mode is configured using the class strategy:

```javascript
darkMode: ["class", '[data-theme="dark"]'];
```

Use with `ThemeProvider` from `@voiceassist/ui`.

## Dependencies

- `@voiceassist/design-tokens` - Design token definitions
