/**
 * MedicationList Component Stories
 * Storybook documentation and examples for the MedicationList component
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  MedicationList,
  type Medication,
} from "../../components/medical/MedicationList";

// Sample medications data
const sampleMedications: Medication[] = [
  {
    id: "1",
    name: "Aspirin",
    dosage: "81mg",
    frequency: "Once daily",
    route: "Oral",
    startDate: new Date("2024-01-15"),
    prescriber: "Dr. Smith",
    active: true,
  },
  {
    id: "2",
    name: "Lisinopril",
    dosage: "10mg",
    frequency: "Once daily",
    route: "Oral",
    startDate: new Date("2024-02-01"),
    prescriber: "Dr. Johnson",
    active: true,
  },
  {
    id: "3",
    name: "Metformin",
    dosage: "500mg",
    frequency: "Twice daily",
    route: "Oral",
    startDate: new Date("2023-11-20"),
    prescriber: "Dr. Williams",
    active: true,
    notes: "Take with food",
  },
];

const medicationsWithInteractions: Medication[] = [
  {
    id: "1",
    name: "Warfarin",
    dosage: "5mg",
    frequency: "Once daily",
    route: "Oral",
    startDate: new Date("2024-01-15"),
    prescriber: "Dr. Smith",
    interactions: ["Aspirin", "Ibuprofen", "Naproxen"],
    active: true,
  },
  {
    id: "2",
    name: "Aspirin",
    dosage: "81mg",
    frequency: "Once daily",
    route: "Oral",
    startDate: new Date("2024-02-01"),
    interactions: ["Warfarin"],
    active: true,
  },
  ...sampleMedications.slice(1),
];

const medicationsWithContraindications: Medication[] = [
  {
    id: "1",
    name: "Metformin",
    dosage: "1000mg",
    frequency: "Twice daily",
    route: "Oral",
    startDate: new Date("2024-01-15"),
    contraindications: ["Kidney disease (GFR < 30)", "Acute heart failure"],
    active: true,
  },
  ...sampleMedications.slice(0, 2),
];

const meta = {
  title: "Medical/MedicationList",
  component: MedicationList,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Displays a list of patient medications with drug interaction warnings, contraindication highlights, and detailed medication information. Designed for medication reconciliation and clinical review interfaces.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "compact", "card"],
      description: "Visual variant of the list",
    },
    showInteractions: {
      control: "boolean",
      description: "Whether to show drug interaction warnings",
    },
    showContraindications: {
      control: "boolean",
      description: "Whether to show contraindication warnings",
    },
    showRoute: {
      control: "boolean",
      description: "Whether to show route of administration",
    },
    showPrescriber: {
      control: "boolean",
      description: "Whether to show prescriber information",
    },
    loading: {
      control: "boolean",
      description: "Whether the list is in loading state",
    },
  },
} satisfies Meta<typeof MedicationList>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic list
export const Default: Story = {
  args: {
    medications: sampleMedications,
    showRoute: true,
    showPrescriber: true,
  },
};

// With drug interactions
export const WithInteractions: Story = {
  args: {
    medications: medicationsWithInteractions,
    showInteractions: true,
    showRoute: true,
  },
};

// With contraindications
export const WithContraindications: Story = {
  args: {
    medications: medicationsWithContraindications,
    showContraindications: true,
    showInteractions: true,
    showRoute: true,
  },
};

// Loading state
export const Loading: Story = {
  args: {
    medications: [],
    loading: true,
    loadingCount: 4,
  },
};

// Empty state
export const Empty: Story = {
  args: {
    medications: [],
    emptyMessage: "No active medications on file",
  },
};

// Compact variant
export const Compact: Story = {
  args: {
    medications: sampleMedications,
    variant: "compact",
    showRoute: false,
    showPrescriber: false,
  },
};

// Interactive (clickable items)
export const Interactive: Story = {
  args: {
    medications: sampleMedications,
    showRoute: true,
    onMedicationClick: (med) => alert(`Clicked: ${med.name}`),
  },
};

// With inactive medications
export const WithInactiveMedications: Story = {
  args: {
    medications: [
      ...sampleMedications,
      {
        id: "4",
        name: "Atorvastatin",
        dosage: "20mg",
        frequency: "Once daily at bedtime",
        route: "Oral",
        startDate: new Date("2023-06-01"),
        endDate: new Date("2024-01-01"),
        prescriber: "Dr. Davis",
        active: false,
        notes: "Discontinued due to muscle pain",
      },
    ],
    showRoute: true,
    showPrescriber: true,
  },
};

// Full medication reconciliation view
export const FullReconciliation: Story = {
  render: () => (
    <div style={{ maxWidth: "800px" }}>
      <h2
        style={{
          marginBottom: "16px",
          fontWeight: "bold",
          fontSize: "1.25rem",
        }}
      >
        Medication Reconciliation
      </h2>
      <MedicationList
        medications={[
          {
            id: "1",
            name: "Warfarin",
            dosage: "5mg",
            frequency: "Once daily",
            route: "Oral",
            startDate: new Date("2024-01-15"),
            prescriber: "Dr. Smith",
            interactions: ["Aspirin"],
            active: true,
            notes: "INR goal: 2.0-3.0",
          },
          {
            id: "2",
            name: "Aspirin",
            dosage: "81mg",
            frequency: "Once daily",
            route: "Oral",
            startDate: new Date("2024-02-01"),
            prescriber: "Dr. Smith",
            interactions: ["Warfarin"],
            active: true,
          },
          {
            id: "3",
            name: "Lisinopril",
            dosage: "10mg",
            frequency: "Once daily",
            route: "Oral",
            startDate: new Date("2024-02-01"),
            prescriber: "Dr. Johnson",
            active: true,
          },
          {
            id: "4",
            name: "Metformin",
            dosage: "500mg",
            frequency: "Twice daily",
            route: "Oral",
            startDate: new Date("2023-11-20"),
            prescriber: "Dr. Williams",
            active: true,
            notes: "Take with food to reduce GI side effects",
          },
          {
            id: "5",
            name: "Omeprazole",
            dosage: "20mg",
            frequency: "Once daily before breakfast",
            route: "Oral",
            startDate: new Date("2024-03-01"),
            prescriber: "Dr. Davis",
            active: true,
          },
        ]}
        showInteractions={true}
        showContraindications={true}
        showRoute={true}
        showPrescriber={true}
        onMedicationClick={(med) => console.log("Medication clicked:", med)}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "A complete medication reconciliation view with interactions and detailed information.",
      },
    },
  },
};

// Complex interactions scenario
export const ComplexInteractions: Story = {
  args: {
    medications: [
      {
        id: "1",
        name: "Warfarin",
        dosage: "5mg",
        frequency: "Once daily",
        route: "Oral",
        interactions: ["Aspirin", "Clopidogrel", "NSAIDs"],
        contraindications: ["Active bleeding"],
        active: true,
      },
      {
        id: "2",
        name: "Clopidogrel",
        dosage: "75mg",
        frequency: "Once daily",
        route: "Oral",
        interactions: ["Warfarin", "Omeprazole"],
        active: true,
      },
      {
        id: "3",
        name: "Omeprazole",
        dosage: "40mg",
        frequency: "Once daily",
        route: "Oral",
        interactions: ["Clopidogrel"],
        active: true,
        notes: "Consider switching to pantoprazole",
      },
    ],
    showInteractions: true,
    showContraindications: true,
    showRoute: true,
  },
};
