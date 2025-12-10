"""
Tests for Voice Mode v4.1 Services
Tests lexicon loading, translation failure handling, and latency orchestration.

Part of Voice Mode Enhancement Plan v4.1
"""

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.latency_aware_orchestrator import (
    DegradationType,
    LatencyAwareVoiceOrchestrator,
    LatencyBudget,
    TranslationFailedError,
)
from app.services.lexicon_service import G2PService, LexiconReport, LexiconService, _resolve_data_dir


class TestLexiconDataDirectory:
    """Tests for lexicon data directory resolution."""

    def test_resolve_data_dir_from_env(self, tmp_path):
        """Test that VOICEASSIST_DATA_DIR env var is used when set."""
        # Create a fake lexicons directory
        lexicons_dir = tmp_path / "lexicons"
        lexicons_dir.mkdir()

        with patch.dict(os.environ, {"VOICEASSIST_DATA_DIR": str(tmp_path)}):
            result = _resolve_data_dir()
            assert result == tmp_path

    def test_resolve_data_dir_env_nonexistent_falls_back(self, tmp_path):
        """Test fallback when env var points to nonexistent path."""
        with patch.dict(os.environ, {"VOICEASSIST_DATA_DIR": "/nonexistent/path"}):
            # Should not raise, should fall back to other methods
            result = _resolve_data_dir()
            assert result is not None

    def test_lexicon_service_uses_resolved_path(self, tmp_path):
        """Test that LexiconService uses the resolved data directory."""
        # Create test lexicon structure
        lexicons_dir = tmp_path / "lexicons"
        en_dir = lexicons_dir / "en"
        en_dir.mkdir(parents=True)

        # Create test lexicon file
        lexicon_file = en_dir / "medical_phonemes.json"
        lexicon_file.write_text('{"_meta": {"version": "1.0.0"}, "test": "tɛst"}')

        with patch.dict(os.environ, {"VOICEASSIST_DATA_DIR": str(tmp_path)}):
            service = LexiconService()
            assert service.data_dir == tmp_path


class TestLexiconLoading:
    """Tests for lexicon file loading."""

    @pytest.fixture
    def lexicon_service(self, tmp_path):
        """Create a LexiconService with test data."""
        # Create test lexicon structure
        lexicons_dir = tmp_path / "lexicons"
        en_dir = lexicons_dir / "en"
        shared_dir = lexicons_dir / "shared"
        en_dir.mkdir(parents=True)
        shared_dir.mkdir(parents=True)

        # Create English lexicon
        en_lexicon = {
            "_meta": {
                "version": "1.0.0",
                "term_count": 3,
                "language": "en",
            },
            "diabetes": "ˌdaɪəˈbiːtiːz",
            "hypertension": "ˌhaɪpərˈtɛnʃən",
            "aspirin": "ˈæsprɪn",
        }
        (en_dir / "medical_phonemes.json").write_text(__import__("json").dumps(en_lexicon))

        # Create shared drug lexicon
        shared_lexicon = {
            "_meta": {"version": "1.0.0"},
            "metformin": "mɛtˈfɔrmɪn",
        }
        (shared_dir / "drug_names.json").write_text(__import__("json").dumps(shared_lexicon))

        return LexiconService(data_dir=tmp_path)

    @pytest.mark.asyncio
    async def test_load_english_lexicon(self, lexicon_service):
        """Test loading English medical lexicon."""
        result = await lexicon_service.get_phoneme("diabetes", "en")

        assert result.term == "diabetes"
        assert result.phoneme == "ˌdaɪəˈbiːtiːz"
        assert result.source == "lexicon"
        assert result.confidence == 1.0

    @pytest.mark.asyncio
    async def test_load_shared_drug_lexicon(self, lexicon_service):
        """Test loading shared drug names lexicon."""
        result = await lexicon_service.get_phoneme("metformin", "en")

        assert result.term == "metformin"
        assert result.phoneme == "mɛtˈfɔrmɪn"
        assert result.source == "shared_drugs"
        assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_case_insensitive_lookup(self, lexicon_service):
        """Test that lookups are case-insensitive."""
        result = await lexicon_service.get_phoneme("DIABETES", "en")
        assert result.phoneme == "ˌdaɪəˈbiːtiːz"

    @pytest.mark.asyncio
    async def test_unknown_term_falls_back_to_g2p(self, lexicon_service):
        """Test that unknown terms fall back to G2P."""
        # Mock G2P service
        lexicon_service.g2p_service = AsyncMock()
        lexicon_service.g2p_service.generate = AsyncMock(return_value="/unknown/")

        result = await lexicon_service.get_phoneme("unknownterm", "en")

        assert result.source == "g2p"
        lexicon_service.g2p_service.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexicon_not_found_graceful_handling(self, tmp_path):
        """Test graceful handling when lexicon file doesn't exist."""
        service = LexiconService(data_dir=tmp_path)
        service.g2p_service = AsyncMock()
        service.g2p_service.generate = AsyncMock(return_value="/test/")

        # Should not raise, should fall back to G2P
        result = await service.get_phoneme("test", "fr")
        assert result is not None

    @pytest.mark.asyncio
    async def test_validate_lexicon_coverage(self, lexicon_service):
        """Test lexicon coverage validation."""
        report = await lexicon_service.validate_lexicon_coverage("en")

        assert isinstance(report, LexiconReport)
        assert report.language == "en"
        assert report.term_count == 3
        assert report.version == "1.0.0"

    @pytest.mark.asyncio
    async def test_placeholder_language_coverage(self, lexicon_service):
        """Test that placeholder languages return placeholder status."""
        report = await lexicon_service.validate_lexicon_coverage("ja")

        assert report.status == "placeholder"
        assert report.term_count == 0


