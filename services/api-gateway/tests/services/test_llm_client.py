"""
Unit tests for LLM Client Service

Tests the LLM client abstraction for cloud and local model routing,
cost calculation, and request/response handling.
"""

from unittest.mock import patch

import pytest
from app.services.llm_client import MODEL_PRICING, LLMClient, LLMRequest, LLMResponse, ToolCall, calculate_cost


class TestCalculateCost:
    """Tests for cost calculation function."""

    def test_calculate_cost_gpt4o(self):
        """Test cost calculation for GPT-4o model."""
        # GPT-4o: $2.50/1M input, $10.00/1M output
        cost = calculate_cost("gpt-4o", 1000, 500)
        expected = (1000 / 1_000_000) * 2.50 + (500 / 1_000_000) * 10.00
        assert cost == pytest.approx(expected)

    def test_calculate_cost_gpt4o_mini(self):
        """Test cost calculation for GPT-4o-mini model."""
        # GPT-4o-mini: $0.15/1M input, $0.60/1M output
        cost = calculate_cost("gpt-4o-mini", 10000, 2000)
        expected = (10000 / 1_000_000) * 0.15 + (2000 / 1_000_000) * 0.60
        assert cost == pytest.approx(expected)

    def test_calculate_cost_unknown_model(self):
        """Test cost calculation falls back to gpt-4o pricing for unknown models."""
        # Unknown model should use gpt-4o pricing
        cost = calculate_cost("unknown-model-xyz", 1000, 500)
        expected = (1000 / 1_000_000) * 2.50 + (500 / 1_000_000) * 10.00
        assert cost == pytest.approx(expected)

    def test_calculate_cost_zero_tokens(self):
        """Test cost is zero when no tokens used."""
        cost = calculate_cost("gpt-4o", 0, 0)
        assert cost == 0.0


class TestLLMRequest:
    """Tests for LLMRequest dataclass."""

    def test_default_values(self):
        """Test LLMRequest has correct defaults."""
        req = LLMRequest()
        assert req.prompt is None
        assert req.messages is None
        assert req.intent == "other"
        assert req.temperature == 0.1
        assert req.max_tokens == 512
        assert req.phi_present is False
        assert req.trace_id is None
        assert req.model_override is None
        assert req.tools is None
        assert req.tool_choice == "auto"

    def test_custom_values(self):
        """Test LLMRequest accepts custom values."""
        req = LLMRequest(
            prompt="Test prompt",
            intent="diagnosis",
            temperature=0.5,
            max_tokens=1024,
            phi_present=True,
            trace_id="test-123",
        )
        assert req.prompt == "Test prompt"
        assert req.intent == "diagnosis"
        assert req.temperature == 0.5
        assert req.max_tokens == 1024
        assert req.phi_present is True
        assert req.trace_id == "test-123"


class TestLLMResponse:
    """Tests for LLMResponse dataclass."""

    def test_minimal_response(self):
        """Test LLMResponse with required fields only."""
        resp = LLMResponse(
            text="Test response",
            model_name="gpt-4o",
            model_family="cloud",
            used_tokens=100,
            latency_ms=150.0,
            finish_reason="stop",
        )
        assert resp.text == "Test response"
        assert resp.model_name == "gpt-4o"
        assert resp.model_family == "cloud"
        assert resp.cost_usd == 0.0
        assert resp.tool_calls is None

    def test_full_response(self):
        """Test LLMResponse with all fields."""
        tool_call = ToolCall(id="call_123", name="search", arguments='{"query": "test"}')
        resp = LLMResponse(
            text="Test response",
            model_name="gpt-4o",
            model_family="cloud",
            used_tokens=100,
            latency_ms=150.0,
            finish_reason="tool_calls",
            cost_usd=0.05,
            input_tokens=80,
            output_tokens=20,
            tool_calls=[tool_call],
        )
        assert resp.cost_usd == 0.05
        assert resp.input_tokens == 80
        assert resp.output_tokens == 20
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].name == "search"


class TestToolCall:
    """Tests for ToolCall dataclass."""

    def test_tool_call_creation(self):
        """Test ToolCall creation."""
        tc = ToolCall(
            id="call_abc123",
            name="kb_search",
            arguments='{"query": "diabetes treatment"}',
        )
        assert tc.id == "call_abc123"
        assert tc.name == "kb_search"
        assert tc.arguments == '{"query": "diabetes treatment"}'


class TestLLMClientInit:
    """Tests for LLMClient initialization."""

    def test_init_with_api_key(self):
        """Test LLMClient initializes with OpenAI API key."""
        with patch("app.services.llm_client.AsyncOpenAI") as mock_openai:
            client = LLMClient(openai_api_key="test-key")
            mock_openai.assert_called_once()
            assert client.cloud_model == "gpt-4o"
            assert client.local_model == "local-clinical-llm"

    def test_init_without_api_key(self):
        """Test LLMClient warns when no API key provided."""
        with patch("app.services.llm_client.logger") as mock_logger:
            client = LLMClient(openai_api_key=None)
            mock_logger.warning.assert_called_once()
            assert client.openai_client is None

    def test_init_with_local_model(self):
        """Test LLMClient initializes local model client."""
        with patch("app.services.llm_client.AsyncOpenAI"):
            with patch("app.services.llm_client.httpx.AsyncClient") as mock_httpx:
                client = LLMClient(
                    openai_api_key="test-key",
                    local_api_url="http://localhost:8080",
                    local_api_key="local-key",
                )
                mock_httpx.assert_called_once()
                assert client.has_local_model is True


