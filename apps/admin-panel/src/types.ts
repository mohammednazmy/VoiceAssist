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

// ==================== Prompt Management Types ====================

export type PromptType = "chat" | "voice" | "persona" | "system";
export type PromptStatus = "draft" | "published" | "archived";
export type IntentCategory =
  | "diagnosis"
  | "treatment"
  | "drug"
  | "guideline"
  | "summary"
  | "other";

export interface Prompt {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  prompt_type: PromptType;
  intent_category?: IntentCategory;
  system_prompt: string;
  published_content?: string;
  status: PromptStatus;
  is_active: boolean;
  current_version: number;
  // Model settings
  temperature?: number;
  max_tokens?: number;
  model_name?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  published_at?: string;
  created_by_id?: string;
  updated_by_id?: string;
  created_by_email?: string;
  updated_by_email?: string;
  // Computed fields
  character_count?: number;
  token_estimate?: number;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  system_prompt: string;
  prompt_type: string;
  intent_category?: string;
  metadata?: Record<string, unknown>;
  change_summary?: string;
  changed_by_id?: string;
  changed_by_email?: string;
  status: string;
  created_at: string;
}

export interface PromptCreate {
  name: string;
  display_name: string;
  description?: string;
  prompt_type: PromptType;
  intent_category?: IntentCategory;
  system_prompt: string;
  temperature?: number;
  max_tokens?: number;
  model_name?: string;
  metadata?: Record<string, unknown>;
}

export interface PromptUpdate {
  display_name?: string;
  description?: string;
  system_prompt?: string;
  intent_category?: IntentCategory;
  temperature?: number;
  max_tokens?: number;
  model_name?: string;
  metadata?: Record<string, unknown>;
  change_summary?: string;
  is_active?: boolean;
}

export interface PromptPublish {
  change_summary?: string;
}

export interface PromptRollback {
  version_number: number;
  reason?: string;
}

export interface PromptTest {
  test_message: string;
  use_draft?: boolean;
  model_override?: string;
  temperature_override?: number;
  max_tokens_override?: number;
}

export interface PromptDuplicate {
  new_name: string;
  new_display_name?: string;
}

export interface PromptListResponse {
  prompts: Prompt[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PromptTestResponse {
  prompt_id: string;
  prompt_name: string;
  test_input: string;
  response: string;
  model: string;
  latency_ms: number;
  tokens_used: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  used_draft: boolean;
  cost_estimate?: number;
}

export interface PromptVersionsResponse {
  prompt_id: string;
  prompt_name: string;
  current_version: number;
  versions: PromptVersion[];
  total: number;
}

export interface PromptDiffResponse {
  prompt_id: string;
  version_a: number;
  version_b: number;
  additions: number;
  deletions: number;
  unified_diff: string;
  version_a_content: string;
  version_b_content: string;
}

export interface PromptStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  by_type: Record<string, number>;
  by_intent: Record<string, number>;
}

export interface PromptCacheStats {
  l1_cache: {
    hits: number;
    misses: number;
    hit_rate: number;
    size: number;
    max_size: number;
    ttl_seconds: number;
  };
  l2_cache: {
    hits: number;
    misses: number;
    hit_rate: number;
    ttl_seconds: number;
  };
  l3_database: {
    hits: number;
    misses: number;
  };
}

// WebSocket events for real-time updates
export interface PromptUpdateEvent {
  event:
    | "prompt_updated"
    | "prompt_published"
    | "prompt_deleted"
    | "prompt_rolled_back";
  prompt_id: string;
  prompt_name: string;
  version?: number;
  updated_by?: string;
  timestamp: string;
}

export interface PromptEditingEvent {
  event: "prompt_editing_started" | "prompt_editing_stopped";
  prompt_id: string;
  user_id: string;
  user_email: string;
  timestamp: string;
}
