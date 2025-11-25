/**
 * VoiceAssist API Client
 * HTTP client for communicating with VoiceAssist backend services
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
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
} from "@voiceassist/types";
import { withRetry, type RetryConfig } from "./retry";

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  onUnauthorized?: () => void;
  getAccessToken?: () => string | null;
  enableRetry?: boolean;
  retryConfig?: Partial<RetryConfig>;
  onRetry?: (attempt: number, error: any) => void;
}

export class VoiceAssistApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      enableRetry: true, // Enable retry by default
      ...config,
    };
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use((requestConfig) => {
      const token = this.config.getAccessToken?.();
      if (token && requestConfig.headers) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
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

  // =========================================================================
  // Authentication
  // =========================================================================

  async login(credentials: LoginRequest): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>(
      "/auth/login",
      credentials,
    );
    // Convert backend response to frontend format
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
    const response = await this.client.post<User>("/auth/register", data);
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post("/auth/logout");
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    // Convert backend response to frontend format
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>("/users/me");
    return response.data;
  }

  async updateProfile(updates: {
    name?: string;
    email?: string;
  }): Promise<User> {
    const response = await this.client.put<ApiResponse<User>>(
      "/users/me",
      updates,
    );
    return response.data.data!;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.client.put("/users/me/password", {
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
      "/voice/transcribe",
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
      "/voice/synthesize",
      { text, voiceId },
      {
        responseType: "blob",
      },
    );

    return response.data;
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
    const response = await this.client.post("/voice/realtime-session", request);
    return response.data;
  }

  async getOAuthUrl(provider: "google" | "microsoft"): Promise<string> {
    const response = await this.client.get<ApiResponse<{ url: string }>>(
      `/auth/oauth/${provider}/authorize`,
    );
    return response.data.data!.url;
  }

  async handleOAuthCallback(
    provider: "google" | "microsoft",
    code: string,
  ): Promise<AuthTokens> {
    const response = await this.client.post<TokenResponse>(
      `/auth/oauth/${provider}/callback`,
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
      ApiResponse<PaginatedResponse<Conversation>>
    >("/conversations", { params: { page, pageSize } });
    return response.data.data!;
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await this.client.get<ApiResponse<Conversation>>(
      `/conversations/${id}`,
    );
    return response.data.data!;
  }

  async createConversation(title: string): Promise<Conversation> {
    const response = await this.client.post<ApiResponse<Conversation>>(
      "/conversations",
      { title },
    );
    return response.data.data!;
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationRequest,
  ): Promise<Conversation> {
    const response = await this.client.patch<ApiResponse<Conversation>>(
      `/conversations/${id}`,
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
    await this.client.delete(`/conversations/${id}`);
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
      ApiResponse<PaginatedResponse<Message>>
    >(`/conversations/${conversationId}/messages`, {
      params: { page, pageSize },
    });
    return response.data.data!;
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const response = await this.client.post<ApiResponse<Message>>(
      `/conversations/${conversationId}/messages`,
      { content },
    );
    return response.data.data!;
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const response = await this.client.patch<ApiResponse<Message>>(
      `/conversations/${conversationId}/messages/${messageId}`,
      { content },
    );
    return response.data.data!;
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.client.delete(
      `/conversations/${conversationId}/messages/${messageId}`,
    );
  }

  // =========================================================================
  // Conversation Branching (Phase 2, Week 10)
  // =========================================================================

  async createBranch(
    sessionId: string,
    request: CreateBranchRequest,
  ): Promise<Branch> {
    const response = await this.client.post<ApiResponse<Branch>>(
      `/conversations/${sessionId}/branches`,
      request,
    );
    return response.data.data!;
  }

  async listBranches(sessionId: string): Promise<Branch[]> {
    const response = await this.client.get<ApiResponse<Branch[]>>(
      `/conversations/${sessionId}/branches`,
    );
    return response.data.data!;
  }

  async getBranchMessages(
    sessionId: string,
    branchId: string,
  ): Promise<Message[]> {
    const response = await this.client.get<ApiResponse<Message[]>>(
      `/conversations/${sessionId}/branches/${branchId}/messages`,
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
  // Folders
  // =========================================================================

  async getFolders(parentId?: string | null): Promise<Folder[]> {
    const params = parentId ? { parent_id: parentId } : undefined;
    const response = await this.client.get<Folder[]>("/folders", { params });
    return response.data;
  }

  async getFolderTree(): Promise<Folder[]> {
    const response = await this.client.get<Folder[]>("/folders/tree");
    return response.data;
  }

  async getFolder(id: string): Promise<Folder> {
    const response = await this.client.get<Folder>(`/folders/${id}`);
    return response.data;
  }

  async createFolder(request: CreateFolderRequest): Promise<Folder> {
    const response = await this.client.post<Folder>("/folders", request);
    return response.data;
  }

  async updateFolder(
    id: string,
    request: UpdateFolderRequest,
  ): Promise<Folder> {
    const response = await this.client.put<Folder>(`/folders/${id}`, request);
    return response.data;
  }

  async deleteFolder(id: string): Promise<void> {
    await this.client.delete(`/folders/${id}`);
  }

  async moveFolder(folderId: string, targetFolderId: string): Promise<Folder> {
    const response = await this.client.post<Folder>(
      `/folders/${folderId}/move/${targetFolderId}`,
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
      `/sessions/${sessionId}/share`,
      request,
    );
    return response.data;
  }

  async getSharedConversation(
    shareToken: string,
    password?: string,
  ): Promise<any> {
    const params = password ? { password } : undefined;
    const response = await this.client.get(`/shared/${shareToken}`, {
      params,
    });
    return response.data;
  }

  async listShareLinks(sessionId: string): Promise<ShareLink[]> {
    const response = await this.client.get<ShareLink[]>(
      `/sessions/${sessionId}/shares`,
    );
    return response.data;
  }

  async revokeShareLink(sessionId: string, shareToken: string): Promise<void> {
    await this.client.delete(`/sessions/${sessionId}/share/${shareToken}`);
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
      `/messages/${messageId}/attachments`,
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
      `/messages/${messageId}/attachments`,
    );
    return response.data;
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.client.delete(`/attachments/${attachmentId}`);
  }

  async downloadAttachment(attachmentId: string): Promise<Blob> {
    const response = await this.client.get(
      `/attachments/${attachmentId}/download`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  }

  getAttachmentUrl(attachmentId: string): string {
    return `${this.config.baseURL}/attachments/${attachmentId}/download`;
  }

  // =========================================================================
  // Clinical Context
  // =========================================================================

  async createClinicalContext(
    context: ClinicalContextCreate,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.post<ClinicalContext>(
        "/clinical-contexts",
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
        "/clinical-contexts/current",
        { params },
      );
      return response.data;
    });
  }

  async getClinicalContext(contextId: string): Promise<ClinicalContext> {
    const response = await this.client.get<ClinicalContext>(
      `/clinical-contexts/${contextId}`,
    );
    return response.data;
  }

  async updateClinicalContext(
    contextId: string,
    update: ClinicalContextUpdate,
  ): Promise<ClinicalContext> {
    return this.withRetryIfEnabled(async () => {
      const response = await this.client.put<ClinicalContext>(
        `/clinical-contexts/${contextId}`,
        update,
      );
      return response.data;
    });
  }

  async deleteClinicalContext(contextId: string): Promise<void> {
    await this.client.delete(`/clinical-contexts/${contextId}`);
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
      `/export/sessions/${conversationId}/export/markdown`,
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
      `/export/sessions/${conversationId}/export/pdf`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  }

  // =========================================================================
  // Generic Request Method
  // =========================================================================

  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.request<T>(config);
  }
}

// Default export
export default VoiceAssistApiClient;
