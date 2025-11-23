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
} from "@voiceassist/types";

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  onUnauthorized?: () => void;
  getAccessToken?: () => string | null;
}

export class VoiceAssistApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
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
  // Voice
  // =========================================================================

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("audio", audioBlob);

    const response = await this.client.post<ApiResponse<{ text: string }>>(
      "/voice/transcribe",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data.data!.text;
  }

  async synthesizeSpeech(text: string, voiceId?: string): Promise<Blob> {
    const response = await this.client.post(
      "/voice/synthesize",
      { text, voiceId },
      { responseType: "blob" },
    );
    return response.data;
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
  // Generic Request Method
  // =========================================================================

  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.request<T>(config);
  }
}

// Default export
export default VoiceAssistApiClient;
