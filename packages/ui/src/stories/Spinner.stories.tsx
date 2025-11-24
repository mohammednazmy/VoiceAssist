/**
 * Spinner Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Spinner, SpinnerOverlay } from '../components/Spinner';

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Loading indicator with multiple sizes and color variants. Use for indicating loading states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the spinner',
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'neutral', 'white', 'current'],
      description: 'The color variant',
    },
    label: {
      control: 'text',
      description: 'Accessible label for screen readers',
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 'md',
    color: 'primary',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-text-tertiary">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-xs text-text-tertiary">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-xs text-text-tertiary">Large</span>
      </div>
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner color="primary" />
        <span className="text-xs text-text-tertiary">Primary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner color="secondary" />
        <span className="text-xs text-text-tertiary">Secondary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner color="neutral" />
        <span className="text-xs text-text-tertiary">Neutral</span>
      </div>
      <div className="flex flex-col items-center gap-2 bg-neutral-900 p-4 rounded">
        <Spinner color="white" />
        <span className="text-xs text-white">White</span>
      </div>
    </div>
  ),
};

export const Overlay: Story = {
  render: () => (
    <div className="relative h-64 w-96 bg-neutral-100 rounded-lg dark:bg-neutral-800">
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Sample Content</h3>
        <p className="text-text-secondary">
          This content is covered by a loading overlay.
        </p>
      </div>
      <SpinnerOverlay show={true} text="Loading..." />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Full-page or container overlay with spinner and optional text.',
      },
    },
  },
};

export const WithText: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner size="sm" />
      <span className="text-sm text-text-secondary">Loading data...</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Spinner combined with loading text for better UX.',
      },
    },
  },
};
