"""
Dictation Service - Medical Documentation Dictation

Phase 8: Hands-free clinical documentation system.

This service manages medical dictation sessions including:
- SOAP, H&P, Progress, and Procedure note types
- Section-based navigation (Subjective, Objective, Assessment, Plan)
- Real-time transcription with medical vocabulary boosting
- Voice command integration for hands-free editing
- LLM-assisted formatting and grammar correction

Note Types Supported:
- SOAP: Subjective, Objective, Assessment, Plan
- H&P: History and Physical
- Progress: Progress Note
- Procedure: Procedure Note
- Custom: User-defined templates
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums
# ==============================================================================


class DictationState(str, Enum):
    """State of the dictation session."""

    IDLE = "idle"  # Not actively dictating
    LISTENING = "listening"  # Actively capturing audio
    PROCESSING = "processing"  # Processing/formatting transcription
    PAUSED = "paused"  # Temporarily paused by user
    REVIEWING = "reviewing"  # User is reviewing/editing the note
    SAVING = "saving"  # Saving the note
    COMPLETED = "completed"  # Dictation finished and saved


class NoteType(str, Enum):
    """Types of medical notes."""

    SOAP = "soap"  # Subjective, Objective, Assessment, Plan
    HP = "h_and_p"  # History and Physical
    PROGRESS = "progress"  # Progress Note
    PROCEDURE = "procedure"  # Procedure Note
    CONSULT = "consult"  # Consultation Note
    DISCHARGE = "discharge"  # Discharge Summary
    CUSTOM = "custom"  # User-defined template


class NoteSection(str, Enum):
    """Sections within notes (primarily for SOAP notes)."""

    # SOAP sections
    SUBJECTIVE = "subjective"
    OBJECTIVE = "objective"
    ASSESSMENT = "assessment"
    PLAN = "plan"

    # H&P sections
    CHIEF_COMPLAINT = "chief_complaint"
    HPI = "history_present_illness"
    PMH = "past_medical_history"
    MEDICATIONS = "medications"
    ALLERGIES = "allergies"
    SOCIAL_HISTORY = "social_history"
    FAMILY_HISTORY = "family_history"
    ROS = "review_of_systems"
    PHYSICAL_EXAM = "physical_exam"
    LABS = "labs_imaging"
    IMPRESSION = "impression"

    # General sections
    NOTES = "notes"
    CUSTOM = "custom"


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class NoteSectionContent:
    """Content for a single section of a note."""

    section: NoteSection
    content: str = ""
    raw_transcript: str = ""  # Original unformatted transcript
    word_count: int = 0
    last_updated: float = field(default_factory=time.time)
    is_complete: bool = False


@dataclass
class DictationNote:
    """A complete medical dictation note."""

    note_id: str
    note_type: NoteType
    user_id: str
    patient_context: Optional[str] = None  # Anonymized patient identifier

    # Content
    sections: Dict[NoteSection, NoteSectionContent] = field(default_factory=dict)
    current_section: NoteSection = NoteSection.SUBJECTIVE

    # Metadata
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    total_word_count: int = 0
    duration_seconds: int = 0

    # Status
    is_draft: bool = True
    is_saved: bool = False


@dataclass
class DictationSessionConfig:
    """Configuration for a dictation session."""

    note_type: NoteType = NoteType.SOAP
    language: str = "en"
    specialty: Optional[str] = None  # e.g., "cardiology", "oncology"
    auto_punctuate: bool = True
    auto_format: bool = True
    enable_commands: bool = True
    patient_context: Optional[str] = None


@dataclass
class DictationEvent:
    """Event emitted during dictation."""

    event_type: str  # "state_change", "section_update", "command", "error"
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


# ==============================================================================
# Dictation Session
# ==============================================================================


class DictationSession:
    """
    A single dictation session for creating a medical note.

    Manages:
    - State transitions (listening, paused, reviewing, etc.)
    - Section-based content accumulation
    - Voice command processing
    - Event emission for real-time updates
    """

    # Section order for different note types
    SECTION_ORDER = {
        NoteType.SOAP: [
            NoteSection.SUBJECTIVE,
            NoteSection.OBJECTIVE,
            NoteSection.ASSESSMENT,
            NoteSection.PLAN,
        ],
        NoteType.HP: [
            NoteSection.CHIEF_COMPLAINT,
            NoteSection.HPI,
            NoteSection.PMH,
            NoteSection.MEDICATIONS,
            NoteSection.ALLERGIES,
            NoteSection.SOCIAL_HISTORY,
            NoteSection.FAMILY_HISTORY,
            NoteSection.ROS,
            NoteSection.PHYSICAL_EXAM,
            NoteSection.LABS,
            NoteSection.ASSESSMENT,
            NoteSection.PLAN,
        ],
        NoteType.PROGRESS: [
            NoteSection.SUBJECTIVE,
            NoteSection.OBJECTIVE,
            NoteSection.ASSESSMENT,
            NoteSection.PLAN,
        ],
        NoteType.PROCEDURE: [
            NoteSection.IMPRESSION,
            NoteSection.NOTES,
        ],
    }

    def __init__(
        self,
        session_id: str,
        user_id: str,
        config: DictationSessionConfig,
        on_event: Optional[Callable[[DictationEvent], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.config = config
        self._on_event = on_event

        # State
        self._state = DictationState.IDLE
        self._start_time: Optional[float] = None

        # Note
        self._note = DictationNote(
            note_id=str(uuid.uuid4()),
            note_type=config.note_type,
            user_id=user_id,
            patient_context=config.patient_context,
        )

        # Initialize sections based on note type
        self._initialize_sections()

        # Transcript buffer for current section
        self._transcript_buffer: List[str] = []
        self._last_transcript_time: float = 0.0

    def _initialize_sections(self) -> None:
        """Initialize note sections based on note type."""
        sections = self.SECTION_ORDER.get(self.config.note_type, [NoteSection.NOTES])
        for section in sections:
            self._note.sections[section] = NoteSectionContent(section=section)

        # Set initial section
        if sections:
            self._note.current_section = sections[0]

    @property
    def state(self) -> DictationState:
        """Get current dictation state."""
        return self._state

    @property
    def note(self) -> DictationNote:
        """Get the current note."""
        return self._note

    @property
    def current_section(self) -> NoteSection:
        """Get the current section being dictated."""
        return self._note.current_section

    async def start(self) -> bool:
        """
        Start the dictation session.

        Returns:
            True if started successfully
        """
        if self._state != DictationState.IDLE:
            logger.warning(f"Cannot start dictation in state {self._state}")
            return False

        self._state = DictationState.LISTENING
        self._start_time = time.time()

        await self._emit_event(
            "state_change",
            {
                "state": self._state.value,
                "note_type": self.config.note_type.value,
                "current_section": self._note.current_section.value,
            },
        )

        logger.info(f"Dictation session started: {self.session_id}")
        return True

    async def pause(self) -> bool:
        """Pause dictation."""
        if self._state != DictationState.LISTENING:
            return False

        self._state = DictationState.PAUSED
        await self._emit_event("state_change", {"state": self._state.value})
        logger.info(f"Dictation paused: {self.session_id}")
        return True

    async def resume(self) -> bool:
        """Resume dictation from pause."""
        if self._state != DictationState.PAUSED:
            return False

        self._state = DictationState.LISTENING
        await self._emit_event("state_change", {"state": self._state.value})
        logger.info(f"Dictation resumed: {self.session_id}")
        return True

    async def stop(self) -> DictationNote:
        """
        Stop dictation and return the note.

        Returns:
            The completed DictationNote
        """
        # Flush any buffered transcript
        await self._flush_buffer()

        # Calculate duration
        if self._start_time:
            self._note.duration_seconds = int(time.time() - self._start_time)

        # Calculate total word count
        self._note.total_word_count = sum(section.word_count for section in self._note.sections.values())

        self._state = DictationState.COMPLETED
        self._note.updated_at = time.time()

        await self._emit_event(
            "state_change",
            {
                "state": self._state.value,
                "duration_seconds": self._note.duration_seconds,
                "total_word_count": self._note.total_word_count,
            },
        )

        logger.info(
            f"Dictation stopped: {self.session_id}, "
            f"duration={self._note.duration_seconds}s, "
            f"words={self._note.total_word_count}"
        )

        return self._note

    async def add_transcript(
        self,
        text: str,
        is_final: bool = False,
        confidence: float = 1.0,
    ) -> None:
        """
        Add transcribed text to the current section.

        Args:
            text: Transcribed text
            is_final: Whether this is a final (not partial) transcript
            confidence: STT confidence score
        """
        if self._state != DictationState.LISTENING:
            return

        self._last_transcript_time = time.time()

        if is_final:
            # Add to buffer
            self._transcript_buffer.append(text)

            # Update section
            current_section = self._note.sections[self._note.current_section]
            current_section.raw_transcript += " " + text if current_section.raw_transcript else text
            current_section.content = current_section.raw_transcript  # TODO: Apply formatting
            current_section.word_count = len(current_section.content.split())
            current_section.last_updated = time.time()

            await self._emit_event(
                "section_update",
                {
                    "section": self._note.current_section.value,
                    "content": current_section.content,
                    "word_count": current_section.word_count,
                    "is_final": True,
                },
            )
        else:
            # Partial transcript - emit for real-time display
            await self._emit_event(
                "section_update",
                {
                    "section": self._note.current_section.value,
                    "partial_text": text,
                    "is_final": False,
                },
            )

    async def go_to_section(self, section: NoteSection) -> bool:
        """
        Navigate to a specific section.

        Args:
            section: The section to navigate to

        Returns:
            True if navigation was successful
        """
        if section not in self._note.sections:
            logger.warning(f"Section {section.value} not available for {self.config.note_type.value}")
            return False

        # Flush buffer before changing sections
        await self._flush_buffer()

        previous_section = self._note.current_section
        self._note.current_section = section

        await self._emit_event(
            "section_change",
            {
                "previous_section": previous_section.value,
                "current_section": section.value,
            },
        )

        logger.info(f"Navigated to section: {section.value}")
        return True

    async def next_section(self) -> bool:
        """Navigate to the next section."""
        sections = self.SECTION_ORDER.get(self.config.note_type, [])
        if not sections:
            return False

        try:
            current_idx = sections.index(self._note.current_section)
            if current_idx < len(sections) - 1:
                return await self.go_to_section(sections[current_idx + 1])
        except ValueError:
            pass

        return False

    async def previous_section(self) -> bool:
        """Navigate to the previous section."""
        sections = self.SECTION_ORDER.get(self.config.note_type, [])
        if not sections:
            return False

        try:
            current_idx = sections.index(self._note.current_section)
            if current_idx > 0:
                return await self.go_to_section(sections[current_idx - 1])
        except ValueError:
            pass

        return False

    async def delete_last(self) -> bool:
        """Delete the last sentence/phrase."""
        current_section = self._note.sections[self._note.current_section]
        if not current_section.content:
            return False

        # Find and remove the last sentence
        content = current_section.content.rstrip()
        # Find the last sentence boundary
        for delimiter in [". ", "! ", "? ", "\n"]:
            if delimiter in content:
                idx = content.rfind(delimiter)
                content = content[: idx + 1]
                break
        else:
            # No sentence boundary, delete last word
            words = content.split()
            if words:
                content = " ".join(words[:-1])

        current_section.content = content
        current_section.word_count = len(content.split())
        current_section.last_updated = time.time()

        await self._emit_event(
            "section_update",
            {
                "section": self._note.current_section.value,
                "content": current_section.content,
                "word_count": current_section.word_count,
                "is_final": True,
                "deleted": True,
            },
        )

        return True

    async def undo(self) -> bool:
        """Undo the last action (if buffer available)."""
        if not self._transcript_buffer:
            return False

        # Remove last buffered item
        removed = self._transcript_buffer.pop()

        # Rebuild section content
        current_section = self._note.sections[self._note.current_section]
        if current_section.content.endswith(removed):
            current_section.content = current_section.content[: -len(removed)].rstrip()
            current_section.raw_transcript = current_section.content
            current_section.word_count = len(current_section.content.split())
            current_section.last_updated = time.time()

        await self._emit_event(
            "section_update",
            {
                "section": self._note.current_section.value,
                "content": current_section.content,
                "word_count": current_section.word_count,
                "is_final": True,
                "undo": True,
            },
        )

        return True

    async def insert_text(self, text: str) -> None:
        """Insert formatted text at the current position."""
        current_section = self._note.sections[self._note.current_section]

        if current_section.content:
            current_section.content += " " + text
        else:
            current_section.content = text

        current_section.word_count = len(current_section.content.split())
        current_section.last_updated = time.time()

        await self._emit_event(
            "section_update",
            {
                "section": self._note.current_section.value,
                "content": current_section.content,
                "word_count": current_section.word_count,
                "is_final": True,
            },
        )

    async def read_back(self) -> str:
        """Get the content of the current section for TTS playback."""
        current_section = self._note.sections[self._note.current_section]
        return current_section.content

    async def get_full_note(self) -> str:
        """Get the full formatted note content."""
        parts = []

        for section in self.SECTION_ORDER.get(self.config.note_type, [NoteSection.NOTES]):
            if section in self._note.sections:
                section_content = self._note.sections[section]
                if section_content.content:
                    parts.append(f"## {section.value.upper().replace('_', ' ')}")
                    parts.append(section_content.content)
                    parts.append("")

        return "\n".join(parts)

    async def _flush_buffer(self) -> None:
        """Flush the transcript buffer."""
        # Buffer is already processed in add_transcript
        self._transcript_buffer = []

    async def _emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit a dictation event."""
        if self._on_event:
            event = DictationEvent(event_type=event_type, data=data)
            try:
                await self._on_event(event)
            except Exception as e:
                logger.error(f"Error emitting dictation event: {e}")


