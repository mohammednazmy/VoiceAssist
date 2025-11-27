/**
 * Conversations API Client
 * Handles all conversation and message CRUD operations
 */

import type { Citation } from "../../types";

// ============================================================================
// Types
// ============================================================================

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  archived: boolean;
  messageCount: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsListResponse {
  items: Conversation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parent_message_id: string | null;
  branch_id: string | null;
  client_message_id: string | null;
  created_at: string;
  tokens: number | null;
  model: string | null;
  is_duplicate: boolean;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
}

export interface MessagesListResponse {
  items: Message[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateConversationRequest {
  title: string;
  folder_id?: string;
}

export interface UpdateConversationRequest {
  title?: string;
  archived?: boolean;
  folder_id?: string | null;
}

export interface CreateMessageRequest {
  content: string;
  role?: "user" | "assistant";
  client_message_id?: string;
  parent_message_id?: string;
  branch_id?: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
}

export interface UpdateMessageRequest {
  content: string;
}

export interface Branch {
  branch_id: string;
  session_id: string;
  parent_message_id: string;
  created_at: string;
  message_count: number;
}

export interface BranchInfo {
  branch_id: string;
  parent_message_id: string | null;
  message_count: number;
  created_at: string;
  last_activity: string;
}

export interface CreateBranchRequest {
  parent_message_id: string;
  initial_message?: string;
}

export interface ConversationSettings {
  llm_mode?: "fast" | "balanced" | "quality";
  temperature?: number;
  voice_style?: string;
  voice_speed?: number;
  custom_instructions?: string;
}

// API Response envelope
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  trace_id: string;
  timestamp: string;
}

// ============================================================================
// API Client Interface
// ============================================================================

export interface ConversationsApiClient {
  // Conversations
  listConversations(
    page?: number,
    pageSize?: number,
  ): Promise<ConversationsListResponse>;
  createConversation(request: CreateConversationRequest): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation>;
  updateConversation(
    conversationId: string,
    request: UpdateConversationRequest,
  ): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;

  // Messages
  getMessages(
    conversationId: string,
    page?: number,
    pageSize?: number,
  ): Promise<MessagesListResponse>;
  createMessage(
    conversationId: string,
    request: CreateMessageRequest,
  ): Promise<Message>;
  updateMessage(
    conversationId: string,
    messageId: string,
    request: UpdateMessageRequest,
  ): Promise<Message>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;

  // Branches
  listBranches(conversationId: string): Promise<BranchInfo[]>;
  createBranch(
    conversationId: string,
    request: CreateBranchRequest,
  ): Promise<Branch>;
  getBranchMessages(
    conversationId: string,
    branchId: string,
    page?: number,
    pageSize?: number,
  ): Promise<MessagesListResponse>;

