"""
Transcript Synchronization Service

Manages transcript-audio synchronization for clean truncation during barge-in.
Tracks word boundaries and provides accurate text cutoff when audio is interrupted.

Features:
- Word boundary estimation based on character position
- Playback position tracking
- Clean truncation at word boundaries
- Transcript history for interrupted responses

Natural Conversation Flow: Phase 1 - Clean Transcript Truncation
Feature Flag: backend.voice_word_timestamps
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Data Classes
# ============================================================================


@dataclass
class WordBoundary:
    """Represents a word's position in the transcript and audio."""

    word: str
    char_start: int  # Character offset in transcript
    char_end: int  # Character end offset
    estimated_start_ms: int  # Estimated audio start time
    estimated_end_ms: int  # Estimated audio end time


@dataclass
class TranscriptChunk:
    """A chunk of transcript with timing information."""

    text: str
    chunk_index: int
    start_ms: int
    end_ms: int
    words: List[WordBoundary] = field(default_factory=list)


@dataclass
class TruncationResult:
    """Result of transcript truncation operation."""

    original_text: str
    truncated_text: str
    truncation_point_ms: int
    last_complete_word: str
    remaining_text: str
    words_spoken: int
    words_remaining: int


@dataclass
class TranscriptSession:
    """Tracks transcript state for a voice session."""

    session_id: str
    full_transcript: str = ""
    chunks: List[TranscriptChunk] = field(default_factory=list)
    total_duration_ms: int = 0
    current_playback_ms: int = 0
    is_interrupted: bool = False
    truncation_result: Optional[TruncationResult] = None


# ============================================================================
# Transcript Sync Service
# ============================================================================


