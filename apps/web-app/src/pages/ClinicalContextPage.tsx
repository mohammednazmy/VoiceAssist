/**
 * Clinical Context Page
 * Manage clinical context that will be used in AI conversations
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@voiceassist/ui";
import {
  ClinicalContextPanel,
  type ClinicalContext,
} from "../components/clinical/ClinicalContextPanel";

const CONTEXT_STORAGE_KEY = "voiceassist:clinical-context";

export function ClinicalContextPage() {
  const navigate = useNavigate();
  const [context, setContext] = useState<ClinicalContext>(() => {
    // Load from localStorage
    const saved = localStorage.getItem(CONTEXT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  // Save to localStorage whenever context changes
  useEffect(() => {
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
  }, [context]);

  const handleClear = () => {
    if (confirm("Are you sure you want to clear all clinical context?")) {
      setContext({});
      localStorage.removeItem(CONTEXT_STORAGE_KEY);
    }
  };

  const handleStartConsultation = () => {
    // Navigate to chat with context
    navigate("/chat");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            Clinical Context
          </h1>
          <p className="mt-2 text-neutral-600">
            Provide patient information for more relevant AI assistance
          </p>
        </div>
        <Button onClick={handleStartConsultation} size="lg">
          Start Consultation
        </Button>
      </div>

      {/* Disclaimer */}
      <Card className="border-l-4 border-l-yellow-500">
        <CardContent className="pt-4">
          <div className="flex items-start space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-yellow-600 flex-shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900">
                Important Disclaimer
              </h3>
              <p className="text-sm text-yellow-800 mt-1">
                This information is used to provide clinical decision support
                and is NOT a substitute for professional medical judgment.
                Always verify AI recommendations with authoritative sources and
                clinical guidelines. Do not enter Protected Health Information
                (PHI) or personally identifiable information.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Context Form */}
      <Card>
        <CardContent className="pt-6">
          <ClinicalContextPanel
            context={context}
            onChange={setContext}
            onClear={handleClear}
          />
        </CardContent>
      </Card>

      {/* Context Summary */}
      {Object.keys(context).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Context Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {context.demographics &&
                Object.keys(context.demographics).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-neutral-900">
                      Demographics:
                    </h4>
                    <p className="text-neutral-700">
                      {context.demographics.age &&
                        `Age: ${context.demographics.age} years old`}
                      {context.demographics.gender &&
                        `, ${context.demographics.gender}`}
                      {context.demographics.weight &&
                        `, Weight: ${context.demographics.weight} kg`}
                      {context.demographics.height &&
                        `, Height: ${context.demographics.height} cm`}
                    </p>
                  </div>
                )}

              {context.chiefComplaint && (
                <div>
                  <h4 className="font-semibold text-neutral-900">
                    Chief Complaint:
                  </h4>
                  <p className="text-neutral-700">{context.chiefComplaint}</p>
                </div>
              )}

              {context.problems && context.problems.length > 0 && (
                <div>
                  <h4 className="font-semibold text-neutral-900">Problems:</h4>
                  <ul className="list-disc list-inside text-neutral-700">
                    {context.problems.map((problem, i) => (
                      <li key={i}>{problem}</li>
                    ))}
                  </ul>
                </div>
              )}

              {context.medications && context.medications.length > 0 && (
                <div>
                  <h4 className="font-semibold text-neutral-900">
                    Medications:
                  </h4>
                  <ul className="list-disc list-inside text-neutral-700">
                    {context.medications.map((med, i) => (
                      <li key={i}>{med}</li>
                    ))}
                  </ul>
                </div>
              )}

              {context.vitals && Object.keys(context.vitals).length > 0 && (
                <div>
                  <h4 className="font-semibold text-neutral-900">
                    Vital Signs:
                  </h4>
                  <p className="text-neutral-700">
                    {context.vitals.temperature &&
                      `Temp: ${context.vitals.temperature}°C`}
                    {context.vitals.heartRate &&
                      `, HR: ${context.vitals.heartRate} bpm`}
                    {context.vitals.bloodPressure &&
                      `, BP: ${context.vitals.bloodPressure}`}
                    {context.vitals.respiratoryRate &&
                      `, RR: ${context.vitals.respiratoryRate} breaths/min`}
                    {context.vitals.oxygenSaturation &&
                      `, SpO₂: ${context.vitals.oxygenSaturation}%`}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
