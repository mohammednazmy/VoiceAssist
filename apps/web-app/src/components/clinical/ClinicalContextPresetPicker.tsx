/**
 * ClinicalContextPresetPicker
 *
 * Component for selecting and managing clinical context presets.
 * Includes built-in medical specialty presets:
 * - Cardiac
 * - Diabetic
 * - Respiratory
 * - Neurological
 *
 * Also supports user-created custom presets.
 */

import { useState, useCallback, useMemo } from "react";
import type { ClinicalContextPreset } from "@voiceassist/types";

// Re-export the type for consumers
export type { ClinicalContextPreset } from "@voiceassist/types";

/** Built-in medical specialty presets */
export const BUILTIN_PRESETS: ClinicalContextPreset[] = [
  {
    id: "cardiac-default",
    name: "Cardiac Patient",
    description:
      "Standard cardiac patient profile with common cardiovascular conditions",
    category: "builtin",
    icon: "heart",
    context: {
      chiefComplaint: "Cardiovascular symptoms",
      problems: ["Hypertension", "Coronary artery disease", "Hyperlipidemia"],
      medications: [
        "Lisinopril 10mg daily",
        "Atorvastatin 40mg daily",
        "Aspirin 81mg daily",
        "Metoprolol 25mg twice daily",
      ],
      vitals: {
        bloodPressure: { systolic: 140, diastolic: 85 },
        heartRate: 78,
        respiratoryRate: 16,
        oxygenSaturation: 97,
        temperature: 37,
      },
    },
  },
  {
    id: "diabetic-default",
    name: "Diabetic Patient",
    description: "Type 2 diabetes patient with typical comorbidities",
    category: "builtin",
    icon: "glucose",
    context: {
      chiefComplaint: "Diabetes management follow-up",
      problems: [
        "Type 2 Diabetes Mellitus",
        "Hypertension",
        "Diabetic nephropathy Stage 2",
        "Peripheral neuropathy",
      ],
      medications: [
        "Metformin 1000mg twice daily",
        "Empagliflozin 10mg daily",
        "Lisinopril 20mg daily",
        "Gabapentin 300mg three times daily",
      ],
      vitals: {
        bloodPressure: { systolic: 135, diastolic: 80 },
        heartRate: 76,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        temperature: 37,
        bloodGlucose: 145,
      },
    },
  },
  {
    id: "respiratory-default",
    name: "Respiratory Patient",
    description: "COPD patient with chronic respiratory conditions",
    category: "builtin",
    icon: "lungs",
    context: {
      chiefComplaint: "Shortness of breath and chronic cough",
      problems: [
        "COPD - Moderate (GOLD Stage II)",
        "Chronic bronchitis",
        "Former smoker (30 pack-years)",
      ],
      medications: [
        "Tiotropium 18mcg inhaler daily",
        "Fluticasone/Salmeterol 250/50 twice daily",
        "Albuterol PRN",
        "Prednisone 10mg (tapering dose)",
      ],
      allergies: ["Penicillin - rash"],
      vitals: {
        bloodPressure: { systolic: 125, diastolic: 75 },
        heartRate: 84,
        respiratoryRate: 20,
        oxygenSaturation: 93,
        temperature: 37.2,
      },
    },
  },
  {
    id: "neurological-default",
    name: "Neurological Patient",
    description: "Patient with chronic neurological conditions",
    category: "builtin",
    icon: "brain",
    context: {
      chiefComplaint: "Neurological symptoms and follow-up care",
      problems: [
        "Parkinson's disease",
        "Mild cognitive impairment",
        "Orthostatic hypotension",
      ],
      medications: [
        "Carbidopa/Levodopa 25/100mg three times daily",
        "Pramipexole 0.5mg three times daily",
        "Midodrine 5mg three times daily",
        "Donepezil 10mg daily",
      ],
      vitals: {
        bloodPressure: { systolic: 110, diastolic: 65 },
        heartRate: 68,
        respiratoryRate: 16,
        oxygenSaturation: 97,
        temperature: 36.8,
      },
    },
  },
];

export interface ClinicalContextPresetPickerProps {
  /** Currently selected preset ID */
  selectedPresetId?: string | null;
  /** User's custom presets */
  customPresets?: ClinicalContextPreset[];
  /** Called when a preset is selected */
  onSelect: (preset: ClinicalContextPreset) => void;
  /** Called when user wants to save current context as preset */
  onSaveAsPreset?: () => void;
  /** Called when user wants to delete a custom preset */
  onDeletePreset?: (presetId: string) => void;
  /** Called when user wants to edit a custom preset */
  onEditPreset?: (preset: ClinicalContextPreset) => void;
  /** Whether to show the save as preset button */
  showSaveOption?: boolean;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Whether to show compact mode */
  compact?: boolean;
}

/**
 * Get icon SVG for a preset category
 */
function PresetIcon({ icon }: { icon?: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    heart: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    ),
    glucose: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 15.5m14.8-.2l-1.046 3.662a2.25 2.25 0 01-1.708 1.617l-2.296.383a2.25 2.25 0 01-.75 0l-2.296-.383a2.25 2.25 0 01-1.708-1.617L5 15.5"
        />
      </svg>
    ),
    lungs: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    brain: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    ),
    custom: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    ),
  };

  return iconMap[icon || "custom"] || iconMap.custom;
}

