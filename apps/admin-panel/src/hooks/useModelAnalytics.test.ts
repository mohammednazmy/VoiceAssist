/**
 * Tests for useModelAnalytics hook - Sprint 4 Analytics
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useModelAnalytics } from "./useModelAnalytics";

// Mock fetchAPI
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockModels = {
  data: {
    models: [
      {
        id: "gpt-4",
        name: "GPT-4",
        provider: "openai",
        type: "chat",
        enabled: true,
        is_primary: true,
        supports_phi: false,
        context_window: 8192,
        cost_per_1k_input: 0.03,
        cost_per_1k_output: 0.06,
      },
    ],
  },
};

const mockMetrics = {
  data: {
    total_requests_24h: 1500,
    total_tokens_input_24h: 500000,
    total_tokens_output_24h: 250000,
    estimated_cost_24h: 25.5,
    avg_latency_ms: 450,
    p95_latency_ms: 850,
    error_rate: 0.02,
    cloud_requests: 1400,
    local_requests: 100,
    cloud_percentage: 93.3,
    model_breakdown: [],
    period_days: 1,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockSearchStats = {
  data: {
    total_searches_24h: 500,
    avg_latency_ms: 120,
    p95_latency_ms: 280,
    cache_hit_rate: 0.75,
    top_queries: [{ query: "test", count: 50 }],
    search_types: { semantic: 300, keyword: 100, hybrid: 100 },
    no_results_rate: 0.05,
    period_days: 1,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockEmbeddingStats = {
  data: {
    total_documents: 1000,
    total_chunks: 5000,
    total_embeddings: 5000,
    embedding_dimensions: 1536,
    index_size_mb: 45.5,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockRoutingConfig = {
  data: {
    phi_detection_enabled: true,
    phi_route_to_local: true,
    default_chat_model: "gpt-4",
    default_embedding_model: "text-embedding-3-small",
    fallback_enabled: true,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

describe("useModelAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/models")) return mockModels;
      if (url.includes("/metrics")) return mockMetrics;
      if (url.includes("/search/stats")) return mockSearchStats;
      if (url.includes("/embeddings/stats")) return mockEmbeddingStats;
      if (url.includes("/routing")) return mockRoutingConfig;
      throw new Error("Unknown endpoint");
    });
  });

  it("should fetch all data on mount", async () => {
    const { result } = renderHook(() => useModelAnalytics());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].id).toBe("gpt-4");
    expect(result.current.metrics?.total_requests_24h).toBe(1500);
    expect(result.current.searchStats?.total_searches_24h).toBe(500);
    expect(result.current.embeddingStats?.total_documents).toBe(1000);
    expect(result.current.routingConfig?.phi_detection_enabled).toBe(true);
  });

  it("should fetch metrics with custom days parameter", async () => {
    renderHook(() => useModelAnalytics({ days: 7 }));

    await waitFor(() => {
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/medical/metrics?days=7",
      );
    });
  });

  it("should handle API errors gracefully", async () => {
    // Mock metrics endpoint to fail (this is the one that sets error state)
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/metrics")) throw new Error("Network error");
      if (url.includes("/models")) return mockModels;
      if (url.includes("/search/stats")) return mockSearchStats;
      if (url.includes("/embeddings/stats")) return mockEmbeddingStats;
      if (url.includes("/routing")) return mockRoutingConfig;
      throw new Error("Unknown endpoint");
    });

    const { result } = renderHook(() => useModelAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Error should be set from the metrics endpoint failure
    expect(result.current.error).toBe("Network error");
  });

  it("should refresh metrics when refreshMetrics is called", async () => {
    const { result } = renderHook(() => useModelAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCallCount = vi.mocked(fetchAPI).mock.calls.length;

    await act(async () => {
      await result.current.refreshMetrics();
    });

    expect(vi.mocked(fetchAPI).mock.calls.length).toBeGreaterThan(
      initialCallCount,
    );
  });

  it("should update routing configuration", async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "PATCH") return { success: true };
        if (url.includes("/models")) return mockModels;
        if (url.includes("/metrics")) return mockMetrics;
        if (url.includes("/search/stats")) return mockSearchStats;
        if (url.includes("/embeddings/stats")) return mockEmbeddingStats;
        if (url.includes("/routing")) return mockRoutingConfig;
        throw new Error("Unknown endpoint");
      },
    );

    const { result } = renderHook(() => useModelAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.updateRouting({
        phi_detection_enabled: false,
      });
    });

    expect(success).toBe(true);
    expect(fetchAPI).toHaveBeenCalledWith(
      "/api/admin/medical/routing",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("should set loading states correctly", async () => {
    const { result } = renderHook(() => useModelAnalytics());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
