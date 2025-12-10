"""
Unit tests for Adaptive Chunker functionality.

Tests the adaptive chunking strategy that provides:
- Small first chunks for fast TTFA
- Larger subsequent chunks for naturalness

Phase: Voice Mode Latency Optimization
"""

from app.services.sentence_chunker import AdaptiveChunkerConfig, ChunkerConfig, SentenceChunker


class TestAdaptiveChunker:
    """Test adaptive chunking behavior."""

    def test_adaptive_config_creation(self):
        """Test creating adaptive config with custom values."""
        config = AdaptiveChunkerConfig(
            first_chunk_min=15,
            first_chunk_optimal=25,
            first_chunk_max=40,
            subsequent_min=40,
            subsequent_optimal=100,
            subsequent_max=180,
            chunks_before_natural=2,
            enabled=True,
        )
        assert config.first_chunk_min == 15
        assert config.first_chunk_optimal == 25
        assert config.first_chunk_max == 40
        assert config.subsequent_min == 40
        assert config.subsequent_optimal == 100
        assert config.subsequent_max == 180
        assert config.chunks_before_natural == 2
        assert config.enabled is True

    def test_first_chunk_uses_small_limits(self):
        """Test that first chunk uses smaller limits for fast TTFA."""
        chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=40,
                optimal_chunk_chars=100,
                max_chunk_chars=200,
            ),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=20,
                first_chunk_max=30,
                subsequent_min=40,
                subsequent_optimal=100,
                subsequent_max=200,
                chunks_before_natural=1,
                enabled=True,
            ),
        )

        # Get effective limits before any chunks emitted
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()

        # Should use first chunk limits
        assert min_chars == 10
        assert optimal_chars == 20
        assert max_chars == 30

    def test_subsequent_chunks_use_natural_limits(self):
        """Test that chunks after the first use larger natural limits."""
        chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=40,
                optimal_chunk_chars=100,
                max_chunk_chars=200,
            ),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=20,
                first_chunk_max=30,
                subsequent_min=40,
                subsequent_optimal=100,
                subsequent_max=200,
                chunks_before_natural=1,
                enabled=True,
            ),
        )

        # Simulate first chunk emission
        chunker._first_chunk_emitted = True
        chunker._chunks_emitted = 1

        # Get effective limits after first chunk
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()

        # Should use subsequent (natural) limits
        assert min_chars == 40
        assert optimal_chars == 100
        assert max_chars == 200

    def test_adaptive_disabled_uses_static_limits(self):
        """Test that disabled adaptive config uses static limits."""
        chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=50,
                optimal_chunk_chars=120,
                max_chunk_chars=250,
            ),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=20,
                first_chunk_max=30,
                enabled=False,  # Disabled
            ),
        )

        # Should use static config limits
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()
        assert min_chars == 50
        assert optimal_chars == 120
        assert max_chars == 250

    def test_no_adaptive_config_uses_static_limits(self):
        """Test that no adaptive config uses static limits."""
        chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=50,
                optimal_chunk_chars=120,
                max_chunk_chars=250,
            ),
            adaptive_config=None,
        )

        # Should use static config limits
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()
        assert min_chars == 50
        assert optimal_chars == 120
        assert max_chars == 250

    def test_first_chunk_extracted_early(self):
        """Test that first chunk is extracted at smaller size."""
        chunker = SentenceChunker(
            config=ChunkerConfig(
                min_chunk_chars=40,
                optimal_chunk_chars=100,
                max_chunk_chars=200,
            ),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=15,
                first_chunk_max=30,
                subsequent_min=40,
                subsequent_optimal=100,
                subsequent_max=200,
                chunks_before_natural=1,
                enabled=True,
            ),
        )

        # Add text with a sentence boundary early
        text = "Hello there. This is a longer sentence that continues on."
        chunks = chunker.add_token(text)

        # First chunk should be extracted early (at "Hello there.")
        assert len(chunks) >= 1
        assert chunks[0] == "Hello there."

    def test_reset_clears_adaptive_state(self):
        """Test that reset clears adaptive mode tracking."""
        chunker = SentenceChunker(
            config=ChunkerConfig(),
            adaptive_config=AdaptiveChunkerConfig(enabled=True),
        )

        # Simulate having emitted chunks
        chunker._first_chunk_emitted = True
        chunker._chunks_emitted = 5

        # Reset
        chunker.reset()

        # State should be cleared
        assert chunker._first_chunk_emitted is False
        assert chunker._chunks_emitted == 0
        assert chunker._buffer == ""

    def test_chunks_before_natural_respected(self):
        """Test that multiple chunks can use first-chunk limits."""
        chunker = SentenceChunker(
            config=ChunkerConfig(),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=20,
                first_chunk_max=30,
                subsequent_min=40,
                subsequent_optimal=100,
                subsequent_max=200,
                chunks_before_natural=3,  # Use small limits for 3 chunks
                enabled=True,
            ),
        )

        # Simulate 2 chunks emitted (still under threshold)
        chunker._first_chunk_emitted = True
        chunker._chunks_emitted = 2

        # Should still use first chunk limits
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()
        assert min_chars == 10
        assert optimal_chars == 20
        assert max_chars == 30

        # Simulate 3 chunks emitted (at threshold)
        chunker._chunks_emitted = 3

        # Should now use subsequent limits
        min_chars, optimal_chars, max_chars = chunker._get_effective_limits()
        assert min_chars == 40
        assert optimal_chars == 100
        assert max_chars == 200


class TestChunkerIntegration:
    """Integration tests for the chunker with realistic text."""

    def test_streaming_text_adaptive(self):
        """Test chunking with simulated streaming tokens."""
        chunker = SentenceChunker(
            config=ChunkerConfig(),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=15,
                first_chunk_optimal=25,
                first_chunk_max=40,
                subsequent_min=40,
                subsequent_optimal=80,
                subsequent_max=150,
                chunks_before_natural=1,
                enabled=True,
            ),
        )

        # Simulate streaming tokens
        text = (
            "Hello! Welcome to the app. This is a longer sentence that "
            "demonstrates how adaptive chunking works for natural speech synthesis."
        )
        all_chunks = []

        # Feed tokens one word at a time
        words = text.split(" ")
        for i, word in enumerate(words):
            token = word if i == 0 else " " + word
            chunks = chunker.add_token(token)
            all_chunks.extend(chunks)

        # Flush remaining
        final = chunker.flush()
        if final:
            all_chunks.append(final)

        # Should have multiple chunks
        assert len(all_chunks) >= 2

        # First chunk should be short (optimized for TTFA)
        assert len(all_chunks[0]) <= 50

    def test_force_split_at_max(self):
        """Test that very long text is force-split at max chars."""
        chunker = SentenceChunker(
            config=ChunkerConfig(),
            adaptive_config=AdaptiveChunkerConfig(
                first_chunk_min=10,
                first_chunk_optimal=20,
                first_chunk_max=40,
                subsequent_min=10,
                subsequent_optimal=20,
                subsequent_max=50,  # Small max for testing
                enabled=True,
            ),
        )

        # Add text without sentence boundaries
        long_text = (
            "This is a very long continuous text without any sentence "
            "boundaries that should eventually be force split at word "
            "boundaries when it exceeds the maximum chunk size"
        )
        chunks = chunker.add_token(long_text)

        # Should have extracted chunks due to force splitting
        assert len(chunks) >= 2