  // Settings
  getSettings(conversationId: string): Promise<ConversationSettings>;
  updateSettings(
    conversationId: string,
    settings: ConversationSettings,
  ): Promise<ConversationSettings>;
}

// ============================================================================
// API Client Factory
// ============================================================================

/**
 * Create a conversations API client
 */
export function createConversationsApi(
  baseUrl: string,
  getAuthToken: () => string | null,
): ConversationsApiClient {
  const apiUrl = `${baseUrl}/api/conversations`;

  async function fetchWithAuth<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (errorJson.detail) {
          errorMessage =
            typeof errorJson.detail === "string"
              ? errorJson.detail
              : errorJson.detail.message || errorMessage;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const json = (await response.json()) as ApiResponse<T>;

    if (!json.success || json.error) {
      throw new Error(json.error?.message || "API request failed");
    }

    return json.data as T;
  }

  return {
    // ========================================================================
    // Conversations
    // ========================================================================

    async listConversations(
      page = 1,
      pageSize = 20,
    ): Promise<ConversationsListResponse> {
      return fetchWithAuth<ConversationsListResponse>(
        `${apiUrl}?page=${page}&pageSize=${pageSize}`,
      );
    },

    async createConversation(
      request: CreateConversationRequest,
    ): Promise<Conversation> {
      return fetchWithAuth<Conversation>(apiUrl, {
        method: "POST",
        body: JSON.stringify(request),
      });
    },

    async getConversation(conversationId: string): Promise<Conversation> {
      return fetchWithAuth<Conversation>(`${apiUrl}/${conversationId}`);
    },

    async updateConversation(
      conversationId: string,
      request: UpdateConversationRequest,
    ): Promise<Conversation> {
      return fetchWithAuth<Conversation>(`${apiUrl}/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      });
    },

    async deleteConversation(conversationId: string): Promise<void> {
      await fetchWithAuth<{ message: string }>(`${apiUrl}/${conversationId}`, {
        method: "DELETE",
      });
    },

    // ========================================================================
    // Messages
    // ========================================================================

    async getMessages(
      conversationId: string,
      page = 1,
      pageSize = 50,
    ): Promise<MessagesListResponse> {
      return fetchWithAuth<MessagesListResponse>(
        `${apiUrl}/${conversationId}/messages?page=${page}&pageSize=${pageSize}`,
      );
    },

    async createMessage(
      conversationId: string,
      request: CreateMessageRequest,
    ): Promise<Message> {
      return fetchWithAuth<Message>(`${apiUrl}/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(request),
      });
    },

    async updateMessage(
      conversationId: string,
      messageId: string,
      request: UpdateMessageRequest,
    ): Promise<Message> {
      return fetchWithAuth<Message>(
        `${apiUrl}/${conversationId}/messages/${messageId}`,
        {
          method: "PATCH",
          body: JSON.stringify(request),
        },
      );
    },

    async deleteMessage(
      conversationId: string,
      messageId: string,
    ): Promise<void> {
      await fetchWithAuth<{ message: string }>(
        `${apiUrl}/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        },
      );
    },

    // ========================================================================
    // Branches
    // ========================================================================

    async listBranches(conversationId: string): Promise<BranchInfo[]> {
      return fetchWithAuth<BranchInfo[]>(
        `${apiUrl}/${conversationId}/branches`,
      );
    },

    async createBranch(
      conversationId: string,
      request: CreateBranchRequest,
    ): Promise<Branch> {
      return fetchWithAuth<Branch>(`${apiUrl}/${conversationId}/branches`, {
        method: "POST",
        body: JSON.stringify(request),
      });
    },

    async getBranchMessages(
      conversationId: string,
      branchId: string,
      page = 1,
      pageSize = 50,
    ): Promise<MessagesListResponse> {
      return fetchWithAuth<MessagesListResponse>(
        `${apiUrl}/${conversationId}/branches/${branchId}/messages?page=${page}&pageSize=${pageSize}`,
      );
    },

    // ========================================================================
    // Settings
    // ========================================================================

    async getSettings(conversationId: string): Promise<ConversationSettings> {
      return fetchWithAuth<ConversationSettings>(
        `${apiUrl}/${conversationId}/settings`,
      );
    },

    async updateSettings(
      conversationId: string,
      settings: ConversationSettings,
    ): Promise<ConversationSettings> {
      return fetchWithAuth<ConversationSettings>(
        `${apiUrl}/${conversationId}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(settings),
        },
      );
    },
  };
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultInstance: ConversationsApiClient | null = null;

/**
 * Get the default conversations API client instance
 * Uses VITE_API_URL and auth token from localStorage
 */
export function getDefaultConversationsApi(): ConversationsApiClient {
  if (!defaultInstance) {
    const baseUrl = import.meta.env.VITE_API_URL || "";
    defaultInstance = createConversationsApi(baseUrl, () => {
      // Get token from auth store or localStorage
      const authData = localStorage.getItem("auth-storage");
      if (authData) {
        try {
          const parsed = JSON.parse(authData);
          return parsed.state?.token || null;
        } catch {
          return null;
        }
      }
      return null;
    });
  }
  return defaultInstance;
}

/**
 * Reset the default instance (useful for testing)
 */
export function resetDefaultConversationsApi(): void {
  defaultInstance = null;
}
