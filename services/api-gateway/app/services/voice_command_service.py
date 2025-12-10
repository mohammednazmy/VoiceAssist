"""
Voice Command Service - Hands-free Dictation Control

Phase 8: Voice command recognition and execution for medical dictation.

Supports command categories:
- Navigation: "go to subjective", "next section", "previous section"
- Formatting: "new paragraph", "bullet point", "number one/two/three"
- Editing: "delete that", "scratch that", "undo", "read that back"
- Clinical: "check interactions", "what's the dosing for", "show labs"
- Control: "start dictation", "pause", "stop dictation", "save note"

Commands are detected from transcribed speech and executed on the active
dictation session.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger
from app.services.dictation_service import DictationSession, NoteSection

logger = get_logger(__name__)


# ==============================================================================
# Enums
# ==============================================================================


class CommandCategory(str, Enum):
    """Categories of voice commands."""

    NAVIGATION = "navigation"
    FORMATTING = "formatting"
    EDITING = "editing"
    CLINICAL = "clinical"
    CONTROL = "control"


class CommandType(str, Enum):
    """Types of voice commands."""

    # Navigation
    GO_TO_SECTION = "go_to_section"
    NEXT_SECTION = "next_section"
    PREVIOUS_SECTION = "previous_section"

    # Formatting
    NEW_PARAGRAPH = "new_paragraph"
    NEW_LINE = "new_line"
    BULLET_POINT = "bullet_point"
    NUMBERED_ITEM = "numbered_item"
    PERIOD = "period"
    COMMA = "comma"
    COLON = "colon"
    SEMICOLON = "semicolon"

    # Editing
    DELETE_LAST = "delete_last"
    SCRATCH_THAT = "scratch_that"
    UNDO = "undo"
    READ_BACK = "read_back"
    CLEAR_SECTION = "clear_section"

    # Clinical
    CHECK_INTERACTIONS = "check_interactions"
    DOSING_INFO = "dosing_info"
    SHOW_LABS = "show_labs"
    SHOW_MEDICATIONS = "show_medications"
    SHOW_VITALS = "show_vitals"

    # Control
    START_DICTATION = "start_dictation"
    PAUSE_DICTATION = "pause_dictation"
    RESUME_DICTATION = "resume_dictation"
    STOP_DICTATION = "stop_dictation"
    SAVE_NOTE = "save_note"


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class CommandPattern:
    """A voice command pattern with its regex and metadata."""

    command_type: CommandType
    category: CommandCategory
    patterns: List[str]  # Regex patterns
    description: str
    example: str
    params: Dict[str, str] = field(default_factory=dict)  # Named groups to extract


@dataclass
class ParsedCommand:
    """Result of parsing a voice command from text."""

    command_type: CommandType
    category: CommandCategory
    matched_text: str
    params: Dict[str, str]
    confidence: float
    remaining_text: str  # Text after removing the command


@dataclass
class CommandResult:
    """Result of executing a voice command."""

    success: bool
    command_type: CommandType
    message: str
    data: Dict = field(default_factory=dict)


# ==============================================================================
# Voice Command Service
# ==============================================================================


class VoiceCommandService:
    """
    Service for detecting and executing voice commands in dictation.

    Usage:
        service = VoiceCommandService()

        # Parse text for commands
        result = service.parse_command("go to subjective section")
        if result:
            # Execute the command
            exec_result = await service.execute_command(result, dictation_session)

        # Get available commands
        commands = service.get_available_commands()
    """

    # Section name mappings
    SECTION_NAMES = {
        # SOAP sections
        "subjective": NoteSection.SUBJECTIVE,
        "subject": NoteSection.SUBJECTIVE,
        "s": NoteSection.SUBJECTIVE,
        "objective": NoteSection.OBJECTIVE,
        "object": NoteSection.OBJECTIVE,
        "o": NoteSection.OBJECTIVE,
        "assessment": NoteSection.ASSESSMENT,
        "assess": NoteSection.ASSESSMENT,
        "a": NoteSection.ASSESSMENT,
        "plan": NoteSection.PLAN,
        "p": NoteSection.PLAN,
        # H&P sections
        "chief complaint": NoteSection.CHIEF_COMPLAINT,
        "cc": NoteSection.CHIEF_COMPLAINT,
        "hpi": NoteSection.HPI,
        "history of present illness": NoteSection.HPI,
        "history present illness": NoteSection.HPI,
        "past medical history": NoteSection.PMH,
        "pmh": NoteSection.PMH,
        "medications": NoteSection.MEDICATIONS,
        "meds": NoteSection.MEDICATIONS,
        "allergies": NoteSection.ALLERGIES,
        "social history": NoteSection.SOCIAL_HISTORY,
        "social": NoteSection.SOCIAL_HISTORY,
        "family history": NoteSection.FAMILY_HISTORY,
        "family": NoteSection.FAMILY_HISTORY,
        "review of systems": NoteSection.ROS,
        "ros": NoteSection.ROS,
        "physical exam": NoteSection.PHYSICAL_EXAM,
        "exam": NoteSection.PHYSICAL_EXAM,
        "pe": NoteSection.PHYSICAL_EXAM,
        "labs": NoteSection.LABS,
        "imaging": NoteSection.LABS,
        "labs and imaging": NoteSection.LABS,
        "impression": NoteSection.IMPRESSION,
    }

    # Number words for numbered lists
    NUMBER_WORDS = {
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
        "seven": "7",
        "eight": "8",
        "nine": "9",
        "ten": "10",
    }

    def __init__(self):
        self._patterns = self._build_patterns()
        self._compiled_patterns: List[Tuple[re.Pattern, CommandPattern]] = []
        self._compile_patterns()

    def _build_patterns(self) -> List[CommandPattern]:
        """Build the list of command patterns."""
        return [
            # Navigation Commands
            CommandPattern(
                command_type=CommandType.GO_TO_SECTION,
                category=CommandCategory.NAVIGATION,
                patterns=[
                    r"\b(?:go to|move to|jump to|switch to|navigate to)\s+(?:the\s+)?"
                    r"(?P<section>\w+(?:\s+\w+)?)\s*(?:section)?\b",
                    r"\b(?P<section>subjective|objective|assessment|plan)\s+section\b",
                ],
                description="Navigate to a specific section",
                example="go to subjective",
            ),
            CommandPattern(
                command_type=CommandType.NEXT_SECTION,
                category=CommandCategory.NAVIGATION,
                patterns=[
                    r"\b(?:next section|go next|move next|next)\b",
                ],
                description="Move to the next section",
                example="next section",
            ),
            CommandPattern(
                command_type=CommandType.PREVIOUS_SECTION,
                category=CommandCategory.NAVIGATION,
                patterns=[
                    r"\b(?:previous section|go back|go previous|back|previous)\b",
                ],
                description="Move to the previous section",
                example="previous section",
            ),
            # Formatting Commands
            CommandPattern(
                command_type=CommandType.NEW_PARAGRAPH,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\b(?:new paragraph|paragraph|next paragraph)\b",
                ],
                description="Start a new paragraph",
                example="new paragraph",
            ),
            CommandPattern(
                command_type=CommandType.NEW_LINE,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\b(?:new line|line break|enter|next line)\b",
                ],
                description="Insert a line break",
                example="new line",
            ),
            CommandPattern(
                command_type=CommandType.BULLET_POINT,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\b(?:bullet point|bullet|add bullet|new bullet)\b",
                ],
                description="Add a bullet point",
                example="bullet point",
            ),
            CommandPattern(
                command_type=CommandType.NUMBERED_ITEM,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\b(?:number\s+(?P<number>one|two|three|four|five|six|seven|eight|nine|ten|\d+))\b",
                    r"\b(?:numbered item|item number|add number)\b",
                ],
                description="Add a numbered list item",
                example="number one",
            ),
            CommandPattern(
                command_type=CommandType.PERIOD,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\b(?:period|full stop|end sentence)\b",
                ],
                description="Insert a period",
                example="period",
            ),
            CommandPattern(
                command_type=CommandType.COMMA,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\bcomma\b",
                ],
                description="Insert a comma",
                example="comma",
            ),
            CommandPattern(
                command_type=CommandType.COLON,
                category=CommandCategory.FORMATTING,
                patterns=[
                    r"\bcolon\b",
                ],
                description="Insert a colon",
                example="colon",
            ),
            # Editing Commands
            CommandPattern(
                command_type=CommandType.DELETE_LAST,
                category=CommandCategory.EDITING,
                patterns=[
                    r"\b(?:delete that|delete last|remove that|remove last)\b",
                ],
                description="Delete the last phrase",
                example="delete that",
            ),
            CommandPattern(
                command_type=CommandType.SCRATCH_THAT,
                category=CommandCategory.EDITING,
                patterns=[
                    r"\b(?:scratch that|never mind|disregard|cancel that)\b",
                ],
                description="Remove the last dictated text",
                example="scratch that",
            ),
            CommandPattern(
                command_type=CommandType.UNDO,
                category=CommandCategory.EDITING,
                patterns=[
                    r"\bundo\b",
                ],
                description="Undo the last action",
                example="undo",
            ),
            CommandPattern(
                command_type=CommandType.READ_BACK,
                category=CommandCategory.EDITING,
                patterns=[
                    r"\b(?:read that back|read back|read it back|what did i say)\b",
                ],
                description="Read back the current section",
                example="read that back",
            ),
            CommandPattern(
                command_type=CommandType.CLEAR_SECTION,
                category=CommandCategory.EDITING,
                patterns=[
                    r"\b(?:clear section|clear all|erase section|start over)\b",
                ],
                description="Clear the current section",
                example="clear section",
            ),
            # Clinical Commands
            CommandPattern(
                command_type=CommandType.CHECK_INTERACTIONS,
                category=CommandCategory.CLINICAL,
                patterns=[
                    r"\b(?:check interactions|drug interactions|interactions for|check for interactions)\b",
                ],
                description="Check drug interactions",
                example="check interactions",
            ),
            CommandPattern(
                command_type=CommandType.DOSING_INFO,
                category=CommandCategory.CLINICAL,
                patterns=[
                    r"\b(?:what'?s the dosing for|dosing for|dose of|dosage of)\s+(?P<medication>\w+(?:\s+\w+)?)\b",
                ],
                description="Get dosing information for a medication",
                example="what's the dosing for metformin",
            ),
            CommandPattern(
                command_type=CommandType.SHOW_LABS,
                category=CommandCategory.CLINICAL,
                patterns=[
                    r"\b(?:show labs|show lab results|display labs|what are the labs)\b",
                ],
                description="Show patient lab results",
                example="show labs",
            ),
            CommandPattern(
                command_type=CommandType.SHOW_MEDICATIONS,
                category=CommandCategory.CLINICAL,
                patterns=[
                    r"\b(?:show medications|show meds|display medications|what medications|current meds)\b",
                ],
                description="Show current medications",
                example="show medications",
            ),
            CommandPattern(
                command_type=CommandType.SHOW_VITALS,
                category=CommandCategory.CLINICAL,
                patterns=[
                    r"\b(?:show vitals|vital signs|display vitals|what are the vitals)\b",
                ],
                description="Show vital signs",
                example="show vitals",
            ),
            # Control Commands
            CommandPattern(
                command_type=CommandType.START_DICTATION,
                category=CommandCategory.CONTROL,
                patterns=[
                    r"\b(?:start dictation|begin dictation|start recording|let'?s begin)\b",
                ],
                description="Start dictation mode",
                example="start dictation",
            ),
            CommandPattern(
                command_type=CommandType.PAUSE_DICTATION,
                category=CommandCategory.CONTROL,
                patterns=[
                    r"\b(?:pause dictation|pause|hold on|wait a moment)\b",
                ],
                description="Pause dictation",
                example="pause",
            ),
            CommandPattern(
                command_type=CommandType.RESUME_DICTATION,
                category=CommandCategory.CONTROL,
                patterns=[
                    r"\b(?:resume dictation|resume|continue dictation|continue|go on)\b",
                ],
                description="Resume dictation",
                example="resume",
            ),
            CommandPattern(
                command_type=CommandType.STOP_DICTATION,
                category=CommandCategory.CONTROL,
                patterns=[
                    r"\b(?:stop dictation|stop recording|end dictation|finish dictation|that'?s all)\b",
                ],
                description="Stop dictation",
                example="stop dictation",
            ),
            CommandPattern(
                command_type=CommandType.SAVE_NOTE,
                category=CommandCategory.CONTROL,
                patterns=[
                    r"\b(?:save note|save this|save the note|save it)\b",
                ],
                description="Save the current note",
                example="save note",
            ),
        ]

    def _compile_patterns(self) -> None:
        """Compile regex patterns for efficient matching."""
        for pattern in self._patterns:
            for regex_str in pattern.patterns:
                try:
                    compiled = re.compile(regex_str, re.IGNORECASE)
                    self._compiled_patterns.append((compiled, pattern))
                except re.error as e:
                    logger.error(f"Invalid regex pattern: {regex_str} - {e}")

    def parse_command(self, text: str) -> Optional[ParsedCommand]:
        """
        Parse text to detect a voice command.

        Args:
            text: Transcribed text to parse

        Returns:
            ParsedCommand if a command was detected, None otherwise
        """
        text_lower = text.lower().strip()

        for compiled_regex, pattern in self._compiled_patterns:
            match = compiled_regex.search(text_lower)
            if match:
                # Extract parameters from named groups
                params = {k: v for k, v in match.groupdict().items() if v}

                # Calculate remaining text (everything not matching the command)
                remaining = text[: match.start()] + text[match.end() :]
                remaining = remaining.strip()

                return ParsedCommand(
                    command_type=pattern.command_type,
                    category=pattern.category,
                    matched_text=match.group(0),
                    params=params,
                    confidence=1.0,  # Exact match
                    remaining_text=remaining,
                )

        return None

    async def execute_command(
        self,
        command: ParsedCommand,
        session: DictationSession,
    ) -> CommandResult:
        """
        Execute a parsed voice command on a dictation session.

        Args:
            command: The parsed command to execute
            session: The dictation session to operate on

        Returns:
            CommandResult with execution status
        """
        try:
            command_type = command.command_type

            # Navigation commands
            if command_type == CommandType.GO_TO_SECTION:
                section_name = command.params.get("section", "").lower()
                section = self.SECTION_NAMES.get(section_name)
                if section:
                    success = await session.go_to_section(section)
                    return CommandResult(
                        success=success,
                        command_type=command_type,
                        message=(f"Moved to {section.value}" if success else f"Section '{section_name}' not available"),
                        data={"section": section.value if success else None},
                    )
                return CommandResult(
                    success=False,
                    command_type=command_type,
                    message=f"Unknown section: {section_name}",
                )

            elif command_type == CommandType.NEXT_SECTION:
                success = await session.next_section()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message=("Moved to next section" if success else "Already at last section"),
                    data={"section": session.current_section.value},
                )

            elif command_type == CommandType.PREVIOUS_SECTION:
                success = await session.previous_section()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message=("Moved to previous section" if success else "Already at first section"),
                    data={"section": session.current_section.value},
                )

            # Formatting commands
            elif command_type == CommandType.NEW_PARAGRAPH:
                await session.insert_text("\n\n")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="New paragraph",
                )

            elif command_type == CommandType.NEW_LINE:
                await session.insert_text("\n")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="New line",
                )

            elif command_type == CommandType.BULLET_POINT:
                await session.insert_text("\n- ")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="Bullet point added",
                )

            elif command_type == CommandType.NUMBERED_ITEM:
                number = command.params.get("number", "1")
                # Convert number words to digits
                if number in self.NUMBER_WORDS:
                    number = self.NUMBER_WORDS[number]
                await session.insert_text(f"\n{number}. ")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message=f"Number {number} added",
                )

            elif command_type == CommandType.PERIOD:
                await session.insert_text(". ")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="Period added",
                )

            elif command_type == CommandType.COMMA:
                await session.insert_text(", ")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="Comma added",
                )

            elif command_type == CommandType.COLON:
                await session.insert_text(": ")
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="Colon added",
                )

            # Editing commands
            elif command_type == CommandType.DELETE_LAST:
                success = await session.delete_last()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message="Deleted last phrase" if success else "Nothing to delete",
                )

            elif command_type == CommandType.SCRATCH_THAT:
                success = await session.delete_last()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message="Scratched that" if success else "Nothing to scratch",
                )

            elif command_type == CommandType.UNDO:
                success = await session.undo()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message="Undone" if success else "Nothing to undo",
                )

            elif command_type == CommandType.READ_BACK:
                content = await session.read_back()
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message=content if content else "This section is empty",
                    data={"content": content, "speak": True},
                )

            # Control commands
            elif command_type == CommandType.START_DICTATION:
                success = await session.start()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message="Dictation started" if success else "Already dictating",
                )

            elif command_type == CommandType.PAUSE_DICTATION:
                success = await session.pause()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message=("Dictation paused" if success else "Not currently dictating"),
                )

            elif command_type == CommandType.RESUME_DICTATION:
                success = await session.resume()
                return CommandResult(
                    success=success,
                    command_type=command_type,
                    message="Dictation resumed" if success else "Not paused",
                )

            elif command_type == CommandType.STOP_DICTATION:
                await session.stop()
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message="Dictation stopped",
                )

            # Clinical commands (placeholders - to be integrated with patient context)
            elif command_type in (
                CommandType.CHECK_INTERACTIONS,
                CommandType.DOSING_INFO,
                CommandType.SHOW_LABS,
                CommandType.SHOW_MEDICATIONS,
                CommandType.SHOW_VITALS,
            ):
                return CommandResult(
                    success=True,
                    command_type=command_type,
                    message=f"Clinical command: {command_type.value}",
                    data={"requires_patient_context": True, "params": command.params},
                )

            else:
                return CommandResult(
                    success=False,
                    command_type=command_type,
                    message=f"Unknown command: {command_type.value}",
                )

        except Exception as e:
            logger.error(f"Error executing command {command.command_type}: {e}")
            return CommandResult(
                success=False,
                command_type=command.command_type,
                message=f"Error: {str(e)}",
            )

    def get_available_commands(
        self,
        category: Optional[CommandCategory] = None,
    ) -> List[Dict]:
        """
        Get list of available commands.

        Args:
            category: Optional filter by category

        Returns:
            List of command information dicts
        """
        commands = []
        seen = set()

        for pattern in self._patterns:
            if pattern.command_type in seen:
                continue
            if category and pattern.category != category:
                continue

            commands.append(
                {
                    "type": pattern.command_type.value,
                    "category": pattern.category.value,
                    "description": pattern.description,
                    "example": pattern.example,
                }
            )
            seen.add(pattern.command_type)

        return commands

    def get_section_names(self) -> Dict[str, str]:
        """Get mapping of spoken section names to section IDs."""
        return {name: section.value for name, section in self.SECTION_NAMES.items()}


# Global service instance
voice_command_service = VoiceCommandService()
