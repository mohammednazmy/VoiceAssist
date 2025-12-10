/**
 * Skeleton Component Stories
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
} from "../components/Skeleton";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Loading placeholder with pulse animation. Use to indicate content is being loaded.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["text", "circle", "rectangle"],
      description: "The shape variant",
    },
    width: {
      control: "text",
      description: "Width of the skeleton (CSS value)",
    },
    height: {
      control: "text",
      description: "Height of the skeleton (CSS value)",
    },
    lines: {
      control: "number",
      description: "Number of text lines (for text variant)",
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "rectangle",
    width: "200px",
    height: "100px",
  },
};

export const Text: Story = {
  render: () => (
    <div className="w-96 space-y-2">
      <Skeleton variant="text" />
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="75%" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Text skeleton for loading text content.",
      },
    },
  },
};

export const TextLines: Story = {
  render: () => (
    <div className="w-96">
      <Skeleton variant="text" lines={4} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Multiple text lines with automatic width variation on the last line.",
      },
    },
  },
};

export const Circle: Story = {
  render: () => (
    <div className="flex gap-4">
      <Skeleton variant="circle" width="40px" height="40px" />
      <Skeleton variant="circle" width="64px" height="64px" />
      <Skeleton variant="circle" width="96px" height="96px" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Circular skeleton for avatars and profile pictures.",
      },
    },
  },
};

export const Rectangle: Story = {
  render: () => (
    <div className="flex gap-4">
      <Skeleton variant="rectangle" width="100px" height="100px" />
      <Skeleton variant="rectangle" width="200px" height="120px" />
      <Skeleton variant="rectangle" width="300px" height="180px" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Rectangular skeleton for images and cards.",
      },
    },
  },
};

export const AvatarSkeleton: Story = {
  render: () => (
    <div className="flex gap-4">
      <SkeletonAvatar />
      <div className="flex-1">
        <Skeleton variant="text" width="150px" />
        <Skeleton variant="text" width="100px" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Pre-configured avatar skeleton with accompanying text.",
      },
    },
  },
};

export const CardSkeleton: Story = {
  render: () => (
    <div className="w-96">
      <SkeletonCard />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Pre-configured card skeleton for loading card content.",
      },
    },
  },
};

export const TableSkeleton: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Email</th>
            <th className="text-left p-2">Role</th>
            <th className="text-left p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          <SkeletonTableRow columns={4} />
          <SkeletonTableRow columns={4} />
          <SkeletonTableRow columns={4} />
          <SkeletonTableRow columns={4} />
        </tbody>
      </table>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Pre-configured table row skeleton for loading table data.",
      },
    },
  },
};

export const ComplexLayout: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="space-y-2">
        <Skeleton variant="text" lines={5} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Complex layout combining multiple skeleton types.",
      },
    },
  },
};
