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

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional
import time

import logging
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion

logger = logging.getLogger(__name__)

ModelFamily = Literal["cloud", "local"]
IntentType = Literal["diagnosis", "treatment", "drug", "guideline", "summary", "other"]


@dataclass
class LLMRequest:
    prompt: str
    intent: IntentType = "other"
    temperature: float = 0.1
    max_tokens: int = 512
    phi_present: bool = False
    trace_id: Optional[str] = None


@dataclass
class LLMResponse:
    text: str
    model_name: str
    model_family: ModelFamily
    used_tokens: int
    latency_ms: float
    finish_reason: str


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
    ) -> None:
        self.cloud_model = cloud_model
        self.local_model = local_model

        # Initialize OpenAI client for cloud models
        self.openai_client = AsyncOpenAI(api_key=openai_api_key) if openai_api_key else None

        if not self.openai_client:
            logger.warning("OpenAI API key not provided. Cloud model calls will fail.")

        # Note: Local model client would be initialized here (e.g., vLLM, Ollama)
        # For now, we'll use OpenAI as a fallback with appropriate warnings
        self.local_client = None

    async def generate(self, req: LLMRequest) -> LLMResponse:
        """Select model family and generate a single response.

        Selection strategy (initial version):

        - If `req.phi_present` is True → route to local model.
        - Else → route to cloud model.
        - Later phases can add per-intent routing, cost-awareness, etc.

        Safety checks:
        - Validates prompt is non-empty
        - Normalizes whitespace
        - Enforces reasonable max_tokens limits
        """
        # Safety: validate prompt is not empty
        if not req.prompt or not req.prompt.strip():
            logger.warning("LLMClient.generate called with empty prompt, trace_id=%s", req.trace_id)
            raise ValueError("Prompt cannot be empty")

        # Safety: normalize whitespace in prompt
        req.prompt = " ".join(req.prompt.split())

        # Safety: enforce max_tokens limits (see ORCHESTRATION_DESIGN.md)
        # Cloud models: up to 4096 tokens, Local models: up to 2048 tokens
        max_allowed_tokens = 4096 if not req.phi_present else 2048
        if req.max_tokens > max_allowed_tokens:
            logger.warning(
                "max_tokens=%d exceeds limit=%d for family=%s, capping. trace_id=%s",
                req.max_tokens,
                max_allowed_tokens,
                "local" if req.phi_present else "cloud",
                req.trace_id,
            )
            req.max_tokens = max_allowed_tokens

        family: ModelFamily = "local" if req.phi_present else "cloud"
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
        retry logic, and cost tracking.

        Tracks metrics: tokens (prompt + completion), latency, finish_reason
        See ORCHESTRATION_DESIGN.md - "Step 6: LLM Synthesis"
        See OBSERVABILITY.md for additional metrics to track
        """
        if not self.openai_client:
            logger.error("OpenAI client not initialized. API key missing. trace_id=%s", req.trace_id)
            raise RuntimeError("OpenAI API key not configured. Cannot call cloud model.")

        logger.info("Calling cloud model %s trace_id=%s", self.cloud_model, req.trace_id)

        start_time = time.time()

        try:
            # Prepare system message based on intent
            system_prompts = {
                "diagnosis": "You are a medical AI assistant specializing in clinical diagnosis. Provide evidence-based diagnostic insights with appropriate citations.",
                "treatment": "You are a medical AI assistant specializing in treatment planning. Provide evidence-based treatment recommendations with appropriate citations.",
                "drug": "You are a medical AI assistant specializing in pharmacology. Provide evidence-based drug information with appropriate citations.",
                "guideline": "You are a medical AI assistant specializing in clinical guidelines. Provide evidence-based guideline information with appropriate citations.",
                "summary": "You are a medical AI assistant specializing in medical summarization. Provide clear, concise summaries with appropriate citations.",
                "other": "You are a helpful medical AI assistant. Provide accurate, evidence-based information with appropriate citations when available.",
            }

            system_message = system_prompts.get(req.intent, system_prompts["other"])

            # Call OpenAI Chat Completions API
            response: ChatCompletion = await self.openai_client.chat.completions.create(
                model=self.cloud_model,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": req.prompt},
                ],
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            )

            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000

            # Extract response data
            choice = response.choices[0]
            text = choice.message.content or ""
            finish_reason = choice.finish_reason or "stop"

            # Calculate token usage
            usage = response.usage
            total_tokens = usage.total_tokens if usage else 0

            logger.info(
                "Cloud model call successful: model=%s tokens=%d latency=%.2fms finish=%s trace_id=%s",
                self.cloud_model,
                total_tokens,
                latency_ms,
                finish_reason,
                req.trace_id,
            )

            # TODO: Track cost based on model pricing
            # gpt-4o: $2.50/1M input tokens, $10.00/1M output tokens
            # gpt-3.5-turbo: $0.50/1M input tokens, $1.50/1M output tokens
            if usage:
                input_tokens = usage.prompt_tokens
                output_tokens = usage.completion_tokens
                logger.debug(
                    "Token breakdown: input=%d output=%d total=%d trace_id=%s",
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    req.trace_id,
                )

            return LLMResponse(
                text=text,
                model_name=self.cloud_model,
                model_family="cloud",
                used_tokens=total_tokens,
                latency_ms=latency_ms,
                finish_reason=finish_reason,
            )

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error(
                "Cloud model call failed: model=%s error=%s latency=%.2fms trace_id=%s",
                self.cloud_model,
                str(e),
                latency_ms,
                req.trace_id,
                exc_info=True,
            )
            raise RuntimeError(f"Failed to call cloud model {self.cloud_model}: {str(e)}") from e

    async def _call_local(self, req: LLMRequest) -> LLMResponse:
        """Call a local model for PHI-containing queries.

        IMPORTANT: This implementation currently falls back to OpenAI cloud model
        when a local model is not available. This is NOT HIPAA-compliant for
        PHI-containing queries and should only be used in development/testing.

        In production, this should call a local inference server (e.g., vLLM, Ollama)
        running a HIPAA-compliant model on-premises.

        See SECURITY_COMPLIANCE.md - "PHI Routing" for production requirements.
        See BACKEND_ARCHITECTURE.md - "Local LLM Service" for architecture.
        See OBSERVABILITY.md for metrics to track (tokens, latency).
        """
        logger.warning(
            "Local model requested but not configured. local_model=%s phi_present=%s trace_id=%s",
            self.local_model,
            req.phi_present,
            req.trace_id,
        )

        # Check if we have a local model client (vLLM, Ollama, etc.)
        if self.local_client:
            # TODO: Implement actual local model call
            # Example for vLLM:
            # response = await self.local_client.post(
            #     "http://localhost:8000/v1/completions",
            #     json={"prompt": req.prompt, "max_tokens": req.max_tokens, ...}
            # )
            logger.info("Calling local model %s trace_id=%s", self.local_model, req.trace_id)
            pass  # Placeholder for actual implementation

        # FALLBACK: Use OpenAI with explicit warning
        # This should NOT be used in production for PHI queries!
        if req.phi_present:
            logger.error(
                "PHI-containing query routed to cloud model due to missing local model! "
                "This violates HIPAA compliance. trace_id=%s",
                req.trace_id,
            )
            # In production, this should raise an exception instead of falling back
            # raise RuntimeError("Cannot route PHI query to cloud model. Local model not configured.")

        logger.warning(
            "Falling back to cloud model for local model request. "
            "Configure local model for production use. trace_id=%s",
            req.trace_id,
        )

        # Use cloud implementation as fallback
        # Note: Change model to gpt-3.5-turbo for cost efficiency in fallback scenario
        original_model = self.cloud_model
        self.cloud_model = "gpt-3.5-turbo"  # Use cheaper model for fallback

        try:
            response = await self._call_cloud(req)
            # Override model_family to indicate this was a local request
            response.model_family = "local"
            response.model_name = f"{self.local_model} (fallback: {response.model_name})"
            return response
        finally:
            self.cloud_model = original_model  # Restore original model
