/**
 * VitalSignCard Component Stories
 * Storybook documentation and examples for the VitalSignCard component
 */

import type { Meta, StoryObj } from "@storybook/react";
import { VitalSignCard } from "../../components/medical/VitalSignCard";

const meta = {
  title: "Medical/VitalSignCard",
  component: VitalSignCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Displays a single vital sign with status indication, trend indicators, and normal range reference. Designed for clinical monitoring interfaces.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["normal", "warning", "critical", "unknown"],
      description: "Current status of the vital sign",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "Size variant of the card",
    },
    trend: {
      control: "select",
      options: ["up", "down", "stable", undefined],
      description: "Trend direction indicator",
    },
    showStatusBadge: {
      control: "boolean",
      description: "Whether to show the status badge",
    },
    loading: {
      control: "boolean",
      description: "Whether the card is in loading state",
    },
  },
} satisfies Meta<typeof VitalSignCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Normal heart rate
export const NormalHeartRate: Story = {
  args: {
    label: "Heart Rate",
    value: 72,
    unit: "bpm",
    status: "normal",
    trend: "stable",
    normalRange: { min: 60, max: 100 },
    timestamp: new Date(),
  },
};

// Warning state
export const WarningBloodPressure: Story = {
  args: {
    label: "Blood Pressure",
    value: 145,
    secondaryValue: 92,
    unit: "mmHg",
    status: "warning",
    trend: "up",
    normalRange: { min: 90, max: 120 },
    timestamp: new Date(),
  },
};

// Critical state
export const CriticalOxygen: Story = {
  args: {
    label: "SpO2",
    value: 88,
    unit: "%",
    status: "critical",
    trend: "down",
    normalRange: { min: 95, max: 100 },
    timestamp: new Date(),
    showStatusBadge: true,
  },
};

// Unknown state
export const UnknownTemperature: Story = {
  args: {
    label: "Temperature",
    value: "--",
    unit: "°F",
    status: "unknown",
  },
};

// Loading state
export const Loading: Story = {
  args: {
    label: "Heart Rate",
    value: 0,
    unit: "bpm",
    loading: true,
  },
};

// Small size
export const SmallSize: Story = {
  args: {
    label: "HR",
    value: 68,
    unit: "bpm",
    status: "normal",
    size: "sm",
  },
};

// Large size
export const LargeSize: Story = {
  args: {
    label: "Heart Rate",
    value: 72,
    unit: "bpm",
    status: "normal",
    size: "lg",
    trend: "stable",
    normalRange: { min: 60, max: 100 },
    timestamp: new Date(),
  },
};

// Interactive (clickable)
export const Interactive: Story = {
  args: {
    label: "Heart Rate",
    value: 72,
    unit: "bpm",
    status: "normal",
    trend: "stable",
    onPress: () => alert("Card clicked!"),
  },
};

// With status badge
export const WithStatusBadge: Story = {
  args: {
    label: "Blood Pressure",
    value: 120,
    secondaryValue: 80,
    unit: "mmHg",
    status: "normal",
    showStatusBadge: true,
    normalRange: { min: 90, max: 120 },
  },
};

// All statuses showcase
export const AllStatuses: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "16px",
        width: "600px",
      }}
    >
      <VitalSignCard
        label="Heart Rate"
        value={72}
        unit="bpm"
        status="normal"
        trend="stable"
        normalRange={{ min: 60, max: 100 }}
      />
      <VitalSignCard
        label="Blood Pressure"
        value={145}
        secondaryValue={92}
        unit="mmHg"
        status="warning"
        trend="up"
        normalRange={{ min: 90, max: 120 }}
      />
      <VitalSignCard
        label="SpO2"
        value={88}
        unit="%"
        status="critical"
        trend="down"
        normalRange={{ min: 95, max: 100 }}
      />
      <VitalSignCard
        label="Temperature"
        value="--"
        unit="°F"
        status="unknown"
      />
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "A showcase of all vital sign status states: normal, warning, critical, and unknown.",
      },
    },
  },
};

// Real-world dashboard example
export const DashboardExample: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "16px",
        width: "800px",
      }}
    >
      <VitalSignCard
        label="Heart Rate"
        value={72}
        unit="bpm"
        status="normal"
        trend="stable"
        normalRange={{ min: 60, max: 100 }}
        timestamp={new Date()}
      />
      <VitalSignCard
        label="Blood Pressure"
        value={118}
        secondaryValue={76}
        unit="mmHg"
        status="normal"
        trend="stable"
        normalRange={{ min: 90, max: 120 }}
        timestamp={new Date()}
      />
      <VitalSignCard
        label="SpO2"
        value={98}
        unit="%"
        status="normal"
        trend="stable"
        normalRange={{ min: 95, max: 100 }}
        timestamp={new Date()}
      />
      <VitalSignCard
        label="Temperature"
        value={98.6}
        unit="°F"
        status="normal"
        trend="stable"
        normalRange={{ min: 97, max: 99 }}
        timestamp={new Date()}
      />
      <VitalSignCard
        label="Respiratory Rate"
        value={16}
        unit="breaths/min"
        status="normal"
        trend="stable"
        normalRange={{ min: 12, max: 20 }}
        timestamp={new Date()}
      />
      <VitalSignCard
        label="Pain Level"
        value={2}
        unit="/10"
        status="normal"
        trend="down"
        normalRange={{ min: 0, max: 3 }}
        timestamp={new Date()}
      />
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Example of a patient monitoring dashboard with multiple vital sign cards.",
      },
    },
  },
};
