# Task: Add a New Frontend Component

Step-by-step checklist for adding a new React component to VoiceAssist.

## Prerequisites

- [ ] Frontend running (`cd apps/web-app && pnpm dev`)
- [ ] Understand the component requirements
- [ ] Know which page/feature it belongs to

## Steps

### 1. Create the Component

**Location:** `apps/web-app/src/components/`

```tsx
// apps/web-app/src/components/my-feature/MyComponent.tsx

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onAction?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={handleClick} disabled={isLoading}>
          {isLoading ? "Loading..." : "Do Action"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] Created component file
- [ ] Added TypeScript interface for props
- [ ] Used existing UI components from `@/components/ui/`
- [ ] Added loading states if async

### 2. Add Index Export

**Location:** `apps/web-app/src/components/my-feature/index.ts`

```tsx
export { MyComponent } from "./MyComponent";
```

- [ ] Created index.ts for barrel export

### 3. Create Hook for Data Fetching (if needed)

**Location:** `apps/web-app/src/hooks/`

```tsx
// apps/web-app/src/hooks/useMyFeature.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

interface MyFeatureData {
  id: string;
  name: string;
}

export function useMyFeature() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-feature"],
    queryFn: () => apiClient.get<MyFeatureData[]>("/api/my-feature"),
  });

  const createMutation = useMutation({
    mutationFn: (newItem: { name: string }) => apiClient.post<MyFeatureData>("/api/my-feature", newItem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-feature"] });
    },
  });

  return {
    data,
    isLoading,
    error,
    create: createMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
```

- [ ] Created custom hook
- [ ] Used React Query for data fetching
- [ ] Added mutation for create/update/delete
- [ ] Handled loading and error states

### 4. Add to Page

**Location:** `apps/web-app/src/app/`

```tsx
// apps/web-app/src/app/my-feature/page.tsx

import { MyComponent } from "@/components/my-feature";
import { useMyFeature } from "@/hooks/useMyFeature";

export default function MyFeaturePage() {
  const { data, create } = useMyFeature();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">My Feature</h1>
      <MyComponent title="Create Item" onAction={() => create({ name: "New" })} />
    </div>
  );
}
```

- [ ] Created page file
- [ ] Used component with hook
- [ ] Added proper layout/styling

### 5. Add Types (if needed)

**Location:** `packages/types/src/`

```typescript
// packages/types/src/my-feature.ts

export interface MyFeatureItem {
  id: string;
  name: string;
  createdAt: Date;
}

export interface CreateMyFeatureRequest {
  name: string;
}
```

- [ ] Added shared types if used across packages
- [ ] Exported from `packages/types/src/index.ts`

### 6. Add Tests

**Location:** `apps/web-app/src/components/my-feature/__tests__/`

```tsx
// MyComponent.test.tsx

import { render, screen, fireEvent } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  it("renders title", () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("calls onAction when button clicked", async () => {
    const onAction = vi.fn();
    render(<MyComponent title="Test" onAction={onAction} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onAction).toHaveBeenCalled();
  });
});
```

- [ ] Created test file
- [ ] Added rendering tests
- [ ] Added interaction tests
- [ ] Tests pass: `pnpm test MyComponent`

### 7. Add Storybook Story (optional)

**Location:** `apps/web-app/src/components/my-feature/`

```tsx
// MyComponent.stories.tsx

import type { Meta, StoryObj } from "@storybook/react";
import { MyComponent } from "./MyComponent";

const meta: Meta<typeof MyComponent> = {
  component: MyComponent,
  title: "Features/MyComponent",
};

export default meta;

type Story = StoryObj<typeof MyComponent>;

export const Default: Story = {
  args: {
    title: "Example Title",
  },
};
```

- [ ] Created story file (if using Storybook)

## Verification

```bash
# Run tests
pnpm test MyComponent

# Check types
pnpm type-check

# Visual check in browser
pnpm dev
# Navigate to http://localhost:3000/my-feature
```

## Common Issues

1. **Import path errors**: Use `@/` alias for absolute imports
2. **Type errors**: Ensure props interface matches usage
3. **Hook dependency warnings**: Check useEffect dependencies
4. **Styling issues**: Use Tailwind classes or shadcn/ui components