class TranscriptSyncService:
    """
    Manages transcript synchronization with audio playback.

    Provides:
    - Word boundary estimation for text chunks
    - Playback position tracking
    - Clean transcript truncation on barge-in
    - Transcript history management
    """

    # Average speaking rate (words per minute)
    DEFAULT_WPM = 150
    # Average characters per word (for estimation)
    AVG_CHARS_PER_WORD = 5

    def __init__(self):
        self._sessions: Dict[str, TranscriptSession] = {}
        logger.debug("TranscriptSyncService initialized")

    def create_session(self, session_id: str) -> TranscriptSession:
        """Create a new transcript session."""
        session = TranscriptSession(session_id=session_id)
        self._sessions[session_id] = session
        logger.debug(f"[TranscriptSync] Created session {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[TranscriptSession]:
        """Get an existing transcript session."""
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        """Remove a transcript session."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.debug(f"[TranscriptSync] Removed session {session_id}")

    def add_chunk(
        self,
        session_id: str,
        text: str,
        chunk_index: int,
        duration_ms: int,
    ) -> TranscriptChunk:
        """
        Add a text chunk to the session with estimated word boundaries.

        Args:
            session_id: Voice session ID
            text: Text content of the chunk
            chunk_index: Index of this chunk
            duration_ms: Audio duration for this chunk in milliseconds

        Returns:
            TranscriptChunk with word boundaries
        """
        session = self._sessions.get(session_id)
        if not session:
            session = self.create_session(session_id)

        # Calculate start time based on existing chunks
        start_ms = session.total_duration_ms

        # Estimate word boundaries
        words = self._estimate_word_boundaries(
            text=text,
            start_ms=start_ms,
            duration_ms=duration_ms,
            char_offset=len(session.full_transcript),
        )

        chunk = TranscriptChunk(
            text=text,
            chunk_index=chunk_index,
            start_ms=start_ms,
            end_ms=start_ms + duration_ms,
            words=words,
        )

        session.chunks.append(chunk)
        session.full_transcript += text
        session.total_duration_ms += duration_ms

        logger.debug(
            f"[TranscriptSync] Added chunk {chunk_index}: " f"'{text[:30]}...' ({len(words)} words, {duration_ms}ms)"
        )

        return chunk

    def update_playback_position(self, session_id: str, position_ms: int) -> None:
        """Update the current playback position."""
        session = self._sessions.get(session_id)
        if session:
            session.current_playback_ms = position_ms

    def truncate_at_position(
        self,
        session_id: str,
        interrupted_at_ms: int,
    ) -> Optional[TruncationResult]:
        """
        Truncate transcript at the given playback position.

        Finds the last complete word before the interruption point
        and returns clean truncation result.

        Args:
            session_id: Voice session ID
            interrupted_at_ms: Playback position when interrupted

        Returns:
            TruncationResult with clean truncated text
        """
        session = self._sessions.get(session_id)
        if not session:
            logger.warning(f"[TranscriptSync] Session {session_id} not found for truncation")
            return None

        session.is_interrupted = True

        # Find the last complete word before interruption
        last_word, char_position = self._find_last_complete_word(session, interrupted_at_ms)

        if char_position <= 0:
            # No words completed, return empty truncation
            result = TruncationResult(
                original_text=session.full_transcript,
                truncated_text="",
                truncation_point_ms=interrupted_at_ms,
                last_complete_word="",
                remaining_text=session.full_transcript,
                words_spoken=0,
                words_remaining=len(session.full_transcript.split()),
            )
        else:
            truncated = session.full_transcript[:char_position].rstrip()
            remaining = session.full_transcript[char_position:].lstrip()

            result = TruncationResult(
                original_text=session.full_transcript,
                truncated_text=truncated,
                truncation_point_ms=interrupted_at_ms,
                last_complete_word=last_word,
                remaining_text=remaining,
                words_spoken=len(truncated.split()),
                words_remaining=len(remaining.split()) if remaining else 0,
            )

        session.truncation_result = result

        logger.info(
            f"[TranscriptSync] Truncated at {interrupted_at_ms}ms: "
            f"'{result.truncated_text[-50:]}...' | "
            f"Remaining: '{result.remaining_text[:30]}...'"
        )

        return result

    def _estimate_word_boundaries(
        self,
        text: str,
        start_ms: int,
        duration_ms: int,
        char_offset: int,
    ) -> List[WordBoundary]:
        """
        Estimate word boundaries based on character positions.

        Uses proportional timing: each character gets equal time,
        with word boundaries at spaces.
        """
        words = []
        if not text.strip():
            return words

        # Split into words while preserving positions
        word_pattern = re.compile(r"\S+")

        total_chars = len(text)
        if total_chars == 0:
            return words

        ms_per_char = duration_ms / total_chars

        for match in word_pattern.finditer(text):
            word = match.group()
            local_start = match.start()
            local_end = match.end()

            word_start_ms = start_ms + int(local_start * ms_per_char)
            word_end_ms = start_ms + int(local_end * ms_per_char)

            words.append(
                WordBoundary(
                    word=word,
                    char_start=char_offset + local_start,
                    char_end=char_offset + local_end,
                    estimated_start_ms=word_start_ms,
                    estimated_end_ms=word_end_ms,
                )
            )

        return words

    def _find_last_complete_word(
        self,
        session: TranscriptSession,
        position_ms: int,
    ) -> Tuple[str, int]:
        """
        Find the last complete word before the given position.

        Returns:
            Tuple of (last_word, char_end_position)
        """
        last_word = ""
        last_char_end = 0

        for chunk in session.chunks:
            if chunk.start_ms > position_ms:
                break

            for word_boundary in chunk.words:
                # Word must have ended before the interruption
                if word_boundary.estimated_end_ms <= position_ms:
                    last_word = word_boundary.word
                    last_char_end = word_boundary.char_end
                else:
                    # This word wasn't complete
                    break

        return last_word, last_char_end

    def get_truncation_event_data(
        self,
        session_id: str,
    ) -> Optional[Dict]:
        """
        Get data for transcript.truncated WebSocket event.

        Returns:
            Event data dict or None if no truncation occurred
        """
        session = self._sessions.get(session_id)
        if not session or not session.truncation_result:
            return None

        result = session.truncation_result
        return {
            "type": "transcript.truncated",
            "truncated_text": result.truncated_text,
            "remaining_text": result.remaining_text,
            "truncation_point_ms": result.truncation_point_ms,
            "last_complete_word": result.last_complete_word,
            "words_spoken": result.words_spoken,
            "words_remaining": result.words_remaining,
            "timestamp": time.time(),
        }


# ============================================================================
# Singleton Instance
# ============================================================================

transcript_sync_service = TranscriptSyncService()


def get_transcript_sync_service() -> TranscriptSyncService:
    """Get the singleton TranscriptSyncService instance."""
    return transcript_sync_service
