# @voiceassist/ui

Shared React component library for VoiceAssist applications. Built with Radix UI primitives and Tailwind CSS.

## Installation

```bash
pnpm add @voiceassist/ui
```

## Peer Dependencies

```bash
pnpm add react react-dom react-i18next
```

## Features

- Accessible components built on Radix UI
- Consistent styling with Tailwind CSS
- Dark mode support via ThemeProvider
- Medical-specific components (HIPAA-compliant)
- Storybook documentation
- Comprehensive test coverage

## Components

### Core Components

```typescript
import { Button, Input, Label, Card, Badge, Avatar, Spinner, Skeleton, IconButton } from "@voiceassist/ui";
```

### Layout Components

```typescript
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "@voiceassist/ui";
```

### Form Components

```typescript
import { Input, Label, Select, SelectTrigger, SelectContent, SelectItem } from "@voiceassist/ui";
```

### Overlay Components

```typescript
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@voiceassist/ui";
```

### Data Display

```typescript
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Avatar,
  AvatarGroup,
} from "@voiceassist/ui";
```

### Feedback Components

```typescript
import { FeedbackRating, FeedbackForm, Spinner, SpinnerOverlay, Skeleton } from "@voiceassist/ui";
```

### Medical Components

```typescript
import { VitalSignCard, MedicationList, MedicationItem, AlertBanner } from "@voiceassist/ui";
```

### Providers

```typescript
import { ThemeProvider, useTheme } from "@voiceassist/ui";
```

## Usage Examples

### Button

```tsx
import { Button } from '@voiceassist/ui';

<Button variant="default" size="md">
  Click me
</Button>

<Button variant="destructive" size="sm">
  Delete
</Button>

<Button variant="outline" disabled>
  Disabled
</Button>
```

### Card

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@voiceassist/ui";

<Card>
  <CardHeader>
    <CardTitle>Patient Summary</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Content goes here</p>
  </CardContent>
</Card>;
```

### Dialog

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, Button } from "@voiceassist/ui";

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
    </DialogHeader>
    <p>Are you sure you want to proceed?</p>
  </DialogContent>
</Dialog>;
```

### ThemeProvider

```tsx
import { ThemeProvider, useTheme } from "@voiceassist/ui";

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <YourApp />
    </ThemeProvider>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Toggle Theme</button>;
}
```

### Medical Components

```tsx
import { VitalSignCard, AlertBanner } from '@voiceassist/ui';

<VitalSignCard
  label="Heart Rate"
  value={72}
  unit="bpm"
  status="normal"
/>

<AlertBanner
  severity="warning"
  title="Drug Interaction"
  message="Potential interaction between medications"
  actions={[
    { label: 'Review', onClick: () => {} }
  ]}
/>
```

## Utilities

### cn() - Class Name Utility

```typescript
import { cn } from "@voiceassist/ui";

// Merge Tailwind classes with conflict resolution
const className = cn("px-4 py-2", isActive && "bg-primary text-white", className);
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm type-check

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run Storybook
pnpm storybook

# Build Storybook
pnpm build-storybook
```

## Storybook

View component documentation and interactive examples:

```bash
pnpm storybook
```

Opens at http://localhost:6006

## Testing

Components include comprehensive tests using Vitest and Testing Library:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Interactive UI
pnpm test:ui
```

## Dependencies

- `@radix-ui/*` - Accessible UI primitives
- `@voiceassist/design-tokens` - Design tokens
- `class-variance-authority` - Variant management
- `clsx` + `tailwind-merge` - Class name utilities
