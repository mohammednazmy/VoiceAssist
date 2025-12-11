"""LLM client abstraction for VoiceAssist V2.

This module provides a single interface for calling language models
(cloud and local) and encapsulates configuration, safety, and routing
logic. It is the runtime companion to the high-level design in
ORCHESTRATION_DESIGN.md and SECURITY_COMPLIANCE.md.

The intent is:

- For non-PHI queries: Prefer high-capability cloud models.
- For PHI-containing queries: Prefer approved local models.
- For all queries: Track cost, latency, and model selection decisions.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, Literal, Optional

import httpx
from app.core.business_metrics import openai_api_cost_dollars, openai_tokens_used_total
from app.core.resilience import openai_breaker
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion, ChatCompletionChunk
from pybreaker import CircuitBreakerError

logger = logging.getLogger(__name__)

ModelFamily = Literal["cloud", "local"]
IntentType = Literal["diagnosis", "treatment", "drug", "guideline", "summary", "other"]

# OpenAI model pricing per 1M tokens (as of 2024)
# Format: {model_name: (input_price_per_1m, output_price_per_1m)}
MODEL_PRICING: Dict[str, tuple[float, float]] = {
    # GPT-4o models
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-2024-11-20": (2.50, 10.00),
    "gpt-4o-2024-08-06": (2.50, 10.00),
    "gpt-4o-2024-05-13": (5.00, 15.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-mini-2024-07-18": (0.15, 0.60),
    # GPT-4 Turbo
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-4-turbo-2024-04-09": (10.00, 30.00),
    "gpt-4-turbo-preview": (10.00, 30.00),
    # GPT-4
    "gpt-4": (30.00, 60.00),
    "gpt-4-0613": (30.00, 60.00),
    # GPT-3.5 Turbo
    "gpt-3.5-turbo": (0.50, 1.50),
    "gpt-3.5-turbo-0125": (0.50, 1.50),
    "gpt-3.5-turbo-1106": (1.00, 2.00),
    # Realtime models (audio pricing is different, this is for text fallback)
    "gpt-4o-realtime-preview": (5.00, 20.00),
    "gpt-4o-realtime-preview-2024-10-01": (5.00, 20.00),
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD for a given model and token count.

    Args:
        model: Model name (e.g., "gpt-4o")
        input_tokens: Number of input/prompt tokens
        output_tokens: Number of output/completion tokens

    Returns:
        Cost in USD
    """
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        # Default to gpt-4o pricing if model not found
        logger.warning(f"Unknown model {model} for pricing, using gpt-4o pricing")
        pricing = MODEL_PRICING["gpt-4o"]

    input_price_per_1m, output_price_per_1m = pricing
    input_cost = (input_tokens / 1_000_000) * input_price_per_1m
    output_cost = (output_tokens / 1_000_000) * output_price_per_1m
    return input_cost + output_cost


@dataclass
class LLMRequest:
    prompt: Optional[str] = None  # Single prompt (for simple queries)
    messages: Optional[list] = None  # Full message history (for multi-turn with tools)
    intent: IntentType = "other"
    temperature: float = 0.1
    max_tokens: int = 512
    phi_present: bool = False
    trace_id: Optional[str] = None
    model_override: Optional[str] = None
    model_provider: Optional[str] = None
    # Tool/Function calling support
    tools: Optional[list] = None  # List of tool definitions in OpenAI format
    tool_choice: Optional[str] = "auto"  # "auto", "required", "none", or specific tool


@dataclass
class ToolCall:
    """Represents a tool call from the LLM."""

    id: str
    name: str
    arguments: str  # JSON string of arguments


@dataclass
class LLMResponse:
    text: str
    model_name: str
    model_family: ModelFamily
    used_tokens: int
    latency_ms: float
    finish_reason: str
    cost_usd: float = 0.0  # Estimated cost in USD
    input_tokens: int = 0
    output_tokens: int = 0
    # Tool/Function calling support
    tool_calls: Optional[list] = None  # List of ToolCall objects


