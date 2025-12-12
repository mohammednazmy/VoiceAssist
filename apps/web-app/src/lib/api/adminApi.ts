/**
 * Admin API Client
 * Handles admin panel API calls for system health, metrics, and analytics
 */

export interface ComponentHealth {
  status: "up" | "down" | "disabled";
  latency_ms: number;
}

export interface PostgresHealth extends ComponentHealth {
  connections?: {
    active: number;
    pool_size: number;
    pool_max: number;
    max_overflow: number;
  };
}

export interface RedisHealth extends ComponentHealth {
  memory_used_mb?: number;
}

export interface QdrantHealth extends ComponentHealth {
  enabled: boolean;
}

export interface DetailedHealthResponse {
  status: "healthy" | "degraded";
  components: {
    postgres: PostgresHealth;
    redis: RedisHealth;
    qdrant: QdrantHealth;
  };
  version: string;
  environment: string;
  timestamp: number;
}

export interface AdminSummaryResponse {
  total_users: number;
  active_users: number;
  admin_users: number;
  timestamp: string;
}

// Phase 8.3: WebSocket Status
export interface WebSocketStatusResponse {
  active_connections: number;
  connections_by_type: {
    chat: number;
    voice: number;
    other: number;
  };
  recent_connections: Array<{
    session_id: string;
    user_id: string;
    type: string;
    connected_at: string;
  }>;
  pool_stats: {
    database: {
      size: number;
      checked_out: number;
      checked_in: number;
    };
    redis: {
      max_connections: number;
      in_use_connections: number;
    };
  };
  timestamp: string;
}

// Phase 8.3: User Management
export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  offset: number;
  limit: number;
}

export interface UserUpdateRequest {
  email?: string;
  full_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
}

// Phase 8.3: System Metrics
export interface SystemMetricsResponse {
  daily_registrations: Array<{ date: string; count: number }>;
  daily_active_users: Array<{ date: string; count: number }>;
  user_distribution: {
    total: number;
    active: number;
    inactive: number;
    admins: number;
    regular: number;
  };
  period_days: number;
  timestamp: string;
}

// Phase 8.3: Audit Logs
export interface AuditLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  action: string;
  user_id: string | null;
  details: string | null;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  offset: number;
  limit: number;
}

// Phase 8.3: Feature Flags
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

export interface CreateFeatureFlagRequest {
  name: string;
  enabled?: boolean;
  description: string;
  rollout_percentage?: number;
  user_groups?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureFlagRequest {
  enabled?: boolean;
  description?: string;
  rollout_percentage?: number;
  user_groups?: string[];
  metadata?: Record<string, unknown>;
}

// Phase 8.3: Cache Management
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

export interface AdminApiClient {
  getDetailedHealth(): Promise<DetailedHealthResponse>;
  getAdminSummary(): Promise<AdminSummaryResponse>;
  getOpenAIHealth(): Promise<OpenAIHealthResponse>;
  // Phase 8.3 endpoints
  getWebSocketStatus(): Promise<WebSocketStatusResponse>;
  getUsers(params?: {
    offset?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    is_admin?: boolean;
  }): Promise<UserListResponse>;
  getUser(userId: string): Promise<AdminUser>;
  updateUser(userId: string, data: UserUpdateRequest): Promise<AdminUser>;
  deleteUser(userId: string): Promise<{ message: string; user_id: string }>;
  getSystemMetrics(days?: number): Promise<SystemMetricsResponse>;
  getAuditLogs(params?: {
    offset?: number;
    limit?: number;
    level?: string;
    action?: string;
  }): Promise<AuditLogsResponse>;
  // Phase 8.3: Feature Flags
  getFeatureFlags(): Promise<FeatureFlag[]>;
  getFeatureFlag(flagName: string): Promise<FeatureFlag>;
  createFeatureFlag(flag: CreateFeatureFlagRequest): Promise<FeatureFlag>;
  updateFeatureFlag(
    flagName: string,
    updates: UpdateFeatureFlagRequest,
  ): Promise<FeatureFlag>;
  deleteFeatureFlag(flagName: string): Promise<{ message: string }>;
  toggleFeatureFlag(flagName: string): Promise<FeatureFlag>;
  // Phase 8.3: Cache Management
  getCacheStats(): Promise<CacheStats>;
  clearCache(): Promise<{ status: string; message: string }>;
  invalidateCachePattern(
    pattern: string,
  ): Promise<{ status: string; keys_invalidated: number }>;
  // Voice / PHI-conscious analytics
  getVoicePhiAnalytics(): Promise<VoicePhiAnalyticsResponse>;
}

export interface OpenAIHealthResponse {
  status: "ok" | "error";
  configured: boolean;
  accessible: boolean;
  latency_ms?: number;
  models_accessible?: number;
  error?: string;
  timestamp: number;
}

export interface VoicePhiAnalyticsResponse {
  active_sessions_total: number;
  active_sessions_clinical: number;
  active_sessions_demo: number;
  phi_conscious_sessions: number;
  phi_conscious_rate: number;
  timestamp: string;
}

/**
 * Create admin API client with the given base URL and auth token getter
 */
export function createAdminApi(
  baseUrl: string,
  getAuthToken: () => string | null,
): AdminApiClient {
  async function fetchWithAuth<T>(path: string): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Handle envelope response format
    if (data.success !== undefined) {
      if (!data.success) {
        throw new Error(data.error?.message || "API request failed");
      }
      return data.data as T;
    }

    return data as T;
  }

