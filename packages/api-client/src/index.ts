/**
 * VoiceAssist API Client
 * HTTP client for communicating with VoiceAssist backend services
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type {
  ApiResponse,
  LoginRequest,
  TokenResponse,
  User,
  Conversation,
  UpdateConversationRequest,
  Message,
  Document,
  SearchResult,
  SystemMetrics,
  AuditLogEntry,
  PaginatedResponse,
  AuthTokens,
  Branch,
  CreateBranchRequest,
  Folder,
  CreateFolderRequest,
  UpdateFolderRequest,
  ShareRequest,
  ShareResponse,
  ShareLink,
  Attachment,
  AttachmentUploadResponse,
  ClinicalContext,
  ClinicalContextCreate,
  ClinicalContextUpdate,
  ClinicalContextPreset,
  ClinicalPresetCreate,
  ClinicalPresetUpdate,
  IntegrationSummary,
  IntegrationDetail,
  IntegrationConfigUpdate,
  IntegrationTestResult,
  IntegrationMetrics,
  IntegrationsHealthSummary,
  PHIRule,
  PHIRuleUpdate,
  PHIRulesResponse,
  PHITestRequest,
  PHITestResult,
  PHIRedactResult,
  PHIRoutingConfig,
  PHIRoutingUpdate,
  PHIStats,
  PHIEventsResponse,
  PHIHealthStatus,
  // Sprint 4: Medical AI & System types
  ModelInfo,
  ModelUsageMetrics,
  SearchStats,
  EmbeddingStats,
  ModelRoutingConfig,
  ModelRoutingUpdate,
  ResourceMetrics,
  BackupStatus,
  BackupHistoryEntry,
  BackupTriggerResult,
  BackupType,
  MaintenanceStatus,
  MaintenanceRequest,
  SystemHealth,
  // Note: CacheStats uses local definition (line 181) with different structure
  CacheNamespacesResponse,
  CacheInvalidateResult,
} from "@voiceassist/types";
import { withRetry, type RetryConfig } from "./retry";

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/**
 * Response when 2FA is required during login
 */
export interface TwoFactorRequiredResponse {
  requires_2fa: true;
  user_id: string;
  message: string;
}

/**
 * Type guard to check if login response requires 2FA
 */
export function isTwoFactorRequired(
  response: AuthTokens | TwoFactorRequiredResponse,
): response is TwoFactorRequiredResponse {
  return "requires_2fa" in response && response.requires_2fa === true;
}

const cryptoApi: CryptoLike | undefined =
  typeof crypto !== "undefined" ? (crypto as CryptoLike) : undefined;

const randomHex = (length: number): string => {
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }
  return Math.random()
    .toString(16)
    .slice(2, 2 + length)
    .padEnd(length, "0");
};

const buildTraceparent = (): string => {
  const traceId = (
    cryptoApi?.randomUUID?.().replace(/-/g, "") || randomHex(32)
  ).slice(0, 32);
  const spanId = randomHex(16).slice(0, 16);
  return `00-${traceId}-${spanId}-01`;
};

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  onUnauthorized?: () => void;
  getAccessToken?: () => string | null;
  enableRetry?: boolean;
  retryConfig?: Partial<RetryConfig>;
  onRetry?: (attempt: number, error: any) => void;
  correlationId?: string;
  environment?: "staging" | "production" | string;
}

/** Admin KB document in list response */
export interface AdminKBDocument {
  document_id: string;
  title: string;
  source_type: string;
  upload_date: string;
  chunks_indexed: number;
}

/** Admin KB document detail response */
export interface AdminKBDocumentDetail {
  document_id: string;
  title: string;
  source_type: string;
  filename: string;
  file_type: string;
  chunks_indexed: number;
  total_tokens: number | null;
  indexing_status: string;
  indexing_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Admin KB upload response */
export interface AdminKBUploadResponse {
  document_id: string;
  title: string;
  status: string;
  chunks_indexed: number;
  message: string;
}

/** Feature Flag configuration */
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
  rollout_percentage?: number;
  user_groups?: string[];
  metadata?: Record<string, unknown>;
  flag_type?: string;
  value?: unknown;
  default_value?: unknown;
}

/** Request to create a new feature flag */
export interface CreateFeatureFlagRequest {
  name: string;
  enabled?: boolean;
  description: string;
  rollout_percentage?: number;
  user_groups?: string[];
  metadata?: Record<string, unknown>;
}

/** Request to update an existing feature flag */
export interface UpdateFeatureFlagRequest {
  enabled?: boolean;
  description?: string;
  rollout_percentage?: number;
  user_groups?: string[];
  metadata?: Record<string, unknown>;
}

/** Cache statistics */
export interface CacheStats {
  total_keys: number;
  memory_used_bytes: number;
  memory_used_human: string;
  hit_rate: number;
  miss_rate: number;
  uptime_seconds: number;
  connected_clients: number;
  keys_by_prefix: Record<string, number>;
}

