"""Model adapter registry for specialized biomedical models.

The registry exposes configuration-driven adapters for domain-specific
models (e.g., BioGPT, PubMedBERT) so the orchestrator can surface
model provenance and selection metadata in responses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from app.core.config import settings


@dataclass
class ModelAdapter:
    """Adapter metadata for a model option."""

    key: str
    model_id: str
    provider: str
    enabled: bool
    description: str
    specialization: Optional[str] = None
    context_window: int = 4096
    supports_streaming: bool = True
    confidence: float = 0.8


class ModelAdapterRegistry:
    """Registry for configurable biomedical model adapters."""

    def __init__(
        self,
        pubmedbert_enabled: Optional[bool] = None,
        biogpt_enabled: Optional[bool] = None,
    ) -> None:
        self._adapters: Dict[str, ModelAdapter] = {}

        pubmedbert_id = settings.PUBMEDBERT_MODEL_ID or "microsoft/BiomedNLP-PubMedBERT"
        biogpt_id = settings.BIOGPT_MODEL_ID or "microsoft/biogpt"

        self._adapters["pubmedbert"] = ModelAdapter(
            key="pubmedbert",
            model_id=pubmedbert_id,
            provider="hf-local",
            enabled=settings.ENABLE_PUBMEDBERT_ADAPTER if pubmedbert_enabled is None else pubmedbert_enabled,
            description="PubMedBERT encoder for biomedical literature grounding",
            specialization="research",
            context_window=2048,
            supports_streaming=False,
            confidence=0.82,
        )

        self._adapters["biogpt"] = ModelAdapter(
            key="biogpt",
            model_id=biogpt_id,
            provider="hf-local",
            enabled=settings.ENABLE_BIOGPT_ADAPTER if biogpt_enabled is None else biogpt_enabled,
            description="BioGPT generator for clinical summarization and reasoning",
            specialization="clinical",
            context_window=4096,
            supports_streaming=False,
            confidence=0.86,
        )

        # Default cloud model entry to expose in metadata
        self._adapters["default"] = ModelAdapter(
            key="default",
            model_id=settings.MODEL_SELECTION_DEFAULT,
            provider="openai",
            enabled=True,
            description="Default cloud model for general-purpose reasoning",
            specialization="general",
            context_window=8192,
            supports_streaming=True,
            confidence=0.75,
        )

    def available(self) -> List[ModelAdapter]:
        """Return all enabled adapters."""

        return [adapter for adapter in self._adapters.values() if adapter.enabled]

    def get(self, key: str) -> Optional[ModelAdapter]:
        return self._adapters.get(key)

    def select_for_intent(self, intent: str) -> ModelAdapter:
        """Select the most appropriate adapter for a given intent."""

        if intent in {"diagnosis", "treatment", "drug"} and self._adapters["biogpt"].enabled:
            return self._adapters["biogpt"]
        if intent in {"guideline", "summary", "research"} and self._adapters["pubmedbert"].enabled:
            return self._adapters["pubmedbert"]
        return self._adapters["default"]

