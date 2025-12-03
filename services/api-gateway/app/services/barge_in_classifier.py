"""
Barge-In Classification Service

Server-side classification for barge-in events. Used when the client defers
complex classification decisions to the backend, or for analytics and ML training.

Features:
- Multilingual backchannel detection (12 languages)
- Intent classification from transcript
- Escalation detection for repeated backchannels
- Confidence scoring with context awareness
- Integration with voice pipeline

Phase 3: Context-Aware Interruption Intelligence
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Type Definitions
# ============================================================================

SupportedLanguage = Literal["en", "ar", "es", "fr", "de", "zh", "ja", "ko", "pt", "ru", "hi", "tr"]

BargeInClassificationType = Literal[
    "backchannel",  # Non-interrupting acknowledgment
    "soft_barge",  # Polite interruption
    "hard_barge",  # Urgent interruption
    "command",  # Direct command
    "correction",  # Correcting something
    "clarification",  # Asking for clarification
    "topic_change",  # Changing subject
    "unknown",  # Could not classify
]

UserIntent = Literal[
    "acknowledge",  # Just acknowledging
    "continue",  # Wants AI to continue
    "stop",  # Wants AI to stop
    "pause",  # Wants AI to pause
    "ask_question",  # Has a question
    "provide_info",  # Wants to provide info
    "correct",  # Correcting the AI
    "change_topic",  # Changing subject
    "clarify",  # Asking for clarification
    "command",  # Issuing a command
    "uncertain",  # Intent unclear
]

InterruptionPriority = Literal["low", "medium", "high", "critical"]


# ============================================================================
# Pattern Definitions
# ============================================================================


@dataclass
class BackchannelPattern:
    """Pattern for detecting backchannel utterances"""

    phrases: List[str]
    max_duration_ms: int
    confidence: float = 1.0


@dataclass
class SoftBargePattern:
    """Pattern for detecting soft barge-in phrases"""

    phrases: List[str]
    requires_follow_up: bool


@dataclass
class HardBargePattern:
    """Pattern for detecting hard barge-in phrases"""

    phrases: List[str]
    intent: UserIntent


@dataclass
class CommandPattern:
    """Pattern for detecting command phrases"""

    phrases: List[str]
    command_type: str
    priority: InterruptionPriority


# Multilingual backchannel patterns
BACKCHANNEL_PATTERNS: Dict[SupportedLanguage, List[BackchannelPattern]] = {
    "en": [
        BackchannelPattern(["uh huh", "uh-huh", "uhuh", "mm hmm", "mmhmm", "mhm"], 600),
        BackchannelPattern(["yeah", "yep", "yes", "yea", "ya"], 400),
        BackchannelPattern(["okay", "ok", "k", "kay"], 400),
        BackchannelPattern(["right", "right right"], 500),
        BackchannelPattern(["sure", "got it", "gotcha"], 500),
        BackchannelPattern(["i see", "interesting", "cool"], 600),
    ],
    "ar": [
        BackchannelPattern(["نعم", "اه", "اها", "ايوه", "ايه"], 500),
        BackchannelPattern(["صح", "صحيح", "تمام", "ماشي"], 500),
        BackchannelPattern(["طيب", "حسنا", "اوكي"], 400),
        BackchannelPattern(["فاهم", "مفهوم"], 600),
    ],
    "es": [
        BackchannelPattern(["sí", "si", "ajá", "aha"], 400),
        BackchannelPattern(["vale", "ok", "bueno"], 400),
        BackchannelPattern(["claro", "entiendo", "ya"], 500),
        BackchannelPattern(["mmm", "mhm"], 400),
    ],
    "fr": [
        BackchannelPattern(["oui", "ouais", "mouais"], 400),
        BackchannelPattern(["d'accord", "ok", "entendu"], 500),
        BackchannelPattern(["je vois", "ah bon", "mmm"], 600),
        BackchannelPattern(["bien", "super", "parfait"], 500),
    ],
    "de": [
        BackchannelPattern(["ja", "jap", "jo"], 400),
        BackchannelPattern(["okay", "ok", "gut"], 400),
        BackchannelPattern(["genau", "richtig", "stimmt"], 500),
        BackchannelPattern(["verstehe", "aha", "mmm"], 600),
    ],
    "zh": [
        BackchannelPattern(["嗯", "哦", "啊"], 400),
        BackchannelPattern(["是", "对", "好"], 400),
        BackchannelPattern(["明白", "了解", "知道"], 600),
        BackchannelPattern(["没问题", "可以"], 600),
    ],
    "ja": [
        BackchannelPattern(["はい", "うん", "ええ"], 400),
        BackchannelPattern(["そうですね", "なるほど"], 700),
        BackchannelPattern(["分かりました", "了解"], 800),
    ],
    "ko": [
        BackchannelPattern(["네", "응", "예"], 400),
        BackchannelPattern(["그래요", "맞아요", "알겠어요"], 600),
        BackchannelPattern(["좋아요", "오케이"], 500),
    ],
    "pt": [
        BackchannelPattern(["sim", "é", "ahã"], 400),
        BackchannelPattern(["ok", "tá", "certo"], 400),
        BackchannelPattern(["entendi", "compreendo", "sei"], 600),
    ],
    "ru": [
        BackchannelPattern(["да", "ага", "угу"], 400),
        BackchannelPattern(["понятно", "ясно", "хорошо"], 600),
        BackchannelPattern(["ладно", "окей", "ок"], 400),
    ],
    "hi": [
        BackchannelPattern(["हाँ", "जी", "अच्छा"], 400),
        BackchannelPattern(["ठीक है", "समझ गया", "सही"], 600),
        BackchannelPattern(["हम्म", "ओके"], 400),
    ],
    "tr": [
        BackchannelPattern(["evet", "hı hı", "tamam"], 400),
        BackchannelPattern(["anladım", "peki", "oldu"], 600),
        BackchannelPattern(["doğru", "iyi", "güzel"], 500),
    ],
}

# Soft barge patterns
SOFT_BARGE_PATTERNS: Dict[SupportedLanguage, List[SoftBargePattern]] = {
    "en": [
        SoftBargePattern(["wait", "hold on", "hang on", "one moment"], True),
        SoftBargePattern(["actually", "but", "well", "um"], True),
        SoftBargePattern(["let me", "can i", "i want to"], True),
    ],
    "ar": [
        SoftBargePattern(["انتظر", "لحظة", "ثانية"], True),
        SoftBargePattern(["بس", "لكن", "في الحقيقة"], True),
    ],
    "es": [
        SoftBargePattern(["espera", "un momento", "para"], True),
        SoftBargePattern(["pero", "en realidad", "bueno"], True),
    ],
    "fr": [
        SoftBargePattern(["attends", "un moment", "une seconde"], True),
        SoftBargePattern(["mais", "en fait", "euh"], True),
    ],
    "de": [
        SoftBargePattern(["warte", "moment", "einen augenblick"], True),
        SoftBargePattern(["aber", "eigentlich", "also"], True),
    ],
    "zh": [
        SoftBargePattern(["等一下", "等等", "稍等"], True),
        SoftBargePattern(["但是", "其实", "不过"], True),
    ],
    "ja": [
        SoftBargePattern(["ちょっと待って", "待って", "少々"], True),
        SoftBargePattern(["でも", "実は", "あの"], True),
    ],
    "ko": [
        SoftBargePattern(["잠깐만", "잠시만요", "기다려"], True),
        SoftBargePattern(["그런데", "사실은", "근데"], True),
    ],
    "pt": [
        SoftBargePattern(["espera", "um momento", "peraí"], True),
        SoftBargePattern(["mas", "na verdade", "bom"], True),
    ],
    "ru": [
        SoftBargePattern(["подожди", "секунду", "минутку"], True),
        SoftBargePattern(["но", "на самом деле", "вообще-то"], True),
    ],
    "hi": [
        SoftBargePattern(["रुको", "एक मिनट", "ज़रा"], True),
        SoftBargePattern(["लेकिन", "असल में", "वैसे"], True),
    ],
    "tr": [
        SoftBargePattern(["bekle", "bir dakika", "dur"], True),
        SoftBargePattern(["ama", "aslında", "şey"], True),
    ],
}

# Hard barge patterns (urgent interruptions)
HARD_BARGE_PATTERNS: Dict[SupportedLanguage, List[HardBargePattern]] = {
    "en": [
        HardBargePattern(["stop", "stop it", "stop talking"], "stop"),
        HardBargePattern(["enough", "that's enough"], "stop"),
        HardBargePattern(["quiet", "be quiet", "shush"], "stop"),
        HardBargePattern(["no no no", "no wait", "hold up"], "stop"),
        HardBargePattern(["listen", "listen to me", "hear me out"], "provide_info"),
    ],
    "ar": [
        HardBargePattern(["توقف", "كفى", "بس"], "stop"),
        HardBargePattern(["اسمع", "استمع لي"], "provide_info"),
    ],
    "es": [
        HardBargePattern(["para", "basta", "detente"], "stop"),
        HardBargePattern(["escucha", "escúchame"], "provide_info"),
    ],
    "fr": [
        HardBargePattern(["arrête", "stop", "suffit"], "stop"),
        HardBargePattern(["écoute", "écoute-moi"], "provide_info"),
    ],
    "de": [
        HardBargePattern(["stopp", "halt", "genug"], "stop"),
        HardBargePattern(["hör zu", "hör mir zu"], "provide_info"),
    ],
    "zh": [
        HardBargePattern(["停", "停下", "别说了"], "stop"),
        HardBargePattern(["听我说", "你听我说"], "provide_info"),
    ],
    "ja": [
        HardBargePattern(["止まって", "ストップ", "やめて"], "stop"),
        HardBargePattern(["聞いて", "聞いてください"], "provide_info"),
    ],
    "ko": [
        HardBargePattern(["멈춰", "그만", "스톱"], "stop"),
        HardBargePattern(["들어봐", "내 말 들어"], "provide_info"),
    ],
    "pt": [
        HardBargePattern(["para", "pare", "chega"], "stop"),
        HardBargePattern(["escuta", "me escuta"], "provide_info"),
    ],
    "ru": [
        HardBargePattern(["стоп", "хватит", "остановись"], "stop"),
        HardBargePattern(["послушай", "слушай меня"], "provide_info"),
    ],
    "hi": [
        HardBargePattern(["रुको", "बस", "बंद करो"], "stop"),
        HardBargePattern(["सुनो", "मेरी सुनो"], "provide_info"),
    ],
    "tr": [
        HardBargePattern(["dur", "yeter", "kes"], "stop"),
        HardBargePattern(["dinle", "beni dinle"], "provide_info"),
    ],
}

# Command patterns
COMMAND_PATTERNS: Dict[SupportedLanguage, List[CommandPattern]] = {
    "en": [
        CommandPattern(["stop", "stop talking", "be quiet"], "stop", "critical"),
        CommandPattern(["repeat", "say again", "what did you say"], "repeat", "high"),
        CommandPattern(["louder", "speak up", "volume up"], "volume_up", "medium"),
        CommandPattern(["quieter", "speak softer", "volume down"], "volume_down", "medium"),
        CommandPattern(["slower", "speak slower", "slow down"], "speed_down", "medium"),
        CommandPattern(["faster", "speak faster", "speed up"], "speed_up", "medium"),
    ],
    "ar": [
        CommandPattern(["توقف", "اسكت", "كفى"], "stop", "critical"),
        CommandPattern(["أعد", "كرر", "ماذا قلت"], "repeat", "high"),
        CommandPattern(["أعلى", "ارفع الصوت"], "volume_up", "medium"),
        CommandPattern(["أخفض", "خفض الصوت"], "volume_down", "medium"),
    ],
}

# Correction phrases
CORRECTION_PHRASES: Dict[SupportedLanguage, List[str]] = {
    "en": ["no", "that's wrong", "incorrect", "not right", "actually", "you're wrong"],
    "ar": ["لا", "خطأ", "مش صحيح", "غلط", "في الحقيقة"],
    "es": ["no", "eso está mal", "incorrecto", "en realidad"],
    "fr": ["non", "c'est faux", "incorrect", "en fait"],
    "de": ["nein", "das ist falsch", "nicht richtig", "eigentlich"],
    "zh": ["不", "不对", "错了", "其实"],
    "ja": ["いいえ", "違う", "間違い", "実は"],
    "ko": ["아니", "틀려", "아니야", "사실은"],
    "pt": ["não", "está errado", "incorreto", "na verdade"],
    "ru": ["нет", "это неправильно", "неверно", "на самом деле"],
    "hi": ["नहीं", "गलत", "सही नहीं", "असल में"],
    "tr": ["hayır", "yanlış", "doğru değil", "aslında"],
}

# Clarification phrases
CLARIFICATION_PHRASES: Dict[SupportedLanguage, List[str]] = {
    "en": ["what do you mean", "can you explain", "i don't understand", "what", "huh", "sorry", "pardon"],
    "ar": ["ماذا تعني", "ممكن تشرح", "لا أفهم", "ماذا", "عفوا"],
    "es": ["qué quieres decir", "puedes explicar", "no entiendo", "qué", "perdón"],
    "fr": ["qu'est-ce que tu veux dire", "peux-tu expliquer", "je ne comprends pas", "quoi", "pardon"],
    "de": ["was meinst du", "kannst du erklären", "ich verstehe nicht", "was", "entschuldigung"],
    "zh": ["什么意思", "能解释一下", "我不明白", "什么", "对不起"],
    "ja": ["どういう意味", "説明して", "わかりません", "何", "すみません"],
    "ko": ["무슨 말이야", "설명해줘", "이해가 안 돼", "뭐", "미안"],
    "pt": ["o que você quer dizer", "pode explicar", "não entendo", "o quê", "desculpe"],
    "ru": ["что ты имеешь в виду", "можешь объяснить", "не понимаю", "что", "извините"],
    "hi": ["इसका मतलब क्या है", "समझाओ", "समझ नहीं आया", "क्या", "माफ़ करो"],
    "tr": ["ne demek istiyorsun", "açıklar mısın", "anlamadım", "ne", "pardon"],
}


# ============================================================================
# Result Types
# ============================================================================


@dataclass
class BackchannelResult:
    """Result from backchannel detection"""

    is_backchannel: bool
    matched_pattern: Optional[str] = None
    score: float = 0.0
    language: SupportedLanguage = "en"
    should_escalate: bool = False


@dataclass
class SoftBargeResult:
    """Result from soft barge detection"""

    is_soft_barge: bool
    matched_pattern: Optional[str] = None
    requires_follow_up: bool = False
    language: SupportedLanguage = "en"


@dataclass
class ClassificationAction:
    """Recommended action based on classification"""

    type: Literal["continue", "pause", "stop", "acknowledge", "yield", "respond", "wait"]
    should_acknowledge: bool = False
    acknowledgment_phrase: Optional[str] = None
    pause_duration_ms: Optional[int] = None
    should_save_context: bool = False


@dataclass
class ClassificationMetadata:
    """Additional metadata about the classification"""

    vad_probability: float = 0.0
    during_ai_speech: bool = False
    time_since_last_utterance_ms: int = 0
    recent_backchannel_count: int = 0
    prosodic_urgency: bool = False


@dataclass
class ClassificationResult:
    """Complete classification result"""

    classification: BargeInClassificationType
    intent: UserIntent
    priority: InterruptionPriority
    confidence: float
    language: SupportedLanguage
    transcript: str
    duration_ms: int
    action: ClassificationAction
    metadata: ClassificationMetadata


# ============================================================================
# Barge-In Classifier
# ============================================================================


class BargeInClassifier:
    """
    Server-side barge-in classifier for voice sessions.

    Provides multilingual classification of user interruptions during AI speech.
    Can be used for:
    - Complex classification decisions deferred from client
    - Analytics and ML training data collection
    - Cross-session learning and personalization
    """

    def __init__(
        self,
        language: SupportedLanguage = "en",
        escalation_window_ms: int = 5000,
        escalation_threshold: int = 3,
        max_backchannel_duration_ms: int = 800,
        min_confidence: float = 0.6,
    ):
        self.language = language
        self.escalation_window_ms = escalation_window_ms
        self.escalation_threshold = escalation_threshold
        self.max_backchannel_duration_ms = max_backchannel_duration_ms
        self.min_confidence = min_confidence

        # Escalation tracking
        self._recent_detections: Dict[str, List[float]] = {}

        # Classification history for analytics
        self._classification_history: List[ClassificationResult] = []
        self._max_history_size = 100

        logger.debug(
            "BargeInClassifier initialized",
            extra={
                "language": language,
                "escalation_threshold": escalation_threshold,
            },
        )

    def set_language(self, language: SupportedLanguage) -> None:
        """Update the classification language"""
        self.language = language
        logger.debug(f"BargeInClassifier language set to {language}")

    def classify(
        self,
        transcript: str,
        duration_ms: int,
        vad_probability: float,
        during_ai_speech: bool,
        time_since_last_utterance_ms: int = 0,
    ) -> ClassificationResult:
        """
        Classify a barge-in event.

        Args:
            transcript: The user's transcribed speech
            duration_ms: Duration of the utterance in milliseconds
            vad_probability: Voice activity detection confidence (0-1)
            during_ai_speech: Whether the AI was speaking when this occurred
            time_since_last_utterance_ms: Time since user's last utterance

        Returns:
            ClassificationResult with classification, intent, and recommended action
        """
        # Step 1: Check for commands (highest priority)
        command_result = self._detect_command(transcript)
        if command_result:
            result = self._build_result(
                classification="command",
                intent=command_result[0],
                priority=command_result[1],
                confidence=1.0,
                transcript=transcript,
                duration_ms=duration_ms,
                vad_probability=vad_probability,
                during_ai_speech=during_ai_speech,
                time_since_last_utterance_ms=time_since_last_utterance_ms,
            )
            self._record_classification(result)
            return result

        # Step 2: Check for backchannels (if during AI speech)
        if during_ai_speech:
            backchannel_result = self._detect_backchannel(transcript, duration_ms, vad_probability)

            if backchannel_result.is_backchannel:
                result = self._build_result(
                    classification="backchannel",
                    intent="acknowledge",
                    priority="low",
                    confidence=backchannel_result.score,
                    transcript=transcript,
                    duration_ms=duration_ms,
                    vad_probability=vad_probability,
                    during_ai_speech=during_ai_speech,
                    time_since_last_utterance_ms=time_since_last_utterance_ms,
                )
                self._record_classification(result)
                return result

            # Check for escalation
            if backchannel_result.should_escalate:
                result = self._build_result(
                    classification="hard_barge",
                    intent="stop",
                    priority="high",
                    confidence=0.9,
                    transcript=transcript,
                    duration_ms=duration_ms,
                    vad_probability=vad_probability,
                    during_ai_speech=during_ai_speech,
                    time_since_last_utterance_ms=time_since_last_utterance_ms,
                )
                self._record_classification(result)
                return result

            # Step 3: Check for soft barge
            soft_barge_result = self._detect_soft_barge(transcript)
            if soft_barge_result.is_soft_barge:
                result = self._build_result(
                    classification="soft_barge",
                    intent="pause",
                    priority="medium",
                    confidence=0.8,
                    transcript=transcript,
                    duration_ms=duration_ms,
                    vad_probability=vad_probability,
                    during_ai_speech=during_ai_speech,
                    time_since_last_utterance_ms=time_since_last_utterance_ms,
                )
                self._record_classification(result)
                return result

        # Step 4: Check for hard barge patterns
        hard_barge_result = self._detect_hard_barge(transcript)
        if hard_barge_result:
            result = self._build_result(
                classification="hard_barge",
                intent=hard_barge_result,
                priority="high",
                confidence=0.9,
                transcript=transcript,
                duration_ms=duration_ms,
                vad_probability=vad_probability,
                during_ai_speech=during_ai_speech,
                time_since_last_utterance_ms=time_since_last_utterance_ms,
            )
            self._record_classification(result)
            return result

        # Step 5: Check for correction patterns
        if self._detect_correction(transcript):
            result = self._build_result(
                classification="correction",
                intent="correct",
                priority="high",
                confidence=0.85,
                transcript=transcript,
                duration_ms=duration_ms,
                vad_probability=vad_probability,
                during_ai_speech=during_ai_speech,
                time_since_last_utterance_ms=time_since_last_utterance_ms,
            )
            self._record_classification(result)
            return result

        # Step 6: Check for clarification requests
        if self._detect_clarification(transcript):
            result = self._build_result(
                classification="clarification",
                intent="clarify",
                priority="medium",
                confidence=0.8,
                transcript=transcript,
                duration_ms=duration_ms,
                vad_probability=vad_probability,
                during_ai_speech=during_ai_speech,
                time_since_last_utterance_ms=time_since_last_utterance_ms,
            )
            self._record_classification(result)
            return result

        # Step 7: Default classification
        result = self._build_result(
            classification="unknown",
            intent="uncertain",
            priority="medium",
            confidence=0.5,
            transcript=transcript,
            duration_ms=duration_ms,
            vad_probability=vad_probability,
            during_ai_speech=during_ai_speech,
            time_since_last_utterance_ms=time_since_last_utterance_ms,
        )
        self._record_classification(result)
        return result

    def _detect_backchannel(self, transcript: str, duration_ms: int, confidence: float) -> BackchannelResult:
        """Detect if the transcript is a backchannel utterance"""
        normalized = transcript.lower().strip()

        # Too long to be a backchannel
        if duration_ms > self.max_backchannel_duration_ms:
            return BackchannelResult(is_backchannel=False, language=self.language)

        patterns = BACKCHANNEL_PATTERNS.get(self.language, BACKCHANNEL_PATTERNS["en"])

        for pattern in patterns:
            if duration_ms > pattern.max_duration_ms:
                continue

            for phrase in pattern.phrases:
                if normalized == phrase or normalized.startswith(phrase + " "):
                    score = confidence * (1 - duration_ms / 1000) * pattern.confidence
                    should_escalate = self._track_and_check_escalation(phrase)

                    return BackchannelResult(
                        is_backchannel=score >= self.min_confidence and not should_escalate,
                        matched_pattern=phrase,
                        score=score,
                        language=self.language,
                        should_escalate=should_escalate,
                    )

        return BackchannelResult(is_backchannel=False, language=self.language)

    def _detect_soft_barge(self, transcript: str) -> SoftBargeResult:
        """Detect if the transcript is a soft barge-in"""
        normalized = transcript.lower().strip()
        patterns = SOFT_BARGE_PATTERNS.get(self.language, SOFT_BARGE_PATTERNS["en"])

        for pattern in patterns:
            for phrase in pattern.phrases:
                if normalized.startswith(phrase) or normalized == phrase:
                    return SoftBargeResult(
                        is_soft_barge=True,
                        matched_pattern=phrase,
                        requires_follow_up=pattern.requires_follow_up,
                        language=self.language,
                    )

        return SoftBargeResult(is_soft_barge=False, language=self.language)

    def _detect_hard_barge(self, transcript: str) -> Optional[UserIntent]:
        """Detect if the transcript is a hard barge-in"""
        normalized = transcript.lower().strip()
        patterns = HARD_BARGE_PATTERNS.get(self.language, HARD_BARGE_PATTERNS["en"])

        for pattern in patterns:
            for phrase in pattern.phrases:
                if normalized == phrase or normalized.startswith(phrase + " "):
                    return pattern.intent

        return None

    def _detect_command(self, transcript: str) -> Optional[Tuple[UserIntent, InterruptionPriority]]:
        """Detect if the transcript is a command"""
        normalized = transcript.lower().strip()
        patterns = COMMAND_PATTERNS.get(self.language, COMMAND_PATTERNS["en"])

        for pattern in patterns:
            for phrase in pattern.phrases:
                if normalized == phrase or normalized.startswith(phrase + " "):
                    return ("command", pattern.priority)

        return None

    def _detect_correction(self, transcript: str) -> bool:
        """Detect if the transcript is a correction"""
        normalized = transcript.lower().strip()
        phrases = CORRECTION_PHRASES.get(self.language, CORRECTION_PHRASES["en"])

        return any(normalized == phrase or normalized.startswith(phrase + " ") for phrase in phrases)

    def _detect_clarification(self, transcript: str) -> bool:
        """Detect if the transcript is a clarification request"""
        normalized = transcript.lower().strip()
        phrases = CLARIFICATION_PHRASES.get(self.language, CLARIFICATION_PHRASES["en"])

        return any(normalized == phrase or normalized.startswith(phrase + " ") for phrase in phrases)

    def _track_and_check_escalation(self, pattern: str) -> bool:
        """Track backchannel detections and check for escalation"""
        now = time.time() * 1000  # ms
        timestamps = self._recent_detections.get(pattern, [])

        # Clean old entries
        cutoff = now - self.escalation_window_ms
        recent_timestamps = [t for t in timestamps if t > cutoff]
        recent_timestamps.append(now)

        self._recent_detections[pattern] = recent_timestamps

        # Check if escalation threshold reached
        return len(recent_timestamps) >= self.escalation_threshold

    def _build_result(
        self,
        classification: BargeInClassificationType,
        intent: UserIntent,
        priority: InterruptionPriority,
        confidence: float,
        transcript: str,
        duration_ms: int,
        vad_probability: float,
        during_ai_speech: bool,
        time_since_last_utterance_ms: int,
    ) -> ClassificationResult:
        """Build a complete classification result"""
        action = self._determine_action(classification, intent, priority)
        metadata = ClassificationMetadata(
            vad_probability=vad_probability,
            during_ai_speech=during_ai_speech,
            time_since_last_utterance_ms=time_since_last_utterance_ms,
            recent_backchannel_count=self._get_total_recent_count(),
        )

        return ClassificationResult(
            classification=classification,
            intent=intent,
            priority=priority,
            confidence=confidence,
            language=self.language,
            transcript=transcript,
            duration_ms=duration_ms,
            action=action,
            metadata=metadata,
        )

    def _determine_action(
        self,
        classification: BargeInClassificationType,
        intent: UserIntent,
        priority: InterruptionPriority,
    ) -> ClassificationAction:
        """Determine the recommended action based on classification"""
        if classification == "backchannel":
            return ClassificationAction(type="acknowledge", should_acknowledge=False)

        if classification == "soft_barge":
            return ClassificationAction(
                type="pause",
                should_acknowledge=True,
                pause_duration_ms=1500,
                should_save_context=True,
            )

        if classification in ("hard_barge", "command"):
            action_type = "stop" if intent == "stop" else "yield"
            return ClassificationAction(
                type=action_type,
                should_acknowledge=True,
                should_save_context=True,
            )

        if classification == "correction":
            return ClassificationAction(
                type="respond",
                should_acknowledge=True,
                should_save_context=True,
            )

        if classification == "clarification":
            return ClassificationAction(
                type="respond",
                should_acknowledge=True,
                should_save_context=False,
            )

        # Default
        return ClassificationAction(
            type="wait" if priority != "low" else "continue",
            should_acknowledge=False,
        )

    def _get_total_recent_count(self) -> int:
        """Get total count of recent backchannel detections"""
        now = time.time() * 1000
        cutoff = now - self.escalation_window_ms
        total = 0
        for timestamps in self._recent_detections.values():
            total += sum(1 for t in timestamps if t > cutoff)
        return total

    def _record_classification(self, result: ClassificationResult) -> None:
        """Record classification for analytics"""
        self._classification_history.append(result)
        if len(self._classification_history) > self._max_history_size:
            self._classification_history.pop(0)

    def reset(self) -> None:
        """Reset all state"""
        self._recent_detections.clear()
        self._classification_history.clear()
        logger.debug("BargeInClassifier state reset")

    def get_statistics(self) -> Dict:
        """Get classification statistics"""
        if not self._classification_history:
            return {
                "total_classifications": 0,
                "backchannel_rate": 0.0,
                "hard_barge_rate": 0.0,
                "average_confidence": 0.0,
            }

        history = self._classification_history
        backchannels = sum(1 for r in history if r.classification == "backchannel")
        hard_barges = sum(1 for r in history if r.classification == "hard_barge")
        avg_confidence = sum(r.confidence for r in history) / len(history)

        return {
            "total_classifications": len(history),
            "backchannel_rate": backchannels / len(history),
            "hard_barge_rate": hard_barges / len(history),
            "average_confidence": avg_confidence,
            "dominant_language": self.language,
        }


# ============================================================================
# Factory Function
# ============================================================================


def create_barge_in_classifier(
    language: SupportedLanguage = "en",
    **kwargs,
) -> BargeInClassifier:
    """Create a new BargeInClassifier instance"""
    return BargeInClassifier(language=language, **kwargs)
