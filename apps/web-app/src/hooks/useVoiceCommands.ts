/**
 * useVoiceCommands Hook
 * Parses free-text voice transcripts into structured clinical commands
 *
 * This is infrastructure/prototype code for future clinical integration.
 * Commands are NOT executed - they are parsed and returned for display/debugging.
 *
 * @see docs/VOICE_COMMANDS_DRAFT.md for usage documentation
 * @see .ai/VOICE_MODE_ENHANCEMENT_PLAN.md Phase 4 for roadmap context
 */

import { useCallback } from "react";

/**
 * Supported voice command intents
 */
export type VoiceCommandIntent =
  | "add_vital_signs"
  | "add_medication"
  | "add_diagnosis"
  | "search_knowledge_base"
  | "insert_note_section";

/**
 * Parsed vital signs entities
 */
export interface VitalSignsEntities {
  blood_pressure?: {
    systolic: number;
    diastolic: number;
  };
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
}

/**
 * Parsed medication entities
 */
export interface MedicationEntities {
  medication_name?: string;
  dosage?: number;
  dosage_unit?: string;
  frequency?: string;
  route?: string;
}

/**
 * Parsed diagnosis entities
 */
export interface DiagnosisEntities {
  diagnosis: string;
  icd_hint?: string;
}

/**
 * Parsed knowledge search entities
 */
export interface SearchEntities {
  query: string;
}

/**
 * Parsed note section entities
 */
export interface NoteSectionEntities {
  section:
    | "assessment"
    | "plan"
    | "history"
    | "exam"
    | "subjective"
    | "objective";
  content: string;
}

/**
 * Entity type union based on intent
 */
export type VoiceCommandEntities =
  | VitalSignsEntities
  | MedicationEntities
  | DiagnosisEntities
  | SearchEntities
  | NoteSectionEntities
  | Record<string, unknown>;

/**
 * A parsed voice command with intent, entities, and confidence
 */
export interface VoiceCommand {
  intent: VoiceCommandIntent;
  entities: VoiceCommandEntities;
  confidence: number; // 0.0 - 1.0
  rawTranscript: string;
}

/**
 * Parse vital signs from transcript
 * Examples:
 * - "Add vital signs: blood pressure 120 over 80, heart rate 72"
 * - "Record vitals blood pressure 140 slash 90 temperature 98.6"
 * - "Add vital signs heart rate 88 oxygen saturation 98 percent"
 */
function parseVitalSignsCommand(transcript: string): VoiceCommand {
  const entities: VitalSignsEntities = {};
  let matchCount = 0;

  // Blood pressure: "120 over 80", "120/80", "120 slash 80"
  const bpMatch = transcript.match(
    /blood pressure\s*:?\s*(\d+)\s*(?:over|\/|slash)\s*(\d+)/i,
  );
  if (bpMatch) {
    entities.blood_pressure = {
      systolic: parseInt(bpMatch[1], 10),
      diastolic: parseInt(bpMatch[2], 10),
    };
    matchCount++;
  }

  // Heart rate: "heart rate 72", "pulse 72", "hr 72"
  const hrMatch = transcript.match(/(?:heart rate|pulse|hr)\s*:?\s*(\d+)/i);
  if (hrMatch) {
    entities.heart_rate = parseInt(hrMatch[1], 10);
    matchCount++;
  }

  // Temperature: "temperature 98.6", "temp 101.2"
  const tempMatch = transcript.match(
    /(?:temperature|temp)\s*:?\s*(\d+\.?\d*)/i,
  );
  if (tempMatch) {
    entities.temperature = parseFloat(tempMatch[1]);
    matchCount++;
  }

  // Respiratory rate: "respiratory rate 16", "resp rate 18", "rr 16"
  const rrMatch = transcript.match(
    /(?:respiratory rate|resp rate|rr)\s*:?\s*(\d+)/i,
  );
  if (rrMatch) {
    entities.respiratory_rate = parseInt(rrMatch[1], 10);
    matchCount++;
  }

  // Oxygen saturation: "oxygen saturation 98", "o2 sat 97", "spo2 99"
  const o2Match = transcript.match(
    /(?:oxygen saturation|o2 sat|spo2|oxygen|sat)\s*:?\s*(\d+)\s*(?:percent|%)?/i,
  );
  if (o2Match) {
    entities.oxygen_saturation = parseInt(o2Match[1], 10);
    matchCount++;
  }

  // Confidence based on how many entities we extracted
  const confidence = Math.min(0.5 + matchCount * 0.15, 0.95);

  return {
    intent: "add_vital_signs",
    entities,
    confidence,
    rawTranscript: transcript,
  };
}

/**
 * Parse medication command from transcript
 * Examples:
 * - "Prescribe metformin 500 mg twice daily"
 * - "Add medication lisinopril 10 milligrams once daily"
 * - "Start patient on aspirin 81 mg daily"
 */
