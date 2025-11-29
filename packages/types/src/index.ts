/**
 * VoiceAssist Shared Types
 * Common TypeScript types used across all applications
 */

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "admin" | "physician" | "staff" | "patient";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// Backend token response (what /api/auth/login actually returns)
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// Frontend login response (after fetching user profile)
export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// ============================================================================
// Chat & Conversation Types
// ============================================================================

export interface Message {
  id: string;
  conversationId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  delta?: string;
  citations?: Citation[];
  attachments?: string[];
  timestamp: number;
  metadata?: MessageMetadata;
  // Conversation branching support (Phase 2, Week 10)
  parentId?: string;
  branchId?: string;
}

/**
 * Citation interface - matches backend CitationSchema
 * Supports both structured (new) and legacy fields for backward compatibility
 */
export interface Citation {
  // Core fields
  id: string;

  // Legacy fields (maintained for backward compatibility)
  source?: "kb" | "url" | "pubmed" | "doi";
  reference?: string;

  // Structured fields (Phase 8)
  sourceId?: string;
  sourceType?: string;
  title?: string;
  subtitle?: string;
  location?: string;
  url?: string;
  doi?: string;
  pubmedId?: string;
  page?: number;
  authors?: string[];
  publicationYear?: number;
  journal?: string;
  snippet?: string;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export interface MessageMetadata {
  sources?: Source[];
  citations?: Citation[]; // Phase 8: Structured citations
  toolCalls?: ToolCall[];
  errorInfo?: ErrorInfo;
}

export interface Source {
  documentId: string;
  title: string;
  pageNumber?: number;
  confidence: number;
  excerpt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface ErrorInfo {
  code: string;
  message: string;
  details?: unknown;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  archived?: boolean;
  lastMessagePreview?: string;
  folderId?: string | null;
}

export interface UpdateConversationRequest {
  title?: string;
  archived?: boolean;
  folderId?: string | null;
}

// ============================================================================
// Folder Types
// ============================================================================

export interface Folder {
  id: string;
  userId: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  parentFolderId?: string | null;
  createdAt: string;
  children?: Folder[];
}

export interface CreateFolderRequest {
  name: string;
  color?: string | null;
  icon?: string | null;
  parentFolderId?: string | null;
}

export interface UpdateFolderRequest {
  name?: string;
  color?: string | null;
  icon?: string | null;
  parentFolderId?: string | null;
}

// ============================================================================
// Sharing Types
// ============================================================================

export interface ShareRequest {
  expiresInHours?: number;
  password?: string | null;
  allowAnonymous?: boolean;
}

export interface ShareResponse {
  shareId: string;
  shareUrl: string;
  expiresAt: string;
  passwordProtected: boolean;
}

export interface ShareLink {
  shareToken: string;
  shareUrl: string;
  createdAt: string;
  expiresAt: string;
  passwordProtected: boolean;
  accessCount: number;
}

// ============================================================================
// Template Types
// ============================================================================

export interface ConversationTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  messages: TemplateMessage[];
  clinicalContext?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface TemplateMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  fromConversationId?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
}

// Conversation Branching Types (Phase 2, Week 10)
export interface Branch {
  branchId: string;
  sessionId: string;
  parentMessageId: string | null;
  messageCount: number;
  createdAt: string;
  lastActivity: string;
}

export interface CreateBranchRequest {
  parentMessageId: string;
  initialMessage?: string;
}

// ============================================================================
// Voice Types
// ============================================================================

export interface VoiceConfig {
  voiceId: string;
  speed: number;
  pitch: number;
  volume: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  timestamp: string;
}

// ============================================================================
// Knowledge Base Types
// ============================================================================

export interface Document {
  id: string;
  title: string;
  category: string;
  author?: string;
  uploadedAt: string;
  uploadedBy: string;
  fileSize: number;
  pageCount?: number;
  status: DocumentStatus;
}

export type DocumentStatus = "pending" | "processing" | "indexed" | "failed";

export interface KnowledgeBaseEntry {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
  pageNumber?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

export interface ChatStreamChunk {
  conversationId: string;
  messageId: string;
  delta: string;
  isComplete: boolean;
}

export type WebSocketEventType =
  | "delta"
  | "chunk"
  | "message.done"
  | "user_message.created"
  | "history"
  | "connected"
  | "error"
  | "ping"
  | "pong";

export interface WebSocketEvent {
  type: WebSocketEventType;
  eventId?: string;
  messageId?: string;
  clientMessageId?: string;
  content?: string;
  delta?: string;
  message?: Message;
  messages?: Message[];
  metadata?: any;
  error?: WebSocketError;
}

export interface WebSocketError {
  code: WebSocketErrorCode;
  message: string;
  details?: unknown;
}

export type WebSocketErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "INVALID_EVENT"
  | "BACKEND_ERROR"
  | "CONNECTION_DROPPED";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

// ============================================================================
// Attachment Types
// ============================================================================

export interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string; // 'pdf', 'image', 'text', 'markdown', 'document'
  fileSize: number; // bytes
  fileUrl: string;
  mimeType?: string;
  metadata?: Record<string, any>;
  uploadedAt: string;
  createdAt: string;
}

export interface AttachmentUploadResponse {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  mimeType?: string;
  uploadedAt: string;
  createdAt: string;
}

export interface UploadProgress {
  fileName: string;
  progress: number; // 0-100
  status: "uploading" | "complete" | "error";
  error?: string;
}

// ============================================================================
// Clinical Context Types
// ============================================================================

export interface Vitals {
  temperature?: number; // Celsius
  heartRate?: number; // BPM
  bloodPressure?: string; // e.g., "120/80"
  respiratoryRate?: number; // breaths per minute
  spo2?: number; // percentage (SpO2)
}

export interface ClinicalContext {
  id: string;
  userId: string;
  sessionId?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  chiefComplaint?: string;
  problems: string[]; // Array of problems/diagnoses
  medications: string[]; // Array of medications
  allergies: string[]; // Array of allergies
  vitals: Vitals;
  lastUpdated: string;
  createdAt: string;
}

export interface ClinicalContextCreate {
  sessionId?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  chiefComplaint?: string;
  problems?: string[];
  medications?: string[];
  allergies?: string[];
  vitals?: Vitals;
}

export interface ClinicalContextUpdate {
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  chiefComplaint?: string;
  problems?: string[];
  medications?: string[];
  allergies?: string[];
  vitals?: Vitals;
}

// ============================================================================
// Clinical Context Preset Types
// ============================================================================

export type ClinicalPresetCategory = "builtin" | "custom";

export interface PresetVitals {
  /** Temperature in Celsius */
  temperature?: number;
  /** Heart rate in BPM */
  heartRate?: number;
  /** Blood pressure as structured object with systolic/diastolic */
  bloodPressure?: { systolic: number; diastolic: number };
  /** Respiratory rate in breaths per minute */
  respiratoryRate?: number;
  /** Oxygen saturation percentage */
  oxygenSaturation?: number;
  /** Blood glucose in mg/dL */
  bloodGlucose?: number;
  /** Weight in kg */
  weight?: number;
  /** Pain scale 0-10 */
  painScale?: number;
}

export interface PresetContext {
  /** Session ID to link preset to */
  sessionId?: string;
  /** Patient age */
  age?: number;
  /** Patient gender */
  gender?: string;
  /** Weight in kg */
  weightKg?: number;
  /** Height in cm */
  heightCm?: number;
  /** Chief complaint */
  chiefComplaint?: string;
  /** List of problems/diagnoses */
  problems?: string[];
  /** List of medications */
  medications?: string[];
  /** List of allergies */
  allergies?: string[];
  /** Vitals with structured blood pressure */
  vitals?: PresetVitals;
}

export interface ClinicalContextPreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Whether this is a built-in or custom preset */
  category: ClinicalPresetCategory;
  /** Icon identifier for UI */
  icon?: string;
  /** The clinical context data for this preset */
  context: PresetContext;
  /** User who created this preset (for custom presets) */
  userId?: string;
  /** ISO timestamp when created */
  createdAt?: string;
  /** ISO timestamp when last updated */
  updatedAt?: string;
}

