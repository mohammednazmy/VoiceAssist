/**
 * Badge Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '../components/Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Small count and labeling component for status indicators, counts, and labels.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'success', 'warning', 'error', 'outline'],
      description: 'The visual style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'The size of the badge',
    },
    dot: {
      control: 'boolean',
      description: 'Show a dot indicator',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'default',
    size: 'md',
  },
};

export const Primary: Story = {
  args: {
    children: 'Primary',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
  },
};

export const Success: Story = {
  args: {
    children: 'Success',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    children: 'Warning',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    children: 'Error',
    variant: 'error',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
  },
};

export const WithDot: Story = {
  args: {
    children: 'Online',
    variant: 'success',
    dot: true,
  },
};

export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available badge variants',
      },
    },
  },
};

export const WithDots: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success" dot>Online</Badge>
      <Badge variant="error" dot>Offline</Badge>
      <Badge variant="warning" dot>Away</Badge>
      <Badge variant="primary" dot>Busy</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Badges with status dot indicators',
      },
    },
  },
};

export const Counts: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">Notifications</span>
        <Badge variant="error">12</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Messages</span>
        <Badge variant="primary">3</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Tasks</span>
        <Badge variant="success">5</Badge>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Using badges for notification counts',
      },
    },
  },
};