function parseMedicationCommand(transcript: string): VoiceCommand {
  const entities: MedicationEntities = {};
  let confidence = 0.6;

  // Try to extract: medication name, dosage, unit, frequency
  // Pattern: "prescribe/add medication [name] [dose] [unit] [frequency]"

  // Remove the trigger phrase to get the medication details
  const cleanedTranscript = transcript
    .replace(/^(?:prescribe|add medication|start patient on|order)\s*/i, "")
    .trim();

  // Extract dosage and unit first (more specific pattern)
  const dosageMatch = cleanedTranscript.match(
    /(\d+(?:\.\d+)?)\s*(mg|milligrams?|mcg|micrograms?|g|grams?|ml|units?)/i,
  );

  if (dosageMatch) {
    entities.dosage = parseFloat(dosageMatch[1]);
    entities.dosage_unit = normalizeUnit(dosageMatch[2]);
    confidence += 0.1;
  }

  // Extract frequency - ordered by specificity (most specific first)
  const frequencyMatch = cleanedTranscript.match(
    /(?:once|twice|three times?|four times?|(\d+)\s*times?)\s*(?:a\s+|per\s+)?(?:day|daily)|daily|bid|tid|qid|prn|as needed|every\s+\d+\s+hours?/i,
  );

  if (frequencyMatch) {
    entities.frequency = normalizeFrequency(frequencyMatch[0]);
    confidence += 0.1;
  }

  // Extract route if mentioned
  const routeMatch = cleanedTranscript.match(
    /(?:by mouth|orally|po|iv|intravenous|im|intramuscular|subcut|subcutaneous|topical|inhaled)/i,
  );

  if (routeMatch) {
    entities.route = normalizeRoute(routeMatch[0]);
    confidence += 0.05;
  }

  // Extract medication name (everything before the dosage, or first word(s))
  if (dosageMatch) {
    const beforeDosage = cleanedTranscript
      .substring(0, dosageMatch.index)
      .trim();
    if (beforeDosage) {
      entities.medication_name = beforeDosage;
      confidence += 0.1;
    }
  } else {
    // No dosage found, try to get first few words as medication name
    const words = cleanedTranscript.split(/\s+/);
    if (words.length > 0) {
      // Take words until we hit a frequency indicator
      const nameWords: string[] = [];
      for (const word of words) {
        if (/^(once|twice|three|four|daily|bid|tid|qid|prn)$/i.test(word)) {
          break;
        }
        nameWords.push(word);
      }
      if (nameWords.length > 0) {
        entities.medication_name = nameWords.join(" ");
      }
    }
  }

  return {
    intent: "add_medication",
    entities,
    confidence: Math.min(confidence, 0.9),
    rawTranscript: transcript,
  };
}

/**
 * Parse diagnosis command from transcript
 * Examples:
 * - "Add diagnosis hypertension"
 * - "Diagnose type 2 diabetes"
 * - "Patient diagnosed with acute bronchitis"
 */
function parseDiagnosisCommand(transcript: string): VoiceCommand {
  // Remove trigger phrases
  const cleanedTranscript = transcript
    .replace(
      /^(?:add diagnosis|diagnose|patient diagnosed with|diagnosis of|dx)\s*:?\s*/i,
      "",
    )
    .trim();

  const entities: DiagnosisEntities = {
    diagnosis: cleanedTranscript || "unspecified",
  };

  // Confidence based on whether we got a non-empty diagnosis
  const confidence = cleanedTranscript.length > 2 ? 0.8 : 0.5;

  return {
    intent: "add_diagnosis",
    entities,
    confidence,
    rawTranscript: transcript,
  };
}

/**
 * Parse knowledge base search command from transcript
 * Examples:
 * - "Search for diabetes guidelines"
 * - "Look up JNC hypertension guidelines"
 * - "Find information about COPD management"
 */
function parseSearchCommand(transcript: string): VoiceCommand {
  // Remove trigger phrases
  const cleanedTranscript = transcript
    .replace(
      /^(?:search for|look up|find information about|search|lookup|find)\s*/i,
      "",
    )
    .trim();

  const entities: SearchEntities = {
    query: cleanedTranscript || "",
  };

  const confidence = cleanedTranscript.length > 3 ? 0.85 : 0.5;

  return {
    intent: "search_knowledge_base",
    entities,
    confidence,
    rawTranscript: transcript,
  };
}

/**
 * Parse note section command from transcript
 * Examples:
 * - "Add to assessment: uncontrolled diabetes"
 * - "Add to plan: start metformin, follow up in 2 weeks"
 * - "Add to history: patient reports chest pain for 3 days"
 */
