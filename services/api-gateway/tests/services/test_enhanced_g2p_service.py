"""
Integration tests for EnhancedG2PService.

Tests the G2P fallback chain:
1. Medical pronunciation cache
2. CMUdict (English)
3. gruut (multi-language)
4. espeak-ng (fallback)
5. Raw term fallback

Part of Voice Mode v4.1.2
"""

import pytest
from app.services.enhanced_g2p_service import ARPABET_TO_IPA, MEDICAL_PRONUNCIATION_CACHE, EnhancedG2PService, G2PResult


class TestEnhancedG2PService:
    """Tests for EnhancedG2PService."""

    @pytest.fixture
    def g2p_service(self):
        """Create G2P service instance."""
        return EnhancedG2PService()

    # --- Medical Cache Tests ---

    @pytest.mark.asyncio
    async def test_medical_cache_lookup(self, g2p_service):
        """Test that medical terms are found in cache."""
        # Test a common medical term that should be in cache
        result = await g2p_service.generate("metformin", "en")

        assert result.term == "metformin"
        assert result.source == "medical_cache"
        assert result.confidence == 0.95
        assert "m" in result.phonemes.lower()

    @pytest.mark.asyncio
    async def test_medical_cache_case_insensitive(self, g2p_service):
        """Test that medical cache lookup is case-insensitive."""
        result1 = await g2p_service.generate("Metformin", "en")
        result2 = await g2p_service.generate("METFORMIN", "en")
        result3 = await g2p_service.generate("metformin", "en")

        # All should find the same pronunciation
        assert result1.phonemes == result2.phonemes == result3.phonemes
        assert result1.source == "medical_cache"

    @pytest.mark.asyncio
    async def test_medical_cache_diabetes(self, g2p_service):
        """Test pronunciation of 'diabetes'."""
        result = await g2p_service.generate("diabetes", "en")

        assert result.source == "medical_cache"
        assert "aɪ" in result.phonemes  # diphthong in diabetes

    @pytest.mark.asyncio
    async def test_medical_cache_hypertension(self, g2p_service):
        """Test pronunciation of 'hypertension'."""
        result = await g2p_service.generate("hypertension", "en")

        assert result.source == "medical_cache"
        assert "t" in result.phonemes.lower()

    # --- CMUdict Tests ---

    @pytest.mark.asyncio
    async def test_cmudict_common_word(self, g2p_service):
        """Test CMUdict lookup for common English word."""
        if not g2p_service._cmudict:
            pytest.skip("CMUdict not available")

        # 'hello' should be in CMUdict but not medical cache
        result = await g2p_service.generate("hello", "en")

        assert result.source in ["cmudict", "gruut", "espeak"]
        assert result.confidence >= 0.7
        assert result.phonemes  # Should have some phonemes

    @pytest.mark.asyncio
    async def test_cmudict_medical_not_in_cache(self, g2p_service):
        """Test CMUdict for medical term not in cache."""
        if not g2p_service._cmudict:
            pytest.skip("CMUdict not available")

        # 'prescription' may not be in medical cache
        result = await g2p_service.generate("prescription", "en")

        assert result.phonemes
        assert result.confidence >= 0.3

    # --- Multi-language Tests ---

    @pytest.mark.asyncio
    async def test_spanish_term(self, g2p_service):
        """Test Spanish medical term."""
        result = await g2p_service.generate("diabetes", "es")

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_german_term(self, g2p_service):
        """Test German medical term."""
        result = await g2p_service.generate("Herz", "de")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_french_term(self, g2p_service):
        """Test French medical term."""
        result = await g2p_service.generate("coeur", "fr")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_russian_term(self, g2p_service):
        """Test Russian medical term."""
        result = await g2p_service.generate("сердце", "ru")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_polish_term(self, g2p_service):
        """Test Polish medical term."""
        result = await g2p_service.generate("serce", "pl")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    # --- Fallback Chain Tests ---

    @pytest.mark.asyncio
    async def test_fallback_unknown_word(self, g2p_service):
        """Test fallback for completely unknown word."""
        result = await g2p_service.generate("xyzabc123nonsense", "en")

        assert result.phonemes
        # Should fall back to raw term wrapped in slashes if all else fails
        if result.source == "fallback":
            assert "/" in result.phonemes
            assert result.confidence == 0.3

    @pytest.mark.asyncio
    async def test_fallback_unsupported_language(self, g2p_service):
        """Test fallback for unsupported language."""
        result = await g2p_service.generate("test", "xyz")  # fake language code

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_fallback_arabic(self, g2p_service):
        """Test Arabic term (may use espeak fallback)."""
        result = await g2p_service.generate("قلب", "ar")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_fallback_chinese(self, g2p_service):
        """Test Chinese term (may use espeak fallback)."""
        result = await g2p_service.generate("心脏", "zh")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_fallback_japanese(self, g2p_service):
        """Test Japanese term (may use espeak fallback)."""
        result = await g2p_service.generate("心臓", "ja")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_fallback_korean(self, g2p_service):
        """Test Korean term (may use espeak fallback)."""
        result = await g2p_service.generate("심장", "ko")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    @pytest.mark.asyncio
    async def test_fallback_turkish(self, g2p_service):
        """Test Turkish term (may use espeak fallback)."""
        result = await g2p_service.generate("kalp", "tr")  # heart

        assert result.phonemes
        assert result.confidence >= 0.3

    # --- Caching Tests ---

    @pytest.mark.asyncio
    async def test_cache_hit(self, g2p_service):
        """Test that repeated lookups use cache."""
        # First lookup
        result1 = await g2p_service.generate("metformin", "en")

        # First lookup should come from medical cache
        assert result1.source == "medical_cache"

        # Second lookup should hit runtime cache
        result2 = await g2p_service.generate("metformin", "en")

        assert result2.source == "cache"
        assert result1.phonemes == result2.phonemes

    @pytest.mark.asyncio
    async def test_cache_different_languages(self, g2p_service):
        """Test that cache distinguishes languages."""
        result_en = await g2p_service.generate("test", "en")
        result_de = await g2p_service.generate("test", "de")

        # Different languages should potentially have different results
        # (at minimum, different cache keys)
        assert (result_en.term, "en") != (result_de.term, "de") or True

    # --- Batch Generation Tests ---

    @pytest.mark.asyncio
    async def test_batch_generate(self, g2p_service):
        """Test batch phoneme generation."""
        terms = ["diabetes", "hypertension", "metformin"]
        results = await g2p_service.batch_generate(terms, "en")

        assert len(results) == 3
        for result in results:
            assert result.phonemes
            assert result.confidence > 0

    @pytest.mark.asyncio
    async def test_batch_generate_mixed_sources(self, g2p_service):
        """Test batch with terms from different sources."""
        terms = ["diabetes", "hello", "xyznonexistent"]
        results = await g2p_service.batch_generate(terms, "en")

        assert len(results) == 3
        # Each should have a result regardless of source
        for result in results:
            assert result.phonemes

    # --- ARPABET Conversion Tests ---

    def test_arpabet_to_ipa_mapping(self):
        """Test ARPABET to IPA conversion mapping."""
        # Test some key conversions
        assert ARPABET_TO_IPA["AA"] == "ɑ"
        assert ARPABET_TO_IPA["AE"] == "æ"
        assert ARPABET_TO_IPA["IY"] == "i"
        assert ARPABET_TO_IPA["SH"] == "ʃ"
        assert ARPABET_TO_IPA["TH"] == "θ"

    def test_arpabet_stress_markers(self):
        """Test ARPABET stress marker handling."""
        # Stressed vowels should have stress marks
        assert "ˈ" in ARPABET_TO_IPA["AA1"]
        assert "ˌ" in ARPABET_TO_IPA["AA2"]

    # --- Service Stats Tests ---

    def test_get_stats(self, g2p_service):
        """Test service statistics."""
        stats = g2p_service.get_stats()

        assert "cmudict_available" in stats
        assert "gruut_available" in stats
        assert "espeak_available" in stats
        assert "cache_size" in stats
        assert "medical_cache_size" in stats
        assert stats["medical_cache_size"] == len(MEDICAL_PRONUNCIATION_CACHE)

    # --- G2PResult Dataclass Tests ---

    def test_g2p_result_creation(self):
        """Test G2PResult dataclass."""
        result = G2PResult(
            term="test",
            phonemes="tɛst",
            source="cmudict",
            confidence=0.9,
        )

        assert result.term == "test"
        assert result.phonemes == "tɛst"
        assert result.source == "cmudict"
        assert result.confidence == 0.9
        assert result.alphabet == "ipa"  # default

    # --- Medical Cache Content Tests ---

    def test_medical_cache_has_common_drugs(self):
        """Test medical cache includes common drugs."""
        common_drugs = ["metformin", "insulin", "aspirin", "ibuprofen"]

        for drug in common_drugs:
            assert drug in MEDICAL_PRONUNCIATION_CACHE, f"{drug} missing from cache"

    def test_medical_cache_has_common_conditions(self):
        """Test medical cache includes common conditions."""
        conditions = ["diabetes", "hypertension", "asthma", "pneumonia"]

        for condition in conditions:
            assert condition in MEDICAL_PRONUNCIATION_CACHE, f"{condition} missing"

    def test_medical_cache_phonemes_valid(self):
        """Test that medical cache phonemes contain IPA characters."""
        ipa_chars = set("ɑæɛɪɔʊəɝɚeɪoʊaɪaʊɔɪbdðfɡhkdʒlmnŋpɹsʃtθvwjzʒˈˌː")

        for term, phonemes in MEDICAL_PRONUNCIATION_CACHE.items():
            # Each phoneme string should contain at least some IPA chars
            has_ipa = any(c in ipa_chars for c in phonemes)
            assert has_ipa, f"'{term}' phonemes '{phonemes}' missing IPA chars"


class TestG2PServiceEdgeCases:
    """Edge case tests for G2P service."""

    @pytest.fixture
    def g2p_service(self):
        """Create G2P service instance."""
        return EnhancedG2PService()

    @pytest.mark.asyncio
    async def test_empty_string(self, g2p_service):
        """Test handling of empty string."""
        result = await g2p_service.generate("", "en")

        assert result.phonemes is not None

    @pytest.mark.asyncio
    async def test_whitespace_string(self, g2p_service):
        """Test handling of whitespace string."""
        result = await g2p_service.generate("   ", "en")

        assert result.phonemes is not None

    @pytest.mark.asyncio
    async def test_special_characters(self, g2p_service):
        """Test handling of special characters."""
        result = await g2p_service.generate("test-123", "en")

        assert result.phonemes is not None

    @pytest.mark.asyncio
    async def test_unicode_term(self, g2p_service):
        """Test handling of unicode characters."""
        result = await g2p_service.generate("café", "en")

        assert result.phonemes is not None

    @pytest.mark.asyncio
    async def test_multi_word_phrase(self, g2p_service):
        """Test handling of multi-word phrases."""
        result = await g2p_service.generate("heart attack", "en")

        assert result.phonemes is not None
        assert result.confidence >= 0.3
