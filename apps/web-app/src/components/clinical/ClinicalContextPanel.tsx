/**
 * Clinical Context Panel
 * Capture patient demographics, problems, medications, labs, and vitals
 */

import { useState } from "react";
// Placeholder for future UI component imports
// import { Card, CardHeader, CardTitle, CardContent, Label, Input, Button } from '@voiceassist/ui';

export interface ClinicalContext {
  demographics?: {
    age?: number;
    gender?: string;
    weight?: number;
    height?: number;
  };
  chiefComplaint?: string;
  problems?: string[];
  medications?: string[];
  allergies?: string[];
  vitals?: {
    temperature?: number;
    heartRate?: number;
    bloodPressure?: string;
    respiratoryRate?: number;
    oxygenSaturation?: number;
  };
  labs?: Array<{
    name: string;
    value: string;
    unit?: string;
  }>;
}

interface ClinicalContextPanelProps {
  context: ClinicalContext;
  onChange: (context: ClinicalContext) => void;
  onClear?: () => void;
}

export function ClinicalContextPanel({
  context,
  onChange,
  onClear,
}: ClinicalContextPanelProps) {
  const [activeSection, setActiveSection] = useState<string>("demographics");

  const updateDemographics = (field: string, value: any) => {
    onChange({
      ...context,
      demographics: {
        ...context.demographics,
        [field]: value,
      },
    });
  };

  const updateVitals = (field: string, value: any) => {
    onChange({
      ...context,
      vitals: {
        ...context.vitals,
        [field]: value,
      },
    });
  };

  const addItem = (
    field: "problems" | "medications" | "allergies",
    value: string,
  ) => {
    if (!value.trim()) return;

    onChange({
      ...context,
      [field]: [...(context[field] || []), value.trim()],
    });
  };

  const removeItem = (
    field: "problems" | "medications" | "allergies",
    index: number,
  ) => {
    onChange({
      ...context,
      [field]: (context[field] || []).filter((_, i) => i !== index),
    });
  };

  const hasContext = Object.keys(context).some((key) => {
    const value = context[key as keyof ClinicalContext];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">
          Clinical Context
        </h2>
        {hasContext && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear All
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-neutral-200">
        {[
          { id: "demographics", label: "Demographics" },
          { id: "problems", label: "Problems" },
          { id: "medications", label: "Medications" },
          { id: "vitals", label: "Vitals" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeSection === tab.id
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="py-4">
        {/* Demographics */}
        {activeSection === "demographics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="e.g., 45"
                  value={context.demographics?.age || ""}
                  onChange={(e) =>
                    updateDemographics(
                      "age",
                      parseInt(e.target.value) || undefined,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <select
                  id="gender"
                  value={context.demographics?.gender || ""}
                  onChange={(e) => updateDemographics("gender", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 70.5"
                  value={context.demographics?.weight || ""}
                  onChange={(e) =>
                    updateDemographics(
                      "weight",
                      parseFloat(e.target.value) || undefined,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 175"
                  value={context.demographics?.height || ""}
                  onChange={(e) =>
                    updateDemographics(
                      "height",
                      parseFloat(e.target.value) || undefined,
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chiefComplaint">Chief Complaint</Label>
              <textarea
                id="chiefComplaint"
                rows={3}
                placeholder="Patient's primary concern..."
                value={context.chiefComplaint || ""}
                onChange={(e) =>
                  onChange({ ...context, chiefComplaint: e.target.value })
                }
                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        {/* Problems */}
        {activeSection === "problems" && (
          <ItemList
            title="Active Problems"
            items={context.problems || []}
            placeholder="e.g., Type 2 Diabetes, Hypertension"
            onAdd={(value) => addItem("problems", value)}
            onRemove={(index) => removeItem("problems", index)}
          />
        )}

        {/* Medications */}
        {activeSection === "medications" && (
          <ItemList
            title="Current Medications"
            items={context.medications || []}
            placeholder="e.g., Metformin 500mg BID, Lisinopril 10mg daily"
            onAdd={(value) => addItem("medications", value)}
            onRemove={(index) => removeItem("medications", index)}
          />
        )}

        {/* Vitals */}
        {activeSection === "vitals" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 37.2"
                  value={context.vitals?.temperature || ""}
                  onChange={(e) =>
                    updateVitals(
                      "temperature",
                      parseFloat(e.target.value) || undefined,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
                <Input
                  id="heartRate"
                  type="number"
                  placeholder="e.g., 72"
                  value={context.vitals?.heartRate || ""}
                  onChange={(e) =>
                    updateVitals(
                      "heartRate",
                      parseInt(e.target.value) || undefined,
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bloodPressure">Blood Pressure (mmHg)</Label>
                <Input
                  id="bloodPressure"
                  type="text"
                  placeholder="e.g., 120/80"
                  value={context.vitals?.bloodPressure || ""}
                  onChange={(e) =>
                    updateVitals("bloodPressure", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respiratoryRate">
                  Respiratory Rate (breaths/min)
                </Label>
                <Input
                  id="respiratoryRate"
                  type="number"
                  placeholder="e.g., 16"
                  value={context.vitals?.respiratoryRate || ""}
                  onChange={(e) =>
                    updateVitals(
                      "respiratoryRate",
                      parseInt(e.target.value) || undefined,
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oxygenSaturation">Oxygen Saturation (%)</Label>
              <Input
                id="oxygenSaturation"
                type="number"
                placeholder="e.g., 98"
                value={context.vitals?.oxygenSaturation || ""}
                onChange={(e) =>
                  updateVitals(
                    "oxygenSaturation",
                    parseInt(e.target.value) || undefined,
                  )
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component for lists
function ItemList({
  items,
  placeholder,
  onAdd,
  onRemove,
}: {
  title: string;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    onAdd(inputValue);
    setInputValue("");
  };

  return (
    <div className="space-y-3">
      <div className="flex space-x-2">
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={!inputValue.trim()}>
          Add
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex items-center justify-between p-3 bg-neutral-50 rounded-md border border-neutral-200"
            >
              <span className="text-sm text-neutral-900">{item}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-neutral-400 hover:text-red-600 focus:outline-none"
                aria-label={`Remove ${item}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
