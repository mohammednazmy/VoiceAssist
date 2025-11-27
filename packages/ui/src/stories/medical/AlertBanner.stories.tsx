/**
 * AlertBanner Component Stories
 * Storybook documentation and examples for the AlertBanner component
 */

import type { Meta, StoryObj } from "@storybook/react";
import { AlertBanner } from "../../components/medical/AlertBanner";

const meta = {
  title: "Medical/AlertBanner",
  component: AlertBanner,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Clinical alert banner for important notifications, warnings, and critical alerts. Supports auto-dismiss, action buttons, and accessibility features.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    severity: {
      control: "select",
      options: ["info", "success", "warning", "critical"],
      description: "Severity level of the alert",
    },
    variant: {
      control: "select",
      options: ["default", "subtle", "solid"],
      description: "Visual variant of the alert",
    },
    dismissible: {
      control: "boolean",
      description: "Whether the alert can be dismissed",
    },
    showIcon: {
      control: "boolean",
      description: "Whether to show the severity icon",
    },
    autoDismiss: {
      control: "number",
      description: "Auto-dismiss after specified milliseconds",
    },
  },
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Info alert
export const Info: Story = {
  args: {
    severity: "info",
    title: "Information",
    message:
      "Patient has an upcoming appointment scheduled for tomorrow at 2:00 PM.",
  },
};

// Success alert
export const Success: Story = {
  args: {
    severity: "success",
    title: "Medication Reconciliation Complete",
    message: "All medications have been reviewed and verified.",
  },
};

// Warning alert
export const Warning: Story = {
  args: {
    severity: "warning",
    title: "Drug Interaction Alert",
    message:
      "Warfarin and Aspirin may increase bleeding risk. Consider monitoring INR more frequently.",
  },
};

// Critical alert
export const Critical: Story = {
  args: {
    severity: "critical",
    title: "Critical Lab Result",
    message:
      "Potassium level: 6.2 mEq/L (Critical High). Immediate attention required.",
  },
};

// Dismissible
export const Dismissible: Story = {
  args: {
    severity: "info",
    title: "Reminder",
    message: "Patient consent form needs to be signed before procedure.",
    dismissible: true,
    onDismiss: () => console.log("Alert dismissed"),
  },
};

// Auto-dismiss
export const AutoDismiss: Story = {
  args: {
    severity: "success",
    title: "Changes Saved",
    message: "Patient record has been updated successfully.",
    autoDismiss: 5000,
    onDismiss: () => console.log("Auto-dismissed"),
  },
};

// With actions
export const WithActions: Story = {
  args: {
    severity: "warning",
    title: "Drug Interaction Detected",
    message:
      "Metformin may cause lactic acidosis in patients with renal impairment.",
    actions: [
      { label: "View Details", onClick: () => alert("View details clicked") },
      {
        label: "Dismiss",
        onClick: () => alert("Dismiss clicked"),
        variant: "secondary",
      },
    ],
  },
};

// Without icon
export const WithoutIcon: Story = {
  args: {
    severity: "info",
    title: "Note",
    message: "This is an alert without the default severity icon.",
    showIcon: false,
  },
};

// Subtle variant
export const SubtleVariant: Story = {
  args: {
    severity: "warning",
    variant: "subtle",
    title: "Allergy Warning",
    message: "Patient has documented penicillin allergy.",
  },
};

// Solid variant
export const SolidVariant: Story = {
  args: {
    severity: "critical",
    variant: "solid",
    title: "Code Blue",
    message: "Cardiac arrest in Room 302. Emergency response team activated.",
  },
};

// With custom content
export const WithCustomContent: Story = {
  args: {
    severity: "warning",
    title: "Multiple Interactions Found",
    message: "The following drug combinations require attention:",
    children: (
      <ul
        style={{ marginTop: "8px", paddingLeft: "20px", listStyleType: "disc" }}
      >
        <li>Warfarin + Aspirin: Increased bleeding risk</li>
        <li>Lisinopril + Potassium: Risk of hyperkalemia</li>
        <li>Metformin + Contrast dye: Risk of lactic acidosis</li>
      </ul>
    ),
  },
};

// All severities showcase
export const AllSeverities: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxWidth: "600px",
      }}
    >
      <AlertBanner
        severity="info"
        title="Information"
        message="Patient has completed pre-operative checklist."
      />
      <AlertBanner
        severity="success"
        title="Success"
        message="Lab results are within normal limits."
      />
      <AlertBanner
        severity="warning"
        title="Warning"
        message="Patient is due for annual wellness visit."
      />
      <AlertBanner
        severity="critical"
        title="Critical"
        message="Abnormal ECG pattern detected. Cardiology consultation recommended."
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "A showcase of all alert severity levels: info, success, warning, and critical.",
      },
    },
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxWidth: "600px",
      }}
    >
      <AlertBanner
        severity="warning"
        variant="default"
        title="Default Variant"
        message="Standard alert with border accent."
      />
      <AlertBanner
        severity="warning"
        variant="subtle"
        title="Subtle Variant"
        message="Reduced opacity background for less visual weight."
      />
      <AlertBanner
        severity="warning"
        variant="solid"
        title="Solid Variant"
        message="Solid background for maximum visibility."
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "A showcase of all alert visual variants.",
      },
    },
  },
};

// Clinical workflow example
export const ClinicalWorkflow: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxWidth: "700px",
      }}
    >
      <AlertBanner
        severity="critical"
        title="Allergy Alert"
        message="Patient has severe anaphylactic reaction to Penicillin documented."
        showIcon={true}
      />
      <AlertBanner
        severity="warning"
        title="Drug Interaction"
        message="Current medication regimen includes Warfarin + Aspirin combination."
        actions={[{ label: "Review Medications", onClick: () => {} }]}
      />
      <AlertBanner
        severity="info"
        title="Clinical Reminder"
        message="Patient is due for diabetic foot exam (last performed 14 months ago)."
        dismissible={true}
      />
      <AlertBanner
        severity="success"
        title="Preventive Care"
        message="All immunizations are up to date."
        dismissible={true}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Example of alerts in a clinical workflow context with various priorities and actions.",
      },
    },
  },
};