class TestLLMClientGenerate:
    """Tests for LLMClient.generate method."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("app.services.llm_client.AsyncOpenAI"):
            self.client = LLMClient(openai_api_key="test-key")

    @pytest.mark.asyncio
    async def test_generate_empty_prompt_raises(self):
        """Test generate raises error for empty prompt."""
        req = LLMRequest(prompt="", messages=None)
        with pytest.raises(ValueError, match="Prompt or messages cannot be empty"):
            await self.client.generate(req)

    @pytest.mark.asyncio
    async def test_generate_whitespace_prompt_raises(self):
        """Test generate raises error for whitespace-only prompt."""
        req = LLMRequest(prompt="   \n\t  ")
        with pytest.raises(ValueError, match="Prompt or messages cannot be empty"):
            await self.client.generate(req)

    @pytest.mark.asyncio
    async def test_generate_normalizes_whitespace(self):
        """Test generate normalizes whitespace in prompt."""
        req = LLMRequest(prompt="  Hello   world  \n  test  ")

        with patch.object(self.client, "_call_cloud") as mock_cloud:
            mock_cloud.return_value = LLMResponse(
                text="response",
                model_name="gpt-4o",
                model_family="cloud",
                used_tokens=10,
                latency_ms=100.0,
                finish_reason="stop",
            )
            await self.client.generate(req)
            # Verify prompt was normalized
            called_req = mock_cloud.call_args[0][0]
            assert called_req.prompt == "Hello world test"

    @pytest.mark.asyncio
    async def test_generate_routes_to_cloud_by_default(self):
        """Test generate routes to cloud model by default."""
        req = LLMRequest(prompt="Test query")

        with patch.object(self.client, "_call_cloud") as mock_cloud:
            mock_cloud.return_value = LLMResponse(
                text="response",
                model_name="gpt-4o",
                model_family="cloud",
                used_tokens=10,
                latency_ms=100.0,
                finish_reason="stop",
            )
            await self.client.generate(req)
            mock_cloud.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_routes_to_local_for_phi(self):
        """Test generate routes to local model when PHI is present."""
        self.client.has_local_model = True

        with patch.object(self.client, "_call_local") as mock_local:
            mock_local.return_value = LLMResponse(
                text="response",
                model_name="local-model",
                model_family="local",
                used_tokens=10,
                latency_ms=100.0,
                finish_reason="stop",
            )
            req = LLMRequest(prompt="Patient John Doe has diabetes", phi_present=True)
            await self.client.generate(req)
            mock_local.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_caps_max_tokens_cloud(self):
        """Test generate caps max_tokens for cloud models."""
        req = LLMRequest(prompt="Test", max_tokens=10000)

        with patch.object(self.client, "_call_cloud") as mock_cloud:
            mock_cloud.return_value = LLMResponse(
                text="response",
                model_name="gpt-4o",
                model_family="cloud",
                used_tokens=10,
                latency_ms=100.0,
                finish_reason="stop",
            )
            await self.client.generate(req)
            called_req = mock_cloud.call_args[0][0]
            assert called_req.max_tokens == 4096  # Cloud limit

    @pytest.mark.asyncio
    async def test_generate_caps_max_tokens_local(self):
        """Test generate caps max_tokens for local models."""
        self.client.has_local_model = True
        req = LLMRequest(prompt="Test", max_tokens=10000, phi_present=True)

        with patch.object(self.client, "_call_local") as mock_local:
            mock_local.return_value = LLMResponse(
                text="response",
                model_name="local-model",
                model_family="local",
                used_tokens=10,
                latency_ms=100.0,
                finish_reason="stop",
            )
            await self.client.generate(req)
            called_req = mock_local.call_args[0][0]
            assert called_req.max_tokens == 2048  # Local limit

    @pytest.mark.asyncio
    async def test_generate_local_without_config_raises(self):
        """Test generate raises error when local model requested but not configured."""
        self.client.has_local_model = False
        req = LLMRequest(prompt="Test", phi_present=True)

        with pytest.raises(RuntimeError, match="Local model requested but not configured"):
            await self.client.generate(req)


class TestLLMClientSystemPrompts:
    """Tests for LLMClient system prompt handling."""

    def setup_method(self):
        """Set up test fixtures."""
        with patch("app.services.llm_client.AsyncOpenAI"):
            self.client = LLMClient(openai_api_key="test-key")

    def test_get_default_system_prompt_diagnosis(self):
        """Test default system prompt for diagnosis intent."""
        prompt = LLMClient._get_default_system_prompt("diagnosis")
        assert "clinical diagnosis" in prompt.lower()
        assert "evidence-based" in prompt.lower()

    def test_get_default_system_prompt_treatment(self):
        """Test default system prompt for treatment intent."""
        prompt = LLMClient._get_default_system_prompt("treatment")
        assert "treatment" in prompt.lower()

    def test_get_default_system_prompt_unknown(self):
        """Test default system prompt falls back for unknown intent."""
        prompt = LLMClient._get_default_system_prompt("unknown_intent")
        assert "helpful" in prompt.lower()


class TestModelPricing:
    """Tests for MODEL_PRICING dictionary."""

    def test_model_pricing_has_common_models(self):
        """Test MODEL_PRICING contains common models."""
        expected_models = [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
        ]
        for model in expected_models:
            assert model in MODEL_PRICING, f"Missing model: {model}"

    def test_model_pricing_format(self):
        """Test MODEL_PRICING values are (input, output) tuples."""
        for model, pricing in MODEL_PRICING.items():
            assert isinstance(pricing, tuple), f"Invalid pricing format for {model}"
            assert len(pricing) == 2, f"Invalid pricing tuple length for {model}"
            assert pricing[0] > 0, f"Invalid input price for {model}"
            assert pricing[1] > 0, f"Invalid output price for {model}"