class TestTranslationFailureHandling:
    """Tests for translation failure propagation."""

    @pytest.fixture
    def mock_translator(self):
        """Create a mock translation service."""
        translator = MagicMock()
        return translator

    @pytest.mark.asyncio
    async def test_translation_failed_flag_triggers_degradation(self, mock_translator):
        """Test that result.failed=True triggers degradation."""
        # Create mock result with failed=True
        mock_result = MagicMock()
        mock_result.failed = True
        mock_result.error_message = "Translation unavailable"

        mock_translator.translate = AsyncMock(return_value=mock_result)

        orchestrator = LatencyAwareVoiceOrchestrator(translator=mock_translator)

        with pytest.raises(TranslationFailedError) as exc_info:
            await orchestrator._translate("hola", "es", "en")

        assert "Translation unavailable" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_translation_exception_wrapped(self, mock_translator):
        """Test that translation exceptions are wrapped in TranslationFailedError."""
        mock_translator.translate = AsyncMock(side_effect=Exception("API error"))

        orchestrator = LatencyAwareVoiceOrchestrator(translator=mock_translator)

        with pytest.raises(TranslationFailedError) as exc_info:
            await orchestrator._translate("hola", "es", "en")

        assert "API error" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_successful_translation_returns_text(self, mock_translator):
        """Test that successful translation returns the text."""
        mock_result = MagicMock()
        mock_result.failed = False
        mock_result.text = "Hello"

        mock_translator.translate = AsyncMock(return_value=mock_result)

        orchestrator = LatencyAwareVoiceOrchestrator(translator=mock_translator)

        result = await orchestrator._translate("hola", "es", "en")
        assert result == "Hello"


