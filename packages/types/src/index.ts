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

export interface Citation {
  id: string;
  source: "kb" | "url";
  reference: string;
  snippet?: string;
  page?: number;
  metadata?: Record<string, any>;
}

export interface MessageMetadata {
  sources?: Source[];
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
  | "error"
  | "ping"
  | "pong";

export interface WebSocketEvent {
  type: WebSocketEventType;
  eventId?: string;
  messageId?: string;
  content?: string;
  delta?: string;
  message?: Message;
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
  | "disconnected";

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
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
