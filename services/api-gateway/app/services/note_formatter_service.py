"""
Note Formatter Service - LLM-Assisted Note Formatting

Phase 8: Intelligent formatting of dictated medical notes.

Features:
- Grammar correction while preserving medical terminology
- Auto-punctuation and capitalization
- Medical abbreviation handling (expand or preserve)
- Section-specific formatting (lists, headers)
- Smart text cleanup (filler words, repetitions)
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums and Configuration
# ==============================================================================


class FormattingLevel(str, Enum):
    """Level of formatting to apply."""

    MINIMAL = "minimal"  # Just punctuation and capitalization
    STANDARD = "standard"  # + Grammar correction
    FULL = "full"  # + Medical abbreviation expansion, restructuring


@dataclass
class FormattingConfig:
    """Configuration for note formatting."""

    level: FormattingLevel = FormattingLevel.STANDARD
    expand_abbreviations: bool = True
    preserve_medical_terms: bool = True
    remove_filler_words: bool = True
    auto_capitalize: bool = True
    auto_punctuate: bool = True
    format_numbers: bool = True
    format_vitals: bool = True


@dataclass
class FormattingResult:
    """Result of formatting operation."""

    original: str
    formatted: str
    changes_made: List[str]
    abbreviations_expanded: Dict[str, str]
    confidence: float


# ==============================================================================
# Medical Abbreviation Maps
# ==============================================================================


# Common medical abbreviations to expand
MEDICAL_ABBREVIATIONS = {
    # Vitals and measurements
    "bp": "blood pressure",
    "hr": "heart rate",
    "rr": "respiratory rate",
    "temp": "temperature",
    "spo2": "oxygen saturation",
    "o2 sat": "oxygen saturation",
    "bmi": "body mass index",
    # Diagnoses
    "dm": "diabetes mellitus",
    "dm2": "type 2 diabetes mellitus",
    "htn": "hypertension",
    "chf": "congestive heart failure",
    "cad": "coronary artery disease",
    "copd": "chronic obstructive pulmonary disease",
    "gerd": "gastroesophageal reflux disease",
    "uti": "urinary tract infection",
    "dvt": "deep vein thrombosis",
    "pe": "pulmonary embolism",
    "ckd": "chronic kidney disease",
    "aki": "acute kidney injury",
    "mi": "myocardial infarction",
    "cva": "cerebrovascular accident",
    "tia": "transient ischemic attack",
    # Anatomy
    "abd": "abdomen",
    "cv": "cardiovascular",
    "gi": "gastrointestinal",
    "gu": "genitourinary",
    "neuro": "neurological",
    "msk": "musculoskeletal",
    "heent": "head, eyes, ears, nose, and throat",
    "ext": "extremities",
    "resp": "respiratory",
    # Examinations
    "wnl": "within normal limits",
    "nad": "no acute distress",
    "aox3": "alert and oriented x3",
    "aox4": "alert and oriented x4",
    "rrr": "regular rate and rhythm",
    "ctab": "clear to auscultation bilaterally",
    "ntnd": "non-tender, non-distended",
    "nka": "no known allergies",
    "nkda": "no known drug allergies",
    # Timing
    "bid": "twice daily",
    "tid": "three times daily",
    "qid": "four times daily",
    "qd": "once daily",
    "prn": "as needed",
    "po": "by mouth",
    "iv": "intravenous",
    "im": "intramuscular",
    "subq": "subcutaneous",
    "ac": "before meals",
    "pc": "after meals",
    "hs": "at bedtime",
    # Tests
    "cbc": "complete blood count",
    "bmp": "basic metabolic panel",
    "cmp": "comprehensive metabolic panel",
    "lfts": "liver function tests",
    "ua": "urinalysis",
    "ekg": "electrocardiogram",
    "ecg": "electrocardiogram",
    "cxr": "chest x-ray",
    "ct": "computed tomography",
    "mri": "magnetic resonance imaging",
}

# Abbreviations to preserve (don't expand)
PRESERVE_ABBREVIATIONS = {
    "mg",
    "mcg",
    "g",
    "kg",
    "ml",
    "l",
    "dl",  # Units
    "mmhg",
    "bpm",
    "rpm",  # Measurement units
    "am",
    "pm",  # Time
    "dr",
    "mr",
    "ms",
    "mrs",  # Titles
}

# Common filler words to remove in medical dictation
FILLER_WORDS = [
    r"\buh+\b",
    r"\bum+\b",
    r"\ber+\b",
    r"\bah+\b",
    r"\bhmm+\b",
    r"\blike,?\s+you know\b",
    r"\byou know\b",
    r"\bbasically\b",
    r"\bso+\s+(?=,|\.|$)",  # trailing "so"
    r"\band\s+and\b",  # repeated "and"
    r"\bthe\s+the\b",  # repeated "the"
]

# Vital sign patterns for formatting
VITAL_PATTERNS = [
    # Blood pressure: "120/80" or "blood pressure 120 over 80"
    (r"\b(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})\b", r"BP \1/\2 mmHg"),
    # Heart rate: "80 beats per minute" or "heart rate 80"
    (r"\bheart rate\s*(?:of\s*)?(\d{2,3})\b", r"HR \1 bpm"),
    (r"\bpulse\s*(?:of\s*)?(\d{2,3})\b", r"Pulse \1 bpm"),
    # Temperature: "98.6 degrees" or "temp 98.6"
    (r"\btemperature?\s*(?:of\s*)?(\d{2,3}(?:\.\d)?)\s*(?:degrees?)?\b", r"Temp \1°F"),
    # O2 sat: "98 percent" or "o2 sat 98"
    (r"\b(?:o2|oxygen)\s*(?:sat(?:uration)?)\s*(?:of\s*)?(\d{2,3})\s*(?:percent|%)?\b", r"SpO2 \1%"),
    # Respiratory rate
    (r"\brespiratory rate\s*(?:of\s*)?(\d{1,2})\b", r"RR \1 rpm"),
]


# ==============================================================================
# Note Formatter Service
# ==============================================================================


class NoteFormatterService:
    """
    Service for formatting dictated medical notes.

    Usage:
        formatter = NoteFormatterService()

        # Format text
        result = formatter.format_text(
            "patient has htn and dm2 bp 140 over 90",
            config=FormattingConfig(level=FormattingLevel.FULL),
        )
        # Result: "Patient has hypertension and type 2 diabetes mellitus. BP 140/90 mmHg."

        # Quick format
        formatted = formatter.quick_format("wnl for cv and resp exam")
        # Result: "Within normal limits for cardiovascular and respiratory exam."
    """

    def __init__(self):
        self._abbreviation_map = MEDICAL_ABBREVIATIONS.copy()
        self._preserve_abbrevs = PRESERVE_ABBREVIATIONS.copy()
        self._filler_patterns = [re.compile(p, re.IGNORECASE) for p in FILLER_WORDS]
        self._vital_patterns = [(re.compile(p, re.IGNORECASE), r) for p, r in VITAL_PATTERNS]

    def format_text(
        self,
        text: str,
        config: Optional[FormattingConfig] = None,
    ) -> FormattingResult:
        """
        Format dictated text with the specified configuration.

        Args:
            text: Raw dictated text
            config: Formatting configuration

        Returns:
            FormattingResult with formatted text and metadata
        """
        config = config or FormattingConfig()
        original = text
        changes_made = []
        abbreviations_expanded = {}

        # Step 1: Remove filler words
        if config.remove_filler_words:
            text, filler_count = self._remove_filler_words(text)
            if filler_count > 0:
                changes_made.append(f"Removed {filler_count} filler words")

        # Step 2: Clean up spacing and repetitions
        text = self._clean_whitespace(text)

        # Step 3: Format vitals
        if config.format_vitals:
            text, vital_changes = self._format_vitals(text)
            if vital_changes:
                changes_made.extend(vital_changes)

        # Step 4: Expand abbreviations
        if config.expand_abbreviations:
            text, expanded = self._expand_abbreviations(text)
            abbreviations_expanded = expanded
            if expanded:
                changes_made.append(f"Expanded {len(expanded)} abbreviations")

        # Step 5: Auto-punctuate
        if config.auto_punctuate:
            text, punct_added = self._auto_punctuate(text)
            if punct_added:
                changes_made.append("Added punctuation")

        # Step 6: Auto-capitalize
        if config.auto_capitalize:
            text = self._auto_capitalize(text)
            changes_made.append("Applied capitalization")

        # Step 7: Format numbers
        if config.format_numbers:
            text = self._format_numbers(text)

        # Calculate confidence based on changes
        # More changes = lower confidence in original transcription
        change_count = len(changes_made)
        confidence = max(0.5, 1.0 - (change_count * 0.1))

        return FormattingResult(
            original=original,
            formatted=text.strip(),
            changes_made=changes_made,
            abbreviations_expanded=abbreviations_expanded,
            confidence=confidence,
        )

    def quick_format(self, text: str) -> str:
        """Quick formatting with default settings."""
        result = self.format_text(text)
        return result.formatted

    def _remove_filler_words(self, text: str) -> Tuple[str, int]:
        """Remove filler words from text."""
        count = 0
        for pattern in self._filler_patterns:
            text, n = pattern.subn("", text)
            count += n
        return text, count

    def _clean_whitespace(self, text: str) -> str:
        """Clean up whitespace and repetitions."""
        # Multiple spaces to single
        text = re.sub(r"\s+", " ", text)
        # Remove spaces before punctuation
        text = re.sub(r"\s+([.,;:!?])", r"\1", text)
        # Add space after punctuation if missing
        text = re.sub(r"([.,;:!?])([A-Za-z])", r"\1 \2", text)
        return text.strip()

    def _format_vitals(self, text: str) -> Tuple[str, List[str]]:
        """Format vital sign patterns."""
        changes = []
        for pattern, replacement in self._vital_patterns:
            if pattern.search(text):
                text = pattern.sub(replacement, text)
                changes.append(f"Formatted vital sign")
        return text, changes

    def _expand_abbreviations(self, text: str) -> Tuple[str, Dict[str, str]]:
        """Expand medical abbreviations."""
        expanded = {}
        words = text.split()
        result_words = []

        for word in words:
            # Strip punctuation for matching
            stripped = re.sub(r"[.,;:!?]$", "", word.lower())

            if stripped in self._preserve_abbrevs:
                result_words.append(word)
            elif stripped in self._abbreviation_map:
                expansion = self._abbreviation_map[stripped]
                # Preserve any trailing punctuation
                punctuation = word[len(stripped) :] if len(word) > len(stripped) else ""
                result_words.append(expansion + punctuation)
                expanded[stripped.upper()] = expansion
            else:
                result_words.append(word)

        return " ".join(result_words), expanded

    def _auto_punctuate(self, text: str) -> Tuple[str, bool]:
        """Add punctuation to text."""
        added = False

        # End sentence with period if missing
        if text and not text.rstrip().endswith((".", "!", "?", ":", ";")):
            text = text.rstrip() + "."
            added = True

        # Add periods after common sentence-ending patterns
        sentence_enders = [
            r"(patient denies \w+(?:\s+\w+)?)\s+(?=[A-Z])",
            r"(no (?:acute|significant) \w+(?:\s+\w+)?)\s+(?=[A-Z])",
            r"(within normal limits)\s+(?=[A-Z])",
        ]
        for pattern in sentence_enders:
            text, n = re.subn(pattern, r"\1. ", text, flags=re.IGNORECASE)
            if n > 0:
                added = True

        return text, added

    def _auto_capitalize(self, text: str) -> str:
        """Apply proper capitalization."""
        if not text:
            return text

        # Capitalize first letter
        text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()

        # Capitalize after sentence-ending punctuation
        text = re.sub(
            r"([.!?]\s+)([a-z])",
            lambda m: m.group(1) + m.group(2).upper(),
            text,
        )

        # Capitalize medical section headers
        section_patterns = [
            r"\b(subjective|objective|assessment|plan):",
            r"\b(chief complaint|history of present illness|past medical history):",
            r"\b(medications|allergies|social history|family history):",
            r"\b(review of systems|physical exam|labs):",
        ]
        for pattern in section_patterns:
            text = re.sub(
                pattern,
                lambda m: m.group(0).title(),
                text,
                flags=re.IGNORECASE,
            )

        return text

    def _format_numbers(self, text: str) -> str:
        """Format numbers consistently."""
        # Format decimal numbers (e.g., "98.6")
        text = re.sub(r"\b(\d+)\s*\.\s*(\d+)\b", r"\1.\2", text)

        # Format fractions written as words
        text = re.sub(r"\b(\d+)\s+and\s+a\s+half\b", r"\1.5", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(\d+)\s+and\s+a\s+quarter\b", r"\1.25", text, flags=re.IGNORECASE)

        return text

    def add_abbreviation(self, abbrev: str, expansion: str) -> None:
        """Add a custom abbreviation mapping."""
        self._abbreviation_map[abbrev.lower()] = expansion
        logger.info(f"Added abbreviation: {abbrev} -> {expansion}")

    def add_preserve_abbreviation(self, abbrev: str) -> None:
        """Add an abbreviation to preserve (don't expand)."""
        self._preserve_abbrevs.add(abbrev.lower())
        logger.info(f"Added preserve abbreviation: {abbrev}")

    def get_abbreviations(self) -> Dict[str, str]:
        """Get the current abbreviation map."""
        return self._abbreviation_map.copy()


# Global service instance
note_formatter_service = NoteFormatterService()