class LLMClient:
    """High-level interface for calling models.

    This base class provides a common interface; concrete implementations
    should override `_call_cloud` and `_call_local`.
    """

    def __init__(
        self,
        cloud_model: str = "gpt-4o",
        local_model: str = "local-clinical-llm",
        openai_api_key: Optional[str] = None,
        openai_timeout_sec: int = 30,
        local_api_url: Optional[str] = None,
        local_api_key: Optional[str] = None,
        local_timeout_sec: int = 15,
    ) -> None:
        self.cloud_model = cloud_model
        self.local_model = local_model

        # Initialize OpenAI client for cloud models
        self.openai_client = (
            AsyncOpenAI(
                api_key=openai_api_key,
                timeout=openai_timeout_sec,
            )
            if openai_api_key
            else None
        )

        if not self.openai_client:
            logger.warning("OpenAI API key not provided. Cloud model calls will fail.")

        # Local model client (OpenAI-compatible endpoint such as vLLM/LLama.cpp)
        self.local_client: Optional[httpx.AsyncClient] = None
        if local_api_url:
            headers = {}
            if local_api_key:
                headers["Authorization"] = f"Bearer {local_api_key}"
            self.local_client = httpx.AsyncClient(
                base_url=local_api_url,
                timeout=local_timeout_sec,
                headers=headers or None,
            )
        self.has_local_model = self.local_client is not None

    # Default system prompts for fallback when dynamic lookup fails
    _DEFAULT_SYSTEM_PROMPTS = {
        "diagnosis": (
            "You are a medical AI assistant specializing in clinical diagnosis. "
            "Provide evidence-based diagnostic insights with appropriate citations."
        ),
        "treatment": (
            "You are a medical AI assistant specializing in treatment planning. "
            "Provide evidence-based treatment recommendations with appropriate citations."
        ),
        "drug": (
            "You are a medical AI assistant specializing in pharmacology. "
            "Provide evidence-based drug information with appropriate citations."
        ),
        "guideline": (
            "You are a medical AI assistant specializing in clinical guidelines. "
            "Provide evidence-based guideline information with appropriate citations."
        ),
        "summary": (
            "You are a medical AI assistant specializing in medical summarization. "
            "Provide clear, concise summaries with appropriate citations."
        ),
        "other": (
            "You are a helpful medical AI assistant. "
            "Provide accurate, evidence-based information with appropriate citations when available."
        ),
    }

    @staticmethod
    def _get_default_system_prompt(intent: IntentType) -> str:
        """Get default system prompt for intent (fallback)."""
        return LLMClient._DEFAULT_SYSTEM_PROMPTS.get(intent, LLMClient._DEFAULT_SYSTEM_PROMPTS["other"])

    async def _get_system_prompt_for_intent(self, intent: IntentType) -> str:
        """Get system prompt for intent with dynamic lookup and fallback.

        Uses the PromptService for dynamic prompt management with fallback
        to hardcoded defaults if the dynamic lookup fails.

        Args:
            intent: The intent type (diagnosis, treatment, drug, etc.)

        Returns:
            The system prompt text
        """
        try:
            # Import here to avoid circular imports
            from app.services.prompt_service import prompt_service

            # Try dynamic prompt lookup
            prompt_text = await prompt_service.get_system_prompt_for_intent(intent, "chat")
            if prompt_text:
                return prompt_text
        except Exception as e:
            logger.warning(f"Failed to get dynamic prompt for intent '{intent}': {e}")

        # Fallback to hardcoded default
        return self._get_default_system_prompt(intent)

    def _system_prompt_for_intent(self, intent: IntentType) -> str:
        """Synchronous fallback for system prompt lookup.

        Note: Prefer using _get_system_prompt_for_intent() for async contexts.
        This method exists for backward compatibility.
        """
        return self._get_default_system_prompt(intent)

    async def generate(self, req: LLMRequest) -> LLMResponse:
        """Select model family and generate a single response.

        Selection strategy (initial version):

        - If `req.phi_present` is True → route to local model.
        - Else → route to cloud model.
        - Later phases can add per-intent routing, cost-awareness, etc.

        Safety checks:
        - Validates prompt or messages is non-empty
        - Normalizes whitespace
        - Enforces reasonable max_tokens limits
        """
        # Safety: validate prompt or messages is not empty
        has_prompt = req.prompt and req.prompt.strip()
        has_messages = req.messages and len(req.messages) > 0

        if not has_prompt and not has_messages:
            logger.warning(
                "LLMClient.generate called with empty prompt and no messages, trace_id=%s",
                req.trace_id,
            )
            raise ValueError("Prompt or messages cannot be empty")

        # Safety: normalize whitespace in prompt
        if has_prompt:
            req.prompt = " ".join(req.prompt.split())

        # Determine routing family
        adapter_requests_local = req.model_provider not in (None, "openai", "cloud")
        family: ModelFamily = "local" if (req.phi_present or adapter_requests_local) else "cloud"

        # Safety: enforce max_tokens limits (see ORCHESTRATION_DESIGN.md)
        # Cloud models: up to 4096 tokens, Local models: up to 2048 tokens
        max_allowed_tokens = 2048 if family == "local" else 4096
        if req.max_tokens > max_allowed_tokens:
            logger.warning(
                "max_tokens=%d exceeds limit=%d for family=%s, capping. trace_id=%s",
                req.max_tokens,
                max_allowed_tokens,
                family,
                req.trace_id,
            )
            req.max_tokens = max_allowed_tokens

        if family == "local" and not self.has_local_model:
            # Defensive: callers should not route to local path without a local model
            raise RuntimeError("Local model requested but not configured")
        logger.debug(
            "LLMClient.generate: family=%s intent=%s phi_present=%s trace_id=%s",
            family,
            req.intent,
            req.phi_present,
            req.trace_id,
        )
        if family == "cloud":
            return await self._call_cloud(req)
        return await self._call_local(req)

    async def _call_cloud(self, req: LLMRequest) -> LLMResponse:
        """Call a cloud model using OpenAI API.

        Uses the official OpenAI client library with proper error handling,
        retry logic, circuit breaker protection, and cost tracking.

        Tracks metrics: tokens (prompt + completion), latency, finish_reason
        See ORCHESTRATION_DESIGN.md - "Step 6: LLM Synthesis"
        See OBSERVABILITY.md for additional metrics to track
        """
        if not self.openai_client:
            logger.error(
                "OpenAI client not initialized. API key missing. trace_id=%s",
                req.trace_id,
            )
            raise RuntimeError("OpenAI API key not configured. Cannot call cloud model.")

        # Check circuit breaker before attempting call
        try:
            openai_breaker.call(lambda: None)  # Lightweight check
        except CircuitBreakerError:
            logger.error(
                "OpenAI circuit breaker is OPEN - failing fast. trace_id=%s",
                req.trace_id,
            )
            raise RuntimeError("OpenAI API is temporarily unavailable (circuit breaker open)")

        model_name = req.model_override or self.cloud_model

        logger.info("Calling cloud model %s trace_id=%s", model_name, req.trace_id)

        backoff_seconds = [1, 2, 4]
        last_error: Optional[Exception] = None

        for attempt, delay in enumerate(backoff_seconds, start=1):
            start_time = time.time()

            try:
                # Build messages for the API call
                if req.messages:
                    # Use provided messages (multi-turn conversation with tool results)
                    # Ensure system prompt is at the start
                    messages = req.messages.copy()
                    if not messages or messages[0].get("role") != "system":
                        system_message = await self._get_system_prompt_for_intent(req.intent)
                        messages.insert(0, {"role": "system", "content": system_message})
                else:
                    # Build messages from prompt (simple single-turn query)
                    system_message = await self._get_system_prompt_for_intent(req.intent)
                    messages = [
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": req.prompt},
                    ]

                # Build API call parameters
                api_params = {
                    "model": model_name,
                    "messages": messages,
                    "temperature": req.temperature,
                }

                # Use max_completion_tokens for newer models (gpt-4o, gpt-5, o1, o3, etc.)
                # These models don't support the legacy max_tokens parameter
                if any(model_name.startswith(prefix) for prefix in ("gpt-4o", "gpt-5", "o1", "o3")):
                    api_params["max_completion_tokens"] = req.max_tokens
                else:
                    api_params["max_tokens"] = req.max_tokens

                # Add tools if provided
                if req.tools:
                    api_params["tools"] = req.tools
                    if req.tool_choice:
                        api_params["tool_choice"] = req.tool_choice

                # Call OpenAI Chat Completions API with timeout
                response: ChatCompletion = await asyncio.wait_for(
                    self.openai_client.chat.completions.create(**api_params),
                    timeout=30,
                )

                # Calculate latency
                latency_ms = (time.time() - start_time) * 1000

                # Extract response data
                choice = response.choices[0]
                text = choice.message.content or ""
                finish_reason = choice.finish_reason or "stop"

                # Extract tool calls if present
                tool_calls_list = None
                if choice.message.tool_calls:
                    tool_calls_list = [
                        ToolCall(
                            id=tc.id,
                            name=tc.function.name,
                            arguments=tc.function.arguments,
                        )
                        for tc in choice.message.tool_calls
                    ]

                # Calculate token usage
                usage = response.usage
                total_tokens = usage.total_tokens if usage else 0

                logger.info(
                    "Cloud model call successful: model=%s tokens=%d latency=%.2fms finish=%s trace_id=%s",
                    model_name,
                    total_tokens,
                    latency_ms,
                    finish_reason,
                    req.trace_id,
                )

                # Calculate and track cost
                input_tokens = usage.prompt_tokens if usage else 0
                output_tokens = usage.completion_tokens if usage else 0
                cost_usd = calculate_cost(model_name, input_tokens, output_tokens)

                # Track metrics via Prometheus
                if usage:
                    openai_tokens_used_total.labels(model=model_name, token_type="prompt").inc(input_tokens)
                    openai_tokens_used_total.labels(model=model_name, token_type="completion").inc(output_tokens)
                    openai_api_cost_dollars.inc(cost_usd)

                logger.debug(
                    "Token breakdown: input=%d output=%d total=%d cost=$%.6f trace_id=%s",
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    cost_usd,
                    req.trace_id,
                )

                return LLMResponse(
                    text=text,
                    model_name=model_name,
                    model_family="cloud",
                    used_tokens=total_tokens,
                    latency_ms=latency_ms,
                    finish_reason=finish_reason,
                    cost_usd=cost_usd,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    tool_calls=tool_calls_list,
                )

            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.error(
                    "Cloud model call timed out (attempt %d) model=%s trace_id=%s",
                    attempt,
                    model_name,
                    req.trace_id,
                )
            except Exception as e:
                last_error = e
                latency_ms = (time.time() - start_time) * 1000
                logger.error(
                    "Cloud model call failed (attempt %d): model=%s error=%s latency=%.2fms trace_id=%s",
                    attempt,
                    model_name,
                    str(e),
                    latency_ms,
                    req.trace_id,
                    exc_info=True,
                )

            await asyncio.sleep(delay)

        raise RuntimeError(f"Failed to call cloud model {model_name} after retries: {last_error}") from last_error

    async def stream_generate(
        self,
        req: LLMRequest,
        on_chunk: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> LLMResponse:
        """
        Stream a response from the cloud model and invoke a callback per text delta.

        Args:
            req: LLMRequest with prompt or messages and config
            on_chunk: Optional callback to receive partial text chunks

        Returns:
            LLMResponse with aggregated text and usage metadata
        """
        adapter_requests_local = req.model_provider not in (None, "openai", "cloud")
        family: ModelFamily = "local" if (req.phi_present or adapter_requests_local) else "cloud"

        if family == "local":
            return await self._call_local(req)

        if not self.openai_client:
            logger.error(
                "OpenAI client not initialized. API key missing. trace_id=%s",
                req.trace_id,
            )
            raise RuntimeError("OpenAI API key not configured. Cannot call cloud model.")

        # Validate that we have either prompt or messages
        has_prompt = req.prompt and req.prompt.strip()
        has_messages = req.messages and len(req.messages) > 0

        if not has_prompt and not has_messages:
            raise ValueError("Prompt or messages cannot be empty")

        if has_prompt:
            req.prompt = " ".join(req.prompt.split())

        max_allowed_tokens = 2048 if family == "local" else 4096
        if req.max_tokens > max_allowed_tokens:
            req.max_tokens = max_allowed_tokens

        model_name = req.model_override or self.cloud_model

        logger.info("Streaming cloud model %s trace_id=%s", model_name, req.trace_id)

        full_text: list[str] = []
        start_time = time.time()
        finish_reason: str = "stop"
        usage = None
        tool_calls_list = None

        try:
            # Build messages for the API call (same logic as _call_cloud)
            if has_messages:
                # Use provided messages (multi-turn conversation with tools)
                messages = req.messages.copy()
                if not messages or messages[0].get("role") != "system":
                    system_message = await self._get_system_prompt_for_intent(req.intent)
                    messages.insert(0, {"role": "system", "content": system_message})
            else:
                # Build messages from prompt (simple single-turn query)
                system_message = await self._get_system_prompt_for_intent(req.intent)
                messages = [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": req.prompt},
                ]

            # Build API call parameters
            api_params = {
                "model": model_name,
                "messages": messages,
                "temperature": req.temperature,
                "stream": True,
            }

            # Use max_completion_tokens for newer models (gpt-4o, gpt-5, o1, o3, etc.)
            # These models don't support the legacy max_tokens parameter
            if any(model_name.startswith(prefix) for prefix in ("gpt-4o", "gpt-5", "o1", "o3")):
                api_params["max_completion_tokens"] = req.max_tokens
            else:
                api_params["max_tokens"] = req.max_tokens

            # Add tools if provided
            if req.tools:
                api_params["tools"] = req.tools
                if req.tool_choice:
                    api_params["tool_choice"] = req.tool_choice

            stream = await self.openai_client.chat.completions.create(**api_params)

            # Track tool calls accumulation (they come in chunks)
            tool_calls_data: Dict[int, Dict] = {}  # index -> {id, name, arguments}

            async for chunk in stream:
                if isinstance(chunk, ChatCompletionChunk):
                    delta = chunk.choices[0].delta
                    text_piece = delta.content or ""
                    if text_piece:
                        full_text.append(text_piece)
                        if on_chunk:
                            result = on_chunk(text_piece)
                            if inspect.isawaitable(result):
                                await result

                    # Handle tool calls in streaming (they come incrementally)
                    if hasattr(delta, "tool_calls") and delta.tool_calls:
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_data:
                                tool_calls_data[idx] = {
                                    "id": "",
                                    "name": "",
                                    "arguments": "",
                                }
                            if tc.id:
                                tool_calls_data[idx]["id"] = tc.id
                            if tc.function:
                                if tc.function.name:
                                    tool_calls_data[idx]["name"] = tc.function.name
                                if tc.function.arguments:
                                    tool_calls_data[idx]["arguments"] += tc.function.arguments

                    if chunk.choices[0].finish_reason:
                        finish_reason = chunk.choices[0].finish_reason

                    # Final chunk includes usage
                    if getattr(chunk, "usage", None):
                        usage = chunk.usage

            latency_ms = (time.time() - start_time) * 1000
            aggregated_text = "".join(full_text)

            # Build tool_calls list if any were made
            if tool_calls_data:
                tool_calls_list = [
                    ToolCall(
                        id=tc_data["id"],
                        name=tc_data["name"],
                        arguments=tc_data["arguments"],
                    )
                    for tc_data in tool_calls_data.values()
                ]

            input_tokens = usage.prompt_tokens if usage else 0
            output_tokens = usage.completion_tokens if usage else 0
            total_tokens = usage.total_tokens if usage else input_tokens + output_tokens
            cost_usd = calculate_cost(model_name, input_tokens, output_tokens) if usage else 0.0

            if usage:
                openai_tokens_used_total.labels(model=model_name, token_type="prompt").inc(input_tokens)
                openai_tokens_used_total.labels(model=model_name, token_type="completion").inc(output_tokens)
                openai_api_cost_dollars.inc(cost_usd)

            return LLMResponse(
                text=aggregated_text,
                model_name=model_name,
                model_family="cloud",
                used_tokens=total_tokens,
                latency_ms=latency_ms,
                finish_reason=finish_reason,
                cost_usd=cost_usd,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                tool_calls=tool_calls_list,
            )

        except Exception as exc:  # noqa: BLE001
            latency_ms = (time.time() - start_time) * 1000
            logger.error(
                "Streaming cloud model failed: %s latency=%.2fms trace_id=%s",
                exc,
                latency_ms,
                req.trace_id,
                exc_info=True,
            )
            raise

    async def _call_local(self, req: LLMRequest) -> LLMResponse:
        """Call a local model for PHI-containing queries.

        In production, this should call a local inference server (e.g., vLLM, Ollama)
        running a HIPAA-compliant model on-premises.

        See SECURITY_COMPLIANCE.md - "PHI Routing" for production requirements.
        See BACKEND_ARCHITECTURE.md - "Local LLM Service" for architecture.
        See OBSERVABILITY.md for metrics to track (tokens, latency).
        """
        if not self.has_local_model or not self.local_client:
            raise RuntimeError("Local model requested but not configured")

        model_name = req.model_override or self.local_model

        logger.info("Calling local model %s trace_id=%s", model_name, req.trace_id)

        start_time = time.time()
        try:
            response = await self.local_client.post(
                "/v1/chat/completions",
                json={
                    "model": model_name,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a local clinical assistant.",
                        },
                        {"role": "user", "content": req.prompt},
                    ],
                    "temperature": req.temperature,
                    "max_tokens": min(req.max_tokens, 2048),
                },
            )
            response.raise_for_status()
            payload = response.json()
            choice = payload["choices"][0]
            text = choice["message"].get("content") or ""
            finish_reason = choice.get("finish_reason", "stop")

            usage = payload.get("usage", {})
            total_tokens = usage.get("total_tokens", 0)

            latency_ms = (time.time() - start_time) * 1000
            logger.info(
                "Local model call successful: model=%s tokens=%d latency=%.2fms finish=%s trace_id=%s",
                model_name,
                total_tokens,
                latency_ms,
                finish_reason,
                req.trace_id,
            )

            return LLMResponse(
                text=text,
                model_name=model_name,
                model_family="local",
                used_tokens=total_tokens,
                latency_ms=latency_ms,
                finish_reason=finish_reason,
            )

        except httpx.RequestError as exc:
            latency_ms = (time.time() - start_time) * 1000
            logger.error(
                "Local model HTTP error: %s latency=%.2fms trace_id=%s",
                exc,
                latency_ms,
                req.trace_id,
                exc_info=True,
            )
            raise RuntimeError(f"Local model HTTP error: {exc}") from exc
        except Exception as exc:
            latency_ms = (time.time() - start_time) * 1000
            logger.error(
                "Local model call failed: %s latency=%.2fms trace_id=%s",
                exc,
                latency_ms,
                req.trace_id,
                exc_info=True,
            )
            raise RuntimeError(f"Local model call failed: {exc}") from exc