function parseNoteSectionCommand(transcript: string): VoiceCommand {
  const lower = transcript.toLowerCase();

  // Determine which section
  let section: NoteSectionEntities["section"] = "assessment";

  if (lower.includes("assessment") || lower.includes("impression")) {
    section = "assessment";
  } else if (lower.includes("plan") || lower.includes("recommendation")) {
    section = "plan";
  } else if (
    lower.includes("history") ||
    lower.includes("hpi") ||
    lower.includes("subjective")
  ) {
    section = lower.includes("subjective") ? "subjective" : "history";
  } else if (
    lower.includes("exam") ||
    lower.includes("physical") ||
    lower.includes("objective")
  ) {
    section = lower.includes("objective") ? "objective" : "exam";
  }

  // Extract content after the section indicator
  const contentMatch = transcript.match(
    /(?:add to|insert into?|append to)\s*(?:the\s+)?(?:assessment|plan|history|exam|physical|subjective|objective|impression|recommendation|hpi)\s*:?\s*(.+)/i,
  );

  const content = contentMatch ? contentMatch[1].trim() : "";

  const entities: NoteSectionEntities = {
    section,
    content,
  };

  const confidence = content.length > 3 ? 0.8 : 0.5;

  return {
    intent: "insert_note_section",
    entities,
    confidence,
    rawTranscript: transcript,
  };
}

/**
 * Normalize dosage units to standard abbreviations
 */
function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower.includes("milligram") || lower === "mg") return "mg";
  if (lower.includes("microgram") || lower === "mcg") return "mcg";
  if (lower.includes("gram") || lower === "g") return "g";
  if (lower === "ml") return "mL";
  if (lower.includes("unit")) return "units";
  return unit;
}

/**
 * Normalize frequency to standard abbreviations
 */
function normalizeFrequency(freq: string): string {
  const lower = freq.toLowerCase();
  if (lower.includes("once") || lower === "daily" || lower.includes("1 time"))
    return "daily";
  if (lower.includes("twice") || lower === "bid" || lower.includes("2 times"))
    return "BID";
  if (
    lower.includes("three times") ||
    lower === "tid" ||
    lower.includes("3 times")
  )
    return "TID";
  if (
    lower.includes("four times") ||
    lower === "qid" ||
    lower.includes("4 times")
  )
    return "QID";
  if (lower.includes("prn") || lower.includes("as needed")) return "PRN";
  if (lower.includes("every")) return freq; // Keep "every X hours" as-is
  return freq;
}

/**
 * Normalize route to standard abbreviations
 */
function normalizeRoute(route: string): string {
  const lower = route.toLowerCase();
  if (lower.includes("mouth") || lower === "po" || lower === "orally")
    return "PO";
  if (lower.includes("intravenous") || lower === "iv") return "IV";
  if (lower.includes("intramuscular") || lower === "im") return "IM";
  if (lower.includes("subcutaneous") || lower === "subcut") return "SubQ";
  if (lower === "topical") return "topical";
  if (lower === "inhaled") return "inhaled";
  return route;
}

/**
 * Hook return type
 */
export interface UseVoiceCommandsReturn {
  /**
   * Parse a transcript string into a structured command
   * Returns null if no command pattern is detected
   */
  parseCommand: (transcript: string) => VoiceCommand | null;
}

/**
 * useVoiceCommands Hook
 *
 * Provides transcript parsing functionality for clinical voice commands.
 * This is infrastructure code - commands are parsed but NOT executed.
 *
 * @example
 * ```tsx
 * const { parseCommand } = useVoiceCommands();
 *
 * // In your transcript handler:
 * const command = parseCommand(userTranscript);
 * if (command) {
 *   console.log("Detected command:", command.intent, command.entities);
 * }
 * ```
 */
export function useVoiceCommands(): UseVoiceCommandsReturn {
  const parseCommand = useCallback(
    (transcript: string): VoiceCommand | null => {
      if (!transcript || transcript.trim().length === 0) {
        return null;
      }

      const lower = transcript.toLowerCase().trim();

      // 1. Vital signs command
      if (
        lower.includes("add vital") ||
        lower.includes("record vital") ||
        lower.includes("vitals") ||
        (lower.includes("blood pressure") &&
          (lower.includes("add") || lower.includes("record")))
      ) {
        return parseVitalSignsCommand(transcript);
      }

      // 2. Medication command
      if (
        lower.includes("add medication") ||
        lower.includes("prescribe") ||
        lower.includes("start patient on") ||
        lower.includes("order medication")
      ) {
        return parseMedicationCommand(transcript);
      }

      // 3. Diagnosis command
      if (
        lower.includes("add diagnosis") ||
        lower.includes("diagnose") ||
        lower.includes("diagnosed with") ||
        lower.startsWith("dx ")
      ) {
        return parseDiagnosisCommand(transcript);
      }

      // 4. Knowledge base search command
      if (
        lower.includes("search for") ||
        lower.includes("look up") ||
        lower.includes("find information") ||
        lower.startsWith("search ") ||
        lower.startsWith("lookup ") ||
        lower.startsWith("find ")
      ) {
        return parseSearchCommand(transcript);
      }

      // 5. Note section command
      if (
        lower.includes("add to assessment") ||
        lower.includes("add to plan") ||
        lower.includes("add to history") ||
        lower.includes("add to exam") ||
        lower.includes("add to subjective") ||
        lower.includes("add to objective") ||
        lower.includes("add to impression") ||
        lower.includes("add to recommendation") ||
        lower.includes("insert into")
      ) {
        return parseNoteSectionCommand(transcript);
      }

      // No command pattern matched
      return null;
    },
    [],
  );

  return { parseCommand };
}
