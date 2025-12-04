"""
Lexicon Service for Medical Pronunciation
Manages pronunciation lexicons with G2P fallback for medical terminology.

Part of Voice Mode Enhancement Plan v4.1
Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#lexicon--language-coverage
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class PronunciationResult:
    """Result of a pronunciation lookup."""

    term: str
    phoneme: str
    language: str
    source: str  # "lexicon", "shared_drugs", "g2p", "g2p_fallback"
    confidence: float
    alphabet: str = "ipa"  # IPA, SAMPA, etc.


@dataclass
class LexiconReport:
    """Report on lexicon coverage for a language."""

    language: str
    status: str  # "complete", "partial", "placeholder"
    term_count: int
    coverage_pct: float
    missing_categories: List[str] = field(default_factory=list)
    version: Optional[str] = None
    last_updated: Optional[str] = None


class G2PService:
    """
    Grapheme-to-Phoneme service for generating pronunciations.

    Falls back to espeak-ng for languages without dedicated G2P models.
    """

    # Language-specific G2P configurations
    G2P_CONFIGS = {
        "en": {"engine": "espeak-ng", "voice": "en-us"},
        "es": {"engine": "espeak-ng", "voice": "es"},
        "fr": {"engine": "espeak-ng", "voice": "fr"},
        "de": {"engine": "espeak-ng", "voice": "de"},
        "it": {"engine": "espeak-ng", "voice": "it"},
        "pt": {"engine": "espeak-ng", "voice": "pt"},
        "ar": {"engine": "mishkal", "voice": "ar"},
        "zh": {"engine": "pypinyin", "voice": "zh"},
        "hi": {"engine": "espeak-ng", "voice": "hi"},
        "ur": {"engine": "espeak-ng", "voice": "ur"},
    }

    async def generate(self, term: str, language: str) -> str:
        """
        Generate phoneme representation for a term.

        Args:
            term: The word/phrase to convert
            language: ISO 639-1 language code

        Returns:
            IPA phoneme string

        Raises:
            G2PError: If generation fails
        """
        config = self.G2P_CONFIGS.get(language, self.G2P_CONFIGS["en"])

        try:
            if config["engine"] == "espeak-ng":
                return await self._generate_espeak(term, config["voice"])
            elif config["engine"] == "pypinyin":
                return await self._generate_pypinyin(term)
            elif config["engine"] == "mishkal":
                return await self._generate_mishkal(term)
            else:
                return await self._generate_espeak(term, "en-us")
        except Exception as e:
            logger.error(f"G2P generation failed for '{term}' ({language}): {e}")
            raise G2PError(f"G2P generation failed: {e}")

    async def _generate_espeak(self, term: str, voice: str) -> str:
        """Generate phonemes using espeak-ng."""
        import asyncio

        try:
            proc = await asyncio.create_subprocess_exec(
                "espeak-ng",
                "-v",
                voice,
                "-q",  # Quiet (no audio)
                "--ipa",  # Output IPA
                term,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)

            if proc.returncode == 0:
                return stdout.decode().strip()
            else:
                logger.warning(f"espeak-ng failed: {stderr.decode()}")
                # Return a simple approximation
                return f"/{term}/"
        except FileNotFoundError:
            logger.warning("espeak-ng not installed, returning term as phoneme")
            return f"/{term}/"
        except asyncio.TimeoutError:
            logger.warning("espeak-ng timed out")
            return f"/{term}/"

    async def _generate_pypinyin(self, term: str) -> str:
        """Generate pinyin for Chinese text."""
        try:
            from pypinyin import Style, lazy_pinyin

            pinyin = lazy_pinyin(term, style=Style.TONE)
            return " ".join(pinyin)
        except ImportError:
            logger.warning("pypinyin not installed")
            return term
        except Exception as e:
            logger.error(f"pypinyin failed: {e}")
            return term

    async def _generate_mishkal(self, term: str) -> str:
        """Generate diacritized Arabic text."""
        # Mishkal integration would go here
        # For now, return the term as-is
        return term


class G2PError(Exception):
    """Exception raised when G2P generation fails."""

    pass


class LexiconService:
    """
    Pronunciation lexicon service with G2P fallback.

    Manages per-language medical pronunciation lexicons and provides
    phoneme lookups with multiple fallback strategies:
    1. Language-specific lexicon
    2. Shared drug names lexicon
    3. G2P generation
    4. English G2P fallback

    Features:
    - Lazy loading of lexicons
    - Coverage validation
    - User custom pronunciations
    - Caching for performance
    """

    # Paths to lexicon files (relative to data directory)
    LEXICON_PATHS = {
        "en": "lexicons/en/medical_phonemes.json",
        "es": "lexicons/es/medical_phonemes.json",
        "fr": "lexicons/fr/medical_phonemes.json",
        "de": "lexicons/de/medical_phonemes.json",
        "it": "lexicons/it/medical_phonemes.json",
        "pt": "lexicons/pt/medical_phonemes.json",
        "ar": "lexicons/ar/medical_phonemes.json",
        "zh": "lexicons/zh/medical_phonemes.json",
        "hi": "lexicons/hi/medical_phonemes.json",
        "ur": "lexicons/ur/medical_phonemes.json",
    }

    SHARED_LEXICON_PATH = "lexicons/shared/drug_names.json"

    # Languages with placeholder lexicons (not yet complete)
    PLACEHOLDER_LANGUAGES = ["ja", "ko", "ru", "pl", "tr"]

    # Required term categories for complete coverage
    REQUIRED_CATEGORIES = [
        "drug_names",
        "conditions",
        "procedures",
        "anatomy",
        "lab_tests",
        "specialties",
    ]

    def __init__(self, data_dir: Optional[Path] = None, g2p_service: Optional[G2PService] = None):
        self.data_dir = data_dir or Path("/home/asimo/VoiceAssist/data")
        self.g2p_service = g2p_service or G2PService()

        # Lazy-loaded lexicons
        self.lexicons: Dict[str, Dict[str, str]] = {}
        self.shared_drug_lexicon: Dict[str, str] = {}
        self.user_custom_lexicon: Dict[str, Dict[str, str]] = {}

        # Cache for G2P results
        self._g2p_cache: Dict[str, str] = {}

        self._loaded_languages: Set[str] = set()
        self._shared_loaded = False

    def _ensure_lexicon_loaded(self, language: str) -> None:
        """Load lexicon for a language if not already loaded."""
        if language in self._loaded_languages:
            return

        lexicon_path = self.data_dir / self.LEXICON_PATHS.get(language, "")
        if lexicon_path.exists():
            try:
                with open(lexicon_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Remove metadata key if present
                    self.lexicons[language] = {k: v for k, v in data.items() if not k.startswith("_")}
                logger.info(f"Loaded {len(self.lexicons[language])} terms for {language}")
            except Exception as e:
                logger.error(f"Failed to load lexicon for {language}: {e}")
                self.lexicons[language] = {}
        else:
            logger.warning(f"Lexicon file not found: {lexicon_path}")
            self.lexicons[language] = {}

        self._loaded_languages.add(language)

    def _ensure_shared_loaded(self) -> None:
        """Load shared drug names lexicon if not already loaded."""
        if self._shared_loaded:
            return

        shared_path = self.data_dir / self.SHARED_LEXICON_PATH
        if shared_path.exists():
            try:
                with open(shared_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.shared_drug_lexicon = {k: v for k, v in data.items() if not k.startswith("_")}
                logger.info(f"Loaded {len(self.shared_drug_lexicon)} shared drug pronunciations")
            except Exception as e:
                logger.error(f"Failed to load shared lexicon: {e}")

        self._shared_loaded = True

    async def get_phoneme(self, term: str, language: str) -> PronunciationResult:
        """
        Get phoneme representation for a term.

        Lookup order:
        1. User custom pronunciations
        2. Language-specific lexicon
        3. Shared drug names lexicon
        4. G2P generation
        5. English G2P fallback

        Args:
            term: The word/phrase to look up
            language: ISO 639-1 language code

        Returns:
            PronunciationResult with phoneme and metadata
        """
        term_lower = term.lower().strip()

        # 1. Check user custom pronunciations
        if language in self.user_custom_lexicon:
            if phoneme := self.user_custom_lexicon[language].get(term_lower):
                return PronunciationResult(
                    term=term, phoneme=phoneme, language=language, source="user_custom", confidence=1.0
                )

        # 2. Check language-specific lexicon
        self._ensure_lexicon_loaded(language)
        if language in self.lexicons and term_lower in self.lexicons[language]:
            return PronunciationResult(
                term=term,
                phoneme=self.lexicons[language][term_lower],
                language=language,
                source="lexicon",
                confidence=1.0,
            )

        # 3. Check shared drug names lexicon
        self._ensure_shared_loaded()
        if term_lower in self.shared_drug_lexicon:
            return PronunciationResult(
                term=term,
                phoneme=self.shared_drug_lexicon[term_lower],
                language=language,
                source="shared_drugs",
                confidence=0.95,
            )

        # 4. G2P generation with caching
        cache_key = f"{language}:{term_lower}"
        if cache_key in self._g2p_cache:
            return PronunciationResult(
                term=term, phoneme=self._g2p_cache[cache_key], language=language, source="g2p_cached", confidence=0.7
            )

        try:
            phoneme = await self.g2p_service.generate(term, language)
            self._g2p_cache[cache_key] = phoneme
            return PronunciationResult(term=term, phoneme=phoneme, language=language, source="g2p", confidence=0.7)
        except G2PError:
            # 5. Fall back to English G2P
            try:
                phoneme = await self.g2p_service.generate(term, "en")
                return PronunciationResult(
                    term=term, phoneme=phoneme, language=language, source="g2p_fallback", confidence=0.5
                )
            except G2PError:
                # Last resort: return term wrapped as phoneme
                return PronunciationResult(
                    term=term, phoneme=f"/{term}/", language=language, source="unknown", confidence=0.1
                )

    async def get_phonemes_batch(self, terms: List[str], language: str) -> List[PronunciationResult]:
        """
        Get phonemes for multiple terms.

        Args:
            terms: List of terms to look up
            language: ISO 639-1 language code

        Returns:
            List of PronunciationResults in same order as input
        """
        import asyncio

        tasks = [self.get_phoneme(term, language) for term in terms]
        return await asyncio.gather(*tasks)

    def add_user_pronunciation(self, term: str, phoneme: str, language: str) -> None:
        """
        Add a user-defined custom pronunciation.

        Args:
            term: The word/phrase
            phoneme: IPA pronunciation
            language: ISO 639-1 language code
        """
        if language not in self.user_custom_lexicon:
            self.user_custom_lexicon[language] = {}
        self.user_custom_lexicon[language][term.lower()] = phoneme
        logger.info(f"Added user pronunciation: {term} -> {phoneme} ({language})")

    async def validate_lexicon_coverage(self, language: str) -> LexiconReport:
        """
        Validate lexicon coverage for a language.

        Checks that all required categories have adequate coverage.

        Args:
            language: ISO 639-1 language code

        Returns:
            LexiconReport with coverage statistics
        """
        if language in self.PLACEHOLDER_LANGUAGES:
            return LexiconReport(
                language=language,
                status="placeholder",
                term_count=0,
                coverage_pct=0.0,
                missing_categories=self.REQUIRED_CATEGORIES,
            )

        self._ensure_lexicon_loaded(language)
        lexicon = self.lexicons.get(language, {})

        # Check lexicon metadata
        lexicon_path = self.data_dir / self.LEXICON_PATHS.get(language, "")
        version = None
        last_updated = None

        if lexicon_path.exists():
            try:
                with open(lexicon_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "_meta" in data:
                        version = data["_meta"].get("version")
                        last_updated = data["_meta"].get("last_updated")
            except Exception:
                pass

        # Calculate coverage (simplified - would need category annotations in real impl)
        term_count = len(lexicon)
        coverage_pct = min(100.0, term_count / 25.0)  # Assume 2500 terms = 100%

        # Determine status
        if term_count >= 2000:
            status = "complete"
            missing = []
        elif term_count >= 500:
            status = "partial"
            missing = ["conditions", "procedures"]  # Placeholder
        else:
            status = "minimal"
            missing = self.REQUIRED_CATEGORIES

        return LexiconReport(
            language=language,
            status=status,
            term_count=term_count,
            coverage_pct=coverage_pct,
            missing_categories=missing,
            version=version,
            last_updated=last_updated,
        )

    async def validate_all_lexicons(self) -> Dict[str, LexiconReport]:
        """
        Validate coverage for all configured languages.

        Returns:
            Dict mapping language codes to LexiconReports
        """
        reports = {}
        for language in self.LEXICON_PATHS.keys():
            reports[language] = await self.validate_lexicon_coverage(language)
        return reports

    def get_supported_languages(self) -> List[Dict[str, str]]:
        """Get list of languages with lexicon support."""
        return [
            {"code": "en", "name": "English", "status": "complete"},
            {"code": "es", "name": "Spanish", "status": "complete"},
            {"code": "fr", "name": "French", "status": "complete"},
            {"code": "de", "name": "German", "status": "complete"},
            {"code": "it", "name": "Italian", "status": "complete"},
            {"code": "pt", "name": "Portuguese", "status": "complete"},
            {"code": "ar", "name": "Arabic", "status": "in_progress"},
            {"code": "zh", "name": "Chinese", "status": "in_progress"},
            {"code": "hi", "name": "Hindi", "status": "in_progress"},
            {"code": "ur", "name": "Urdu", "status": "in_progress"},
        ]


# Singleton instance
_lexicon_service: Optional[LexiconService] = None


def get_lexicon_service() -> LexiconService:
    """Get or create lexicon service instance."""
    global _lexicon_service
    if _lexicon_service is None:
        _lexicon_service = LexiconService()
    return _lexicon_service
