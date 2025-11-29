/**
 * ClinicalContextAdapter
 * Adapts between backend ClinicalContext types and frontend component interface
 */

import type {
  ClinicalContext as BackendClinicalContext,
  ClinicalContextCreate,
  ClinicalContextUpdate,
} from "@voiceassist/types";
import type { ClinicalContext as FrontendClinicalContext } from "./ClinicalContextPanel";

/**
 * Convert backend clinical context to frontend format
 */
export function backendToFrontend(
  backendContext: BackendClinicalContext | null,
): FrontendClinicalContext {
  if (!backendContext) {
    return {};
  }

  return {
    demographics: {
      age: backendContext.age,
      gender: backendContext.gender,
      weight: backendContext.weightKg,
      height: backendContext.heightCm,
    },
    chiefComplaint: backendContext.chiefComplaint,
    problems: backendContext.problems || [],
    medications: backendContext.medications || [],
    allergies: backendContext.allergies || [],
    vitals: {
      temperature: backendContext.vitals?.temperature,
      heartRate: backendContext.vitals?.heartRate,
      bloodPressure: backendContext.vitals?.bloodPressure,
      respiratoryRate: backendContext.vitals?.respiratoryRate,
      oxygenSaturation: backendContext.vitals?.spo2,
    },
  };
}

/**
 * Convert frontend clinical context to backend format (for create/update)
 */
export function frontendToBackend(
  frontendContext: FrontendClinicalContext,
): ClinicalContextCreate | ClinicalContextUpdate {
  return {
    age: frontendContext.demographics?.age,
    gender: frontendContext.demographics?.gender,
    weightKg: frontendContext.demographics?.weight,
    heightCm: frontendContext.demographics?.height,
    chiefComplaint: frontendContext.chiefComplaint,
    problems: frontendContext.problems,
    medications: frontendContext.medications,
    allergies: frontendContext.allergies,
    vitals: {
      temperature: frontendContext.vitals?.temperature,
      heartRate: frontendContext.vitals?.heartRate,
      bloodPressure: frontendContext.vitals?.bloodPressure,
      respiratoryRate: frontendContext.vitals?.respiratoryRate,
      spo2: frontendContext.vitals?.oxygenSaturation,
    },
  };
}

/**
 * Check if frontend context has any data
 */
export function hasContextData(context: FrontendClinicalContext): boolean {
  return Object.keys(context).some((key) => {
    const value = context[key as keyof FrontendClinicalContext];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some(
        (v) => v !== undefined && v !== null && v !== "",
      );
    }
    return Boolean(value);
  });
}
