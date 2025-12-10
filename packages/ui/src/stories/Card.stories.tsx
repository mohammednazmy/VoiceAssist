/**
 * Card Component Stories
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../components/Card";
import { Button } from "../components/Button";

const meta = {
  title: "Components/Card",
  component: Card,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A flexible container component for grouping related content. Supports multiple variants and composition patterns.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "bordered", "elevated"],
      description: "The visual variant",
    },
    hoverable: {
      control: "boolean",
      description: "Show hover effect",
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>
          This is a card description that provides additional context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-text-secondary">
          Card content goes here. You can include any content you like.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="primary">Action</Button>
        <Button variant="outline">Cancel</Button>
      </CardFooter>
    </Card>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-96">
      <Card variant="default">
        <CardHeader>
          <CardTitle>Default Card</CardTitle>
          <CardDescription>
            Standard card with border and shadow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary">This is a default card variant.</p>
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Bordered Card</CardTitle>
          <CardDescription>Card with prominent border</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary">
            This is a bordered card variant.
          </p>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Elevated Card</CardTitle>
          <CardDescription>Card with elevated shadow</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary">
            This is an elevated card variant.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const Hoverable: Story = {
  render: () => (
    <div className="flex gap-6">
      <Card variant="default" hoverable className="w-64">
        <CardHeader>
          <CardTitle>Hover Me</CardTitle>
          <CardDescription>This card has hover effects</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary">
            Try hovering over this card to see the effect.
          </p>
        </CardContent>
      </Card>

      <Card variant="elevated" hoverable className="w-64">
        <CardHeader>
          <CardTitle>Interactive</CardTitle>
          <CardDescription>Clickable card example</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary">
            Use for clickable cards or navigation.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Cards with hover effects for interactive use cases.",
      },
    },
  },
};

export const WithImage: Story = {
  render: () => (
    <Card className="w-96">
      <div className="aspect-video bg-gradient-to-br from-primary-500 to-secondary-500 rounded-t-lg" />
      <CardHeader>
        <CardTitle>Card with Image</CardTitle>
        <CardDescription>Card featuring a header image</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-text-secondary">
          Content can follow an image or other media element.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="primary" className="w-full">
          Learn More
        </Button>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: "Card with an image header for richer visual presentation.",
      },
    },
  },
};

export const SimpleCard: Story = {
  render: () => (
    <Card className="w-64 p-6">
      <p className="text-text-primary">
        Simple card without using the composition components. Just plain
        content.
      </p>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: "Simple card using direct children instead of composition.",
      },
    },
  },
};

export const GridLayout: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 max-w-4xl">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} variant="default" hoverable>
          <CardHeader>
            <CardTitle>Feature {i}</CardTitle>
            <CardDescription>Feature description</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-text-secondary">Content for feature {i}.</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Cards arranged in a grid layout for feature showcases or dashboards.",
      },
    },
  },
};

export const DashboardCard: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Total Patients</CardTitle>
          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center dark:bg-primary-900/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-primary-600"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-text-primary">1,247</div>
        <p className="text-sm text-success-600 mt-1">↑ 12% from last month</p>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: "Healthcare dashboard card example with metrics.",
      },
    },
  },
};
