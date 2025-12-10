/**
 * Avatar Component Stories
 */

import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarGroup } from "../components/Avatar";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Display user profile images or initials with optional status indicators.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg", "xl"],
      description: "The size of the avatar",
    },
    status: {
      control: "select",
      options: ["online", "offline", "busy", "away", undefined],
      description: "Status indicator",
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    alt: "John Doe",
  },
};

export const WithImage: Story = {
  args: {
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=John",
    alt: "John Doe",
  },
};

export const WithInitials: Story = {
  args: {
    initials: "JD",
    alt: "John Doe",
  },
};

export const WithStatus: Story = {
  args: {
    initials: "JD",
    alt: "John Doe",
    status: "online",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar size="xs" initials="XS" alt="Extra Small" />
      <Avatar size="sm" initials="SM" alt="Small" />
      <Avatar size="md" initials="MD" alt="Medium" />
      <Avatar size="lg" initials="LG" alt="Large" />
      <Avatar size="xl" initials="XL" alt="Extra Large" />
    </div>
  ),
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex gap-4">
      <Avatar initials="ON" alt="Online" status="online" />
      <Avatar initials="OF" alt="Offline" status="offline" />
      <Avatar initials="BS" alt="Busy" status="busy" />
      <Avatar initials="AW" alt="Away" status="away" />
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup max={3}>
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=1"
        alt="User 1"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=2"
        alt="User 2"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=3"
        alt="User 3"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=4"
        alt="User 4"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=5"
        alt="User 5"
      />
    </AvatarGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: "Group of avatars with overflow count (+2)",
      },
    },
  },
};

export const GroupSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <AvatarGroup size="sm" max={3}>
        <Avatar initials="A" alt="A" />
        <Avatar initials="B" alt="B" />
        <Avatar initials="C" alt="C" />
        <Avatar initials="D" alt="D" />
      </AvatarGroup>
      <AvatarGroup size="md" max={3}>
        <Avatar initials="A" alt="A" />
        <Avatar initials="B" alt="B" />
        <Avatar initials="C" alt="C" />
        <Avatar initials="D" alt="D" />
      </AvatarGroup>
      <AvatarGroup size="lg" max={3}>
        <Avatar initials="A" alt="A" />
        <Avatar initials="B" alt="B" />
        <Avatar initials="C" alt="C" />
        <Avatar initials="D" alt="D" />
      </AvatarGroup>
    </div>
  ),
};