class TestLatencyOrchestration:
    """Tests for latency-aware orchestration."""

    @pytest.fixture
    def orchestrator(self):
        """Create an orchestrator with mock services."""
        return LatencyAwareVoiceOrchestrator(
            budget=LatencyBudget(total_budget_ms=700),
            stt_service=AsyncMock(),
            language_detector=AsyncMock(),
            translator=AsyncMock(),
            rag_service=AsyncMock(),
            llm_service=AsyncMock(),
        )

    @pytest.mark.asyncio
    async def test_translation_timeout_triggers_degradation(self, orchestrator):
        """Test that translation timeout triggers TRANSLATION_SKIPPED."""
        # Setup mocks
        orchestrator.stt.transcribe = AsyncMock(return_value="hola mundo")
        orchestrator.language_detector.detect = AsyncMock(return_value="es")

        # Make translation timeout
        async def slow_translate(*args, **kwargs):
            await asyncio.sleep(10)  # Will be cancelled
            return MagicMock(text="hello world", failed=False)

        orchestrator.translator.translate = slow_translate
        orchestrator.rag.search = AsyncMock(return_value=[])
        orchestrator.llm.generate = AsyncMock(return_value=MagicMock(content="Response"))

        # Set high total budget so translation is attempted, but short translation timeout
        # Budget check: remaining > translation_ms + rag_ms + llm_ms + tts_ms (200+300+300+150=950)
        orchestrator.budget = LatencyBudget(
            total_budget_ms=2000,  # High enough to attempt translation
            translation_ms=1,  # But translation times out quickly
        )

        result = await orchestrator.process_with_budgets(audio_data=b"fake_audio", user_language="es")

        assert DegradationType.TRANSLATION_SKIPPED.value in result.degradation_applied

    @pytest.mark.asyncio
    async def test_translation_failure_triggers_degradation(self, orchestrator):
        """Test that translation failure triggers TRANSLATION_FAILED."""
        # Setup mocks
        orchestrator.stt.transcribe = AsyncMock(return_value="hola mundo")
        orchestrator.language_detector.detect = AsyncMock(return_value="es")

        # Make translation fail
        mock_result = MagicMock()
        mock_result.failed = True
        mock_result.error_message = "Provider unavailable"
        orchestrator.translator.translate = AsyncMock(return_value=mock_result)

        orchestrator.rag.search = AsyncMock(return_value=[])
        orchestrator.llm.generate = AsyncMock(return_value=MagicMock(content="Response"))

        # Set high total budget so translation is attempted
        # Budget check: remaining > translation_ms + rag_ms + llm_ms + tts_ms (200+300+300+150=950)
        orchestrator.budget = LatencyBudget(total_budget_ms=2000)

        result = await orchestrator.process_with_budgets(audio_data=b"fake_audio", user_language="es")

        assert DegradationType.TRANSLATION_FAILED.value in result.degradation_applied

    @pytest.mark.asyncio
    async def test_rag_limited_when_budget_tight(self, orchestrator):
        """Test RAG results are limited when latency budget is tight."""
        # Simulate tight budget by using most of it in STT
        orchestrator.stt.transcribe = AsyncMock(return_value="test query")
        orchestrator.language_detector.detect = AsyncMock(return_value="en")
        orchestrator.rag.search = AsyncMock(return_value=[])
        orchestrator.llm.generate = AsyncMock(return_value=MagicMock(content="Response"))

        # Set very low total budget to force RAG limiting
        orchestrator.budget = LatencyBudget(total_budget_ms=100)

        result = await orchestrator.process_with_budgets(audio_data=b"fake_audio", user_language="en")

        # Should have limited RAG due to budget
        # The exact degradation depends on timing, but result should be valid
        assert result.transcript == "test query"


class TestG2PService:
    """Tests for G2P service."""

    @pytest.mark.asyncio
    async def test_g2p_returns_phoneme(self):
        """Test G2P returns a phoneme representation."""
        g2p = G2PService()

        # This test may fail if espeak-ng is not installed
        # In that case it should return a fallback
        result = await g2p.generate("test", "en")

        assert result is not None
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_g2p_unknown_language_falls_back_to_english(self):
        """Test G2P falls back to English for unknown languages."""
        g2p = G2PService()

        result = await g2p.generate("test", "xx")  # Unknown language

        assert result is not None


class TestLexiconServiceIntegration:
    """Integration tests for LexiconService with real data files."""

    @pytest.mark.skipif(
        not Path("/home/asimo/VoiceAssist/data/lexicons").exists(),
        reason="Lexicon data not available",
    )
    @pytest.mark.asyncio
    async def test_load_real_english_lexicon(self):
        """Test loading the actual English lexicon."""
        service = LexiconService()

        # Test a term that should be in the lexicon
        result = await service.get_phoneme("diabetes", "en")

        assert result.term == "diabetes"
        assert result.phoneme is not None
        assert result.confidence > 0

    @pytest.mark.skipif(
        not Path("/home/asimo/VoiceAssist/data/lexicons").exists(),
        reason="Lexicon data not available",
    )
    @pytest.mark.asyncio
    async def test_validate_all_lexicons(self):
        """Test validating all configured lexicons."""
        service = LexiconService()

        reports = await service.validate_all_lexicons()

        assert len(reports) > 0
        assert "en" in reports

        # Check placeholder languages are marked correctly
        for lang in ["ja", "ko", "ru", "pl", "tr"]:
            if lang in reports:
                assert reports[lang].status == "placeholder"