export function ClinicalContextPresetPicker({
  selectedPresetId,
  customPresets = [],
  onSelect,
  onSaveAsPreset,
  onDeletePreset,
  onEditPreset,
  showSaveOption = true,
  disabled = false,
  compact = false,
}: ClinicalContextPresetPickerProps) {
  const [expandedSection, setExpandedSection] = useState<
    "builtin" | "custom" | null
  >(null);

  const allPresets = useMemo(
    () => [...BUILTIN_PRESETS, ...customPresets],
    [customPresets],
  );

  const toggleSection = useCallback((section: "builtin" | "custom") => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  const handleSelect = useCallback(
    (preset: ClinicalContextPreset) => {
      if (!disabled) {
        onSelect(preset);
      }
    },
    [disabled, onSelect],
  );

  if (compact) {
    return (
      <div className="space-y-2" data-testid="preset-picker-compact">
        <label className="text-sm font-medium text-neutral-700">
          Clinical Preset
        </label>
        <select
          value={selectedPresetId || ""}
          onChange={(e) => {
            const preset = allPresets.find((p) => p.id === e.target.value);
            if (preset) handleSelect(preset);
          }}
          disabled={disabled}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
          data-testid="preset-select"
        >
          <option value="">Select a preset...</option>
          <optgroup label="Medical Specialties">
            {BUILTIN_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          {customPresets.length > 0 && (
            <optgroup label="Custom Presets">
              {customPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="preset-picker">
      {/* Built-in Presets Section */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("builtin")}
          className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition-colors"
          aria-expanded={expandedSection === "builtin"}
          data-testid="builtin-presets-toggle"
        >
          <span className="text-sm font-medium text-neutral-900">
            Medical Specialties
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 transition-transform ${
              expandedSection === "builtin" ? "rotate-180" : ""
            }`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {expandedSection === "builtin" && (
          <div className="divide-y divide-neutral-100">
            {BUILTIN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                disabled={disabled}
                className={`
                  w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                  ${
                    selectedPresetId === preset.id
                      ? "bg-primary-50 border-l-4 border-l-primary-500"
                      : "hover:bg-neutral-50"
                  }
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
                data-testid={`preset-${preset.id}`}
                aria-pressed={selectedPresetId === preset.id}
              >
                <div
                  className={`
                    flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${
                      selectedPresetId === preset.id
                        ? "bg-primary-100 text-primary-700"
                        : "bg-neutral-100 text-neutral-600"
                    }
                  `}
                >
                  <PresetIcon icon={preset.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900">
                    {preset.name}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {preset.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom Presets Section */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("custom")}
          className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition-colors"
          aria-expanded={expandedSection === "custom"}
          data-testid="custom-presets-toggle"
        >
          <span className="text-sm font-medium text-neutral-900">
            Custom Presets ({customPresets.length})
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 transition-transform ${
              expandedSection === "custom" ? "rotate-180" : ""
            }`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {expandedSection === "custom" && (
          <div className="divide-y divide-neutral-100">
            {customPresets.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-neutral-500">
                No custom presets yet.
                {showSaveOption && " Save your current context as a preset."}
              </div>
            ) : (
              customPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`
                    flex items-start gap-3 px-4 py-3 transition-colors
                    ${
                      selectedPresetId === preset.id
                        ? "bg-primary-50 border-l-4 border-l-primary-500"
                        : "hover:bg-neutral-50"
                    }
                  `}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(preset)}
                    disabled={disabled}
                    className="flex-1 flex items-start gap-3 text-left"
                    data-testid={`preset-${preset.id}`}
                    aria-pressed={selectedPresetId === preset.id}
                  >
                    <div
                      className={`
                        flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                        ${
                          selectedPresetId === preset.id
                            ? "bg-primary-100 text-primary-700"
                            : "bg-neutral-100 text-neutral-600"
                        }
                      `}
                    >
                      <PresetIcon icon="custom" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {preset.name}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {preset.description}
                      </p>
                    </div>
                  </button>

                  {/* Edit/Delete buttons */}
                  <div className="flex items-center gap-1">
                    {onEditPreset && (
                      <button
                        type="button"
                        onClick={() => onEditPreset(preset)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                        aria-label={`Edit ${preset.name}`}
                        data-testid={`edit-preset-${preset.id}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                          />
                        </svg>
                      </button>
                    )}
                    {onDeletePreset && (
                      <button
                        type="button"
                        onClick={() => onDeletePreset(preset.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors"
                        aria-label={`Delete ${preset.name}`}
                        data-testid={`delete-preset-${preset.id}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Save as Preset Button */}
      {showSaveOption && onSaveAsPreset && (
        <button
          type="button"
          onClick={onSaveAsPreset}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
          data-testid="save-as-preset"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Save Current Context as Preset
        </button>
      )}
    </div>
  );
}

export default ClinicalContextPresetPicker;