export class VoiceAssistApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;
  private correlationId: string;

  constructor(config: ApiClientConfig) {
    this.config = {
      enableRetry: true, // Enable retry by default
      ...config,
    };

    this.correlationId =
      this.config.correlationId ||
      cryptoApi?.randomUUID?.() ||
      `corr-${randomHex(16)}`;
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Env": this.config.environment || "staging",
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use((requestConfig) => {
      const token = this.config.getAccessToken?.();
      if (token && requestConfig.headers) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
      }

      const traceparent = buildTraceparent();

      if (requestConfig.headers) {
        requestConfig.headers["X-Correlation-ID"] =
          requestConfig.headers["X-Correlation-ID"] || this.correlationId;
        requestConfig.headers["traceparent"] =
          requestConfig.headers["traceparent"] || traceparent;
      }
      return requestConfig;
    });

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.config.onUnauthorized?.();
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Wrap a request with retry logic if enabled
   */
  private async withRetryIfEnabled<T>(fn: () => Promise<T>): Promise<T> {
    if (this.config.enableRetry) {
      return withRetry(fn, this.config.retryConfig, this.config.onRetry);
    }
    return fn();
  }

  /**
   * Execute an arbitrary HTTP request using the configured Axios client.
   * This is useful for endpoints that don't yet have a dedicated helper.
   */
  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    const exec = async () => {
      const response = await this.client.request<T>(config);
      return response.data;
    };

    return this.withRetryIfEnabled(exec);
  }

  /**
   * Expose the configured base URL for diagnostic and display purposes
   */
  getBaseUrl(): string {
    return this.config.baseURL;
  }

  // =========================================================================
  // Authentication
  // =========================================================================

  async login(
    credentials: LoginRequest,
  ): Promise<AuthTokens | TwoFactorRequiredResponse> {
    const response = await this.client.post<
      TokenResponse | TwoFactorRequiredResponse
    >("/api/auth/login", credentials);

    // Check if 2FA is required
    if ("requires_2fa" in response.data && response.data.requires_2fa) {
      return response.data as TwoFactorRequiredResponse;
    }

    // Convert backend response to frontend format
    const tokenResponse = response.data as TokenResponse;
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };
  }

  /**
   * Verify 2FA code during login and get tokens
   */
  async verify2FALogin(
    userId: string,
    code: string,
    isBackupCode: boolean = false,
  ): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>(
      "/api/auth/2fa/verify-login",
      {
        user_id: userId,
        code,
        is_backup_code: isBackupCode,
      },
    );
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  }

  async register(data: {
    email: string;
    password: string;
    full_name: string;
  }): Promise<User> {
    const response = await this.client.post<User>("/api/auth/register", data);
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post("/api/auth/logout");
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>(
      "/api/auth/refresh",
      {
        refresh_token: refreshToken,
      },
    );
    // Convert backend response to frontend format
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>("/api/users/me");
    return response.data;
  }

  /**
   * Get session timeout information for the current session.
   * Used by frontend to display session expiration warnings.
   */
  async getSessionInfo(): Promise<{
    absolute_timeout_hours: number;
    inactivity_timeout_minutes: number;
    absolute_remaining_seconds: number;
    inactivity_remaining_seconds: number;
    session_started_at: string;
    last_activity_at: string | null;
  }> {
    const response = await this.client.get("/api/auth/session");
    return response.data;
  }

  async updateProfile(updates: {
    name?: string;
    email?: string;
  }): Promise<User> {
    const response = await this.client.put<ApiResponse<User>>(
      "/api/users/me",
      updates,
    );
    return response.data.data!;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.client.put("/api/users/me/password", {
      currentPassword,
      newPassword,
    });
  }

  // =========================================================================
  // Voice (Transcription & TTS)
  // =========================================================================

  async transcribeAudio(audio: Blob, filename = "audio.webm"): Promise<string> {
    const formData = new FormData();
    formData.append("audio", audio as any, filename);

    const response = await this.client.post<{ text: string }>(
      "/api/voice/transcribe",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data.text;
  }

  async synthesizeSpeech(text: string, voiceId?: string): Promise<Blob> {
    const response = await this.client.post<Blob>(
      "/api/voice/synthesize",
      { text, voiceId },
      {
        responseType: "blob",
      },
    );

    return response.data;
  }

  /**
   * Synthesize speech with streaming audio response (low latency).
   * Uses ElevenLabs streaming when available, falls back to standard TTS.
   *
   * @param text - Text to synthesize
   * @param options - TTS options including voice settings
   * @returns Response object with streaming body
   */
  async synthesizeSpeechStream(
    text: string,
    options?: {
      voiceId?: string;
      provider?: "openai" | "elevenlabs";
      stability?: number;
      similarityBoost?: number;
      style?: number;
      language?: string;
    },
  ): Promise<Response> {
    // Use native fetch for streaming support (axios buffers responses)
    const token = this.config.getAccessToken?.();
    const url = `${this.config.baseURL}/api/voice/synthesize/stream`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Correlation-ID": this.correlationId,
        traceparent: buildTraceparent(),
      },
      body: JSON.stringify({
        text,
        voice_id: options?.voiceId,
        provider: options?.provider,
        stability: options?.stability,
        similarity_boost: options?.similarityBoost,
        style: options?.style,
        language: options?.language,
      }),
    });

    if (!response.ok) {
      // Handle 401 - trigger unauthorized handler
      if (response.status === 401) {
        this.config.onUnauthorized?.();
      }
      throw new Error(
        `TTS streaming failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  async createRealtimeSession(request: {
    conversation_id?: string | null;
    // Optional Voice Mode settings from frontend
    voice?: string | null; // "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    language?: string | null; // "en" | "es" | "fr" | "de" | "it" | "pt"
    vad_sensitivity?: number | null; // 0-100 (maps to VAD threshold)
  }): Promise<{
    url: string;
    model: string;
    session_id: string;
    expires_at: number;
    conversation_id?: string | null;
    auth: {
      type: string; // "ephemeral_token"
      token: string; // OpenAI ephemeral token (NOT the raw API key)
      expires_at: number; // Unix timestamp
    };
    voice_config: {
      voice: string;
      language?: string | null;
      modalities: string[];
      input_audio_format: string;
      output_audio_format: string;
      input_audio_transcription: {
        model: string;
      };
      turn_detection: {
        type: string;
        threshold: number;
        prefix_padding_ms: number;
        silence_duration_ms: number;
      };
    };
  }> {
    const response = await this.client.post(
      "/api/voice/realtime-session",
      request,
    );
    return response.data;
  }

  async relayVoiceTranscript(request: {
    conversation_id: string;
    transcript: string;
    clinical_context_id?: string | null;
  }): Promise<{
    user_message_id: string;
    assistant_message_id: string;
    answer: string;
    citations: Record<string, any>[];
  }> {
    const response = await this.client.post("/api/voice/relay", request);
    return response.data;
  }

  /**
   * Phase 11: Get available TTS voices from all configured providers
   * @param provider Optional filter by provider ("openai" | "elevenlabs")
   */
  async getAvailableVoices(provider?: string): Promise<{
    voices: Array<{
      voice_id: string;
      name: string;
      provider: string; // "openai" | "elevenlabs"
      category?: string | null;
      preview_url?: string | null;
      description?: string | null;
      labels?: Record<string, string> | null;
    }>;
    default_voice_id?: string | null;
    default_provider: string;
  }> {
    const params = provider ? { provider } : {};
    const response = await this.client.get("/api/voice/voices", { params });
    return response.data;
  }

  /**
   * Submit voice session metrics for observability
   * Note: For page unload scenarios, use sendBeacon directly instead
   */
  async submitVoiceMetrics(metrics: {
    conversation_id?: string | null;
    connection_time_ms?: number | null;
    time_to_first_transcript_ms?: number | null;
    last_stt_latency_ms?: number | null;
    last_response_latency_ms?: number | null;
    session_duration_ms?: number | null;
    user_transcript_count?: number;
    ai_response_count?: number;
    reconnect_count?: number;
    session_started_at?: number | null;
  }): Promise<{ status: string }> {
    const response = await this.client.post("/api/voice/metrics", metrics);
    return response.data;
  }

  /**
   * Log a voice event (e.g., barge-in) for analytics and observability
   */
  async logVoiceEvent(event: {
    conversation_id?: string | null;
    event_type:
      | "barge_in"
      | "connection_error"
      | "transcription_error"
      | "synthesis_error";
    timestamp: number;
    metadata?: {
      interrupted_content?: string;
      completion_percentage?: number;
      error_message?: string;
      [key: string]: unknown;
    };
  }): Promise<{ status: string; event_id: string }> {
    const response = await this.client.post("/api/voice/events", event);
    return response.data;
  }

  // =========================================================================
  // Thinker/Talker Voice Pipeline (Phase: T/T Migration)
  // =========================================================================

  /**
   * Get Thinker/Talker pipeline status and availability
   * Returns information about STT, TTS, and LLM services
   */
  async getTTPipelineStatus(): Promise<{
    available: boolean;
    mode: string; // "thinker_talker" or "realtime_fallback"
    services: {
      stt: {
        primary: string;
        fallback: string;
        status: "healthy" | "degraded" | "unavailable";
      };
      tts: {
        provider: string;
        status: "healthy" | "degraded" | "unavailable";
      };
      llm: {
        model: string;
        status: "healthy" | "degraded" | "unavailable";
      };
    };
    latency_targets: {
      stt_ms: number;
      llm_first_token_ms: number;
      tts_ttfb_ms: number;
      total_ms: number;
    };
  }> {
    const response = await this.client.get("/api/voice/pipeline/status");
    return response.data;
  }

  /**
   * Get WebSocket URL for Thinker/Talker voice pipeline
   * This is the endpoint for the T/T voice WebSocket connection
   */
  getTTPipelineWebSocketUrl(): string {
    const wsProtocol = this.config.baseURL.startsWith("https") ? "wss" : "ws";
    const wsHost = this.config.baseURL.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${wsHost}/api/voice/pipeline-ws`;
  }

  /**
   * Submit T/T pipeline metrics for observability
   */
  async submitTTPipelineMetrics(metrics: {
    conversation_id?: string | null;
    session_id?: string | null;
    connection_time_ms?: number | null;
    stt_latency_ms?: number | null;
    llm_first_token_ms?: number | null;
    tts_first_audio_ms?: number | null;
    total_latency_ms?: number | null;
    session_duration_ms?: number | null;
    user_utterance_count?: number;
    ai_response_count?: number;
    tool_call_count?: number;
    barge_in_count?: number;
    reconnect_count?: number;
    pipeline_mode?: string;
  }): Promise<{ status: string }> {
    const response = await this.client.post(
      "/api/voice/pipeline/metrics",
      metrics,
    );
    return response.data;
  }

  async getOAuthUrl(provider: "google" | "microsoft"): Promise<string> {
    const response = await this.client.get<ApiResponse<{ url: string }>>(
      `/api/auth/oauth/${provider}/authorize`,
    );
    return response.data.data!.url;
  }

  async handleOAuthCallback(
    provider: "google" | "microsoft",
    code: string,
  ): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>(
      `/api/auth/oauth/${provider}/callback`,
      { code },
    );
    // Convert backend response to frontend format
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  }

  // =========================================================================
  // Conversations
  // =========================================================================

  async getConversations(
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResponse<Conversation>> {
    const response = await this.client.get<
      ApiResponse<{
        items: Conversation[];
        total: number;
        page: number;
        pageSize: number;
      }>
    >("/api/conversations", { params: { page, pageSize } });
    const data = response.data.data!;
    // Transform backend response (total) to frontend format (totalCount, totalPages)
    return {
      items: data.items,
      page: data.page,
      pageSize: data.pageSize,
      totalCount: data.total,
      totalPages: Math.ceil(data.total / data.pageSize),
    };
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await this.client.get<ApiResponse<Conversation>>(
      `/api/conversations/${id}`,
    );
    return response.data.data!;
  }

  async createConversation(title: string): Promise<Conversation> {
    const response = await this.client.post<ApiResponse<Conversation>>(
      "/api/conversations",
      { title },
    );
    return response.data.data!;
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationRequest,
  ): Promise<Conversation> {
    const response = await this.client.patch<ApiResponse<Conversation>>(
      `/api/conversations/${id}`,
      updates,
    );
    return response.data.data!;
  }

  async archiveConversation(id: string): Promise<Conversation> {
    return this.updateConversation(id, { archived: true });
  }

  async unarchiveConversation(id: string): Promise<Conversation> {
    return this.updateConversation(id, { archived: false });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.client.delete(`/api/conversations/${id}`);
  }

  /**
   * Delete ALL conversations for the current user.
   * This is a destructive operation - use with caution.
   * @returns Object with deleted_count and confirmation message
   */
  async deleteAllConversations(): Promise<{
    deleted_count: number;
    message: string;
  }> {
    const response = await this.client.delete<
      ApiResponse<{ deleted_count: number; message: string }>
    >("/api/conversations/all");
    return response.data.data!;
  }

  // =========================================================================
  // Messages
  // =========================================================================

  async getMessages(
    conversationId: string,
    page = 1,
    pageSize = 50,
  ): Promise<PaginatedResponse<Message>> {
    const response = await this.client.get<
      ApiResponse<{
        items: Message[];
        total: number;
        page: number;
        pageSize: number;
      }>
    >(`/api/conversations/${conversationId}/messages`, {
      params: { page, pageSize },
    });
    const data = response.data.data!;
    // Transform backend response (total) to frontend format (totalCount, totalPages)
    return {
      items: data.items,
      page: data.page,
      pageSize: data.pageSize,
      totalCount: data.total,
      totalPages: Math.ceil(data.total / data.pageSize),
    };
  }

  /**
   * Send a message to a conversation
   * @param conversationId - The conversation ID
   * @param content - The message content
   * @param options - Optional parameters including idempotency key
   */
  async sendMessage(
    conversationId: string,
    content: string,
    options?: {
      role?: "user" | "assistant" | "system";
      branchId?: string;
      parentMessageId?: string;
      clientMessageId?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<Message & { isDuplicate?: boolean }> {
    const response = await this.client.post<
      ApiResponse<Message & { is_duplicate?: boolean }>
    >(`/api/conversations/${conversationId}/messages`, {
      content,
      role: options?.role ?? "user",
      branch_id: options?.branchId,
      parent_message_id: options?.parentMessageId,
      client_message_id: options?.clientMessageId,
      metadata: options?.metadata,
    });
    const data = response.data.data!;
    return {
      ...data,
      isDuplicate: data.is_duplicate,
    };
  }

  /**
   * Send an idempotent message to a conversation
   * Safe to retry - will return existing message if client_message_id already exists
   * @param conversationId - The conversation ID
   * @param clientMessageId - Unique client-generated ID for deduplication
   * @param content - The message content
   * @param options - Optional parameters
   */
  async sendIdempotentMessage(
    conversationId: string,
    clientMessageId: string,
    content: string,
    options?: {
      role?: "user" | "assistant" | "system";
      branchId?: string;
      parentMessageId?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<Message & { isDuplicate: boolean }> {
    return this.sendMessage(conversationId, content, {
      ...options,
      clientMessageId,
    }) as Promise<Message & { isDuplicate: boolean }>;
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const response = await this.client.patch<ApiResponse<Message>>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      { content },
    );
    return response.data.data!;
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.client.delete(
      `/api/conversations/${conversationId}/messages/${messageId}`,
    );
  }

  /**
   * Regenerate a message with custom options
   * Creates a branch to preserve the original message
   */
  async regenerateWithOptions(
    conversationId: string,
    messageId: string,
    options: {
      temperature?: number;
      lengthPreference?: "short" | "medium" | "detailed";
      useClinicalContext?: boolean;
      createBranch?: boolean;
      clinicalContextId?: string;
    },
  ): Promise<{
    message: Message;
    branchId?: string;
    originalMessageId: string;
  }> {
    const response = await this.client.post<
      ApiResponse<{
        message: Message;
        branch_id?: string;
        original_message_id: string;
      }>
    >(`/api/conversations/${conversationId}/messages/${messageId}/regenerate`, {
      temperature: options.temperature ?? 0.7,
      length_preference: options.lengthPreference ?? "medium",
      use_clinical_context: options.useClinicalContext ?? false,
      create_branch: options.createBranch ?? true,
      clinical_context_id: options.clinicalContextId,
    });
    const data = response.data.data!;
    return {
      message: data.message,
      branchId: data.branch_id,
      originalMessageId: data.original_message_id,
    };
  }

  // =========================================================================
  // Conversation Branching (Phase 2, Week 10)
  // =========================================================================

  async createBranch(
    sessionId: string,
    request: CreateBranchRequest,
  ): Promise<Branch> {
    const response = await this.client.post<ApiResponse<Branch>>(
      `/api/conversations/${sessionId}/branches`,
      request,
    );
    return response.data.data!;
  }

  async listBranches(sessionId: string): Promise<Branch[]> {
    const response = await this.client.get<ApiResponse<Branch[]>>(
      `/api/conversations/${sessionId}/branches`,
    );
    return response.data.data!;
  }

  async getBranchMessages(
    sessionId: string,
    branchId: string,
  ): Promise<Message[]> {
    const response = await this.client.get<ApiResponse<Message[]>>(
      `/api/conversations/${sessionId}/branches/${branchId}/messages`,
    );
    return response.data.data!;
  }

  // =========================================================================
  // Knowledge Base
  // =========================================================================

  async searchKnowledgeBase(
    query: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    const response = await this.client.post<ApiResponse<SearchResult[]>>(
      "/kb/search",
      { query, limit },
    );
    return response.data.data!;
  }

  async getDocuments(
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResponse<Document>> {
    const response = await this.client.get<
      ApiResponse<PaginatedResponse<Document>>
    >("/kb/documents", { params: { page, pageSize } });
    return response.data.data!;
  }

  async getDocument(id: string): Promise<Document> {
    const response = await this.client.get<ApiResponse<Document>>(
      `/kb/documents/${id}`,
    );
    return response.data.data!;
  }

  async uploadDocument(file: File, category: string): Promise<Document> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    const response = await this.client.post<ApiResponse<Document>>(
      "/kb/documents",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data.data!;
  }

  async deleteDocument(id: string): Promise<void> {
    await this.client.delete(`/kb/documents/${id}`);
  }

  // =========================================================================
  // Admin
  // =========================================================================

  async getSystemMetrics(): Promise<SystemMetrics> {
    const response =
      await this.client.get<ApiResponse<SystemMetrics>>("/admin/metrics");
    return response.data.data!;
  }

  async getAuditLogs(
    page = 1,
    pageSize = 50,
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const response = await this.client.get<
      ApiResponse<PaginatedResponse<AuditLogEntry>>
    >("/admin/audit-logs", { params: { page, pageSize } });
    return response.data.data!;
  }

  async getUsers(page = 1, pageSize = 20): Promise<PaginatedResponse<User>> {
    const response = await this.client.get<
      ApiResponse<PaginatedResponse<User>>
    >("/admin/users", { params: { page, pageSize } });
    return response.data.data!;
  }

  // =========================================================================
  // Admin Knowledge Base
  // =========================================================================

  /**
   * List all documents in the knowledge base (admin only)
   * @param skip - Number of documents to skip for pagination
   * @param limit - Maximum number of documents to return
   * @param sourceType - Optional filter by source type
   */
  async getAdminKBDocuments(
    skip = 0,
    limit = 50,
    sourceType?: string,
  ): Promise<{
    documents: AdminKBDocument[];
    total: number;
  }> {
    const params: Record<string, unknown> = { skip, limit };
    if (sourceType) params.source_type = sourceType;

    const response = await this.client.get<
      ApiResponse<{ documents: AdminKBDocument[]; total: number }>
    >("/admin/kb/documents", { params });
    return response.data.data!;
  }

  /**
   * Get details for a specific document (admin only)
   * @param documentId - Document ID
   */
  async getAdminKBDocument(documentId: string): Promise<AdminKBDocumentDetail> {
    const response = await this.client.get<ApiResponse<AdminKBDocumentDetail>>(
      `/admin/kb/documents/${documentId}`,
    );
    return response.data.data!;
  }

  /**
   * Upload and index a document to the knowledge base (admin only)
   * @param file - File to upload
   * @param title - Optional document title (defaults to filename)
   * @param sourceType - Type of source (e.g., "uploaded", "guideline", "journal")
   * @param onProgress - Optional progress callback
   */
  async uploadAdminKBDocument(
    file: File,
    title?: string,
    sourceType = "uploaded",
    onProgress?: (progress: number) => void,
  ): Promise<AdminKBUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (title) formData.append("title", title);
    formData.append("source_type", sourceType);

    const response = await this.client.post<ApiResponse<AdminKBUploadResponse>>(
      "/admin/kb/documents",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress(percentCompleted);
          }
        },
      },
    );
    return response.data.data!;
  }

  /**
   * Delete a document from the knowledge base (admin only)
   * @param documentId - Document ID to delete
   */
  async deleteAdminKBDocument(
    documentId: string,
  ): Promise<{ document_id: string; status: string; message: string }> {
    const response = await this.client.delete<
      ApiResponse<{ document_id: string; status: string; message: string }>
    >(`/admin/kb/documents/${documentId}`);
    return response.data.data!;
  }

  // =========================================================================
  // Folders
  // =========================================================================

  async getFolders(parentId?: string | null): Promise<Folder[]> {
    const params = parentId ? { parent_id: parentId } : undefined;
    const response = await this.client.get<Folder[]>("/api/folders", {
      params,
    });
    return response.data;
  }

  async getFolderTree(): Promise<Folder[]> {
    const response = await this.client.get<Folder[]>("/api/folders/tree");
    return response.data;
  }

  async getFolder(id: string): Promise<Folder> {
    const response = await this.client.get<Folder>(`/api/folders/${id}`);
    return response.data;
  }

  async createFolder(request: CreateFolderRequest): Promise<Folder> {
    const response = await this.client.post<Folder>("/api/folders", request);
    return response.data;
  }

  async updateFolder(
    id: string,
    request: UpdateFolderRequest,
  ): Promise<Folder> {
    const response = await this.client.put<Folder>(
      `/api/folders/${id}`,
      request,
    );
    return response.data;
  }

  async deleteFolder(id: string): Promise<void> {
    await this.client.delete(`/api/folders/${id}`);
  }

  async moveFolder(folderId: string, targetFolderId: string): Promise<Folder> {
    const response = await this.client.post<Folder>(
      `/api/folders/${folderId}/move/${targetFolderId}`,
    );
    return response.data;
  }

  async moveConversationToFolder(
    conversationId: string,
    folderId: string | null,
  ): Promise<Conversation> {
    return this.updateConversation(conversationId, { folderId });
  }

  // =========================================================================
  // Sharing
  // =========================================================================

  async createShareLink(
    sessionId: string,
    request: ShareRequest,
  ): Promise<ShareResponse> {
    const response = await this.client.post<ShareResponse>(
      `/api/sessions/${sessionId}/share`,
      request,
    );
    return response.data;
  }

  async getSharedConversation(
    shareToken: string,
    password?: string,
  ): Promise<any> {
    const params = password ? { password } : undefined;
    const response = await this.client.get(`/api/shared/${shareToken}`, {
      params,
    });
    return response.data;
  }

  async listShareLinks(sessionId: string): Promise<ShareLink[]> {
    const response = await this.client.get<ShareLink[]>(
      `/api/sessions/${sessionId}/shares`,
    );
    return response.data;
  }

  async revokeShareLink(sessionId: string, shareToken: string): Promise<void> {
    await this.client.delete(`/api/sessions/${sessionId}/share/${shareToken}`);
  }

  // =========================================================================
  // Attachments
  // =========================================================================

  async uploadAttachment(
    messageId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<AttachmentUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await this.client.post<AttachmentUploadResponse>(
      `/api/messages/${messageId}/attachments`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress(percentCompleted);
          }
        },
      },
    );

    return response.data;
  }

  async listAttachments(messageId: string): Promise<Attachment[]> {
    const response = await this.client.get<Attachment[]>(
      `/api/messages/${messageId}/attachments`,
    );
    return response.data;
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.client.delete(`/api/attachments/${attachmentId}`);
  }

  async downloadAttachment(attachmentId: string): Promise<Blob> {
    const response = await this.client.get(
      `/api/attachments/${attachmentId}/download`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  }

  getAttachmentUrl(attachmentId: string): string {
    return `${this.config.baseURL}/api/attachments/${attachmentId}/download`;
  }

  // =========================================================================
  // Clinical Context
  // =========================================================================

  async createClinicalContext(
    context: ClinicalContextCreate,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.post<ClinicalContext>(
        "/api/clinical-contexts",
        context,
      );
      return response.data;
    });
  }

  async getCurrentClinicalContext(
    sessionId?: string,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const params = sessionId ? { session_id: sessionId } : undefined;
      const response = await this.client.get<ClinicalContext>(
        "/api/clinical-contexts/current",
        { params },
      );
      return response.data;
    });
  }

  async getClinicalContext(contextId: string): Promise<ClinicalContext> {
    const response = await this.client.get<ClinicalContext>(
      `/api/clinical-contexts/${contextId}`,
    );
    return response.data;
  }

  async updateClinicalContext(
    contextId: string,
    update: ClinicalContextUpdate,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.put<ClinicalContext>(
        `/api/clinical-contexts/${contextId}`,
        update,
      );
      return response.data;
    });
  }

  async deleteClinicalContext(contextId: string): Promise<void> {
    await this.client.delete(`/api/clinical-contexts/${contextId}`);
  }

  // =========================================================================
  // Clinical Context Presets
  // =========================================================================

  /**
   * Get all clinical context presets for the current user
   * Includes both built-in presets and user-created custom presets
   */
  async listClinicalPresets(): Promise<ClinicalContextPreset[]> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.get<ClinicalContextPreset[]>(
        "/api/clinical-presets",
      );
      return response.data;
    });
  }

  /**
   * Get a specific clinical context preset by ID
   */
  async getClinicalPreset(presetId: string): Promise<ClinicalContextPreset> {
    const response = await this.client.get<ClinicalContextPreset>(
      `/api/clinical-presets/${presetId}`,
    );
    return response.data;
  }

  /**
   * Create a new custom clinical context preset
   */
  async createClinicalPreset(
    preset: ClinicalPresetCreate,
  ): Promise<ClinicalContextPreset> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.post<ClinicalContextPreset>(
        "/api/clinical-presets",
        preset,
      );
      return response.data;
    });
  }

  /**
   * Update an existing custom clinical context preset
   * Note: Built-in presets cannot be modified
   */
  async updateClinicalPreset(
    presetId: string,
    update: ClinicalPresetUpdate,
  ): Promise<ClinicalContextPreset> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.put<ClinicalContextPreset>(
        `/api/clinical-presets/${presetId}`,
        update,
      );
      return response.data;
    });
  }

  /**
   * Delete a custom clinical context preset
   * Note: Built-in presets cannot be deleted
   */
  async deleteClinicalPreset(presetId: string): Promise<void> {
    await this.client.delete(`/api/clinical-presets/${presetId}`);
  }

  /**
   * Apply a preset to create or update the current clinical context
   * Returns the new clinical context
   */
  async applyClinicalPreset(
    presetId: string,
    sessionId?: string,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.post<ClinicalContext>(
        `/api/clinical-presets/${presetId}/apply`,
        { session_id: sessionId },
      );
      return response.data;
    });
  }

  // =========================================================================
  // Export
  // =========================================================================

  /**
   * Export conversation as Markdown
   * Returns a Blob that can be downloaded
   */
  async exportConversationAsMarkdown(conversationId: string): Promise<Blob> {
    const response = await this.client.get(
      `/api/export/sessions/${conversationId}/export/markdown`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  }

  /**
   * Export conversation as PDF
   * Returns a Blob that can be downloaded
   */
  async exportConversationAsPdf(conversationId: string): Promise<Blob> {
    const response = await this.client.get(
      `/api/export/sessions/${conversationId}/export/pdf`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  }

  // =========================================================================
  // Admin Feature Flags
  // =========================================================================

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    const response = await this.client.get<FeatureFlag[]>(
      "/api/admin/feature-flags",
    );
    return response.data;
  }

  async getFeatureFlag(flagName: string): Promise<FeatureFlag> {
    const response = await this.client.get<FeatureFlag>(
      `/api/admin/feature-flags/${flagName}`,
    );
    return response.data;
  }

  /**
   * Get a feature flag value using the public experiments endpoint.
   * This does NOT require admin access and is suitable for client-side feature checks.
   * @param flagName - The flag name (e.g., "backend.voice_silero_vad_enabled")
   * @returns The flag value and metadata
   */
  async getPublicFeatureFlag(flagName: string): Promise<{
    name: string;
    enabled: boolean;
    value: unknown;
    flag_type: string;
    description?: string;
    rollout_percentage?: number;
  }> {
    const response = await this.client.get(
      `/api/experiments/flags/${flagName}`,
    );
    return response.data;
  }

  async createFeatureFlag(
    flag: CreateFeatureFlagRequest,
  ): Promise<FeatureFlag> {
    const response = await this.client.post<FeatureFlag>(
      "/api/admin/feature-flags",
      flag,
    );
    return response.data;
  }

  async updateFeatureFlag(
    flagName: string,
    updates: UpdateFeatureFlagRequest,
  ): Promise<FeatureFlag> {
    const response = await this.client.patch<FeatureFlag>(
      `/api/admin/feature-flags/${flagName}`,
      updates,
    );
    return response.data;
  }

  async deleteFeatureFlag(flagName: string): Promise<void> {
    await this.client.delete(`/admin/feature-flags/${flagName}`);
  }

  async toggleFeatureFlag(flagName: string): Promise<FeatureFlag> {
    const response = await this.client.post<FeatureFlag>(
      `/admin/feature-flags/${flagName}/toggle`,
    );
    return response.data;
  }

  // =========================================================================
  // Admin Cache Management
  // =========================================================================

  async getCacheStats(): Promise<CacheStats> {
    const response = await this.client.get<CacheStats>("/admin/cache/stats");
    return response.data;
  }

  async clearCache(): Promise<{ status: string; message: string }> {
    const response = await this.client.post<{
      status: string;
      message: string;
    }>("/admin/cache/clear");
    return response.data;
  }

  async invalidateCachePattern(
    pattern: string,
  ): Promise<{ status: string; keys_invalidated: number }> {
    const response = await this.client.post<{
      status: string;
      keys_invalidated: number;
    }>("/admin/cache/invalidate", null, {
      params: { pattern },
    });
    return response.data;
  }

  // =========================================================================
  // Admin Integrations (Sprint 2)
  // =========================================================================

  /**
   * List all integrations with their current status
   */
  async getIntegrations(): Promise<IntegrationSummary[]> {
    const response = await this.client.get<IntegrationSummary[]>(
      "/api/admin/integrations/",
    );
    return response.data;
  }

  /**
   * Get detailed information about a specific integration
   * @param integrationId - Integration identifier (e.g., "postgres", "redis", "openai")
   */
  async getIntegration(integrationId: string): Promise<IntegrationDetail> {
    const response = await this.client.get<IntegrationDetail>(
      `/api/admin/integrations/${integrationId}`,
    );
    return response.data;
  }

  /**
   * Update configuration for an integration (admin only)
   * @param integrationId - Integration identifier
   * @param config - Configuration updates
   */
  async updateIntegrationConfig(
    integrationId: string,
    config: IntegrationConfigUpdate,
  ): Promise<IntegrationDetail> {
    const response = await this.client.patch<IntegrationDetail>(
      `/api/admin/integrations/${integrationId}/config`,
      config,
    );
    return response.data;
  }

  /**
   * Test connectivity for an integration (admin only)
   * @param integrationId - Integration identifier
   */
  async testIntegration(integrationId: string): Promise<IntegrationTestResult> {
    const response = await this.client.post<IntegrationTestResult>(
      `/api/admin/integrations/${integrationId}/test`,
    );
    return response.data;
  }

  /**
   * Get metrics for all integrations
   */
  async getIntegrationMetrics(): Promise<IntegrationMetrics[]> {
    const response = await this.client.get<IntegrationMetrics[]>(
      "/api/admin/integrations/metrics/summary",
    );
    return response.data;
  }

  /**
   * Get overall health summary of all integrations
   */
  async getIntegrationsHealth(): Promise<IntegrationsHealthSummary> {
    const response = await this.client.get<IntegrationsHealthSummary>(
      "/api/admin/integrations/health",
    );
    return response.data;
  }

  // =========================================================================
  // Admin PHI & Security (Sprint 3)
  // =========================================================================

  /**
   * List all PHI detection rules with their current status
   */
  async getPHIRules(): Promise<PHIRulesResponse> {
    const response =
      await this.client.get<ApiResponse<PHIRulesResponse>>("/admin/phi/rules");
    return response.data.data!;
  }

  /**
   * Get details of a specific PHI detection rule
   */
  async getPHIRule(ruleId: string): Promise<PHIRule> {
    const response = await this.client.get<ApiResponse<PHIRule>>(
      `/admin/phi/rules/${ruleId}`,
    );
    return response.data.data!;
  }

  /**
   * Update a PHI detection rule (enable/disable)
   */
  async updatePHIRule(ruleId: string, update: PHIRuleUpdate): Promise<PHIRule> {
    const response = await this.client.put<ApiResponse<PHIRule>>(
      `/admin/phi/rules/${ruleId}`,
      update,
    );
    return response.data.data!;
  }

  /**
   * Test PHI detection on provided text
   */
  async testPHIDetection(request: PHITestRequest): Promise<PHITestResult> {
    const response = await this.client.post<ApiResponse<PHITestResult>>(
      "/admin/phi/test",
      request,
    );
    return response.data.data!;
  }

  /**
   * Redact PHI from provided text
   */
  async redactPHI(request: PHITestRequest): Promise<PHIRedactResult> {
    const response = await this.client.post<ApiResponse<PHIRedactResult>>(
      "/admin/phi/redact",
      request,
    );
    return response.data.data!;
  }

  /**
   * Get current PHI routing configuration
   */
  async getPHIRouting(): Promise<PHIRoutingConfig> {
    const response =
      await this.client.get<ApiResponse<PHIRoutingConfig>>(
        "/admin/phi/routing",
      );
    return response.data.data!;
  }

  /**
   * Update PHI routing configuration
   */
  async updatePHIRouting(update: PHIRoutingUpdate): Promise<PHIRoutingConfig> {
    const response = await this.client.patch<ApiResponse<PHIRoutingConfig>>(
      "/admin/phi/routing",
      update,
    );
    return response.data.data!;
  }

  /**
   * Get PHI detection statistics
   */
  async getPHIStats(days: number = 7): Promise<PHIStats> {
    const response = await this.client.get<ApiResponse<PHIStats>>(
      `/admin/phi/stats?days=${days}`,
    );
    return response.data.data!;
  }

  /**
   * Get recent PHI detection events
   */
  async getPHIEvents(
    limit: number = 50,
    offset: number = 0,
  ): Promise<PHIEventsResponse> {
    const response = await this.client.get<ApiResponse<PHIEventsResponse>>(
      `/admin/phi/events?limit=${limit}&offset=${offset}`,
    );
    return response.data.data!;
  }

  /**
   * Get PHI detection system health status
   */
  async getPHIHealth(): Promise<PHIHealthStatus> {
    const response =
      await this.client.get<ApiResponse<PHIHealthStatus>>("/admin/phi/health");
    return response.data.data!;
  }

  // =========================================================================
  // Admin Medical AI (Sprint 4)
  // =========================================================================

  /**
   * List all available AI models with their configuration
   */
  async getModels(): Promise<ModelInfo[]> {
    const response = await this.client.get<
      ApiResponse<{ models: ModelInfo[] }>
    >("/admin/medical/models");
    return response.data.data!.models;
  }

  /**
   * Get detailed information about a specific model
   */
  async getModel(modelId: string): Promise<ModelInfo & { usage_24h?: any }> {
    const response = await this.client.get<
      ApiResponse<ModelInfo & { usage_24h?: any }>
    >(`/admin/medical/models/${modelId}`);
    return response.data.data!;
  }

  /**
   * Get AI model usage metrics and cost tracking
   */
  async getModelMetrics(days: number = 1): Promise<ModelUsageMetrics> {
    const response = await this.client.get<ApiResponse<ModelUsageMetrics>>(
      `/admin/medical/metrics?days=${days}`,
    );
    return response.data.data!;
  }

  /**
   * Get search analytics and statistics
   */
  async getSearchStats(days: number = 1): Promise<SearchStats> {
    const response = await this.client.get<ApiResponse<SearchStats>>(
      `/admin/medical/search/stats?days=${days}`,
    );
    return response.data.data!;
  }

  /**
   * Get embedding database statistics
   */
  async getEmbeddingStats(): Promise<EmbeddingStats> {
    const response = await this.client.get<ApiResponse<EmbeddingStats>>(
      "/admin/medical/embeddings/stats",
    );
    return response.data.data!;
  }

  /**
   * Get current model routing configuration
   */
  async getModelRouting(): Promise<ModelRoutingConfig> {
    const response = await this.client.get<ApiResponse<ModelRoutingConfig>>(
      "/admin/medical/routing",
    );
    return response.data.data!;
  }

  /**
   * Update model routing configuration
   */
  async updateModelRouting(
    update: ModelRoutingUpdate,
  ): Promise<{ message: string; updates: ModelRoutingUpdate }> {
    const response = await this.client.patch<
      ApiResponse<{ message: string; updates: ModelRoutingUpdate }>
    >("/admin/medical/routing", update);
    return response.data.data!;
  }

  // =========================================================================
  // Admin System (Sprint 4)
  // =========================================================================

  /**
   * Get system resource metrics (disk, memory, CPU)
   */
  async getSystemResources(): Promise<ResourceMetrics> {
    const response = await this.client.get<ApiResponse<ResourceMetrics>>(
      "/admin/system/resources",
    );
    return response.data.data!;
  }

  /**
   * Get overall system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const response = await this.client.get<ApiResponse<SystemHealth>>(
      "/admin/system/health",
    );
    return response.data.data!;
  }

  /**
   * Get current backup status and configuration
   */
  async getBackupStatus(): Promise<BackupStatus> {
    const response = await this.client.get<ApiResponse<BackupStatus>>(
      "/admin/system/backup/status",
    );
    return response.data.data!;
  }

  /**
   * Get backup history
   */
  async getBackupHistory(
    limit: number = 10,
  ): Promise<{ history: BackupHistoryEntry[]; total: number }> {
    const response = await this.client.get<
      ApiResponse<{ history: BackupHistoryEntry[]; total: number }>
    >(`/admin/system/backup/history?limit=${limit}`);
    return response.data.data!;
  }

  /**
   * Trigger a manual backup (admin only)
   */
  async triggerBackup(
    backupType: BackupType = "full",
  ): Promise<BackupTriggerResult> {
    const response = await this.client.post<ApiResponse<BackupTriggerResult>>(
      `/admin/system/backup/trigger?backup_type=${backupType}`,
    );
    return response.data.data!;
  }

  /**
   * Get current maintenance mode status
   */
  async getMaintenanceStatus(): Promise<MaintenanceStatus> {
    const response = await this.client.get<ApiResponse<MaintenanceStatus>>(
      "/admin/system/maintenance",
    );
    return response.data.data!;
  }

  /**
   * Enable maintenance mode (admin only)
   */
  async enableMaintenance(
    request: MaintenanceRequest,
  ): Promise<MaintenanceStatus> {
    const response = await this.client.post<ApiResponse<MaintenanceStatus>>(
      "/admin/system/maintenance/enable",
      request,
    );
    return response.data.data!;
  }

  /**
   * Disable maintenance mode (admin only)
   */
  async disableMaintenance(): Promise<{
    enabled: boolean;
    action: string;
    disabled_by: string;
  }> {
    const response = await this.client.post<
      ApiResponse<{ enabled: boolean; action: string; disabled_by: string }>
    >("/admin/system/maintenance/disable");
    return response.data.data!;
  }

  // =========================================================================
  // Admin Cache Management Enhanced (Sprint 4)
  // =========================================================================

  /**
   * Get cache statistics by namespace
   */
  async getCacheNamespaces(): Promise<CacheNamespacesResponse> {
    const response = await this.client.get<
      ApiResponse<CacheNamespacesResponse>
    >("/admin/cache/stats/namespaces");
    return response.data.data!;
  }

  /**
   * Invalidate all cache entries in a specific namespace
   */
  async invalidateCacheNamespace(
    namespace: string,
  ): Promise<CacheInvalidateResult> {
    const response = await this.client.post<ApiResponse<CacheInvalidateResult>>(
      "/admin/cache/invalidate/namespace",
      null,
      { params: { namespace } },
    );
    return response.data.data!;
  }

  // =========================================================================
  // Admin Conversations
  // =========================================================================

  /**
   * List all conversations across all users (admin only)
   */
  async getAdminConversations(
    params: {
      limit?: number;
      offset?: number;
      user_id?: string;
      search?: string;
    } = {},
  ): Promise<{
    conversations: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get("/api/admin/conversations", {
      params,
    });
    return response.data;
  }

  /**
   * Get a specific conversation with details (admin only)
   */
  async getAdminConversation(conversationId: string): Promise<{
    conversation: any;
  }> {
    const response = await this.client.get(
      `/api/admin/conversations/${conversationId}`,
    );
    return response.data;
  }

  /**
   * Get messages for a conversation (admin only)
   */
  async getAdminConversationMessages(
    conversationId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<{
    messages: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get(
      `/api/admin/conversations/${conversationId}/messages`,
      { params },
    );
    return response.data;
  }

  /**
   * Export a conversation (admin only)
   */
  async exportAdminConversation(
    conversationId: string,
    format: "json" | "markdown",
  ): Promise<{ export: { content: string; format: string } }> {
    const response = await this.client.post(
      `/api/admin/conversations/${conversationId}/export`,
      { format },
    );
    return response.data;
  }

  // =========================================================================
  // Admin Clinical Contexts (HIPAA)
  // =========================================================================

  /**
   * List all clinical contexts across all users (admin only)
   * PHI is masked by default - set includePhi=true to access full data (logged for audit)
   */
  async getAdminClinicalContexts(
    params: {
      limit?: number;
      offset?: number;
      user_id?: string;
      include_phi?: boolean;
    } = {},
  ): Promise<{
    contexts: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get("/api/admin/clinical/contexts", {
      params,
    });
    return response.data;
  }

  /**
   * Get a specific clinical context (admin only)
   * PHI is masked by default - set includePhi=true to access full data (logged for audit)
   */
  async getAdminClinicalContext(
    contextId: string,
    includePhi: boolean = false,
  ): Promise<{ context: any }> {
    const response = await this.client.get(
      `/api/admin/clinical/contexts/${contextId}`,
      { params: { include_phi: includePhi } },
    );
    return response.data;
  }

  /**
   * Get clinical context statistics (admin only)
   */
  async getAdminClinicalStats(): Promise<any> {
    const response = await this.client.get("/api/admin/clinical/stats");
    return response.data;
  }

  /**
   * Get PHI access audit log (admin only)
   */
  async getAdminPHIAuditLog(
    params: {
      limit?: number;
      offset?: number;
      admin_user_id?: string;
      context_id?: string;
    } = {},
  ): Promise<{
    logs: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get("/api/admin/clinical/audit", {
      params,
    });
    return response.data;
  }

  // =========================================================================
  // Admin Voice & TT Pipeline
  // =========================================================================

  /**
   * List all active voice sessions (admin only)
   */
  async getAdminVoiceSessions(): Promise<{
    sessions: any[];
    total: number;
  }> {
    const response = await this.client.get("/api/admin/voice/sessions");
    return response.data;
  }

  /**
   * Get voice metrics (admin only)
   */
  async getAdminVoiceMetrics(): Promise<any> {
    const response = await this.client.get("/api/admin/voice/metrics");
    return response.data;
  }

  /**
   * Get voice health status (admin only)
   */
  async getAdminVoiceHealth(): Promise<any> {
    const response = await this.client.get("/api/admin/voice/health");
    return response.data;
  }

  /**
   * Get voice configuration (admin only)
   */
  async getAdminVoiceConfig(): Promise<any> {
    const response = await this.client.get("/api/admin/voice/config");
    return response.data;
  }

  /**
   * Disconnect a voice session (admin only)
   */
  async disconnectAdminVoiceSession(sessionId: string): Promise<void> {
    await this.client.post(`/api/admin/voice/sessions/${sessionId}/disconnect`);
  }

  /**
   * List TT pipeline sessions (admin only)
   */
  async getAdminTTSessions(): Promise<{
    sessions: any[];
    total: number;
  }> {
    const response = await this.client.get("/api/admin/voice/tt-sessions");
    return response.data;
  }

  /**
   * List TT conversation contexts (admin only)
   */
  async getAdminTTContexts(): Promise<{
    contexts: any[];
    total: number;
  }> {
    const response = await this.client.get("/api/admin/voice/contexts");
    return response.data;
  }

  /**
   * Cleanup expired TT contexts (admin only)
   */
  async cleanupAdminTTContexts(): Promise<{ cleaned_count: number }> {
    const response = await this.client.post(
      "/api/admin/voice/contexts/cleanup",
    );
    return response.data;
  }

  /**
   * Get TT quality presets (admin only)
   */
  async getAdminQualityPresets(): Promise<{ presets: any[] }> {
    const response = await this.client.get("/api/admin/voice/quality-presets");
    return response.data;
  }

  /**
   * Get TT tool analytics (admin only)
   */
  async getAdminTTAnalytics(): Promise<any> {
    const response = await this.client.get("/api/admin/voice/analytics/tools");
    return response.data;
  }

  // =========================================================================
  // Admin Attachments
  // =========================================================================

  /**
   * List all attachments across all users (admin only)
   */
  async getAdminAttachments(
    params: {
      limit?: number;
      offset?: number;
      user_id?: string;
      file_type?: string;
    } = {},
  ): Promise<{
    attachments: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get("/api/admin/attachments", {
      params,
    });
    return response.data;
  }

  /**
   * Get attachment storage statistics (admin only)
   */
  async getAdminAttachmentStats(days: number = 30): Promise<any> {
    const response = await this.client.get("/api/admin/attachments/stats", {
      params: { days },
    });
    return response.data;
  }

  /**
   * Delete an attachment (admin only)
   */
  async deleteAdminAttachment(attachmentId: string): Promise<void> {
    await this.client.delete(`/api/admin/attachments/${attachmentId}`);
  }

  /**
   * Bulk delete attachments (admin only)
   */
  async bulkDeleteAdminAttachments(
    attachmentIds: string[],
  ): Promise<{ deleted_count: number }> {
    const response = await this.client.post(
      "/api/admin/attachments/bulk-delete",
      { attachment_ids: attachmentIds },
    );
    return response.data;
  }

  /**
   * Cleanup orphaned attachments (admin only)
   */
  async cleanupOrphanedAttachments(): Promise<{ cleaned_count: number }> {
    const response = await this.client.post(
      "/api/admin/attachments/cleanup-orphaned",
    );
    return response.data;
  }

  // =========================================================================
  // Admin Folders
  // =========================================================================

  /**
   * List all folders across all users (admin only)
   */
  async getAdminFolders(
    params: {
      limit?: number;
      offset?: number;
      user_id?: string;
    } = {},
  ): Promise<{
    folders: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await this.client.get("/api/admin/folders", { params });
    return response.data;
  }

  /**
   * Get folder statistics (admin only)
   */
  async getAdminFolderStats(): Promise<any> {
    const response = await this.client.get("/api/admin/folders/stats");
    return response.data;
  }

  /**
   * Delete a folder (admin only)
   */
  async deleteAdminFolder(
    folderId: string,
    recursive: boolean = false,
  ): Promise<{ deleted_folders: number; orphaned_conversations: number }> {
    const response = await this.client.delete(
      `/api/admin/folders/${folderId}`,
      { params: { recursive } },
    );
    return response.data;
  }
}

// Default export
export default VoiceAssistApiClient;
