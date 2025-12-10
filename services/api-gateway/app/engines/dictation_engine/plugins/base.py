"""
Base Dictation Plugin

Base class for all dictation plugins.

Phase 4 Enhancements:
- Section content validation
- Event publishing for dictation.command and context.updated
- Required fields and section constraints
- Specialty-specific validation hooks
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class ValidationSeverity(Enum):
    """Severity of validation issues"""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationResult:
    """Result of section or note validation"""

    is_valid: bool
    issues: List[Dict[str, Any]] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)


@dataclass
class SectionConstraint:
    """Constraints for a section"""

    required: bool = False
    min_length: int = 0
    max_length: int = 0  # 0 = no limit
    required_patterns: List[str] = field(default_factory=list)
    forbidden_patterns: List[str] = field(default_factory=list)
    required_keywords: Set[str] = field(default_factory=set)


class BaseDictationPlugin:
    """
    Base class for dictation plugins.

    Override to create specialty-specific plugins.

    Phase 4 Features:
    - Validation: validate_section(), validate_note()
    - Event publishing: Publishes dictation.command events
    - Required fields: Define mandatory content
    - Content constraints: Min/max length, required patterns
    """

    plugin_id: str = "base"
    plugin_name: str = "Base Plugin"
    sections: List[str] = []
    vocabulary_boost: List[str] = []

    # Section constraints (override in subclasses)
    section_constraints: Dict[str, SectionConstraint] = {}

    # Event bus reference (injected)
    event_bus = None

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self.voice_commands: Dict[str, Callable] = self._build_voice_commands()

    def _build_voice_commands(self) -> Dict[str, Callable]:
        """Build voice command handlers"""
        return {
            "read_back": self._cmd_read_back,
            "delete_last": self._cmd_delete_last,
            "clear_section": self._cmd_clear_section,
        }

    async def _cmd_read_back(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Read back current section content"""
        section = args.get("section") if args else None
        if section and section in note.sections:
            content = note.sections[section].content
        else:
            # Read current section
            for sec in note.sections.values():
                if sec.started_at and not sec.is_complete:
                    content = sec.content
                    section = sec.name
                    break
            else:
                content = ""
                section = None

        return {
            "success": True,
            "action": "read_back",
            "section": section,
            "content": content,
        }

    async def _cmd_delete_last(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Delete last sentence/phrase"""
        for sec in note.sections.values():
            if sec.started_at and not sec.is_complete:
                # Remove last sentence
                content = sec.content.strip()
                if ". " in content:
                    content = content.rsplit(". ", 1)[0] + "."
                elif content:
                    # Remove last word
                    content = " ".join(content.split()[:-1])
                sec.content = content
                return {"success": True, "action": "delete_last"}

        return {"success": False, "error": "No active section"}

    async def _cmd_clear_section(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Clear current section"""
        section = args.get("section") if args else None
        if section and section in note.sections:
            note.sections[section].content = ""
            return {"success": True, "action": "clear_section", "section": section}

        # Clear current section
        for sec in note.sections.values():
            if sec.started_at and not sec.is_complete:
                sec.content = ""
                return {"success": True, "action": "clear_section", "section": sec.name}

        return {"success": False, "error": "No section to clear"}

    async def on_activate(self, context: Dict) -> None:
        """Called when plugin is activated"""
        logger.debug(f"Plugin {self.plugin_id} activated")

    async def on_deactivate(self, context: Dict) -> None:
        """Called when plugin is deactivated"""
        logger.debug(f"Plugin {self.plugin_id} deactivated")

    async def format_note(self, note: "DictationNote") -> str:
        """Format note for output"""
        lines = [f"=== {self.plugin_name} ===\n"]
        for section_name in self.sections:
            section = note.sections.get(section_name)
            if section and section.content:
                lines.append(f"## {section_name.upper()}")
                lines.append(section.content)
                lines.append("")
        return "\n".join(lines)

    # ===== Phase 4: Validation Methods =====

    def validate_section(
        self,
        section_name: str,
        content: str,
    ) -> ValidationResult:
        """
        Validate a single section's content.

        Checks constraints defined in section_constraints.
        Override in subclasses for specialty-specific validation.
        """
        issues = []
        suggestions = []

        constraint = self.section_constraints.get(section_name)
        if not constraint:
            return ValidationResult(is_valid=True)

        # Check min length
        if constraint.min_length > 0 and len(content) < constraint.min_length:
            issues.append(
                {
                    "severity": ValidationSeverity.WARNING.value,
                    "section": section_name,
                    "message": f"Section content is too short (min: {constraint.min_length} chars)",
                }
            )
            suggestions.append(f"Add more detail to {section_name}")

        # Check max length
        if constraint.max_length > 0 and len(content) > constraint.max_length:
            issues.append(
                {
                    "severity": ValidationSeverity.WARNING.value,
                    "section": section_name,
                    "message": f"Section content exceeds maximum length ({constraint.max_length} chars)",
                }
            )
            suggestions.append(f"Consider summarizing {section_name}")

        # Check required patterns
        for pattern in constraint.required_patterns:
            if not re.search(pattern, content, re.IGNORECASE):
                issues.append(
                    {
                        "severity": ValidationSeverity.WARNING.value,
                        "section": section_name,
                        "message": f"Missing required pattern: {pattern}",
                    }
                )

        # Check forbidden patterns
        for pattern in constraint.forbidden_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                issues.append(
                    {
                        "severity": ValidationSeverity.ERROR.value,
                        "section": section_name,
                        "message": f"Contains forbidden pattern: {pattern}",
                    }
                )

        # Check required keywords
        content_lower = content.lower()
        missing_keywords = [kw for kw in constraint.required_keywords if kw.lower() not in content_lower]
        if missing_keywords:
            issues.append(
                {
                    "severity": ValidationSeverity.INFO.value,
                    "section": section_name,
                    "message": f"Missing keywords: {', '.join(missing_keywords)}",
                }
            )

        is_valid = not any(i["severity"] == ValidationSeverity.ERROR.value for i in issues)
        return ValidationResult(
            is_valid=is_valid,
            issues=issues,
            suggestions=suggestions,
        )

    def validate_note(self, note: "DictationNote") -> ValidationResult:
        """
        Validate the entire note.

        Checks all sections and required fields.
        """
        all_issues = []
        all_suggestions = []

        # Check required sections
        for section_name, constraint in self.section_constraints.items():
            if constraint.required:
                section = note.sections.get(section_name)
                if not section or not section.content:
                    all_issues.append(
                        {
                            "severity": ValidationSeverity.ERROR.value,
                            "section": section_name,
                            "message": f"Required section '{section_name}' is empty",
                        }
                    )
                    all_suggestions.append(f"Complete the {section_name} section")

        # Validate each section
        for section_name, section in note.sections.items():
            if section.content:
                result = self.validate_section(section_name, section.content)
                all_issues.extend(result.issues)
                all_suggestions.extend(result.suggestions)

        # Custom validation hook
        custom_result = self._custom_validation(note)
        all_issues.extend(custom_result.issues)
        all_suggestions.extend(custom_result.suggestions)

        is_valid = not any(i["severity"] == ValidationSeverity.ERROR.value for i in all_issues)
        return ValidationResult(
            is_valid=is_valid,
            issues=all_issues,
            suggestions=all_suggestions,
        )

    def _custom_validation(self, note: "DictationNote") -> ValidationResult:
        """
        Override for specialty-specific validation logic.

        Called after standard validation.
        """
        return ValidationResult(is_valid=True)

    # ===== Phase 4: Event Publishing =====

    async def publish_command_event(
        self,
        command: str,
        session_id: str,
        success: bool,
        details: Optional[Dict] = None,
    ) -> None:
        """Publish a dictation.command event"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="dictation.command",
            data={
                "plugin_id": self.plugin_id,
                "command": command,
                "success": success,
                "details": details or {},
            },
            session_id=session_id,
            source_engine="dictation",
        )

    async def publish_section_event(
        self,
        section: str,
        action: str,  # "started", "updated", "completed"
        session_id: str,
        content_length: int = 0,
    ) -> None:
        """Publish a dictation.section_change event"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="dictation.section_change",
            data={
                "plugin_id": self.plugin_id,
                "section": section,
                "action": action,
                "content_length": content_length,
            },
            session_id=session_id,
            source_engine="dictation",
        )

    async def publish_validation_event(
        self,
        session_id: str,
        validation_result: ValidationResult,
    ) -> None:
        """Publish a dictation.validation event"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="dictation.validation",
            data={
                "plugin_id": self.plugin_id,
                "is_valid": validation_result.is_valid,
                "issue_count": len(validation_result.issues),
                "suggestions": validation_result.suggestions[:3],  # Top 3
            },
            session_id=session_id,
            source_engine="dictation",
        )


__all__ = [
    "BaseDictationPlugin",
    "ValidationResult",
    "ValidationSeverity",
    "SectionConstraint",
]
