---
title: Phase 1 Breakdown
slug: design-system/phase-1-breakdown
summary: >-
  Phase 1 establishes the foundation for the entire design system. These tasks
  can be worked on in parallel to maximize efficiency.
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - phase
  - breakdown
category: planning
ai_summary: >-
  Phase 1 establishes the foundation for the entire design system. These tasks
  can be worked on in parallel to maximize efficiency. Timeline: 1-2 weeks
  Dependencies: None (all tasks can start immediately) Deliverables: Enhanced
  design tokens, theme provider, updated Tailwind config, Inter font inte...
---

# Phase 1: Design System Foundation - Task Breakdown

## Overview

Phase 1 establishes the foundation for the entire design system. These tasks can be worked on in parallel to maximize efficiency.

**Timeline:** 1-2 weeks
**Dependencies:** None (all tasks can start immediately)
**Deliverables:** Enhanced design tokens, theme provider, updated Tailwind config, Inter font integration

---

## Parallel Task Groups

### Group A: Design Tokens Enhancement

**Can be done independently - no blockers**

#### Task 1.1: Update Color Palette

**File:** `/packages/design-tokens/src/colors.ts`
**Effort:** 4-6 hours
**Priority:** High

**Subtasks:**

1. Research and define healthcare color palette
   - Primary: Calming medical blue (#0066CC family)
   - Secondary: Calming green (#00A67E family)
   - Neutral: Soft grays (no pure black)
   - Semantic: Success, error, warning, info

2. Create light mode color scales (50-950 for each)
   - Use tools like https://uicolors.app or https://palettte.app
   - Ensure 9 shades per color family

3. Create dark mode color scales
   - Adjust luminance for dark backgrounds
   - Maintain same color relationships

4. Define semantic tokens
   - background-primary, background-secondary, etc.
   - text-primary, text-secondary, text-muted, etc.
   - border-default, border-focus, etc.

5. Verify WCAG contrast ratios
   - Use WebAIM Contrast Checker
   - Document contrast ratios in comments
   - Ensure AA compliance (4.5:1 text, 3:1 UI)

**Output:**

- Updated `colors.ts` with light and dark variants
- Color documentation with contrast ratios
- Usage guidelines

---

#### Task 1.2: Update Typography System

**File:** `/packages/design-tokens/src/typography.ts`
**Effort:** 2-3 hours
**Priority:** High

**Subtasks:**

1. Define Inter font family stack

   ```typescript
   fontFamily: {
     sans: ['Inter', 'system-ui', '-apple-system', ...],
     mono: ['JetBrains Mono', 'Menlo', ...]
   }
   ```

2. Create type scale with line heights
   - xs through 7xl
   - Use rem units
   - Include line-height for readability

3. Define font weights
   - Map semantic names: light, normal, medium, semibold, bold
   - Use variable font weights (300-700)

4. Create typography presets for components
   - heading1 through heading6
   - body, bodySmall, bodyLarge
   - caption, overline, button

**Output:**

- Updated `typography.ts`
- Typography documentation
- Component typography presets

---

#### Task 1.3: Create Component Variant Tokens

**New File:** `/packages/design-tokens/src/components.ts`
**Effort:** 3-4 hours
**Priority:** Medium

**Subtasks:**

1. Define button variants
   - Sizes: sm, md, lg
   - Variants: primary, secondary, outline, ghost, danger
   - States: default, hover, active, disabled

2. Define card tokens
   - Padding scales
   - Shadow levels
   - Border radius

3. Define input tokens
   - Heights for different sizes
   - Padding
   - Border styles

4. Define spacing tokens for components
   - Component-specific spacing
   - Layout spacing

**Output:**

- New `components.ts` file
- Component variant documentation

---

### Group B: Theme Infrastructure

**Can be done independently - no blockers**

#### Task 1.4: Create Theme Provider

**New Files:**

- `/packages/ui/src/providers/ThemeProvider.tsx`
- `/packages/ui/src/providers/ThemeContext.tsx`
- `/packages/ui/src/providers/index.ts`

**Effort:** 4-5 hours
**Priority:** High

**Subtasks:**

1. Create ThemeContext

   ```typescript
   interface ThemeContextValue {
     theme: "light" | "dark" | "system";
     resolvedTheme: "light" | "dark";
     setTheme: (theme: "light" | "dark" | "system") => void;
     toggleTheme: () => void;
   }
   ```

2. Create ThemeProvider component
   - Manage theme state
   - Sync with localStorage
   - Support system preference detection
   - Apply theme to document root

3. Create useTheme hook

   ```typescript
   export function useTheme(): ThemeContextValue;
   ```

4. Add theme transition support
   - Smooth color transitions when switching
   - Prevent flash of wrong theme

5. Write tests
   - Test theme switching
   - Test localStorage persistence
   - Test system preference detection

**Output:**

- ThemeProvider component
- useTheme hook
- Tests for theme functionality

---

#### Task 1.5: Create CSS Variables Bridge

**New File:** `/packages/ui/src/styles/theme-variables.css`
**Effort:** 3-4 hours
**Priority:** High

**Subtasks:**

1. Generate CSS custom properties from design tokens

   ```css
   :root {
     --color-primary-50: ...;
     --color-primary-500: ...;
     --spacing-1: ...;
     --font-size-base: ...;
   }
   ```

2. Create dark mode overrides

   ```css
   [data-theme="dark"] {
     --color-primary-50: ...;
     /* Override colors for dark mode */
   }
   ```

3. Create semantic tokens

   ```css
   :root {
     --color-background: var(--color-neutral-50);
     --color-text: var(--color-neutral-900);
   }

   [data-theme="dark"] {
     --color-background: var(--color-neutral-900);
     --color-text: var(--color-neutral-50);
   }
   ```

4. Add transition support
   ```css
   * {
     transition:
       background-color 0.2s,
       color 0.2s,
       border-color 0.2s;
   }
   ```

**Output:**

- CSS variables file
- Import in global styles
- Documentation on usage

---

### Group C: Integration

**Depends on Groups A & B being complete**

#### Task 1.6: Update Tailwind Config

**File:** `/packages/config/tailwind.js`
**Effort:** 2-3 hours
**Priority:** High
**Depends on:** Tasks 1.1, 1.2, 1.3

**Subtasks:**

1. Import design tokens

   ```javascript
   const { colors } = require("@voiceassist/design-tokens");
   const { typography } = require("@voiceassist/design-tokens");
   ```

2. Configure dark mode

   ```javascript
   darkMode: 'class', // or ['class', '[data-theme="dark"]']
   ```

3. Extend theme with tokens

   ```javascript
   theme: {
     extend: {
       colors,
       fontFamily: typography.fontFamily,
       fontSize: typography.fontSize,
       // ...
     }
   }
   ```

4. Add custom variants if needed

5. Configure content paths (ensure all apps/packages included)

**Output:**

- Updated Tailwind config
- Documentation on Tailwind usage

---

#### Task 1.7: Add Inter Font to Applications

**Files:**

- `/apps/web-app/index.html`
- `/apps/admin-panel/index.html`

**Effort:** 1-2 hours
**Priority:** Medium
**Depends on:** Task 1.2

**Subtasks:**

1. Add Google Fonts link to both apps

   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
   ```

2. Alternative: Self-host fonts
   - Download Inter font files
   - Add to `/packages/ui/src/assets/fonts/`
   - Create @font-face declarations

3. Update global styles to use Inter

**Output:**

- Inter font loaded in both apps
- Font performance optimized (preconnect, display=swap)

---

#### Task 1.8: Update Global Styles

**Files:**

- `/apps/web-app/src/styles.css`
- `/apps/admin-panel/src/styles.css`

**Effort:** 2-3 hours
**Priority:** High
**Depends on:** Tasks 1.5, 1.6, 1.7

**Subtasks:**

1. Import theme variables

   ```css
   @import "@voiceassist/ui/styles/theme-variables.css";
   ```

2. Apply Tailwind directives

   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

3. Add base styles

   ```css
   @layer base {
     body {
       @apply bg-background text-text font-sans;
     }
   }
   ```

4. Add custom utility classes if needed

5. Ensure accessibility styles are maintained
   - Focus indicators
   - Reduced motion support
   - High contrast mode

**Output:**

- Updated global styles in both apps
- Theme applied correctly

---

#### Task 1.9: Integrate Theme Provider in Apps

**Files:**

- `/apps/web-app/src/App.tsx`
- `/apps/admin-panel/src/App.tsx`

**Effort:** 1-2 hours
**Priority:** High
**Depends on:** Task 1.4

**Subtasks:**

1. Import ThemeProvider

   ```typescript
   import { ThemeProvider } from "@voiceassist/ui/providers";
   ```

2. Wrap app in ThemeProvider

   ```tsx
   <ThemeProvider>
     <BrowserRouter>{/* existing app */}</BrowserRouter>
   </ThemeProvider>
   ```

3. Test theme switching (if implementing toggle now)

4. Verify no visual regressions

**Output:**

- Theme provider integrated
- Apps running with new theme system

---

## Testing & Validation

### Testing Checklist

After completing all tasks:

- [ ] **Design Tokens**
  - [ ] Colors exported correctly
  - [ ] Typography scales are correct
  - [ ] Component tokens defined
  - [ ] Both light and dark mode tokens exist

- [ ] **Theme Provider**
  - [ ] Theme switches correctly
  - [ ] localStorage persistence works
  - [ ] System preference detection works
  - [ ] No flash of wrong theme on load

- [ ] **CSS Variables**
  - [ ] Variables applied to :root
  - [ ] Dark mode overrides work
  - [ ] Smooth transitions between themes

- [ ] **Tailwind Config**
  - [ ] Design tokens integrated
  - [ ] Dark mode configured
  - [ ] Build successful with no errors

- [ ] **Font Loading**
  - [ ] Inter font loads correctly
  - [ ] Fallback fonts work
  - [ ] No FOUT (Flash of Unstyled Text)

- [ ] **Visual Testing**
  - [ ] Web app displays correctly
  - [ ] Admin panel displays correctly
  - [ ] No visual regressions
  - [ ] Colors meet WCAG contrast ratios

- [ ] **Build & Performance**
  - [ ] `pnpm build` succeeds
  - [ ] No TypeScript errors
  - [ ] No linter errors
  - [ ] Bundle size within budget

---

## Recommended Execution Order

**Week 1:**

**Day 1-2:** Parallel execution

- Task 1.1: Update color palette (4-6 hours)
- Task 1.2: Update typography (2-3 hours)
- Task 1.4: Create theme provider (4-5 hours)

**Day 3:** Parallel execution

- Task 1.3: Component variant tokens (3-4 hours)
- Task 1.5: CSS variables bridge (3-4 hours)

**Day 4:** Sequential execution (dependencies)

- Task 1.6: Update Tailwind config (depends on 1.1, 1.2, 1.3)
- Task 1.7: Add Inter font (depends on 1.2)

**Day 5:** Integration & testing

- Task 1.8: Update global styles (depends on 1.5, 1.6, 1.7)
- Task 1.9: Integrate theme provider (depends on 1.4)
- Full testing and validation

---

## Success Criteria

Phase 1 is complete when:

1. ✅ All design tokens are defined (colors, typography, spacing, components)
2. ✅ Both light and dark mode tokens exist
3. ✅ Theme provider is implemented and tested
4. ✅ CSS variables bridge is created
5. ✅ Tailwind config uses design tokens
6. ✅ Inter font is loaded in both apps
7. ✅ Global styles are updated
8. ✅ All tests pass
9. ✅ Build succeeds with no errors
10. ✅ No visual regressions
11. ✅ Documentation is complete
12. ✅ Stakeholder review completed (Week 2 feedback session)

---

## Deliverables

1. **Code:**
   - Updated design tokens package
   - Theme provider in UI package
   - Updated Tailwind config
   - Updated global styles

2. **Documentation:**
   - Color palette documentation
   - Typography documentation
   - Theme provider usage guide
   - Migration notes (if any)

3. **Testing:**
   - Unit tests for theme provider
   - Visual regression baselines
   - Build validation

4. **Stakeholder Review:**
   - Design token presentation
   - Color palette approval
   - Typography approval

---

## Next Steps After Phase 1

Once Phase 1 is complete:

1. Commit and push all changes
2. Create PR for review
3. Schedule stakeholder feedback session (Week 2-3)
4. Begin Phase 2: Shared Component Library
5. Start building components using the new design system
