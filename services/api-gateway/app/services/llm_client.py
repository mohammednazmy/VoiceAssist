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
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

import httpx
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
            logger.warning(
                "LLMClient.generate called with empty prompt, trace_id=%s", req.trace_id
            )
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
        if req.phi_present and not self.has_local_model:
            # Defensive: callers should not route PHI here without a local model
            raise RuntimeError("PHI present but no local LLM configured")
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
            logger.error(
                "OpenAI client not initialized. API key missing. trace_id=%s",
                req.trace_id,
            )
            raise RuntimeError(
                "OpenAI API key not configured. Cannot call cloud model."
            )

        logger.info(
            "Calling cloud model %s trace_id=%s", self.cloud_model, req.trace_id
        )

        backoff_seconds = [1, 2, 4]
        last_error: Optional[Exception] = None

        for attempt, delay in enumerate(backoff_seconds, start=1):
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

                # Call OpenAI Chat Completions API with timeout
                response: ChatCompletion = await asyncio.wait_for(
                    self.openai_client.chat.completions.create(
                        model=self.cloud_model,
                        messages=[
                            {"role": "system", "content": system_message},
                            {"role": "user", "content": req.prompt},
                        ],
                        temperature=req.temperature,
                        max_tokens=req.max_tokens,
                    ),
                    timeout=30,
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

            except asyncio.TimeoutError as exc:
                last_error = exc
                logger.error(
                    "Cloud model call timed out (attempt %d) model=%s trace_id=%s",
                    attempt,
                    self.cloud_model,
                    req.trace_id,
                )
            except Exception as e:
                last_error = e
                latency_ms = (time.time() - start_time) * 1000
                logger.error(
                    "Cloud model call failed (attempt %d): model=%s error=%s latency=%.2fms trace_id=%s",
                    attempt,
                    self.cloud_model,
                    str(e),
                    latency_ms,
                    req.trace_id,
                    exc_info=True,
                )

            await asyncio.sleep(delay)

        raise RuntimeError(
            f"Failed to call cloud model {self.cloud_model} after retries: {last_error}"
        ) from last_error

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

        logger.info(
            "Calling local model %s trace_id=%s", self.local_model, req.trace_id
        )

        start_time = time.time()
        try:
            response = await self.local_client.post(
                "/v1/chat/completions",
                json={
                    "model": self.local_model,
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
                self.local_model,
                total_tokens,
                latency_ms,
                finish_reason,
                req.trace_id,
            )

            return LLMResponse(
                text=text,
                model_name=self.local_model,
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
