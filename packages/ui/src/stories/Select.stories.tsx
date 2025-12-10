/**
 * Select Component Stories
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../components/Select";

const meta = {
  title: "Components/Select",
  component: Select,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Select dropdown built on Radix UI. Supports keyboard navigation, grouping, and full accessibility.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="orange">Orange</SelectItem>
          <SelectItem value="grape">Grape</SelectItem>
          <SelectItem value="mango">Mango</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-text-primary">
        Preferred Language
      </label>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="es">Spanish</SelectItem>
          <SelectItem value="fr">French</SelectItem>
          <SelectItem value="de">German</SelectItem>
          <SelectItem value="zh">Chinese</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <div className="w-80">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a department" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Clinical</SelectLabel>
            <SelectItem value="cardiology">Cardiology</SelectItem>
            <SelectItem value="neurology">Neurology</SelectItem>
            <SelectItem value="orthopedics">Orthopedics</SelectItem>
            <SelectItem value="pediatrics">Pediatrics</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Administrative</SelectLabel>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="hr">Human Resources</SelectItem>
            <SelectItem value="it">IT Support</SelectItem>
            <SelectItem value="reception">Reception</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Support</SelectLabel>
            <SelectItem value="lab">Laboratory</SelectItem>
            <SelectItem value="pharmacy">Pharmacy</SelectItem>
            <SelectItem value="radiology">Radiology</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Select with grouped options and separators for better organization.",
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-80">
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="This select is disabled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="item1">Item 1</SelectItem>
          <SelectItem value="item2">Item 2</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithDisabledOptions: Story = {
  render: () => (
    <div className="w-80">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a time slot" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="09:00">09:00 AM</SelectItem>
          <SelectItem value="10:00" disabled>
            10:00 AM (Booked)
          </SelectItem>
          <SelectItem value="11:00">11:00 AM</SelectItem>
          <SelectItem value="12:00" disabled>
            12:00 PM (Booked)
          </SelectItem>
          <SelectItem value="13:00">01:00 PM</SelectItem>
          <SelectItem value="14:00">02:00 PM</SelectItem>
          <SelectItem value="15:00" disabled>
            03:00 PM (Booked)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Select with some options disabled to show unavailable choices.",
      },
    },
  },
};

export const ErrorState: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <label className="text-sm font-medium text-text-primary">
        Patient Status <span className="text-error-600">*</span>
      </label>
      <Select>
        <SelectTrigger error>
          <SelectValue placeholder="Select a status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-error-600" role="alert">
        Please select a patient status
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Select in error state with error message.",
      },
    },
  },
};

export const LongList: Story = {
  render: () => (
    <div className="w-80">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a country" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="us">United States</SelectItem>
          <SelectItem value="ca">Canada</SelectItem>
          <SelectItem value="mx">Mexico</SelectItem>
          <SelectItem value="uk">United Kingdom</SelectItem>
          <SelectItem value="fr">France</SelectItem>
          <SelectItem value="de">Germany</SelectItem>
          <SelectItem value="es">Spain</SelectItem>
          <SelectItem value="it">Italy</SelectItem>
          <SelectItem value="jp">Japan</SelectItem>
          <SelectItem value="cn">China</SelectItem>
          <SelectItem value="in">India</SelectItem>
          <SelectItem value="au">Australia</SelectItem>
          <SelectItem value="br">Brazil</SelectItem>
          <SelectItem value="ar">Argentina</SelectItem>
          <SelectItem value="za">South Africa</SelectItem>
          <SelectItem value="eg">Egypt</SelectItem>
          <SelectItem value="ng">Nigeria</SelectItem>
          <SelectItem value="kr">South Korea</SelectItem>
          <SelectItem value="ru">Russia</SelectItem>
          <SelectItem value="se">Sweden</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Select with many options - automatically scrollable with scroll buttons.",
      },
    },
  },
};

export const FormExample: Story = {
  render: () => (
    <div className="w-96 space-y-6">
      <h3 className="text-lg font-semibold text-text-primary">
        Appointment Booking
      </h3>

      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">
          Department <span className="text-error-600">*</span>
        </label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cardiology">Cardiology</SelectItem>
            <SelectItem value="neurology">Neurology</SelectItem>
            <SelectItem value="orthopedics">Orthopedics</SelectItem>
            <SelectItem value="pediatrics">Pediatrics</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">
          Doctor <span className="text-error-600">*</span>
        </label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select a doctor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dr-smith">Dr. Sarah Smith</SelectItem>
            <SelectItem value="dr-johnson">Dr. Michael Johnson</SelectItem>
            <SelectItem value="dr-williams">Dr. Emily Williams</SelectItem>
            <SelectItem value="dr-brown">Dr. Robert Brown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">
          Appointment Type <span className="text-error-600">*</span>
        </label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="consultation">Initial Consultation</SelectItem>
            <SelectItem value="followup">Follow-up Visit</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
            <SelectItem value="routine">Routine Checkup</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">
          Time Slot <span className="text-error-600">*</span>
        </label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select time" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Morning</SelectLabel>
              <SelectItem value="09:00">09:00 AM</SelectItem>
              <SelectItem value="10:00">10:00 AM</SelectItem>
              <SelectItem value="11:00">11:00 AM</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Afternoon</SelectLabel>
              <SelectItem value="13:00">01:00 PM</SelectItem>
              <SelectItem value="14:00">02:00 PM</SelectItem>
              <SelectItem value="15:00">03:00 PM</SelectItem>
              <SelectItem value="16:00">04:00 PM</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Complete form example using multiple Select components for appointment booking.",
      },
    },
  },
};
