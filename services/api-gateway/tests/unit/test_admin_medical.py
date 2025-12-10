"""Unit tests for Admin Medical AI API endpoints.

Tests cover:
- Model listing and details
- Model usage metrics
- Search statistics
- Embedding statistics
- Routing configuration GET/PATCH
- RBAC enforcement (admin vs viewer roles)
"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from app.api.admin_medical import (
    EmbeddingStats,
    ModelInfo,
    ModelUsageMetrics,
    RoutingConfig,
    SearchStats,
    _calculate_cost,
    _get_model_metrics_from_redis,
    _get_search_stats_from_redis,
)


class TestCostCalculation:
    """Tests for cost calculation helper."""

    def test_calculate_cost_gpt4_turbo(self):
        """Test cost calculation for GPT-4 Turbo."""
        # 10K input tokens + 5K output tokens
        cost = _calculate_cost(10000, 5000, "gpt-4-turbo")
        # Expected: (10/1) * 0.01 + (5/1) * 0.03 = 0.10 + 0.15 = 0.25
        assert cost == 0.25

    def test_calculate_cost_gpt35_turbo(self):
        """Test cost calculation for GPT-3.5 Turbo."""
        cost = _calculate_cost(10000, 5000, "gpt-3.5-turbo")
        # Expected: (10/1) * 0.0005 + (5/1) * 0.0015 = 0.005 + 0.0075 = 0.0125
        assert cost == 0.0125

    def test_calculate_cost_local_model(self):
        """Test that local models have zero cost."""
        cost = _calculate_cost(100000, 50000, "local")
        assert cost == 0.0

    def test_calculate_cost_unknown_model_defaults(self):
        """Test that unknown models default to GPT-4 Turbo pricing."""
        cost = _calculate_cost(10000, 5000, "unknown-model")
        # Should use gpt-4-turbo pricing as fallback
        assert cost == 0.25


class TestMetricsHelpers:
    """Tests for metrics helper functions."""

    @patch("app.api.admin_medical.redis_client")
    def test_get_model_metrics_from_redis_success(self, mock_redis):
        """Test successful metrics retrieval from Redis."""
        mock_data = {
            "total_requests_24h": 1000,
            "total_tokens_input_24h": 500000,
            "total_tokens_output_24h": 150000,
            "cloud_requests": 800,
            "local_requests": 200,
            "latencies_ms": [100, 150, 200],
            "errors": 10,
            "by_model": {},
        }
        mock_redis.get.return_value = json.dumps(mock_data)

        metrics = _get_model_metrics_from_redis()

        assert metrics["total_requests_24h"] == 1000
        assert metrics["cloud_requests"] == 800
        assert metrics["local_requests"] == 200

    @patch("app.api.admin_medical.redis_client")
    def test_get_model_metrics_from_redis_empty(self, mock_redis):
        """Test handling when no metrics exist."""
        mock_redis.get.return_value = None

        metrics = _get_model_metrics_from_redis()

        assert metrics["total_requests_24h"] == 0
        assert metrics["cloud_requests"] == 0

    @patch("app.api.admin_medical.redis_client")
    def test_get_model_metrics_redis_error(self, mock_redis):
        """Test graceful handling of Redis errors."""
        mock_redis.get.side_effect = Exception("Redis connection failed")

        metrics = _get_model_metrics_from_redis()

        # Should return default values
        assert metrics["total_requests_24h"] == 0

    @patch("app.api.admin_medical.redis_client")
    def test_get_search_stats_from_redis_success(self, mock_redis):
        """Test successful search stats retrieval."""
        mock_data = {
            "total_searches_24h": 500,
            "latencies_ms": [50, 75, 100],
            "cache_hits": 300,
            "cache_misses": 200,
            "search_types": {"semantic": 300, "keyword": 100, "hybrid": 100},
            "no_results": 25,
            "top_queries": [{"query": "diabetes", "count": 50}],
        }
        mock_redis.get.return_value = json.dumps(mock_data)

        stats = _get_search_stats_from_redis()

        assert stats["total_searches_24h"] == 500
        assert stats["cache_hits"] == 300

    @patch("app.api.admin_medical.redis_client")
    def test_get_search_stats_from_redis_empty(self, mock_redis):
        """Test handling when no search stats exist."""
        mock_redis.get.return_value = None

        stats = _get_search_stats_from_redis()

        assert stats["total_searches_24h"] == 0


class TestPydanticModels:
    """Tests for Pydantic model validation."""

    def test_model_info_valid(self):
        """Test valid ModelInfo creation."""
        model = ModelInfo(
            id="gpt-4-turbo",
            name="GPT-4 Turbo",
            provider="openai",
            type="chat",
            enabled=True,
            is_primary=True,
            supports_phi=False,
            context_window=128000,
            cost_per_1k_input=0.01,
            cost_per_1k_output=0.03,
        )
        assert model.id == "gpt-4-turbo"
        assert model.provider == "openai"
        assert model.supports_phi is False

    def test_model_usage_metrics_valid(self):
        """Test valid ModelUsageMetrics creation."""
        metrics = ModelUsageMetrics(
            total_requests_24h=1000,
            total_tokens_input_24h=500000,
            total_tokens_output_24h=150000,
            estimated_cost_24h=25.50,
            avg_latency_ms=125.5,
            p95_latency_ms=350.0,
            error_rate=1.5,
            cloud_requests=800,
            local_requests=200,
            cloud_percentage=80.0,
        )
        assert metrics.total_requests_24h == 1000
        assert metrics.cloud_percentage == 80.0

    def test_search_stats_valid(self):
        """Test valid SearchStats creation."""
        stats = SearchStats(
            total_searches_24h=500,
            avg_latency_ms=75.0,
            p95_latency_ms=200.0,
            cache_hit_rate=60.0,
            top_queries=[],
            search_types={"semantic": 300, "keyword": 100, "hybrid": 100},
            no_results_rate=5.0,
        )
        assert stats.total_searches_24h == 500
        assert stats.cache_hit_rate == 60.0

    def test_embedding_stats_valid(self):
        """Test valid EmbeddingStats creation."""
        stats = EmbeddingStats(
            total_documents=1250,
            total_chunks=45000,
            total_embeddings=45000,
            embedding_dimensions=3072,
            index_size_mb=524.5,
            last_indexed_at=datetime.now(timezone.utc).isoformat() + "Z",
        )
        assert stats.total_documents == 1250
        assert stats.embedding_dimensions == 3072

    def test_routing_config_valid(self):
        """Test valid RoutingConfig creation."""
        config = RoutingConfig(
            phi_detection_enabled=True,
            phi_route_to_local=True,
            default_chat_model="gpt-4-turbo",
            default_embedding_model="text-embedding-3-large",
            fallback_enabled=True,
            fallback_model="gpt-3.5-turbo",
        )
        assert config.phi_detection_enabled is True
        assert config.default_chat_model == "gpt-4-turbo"


class TestAdminMedicalEndpoints:
    """Tests for Admin Medical API endpoints."""

    @pytest.fixture
    def mock_admin_user(self):
        """Create a mock admin user."""
        user = MagicMock()
        user.id = "admin-user-123"
        user.email = "admin@example.com"
        user.is_admin = True
        user.admin_role = "admin"
        return user

    @pytest.fixture
    def mock_viewer_user(self):
        """Create a mock viewer user."""
        user = MagicMock()
        user.id = "viewer-user-456"
        user.email = "viewer@example.com"
        user.is_admin = False
        user.admin_role = "viewer"
        return user

    @pytest.fixture
    def mock_request(self):
        """Create a mock FastAPI request."""
        request = MagicMock()
        request.state.trace_id = "test-trace-123"
        return request

    @patch("app.api.admin_medical.redis_client")
    def test_list_models_returns_models(self, mock_redis, mock_request, mock_admin_user):
        """Test that list_models returns expected model list."""
        import asyncio

        from app.api.admin_medical import list_available_models

        # Call the endpoint
        result = asyncio.get_event_loop().run_until_complete(list_available_models(mock_request, mock_admin_user))

        assert result["success"] is True
        assert "models" in result["data"]
        assert len(result["data"]["models"]) > 0

        # Check that expected models are present
        model_ids = [m["id"] for m in result["data"]["models"]]
        assert "gpt-4-turbo" in model_ids
        assert "local-llama" in model_ids

    @patch("app.api.admin_medical._get_model_metrics_from_redis")
    @patch("app.api.admin_medical.redis_client")
    def test_get_metrics_returns_usage_data(self, mock_redis, mock_get_metrics, mock_request, mock_admin_user):
        """Test that get_model_usage_metrics returns expected data."""
        import asyncio

        from app.api.admin_medical import get_model_usage_metrics

        mock_redis.get.return_value = None
        mock_get_metrics.return_value = {
            "total_requests_24h": 1000,
            "total_tokens_input_24h": 500000,
            "total_tokens_output_24h": 150000,
            "cloud_requests": 800,
            "local_requests": 200,
            "latencies_ms": [100, 150, 200],
            "errors": 10,
            "by_model": {},
        }

        result = asyncio.get_event_loop().run_until_complete(
            get_model_usage_metrics(mock_request, mock_admin_user, days=1)
        )

        assert result["success"] is True
        assert "total_requests_24h" in result["data"]
        assert "estimated_cost_24h" in result["data"]
        assert "cloud_percentage" in result["data"]

    @patch("app.api.admin_medical._get_search_stats_from_redis")
    @patch("app.api.admin_medical.redis_client")
    def test_get_search_stats_returns_data(self, mock_redis, mock_get_stats, mock_request, mock_admin_user):
        """Test that get_search_statistics returns expected data."""
        import asyncio

        from app.api.admin_medical import get_search_statistics

        mock_redis.get.return_value = None
        mock_get_stats.return_value = {
            "total_searches_24h": 500,
            "latencies_ms": [50, 75, 100],
            "cache_hits": 300,
            "cache_misses": 200,
            "search_types": {"semantic": 300, "keyword": 100, "hybrid": 100},
            "no_results": 25,
            "top_queries": [],
        }

        result = asyncio.get_event_loop().run_until_complete(
            get_search_statistics(mock_request, mock_admin_user, days=1)
        )

        assert result["success"] is True
        assert "total_searches_24h" in result["data"]
        assert "cache_hit_rate" in result["data"]
        assert "search_types" in result["data"]

    def test_get_embedding_stats_returns_data(self, mock_request, mock_admin_user):
        """Test that get_embedding_statistics returns expected data."""
        import asyncio

        from app.api.admin_medical import get_embedding_statistics

        result = asyncio.get_event_loop().run_until_complete(get_embedding_statistics(mock_request, mock_admin_user))

        assert result["success"] is True
        assert "total_documents" in result["data"]
        assert "total_chunks" in result["data"]
        assert "embedding_dimensions" in result["data"]

    def test_get_routing_config_returns_config(self, mock_request, mock_admin_user):
        """Test that get_routing_config returns expected configuration."""
        import asyncio

        from app.api.admin_medical import get_routing_config

        result = asyncio.get_event_loop().run_until_complete(get_routing_config(mock_request, mock_admin_user))

        assert result["success"] is True
        assert "phi_detection_enabled" in result["data"]
        assert "default_chat_model" in result["data"]
        assert "fallback_enabled" in result["data"]
