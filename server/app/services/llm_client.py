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
from typing import Dict, Literal, Optional

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ModelFamily = Literal["cloud", "local"]
IntentType = Literal["diagnosis", "treatment", "drug", "guideline", "summary", "other"]

# System prompts by intent type
SYSTEM_PROMPTS: Dict[str, str] = {
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
        "Provide accurate, evidence-based information with appropriate citations."
    ),
}


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
    input_tokens: int = 0
    output_tokens: int = 0


class LLMClient:
    """High-level interface for calling models.

    Routes requests to cloud (OpenAI) or local models based on PHI presence.
    """

    def __init__(
        self,
        cloud_model: Optional[str] = None,
        local_model: Optional[str] = None,
    ) -> None:
        settings = get_settings()

        self.cloud_model = cloud_model or settings.openai_model
        self.local_model = local_model or settings.local_llm_model

        # Initialize OpenAI client for cloud models
        self.openai_client: Optional[AsyncOpenAI] = None
        if settings.openai_api_key:
            self.openai_client = AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.openai_timeout_sec,
            )
        else:
            logger.warning("OpenAI API key not configured. Cloud model calls will fail.")

        # Local model client (OpenAI-compatible endpoint)
        self.local_client: Optional[httpx.AsyncClient] = None
        self.local_llm_url = settings.local_llm_url
        if settings.local_llm_url:
            headers = {}
            if settings.local_llm_api_key:
                headers["Authorization"] = f"Bearer {settings.local_llm_api_key}"
            self.local_client = httpx.AsyncClient(
                base_url=settings.local_llm_url,
                timeout=settings.local_llm_timeout_sec,
                headers=headers or None,
            )
        self.has_local_model = self.local_client is not None

    async def generate(self, req: LLMRequest) -> LLMResponse:
        """Select model family and generate a single response.

        Selection strategy:
        - If `req.phi_present` is True → route to local model.
        - Else → route to cloud model.

        Safety checks:
        - Validates prompt is non-empty
        - Normalizes whitespace
        - Enforces reasonable max_tokens limits
        """
        # Safety: validate prompt is not empty
        if not req.prompt or not req.prompt.strip():
            logger.warning(
                "LLMClient.generate called with empty prompt, trace_id=%s",
                req.trace_id
            )
            raise ValueError("Prompt cannot be empty")

        # Safety: normalize whitespace in prompt
        req.prompt = " ".join(req.prompt.split())

        # Safety: enforce max_tokens limits
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

        # Check if local model is required but not configured
        if req.phi_present and not self.has_local_model:
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
        """Call OpenAI cloud model.

        Uses the official OpenAI client library with proper error handling
        and retry logic.
        """
        if not self.openai_client:
            raise RuntimeError(
                "OpenAI API key not configured. Cannot call cloud model."
            )

        logger.info(
            "Calling cloud model %s trace_id=%s",
            self.cloud_model,
            req.trace_id
        )

        backoff_seconds = [1, 2, 4]
        last_error: Optional[Exception] = None

        for attempt, delay in enumerate(backoff_seconds, start=1):
            start_time = time.time()

            try:
                system_message = SYSTEM_PROMPTS.get(req.intent, SYSTEM_PROMPTS["other"])

                response = await asyncio.wait_for(
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

                latency_ms = (time.time() - start_time) * 1000

                choice = response.choices[0]
                text = choice.message.content or ""
                finish_reason = choice.finish_reason or "stop"

                usage = response.usage
                total_tokens = usage.total_tokens if usage else 0
                input_tokens = usage.prompt_tokens if usage else 0
                output_tokens = usage.completion_tokens if usage else 0

                logger.info(
                    "Cloud model call successful: model=%s tokens=%d "
                    "latency=%.2fms finish=%s trace_id=%s",
                    self.cloud_model,
                    total_tokens,
                    latency_ms,
                    finish_reason,
                    req.trace_id,
                )

                return LLMResponse(
                    text=text,
                    model_name=self.cloud_model,
                    model_family="cloud",
                    used_tokens=total_tokens,
                    latency_ms=latency_ms,
                    finish_reason=finish_reason,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
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
                    "Cloud model call failed (attempt %d): model=%s error=%s "
                    "latency=%.2fms trace_id=%s",
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
        """Call local model via OpenAI-compatible API.

        Supports vLLM, Ollama, LMStudio, and other OpenAI-compatible servers.
        """
        if not self.has_local_model or not self.local_client:
            raise RuntimeError("Local model requested but not configured")

        logger.info(
            "Calling local model %s trace_id=%s",
            self.local_model,
            req.trace_id
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
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            latency_ms = (time.time() - start_time) * 1000

            logger.info(
                "Local model call successful: model=%s tokens=%d "
                "latency=%.2fms finish=%s trace_id=%s",
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
                input_tokens=input_tokens,
                output_tokens=output_tokens,
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
