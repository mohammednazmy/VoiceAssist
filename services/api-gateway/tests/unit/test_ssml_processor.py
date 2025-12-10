"""
Unit tests for SSML Processor.

Tests the SSML tag injection for natural speech rhythm:
- Sentence pauses
- Clause pauses
- List item pauses
- Paragraph breaks

Phase: Voice Mode Latency Optimization
"""

from app.services.ssml_processor import STYLE_PRESETS, SSMLConfig, SSMLProcessor, VoiceStyle


class TestSSMLProcessor:
    """Test SSML processor functionality."""

    def test_processor_creation(self):
        """Test creating processor with default config."""
        processor = SSMLProcessor()
        assert processor is not None

    def test_processor_with_custom_config(self):
        """Test creating processor with custom config."""
        config = SSMLConfig(
            sentence_pause_ms=500,
            clause_pause_ms=300,
            enabled=True,
        )
        processor = SSMLProcessor(config)
        assert processor is not None

    def test_empty_text_passthrough(self):
        """Test that empty text passes through unchanged."""
        processor = SSMLProcessor()
        assert processor.process("") == ""
        assert processor.process(None) is None

    def test_sentence_pause_after_period(self):
        """Test pause insertion after periods."""
        processor = SSMLProcessor(SSMLConfig(sentence_pause_ms=300))
        result = processor.process("Hello world. Goodbye world.")

        # Should have break tags after periods (before capital letter)
        assert '<break time="300ms"/>' in result
        assert "Hello world." in result
        assert "Goodbye world." in result

    def test_sentence_pause_after_question(self):
        """Test pause insertion after question marks."""
        processor = SSMLProcessor(SSMLConfig(question_pause_ms=400))
        result = processor.process("How are you? I am fine.")

        assert '<break time="400ms"/>' in result
        assert "How are you?" in result

    def test_sentence_pause_after_exclamation(self):
        """Test pause insertion after exclamation marks."""
        processor = SSMLProcessor(SSMLConfig(exclamation_pause_ms=250))
        result = processor.process("Hello! Welcome!")

        assert '<break time="250ms"/>' in result
        assert "Hello!" in result

    def test_clause_pause_after_comma(self):
        """Test pause insertion after commas."""
        processor = SSMLProcessor(SSMLConfig(clause_pause_ms=200))
        result = processor.process("First, we start. Second, we continue.")

        assert '<break time="200ms"/>' in result
        assert "First," in result

    def test_clause_pause_after_semicolon(self):
        """Test pause insertion after semicolons."""
        processor = SSMLProcessor(SSMLConfig(clause_pause_ms=200))
        result = processor.process("Start here; continue there.")

        assert '<break time="200ms"/>' in result

    def test_clause_pause_after_colon(self):
        """Test pause insertion after colons."""
        processor = SSMLProcessor(SSMLConfig(clause_pause_ms=200))
        result = processor.process("Here is the list: item one and two.")

        assert '<break time="200ms"/>' in result

    def test_list_pauses_ordinals(self):
        """Test pause insertion before ordinal words."""
        processor = SSMLProcessor(SSMLConfig(list_item_pause_ms=400))
        result = processor.process("First we start. Second we continue. Finally we end.")

        # Should have breaks before ordinal words
        assert '<break time="400ms"/>' in result

    def test_paragraph_breaks(self):
        """Test pause insertion at paragraph breaks."""
        processor = SSMLProcessor(SSMLConfig(paragraph_pause_ms=600))
        text = "First paragraph here.\n\nSecond paragraph starts."
        result = processor.process(text)

        assert '<break time="600ms"/>' in result

    def test_disabled_processor_passthrough(self):
        """Test that disabled processor returns text unchanged."""
        config = SSMLConfig(enabled=False)
        processor = SSMLProcessor(config)

        text = "Hello world. How are you?"
        result = processor.process(text)

        assert result == text
        assert "<break" not in result

    def test_style_presets_exist(self):
        """Test that style presets are defined."""
        assert VoiceStyle.CONVERSATIONAL in STYLE_PRESETS
        assert VoiceStyle.NARRATION in STYLE_PRESETS
        assert VoiceStyle.QUICK in STYLE_PRESETS

    def test_narration_style_longer_pauses(self):
        """Test that narration style has longer pauses."""
        conversational = STYLE_PRESETS[VoiceStyle.CONVERSATIONAL]
        narration = STYLE_PRESETS[VoiceStyle.NARRATION]

        assert narration.sentence_pause_ms > conversational.sentence_pause_ms
        assert narration.paragraph_pause_ms > conversational.paragraph_pause_ms

    def test_quick_style_shorter_pauses(self):
        """Test that quick style has shorter pauses."""
        conversational = STYLE_PRESETS[VoiceStyle.CONVERSATIONAL]
        quick = STYLE_PRESETS[VoiceStyle.QUICK]

        assert quick.sentence_pause_ms < conversational.sentence_pause_ms
        assert quick.paragraph_pause_ms < conversational.paragraph_pause_ms

    def test_process_with_style_override(self):
        """Test processing with style parameter."""
        processor = SSMLProcessor()

        text = "Hello world. How are you?"

        # Process with different styles
        result_conv = processor.process(text, style=VoiceStyle.CONVERSATIONAL)
        result_narration = processor.process(text, style=VoiceStyle.NARRATION)

        # Both should have breaks but with different durations
        assert "<break" in result_conv
        assert "<break" in result_narration

        # Narration should have longer pauses
        # Extract pause duration - narration should use 450ms, conversational 300ms
        assert 'time="450ms"' in result_narration or 'time="500ms"' in result_narration
        assert 'time="300ms"' in result_conv

    def test_duplicate_breaks_cleaned(self):
        """Test that duplicate/adjacent breaks are consolidated."""
        processor = SSMLProcessor()

        # Text that could trigger multiple break insertions
        text = "First. Second."

        result = processor.process(text)

        # Should not have adjacent break tags
        assert '<break time="' in result
        # Count break tags - should be reasonable
        break_count = result.count("<break")
        assert break_count <= 3  # One per sentence end at most

    def test_colon_not_in_time(self):
        """Test that colons in times are not treated as clause boundaries."""
        processor = SSMLProcessor(SSMLConfig(clause_pause_ms=200))
        result = processor.process("The time is 12:30 today.")

        # Should not insert break after the colon in time
        # The colon is followed by a digit, so it should be skipped
        assert "12:30" in result

    def test_enable_disable(self):
        """Test enable/disable methods."""
        processor = SSMLProcessor()

        # Start enabled
        result1 = processor.process("Hello. World.")
        assert "<break" in result1

        # Disable
        processor.disable()
        result2 = processor.process("Hello. World.")
        assert "<break" not in result2

        # Re-enable
        processor.enable()
        result3 = processor.process("Hello. World.")
        assert "<break" in result3


class TestSSMLIntegration:
    """Integration tests for realistic text processing."""

    def test_realistic_ai_response(self):
        """Test SSML processing on realistic AI response text."""
        processor = SSMLProcessor()

        text = """Hello! Welcome to the voice assistant.

Here's what I can help you with: answering questions, providing information, \
and having conversations.

First, you can ask me anything. Second, I'll try my best to help. \
Finally, feel free to interrupt if you have follow-up questions."""

        result = processor.process(text)

        # Should have breaks at various points
        assert '<break time="' in result

        # Original text content should be preserved
        assert "Welcome to the voice assistant" in result
        assert "answering questions" in result

    def test_preserves_content(self):
        """Test that content is preserved after processing."""
        processor = SSMLProcessor()

        original = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs!"

        result = processor.process(original)

        # Remove all SSML tags
        clean = result
        while "<break" in clean:
            start = clean.find("<break")
            end = clean.find("/>", start) + 2
            clean = clean[:start] + clean[end:]

        # Content should match (with possible whitespace differences)
        assert "quick brown fox" in clean
        assert "lazy dog" in clean
        assert "liquor jugs" in clean
