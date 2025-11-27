// Simplified Citation for admin UI display
// Full canonical definition in DATA_MODEL.md includes: sourceId, authors,
// publicationYear, snippet, relevanceScore
export interface Citation {
  id: string;
  sourceType:
    | "textbook"
    | "journal"
    | "guideline"
    | "note"
    | "uptodate"
    | "pubmed"
    | string;
  title: string;
  subtitle?: string;
  location?: string; // e.g., "ch. 252", "p. 2987"
  url?: string;
  doi?: string;
  // Optional fields from canonical model (may be added later):
  sourceId?: string;
  authors?: string[];
  publicationYear?: number;
  snippet?: string;
  relevanceScore?: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  audioUrl?: string; // URL to audio recording for voice messages
  metadata?: {
    citations?: Citation[];
    sourcesSearched?: string[];
    modelUsed?: string;
    tokens?: number;
    cost?: number;
    phiDetected?: boolean;
    routingDecision?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  // Legacy: citations may appear at top level for backward compatibility
  citations?: Citation[];
  clinicalContextId?: string;
}

export type PatientSex = "male" | "female" | "other";

export interface VitalSigns {
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  o2Saturation?: number;
}

// Canonical ClinicalContext matching DATA_MODEL.md
export interface ClinicalContext {
  id: string; // uuid4
  sessionId: string; // uuid4
  patientAge?: number;
  patientSex?: PatientSex;
  chiefComplaint?: string; // Primary presenting complaint
  relevantHistory?: string; // Relevant medical history
  currentMedications?: string[]; // List of medications
  allergies?: string[]; // Known allergies
  vitalSigns?: VitalSigns; // BP, HR, temp, etc.
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface APIErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface APIEnvelope<T> {
  success: boolean;
  data: T | null;
  error: APIErrorShape | null;
  trace_id: string;
  timestamp: string;
}
