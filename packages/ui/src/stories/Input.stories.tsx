/**
 * Input Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../components/Input';

const meta = {
  title: 'Components/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Text input field with support for labels, helper text, error states, and icons.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    inputSize: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the input',
    },
    error: {
      control: 'boolean',
      description: 'Show error state',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the input',
    },
    required: {
      control: 'boolean',
      description: 'Mark as required',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Make input full width',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Username',
    placeholder: 'johndoe',
    helperText: 'Choose a unique username between 3-20 characters',
  },
};

export const WithError: Story = {
  args: {
    label: 'Password',
    placeholder: 'Enter password',
    type: 'password',
    error: true,
    errorMessage: 'Password must be at least 8 characters',
  },
};

export const Required: Story = {
  args: {
    label: 'Full Name',
    placeholder: 'John Doe',
    required: true,
    helperText: 'This field is required',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-96">
      <Input
        inputSize="sm"
        label="Small Input"
        placeholder="Small size"
      />
      <Input
        inputSize="md"
        label="Medium Input"
        placeholder="Medium size (default)"
      />
      <Input
        inputSize="lg"
        label="Large Input"
        placeholder="Large size"
      />
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-96">
      <Input
        label="Search"
        placeholder="Search..."
        iconLeft={
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
        }
      />
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        iconRight={
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
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        }
      />
      <Input
        label="Amount"
        type="number"
        placeholder="0.00"
        iconLeft={<span className="text-sm">$</span>}
        iconRight={<span className="text-sm">USD</span>}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Inputs with left and/or right icons for enhanced UX.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true,
    value: 'Disabled value',
  },
};

export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-96">
      <Input
        label="Text"
        type="text"
        placeholder="Enter text"
      />
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
      />
      <Input
        label="Number"
        type="number"
        placeholder="0"
      />
      <Input
        label="Date"
        type="date"
      />
      <Input
        label="Time"
        type="time"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Different HTML5 input types supported.',
      },
    },
  },
};

export const FormExample: Story = {
  render: () => (
    <div className="w-96 space-y-4">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Patient Registration</h3>

      <Input
        label="Patient Name"
        placeholder="John Doe"
        required
      />

      <Input
        label="Date of Birth"
        type="date"
        required
      />

      <Input
        label="Medical Record Number"
        placeholder="MRN-123456"
        helperText="Unique identifier for patient records"
      />

      <Input
        label="Email"
        type="email"
        placeholder="patient@example.com"
        iconRight={
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
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        }
      />

      <Input
        label="Phone"
        type="tel"
        placeholder="+1 (555) 123-4567"
        iconLeft={
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
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        }
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Example healthcare form using multiple input components.',
      },
    },
  },
};
