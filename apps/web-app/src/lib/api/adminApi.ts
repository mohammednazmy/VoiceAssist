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

export interface AdminApiClient {
  getDetailedHealth(): Promise<DetailedHealthResponse>;
  getAdminSummary(): Promise<AdminSummaryResponse>;
  getOpenAIHealth(): Promise<OpenAIHealthResponse>;
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
    return parsed.state?.tokens?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Default admin API client using environment variable for base URL
 */
export function getDefaultAdminApi(): AdminApiClient {
  // Use the same pattern as lib/api.ts
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

  return createAdminApi(baseUrl, getAuthTokenFromStorage);
}
