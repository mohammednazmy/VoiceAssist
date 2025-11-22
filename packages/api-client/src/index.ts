/**
 * VoiceAssist API Client
 * HTTP client for communicating with VoiceAssist backend services
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  User,
  Conversation,
  Message,
  Document,
  SearchResult,
  SystemMetrics,
  AuditLogEntry,
  PaginatedResponse,
} from '@voiceassist/types';

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
        'Content-Type': 'application/json',
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
      }
    );
  }

  // =========================================================================
  // Authentication
  // =========================================================================

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<ApiResponse<LoginResponse>>(
      '/auth/login',
      credentials
    );
    return response.data.data!;
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const response = await this.client.post<ApiResponse<LoginResponse>>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data.data!;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/auth/me');
    return response.data.data!;
  }

  async getOAuthUrl(provider: 'google' | 'microsoft'): Promise<string> {
    const response = await this.client.get<ApiResponse<{ url: string }>>(
      `/auth/oauth/${provider}/authorize`
    );
    return response.data.data!.url;
  }

  async handleOAuthCallback(
    provider: 'google' | 'microsoft',
    code: string
  ): Promise<LoginResponse> {
    const response = await this.client.post<ApiResponse<LoginResponse>>(
      `/auth/oauth/${provider}/callback`,
      { code }
    );
    return response.data.data!;
  }

  // =========================================================================
  // Conversations
  // =========================================================================

  async getConversations(
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<Conversation>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Conversation>>>(
      '/conversations',
      { params: { page, pageSize } }
    );
    return response.data.data!;
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await this.client.get<ApiResponse<Conversation>>(
      `/conversations/${id}`
    );
    return response.data.data!;
  }

  async createConversation(title: string): Promise<Conversation> {
    const response = await this.client.post<ApiResponse<Conversation>>(
      '/conversations',
      { title }
    );
    return response.data.data!;
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
    pageSize = 50
  ): Promise<PaginatedResponse<Message>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Message>>>(
      `/conversations/${conversationId}/messages`,
      { params: { page, pageSize } }
    );
    return response.data.data!;
  }

  async sendMessage(
    conversationId: string,
    content: string
  ): Promise<Message> {
    const response = await this.client.post<ApiResponse<Message>>(
      `/conversations/${conversationId}/messages`,
      { content }
    );
    return response.data.data!;
  }

  // =========================================================================
  // Knowledge Base
  // =========================================================================

  async searchKnowledgeBase(query: string, limit = 10): Promise<SearchResult[]> {
    const response = await this.client.post<ApiResponse<SearchResult[]>>(
      '/kb/search',
      { query, limit }
    );
    return response.data.data!;
  }

  async getDocuments(
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<Document>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Document>>>(
      '/kb/documents',
      { params: { page, pageSize } }
    );
    return response.data.data!;
  }

  async getDocument(id: string): Promise<Document> {
    const response = await this.client.get<ApiResponse<Document>>(
      `/kb/documents/${id}`
    );
    return response.data.data!;
  }

  async uploadDocument(file: File, category: string): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);

    const response = await this.client.post<ApiResponse<Document>>(
      '/kb/documents',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
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
    formData.append('audio', audioBlob);

    const response = await this.client.post<ApiResponse<{ text: string }>>(
      '/voice/transcribe',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data!.text;
  }

  async synthesizeSpeech(text: string, voiceId?: string): Promise<Blob> {
    const response = await this.client.post(
      '/voice/synthesize',
      { text, voiceId },
      { responseType: 'blob' }
    );
    return response.data;
  }

  // =========================================================================
  // Admin
  // =========================================================================

  async getSystemMetrics(): Promise<SystemMetrics> {
    const response = await this.client.get<ApiResponse<SystemMetrics>>(
      '/admin/metrics'
    );
    return response.data.data!;
  }

  async getAuditLogs(
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<AuditLogEntry>>>(
      '/admin/audit-logs',
      { params: { page, pageSize } }
    );
    return response.data.data!;
  }

  async getUsers(
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<User>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<User>>>(
      '/admin/users',
      { params: { page, pageSize } }
    );
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
