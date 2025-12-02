"""
SSML Processor for Natural Speech Rhythm

Injects SSML tags into text to improve TTS naturalness through:
- Sentence-ending pauses
- Clause/punctuation pauses
- List item pauses
- Paragraph breaks

Designed for ElevenLabs TTS which supports a subset of SSML tags.

Phase: Voice Mode Latency Optimization
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class VoiceStyle(str, Enum):
    """Voice styles that affect SSML processing."""

    CONVERSATIONAL = "conversational"  # Default - natural speech
    NARRATION = "narration"  # Longer pauses, more dramatic
    QUICK = "quick"  # Shorter pauses for fast responses


@dataclass
class SSMLConfig:
    """
    Configuration for SSML tag injection.

    Default pause durations are tuned for natural conversational speech.
    Adjust based on voice style and user preference.
    """

    # Pause after sentence-ending punctuation (. ! ?)
    sentence_pause_ms: int = 300

    # Pause after clause punctuation (, ; :)
    clause_pause_ms: int = 200

    # Pause before list items (when detected)
    list_item_pause_ms: int = 400

    # Pause for paragraph breaks (double newlines)
    paragraph_pause_ms: int = 600

    # Pause after question marks (slightly longer for effect)
    question_pause_ms: int = 350

    # Pause after exclamation marks
    exclamation_pause_ms: int = 280

    # Enable/disable SSML processing
    enabled: bool = True


# Preset configurations for different voice styles
STYLE_PRESETS = {
    VoiceStyle.CONVERSATIONAL: SSMLConfig(
        sentence_pause_ms=300,
        clause_pause_ms=200,
        list_item_pause_ms=400,
        paragraph_pause_ms=600,
        question_pause_ms=350,
        exclamation_pause_ms=280,
    ),
    VoiceStyle.NARRATION: SSMLConfig(
        sentence_pause_ms=450,
        clause_pause_ms=300,
        list_item_pause_ms=500,
        paragraph_pause_ms=800,
        question_pause_ms=500,
        exclamation_pause_ms=400,
    ),
    VoiceStyle.QUICK: SSMLConfig(
        sentence_pause_ms=150,
        clause_pause_ms=100,
        list_item_pause_ms=200,
        paragraph_pause_ms=300,
        question_pause_ms=180,
        exclamation_pause_ms=140,
    ),
}


class SSMLProcessor:
    """
    Injects SSML tags for natural speech rhythm.

    Processes text to add <break> tags at appropriate points:
    - After sentences for natural pausing
    - After clauses for breath points
    - Before list items for clarity
    - At paragraph breaks for topic transitions

    ElevenLabs SSML Support:
    - <break time="Xs"/> or <break time="Xms"/> - pauses
    - <emphasis> - not fully supported, use sparingly
    - Most other SSML tags are ignored

    Usage:
        processor = SSMLProcessor()

        # Process text before sending to TTS
        ssml_text = processor.process("Hello! How are you?")
        # Result: "Hello!<break time=\"280ms\"/> How are you?<break time=\"350ms\"/>"

        # Use a specific style
        ssml_text = processor.process(text, style=VoiceStyle.NARRATION)
    """

    def __init__(self, config: Optional[SSMLConfig] = None):
        """
        Initialize the SSML processor.

        Args:
            config: Optional custom configuration. Uses CONVERSATIONAL preset if not provided.
        """
        self._config = config or STYLE_PRESETS[VoiceStyle.CONVERSATIONAL]

    def process(
        self,
        text: str,
        style: Optional[VoiceStyle] = None,
    ) -> str:
        """
        Process text and inject SSML break tags.

        Args:
            text: Plain text to process
            style: Optional voice style override (uses config style if not specified)

        Returns:
            Text with SSML <break> tags injected
        """
        if not text or not self._config.enabled:
            return text

        # Use style preset if specified
        config = STYLE_PRESETS.get(style, self._config) if style else self._config

        result = text

        # Process in order of precedence (most specific first)
        result = self._add_paragraph_breaks(result, config)
        result = self._add_list_pauses(result, config)
        result = self._add_sentence_pauses(result, config)
        result = self._add_clause_pauses(result, config)

        # Clean up any duplicate breaks
        result = self._clean_duplicate_breaks(result)

        return result

    def _add_sentence_pauses(self, text: str, config: SSMLConfig) -> str:
        """
        Add pauses after sentence-ending punctuation.

        Handles:
        - Period (.)
        - Question mark (?) - slightly longer pause
        - Exclamation mark (!)

        Preserves existing breaks and handles quoted text.
        """
        # Question marks - longer pause for effect
        text = re.sub(
            r"\?(?!\s*<break)(\s*)",
            f'?<break time="{config.question_pause_ms}ms"/>\\1',
            text,
        )

        # Exclamation marks
        text = re.sub(
            r"!(?!\s*<break)(\s*)",
            f'!<break time="{config.exclamation_pause_ms}ms"/>\\1',
            text,
        )

        # Periods - but not in abbreviations (e.g., "Dr.", "etc.")
        # Look for period followed by space and capital letter or end of string
        text = re.sub(
            r"\.(?!\s*<break)(\s+)(?=[A-Z]|$)",
            f'.<break time="{config.sentence_pause_ms}ms"/>\\1',
            text,
        )

        return text

    def _add_clause_pauses(self, text: str, config: SSMLConfig) -> str:
        """
        Add pauses after clause punctuation.

        Handles:
        - Comma (,)
        - Semicolon (;)
        - Colon (:)
        - Em-dash (—)

        Only adds pause if followed by space (natural pause point).
        """
        # Comma followed by space
        text = re.sub(
            r",(?!\s*<break)(\s+)",
            f',<break time="{config.clause_pause_ms}ms"/>\\1',
            text,
        )

        # Semicolon followed by space
        text = re.sub(
            r";(?!\s*<break)(\s+)",
            f';<break time="{config.clause_pause_ms}ms"/>\\1',
            text,
        )

        # Colon followed by space (but not in URLs or times)
        text = re.sub(
            r":(?!\d)(?!\s*<break)(\s+)",
            f':<break time="{config.clause_pause_ms}ms"/>\\1',
            text,
        )

        # Em-dash
        text = re.sub(
            r"—(?!\s*<break)(\s*)",
            f'—<break time="{config.clause_pause_ms}ms"/>\\1',
            text,
        )

        return text

    def _add_list_pauses(self, text: str, config: SSMLConfig) -> str:
        """
        Add pauses before list items.

        Detects patterns like:
        - "First, ... Second, ..."
        - "1. ... 2. ..."
        - Bullet points

        Adds pause before each item for clarity.
        """
        # Ordinal words (First, Second, Third, etc.)
        ordinals = (
            r"\b(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|"
            r"Ninth|Tenth|Next|Finally|Lastly|Also|Additionally)\b"
        )
        text = re.sub(
            rf"(\s)({ordinals})",
            f'\\1<break time="{config.list_item_pause_ms}ms"/>\\2',
            text,
            flags=re.IGNORECASE,
        )

        # Numbered lists (1. 2. etc.) at start of content
        text = re.sub(
            r"(\n\s*)(\d+\.)",
            f'\\1<break time="{config.list_item_pause_ms}ms"/>\\2',
            text,
        )

        return text

    def _add_paragraph_breaks(self, text: str, config: SSMLConfig) -> str:
        """
        Add longer pauses at paragraph breaks.

        Detects double newlines as paragraph breaks and adds
        a longer pause for topic transition effect.
        """
        # Double newline = paragraph break
        text = re.sub(
            r"\n\n+",
            f'\n<break time="{config.paragraph_pause_ms}ms"/>\n',
            text,
        )

        return text

    def _clean_duplicate_breaks(self, text: str) -> str:
        """
        Remove duplicate or adjacent break tags.

        When multiple rules match the same position, this consolidates
        to a single break with the longest duration.
        """
        # Find sequences of adjacent breaks and keep the longest
        pattern = r'(<break time="(\d+)ms"/>)(\s*)(<break time="(\d+)ms"/>)'

        def keep_longest(match):
            time1 = int(match.group(2))
            time2 = int(match.group(5))
            longest = max(time1, time2)
            return f'<break time="{longest}ms"/>{match.group(3)}'

        # Apply repeatedly until no more duplicates
        prev_text = ""
        while prev_text != text:
            prev_text = text
            text = re.sub(pattern, keep_longest, text)

        return text

    def set_config(self, config: SSMLConfig) -> None:
        """Update the processor configuration."""
        self._config = config

    def enable(self) -> None:
        """Enable SSML processing."""
        self._config.enabled = True

    def disable(self) -> None:
        """Disable SSML processing (pass-through mode)."""
        self._config.enabled = False


# Global processor instance with default config
ssml_processor = SSMLProcessor()
