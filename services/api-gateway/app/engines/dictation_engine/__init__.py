"""
Dictation Engine - Plugin-Based Medical Dictation

This engine handles medical dictation functionality:
- Plugin Registry: Extensible specialty templates
- Specialty Plugins: SOAP, Radiology, Emergency, etc.
- Autocorrect: Medical spell-checking and abbreviation expansion
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class DictationSection:
    """A section in a medical note"""

    name: str
    content: str
    is_complete: bool = False
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@dataclass
class DictationNote:
    """Complete dictation note"""

    note_type: str
    sections: Dict[str, DictationSection] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_modified: datetime = field(default_factory=datetime.utcnow)
    is_complete: bool = False


class DictationEngine:
    """
    Facade for medical dictation functionality.

    Consolidates:
    - dictation_service.py → plugin-based architecture
    - NEW plugin_registry.py (plugin management)
    - NEW plugins/ (specialty templates)
    - NEW autocorrect.py (medical spell-check)
    """

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._plugin_registry = None
        self._autocorrect = None
        self._active_notes: Dict[str, DictationNote] = {}
        logger.info("DictationEngine initialized")

    async def initialize(self):
        """Initialize sub-components lazily"""
        from .autocorrect import MedicalAutocorrect
        from .plugin_registry import PluginRegistry

        self._plugin_registry = PluginRegistry()
        self._autocorrect = MedicalAutocorrect()

        # Load default plugins
        await self._plugin_registry.load_default_plugins()
        logger.info("DictationEngine sub-components initialized")

    async def start_note(
        self,
        session_id: str,
        note_type: str,
        specialty: Optional[str] = None,
    ) -> DictationNote:
        """
        Start a new dictation note.

        Args:
            session_id: Session identifier
            note_type: Type of note (soap, hp, progress, radiology, etc.)
            specialty: Optional specialty for template selection

        Returns:
            New DictationNote with appropriate sections
        """
        if not self._plugin_registry:
            await self.initialize()

        # Get plugin for note type
        plugin = self._plugin_registry.get_plugin(note_type)
        if not plugin:
            plugin = self._plugin_registry.get_plugin("soap")  # Default

        # Create note with sections from plugin
        sections = {}
        for section_name in plugin.sections:
            sections[section_name] = DictationSection(name=section_name, content="")

        note = DictationNote(
            note_type=note_type,
            sections=sections,
        )

        self._active_notes[session_id] = note

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="dictation.started",
                data={
                    "note_type": note_type,
                    "sections": list(sections.keys()),
                },
                session_id=session_id,
                source_engine="dictation",
            )

        return note

    async def add_content(
        self,
        session_id: str,
        text: str,
        section: Optional[str] = None,
    ) -> DictationNote:
        """
        Add dictated content to note.

        If section is not specified, uses current active section.
        """
        note = self._active_notes.get(session_id)
        if not note:
            # Start a default SOAP note
            note = await self.start_note(session_id, "soap")

        # Apply autocorrect
        if self._autocorrect:
            text = await self._autocorrect.correct(text, note.note_type)

        # Find target section
        target_section = section
        if not target_section:
            # Use first incomplete section
            for sec_name, sec in note.sections.items():
                if not sec.is_complete:
                    target_section = sec_name
                    break

        if target_section and target_section in note.sections:
            sec = note.sections[target_section]
            if sec.content:
                sec.content += " " + text
            else:
                sec.content = text
                sec.started_at = datetime.utcnow()
            note.last_modified = datetime.utcnow()

        return note

    async def navigate_section(
        self,
        session_id: str,
        section: str,
    ) -> bool:
        """Navigate to a specific section"""
        note = self._active_notes.get(session_id)
        if not note or section not in note.sections:
            return False

        # Mark current section complete, start new one
        for sec_name, sec in note.sections.items():
            if sec.started_at and not sec.completed_at:
                sec.completed_at = datetime.utcnow()
                sec.is_complete = True
                break

        # Publish navigation event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="dictation.section_change",
                data={"section": section},
                session_id=session_id,
                source_engine="dictation",
            )

        return True

    async def execute_command(
        self,
        session_id: str,
        command: str,
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Execute a voice command.

        Commands: next_section, previous_section, go_to [section],
                  delete_last, read_back, finalize
        """
        if not self._plugin_registry:
            await self.initialize()

        note = self._active_notes.get(session_id)
        if not note:
            return {"success": False, "error": "No active note"}

        plugin = self._plugin_registry.get_plugin(note.note_type)
        if plugin and command in plugin.voice_commands:
            result = await plugin.voice_commands[command](note, args)
            # Publish command event
            if self.event_bus:
                await self.event_bus.publish_event(
                    event_type="dictation.command",
                    data={"command": command, "success": True},
                    session_id=session_id,
                    source_engine="dictation",
                )
            return result

        # Handle built-in commands
        if command == "next_section":
            sections = list(note.sections.keys())
            current_idx = self._get_current_section_index(note)
            if current_idx < len(sections) - 1:
                await self.navigate_section(session_id, sections[current_idx + 1])
                return {"success": True, "section": sections[current_idx + 1]}

        elif command == "finalize":
            note.is_complete = True
            for sec in note.sections.values():
                sec.is_complete = True
            return {"success": True, "note": self._note_to_dict(note)}

        return {"success": False, "error": f"Unknown command: {command}"}

    def _get_current_section_index(self, note: DictationNote) -> int:
        """Get index of current active section"""
        sections = list(note.sections.keys())
        for i, sec_name in enumerate(sections):
            sec = note.sections[sec_name]
            if sec.started_at and not sec.is_complete:
                return i
        return 0

    def _note_to_dict(self, note: DictationNote) -> Dict[str, Any]:
        """Convert note to dictionary"""
        return {
            "note_type": note.note_type,
            "sections": {name: sec.content for name, sec in note.sections.items()},
            "is_complete": note.is_complete,
            "created_at": note.created_at.isoformat(),
        }

    async def get_vocabulary_boost(
        self,
        note_type: str,
    ) -> List[str]:
        """Get STT vocabulary boost words for note type"""
        if not self._plugin_registry:
            await self.initialize()

        plugin = self._plugin_registry.get_plugin(note_type)
        if plugin:
            return plugin.vocabulary_boost
        return []


__all__ = [
    "DictationEngine",
    "DictationNote",
    "DictationSection",
]
