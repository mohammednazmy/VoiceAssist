/**
 * IconButton Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { IconButton } from '../components/IconButton';

// Example icons
const SearchIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const PlusIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const HeartIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const TrashIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Button component specifically designed for icons. Supports all button variants with circular or square shapes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success'],
      description: 'The visual variant',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: 'The size of the button',
    },
    shape: {
      control: 'select',
      options: ['circle', 'square'],
      description: 'The shape of the button',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading spinner',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the button',
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: SearchIcon,
    'aria-label': 'Search',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <IconButton variant="primary" icon={PlusIcon} aria-label="Add" />
      <IconButton variant="secondary" icon={HeartIcon} aria-label="Like" />
      <IconButton variant="outline" icon={SearchIcon} aria-label="Search" />
      <IconButton variant="ghost" icon={HeartIcon} aria-label="Like" />
      <IconButton variant="danger" icon={TrashIcon} aria-label="Delete" />
      <IconButton variant="success" icon={PlusIcon} aria-label="Create" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <div className="flex flex-col items-center gap-2">
        <IconButton size="xs" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">XS</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconButton size="sm" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">SM</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconButton size="md" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">MD</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconButton size="lg" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">LG</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconButton size="xl" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">XL</span>
      </div>
    </div>
  ),
};

export const Shapes: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-2">
        <IconButton shape="circle" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">Circle</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconButton shape="square" icon={SearchIcon} aria-label="Search" />
        <span className="text-xs text-text-tertiary">Square</span>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'IconButton supports both circular and square shapes.',
      },
    },
  },
};

export const Loading: Story = {
  render: () => (
    <div className="flex gap-4">
      <IconButton loading icon={SearchIcon} aria-label="Loading" />
      <IconButton loading variant="secondary" icon={HeartIcon} aria-label="Loading" />
      <IconButton loading variant="outline" icon={PlusIcon} aria-label="Loading" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'IconButton with loading state shows a spinner.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex gap-4">
      <IconButton disabled icon={SearchIcon} aria-label="Search" />
      <IconButton disabled variant="secondary" icon={HeartIcon} aria-label="Like" />
      <IconButton disabled variant="danger" icon={TrashIcon} aria-label="Delete" />
    </div>
  ),
};

export const ActionButtons: Story = {
  render: () => (
    <div className="flex gap-2">
      <IconButton
        variant="ghost"
        size="sm"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        }
        aria-label="Edit"
      />
      <IconButton
        variant="ghost"
        size="sm"
        icon={TrashIcon}
        aria-label="Delete"
      />
      <IconButton
        variant="ghost"
        size="sm"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        }
        aria-label="Refresh"
      />
      <IconButton
        variant="ghost"
        size="sm"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        }
        aria-label="More options"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Common action buttons for tables and lists.',
      },
    },
  },
};

export const FloatingActionButton: Story = {
  render: () => (
    <div className="relative h-64 w-96 bg-neutral-100 rounded-lg dark:bg-neutral-800 p-4">
      <p className="text-text-secondary">Content area</p>
      <IconButton
        variant="primary"
        size="lg"
        icon={PlusIcon}
        aria-label="Add new item"
        className="absolute bottom-4 right-4 shadow-lg"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Floating action button (FAB) positioned over content.',
      },
    },
  },
};
