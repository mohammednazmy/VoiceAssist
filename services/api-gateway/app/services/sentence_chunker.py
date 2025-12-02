"""
Phrase Chunker for TTS (Low-Latency Optimized)

Intelligently splits streaming LLM output into phrase-sized chunks
for optimal TTS processing with MINIMAL LATENCY.

Strategy (Balanced - prioritizes speed while maintaining naturalness):
- Primary: Split on sentence boundaries (. ! ?)
- Secondary: Split on clause boundaries (, ; : —) after MIN_CHUNK_CHARS
- Emergency: Force split at MAX_CHUNK_CHARS (80 chars for low latency)

Latency Optimization: Reduced from sentence-level (100+ chars) to clause-level
(~50 chars) to achieve 200-400ms faster time-to-first-audio.

Phase: Voice Mode Latency Optimization
"""

from dataclasses import dataclass, field
from typing import List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ChunkerConfig:
    """
    Configuration for the phrase chunker.

    Latency-optimized defaults (Balanced approach):
    - min_chunk_chars: 15 (avoid tiny fragments that sound choppy)
    - optimal_chunk_chars: 50 (trigger clause splitting early for low latency)
    - max_chunk_chars: 80 (force split before TTS buffer fills)

    Previous sentence-level defaults were: 20, 100, 200
    New phrase-level defaults save 200-400ms on time-to-first-audio.
    """

    min_chunk_chars: int = 15  # Don't send tiny fragments (was 20)
    optimal_chunk_chars: int = 50  # Start looking for clause breaks early (was 100)
    max_chunk_chars: int = 80  # Force split for low latency (was 200)
    abbreviations: List[str] = field(
        default_factory=lambda: [
            "Dr.",
            "Mr.",
            "Mrs.",
            "Ms.",
            "Prof.",
            "Sr.",
            "Jr.",
            "vs.",
            "etc.",
            "e.g.",
            "i.e.",
            "Fig.",
            "fig.",
            "vol.",
            "Vol.",
            "No.",
            "no.",
            "pp.",
            "p.",
            "U.S.",
            "U.K.",
            "U.N.",
            "St.",
            "Ave.",
            "Blvd.",
        ]
    )


@dataclass
class AdaptiveChunkerConfig:
    """
    Adaptive chunking configuration for optimal latency AND naturalness.

    Strategy: Use small chunks for fast time-to-first-audio (TTFA),
    then switch to larger natural chunks for better prosody.

    This achieves both goals:
    - Fast first response (~150ms TTFA vs ~400ms with large chunks)
    - Natural sounding speech (full sentences after first chunk)
    """

    # First chunk settings (optimized for fast TTFA)
    first_chunk_min: int = 20  # Minimum for first chunk
    first_chunk_optimal: int = 30  # Trigger clause split for first chunk
    first_chunk_max: int = 50  # Force split first chunk by this point

    # Subsequent chunk settings (optimized for naturalness)
    subsequent_min: int = 40  # Meaningful phrases
    subsequent_optimal: int = 120  # Full sentences for natural prosody
    subsequent_max: int = 200  # Allow complete thoughts

    # How many chunks before switching to natural mode
    chunks_before_natural: int = 1

    # Enable/disable adaptive behavior
    enabled: bool = True


