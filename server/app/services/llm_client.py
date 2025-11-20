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

import logging

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
    ) -> None:
        self.cloud_model = cloud_model
        self.local_model = local_model

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
        """Call a cloud model (stub implementation).

        In later phases this should use the official OpenAI client library
        or equivalent, configured via Settings (see core.config).

        TODO: Replace with real OpenAI/OpenAI-compatible call.
        See ORCHESTRATION_DESIGN.md - "Step 6: LLM Synthesis" for full implementation.
        See OBSERVABILITY.md for metrics to track (tokens, latency, cost).
        """
        logger.info("Calling cloud model %s (stub) trace_id=%s", self.cloud_model, req.trace_id)
        return LLMResponse(
            text=f"[CLOUD MODEL STUB: {self.cloud_model}] {req.prompt}",
            model_name=self.cloud_model,
            model_family="cloud",
            used_tokens=len(req.prompt.split()),
            latency_ms=42.0,
            finish_reason="stop",
        )

    async def _call_local(self, req: LLMRequest) -> LLMResponse:
        """Call a local model (stub implementation).

        In later phases this might call an HTTP endpoint (e.g., vLLM, Ollama)
        or use a local Python inference server.

        TODO: Replace with real local LLM call.
        See SECURITY_COMPLIANCE.md - "PHI Routing" for requirements.
        See BACKEND_ARCHITECTURE.md - "Local LLM Service" for architecture.
        See OBSERVABILITY.md for metrics to track (tokens, latency).
        """
        logger.info("Calling local model %s (stub) trace_id=%s", self.local_model, req.trace_id)
        return LLMResponse(
            text=f"[LOCAL MODEL STUB: {self.local_model}] {req.prompt}",
            model_name=self.local_model,
            model_family="local",
            used_tokens=len(req.prompt.split()),
            latency_ms=12.0,
            finish_reason="stop",
        )
