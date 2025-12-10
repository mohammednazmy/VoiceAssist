"""
Semantic VAD Service

Advanced Voice Activity Detection that understands conversation meaning.
Unlike traditional VAD that only detects silence, this service analyzes
linguistic patterns to determine when a user has finished their thought,
even during natural pauses.

Phase 6: Edge Case Hardening
Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md (Part 2.3.1)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple
import re

from app.core.logging import get_logger

logger = get_logger(__name__)


# =============================================================================
# Types
# =============================================================================


class TurnCompletionConfidence(str, Enum):
    """Confidence level for turn completion."""

    HIGH = "high"  # >85% - Respond immediately
    MODERATE = "moderate"  # 65-85% - Respond with brief wait
    LOW = "low"  # 40-65% - Wait for more input
    VERY_LOW = "very_low"  # <40% - User is clearly continuing


@dataclass
class SemanticVADResult:
    """Result of semantic VAD analysis."""

    completion_confidence: float
    confidence_level: TurnCompletionConfidence
    action: str  # 'respond', 'wait', 'prompt_continuation'
    recommended_wait_ms: int
    use_filler_phrase: bool
    reason: str
    detected_signals: Dict[str, List[str]]


@dataclass
class ProsodyHints:
    """Prosody analysis hints for VAD."""

    rising_intonation: bool = False
    mid_word_cutoff: bool = False
    energy_decline: bool = False
    speech_rate_change: float = 0.0  # Negative = slowing down


@dataclass
class SemanticVADConfig:
    """Configuration for semantic VAD."""

    # Confidence thresholds
    high_confidence_threshold: float = 0.85
    moderate_confidence_threshold: float = 0.65
    low_confidence_threshold: float = 0.40

    # Wait times (ms)
    high_confidence_wait_ms: int = 200
    moderate_confidence_wait_ms: int = 500
    low_confidence_wait_ms: int = 1500
    very_low_confidence_wait_ms: int = 3000

    # Signal weights
    strong_completion_weight: float = 0.25
    weak_completion_weight: float = 0.15
    continuation_weight: float = 0.30

    # Silence thresholds (ms)
    long_silence_threshold_ms: int = 2000
    medium_silence_threshold_ms: int = 1000
    short_silence_threshold_ms: int = 300

    # Filler phrase threshold (word count)
    filler_phrase_word_threshold: int = 10


DEFAULT_SEMANTIC_VAD_CONFIG = SemanticVADConfig()


# =============================================================================
# Semantic VAD Service
# =============================================================================


class SemanticVADService:
    """
    Advanced Semantic VAD that understands conversation meaning.

    Unlike traditional VAD that only detects silence, this service
    analyzes linguistic patterns to determine when a user has
    finished their thought, even during natural pauses.
    """

    # Strong completion indicators
    QUESTION_ENDINGS = re.compile(r"[?]\s*$")
    COMMAND_VERBS: Set[str] = {
        "stop",
        "go",
        "start",
        "show",
        "tell",
        "help",
        "find",
        "search",
        "open",
        "close",
        "play",
        "pause",
        "cancel",
        "quit",
        "exit",
        "done",
        "finish",
        "end",
        "next",
        "previous",
        "back",
        "forward",
        "skip",
        "repeat",
    }
    ACKNOWLEDGMENTS: Set[str] = {
        "okay",
        "ok",
        "thanks",
        "thank you",
        "got it",
        "yes",
        "no",
        "sure",
        "right",
        "alright",
        "yep",
        "nope",
        "yeah",
        "nah",
        "uh huh",
        "mm hmm",
        "understood",
        "perfect",
        "great",
        "good",
        "fine",
        "cool",
    }
    FAREWELLS: Set[str] = {
        "bye",
        "goodbye",
        "see you",
        "later",
        "good night",
        "take care",
        "farewell",
        "see ya",
        "bye bye",
    }

    # Continuation indicators
    HESITATION_MARKERS: Set[str] = {
        "um",
        "uh",
        "er",
        "hmm",
        "like",
        "you know",
        "i mean",
        "well",
        "so",
        "anyway",
        "basically",
        "actually",
        "kind of",
        "sort of",
    }
    TRAILING_CONJUNCTIONS: Set[str] = {
        "and",
        "but",
        "or",
        "so",
        "because",
        "although",
        "however",
        "also",
        "then",
        "yet",
        "since",
        "while",
        "if",
        "when",
        "where",
        "that",
        "which",
    }
    INCOMPLETE_PATTERNS = [
        re.compile(r"^(i want to|i need to|can you|could you|would you)\s*$", re.I),
        re.compile(r"^(what if|how about|let me|let's)\s*$", re.I),
        re.compile(r"^.+\s+(and|but|or|so|because)\s*$", re.I),
        re.compile(r"^(the|a|an|my|your)\s+\w+\s*$", re.I),
        re.compile(r"^(i think|i believe|i feel|i want|i need)\s*$", re.I),
        re.compile(r"^(please|can you please|could you please)\s*$", re.I),
        re.compile(r"^(tell me|show me|give me|help me)\s*$", re.I),
    ]

    # Medical/clinical context patterns
    MEDICAL_INCOMPLETE_PATTERNS = [
        re.compile(r"^(patient has|patient is|diagnosis is|treatment is)\s*$", re.I),
        re.compile(r"^(symptoms include|presenting with|complaining of)\s*$", re.I),
        re.compile(r"^(blood pressure|heart rate|temperature|oxygen)\s*$", re.I),
    ]

    def __init__(self, config: Optional[SemanticVADConfig] = None):
        self._config = config or DEFAULT_SEMANTIC_VAD_CONFIG
        self._conversation_context: List[str] = []
        self._last_analysis_time: float = 0

    # =========================================================================
    # Main Analysis
    # =========================================================================

    def analyze(
        self,
        transcript: str,
        silence_duration_ms: int,
        is_partial: bool = False,
        prosody_hints: Optional[ProsodyHints] = None,
    ) -> SemanticVADResult:
        """
        Analyze transcript to determine if user turn is complete.

        Args:
            transcript: Current transcript text
            silence_duration_ms: Duration of silence after last speech
            is_partial: Whether this is a partial (streaming) transcript
            prosody_hints: Optional prosody analysis results

        Returns:
            SemanticVADResult with completion confidence and recommended action
        """
        text = transcript.strip().lower()
        words = text.split()

        signals: Dict[str, List[str]] = {
            "strong_completion": [],
            "weak_completion": [],
            "continuation": [],
        }

        # =============================================
        # PHASE 1: Detect continuation signals
        # =============================================

        # Hesitation markers
        for marker in self.HESITATION_MARKERS:
            if text.endswith(marker) or text.endswith(f"{marker} "):
                signals["continuation"].append(f"hesitation:{marker}")

        # Trailing conjunctions
        last_word = words[-1].rstrip(".,!?;:") if words else ""
        if last_word in self.TRAILING_CONJUNCTIONS:
            signals["continuation"].append(f"conjunction:{last_word}")

        # Incomplete patterns
        for pattern in self.INCOMPLETE_PATTERNS:
            if pattern.search(text):
                signals["continuation"].append("incomplete_pattern")
                break

        # Medical incomplete patterns
        for pattern in self.MEDICAL_INCOMPLETE_PATTERNS:
            if pattern.search(text):
                signals["continuation"].append("medical_incomplete")
                break

        # Prosody-based continuation
        if prosody_hints:
            if prosody_hints.rising_intonation:
                signals["continuation"].append("rising_intonation")
            if prosody_hints.mid_word_cutoff:
                signals["continuation"].append("mid_word_cutoff")

        # =============================================
        # PHASE 2: Detect completion signals
        # =============================================

        # Question endings (strong)
        if self.QUESTION_ENDINGS.search(transcript):
            signals["strong_completion"].append("question")

        # Command verbs (strong for short utterances)
        if len(words) <= 5 and last_word in self.COMMAND_VERBS:
            signals["strong_completion"].append(f"command:{last_word}")

        # Acknowledgments (strong)
        if text in self.ACKNOWLEDGMENTS or last_word in self.ACKNOWLEDGMENTS:
            signals["strong_completion"].append(f"acknowledgment:{last_word}")

        # Farewells (strong)
        for farewell in self.FAREWELLS:
            if farewell in text:
                signals["strong_completion"].append(f"farewell:{farewell}")
                break

        # Statement endings (weak)
        if transcript.rstrip().endswith(".") or transcript.rstrip().endswith("!"):
            signals["weak_completion"].append("statement_ending")

        # Complete sentences (weak)
        if self._looks_complete(text):
            signals["weak_completion"].append("complete_sentence")

        # =============================================
        # PHASE 3: Calculate confidence
        # =============================================

        confidence = 0.5  # Base confidence

        # Strong completion signals
        confidence += len(signals["strong_completion"]) * self._config.strong_completion_weight

        # Weak completion signals
        confidence += len(signals["weak_completion"]) * self._config.weak_completion_weight

        # Continuation signals (decrease confidence)
        confidence -= len(signals["continuation"]) * self._config.continuation_weight

        # Silence duration factor
        if silence_duration_ms >= self._config.long_silence_threshold_ms:
            confidence += 0.3
        elif silence_duration_ms >= self._config.medium_silence_threshold_ms:
            confidence += 0.15
        elif silence_duration_ms < self._config.short_silence_threshold_ms:
            confidence -= 0.1

        # Partial transcripts are less certain
        if is_partial:
            confidence -= 0.2

        # Prosody energy decline suggests completion
        if prosody_hints and prosody_hints.energy_decline:
            confidence += 0.1

        # Clamp to [0, 1]
        confidence = max(0.0, min(1.0, confidence))

        # =============================================
        # PHASE 4: Determine action
        # =============================================

        if confidence >= self._config.high_confidence_threshold:
            level = TurnCompletionConfidence.HIGH
            action = "respond"
            wait_ms = self._config.high_confidence_wait_ms
            use_filler = False
            reason = "High confidence turn completion"
        elif confidence >= self._config.moderate_confidence_threshold:
            level = TurnCompletionConfidence.MODERATE
            action = "respond"
            wait_ms = self._config.moderate_confidence_wait_ms
            use_filler = len(words) > self._config.filler_phrase_word_threshold
            reason = "Moderate confidence turn completion"
        elif confidence >= self._config.low_confidence_threshold:
            level = TurnCompletionConfidence.LOW
            action = "wait"
            wait_ms = self._config.low_confidence_wait_ms
            use_filler = False
            reason = "Low confidence - waiting for more input"
        else:
            level = TurnCompletionConfidence.VERY_LOW
            action = "wait"
            wait_ms = self._config.very_low_confidence_wait_ms
            use_filler = False
            reason = "Continuation signals detected"

        # Override for multiple continuation signals
        if len(signals["continuation"]) >= 2:
            action = "wait"
            wait_ms = max(wait_ms, 2000)
            reason = "Multiple continuation signals detected"

        return SemanticVADResult(
            completion_confidence=confidence,
            confidence_level=level,
            action=action,
            recommended_wait_ms=wait_ms,
            use_filler_phrase=use_filler,
            reason=reason,
            detected_signals=signals,
        )

    def should_respond(
        self,
        transcript: str,
        silence_duration_ms: int,
        is_partial: bool = False,
    ) -> Tuple[bool, int]:
        """
        Quick check if we should respond to the user.

        Returns:
            Tuple of (should_respond: bool, wait_ms: int)
        """
        result = self.analyze(transcript, silence_duration_ms, is_partial)
        return (result.action == "respond", result.recommended_wait_ms)

    # =========================================================================
    # Context Management
    # =========================================================================

    def add_context(self, utterance: str) -> None:
        """
        Add an utterance to the conversation context.

        Args:
            utterance: The utterance to add
        """
        self._conversation_context.append(utterance)
        # Keep last 10 utterances
        if len(self._conversation_context) > 10:
            self._conversation_context.pop(0)

    def clear_context(self) -> None:
        """Clear the conversation context."""
        self._conversation_context = []

    def get_context(self) -> List[str]:
        """Get the current conversation context."""
        return self._conversation_context.copy()

    # =========================================================================
    # Filler Phrase Selection
    # =========================================================================

    def get_filler_phrase(self, query_complexity: str = "medium") -> str:
        """
        Get an appropriate filler phrase based on query complexity.

        Args:
            query_complexity: 'simple', 'medium', or 'complex'

        Returns:
            A filler phrase to use while processing
        """
        fillers = {
            "simple": [
                "Sure.",
                "Okay.",
                "Let me see.",
                "One moment.",
            ],
            "medium": [
                "Let me check that for you.",
                "I'm looking into that.",
                "Give me a moment.",
                "Let me find that information.",
            ],
            "complex": [
                "That's a great question. Let me think about this.",
                "Let me consider the best way to explain this.",
                "I'm gathering some information on that.",
                "Let me pull together a comprehensive answer.",
            ],
        }
        import random

        options = fillers.get(query_complexity, fillers["medium"])
        return random.choice(options)

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _looks_complete(self, text: str) -> bool:
        """
        Check if text looks like a complete sentence.

        Uses simple heuristics - has subject + verb structure.
        """
        # Must have at least 3 words
        words = text.split()
        if len(words) < 3:
            return False

        # Common sentence starters
        starters = {"i", "you", "we", "they", "he", "she", "it", "the", "a", "an", "my", "your", "our", "this", "that", "what", "how", "why", "when", "where", "who", "which", "please", "can", "could", "would", "will", "do", "does", "is", "are", "was", "were"}

        # Common verbs
        verbs = {"is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "can", "need", "want", "like", "know", "think", "see", "go", "come", "take", "make", "get", "find", "give", "tell", "say", "use", "try", "help", "show", "look", "feel", "seem", "appear"}

        first_word = words[0].lower()
        has_starter = first_word in starters
        has_verb = any(w.lower() in verbs for w in words)

        return has_starter and has_verb


# =============================================================================
# Singleton Instance
# =============================================================================

semantic_vad_service = SemanticVADService()


# =============================================================================
# Factory Function
# =============================================================================


def create_semantic_vad_service(
    config: Optional[SemanticVADConfig] = None,
) -> SemanticVADService:
    """
    Create a new SemanticVADService instance.

    Args:
        config: Optional configuration for the service

    Returns:
        A new SemanticVADService instance
    """
    return SemanticVADService(config)
