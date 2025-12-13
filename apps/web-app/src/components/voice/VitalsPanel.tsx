/**
 * VitalsPanel - FHIR Vital Signs Display Component
 *
 * Displays real-time patient vitals and lab results from FHIR streaming.
 * Part of Voice Mode v4.1 Phase 3 for clinical context enrichment.
 *
 * Features:
 * - Grid display for vital signs (BP, HR, Temp, SpO2, etc.)
 * - List display for lab results with interpretation indicators
 * - Real-time streaming indicator
 * - Abnormal value highlighting
 * - Click handler for value details
 *
 * Reference: docs/voice/fhir-streaming-service.md
 */

import { useState, useEffect, useMemo } from "react";
import { cn } from "../../lib/utils";
import { Tooltip } from "../ui/Tooltip";

export interface FHIRObservation {
  resourceId: string;
  resourceType: "vital-signs" | "laboratory" | string;
  patientId: string;
  code: string;
  codeDisplay: string;
  value?: string;
  valueQuantity?: number;
  valueUnit?: string;
  effectiveDatetime?: string;
  status: string;
  interpretation?: "High" | "Low" | "Normal" | "Critical" | string;
  referenceRange?: string;
}

interface VitalCardProps {
  label: string;
  value: string;
  interpretation?: string;
  timestamp?: string;
  onClick?: () => void;
}

