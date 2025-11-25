# Voice Commands - Draft Documentation

> **Status**: Infrastructure/Prototype
> **Branch**: `claude/voice-commands-prototype-*`
> **Last Updated**: 2025-11-25

This document describes the voice command parsing infrastructure for clinical voice commands. This is a **prototype/debug feature** - commands are parsed but NOT executed.

## Overview

The `useVoiceCommands` hook provides transcript parsing functionality that converts free-text voice transcripts into structured clinical commands. This enables future integration with clinical workflows like:

- Adding vital signs
- Prescribing medications
- Recording diagnoses
- Searching the knowledge base
- Inserting notes into SOAP sections

**Important**: This is infrastructure code only. Commands are parsed and exposed via callbacks, but no clinical actions are taken.

## Supported Intents

### 1. `add_vital_signs`

Parses vital sign measurements from speech.

**Trigger phrases:**

- "Add vital signs..."
- "Record vitals..."
- "Vitals..."

**Supported entities:**

- Blood pressure (systolic/diastolic)
- Heart rate / pulse
- Temperature
- Respiratory rate
- Oxygen saturation (SpO2)

**Examples:**

```
"Add vital signs: blood pressure 120 over 80, heart rate 72"
"Record vitals blood pressure 140/90 temperature 98.6"
"Add vital signs heart rate 88 o2 sat 98 percent"
```

### 2. `add_medication`

Parses medication prescriptions.

**Trigger phrases:**

- "Prescribe..."
- "Add medication..."
- "Start patient on..."
- "Order medication..."

**Supported entities:**

- Medication name
- Dosage (numeric value)
- Dosage unit (mg, mcg, g, mL, units)
- Frequency (daily, BID, TID, QID, PRN)
- Route (PO, IV, IM, SubQ, topical, inhaled)

**Examples:**

```
"Prescribe metformin 500 mg twice daily"
"Add medication lisinopril 10 milligrams once daily"
"Start patient on aspirin 81 mg daily"
"Prescribe ondansetron 4 mg IV prn"
```

### 3. `add_diagnosis`

Parses diagnosis statements.

**Trigger phrases:**

- "Add diagnosis..."
- "Diagnose..."
- "Patient diagnosed with..."
- "dx..."

**Supported entities:**

- Diagnosis text (free-form)

**Examples:**

```
"Add diagnosis hypertension"
"Diagnose type 2 diabetes"
"Patient diagnosed with acute bronchitis"
"dx pneumonia"
```

### 4. `search_knowledge_base`

Parses search queries for the knowledge base.

**Trigger phrases:**

- "Search for..."
- "Look up..."
- "Find information about..."
- "Search..."
- "Find..."

**Supported entities:**

- Search query

**Examples:**

```
"Search for diabetes guidelines"
"Look up JNC hypertension guidelines"
"Find information about COPD management"
```

### 5. `insert_note_section`

Parses note section insertions for SOAP notes.

**Trigger phrases:**

- "Add to assessment..."
- "Add to plan..."
- "Add to history..."
- "Add to exam..."
- "Add to subjective..."
- "Add to objective..."
- "Add to impression..."
- "Insert into..."

**Supported sections:**

- assessment
- plan
- history
- exam
- subjective
- objective

**Examples:**

```
"Add to assessment: uncontrolled diabetes"
"Add to plan: start metformin, follow up in 2 weeks"
"Add to history: patient reports chest pain for 3 days"
"Add to exam: lungs clear to auscultation bilaterally"
```

## Integration

### Using the Hook Directly

```typescript
import { useVoiceCommands } from "../hooks/useVoiceCommands";

function MyComponent() {
  const { parseCommand } = useVoiceCommands();

  const handleTranscript = (text: string) => {
    const command = parseCommand(text);
    if (command) {
      console.log("Command detected:", command.intent, command.entities);
    }
  };
}
```

### Using with useRealtimeVoiceSession

The `useRealtimeVoiceSession` hook has built-in voice command parsing via the `onVoiceCommand` callback:

```typescript
import { useRealtimeVoiceSession, VoiceCommand } from "../hooks/useRealtimeVoiceSession";

function VoicePanel() {
  const { connect, disconnect, status } = useRealtimeVoiceSession({
    onVoiceCommand: (command: VoiceCommand) => {
      console.log("Voice command:", command.intent);
      console.log("Entities:", command.entities);
      console.log("Confidence:", command.confidence);
    },
  });
}
```

## Debug Mode

To enable the debug panel in `VoiceModePanel`, set the environment variable:

```bash
VITE_ENABLE_VOICE_COMMANDS_DEBUG=true
```

When enabled, a yellow debug panel appears showing:

- Detected intent
- Confidence score (0-100%)
- Parsed entities (JSON)
- Raw transcript

## VoiceCommand Interface

```typescript
interface VoiceCommand {
  intent: VoiceCommandIntent;
  entities: VoiceCommandEntities;
  confidence: number; // 0.0 - 1.0
  rawTranscript: string;
}

type VoiceCommandIntent =
  | "add_vital_signs"
  | "add_medication"
  | "add_diagnosis"
  | "search_knowledge_base"
  | "insert_note_section";
```

## Confidence Scoring

Confidence scores are calculated based on:

- For vital signs: More entities extracted = higher confidence (0.5 base + 0.15 per entity)
- For medications: Presence of name, dosage, unit, frequency each add to confidence
- For diagnoses/search: Length and quality of extracted text
- All scores are capped at 0.95

## Limitations

1. **Regex-based parsing**: Simple pattern matching, not NLP
2. **English only**: No i18n support yet
3. **No fuzzy matching**: Requires close adherence to trigger phrases
4. **No execution**: Commands are parsed only, not executed
5. **Single command per transcript**: Does not parse multiple commands

## Future Work

- [ ] Wire commands into clinical context panel
- [ ] Implement command confirmation UI
- [ ] Add command execution with undo capability
- [ ] Support multi-command transcripts
- [ ] Add NLP-based intent classification
- [ ] Support voice corrections/amendments
- [ ] E2E tests for voice commands

## Related Documentation

- [VOICE_MODE_PIPELINE.md](./VOICE_MODE_PIPELINE.md) - Voice pipeline architecture
- [VOICE_MODE_SETTINGS_GUIDE.md](./VOICE_MODE_SETTINGS_GUIDE.md) - Voice settings
- [.ai/VOICE_MODE_ENHANCEMENT_PLAN.md](../.ai/VOICE_MODE_ENHANCEMENT_PLAN.md) - Phase 4 roadmap
