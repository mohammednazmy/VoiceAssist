"""
Speculative Execution Service

Starts generating LLM responses before the user finishes speaking,
based on partial transcripts. If the final transcript matches,
we've saved significant latency. If it diverges, we cancel and restart.

Phase 3: Latency Optimizations
Feature Flag: backend.voice_speculative_continuation
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Types
# ==============================================================================


class SpeculationState(str, Enum):
    """State of speculative execution."""

    IDLE = "idle"
    SPECULATING = "speculating"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


@dataclass
class SpeculativeResult:
    """Result of speculative execution."""

    state: SpeculationState
    partial_response: str
    tokens_generated: int
    latency_saved_ms: float
    was_useful: bool  # True if speculation matched final input


@dataclass
class SpeculationConfig:
    """Configuration for speculative execution."""

    # Minimum transcript length to start speculation
    min_transcript_length: int = 15

    # Confidence threshold for starting speculation
    confidence_threshold: float = 0.7

    # Maximum tokens to generate speculatively
    max_speculative_tokens: int = 50

    # Cancel speculation if input diverges by this much (0-1)
    divergence_threshold: float = 0.3

    # How often to check for input updates (ms)
    check_interval_ms: int = 50

    # Minimum silence duration before starting speculation (ms)
    min_silence_before_speculation_ms: int = 200


@dataclass
class SpeculationMetrics:
    """Metrics for speculation performance tracking."""

    total_speculations: int = 0
    useful_speculations: int = 0
    cancelled_speculations: int = 0
    total_latency_saved_ms: float = 0
    avg_tokens_generated: float = 0

    @property
    def hit_rate(self) -> float:
        """Return the percentage of useful speculations."""
        if self.total_speculations == 0:
            return 0.0
        return self.useful_speculations / self.total_speculations


# ==============================================================================
# Speculative Execution Service
# ==============================================================================


class SpeculativeExecutionService:
    """
    Speculative execution for LLM responses.

    Starts generating responses before the user finishes speaking,
    based on partial transcripts. If the final transcript matches,
    we've saved significant latency. If it diverges, we cancel and restart.

    Usage:
        from app.services.speculative_execution_service import (
            speculative_execution_service,
            SpeculationConfig,
        )

        # Start speculation on partial transcript
        await speculative_execution_service.start_speculation(
            partial_transcript="Tell me about diabetes",
            session_id="session-123",
            on_token=lambda token: print(token),
        )

        # Update with new partial transcript
        if not speculative_execution_service.update_transcript("Tell me about diabetes treatment"):
            # Diverged too much, speculation cancelled
            pass

        # Confirm with final transcript
        result = speculative_execution_service.confirm("Tell me about diabetes treatment options")
        if result.was_useful:
            print(f"Saved {result.latency_saved_ms}ms!")
            print(f"Partial response: {result.partial_response}")
    """

    def __init__(self, config: Optional[SpeculationConfig] = None):
        self.config = config or SpeculationConfig()
        self._current_speculation: Optional[asyncio.Task] = None
        self._speculation_transcript: str = ""
        self._speculative_tokens: List[str] = []
        self._state = SpeculationState.IDLE
        self._start_time: float = 0
        self._session_id: str = ""
        self._metrics = SpeculationMetrics()

        # Callback for token streaming
        self._on_token_callback: Optional[Callable[[str], None]] = None

    # ==========================================================================
    # Public API
    # ==========================================================================

    async def start_speculation(
        self,
        partial_transcript: str,
        session_id: str,
        on_token: Optional[Callable[[str], None]] = None,
        turn_completion_confidence: float = 0.0,
    ) -> None:
        """
        Start speculative response generation.

        Args:
            partial_transcript: Current partial transcript from STT
            session_id: Session ID for context
            on_token: Callback for each generated token (optional)
            turn_completion_confidence: Semantic VAD confidence (0-1)
        """
        # Don't start if transcript is too short
        if len(partial_transcript) < self.config.min_transcript_length:
            logger.debug(
                f"[Speculative] Transcript too short ({len(partial_transcript)} chars), skipping"
            )
            return

        # Don't start if confidence is too low
        if turn_completion_confidence < self.config.confidence_threshold:
            logger.debug(
                f"[Speculative] Confidence too low ({turn_completion_confidence:.2f}), skipping"
            )
            return

        # Cancel any existing speculation
        if self._current_speculation and not self._current_speculation.done():
            self._current_speculation.cancel()
            try:
                await self._current_speculation
            except asyncio.CancelledError:
                pass

        self._speculation_transcript = partial_transcript
        self._speculative_tokens = []
        self._state = SpeculationState.SPECULATING
        self._start_time = time.time()
        self._session_id = session_id
        self._on_token_callback = on_token
        self._metrics.total_speculations += 1

        logger.info(f"[Speculative] Starting speculation on: '{partial_transcript[:50]}...'")

        # Start speculative generation in background
        self._current_speculation = asyncio.create_task(
            self._run_speculation(partial_transcript, session_id)
        )

    def update_transcript(self, new_transcript: str) -> bool:
        """
        Update with new transcript and check if speculation is still valid.

        Returns True if speculation should continue, False if it should cancel.
        """
        if self._state != SpeculationState.SPECULATING:
            return False

        divergence = self.check_divergence(new_transcript)

        if divergence > self.config.divergence_threshold:
            logger.info(f"[Speculative] Divergence too high ({divergence:.2f}), cancelling")
            self.cancel()
            return False

        # Update transcript for continued speculation
        self._speculation_transcript = new_transcript
        return True

    def check_divergence(self, new_transcript: str) -> float:
        """
        Check how much the new transcript diverges from speculation.

        Returns divergence score (0 = identical, 1 = completely different)
        """
        if not self._speculation_transcript:
            return 1.0

        # Simple character-level comparison
        old = self._speculation_transcript.lower().strip()
        new = new_transcript.lower().strip()

        # Check if new transcript starts with old (user is still speaking)
        if new.startswith(old):
            return 0.0

        # Check if old transcript starts with new (backtracking)
        if old.startswith(new):
            # Some backtracking is okay
            return 0.1

        # Check overlap
        min_len = min(len(old), len(new))
        if min_len == 0:
            return 1.0

        matches = sum(1 for i in range(min_len) if old[i] == new[i])
        return 1.0 - (matches / min_len)

    def confirm(self, final_transcript: str) -> SpeculativeResult:
        """
        Confirm speculation with final transcript.

        Returns result indicating if speculation was useful.
        """
        divergence = self.check_divergence(final_transcript)
        was_useful = divergence <= self.config.divergence_threshold

        elapsed_ms = (time.time() - self._start_time) * 1000
        latency_saved = elapsed_ms if was_useful else 0

        self._state = SpeculationState.CONFIRMED if was_useful else SpeculationState.CANCELLED

        result = SpeculativeResult(
            state=self._state,
            partial_response="".join(self._speculative_tokens),
            tokens_generated=len(self._speculative_tokens),
            latency_saved_ms=latency_saved,
            was_useful=was_useful,
        )

        # Update metrics
        if was_useful:
            self._metrics.useful_speculations += 1
            self._metrics.total_latency_saved_ms += latency_saved
        else:
            self._metrics.cancelled_speculations += 1

        # Update average tokens
        total_tokens = sum(
            [
                self._metrics.avg_tokens_generated
                * (self._metrics.total_speculations - 1),
                result.tokens_generated,
            ]
        )
        if self._metrics.total_speculations > 0:
            self._metrics.avg_tokens_generated = total_tokens / self._metrics.total_speculations

        logger.info(
            f"[Speculative] Confirmed: useful={was_useful}, "
            f"tokens={result.tokens_generated}, saved={latency_saved:.0f}ms"
        )

        return result

    def cancel(self) -> None:
        """Cancel current speculation."""
        self._state = SpeculationState.CANCELLED
        if self._current_speculation and not self._current_speculation.done():
            self._current_speculation.cancel()
        self._speculative_tokens = []
        self._metrics.cancelled_speculations += 1
        logger.info("[Speculative] Speculation cancelled")

    def get_speculative_response(self) -> str:
        """Get the current speculative response."""
        return "".join(self._speculative_tokens)

    def get_metrics(self) -> SpeculationMetrics:
        """Get speculation metrics."""
        return self._metrics

    def reset_metrics(self) -> None:
        """Reset speculation metrics."""
        self._metrics = SpeculationMetrics()

    @property
    def is_speculating(self) -> bool:
        """Check if currently speculating."""
        return self._state == SpeculationState.SPECULATING

    @property
    def state(self) -> SpeculationState:
        """Get current speculation state."""
        return self._state

    # ==========================================================================
    # Internal
    # ==========================================================================

    async def _run_speculation(self, transcript: str, session_id: str) -> None:
        """Run the speculative generation."""
        try:
            # Import here to avoid circular imports
            from app.services.thinker_service import ThinkerService

            # Create a new thinking session for speculation
            thinker_session = ThinkerService()
            thinker_session.set_conversation_id(f"speculative-{session_id}")

            # Use shorter system prompt for speculation
            thinker_session.set_system_prompt(
                "You are a helpful voice assistant. Respond concisely and naturally."
            )

            logger.debug(f"[Speculative] Running LLM generation for: '{transcript[:50]}...'")

            # Generate response
            response = await thinker_session.think(
                user_input=transcript,
                source_mode="voice",
            )

            if self._state == SpeculationState.CANCELLED:
                logger.info("[Speculative] Cancelled - stopping generation")
                return

            # Extract tokens from response
            if response.text:
                tokens = response.text.split()
                for i, token in enumerate(tokens):
                    if self._state == SpeculationState.CANCELLED:
                        return

                    self._speculative_tokens.append(token + " ")

                    if self._on_token_callback:
                        self._on_token_callback(token + " ")

                    # Stop if we've generated enough speculative tokens
                    if i >= self.config.max_speculative_tokens:
                        logger.info(f"[Speculative] Reached max tokens ({i + 1})")
                        break

            logger.info(
                f"[Speculative] Generation complete: {len(self._speculative_tokens)} tokens"
            )

        except asyncio.CancelledError:
            logger.info("[Speculative] Task cancelled")
            self._state = SpeculationState.CANCELLED
        except Exception as e:
            logger.error(f"[Speculative] Error during speculation: {e}")
            self._state = SpeculationState.CANCELLED


# ==============================================================================
# Factory and Singleton
# ==============================================================================


def create_speculative_execution_service(
    config: Optional[SpeculationConfig] = None,
) -> SpeculativeExecutionService:
    """Create a new speculative execution service instance."""
    return SpeculativeExecutionService(config)


# Global singleton (created on first import)
speculative_execution_service = SpeculativeExecutionService()


def get_speculative_execution_service() -> SpeculativeExecutionService:
    """Get the global speculative execution service instance."""
    return speculative_execution_service
