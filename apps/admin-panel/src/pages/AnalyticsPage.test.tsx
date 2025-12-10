/**
 * Tests for AnalyticsPage - Sprint 4 Enhanced Analytics
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AnalyticsPage } from "./AnalyticsPage";

// Mock the hooks and api
vi.mock("../hooks/useModelAnalytics", () => ({
  useModelAnalytics: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/apiClient", () => ({
  getApiClient: () => ({
    request: vi.fn().mockResolvedValue(new Blob()),
  }),
}));

// Mock @voiceassist/ui
vi.mock("@voiceassist/ui", () => ({
  HelpButton: () => <button data-testid="help-button">Help</button>,
}));

// Mock shared components
vi.mock("../components/shared", () => ({
  AskAIButton: () => <button data-testid="ask-ai-button">Ask AI</button>,
}));

import { useModelAnalytics } from "../hooks/useModelAnalytics";

const mockMetrics = {
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
  model_breakdown: [
    {
      model_id: "gpt-4",
      model_name: "GPT-4",
      provider: "openai",
      requests: 1000,
      tokens_input: 400000,
      tokens_output: 200000,
      estimated_cost: 20.0,
      avg_latency_ms: 500,
    },
  ],
  period_days: 1,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockSearchStats = {
  total_searches_24h: 500,
  avg_latency_ms: 120,
  p95_latency_ms: 280,
  cache_hit_rate: 0.75,
  top_queries: [
    { query: "test query 1", count: 50 },
    { query: "test query 2", count: 30 },
  ],
  search_types: { semantic: 300, keyword: 100, hybrid: 100 },
  no_results_rate: 0.05,
  period_days: 1,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockModels = [
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
];

const mockEmbeddingStats = {
  total_documents: 1000,
  total_chunks: 5000,
  total_embeddings: 5000,
  embedding_dimensions: 1536,
  index_size_mb: 45.5,
  timestamp: "2024-01-15T12:00:00Z",
};

const defaultMockReturn = {
  models: mockModels,
  metrics: mockMetrics,
  searchStats: mockSearchStats,
  embeddingStats: mockEmbeddingStats,
  routingConfig: null,
  loading: false,
  metricsLoading: false,
  searchStatsLoading: false,
  error: null,
  refresh: vi.fn(),
  refreshMetrics: vi.fn(),
  refreshSearchStats: vi.fn(),
  updateRouting: vi.fn(),
};

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useModelAnalytics).mockReturnValue(defaultMockReturn);
  });

  it("should render the page title", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });
  });

  it("should render tab navigation", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /overview/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /ai models/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /search analytics/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /cost tracking/i }),
      ).toBeInTheDocument();
    });
  });

  it("should display metrics when available", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      // Check for requests count displayed somewhere
      expect(screen.getByText(/1,500/)).toBeInTheDocument();
    });
  });

  it("should switch tabs when clicked", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /ai models/i }),
      ).toBeInTheDocument();
    });

    const modelsTab = screen.getByRole("button", { name: /ai models/i });
    fireEvent.click(modelsTab);

    // After clicking Models tab, model info should appear
    await waitFor(() => {
      // Check for Context which appears in model cards
      expect(screen.getByText(/context/i)).toBeInTheDocument();
    });
  });

  it("should display error when hook returns error", async () => {
    vi.mocked(useModelAnalytics).mockReturnValue({
      ...defaultMockReturn,
      error: "Failed to fetch data",
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch data/i)).toBeInTheDocument();
    });
  });

  it("should handle null metrics gracefully", async () => {
    vi.mocked(useModelAnalytics).mockReturnValue({
      ...defaultMockReturn,
      metrics: null,
      searchStats: null,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });
  });

  it("should call refreshMetrics on hook", async () => {
    const mockRefreshMetrics = vi.fn();
    vi.mocked(useModelAnalytics).mockReturnValue({
      ...defaultMockReturn,
      refreshMetrics: mockRefreshMetrics,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(mockRefreshMetrics).toHaveBeenCalled();
    });
  });
});
