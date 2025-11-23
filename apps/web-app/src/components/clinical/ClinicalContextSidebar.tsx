/**
 * Clinical Context Sidebar
 * Display and edit clinical context during chat consultations
 */

import { useState } from 'react';
import { Button } from '@voiceassist/ui';
import { ClinicalContextPanel, type ClinicalContext } from './ClinicalContextPanel';

export interface ClinicalContextSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  context: ClinicalContext;
  onChange: (context: ClinicalContext) => void;
}

export function ClinicalContextSidebar({
  isOpen,
  onClose,
  context,
  onChange,
}: ClinicalContextSidebarProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen) {
    return null;
  }

  const hasContext = Object.keys(context).some((key) => {
    const value = context[key as keyof ClinicalContext];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
    return Boolean(value);
  });

  const handleClear = () => {
    if (confirm('Clear all clinical context?')) {
      onChange({});
      setIsEditing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto">
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 bg-black/50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-lg md:relative md:w-80 md:shadow-none overflow-y-auto"
        role="complementary"
        aria-label="Clinical context"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Clinical Context
          </h2>
          <div className="flex items-center gap-2">
            {!isEditing && hasContext && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="text-sm"
              >
                Edit
              </Button>
            )}
            <button
              onClick={onClose}
              className="md:hidden p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Close clinical context sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {!hasContext && !isEditing ? (
            // Empty state
            <div className="text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-16 h-16 mx-auto mb-4 text-neutral-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                No clinical context provided
              </p>
              <Button onClick={() => setIsEditing(true)} size="sm">
                Add Patient Information
              </Button>
            </div>
          ) : isEditing ? (
            // Edit mode
            <div className="space-y-4">
              <ClinicalContextPanel
                context={context}
                onChange={onChange}
                onClear={handleClear}
              />
              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            // View mode
            <div className="space-y-4">
              {/* Demographics Summary */}
              {context.demographics && Object.keys(context.demographics).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Demographics
                  </h3>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
                    {context.demographics.age && (
                      <div className="flex justify-between">
                        <span className="font-medium">Age:</span>
                        <span>{context.demographics.age} years</span>
                      </div>
                    )}
                    {context.demographics.gender && (
                      <div className="flex justify-between">
                        <span className="font-medium">Gender:</span>
                        <span className="capitalize">{context.demographics.gender}</span>
                      </div>
                    )}
                    {context.demographics.weight && (
                      <div className="flex justify-between">
                        <span className="font-medium">Weight:</span>
                        <span>{context.demographics.weight} kg</span>
                      </div>
                    )}
                    {context.demographics.height && (
                      <div className="flex justify-between">
                        <span className="font-medium">Height:</span>
                        <span>{context.demographics.height} cm</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chief Complaint */}
              {context.chiefComplaint && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Chief Complaint
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {context.chiefComplaint}
                  </p>
                </div>
              )}

              {/* Problems */}
              {context.problems && context.problems.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Active Problems
                  </h3>
                  <ul className="space-y-1">
                    {context.problems.map((problem, i) => (
                      <li
                        key={i}
                        className="text-sm text-neutral-600 dark:text-neutral-400 flex items-start gap-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-400"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>{problem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Medications */}
              {context.medications && context.medications.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Current Medications
                  </h3>
                  <ul className="space-y-1">
                    {context.medications.map((med, i) => (
                      <li
                        key={i}
                        className="text-sm text-neutral-600 dark:text-neutral-400 flex items-start gap-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-400"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>{med}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Vitals */}
              {context.vitals && Object.keys(context.vitals).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Vital Signs
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {context.vitals.temperature && (
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-500">Temp</span>
                        <span className="font-medium">{context.vitals.temperature}°C</span>
                      </div>
                    )}
                    {context.vitals.heartRate && (
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-500">HR</span>
                        <span className="font-medium">{context.vitals.heartRate} bpm</span>
                      </div>
                    )}
                    {context.vitals.bloodPressure && (
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-500">BP</span>
                        <span className="font-medium">{context.vitals.bloodPressure}</span>
                      </div>
                    )}
                    {context.vitals.respiratoryRate && (
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-500">RR</span>
                        <span className="font-medium">{context.vitals.respiratoryRate}/min</span>
                      </div>
                    )}
                    {context.vitals.oxygenSaturation && (
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-500">SpO₂</span>
                        <span className="font-medium">{context.vitals.oxygenSaturation}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 flex-shrink-0 text-yellow-600 mt-0.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p>
              Clinical context provides background information for AI assistance. Do not enter PHI or personally identifiable information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