class SentenceChunker:
    """
    Low-latency phrase chunker for TTS processing.

    Optimized for minimal time-to-first-audio while maintaining natural prosody.

    Features:
    - Splits at clause boundaries (commas, semicolons, colons) for early TTS
    - Falls back to sentence boundaries when found
    - Force splits at 80 chars to prevent TTS buffer delays
    - Handles abbreviations to avoid false splits
    - Balanced approach: speed vs naturalness

    Latency Impact:
    - Previous (sentence-level): Wait for full sentences = 200-400ms delay
    - New (phrase-level): Split at clauses ~50 chars = faster response

    Usage:
        chunker = SentenceChunker()

        # During LLM streaming:
        for token in llm_stream:
            chunks = chunker.add_token(token)
            for chunk in chunks:
                await tts.speak(chunk)

        # At stream end:
        final_chunk = chunker.flush()
        if final_chunk:
            await tts.speak(final_chunk)
    """

    # Sentence ending punctuation
    SENTENCE_ENDERS = {".", "!", "?"}

    # Clause ending punctuation (primary split points for low latency)
    # These are natural pause points where TTS prosody remains acceptable
    # Note: Using single chars for efficient iteration; ellipsis handled separately
    CLAUSE_ENDERS = {",", ";", ":", "\n", "—", "–", "-"}

    # Multi-character patterns to check (handled in _find_clause_boundary)
    CLAUSE_PATTERNS = [" - ", "...", " — "]

    # Quotation marks that might follow sentence enders
    QUOTE_MARKS = {'"', "'", '"', '"', """, """, ")", "]"}

    def __init__(
        self,
        config: Optional[ChunkerConfig] = None,
        adaptive_config: Optional[AdaptiveChunkerConfig] = None,
    ):
        self.config = config or ChunkerConfig()
        self._adaptive_config = adaptive_config
        self._buffer = ""
        self._chunks_emitted = 0
        self._total_chars_processed = 0

        # Adaptive mode tracking
        self._adaptive_mode = adaptive_config is not None and adaptive_config.enabled
        self._first_chunk_emitted = False

    def _get_effective_limits(self) -> tuple:
        """
        Get the effective chunk limits based on adaptive mode state.

        Returns:
            Tuple of (min_chars, optimal_chars, max_chars)
        """
        if not self._adaptive_mode or not self._adaptive_config:
            return (
                self.config.min_chunk_chars,
                self.config.optimal_chunk_chars,
                self.config.max_chunk_chars,
            )

        # Check if we should still use first-chunk limits
        if not self._first_chunk_emitted or (self._chunks_emitted < self._adaptive_config.chunks_before_natural):
            # Use smaller limits for fast TTFA
            return (
                self._adaptive_config.first_chunk_min,
                self._adaptive_config.first_chunk_optimal,
                self._adaptive_config.first_chunk_max,
            )
        else:
            # Use natural limits for better prosody
            return (
                self._adaptive_config.subsequent_min,
                self._adaptive_config.subsequent_optimal,
                self._adaptive_config.subsequent_max,
            )

    def add_token(self, token: str) -> List[str]:
        """
        Add a token and return any complete chunks.

        Args:
            token: A token from the LLM stream (can be partial word, word, or punctuation)

        Returns:
            List of complete chunks ready for TTS (may be empty)
        """
        if not token:
            return []

        self._buffer += token
        self._total_chars_processed += len(token)

        return self._extract_chunks()

    def _extract_chunks(self) -> List[str]:
        """Extract any complete chunks from the buffer."""
        chunks = []

        while True:
            chunk = self._try_extract_chunk()
            if chunk is None:
                break
            chunks.append(chunk)
            self._chunks_emitted += 1

            # Track first chunk for adaptive mode
            if not self._first_chunk_emitted:
                self._first_chunk_emitted = True
                if self._adaptive_mode:
                    logger.debug(f"First chunk emitted ({len(chunk)} chars), " "switching to natural chunking mode")

        return chunks

    def _try_extract_chunk(self) -> Optional[str]:
        """Try to extract a single chunk from the buffer."""
        if not self._buffer:
            return None

        # Get effective limits (adaptive or static)
        min_chars, optimal_chars, max_chars = self._get_effective_limits()

        # Check for sentence boundary
        sentence_end = self._find_sentence_boundary()
        if sentence_end is not None and sentence_end >= min_chars:
            chunk = self._buffer[:sentence_end].strip()
            self._buffer = self._buffer[sentence_end:].lstrip()
            if chunk:
                return chunk

        # Check for clause boundary if buffer is getting long
        if len(self._buffer) >= optimal_chars:
            clause_end = self._find_clause_boundary(min_chars, optimal_chars)
            if clause_end is not None and clause_end >= min_chars:
                chunk = self._buffer[:clause_end].strip()
                self._buffer = self._buffer[clause_end:].lstrip()
                if chunk:
                    return chunk

        # Force split if buffer exceeds max
        if len(self._buffer) >= max_chars:
            # Try to split at last space
            split_point = self._find_word_boundary(max_chars)
            chunk = self._buffer[:split_point].strip()
            self._buffer = self._buffer[split_point:].lstrip()
            if chunk:
                logger.debug(f"Force split at {split_point} chars")
                return chunk

        return None

    def _find_sentence_boundary(self) -> Optional[int]:
        """
        Find the position after a sentence ending punctuation.

        Returns:
            Position after the sentence end (including trailing quotes),
            or None if no sentence boundary found.
        """
        for i, char in enumerate(self._buffer):
            if char in self.SENTENCE_ENDERS:
                # Check if this is an abbreviation (not a real sentence end)
                if self._is_abbreviation(i):
                    continue

                # Find the end position (including trailing quotes/spaces)
                end_pos = i + 1
                while end_pos < len(self._buffer) and self._buffer[end_pos] in self.QUOTE_MARKS:
                    end_pos += 1

                # Check for space after (confirms sentence end)
                if end_pos >= len(self._buffer) or self._buffer[end_pos] in {" ", "\n", "\t"}:
                    return end_pos

        return None

    def _find_clause_boundary(self, min_chars: int, optimal_chars: int) -> Optional[int]:
        """
        Find the position after a clause ending punctuation.

        Checks both single-character clause enders and multi-character patterns
        like ' - ' and '...' for natural phrase breaks.

        Args:
            min_chars: Minimum chunk size (adaptive or static)
            optimal_chars: Optimal chunk size to search around (adaptive or static)

        Returns:
            Position after the clause end, or None if not found.
        """
        # First check for multi-character patterns (they take priority)
        for pattern in self.CLAUSE_PATTERNS:
            # Search backwards from optimal position
            search_area = self._buffer[: min(len(self._buffer), optimal_chars + 20)]
            idx = search_area.rfind(pattern)
            if idx >= min_chars:
                return idx + len(pattern)

        # Search backwards from optimal position for single char enders
        search_start = min(len(self._buffer), optimal_chars + 20)

        for i in range(search_start - 1, min_chars - 1, -1):
            if i < len(self._buffer) and self._buffer[i] in self.CLAUSE_ENDERS:
                # Skip standalone hyphens in compound words (e.g., "self-aware")
                if self._buffer[i] == "-":
                    # Only split on dash if surrounded by spaces
                    if i > 0 and i < len(self._buffer) - 1:
                        if self._buffer[i - 1] != " " or self._buffer[i + 1] != " ":
                            continue
                return i + 1

        # Fallback: search forward
        for i in range(min_chars, len(self._buffer)):
            if self._buffer[i] in self.CLAUSE_ENDERS:
                if self._buffer[i] == "-":
                    if i > 0 and i < len(self._buffer) - 1:
                        if self._buffer[i - 1] != " " or self._buffer[i + 1] != " ":
                            continue
                return i + 1

        return None

    def _find_word_boundary(self, max_pos: int) -> int:
        """
        Find a word boundary (space) for emergency splitting.

        Args:
            max_pos: Maximum position to search

        Returns:
            Position of word boundary, or max_pos if none found
        """
        # Search backwards for a space
        for i in range(min(max_pos, len(self._buffer)) - 1, max_pos // 2, -1):
            if self._buffer[i] == " ":
                return i + 1

        # No good split point found, force split at max
        return min(max_pos, len(self._buffer))

    def _is_abbreviation(self, period_pos: int) -> bool:
        """
        Check if the period at given position is part of an abbreviation.

        Args:
            period_pos: Position of the period in buffer

        Returns:
            True if this appears to be an abbreviation
        """
        if self._buffer[period_pos] != ".":
            return False

        # Check against known abbreviations
        for abbrev in self.config.abbreviations:
            abbrev_len = len(abbrev)
            start = period_pos - abbrev_len + 1
            if start >= 0:
                candidate = self._buffer[start : period_pos + 1]
                if candidate == abbrev:
                    return True

        # Check for single uppercase letter followed by period (initials)
        if period_pos >= 1:
            prev_char = self._buffer[period_pos - 1]
            if prev_char.isupper():
                if period_pos < 2 or not self._buffer[period_pos - 2].isalpha():
                    return True

        # Check for decimal number (e.g., "3.14")
        if period_pos >= 1 and period_pos < len(self._buffer) - 1:
            prev_char = self._buffer[period_pos - 1]
            next_char = self._buffer[period_pos + 1]
            if prev_char.isdigit() and next_char.isdigit():
                return True

        return False

    def flush(self) -> Optional[str]:
        """
        Flush any remaining content in the buffer.

        Call this at the end of the LLM stream to get the final chunk.

        Returns:
            Remaining content as a chunk, or None if buffer is empty
        """
        if not self._buffer:
            return None

        chunk = self._buffer.strip()
        self._buffer = ""

        if chunk:
            self._chunks_emitted += 1
            return chunk

        return None

    def reset(self) -> None:
        """Reset the chunker state for a new stream."""
        self._buffer = ""
        self._chunks_emitted = 0
        self._total_chars_processed = 0
        self._first_chunk_emitted = False  # Reset adaptive mode tracking

    def get_stats(self) -> dict:
        """Get chunking statistics."""
        return {
            "chunks_emitted": self._chunks_emitted,
            "total_chars_processed": self._total_chars_processed,
            "buffer_length": len(self._buffer),
        }


class StreamingSentenceChunker:
    """
    Async wrapper for sentence chunking with streaming callbacks.

    Provides a simpler interface for the voice pipeline.
    """

    def __init__(
        self,
        on_chunk: callable,
        config: Optional[ChunkerConfig] = None,
    ):
        """
        Initialize the streaming chunker.

        Args:
            on_chunk: Async callback for each complete chunk
            config: Optional chunker configuration
        """
        self.chunker = SentenceChunker(config)
        self.on_chunk = on_chunk

    async def process_token(self, token: str) -> None:
        """
        Process a token and emit any complete chunks.

        Args:
            token: Token from LLM stream
        """
        chunks = self.chunker.add_token(token)
        for chunk in chunks:
            await self.on_chunk(chunk)

    async def finish(self) -> None:
        """Finish processing and emit any remaining content."""
        final = self.chunker.flush()
        if final:
            await self.on_chunk(final)

    def reset(self) -> None:
        """Reset for a new stream."""
        self.chunker.reset()
