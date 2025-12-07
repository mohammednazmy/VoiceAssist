"""
Continuation Detection Service

Analyzes speech transcripts to detect when a user intends to continue speaking
after a natural pause. This enables more natural conversation flow by preventing
the AI from responding prematurely to incomplete utterances.

Detection Signals:
- Trailing conjunctions ("and", "but", "so", "because")
- Filler words ("um", "uh", "like", "you know")
- Incomplete sentence structure
- Rising intonation (via prosody data if available)
- Short fragment length

Natural Conversation Flow: Phase 2 - Continuation Detection
Feature Flag: backend.voice_continuation_detection
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Type Definitions
# ============================================================================

SupportedLanguage = Literal["en", "ar", "es", "fr", "de", "zh", "ja", "ko", "pt", "ru", "hi", "tr"]

ContinuationSignalType = Literal[
    "trailing_conjunction",  # Ends with "and", "but", "so", etc.
    "filler_word",  # Contains "um", "uh", "like", etc.
    "incomplete_sentence",  # No sentence-ending punctuation
    "short_fragment",  # Less than N words
    "rising_intonation",  # Prosody indicates question/continuation
    "mid_thought_marker",  # "I mean", "you know", etc.
    "hesitation_pattern",  # Multiple short pauses
]


# ============================================================================
# Pattern Definitions
# ============================================================================


@dataclass
class ContinuationMarkers:
    """Language-specific markers that indicate continuation intent."""

    # Trailing conjunctions - user hasn't finished their thought
    trailing_conjunctions: List[str]

    # Filler words - user is thinking
    filler_words: List[str]

    # Mid-thought markers - user is reformulating
    mid_thought_markers: List[str]

    # Sentence starters that suggest incompleteness
    incomplete_starters: List[str]


# Language-specific continuation markers
CONTINUATION_MARKERS: Dict[SupportedLanguage, ContinuationMarkers] = {
    "en": ContinuationMarkers(
        trailing_conjunctions=[
            "and",
            "but",
            "so",
            "because",
            "or",
            "then",
            "also",
            "although",
            "however",
            "therefore",
            "thus",
            "hence",
            "yet",
            "while",
            "if",
            "unless",
            "until",
            "when",
            "where",
            "which",
            "that",
            "who",
        ],
        filler_words=[
            "um",
            "uh",
            "umm",
            "uhh",
            "er",
            "err",
            "ah",
            "hmm",
            "hm",
            "like",
            "well",
            "okay",
            "ok",
            "so",
            "right",
        ],
        mid_thought_markers=[
            "you know",
            "i mean",
            "kind of",
            "sort of",
            "basically",
            "actually",
            "honestly",
            "literally",
            "apparently",
        ],
        incomplete_starters=[
            "i think",
            "i want",
            "i need",
            "i would",
            "i was",
            "i am",
            "can you",
            "could you",
            "would you",
            "should i",
            "what if",
            "maybe",
            "perhaps",
            "probably",
        ],
    ),
    "ar": ContinuationMarkers(
        trailing_conjunctions=["و", "لكن", "ف", "ثم", "أو", "لأن", "إذا", "عندما"],
        filler_words=["يعني", "آه", "امم", "طيب", "يلا"],
        mid_thought_markers=["تعرف", "اقصد", "كمان"],
        incomplete_starters=["أريد", "أحتاج", "ممكن", "هل"],
    ),
    "es": ContinuationMarkers(
        trailing_conjunctions=["y", "pero", "entonces", "porque", "o", "aunque", "si"],
        filler_words=["eh", "um", "pues", "bueno", "este", "o sea"],
        mid_thought_markers=["sabes", "quiero decir", "tipo", "como"],
        incomplete_starters=["quiero", "necesito", "puedes", "podría"],
    ),
    "fr": ContinuationMarkers(
        trailing_conjunctions=["et", "mais", "donc", "parce que", "ou", "si", "quand"],
        filler_words=["euh", "hm", "ben", "alors", "enfin", "quoi"],
        mid_thought_markers=["tu sais", "je veux dire", "genre", "en fait"],
        incomplete_starters=["je veux", "je pense", "est-ce que", "peux-tu"],
    ),
    "de": ContinuationMarkers(
        trailing_conjunctions=["und", "aber", "also", "weil", "oder", "wenn", "dann"],
        filler_words=["ähm", "äh", "hm", "na ja", "also", "halt"],
        mid_thought_markers=["weißt du", "ich meine", "sozusagen", "eigentlich"],
        incomplete_starters=["ich möchte", "ich brauche", "kannst du", "könnte ich"],
    ),
    # Add minimal support for other languages
    "zh": ContinuationMarkers(
        trailing_conjunctions=["和", "但是", "所以", "因为", "或者", "然后"],
        filler_words=["嗯", "那个", "这个", "就是"],
        mid_thought_markers=["你知道", "我觉得"],
        incomplete_starters=["我想", "我要", "可以"],
    ),
    "ja": ContinuationMarkers(
        trailing_conjunctions=["と", "でも", "から", "けど", "それで"],
        filler_words=["えーと", "あの", "その", "まあ"],
        mid_thought_markers=["なんか", "つまり"],
        incomplete_starters=["思う", "欲しい", "できる"],
    ),
    "ko": ContinuationMarkers(
        trailing_conjunctions=["그리고", "하지만", "그래서", "왜냐하면", "또는"],
        filler_words=["음", "어", "그", "뭐"],
        mid_thought_markers=["알지", "말하자면"],
        incomplete_starters=["생각해", "원해", "할 수"],
    ),
    "pt": ContinuationMarkers(
        trailing_conjunctions=["e", "mas", "então", "porque", "ou", "se", "quando"],
        filler_words=["hum", "é", "tipo", "então", "bom"],
        mid_thought_markers=["sabe", "quer dizer", "tipo assim"],
        incomplete_starters=["eu quero", "preciso", "você pode"],
    ),
    "ru": ContinuationMarkers(
        trailing_conjunctions=["и", "но", "потому что", "или", "если", "когда", "тогда"],
        filler_words=["эм", "ну", "так", "вот", "это"],
        mid_thought_markers=["знаешь", "в смысле", "как бы"],
        incomplete_starters=["я хочу", "мне нужно", "можешь"],
    ),
    "hi": ContinuationMarkers(
        trailing_conjunctions=["और", "लेकिन", "तो", "क्योंकि", "या", "अगर"],
        filler_words=["उम", "अरे", "तो", "मतलब"],
        mid_thought_markers=["पता है", "मेरा मतलब"],
        incomplete_starters=["मुझे चाहिए", "क्या आप"],
    ),
    "tr": ContinuationMarkers(
        trailing_conjunctions=["ve", "ama", "çünkü", "veya", "eğer", "sonra"],
        filler_words=["şey", "yani", "hani", "işte"],
        mid_thought_markers=["biliyorsun", "demek istiyorum"],
        incomplete_starters=["istiyorum", "ihtiyacım var"],
    ),
}


@dataclass
class ContinuationSignal:
    """A detected signal that the user intends to continue speaking."""

    signal_type: ContinuationSignalType
    matched_text: str
    position: Literal["start", "middle", "end"]
    confidence: float  # 0.0 to 1.0


@dataclass
class ContinuationAnalysis:
    """Result of analyzing a transcript for continuation intent."""

    # Overall probability that user will continue (0.0 to 1.0)
    continuation_probability: float

    # Should we wait for more speech?
    should_wait: bool

    # Recommended additional wait time in ms (on top of normal endpointing)
    recommended_wait_ms: int

    # Detected signals
    signals: List[ContinuationSignal] = field(default_factory=list)

    # Reason for the decision
    reason: str = ""


@dataclass
class ProsodyHints:
    """Prosody information that helps determine continuation intent."""

    # Final pitch direction: "rising", "falling", "flat"
    pitch_trend: Optional[str] = None

    # Speaking rate relative to baseline: "slower", "normal", "faster"
    speaking_rate: Optional[str] = None

    # Energy level at end: "fading", "stable", "increasing"
    energy_trend: Optional[str] = None

    # Pause duration before this segment (ms)
    preceding_pause_ms: Optional[int] = None


# ============================================================================
# Continuation Detector Service
# ============================================================================


class ContinuationDetector:
    """
    Analyzes transcripts to detect when users intend to continue speaking.

    This service helps prevent the AI from responding prematurely when users:
    - Pause to think mid-sentence
    - Use filler words while formulating thoughts
    - Trail off with conjunctions indicating more to come
    """

    # Configuration
    DEFAULT_LANGUAGE = "en"

    # Thresholds
    MIN_WORDS_FOR_COMPLETE = 4  # Fragments under this are likely incomplete
    HIGH_CONFIDENCE_THRESHOLD = 0.7  # Above this, definitely wait
    MEDIUM_CONFIDENCE_THRESHOLD = 0.4  # Above this, probably wait

    # Wait time recommendations (ms)
    SHORT_WAIT = 500  # Quick check for continuation
    MEDIUM_WAIT = 1000  # Standard wait for thinking pause
    LONG_WAIT = 2000  # Extended wait for complex thoughts

    def __init__(self, default_language: str = "en"):
        """Initialize the continuation detector."""
        self.default_language = default_language
        logger.info(f"ContinuationDetector initialized (default_language={default_language})")

    def get_markers(self, language: str) -> ContinuationMarkers:
        """Get continuation markers for a language, falling back to English."""
        return CONTINUATION_MARKERS.get(language, CONTINUATION_MARKERS[self.DEFAULT_LANGUAGE])

    def analyze(
        self,
        transcript: str,
        language: str = "en",
        prosody: Optional[ProsodyHints] = None,
        context: Optional[Dict] = None,
    ) -> ContinuationAnalysis:
        """
        Analyze a transcript to determine if the user intends to continue.

        Args:
            transcript: The transcribed text to analyze
            language: Language code (e.g., "en", "ar", "es")
            prosody: Optional prosody information from STT
            context: Optional context (conversation history, user profile, etc.)

        Returns:
            ContinuationAnalysis with probability, signals, and recommendations
        """
        if not transcript or not transcript.strip():
            return ContinuationAnalysis(
                continuation_probability=0.0, should_wait=False, recommended_wait_ms=0, reason="Empty transcript"
            )

        transcript = transcript.strip()
        markers = self.get_markers(language)
        signals: List[ContinuationSignal] = []

        # Normalize for comparison
        text_lower = transcript.lower()
        words = text_lower.split()
        word_count = len(words)

        # ====================================================================
        # Signal Detection
        # ====================================================================

        # 1. Check for trailing conjunctions (strongest signal)
        trailing_conj = self._check_trailing_conjunction(words, markers)
        if trailing_conj:
            signals.append(trailing_conj)

        # 2. Check for filler words (strong signal when at end)
        filler_signal = self._check_filler_words(words, markers)
        if filler_signal:
            signals.append(filler_signal)

        # 3. Check for mid-thought markers
        mid_thought = self._check_mid_thought_markers(text_lower, markers)
        if mid_thought:
            signals.append(mid_thought)

        # 4. Check for incomplete sentence structure
        incomplete = self._check_incomplete_sentence(transcript, word_count)
        if incomplete:
            signals.append(incomplete)

        # 5. Check for short fragment
        if word_count < self.MIN_WORDS_FOR_COMPLETE:
            signals.append(
                ContinuationSignal(
                    signal_type="short_fragment",
                    matched_text=transcript,
                    position="middle",
                    confidence=0.3 if word_count > 1 else 0.5,
                )
            )

        # 6. Check prosody if available
        if prosody:
            prosody_signal = self._check_prosody(prosody)
            if prosody_signal:
                signals.append(prosody_signal)

        # ====================================================================
        # Calculate Overall Probability
        # ====================================================================

        if not signals:
            return ContinuationAnalysis(
                continuation_probability=0.0,
                should_wait=False,
                recommended_wait_ms=0,
                reason="No continuation signals detected",
            )

        # Weight signals by type
        signal_weights = {
            "trailing_conjunction": 0.5,
            "filler_word": 0.3,
            "mid_thought_marker": 0.25,
            "incomplete_sentence": 0.3,
            "short_fragment": 0.2,
            "rising_intonation": 0.35,
            "hesitation_pattern": 0.2,
        }

        # Calculate weighted probability
        total_weight = 0.0
        weighted_sum = 0.0

        for signal in signals:
            weight = signal_weights.get(signal.signal_type, 0.1)
            weighted_sum += signal.confidence * weight
            total_weight += weight

        # Normalize to 0-1 range, with a cap
        probability = min(1.0, weighted_sum / max(total_weight, 0.1))

        # Boost probability if multiple signals present
        if len(signals) >= 3:
            probability = min(1.0, probability * 1.3)
        elif len(signals) >= 2:
            probability = min(1.0, probability * 1.15)

        # ====================================================================
        # Determine Wait Decision
        # ====================================================================

        should_wait = probability >= self.MEDIUM_CONFIDENCE_THRESHOLD

        # Determine recommended wait time
        if probability >= self.HIGH_CONFIDENCE_THRESHOLD:
            recommended_wait = self.LONG_WAIT
        elif probability >= self.MEDIUM_CONFIDENCE_THRESHOLD:
            recommended_wait = self.MEDIUM_WAIT
        else:
            recommended_wait = self.SHORT_WAIT if signals else 0

        # Build reason string
        signal_types = [s.signal_type for s in signals]
        reason = f"Detected: {', '.join(signal_types)}" if signals else "No signals"

        logger.debug(
            f"Continuation analysis: prob={probability:.2f}, wait={should_wait}, "
            f"signals={len(signals)}, language={language}"
        )

        return ContinuationAnalysis(
            continuation_probability=probability,
            should_wait=should_wait,
            recommended_wait_ms=recommended_wait,
            signals=signals,
            reason=reason,
        )

    def _check_trailing_conjunction(
        self, words: List[str], markers: ContinuationMarkers
    ) -> Optional[ContinuationSignal]:
        """Check if transcript ends with a conjunction."""
        if not words:
            return None

        last_word = words[-1].rstrip(".,!?")

        if last_word in markers.trailing_conjunctions:
            return ContinuationSignal(
                signal_type="trailing_conjunction",
                matched_text=last_word,
                position="end",
                confidence=0.9 if last_word in ["and", "but", "so", "because"] else 0.7,
            )

        # Check second-to-last word (in case of trailing punctuation artifacts)
        if len(words) >= 2:
            second_last = words[-2].rstrip(".,!?")
            if second_last in markers.trailing_conjunctions:
                return ContinuationSignal(
                    signal_type="trailing_conjunction", matched_text=second_last, position="end", confidence=0.7
                )

        return None

    def _check_filler_words(self, words: List[str], markers: ContinuationMarkers) -> Optional[ContinuationSignal]:
        """Check for filler words, especially at the end."""
        if not words:
            return None

        # Check last word
        last_word = words[-1].rstrip(".,!?")
        if last_word in markers.filler_words:
            return ContinuationSignal(signal_type="filler_word", matched_text=last_word, position="end", confidence=0.8)

        # Check for filler words anywhere (lower confidence)
        for i, word in enumerate(words):
            clean_word = word.rstrip(".,!?")
            if clean_word in markers.filler_words:
                # Higher confidence if near the end
                position_factor = (i + 1) / len(words)
                confidence = 0.4 + (0.3 * position_factor)
                return ContinuationSignal(
                    signal_type="filler_word",
                    matched_text=clean_word,
                    position="end" if i == len(words) - 1 else "middle",
                    confidence=confidence,
                )

        return None

    def _check_mid_thought_markers(self, text_lower: str, markers: ContinuationMarkers) -> Optional[ContinuationSignal]:
        """Check for mid-thought markers like 'you know', 'I mean'."""
        for marker in markers.mid_thought_markers:
            if marker in text_lower:
                # Check if it's near the end
                position = text_lower.rfind(marker)
                relative_pos = position / len(text_lower) if text_lower else 0

                confidence = 0.5 if relative_pos > 0.7 else 0.3

                return ContinuationSignal(
                    signal_type="mid_thought_marker",
                    matched_text=marker,
                    position="end" if relative_pos > 0.7 else "middle",
                    confidence=confidence,
                )

        return None

    def _check_incomplete_sentence(self, transcript: str, word_count: int) -> Optional[ContinuationSignal]:
        """Check if the sentence appears incomplete."""
        # Check for sentence-ending punctuation
        if transcript.rstrip().endswith((".", "?", "!")):
            return None

        # Check for incomplete sentence structure
        # (no verb, no object, trailing preposition, etc.)

        # Simple heuristic: if it doesn't end with punctuation and
        # has a reasonable number of words, it might be incomplete
        if word_count >= 2:
            # Check for trailing prepositions (common incompleteness indicator)
            trailing_preps = ["to", "for", "with", "in", "on", "at", "by", "of", "about"]
            words = transcript.lower().split()
            if words and words[-1].rstrip(".,!?") in trailing_preps:
                return ContinuationSignal(
                    signal_type="incomplete_sentence", matched_text=words[-1], position="end", confidence=0.8
                )

        # General incompleteness (no punctuation)
        if word_count >= 2:
            return ContinuationSignal(
                signal_type="incomplete_sentence",
                matched_text="[no ending punctuation]",
                position="end",
                confidence=0.4,
            )

        return None

    def _check_prosody(self, prosody: ProsodyHints) -> Optional[ContinuationSignal]:
        """Check prosody hints for continuation signals."""
        if prosody.pitch_trend == "rising":
            return ContinuationSignal(
                signal_type="rising_intonation", matched_text="[rising pitch]", position="end", confidence=0.7
            )

        if prosody.speaking_rate == "slower" and prosody.energy_trend == "stable":
            # User is speaking slowly with stable energy - thinking
            return ContinuationSignal(
                signal_type="hesitation_pattern",
                matched_text="[slow with stable energy]",
                position="end",
                confidence=0.5,
            )

        return None

    def should_extend_endpointing(
        self,
        transcript: str,
        language: str = "en",
        current_endpointing_ms: int = 800,
        prosody: Optional[ProsodyHints] = None,
    ) -> Tuple[bool, int]:
        """
        Determine if the endpointing timeout should be extended.

        This is a convenience method for the STT service to call when
        deciding whether to wait longer before finalizing an utterance.

        Args:
            transcript: Current transcript text
            language: Language code
            current_endpointing_ms: Current endpointing timeout
            prosody: Optional prosody hints

        Returns:
            Tuple of (should_extend, new_timeout_ms)
        """
        analysis = self.analyze(transcript, language, prosody)

        if analysis.should_wait:
            # Calculate new timeout: current + recommended additional wait
            new_timeout = current_endpointing_ms + analysis.recommended_wait_ms
            # Cap at reasonable maximum (5 seconds)
            new_timeout = min(new_timeout, 5000)

            logger.debug(
                f"Extending endpointing: {current_endpointing_ms}ms -> {new_timeout}ms "
                f"(prob={analysis.continuation_probability:.2f})"
            )

            return True, new_timeout

        return False, current_endpointing_ms


# ============================================================================
# Singleton Instance
# ============================================================================

# Global instance for service access
_continuation_detector: Optional[ContinuationDetector] = None


def get_continuation_detector() -> ContinuationDetector:
    """Get or create the global ContinuationDetector instance."""
    global _continuation_detector
    if _continuation_detector is None:
        _continuation_detector = ContinuationDetector()
    return _continuation_detector


# Convenience function for quick checks
def should_wait_for_continuation(
    transcript: str,
    language: str = "en",
    prosody: Optional[ProsodyHints] = None,
) -> float:
    """
    Quick check for continuation probability.

    Returns the probability (0.0 to 1.0) that the user will continue speaking.
    """
    detector = get_continuation_detector()
    analysis = detector.analyze(transcript, language, prosody)
    return analysis.continuation_probability
