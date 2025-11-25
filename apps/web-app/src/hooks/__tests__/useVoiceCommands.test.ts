/**
 * useVoiceCommands Hook Unit Tests
 * Tests command parsing for various clinical voice commands
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useVoiceCommands,
  type VoiceCommand,
  type VitalSignsEntities,
  type MedicationEntities,
  type DiagnosisEntities,
  type SearchEntities,
  type NoteSectionEntities,
} from "../useVoiceCommands";

describe("useVoiceCommands", () => {
  describe("initialization", () => {
    it("should return parseCommand function", () => {
      const { result } = renderHook(() => useVoiceCommands());

      expect(typeof result.current.parseCommand).toBe("function");
    });
  });

  describe("vital signs parsing", () => {
    it('should parse "add vital signs" with blood pressure', () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs: blood pressure 120 over 80",
      );

      expect(command).not.toBeNull();
      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.blood_pressure).toEqual({
        systolic: 120,
        diastolic: 80,
      });
    });

    it("should parse blood pressure with slash notation", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Record vitals blood pressure 140/90",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.blood_pressure).toEqual({
        systolic: 140,
        diastolic: 90,
      });
    });

    it("should parse heart rate", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs heart rate 72",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.heart_rate).toBe(72);
    });

    it("should parse pulse as heart rate", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Add vitals pulse 88");

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.heart_rate).toBe(88);
    });

    it("should parse temperature", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Record vital signs temperature 98.6",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.temperature).toBe(98.6);
    });

    it("should parse temperature with decimal", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Add vitals temp 101.2");

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.temperature).toBe(101.2);
    });

    it("should parse respiratory rate", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs respiratory rate 16",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.respiratory_rate).toBe(16);
    });

    it("should parse oxygen saturation", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs oxygen saturation 98 percent",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.oxygen_saturation).toBe(98);
    });

    it("should parse o2 sat abbreviation", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Record vitals o2 sat 97");

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.oxygen_saturation).toBe(97);
    });

    it("should parse multiple vital signs in one command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs: blood pressure 120 over 80, heart rate 72, temperature 98.6",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.blood_pressure).toEqual({
        systolic: 120,
        diastolic: 80,
      });
      expect(entities.heart_rate).toBe(72);
      expect(entities.temperature).toBe(98.6);
    });

    it("should have higher confidence with more entities", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const singleCommand = result.current.parseCommand(
        "Add vital signs heart rate 72",
      );
      const multiCommand = result.current.parseCommand(
        "Add vital signs blood pressure 120 over 80 heart rate 72 temp 98.6",
      );

      expect(multiCommand!.confidence).toBeGreaterThan(
        singleCommand!.confidence,
      );
    });

    it("should include raw transcript in result", () => {
      const { result } = renderHook(() => useVoiceCommands());
      const transcript = "Add vital signs blood pressure 120 over 80";

      const command = result.current.parseCommand(transcript);

      expect(command?.rawTranscript).toBe(transcript);
    });
  });

  describe("medication parsing", () => {
    it("should parse prescribe command with medication name and dosage", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe metformin 500 mg twice daily",
      );

      expect(command).not.toBeNull();
      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.medication_name).toBe("metformin");
      expect(entities.dosage).toBe(500);
      expect(entities.dosage_unit).toBe("mg");
      expect(entities.frequency).toBe("BID");
    });

    it("should parse add medication command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add medication lisinopril 10 milligrams once daily",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.medication_name).toBe("lisinopril");
      expect(entities.dosage).toBe(10);
      expect(entities.dosage_unit).toBe("mg");
      expect(entities.frequency).toBe("daily");
    });

    it("should parse start patient on command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Start patient on aspirin 81 mg daily",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.medication_name).toBe("aspirin");
      expect(entities.dosage).toBe(81);
    });

    it("should parse micrograms as mcg", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe levothyroxine 50 micrograms daily",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.dosage).toBe(50);
      expect(entities.dosage_unit).toBe("mcg");
    });

    it("should parse three times daily as TID", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe ibuprofen 400 mg three times daily",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.frequency).toBe("TID");
    });

    it("should parse PRN frequency", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe hydrocodone 5 mg as needed",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.frequency).toBe("PRN");
    });

    it("should parse route when specified", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe ondansetron 4 mg IV",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.route).toBe("IV");
    });

    it("should parse oral route", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Prescribe amoxicillin 500 mg by mouth",
      );

      expect(command?.intent).toBe("add_medication");
      const entities = command?.entities as MedicationEntities;
      expect(entities.route).toBe("PO");
    });
  });

  describe("diagnosis parsing", () => {
    it("should parse add diagnosis command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Add diagnosis hypertension");

      expect(command).not.toBeNull();
      expect(command?.intent).toBe("add_diagnosis");
      const entities = command?.entities as DiagnosisEntities;
      expect(entities.diagnosis).toBe("hypertension");
    });

    it("should parse diagnose command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Diagnose type 2 diabetes");

      expect(command?.intent).toBe("add_diagnosis");
      const entities = command?.entities as DiagnosisEntities;
      expect(entities.diagnosis).toBe("type 2 diabetes");
    });

    it("should parse patient diagnosed with command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Patient diagnosed with acute bronchitis",
      );

      expect(command?.intent).toBe("add_diagnosis");
      const entities = command?.entities as DiagnosisEntities;
      expect(entities.diagnosis).toBe("acute bronchitis");
    });

    it("should parse dx shorthand", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("dx pneumonia");

      expect(command?.intent).toBe("add_diagnosis");
      const entities = command?.entities as DiagnosisEntities;
      expect(entities.diagnosis).toBe("pneumonia");
    });

    it("should handle complex diagnosis descriptions", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add diagnosis chronic obstructive pulmonary disease with acute exacerbation",
      );

      expect(command?.intent).toBe("add_diagnosis");
      const entities = command?.entities as DiagnosisEntities;
      expect(entities.diagnosis).toBe(
        "chronic obstructive pulmonary disease with acute exacerbation",
      );
    });
  });

  describe("knowledge base search parsing", () => {
    it("should parse search for command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Search for diabetes guidelines",
      );

      expect(command).not.toBeNull();
      expect(command?.intent).toBe("search_knowledge_base");
      const entities = command?.entities as SearchEntities;
      expect(entities.query).toBe("diabetes guidelines");
    });

    it("should parse look up command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Look up JNC hypertension guidelines",
      );

      expect(command?.intent).toBe("search_knowledge_base");
      const entities = command?.entities as SearchEntities;
      expect(entities.query).toBe("JNC hypertension guidelines");
    });

    it("should parse find information command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Find information about COPD management",
      );

      expect(command?.intent).toBe("search_knowledge_base");
      const entities = command?.entities as SearchEntities;
      expect(entities.query).toBe("COPD management");
    });

    it("should parse simple search command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "search heart failure treatment",
      );

      expect(command?.intent).toBe("search_knowledge_base");
      const entities = command?.entities as SearchEntities;
      expect(entities.query).toBe("heart failure treatment");
    });

    it("should parse find command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "find antibiotic resistance patterns",
      );

      expect(command?.intent).toBe("search_knowledge_base");
      const entities = command?.entities as SearchEntities;
      expect(entities.query).toBe("antibiotic resistance patterns");
    });
  });

  describe("note section parsing", () => {
    it("should parse add to assessment command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to assessment: uncontrolled diabetes",
      );

      expect(command).not.toBeNull();
      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("assessment");
      expect(entities.content).toBe("uncontrolled diabetes");
    });

    it("should parse add to plan command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to plan: start metformin, follow up in 2 weeks",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("plan");
      expect(entities.content).toBe("start metformin, follow up in 2 weeks");
    });

    it("should parse add to history command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to history: patient reports chest pain for 3 days",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("history");
      expect(entities.content).toBe("patient reports chest pain for 3 days");
    });

    it("should parse add to exam command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to exam: lungs clear to auscultation bilaterally",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("exam");
      expect(entities.content).toBe("lungs clear to auscultation bilaterally");
    });

    it("should parse add to subjective command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to subjective: patient denies nausea or vomiting",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("subjective");
    });

    it("should parse add to objective command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to objective: abdomen soft non-tender",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("objective");
    });

    it("should parse impression as assessment", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add to impression: likely viral URI",
      );

      expect(command?.intent).toBe("insert_note_section");
      const entities = command?.entities as NoteSectionEntities;
      expect(entities.section).toBe("assessment");
    });
  });

  describe("no-op / non-command transcripts", () => {
    it("should return null for empty string", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("");

      expect(command).toBeNull();
    });

    it("should return null for whitespace only", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("   ");

      expect(command).toBeNull();
    });

    it("should return null for random chat", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Hello, how are you today?");

      expect(command).toBeNull();
    });

    it("should return null for general medical questions", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "What are the symptoms of diabetes?",
      );

      expect(command).toBeNull();
    });

    it("should return null for non-medical chat", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("What time is it?");

      expect(command).toBeNull();
    });

    it("should return null for partial command phrases", () => {
      const { result } = renderHook(() => useVoiceCommands());

      // "blood pressure" alone without "add" or "record" trigger
      const command = result.current.parseCommand(
        "The blood pressure seems high",
      );

      expect(command).toBeNull();
    });

    it("should return null for thank you messages", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand("Thank you for your help");

      expect(command).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle case-insensitive matching", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command1 = result.current.parseCommand(
        "ADD VITAL SIGNS heart rate 72",
      );
      const command2 = result.current.parseCommand(
        "add vital signs heart rate 72",
      );
      const command3 = result.current.parseCommand(
        "Add Vital Signs heart rate 72",
      );

      expect(command1?.intent).toBe("add_vital_signs");
      expect(command2?.intent).toBe("add_vital_signs");
      expect(command3?.intent).toBe("add_vital_signs");
    });

    it("should handle commands with extra whitespace", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "  Add vital signs   blood pressure 120 over 80  ",
      );

      expect(command?.intent).toBe("add_vital_signs");
      const entities = command?.entities as VitalSignsEntities;
      expect(entities.blood_pressure).toEqual({
        systolic: 120,
        diastolic: 80,
      });
    });

    it("should have confidence between 0 and 1", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const commands = [
        result.current.parseCommand("Add vital signs heart rate 72"),
        result.current.parseCommand("Prescribe metformin 500 mg daily"),
        result.current.parseCommand("Add diagnosis hypertension"),
        result.current.parseCommand("Search for guidelines"),
        result.current.parseCommand("Add to plan: follow up"),
      ];

      commands.forEach((command) => {
        expect(command).not.toBeNull();
        expect(command!.confidence).toBeGreaterThanOrEqual(0);
        expect(command!.confidence).toBeLessThanOrEqual(1);
      });
    });

    it("should preserve original transcript in rawTranscript field", () => {
      const { result } = renderHook(() => useVoiceCommands());
      const original = "Prescribe Metformin 500 MG Twice Daily";

      const command = result.current.parseCommand(original);

      expect(command?.rawTranscript).toBe(original);
    });
  });

  describe("VoiceCommand interface", () => {
    it("should have all required fields in returned command", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs heart rate 72",
      );

      expect(command).toHaveProperty("intent");
      expect(command).toHaveProperty("entities");
      expect(command).toHaveProperty("confidence");
      expect(command).toHaveProperty("rawTranscript");
    });

    it("should return typed entities for vital signs", () => {
      const { result } = renderHook(() => useVoiceCommands());

      const command = result.current.parseCommand(
        "Add vital signs blood pressure 120 over 80",
      ) as VoiceCommand;

      // TypeScript type narrowing
      if (command.intent === "add_vital_signs") {
        const entities = command.entities as VitalSignsEntities;
        expect(entities.blood_pressure?.systolic).toBe(120);
        expect(entities.blood_pressure?.diastolic).toBe(80);
      }
    });
  });
});