# ==============================================================================
# Dictation Service
# ==============================================================================


class DictationService:
    """
    Main service for managing medical dictation sessions.

    Usage:
        service = DictationService()

        # Create a session
        session = await service.create_session(
            user_id="user-123",
            config=DictationSessionConfig(
                note_type=NoteType.SOAP,
                specialty="cardiology",
            ),
            on_event=handle_dictation_event,
        )

        # Start dictation
        await session.start()

        # Add transcribed text
        await session.add_transcript("Patient presents with chest pain", is_final=True)

        # Navigate sections
        await session.next_section()

        # Stop and get note
        note = await session.stop()
    """

    def __init__(self):
        self._sessions: Dict[str, DictationSession] = {}

    async def create_session(
        self,
        user_id: str,
        config: Optional[DictationSessionConfig] = None,
        on_event: Optional[Callable[[DictationEvent], Awaitable[None]]] = None,
    ) -> DictationSession:
        """
        Create a new dictation session.

        Args:
            user_id: User ID
            config: Session configuration
            on_event: Callback for dictation events

        Returns:
            DictationSession instance
        """
        session_id = str(uuid.uuid4())
        config = config or DictationSessionConfig()

        session = DictationSession(
            session_id=session_id,
            user_id=user_id,
            config=config,
            on_event=on_event,
        )

        self._sessions[session_id] = session

        logger.info(
            f"Created dictation session: {session_id}, "
            f"type={config.note_type.value}, "
            f"specialty={config.specialty}"
        )

        return session

    def get_session(self, session_id: str) -> Optional[DictationSession]:
        """Get an active dictation session."""
        return self._sessions.get(session_id)

    async def remove_session(self, session_id: str) -> Optional[DictationNote]:
        """
        Remove a dictation session.

        Returns:
            The note from the session, if any
        """
        session = self._sessions.pop(session_id, None)
        if session:
            if session.state != DictationState.COMPLETED:
                note = await session.stop()
            else:
                note = session.note
            logger.info(f"Removed dictation session: {session_id}")
            return note
        return None

    def get_active_sessions(self, user_id: Optional[str] = None) -> List[str]:
        """Get list of active session IDs, optionally filtered by user."""
        if user_id:
            return [sid for sid, session in self._sessions.items() if session.user_id == user_id]
        return list(self._sessions.keys())

    def get_note_types(self) -> List[Dict[str, str]]:
        """Get available note types with descriptions."""
        return [
            {
                "type": NoteType.SOAP.value,
                "name": "SOAP Note",
                "description": "Subjective, Objective, Assessment, Plan",
            },
            {"type": NoteType.HP.value, "name": "History & Physical", "description": "Comprehensive H&P"},
            {"type": NoteType.PROGRESS.value, "name": "Progress Note", "description": "Follow-up progress note"},
            {"type": NoteType.PROCEDURE.value, "name": "Procedure Note", "description": "Procedure documentation"},
            {"type": NoteType.CONSULT.value, "name": "Consultation", "description": "Consultation note"},
            {"type": NoteType.DISCHARGE.value, "name": "Discharge Summary", "description": "Discharge summary"},
        ]


# Global service instance
dictation_service = DictationService()