export interface ClinicalPresetCreate {
  name: string;
  description: string;
  icon?: string;
  context: PresetContext;
}

export interface ClinicalPresetUpdate {
  name?: string;
  description?: string;
  icon?: string;
  context?: PresetContext;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface UserSettings {
  theme: "light" | "dark" | "auto";
  language: string;
  voiceConfig: VoiceConfig;
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

// ============================================================================
// Admin Types
// ============================================================================

export interface SystemMetrics {
  activeUsers: number;
  totalConversations: number;
  totalMessages: number;
  documentsIndexed: number;
  avgResponseTime: number;
  uptime: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Admin Integrations Types (Sprint 2)
// ============================================================================

export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "degraded"
  | "not_configured";

export type IntegrationType =
  | "database"
  | "cache"
  | "vector_db"
  | "storage"
  | "llm"
  | "tts"
  | "stt"
  | "realtime"
  | "oauth"
  | "monitoring"
  | "external_api";

export interface IntegrationSummary {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  provider: string;
  lastChecked?: string;
  errorMessage?: string;
}

export interface IntegrationConfig {
  host?: string;
  port?: number;
  enabled?: boolean;
  timeoutSec?: number;
  model?: string;
  endpoint?: string;
  extra?: Record<string, unknown>;
}

export interface IntegrationDetail {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  provider: string;
  description: string;
  config: IntegrationConfig;
  hasApiKey: boolean;
  lastChecked?: string;
  errorMessage?: string;
  metrics?: IntegrationMetrics;
}

export interface IntegrationConfigUpdate {
  enabled?: boolean;
  timeoutSec?: number;
  model?: string;
  endpoint?: string;
  extra?: Record<string, unknown>;
}

export interface IntegrationTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegrationMetrics {
  integrationId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  lastError?: string;
  lastErrorTime?: string;
}

export interface IntegrationsHealthSummary {
  overallStatus: "healthy" | "degraded" | "unhealthy" | "critical";
  totalIntegrations: number;
  connected: number;
  degraded: number;
  errors: number;
  notConfigured: number;
  checkedAt: string;
}

// ============================================================================
// Admin PHI & Security Types (Sprint 3)
// ============================================================================

export type PHIRuleStatus = "enabled" | "disabled";

export type PHIRuleType =
  | "ssn"
  | "phone"
  | "email"
  | "mrn"
  | "account"
  | "ip_address"
  | "url"
  | "dob"
  | "name"
  | "address"
  | "credit_card";

export type PHIRoutingMode = "local_only" | "cloud_allowed" | "hybrid";

export interface PHIRule {
  id: string;
  name: string;
  description: string;
  phiType: PHIRuleType;
  status: PHIRuleStatus;
  pattern?: string;
  isBuiltin: boolean;
  detectionCount: number;
  lastDetection?: string;
}

export interface PHIRuleUpdate {
  status: PHIRuleStatus;
}

export interface PHITestRequest {
  text: string;
  includeRedacted?: boolean;
}

export interface PHITestResult {
  containsPhi: boolean;
  phiTypes: string[];
  confidence: number;
  details: Record<string, unknown>;
  redactedText?: string;
}

export interface PHIRedactResult {
  originalLength: number;
  redactedLength: number;
  redactionCount: number;
  redactedText: string;
}

export interface PHIRoutingConfig {
  mode: PHIRoutingMode;
  confidenceThreshold: number;
  localLlmEnabled: boolean;
  localLlmUrl?: string;
  redactBeforeCloud: boolean;
  auditAllPhi: boolean;
}

export interface PHIRoutingUpdate {
  mode?: PHIRoutingMode;
  confidenceThreshold?: number;
  redactBeforeCloud?: boolean;
  auditAllPhi?: boolean;
}

export interface PHIStats {
  totalDetections: number;
  detectionsToday: number;
  detectionsThisWeek: number;
  byType: Record<string, number>;
  byDay: Array<{
    date: string;
    count: number;
    byType: Record<string, number>;
  }>;
  routingStats: {
    routedLocal: number;
    redactedCloud: number;
    blocked: number;
  };
}

export interface PHIEvent {
  id: string;
  timestamp: string;
  phiTypes: string[];
  confidence: number;
  actionTaken: string;
  userId?: string;
  sessionId?: string;
}

export interface PHIHealthStatus {
  overall: "healthy" | "degraded" | "unhealthy";
  components: {
    detector: string;
    redisConfig: string;
    localLlm: string;
    auditLogging: string;
  };
  routingMode: PHIRoutingMode;
  timestamp: string;
}

export interface PHIRulesResponse {
  rules: PHIRule[];
  total: number;
  enabled: number;
}

export interface PHIEventsResponse {
  events: PHIEvent[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Admin Medical AI Types (Sprint 4)
// ============================================================================

export type ModelProvider = "openai" | "anthropic" | "local";
export type ModelType = "chat" | "embedding" | "tts" | "stt";

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  type: ModelType;
  enabled: boolean;
  isPrimary: boolean;
  supportsPhi: boolean;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
}

export interface ModelUsageMetrics {
  totalRequests24h: number;
  totalTokensInput24h: number;
  totalTokensOutput24h: number;
  estimatedCost24h: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  cloudRequests: number;
  localRequests: number;
  cloudPercentage: number;
  modelBreakdown: ModelBreakdown[];
  periodDays: number;
  timestamp: string;
}

export interface ModelBreakdown {
  modelId: string;
  modelName: string;
  provider: ModelProvider;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
  avgLatencyMs: number;
}

export interface SearchStats {
  totalSearches24h: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
  topQueries: Array<{ query: string; count: number }>;
  searchTypes: {
    semantic: number;
    keyword: number;
    hybrid: number;
  };
  noResultsRate: number;
  periodDays: number;
  timestamp: string;
}

export interface EmbeddingStats {
  totalDocuments: number;
  totalChunks: number;
  totalEmbeddings: number;
  embeddingDimensions: number;
  indexSizeMb: number;
  lastIndexedAt?: string;
  timestamp: string;
}

export interface ModelRoutingConfig {
  phiDetectionEnabled: boolean;
  phiRouteToLocal: boolean;
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  fallbackEnabled: boolean;
  fallbackModel?: string;
  timestamp: string;
}

export interface ModelRoutingUpdate {
  phiDetectionEnabled?: boolean;
  phiRouteToLocal?: boolean;
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  fallbackEnabled?: boolean;
  fallbackModel?: string;
}

// ============================================================================
// Admin System Types (Sprint 4)
// ============================================================================

export interface ResourceMetrics {
  diskTotalGb: number;
  diskUsedGb: number;
  diskFreeGb: number;
  diskUsagePercent: number;
  memoryTotalGb: number;
  memoryUsedGb: number;
  memoryFreeGb: number;
  memoryUsagePercent: number;
  cpuCount: number;
  cpuUsagePercent: number;
  loadAverage1m: number;
  loadAverage5m: number;
  loadAverage15m: number;
  timestamp: string;
}

export type BackupResult = "success" | "failed" | "in_progress" | "unknown";
export type BackupType = "full" | "incremental";

export interface BackupStatus {
  lastBackupAt?: string;
  lastBackupResult: BackupResult;
  backupDestination: string;
  schedule: string;
  retentionDays: number;
  nextScheduledAt?: string;
  backupSizeMb?: number;
  timestamp: string;
}

export interface BackupHistoryEntry {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: BackupResult;
  sizeBytes?: number;
  backupType: BackupType;
  errorMessage?: string;
}

export interface BackupTriggerResult {
  message: string;
  backupId: string;
  backupType: BackupType;
  status: BackupResult;
  timestamp: string;
}

export interface MaintenanceStatus {
  enabled: boolean;
  startedAt?: string;
  startedBy?: string;
  message?: string;
  estimatedEnd?: string;
  timestamp: string;
}

export interface MaintenanceRequest {
  message?: string;
  estimatedDurationMinutes?: number;
}

export type SystemHealthStatus = "healthy" | "degraded" | "unhealthy";

export interface SystemHealth {
  status: SystemHealthStatus;
  uptimeSeconds: number;
  services: Record<string, string>;
  lastCheckedAt: string;
}

// ============================================================================
// Admin Cache Types (Sprint 4 Enhanced)
// ============================================================================

export interface CacheStats {
  l1Size: number;
  l1MaxSize: number;
  l1Utilization: number;
  l2UsedMemory: number;
  l2UsedMemoryHuman: string;
  l2ConnectedClients: number;
}

export interface CacheNamespaceStats {
  namespace: string;
  keyCount: number;
  estimatedSizeBytes: number;
}

export interface CacheNamespacesResponse {
  namespaces: CacheNamespaceStats[];
  totalNamespaces: number;
}

export interface CacheInvalidateResult {
  pattern?: string;
  namespace?: string;
  deletedCount: number;
  message: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Type guard to check if an error has a message property
 */
export function isErrorWithMessage(err: unknown): err is { message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  );
}

/**
 * Safely extracts an error message from an unknown error type.
 * Handles Error instances, objects with message property, and strings.
 * This replaces the need for `catch (err: any)` patterns.
 *
 * @example
 * try {
 *   await fetchData();
 * } catch (err: unknown) {
 *   setError(extractErrorMessage(err));
 * }
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (isErrorWithMessage(err)) return err.message;
  if (typeof err === "string") return err;
  return "An unknown error occurred";
}