  async function fetchWithAuthPost<T>(
    path: string,
    body: unknown,
    method: "POST" | "PUT" | "DELETE" = "POST",
  ): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Handle envelope response format
    if (data.success !== undefined) {
      if (!data.success) {
        throw new Error(data.error?.message || "API request failed");
      }
      return data.data as T;
    }

    return data as T;
  }

  return {
    async getDetailedHealth(): Promise<DetailedHealthResponse> {
      return fetchWithAuth<DetailedHealthResponse>("/health/detailed");
    },

    async getAdminSummary(): Promise<AdminSummaryResponse> {
      return fetchWithAuth<AdminSummaryResponse>("/api/admin/panel/summary");
    },

    async getOpenAIHealth(): Promise<OpenAIHealthResponse> {
      return fetchWithAuth<OpenAIHealthResponse>("/health/openai");
    },

    // Phase 8.3: WebSocket Status
    async getWebSocketStatus(): Promise<WebSocketStatusResponse> {
      return fetchWithAuth<WebSocketStatusResponse>(
        "/api/admin/panel/websocket-status",
      );
    },

    // Phase 8.3: User Management
    async getUsers(params?: {
      offset?: number;
      limit?: number;
      search?: string;
      is_active?: boolean;
      is_admin?: boolean;
    }): Promise<UserListResponse> {
      const searchParams = new URLSearchParams();
      if (params?.offset !== undefined)
        searchParams.set("offset", String(params.offset));
      if (params?.limit !== undefined)
        searchParams.set("limit", String(params.limit));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.is_active !== undefined)
        searchParams.set("is_active", String(params.is_active));
      if (params?.is_admin !== undefined)
        searchParams.set("is_admin", String(params.is_admin));

      const query = searchParams.toString();
      return fetchWithAuth<UserListResponse>(
        `/api/admin/panel/users${query ? `?${query}` : ""}`,
      );
    },

    async getUser(userId: string): Promise<AdminUser> {
      return fetchWithAuth<AdminUser>(`/api/admin/panel/users/${userId}`);
    },

    async updateUser(
      userId: string,
      data: UserUpdateRequest,
    ): Promise<AdminUser> {
      return fetchWithAuthPost<AdminUser>(
        `/api/admin/panel/users/${userId}`,
        data,
        "PUT",
      );
    },

    async deleteUser(
      userId: string,
    ): Promise<{ message: string; user_id: string }> {
      return fetchWithAuthPost<{ message: string; user_id: string }>(
        `/api/admin/panel/users/${userId}`,
        null,
        "DELETE",
      );
    },

    // Phase 8.3: System Metrics
    async getSystemMetrics(days?: number): Promise<SystemMetricsResponse> {
      const query = days ? `?days=${days}` : "";
      return fetchWithAuth<SystemMetricsResponse>(
        `/api/admin/panel/metrics${query}`,
      );
    },

    // Phase 8.3: Audit Logs
    async getAuditLogs(params?: {
      offset?: number;
      limit?: number;
      level?: string;
      action?: string;
    }): Promise<AuditLogsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.offset !== undefined)
        searchParams.set("offset", String(params.offset));
      if (params?.limit !== undefined)
        searchParams.set("limit", String(params.limit));
      if (params?.level) searchParams.set("level", params.level);
      if (params?.action) searchParams.set("action", params.action);

      const query = searchParams.toString();
      return fetchWithAuth<AuditLogsResponse>(
        `/api/admin/panel/audit-logs${query ? `?${query}` : ""}`,
      );
    },

    // Phase 8.3: Feature Flags
    async getFeatureFlags(): Promise<FeatureFlag[]> {
      return fetchWithAuth<FeatureFlag[]>("/api/admin/feature-flags");
    },

    async getFeatureFlag(flagName: string): Promise<FeatureFlag> {
      return fetchWithAuth<FeatureFlag>(`/api/admin/feature-flags/${flagName}`);
    },

    async createFeatureFlag(
      flag: CreateFeatureFlagRequest,
    ): Promise<FeatureFlag> {
      return fetchWithAuthPost<FeatureFlag>("/api/admin/feature-flags", flag);
    },

    async updateFeatureFlag(
      flagName: string,
      updates: UpdateFeatureFlagRequest,
    ): Promise<FeatureFlag> {
      return fetchWithAuthPost<FeatureFlag>(
        `/api/admin/feature-flags/${flagName}`,
        updates,
        "PUT",
      );
    },

    async deleteFeatureFlag(flagName: string): Promise<{ message: string }> {
      return fetchWithAuthPost<{ message: string }>(
        `/api/admin/feature-flags/${flagName}`,
        null,
        "DELETE",
      );
    },

    async toggleFeatureFlag(flagName: string): Promise<FeatureFlag> {
      return fetchWithAuthPost<FeatureFlag>(
        `/api/admin/feature-flags/${flagName}/toggle`,
        null,
      );
    },

    // Phase 8.3: Cache Management
    async getCacheStats(): Promise<CacheStats> {
      return fetchWithAuth<CacheStats>("/api/admin/cache/stats");
    },

    async clearCache(): Promise<{ status: string; message: string }> {
      return fetchWithAuthPost<{ status: string; message: string }>(
        "/api/admin/cache/clear",
        null,
      );
    },

    async invalidateCachePattern(
      pattern: string,
    ): Promise<{ status: string; keys_invalidated: number }> {
      return fetchWithAuthPost<{ status: string; keys_invalidated: number }>(
        `/api/admin/cache/invalidate?pattern=${encodeURIComponent(pattern)}`,
        null,
      );
    },

    async getVoicePhiAnalytics(): Promise<VoicePhiAnalyticsResponse> {
      return fetchWithAuth<VoicePhiAnalyticsResponse>(
        "/api/admin/voice/analytics/phi",
      );
    },
  };
}

/**
 * Helper to get auth token from localStorage
 */
export function getAuthTokenFromStorage(): string | null {
  try {
    const authData = localStorage.getItem("voiceassist-auth");
    if (!authData) return null;

    const parsed = JSON.parse(authData);
    return parsed.state?.tokens?.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * Default admin API client using environment variable for base URL
 */
export function getDefaultAdminApi(): AdminApiClient {
  // Use the same pattern as lib/api.ts
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  return createAdminApi(baseUrl, getAuthTokenFromStorage);
}