function VitalCard({
  label,
  value,
  interpretation,
  timestamp,
  onClick,
}: VitalCardProps) {
  const isAbnormal =
    interpretation === "High" ||
    interpretation === "Low" ||
    interpretation === "Critical";
  const isCritical = interpretation === "Critical";

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all cursor-pointer",
        "bg-white dark:bg-neutral-800",
        "hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600",
        isCritical
          ? "border-red-500 dark:border-red-500 animate-pulse"
          : isAbnormal
            ? "border-yellow-400 dark:border-yellow-600"
            : "border-neutral-200 dark:border-neutral-700",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 truncate">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold",
          isCritical
            ? "text-red-600 dark:text-red-400"
            : isAbnormal
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-neutral-900 dark:text-neutral-100",
        )}
      >
        {value}
      </div>
      <div className="flex items-center justify-between mt-1">
        {interpretation && (
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              interpretation === "High" && "bg-yellow-100 text-yellow-700",
              interpretation === "Low" && "bg-blue-100 text-blue-700",
              interpretation === "Critical" && "bg-red-100 text-red-700",
              interpretation === "Normal" && "bg-green-100 text-green-700",
            )}
          >
            {interpretation}
          </span>
        )}
        {timestamp && (
          <span className="text-xs text-neutral-400">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

interface LabResultRowProps {
  label: string;
  value: string;
  interpretation?: string;
  referenceRange?: string;
  onClick?: () => void;
}

function LabResultRow({
  label,
  value,
  interpretation,
  referenceRange,
  onClick,
}: LabResultRowProps) {
  const isAbnormal =
    interpretation === "High" ||
    interpretation === "Low" ||
    interpretation === "Critical";

  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-3 rounded-lg",
        "hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer",
        "transition-colors",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="flex-1">
        <div className="text-sm text-neutral-900 dark:text-neutral-100">
          {label}
        </div>
        {referenceRange && (
          <div className="text-xs text-neutral-400">Ref: {referenceRange}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "font-medium",
            isAbnormal
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-neutral-900 dark:text-neutral-100",
          )}
        >
          {value}
        </span>
        {interpretation && (
          <Tooltip content={`Interpretation: ${interpretation}`}>
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                interpretation === "High" && "bg-yellow-500",
                interpretation === "Low" && "bg-blue-500",
                interpretation === "Critical" && "bg-red-500 animate-pulse",
                interpretation === "Normal" && "bg-green-500",
              )}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

interface VitalsPanelProps {
  /** Patient ID for FHIR subscription */
  patientId: string;
  /** FHIR observations (vitals + labs) */
  observations: FHIRObservation[];
  /** Whether data is streaming live */
  isStreaming?: boolean;
  /** Callback when an observation is clicked */
  onObservationClick?: (observation: FHIRObservation) => void;
  /** Maximum number of vitals to show */
  maxVitals?: number;
  /** Maximum number of labs to show */
  maxLabs?: number;
  /** Custom class name */
  className?: string;
}

export function VitalsPanel({
  observations,
  isStreaming = false,
  onObservationClick,
  maxVitals = 4,
  maxLabs = 5,
  className,
}: VitalsPanelProps) {
  // Separate vitals and labs
  const { vitals, labs, abnormalLabs, normalLabs } = useMemo(() => {
    const vitalsList = observations.filter(
      (o) => o.resourceType === "vital-signs",
    );
    const labsList = observations.filter(
      (o) => o.resourceType === "laboratory",
    );
    const abnormal = labsList.filter(
      (l) => l.interpretation && l.interpretation !== "Normal",
    );
    const normal = labsList.filter(
      (l) => !l.interpretation || l.interpretation === "Normal",
    );
    return {
      vitals: vitalsList,
      labs: labsList,
      abnormalLabs: abnormal,
      normalLabs: normal,
    };
  }, [observations]);

  const formatValue = (obs: FHIRObservation): string => {
    if (obs.value) return obs.value;
    if (obs.valueQuantity !== undefined) {
      return `${obs.valueQuantity}${obs.valueUnit ? ` ${obs.valueUnit}` : ""}`;
    }
    return "—";
  };

  if (observations.length === 0) {
    return (
      <div
        className={cn(
          "p-4 text-center text-neutral-500 dark:text-neutral-400",
          "bg-neutral-50 dark:bg-neutral-800/50 rounded-lg",
          className,
        )}
      >
        <div className="text-lg mb-1">No patient data available</div>
        <div className="text-sm">
          {isStreaming
            ? "Waiting for FHIR updates..."
            : "Enable FHIR streaming to see patient data"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "vitals-panel bg-white dark:bg-neutral-900 rounded-lg p-4",
        "border border-neutral-200 dark:border-neutral-700",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Latest Patient Data
        </h3>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live updates</span>
          </div>
        )}
      </div>

      {/* Vital Signs Grid */}
      {vitals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {vitals.slice(0, maxVitals).map((vital) => (
            <VitalCard
              key={vital.resourceId}
              label={vital.codeDisplay}
              value={formatValue(vital)}
              interpretation={vital.interpretation}
              timestamp={vital.effectiveDatetime}
              onClick={() => onObservationClick?.(vital)}
            />
          ))}
        </div>
      )}

      {/* Lab Results */}
      {labs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Recent Labs
          </h4>

          {/* Abnormal values first */}
          {abnormalLabs.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium mb-1 uppercase tracking-wide">
                Abnormal Values
              </div>
              <div className="space-y-1">
                {abnormalLabs.slice(0, maxLabs).map((lab) => (
                  <LabResultRow
                    key={lab.resourceId}
                    label={lab.codeDisplay}
                    value={formatValue(lab)}
                    interpretation={lab.interpretation}
                    referenceRange={lab.referenceRange}
                    onClick={() => onObservationClick?.(lab)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Normal values */}
          {normalLabs.length > 0 && abnormalLabs.length < maxLabs && (
            <div>
              {abnormalLabs.length > 0 && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mb-1 uppercase tracking-wide">
                  Other Results
                </div>
              )}
              <div className="space-y-1">
                {normalLabs
                  .slice(0, maxLabs - abnormalLabs.length)
                  .map((lab) => (
                    <LabResultRow
                      key={lab.resourceId}
                      label={lab.codeDisplay}
                      value={formatValue(lab)}
                      interpretation={lab.interpretation}
                      referenceRange={lab.referenceRange}
                      onClick={() => onObservationClick?.(lab)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to subscribe to FHIR observation updates
 */
export function useFHIRObservations(
  patientId: string,
  _options?: {
    includeVitals?: boolean;
    includeLabs?: boolean;
    maxResults?: number;
  },
) {
  const [observations, setObservations] = useState<FHIRObservation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [_error, _setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;

    // In production, this would connect to the FHIR streaming endpoint
    // For now, we simulate with demo data
    const simulateStream = () => {
      setIsStreaming(true);

      // Demo observations
      const demoObs: FHIRObservation[] = [
        {
          resourceId: "v1",
          resourceType: "vital-signs",
          patientId,
          code: "8480-6",
          codeDisplay: "Blood Pressure",
          value: "120/80",
          valueUnit: "mmHg",
          status: "final",
          effectiveDatetime: new Date().toISOString(),
        },
        {
          resourceId: "v2",
          resourceType: "vital-signs",
          patientId,
          code: "8867-4",
          codeDisplay: "Heart Rate",
          valueQuantity: 72,
          valueUnit: "bpm",
          status: "final",
          effectiveDatetime: new Date().toISOString(),
        },
        {
          resourceId: "v3",
          resourceType: "vital-signs",
          patientId,
          code: "8310-5",
          codeDisplay: "Temperature",
          valueQuantity: 98.6,
          valueUnit: "°F",
          status: "final",
          effectiveDatetime: new Date().toISOString(),
        },
        {
          resourceId: "v4",
          resourceType: "vital-signs",
          patientId,
          code: "59408-5",
          codeDisplay: "SpO2",
          valueQuantity: 98,
          valueUnit: "%",
          status: "final",
          effectiveDatetime: new Date().toISOString(),
        },
        {
          resourceId: "l1",
          resourceType: "laboratory",
          patientId,
          code: "2339-0",
          codeDisplay: "Glucose",
          valueQuantity: 180,
          valueUnit: "mg/dL",
          status: "final",
          interpretation: "High",
          referenceRange: "70-100",
          effectiveDatetime: new Date().toISOString(),
        },
        {
          resourceId: "l2",
          resourceType: "laboratory",
          patientId,
          code: "4548-4",
          codeDisplay: "Hemoglobin A1c",
          valueQuantity: 6.5,
          valueUnit: "%",
          status: "final",
          interpretation: "Normal",
          referenceRange: "4.0-5.6",
          effectiveDatetime: new Date().toISOString(),
        },
      ];

      setObservations(demoObs);
    };

    simulateStream();

    return () => {
      setIsStreaming(false);
    };
  }, [patientId]);

  return { observations, isStreaming, error: _error };
}

export default VitalsPanel;
