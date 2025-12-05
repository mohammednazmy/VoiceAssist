"""
Enhanced G2P Service for Medical Pronunciation
Implements CMUdict + gruut hybrid with espeak-ng fallback.

Part of Voice Mode Enhancement Plan v4.1.2
Reference: docs/voice/design/g2p-alternatives-evaluation.md
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class G2PResult:
    """Result of G2P conversion."""

    term: str
    phonemes: str
    source: str  # "cmudict", "gruut", "espeak", "cache", "fallback"
    confidence: float
    alphabet: str = "ipa"


# ARPABET to IPA conversion table
ARPABET_TO_IPA: Dict[str, str] = {
    "AA": "ɑ",
    "AA0": "ɑ",
    "AA1": "ˈɑ",
    "AA2": "ˌɑ",
    "AE": "æ",
    "AE0": "æ",
    "AE1": "ˈæ",
    "AE2": "ˌæ",
    "AH": "ʌ",
    "AH0": "ə",
    "AH1": "ˈʌ",
    "AH2": "ˌʌ",
    "AO": "ɔ",
    "AO0": "ɔ",
    "AO1": "ˈɔ",
    "AO2": "ˌɔ",
    "AW": "aʊ",
    "AW0": "aʊ",
    "AW1": "ˈaʊ",
    "AW2": "ˌaʊ",
    "AY": "aɪ",
    "AY0": "aɪ",
    "AY1": "ˈaɪ",
    "AY2": "ˌaɪ",
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "EH": "ɛ",
    "EH0": "ɛ",
    "EH1": "ˈɛ",
    "EH2": "ˌɛ",
    "ER": "ɝ",
    "ER0": "ɚ",
    "ER1": "ˈɝ",
    "ER2": "ˌɝ",
    "EY": "eɪ",
    "EY0": "eɪ",
    "EY1": "ˈeɪ",
    "EY2": "ˌeɪ",
    "F": "f",
    "G": "ɡ",
    "HH": "h",
    "IH": "ɪ",
    "IH0": "ɪ",
    "IH1": "ˈɪ",
    "IH2": "ˌɪ",
    "IY": "i",
    "IY0": "i",
    "IY1": "ˈi",
    "IY2": "ˌi",
    "JH": "dʒ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "OW": "oʊ",
    "OW0": "oʊ",
    "OW1": "ˈoʊ",
    "OW2": "ˌoʊ",
    "OY": "ɔɪ",
    "OY0": "ɔɪ",
    "OY1": "ˈɔɪ",
    "OY2": "ˌɔɪ",
    "P": "p",
    "R": "ɹ",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "UH": "ʊ",
    "UH0": "ʊ",
    "UH1": "ˈʊ",
    "UH2": "ˌʊ",
    "UW": "u",
    "UW0": "u",
    "UW1": "ˈu",
    "UW2": "ˌu",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ",
}

# Pre-computed medical term pronunciations (most common terms)
MEDICAL_PRONUNCIATION_CACHE: Dict[str, str] = {
    # Common drugs
    "metformin": "mɛtˈfɔɹmɪn",
    "lisinopril": "laɪˈsɪnəpɹɪl",
    "amlodipine": "æmˈloʊdɪpiːn",
    "atorvastatin": "əˌtɔɹvəˈstætɪn",
    "omeprazole": "oʊˈmɛpɹəzoʊl",
    "levothyroxine": "ˌlivoʊθaɪˈɹɑksɪn",
    "simvastatin": "sɪmˈvæstətɪn",
    "losartan": "loʊˈsɑɹtæn",
    "gabapentin": "ˌɡæbəˈpɛntɪn",
    "hydrochlorothiazide": "ˌhaɪdɹoʊˌklɔɹoʊˈθaɪəzaɪd",
    "amoxicillin": "əˌmɑksɪˈsɪlɪn",
    "azithromycin": "əˌzɪθɹoʊˈmaɪsɪn",
    "prednisone": "ˈpɹɛdnɪsoʊn",
    "ibuprofen": "aɪˈbjuːpɹoʊfən",
    "acetaminophen": "əˌsiːtəˈmɪnəfɛn",
    "aspirin": "ˈæspɹɪn",
    "insulin": "ˈɪnsəlɪn",
    "warfarin": "ˈwɔɹfəɹɪn",
    # Common conditions
    "diabetes": "ˌdaɪəˈbiːtiːz",
    "hypertension": "ˌhaɪpɝˈtɛnʃən",
    "hypotension": "ˌhaɪpoʊˈtɛnʃən",
    "arrhythmia": "əˈɹɪðmiə",
    "tachycardia": "ˌtækɪˈkɑɹdiə",
    "bradycardia": "ˌbɹeɪdɪˈkɑɹdiə",
    "pneumonia": "nuˈmoʊniə",
    "bronchitis": "bɹɑŋˈkaɪtɪs",
    "asthma": "ˈæzmə",
    "emphysema": "ˌɛmfɪˈsiːmə",
    "atherosclerosis": "ˌæθəɹoʊskləˈɹoʊsɪs",
    "osteoporosis": "ˌɑstiːoʊpəˈɹoʊsɪs",
    "arthritis": "ɑɹˈθɹaɪtɪs",
    "leukemia": "luˈkiːmiə",
    "lymphoma": "lɪmˈfoʊmə",
    "melanoma": "ˌmɛləˈnoʊmə",
    "carcinoma": "ˌkɑɹsɪˈnoʊmə",
    "anemia": "əˈniːmiə",
    # Anatomy
    "cardiovascular": "ˌkɑɹdioʊˈvæskjəlɚ",
    "gastrointestinal": "ˌɡæstɹoʊɪnˈtɛstɪnəl",
    "musculoskeletal": "ˌmʌskjəloʊˈskɛlɪtəl",
    "cerebrovascular": "ˌsɛɹɪbɹoʊˈvæskjəlɚ",
    "pulmonary": "ˈpʊlməˌnɛɹi",
    "hepatic": "hɪˈpætɪk",
    "renal": "ˈɹiːnəl",
    "pancreatic": "ˌpænkɹiˈætɪk",
    "thyroid": "ˈθaɪɹɔɪd",
    "adrenal": "əˈdɹiːnəl",
}

# Gruut supported languages
GRUUT_LANGUAGES = {"en", "es", "de", "fr", "it", "pt", "nl", "sv", "cs", "pl", "ru"}


class EnhancedG2PService:
    """
    Enhanced Grapheme-to-Phoneme service using CMUdict + gruut hybrid.

    Fallback chain:
    1. Medical pronunciation cache (pre-computed common terms)
    2. CMUdict lookup (English only)
    3. gruut (multi-language support)
    4. espeak-ng (final fallback)
    """

    def __init__(self):
        self._cmudict: Optional[Dict[str, List[List[str]]]] = None
        self._gruut_available = False
        self._espeak_available = False

        # Runtime cache for G2P results
        self._cache: Dict[Tuple[str, str], G2PResult] = {}
        self._cache_max_size = 10000

        # Initialize backends
        self._init_backends()

    def _init_backends(self) -> None:
        """Initialize available G2P backends."""
        # Try to load CMUdict
        try:
            import cmudict

            self._cmudict = cmudict.dict()
            logger.info(f"CMUdict loaded with {len(self._cmudict)} entries")
        except ImportError:
            logger.warning("cmudict not available, falling back to other backends")
            self._cmudict = None

        # Check gruut availability
        try:
            from gruut import sentences  # noqa: F401

            self._gruut_available = True
            logger.info("gruut backend available")
        except ImportError:
            self._gruut_available = False
            logger.warning("gruut not available")

        # Check espeak-ng availability
        try:
            import shutil

            self._espeak_available = shutil.which("espeak-ng") is not None
            if self._espeak_available:
                logger.info("espeak-ng backend available")
            else:
                logger.warning("espeak-ng not found in PATH")
        except Exception:
            self._espeak_available = False

    def _arpabet_to_ipa(self, arpabet: List[str]) -> str:
        """Convert ARPABET phoneme list to IPA string."""
        ipa_phonemes = []
        for phone in arpabet:
            ipa = ARPABET_TO_IPA.get(phone, phone.lower())
            ipa_phonemes.append(ipa)
        return "".join(ipa_phonemes)

    async def generate(self, term: str, language: str = "en") -> G2PResult:
        """
        Generate phoneme representation for a term.

        Args:
            term: The word/phrase to convert
            language: ISO 639-1 language code

        Returns:
            G2PResult with phonemes and metadata
        """
        # Check cache first
        cache_key = (term.lower(), language)
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            return G2PResult(
                term=term,
                phonemes=cached.phonemes,
                source="cache",
                confidence=cached.confidence,
                alphabet=cached.alphabet,
            )

        result = await self._generate_uncached(term, language)

        # Add to cache
        if len(self._cache) < self._cache_max_size:
            self._cache[cache_key] = result

        return result

    async def _generate_uncached(self, term: str, language: str) -> G2PResult:
        """Generate phonemes without cache lookup."""
        term_lower = term.lower()

        # 1. Check medical pronunciation cache
        if term_lower in MEDICAL_PRONUNCIATION_CACHE:
            return G2PResult(
                term=term,
                phonemes=MEDICAL_PRONUNCIATION_CACHE[term_lower],
                source="medical_cache",
                confidence=0.95,
            )

        # 2. For English, try CMUdict
        if language == "en" and self._cmudict and term_lower in self._cmudict:
            arpabet = self._cmudict[term_lower][0]  # Use first pronunciation
            ipa = self._arpabet_to_ipa(arpabet)
            return G2PResult(
                term=term,
                phonemes=ipa,
                source="cmudict",
                confidence=0.9,
            )

        # 3. Try gruut for supported languages
        if self._gruut_available and language in GRUUT_LANGUAGES:
            try:
                phonemes = await self._generate_gruut(term, language)
                if phonemes:
                    return G2PResult(
                        term=term,
                        phonemes=phonemes,
                        source="gruut",
                        confidence=0.8,
                    )
            except Exception as e:
                logger.warning(f"gruut failed for '{term}': {e}")

        # 4. Fall back to espeak-ng
        if self._espeak_available:
            try:
                phonemes = await self._generate_espeak(term, language)
                if phonemes and not phonemes.startswith("/"):
                    return G2PResult(
                        term=term,
                        phonemes=phonemes,
                        source="espeak",
                        confidence=0.7,
                    )
            except Exception as e:
                logger.warning(f"espeak failed for '{term}': {e}")

        # 5. Final fallback - return term wrapped in slashes
        return G2PResult(
            term=term,
            phonemes=f"/{term}/",
            source="fallback",
            confidence=0.3,
        )

    async def _generate_gruut(self, term: str, language: str) -> Optional[str]:
        """Generate phonemes using gruut."""
        from gruut import sentences

        # Map to gruut language codes
        gruut_lang_map = {
            "en": "en-us",
            "es": "es-es",
            "de": "de-de",
            "fr": "fr-fr",
            "it": "it-it",
            "pt": "pt-pt",
            "nl": "nl",
            "sv": "sv-se",
            "cs": "cs-cz",
            "pl": "pl-pl",
            "ru": "ru-ru",
        }

        gruut_lang = gruut_lang_map.get(language, f"{language}-{language}")

        phonemes = []
        for sent in sentences(term, lang=gruut_lang):
            for word in sent:
                if word.phonemes:
                    phonemes.extend(word.phonemes)

        return " ".join(phonemes) if phonemes else None

    async def _generate_espeak(self, term: str, language: str) -> str:
        """Generate phonemes using espeak-ng."""
        # Map to espeak voice codes
        voice_map = {
            "en": "en-us",
            "es": "es",
            "fr": "fr",
            "de": "de",
            "it": "it",
            "pt": "pt",
            "ar": "ar",
            "hi": "hi",
            "zh": "zh",
            "ja": "ja",
            "ko": "ko",
            "ru": "ru",
            "pl": "pl",
            "tr": "tr",
        }

        voice = voice_map.get(language, "en-us")

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
                logger.warning(f"espeak-ng error: {stderr.decode()}")
                return f"/{term}/"
        except FileNotFoundError:
            return f"/{term}/"
        except asyncio.TimeoutError:
            return f"/{term}/"

    async def batch_generate(self, terms: List[str], language: str = "en") -> List[G2PResult]:
        """Generate phonemes for multiple terms."""
        results = await asyncio.gather(*[self.generate(term, language) for term in terms])
        return list(results)

    def get_stats(self) -> Dict[str, any]:
        """Get service statistics."""
        return {
            "cmudict_available": self._cmudict is not None,
            "cmudict_entries": len(self._cmudict) if self._cmudict else 0,
            "gruut_available": self._gruut_available,
            "espeak_available": self._espeak_available,
            "cache_size": len(self._cache),
            "medical_cache_size": len(MEDICAL_PRONUNCIATION_CACHE),
        }

    @property
    def last_source(self) -> Optional[str]:
        """Get source of last lookup (for testing)."""
        if self._cache:
            last_key = list(self._cache.keys())[-1]
            return self._cache[last_key].source
        return None
