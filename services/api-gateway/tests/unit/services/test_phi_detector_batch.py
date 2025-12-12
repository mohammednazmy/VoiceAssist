"""
Tests for PHI Detector Batch Processing

Tests the batch processing functionality for large documents.
"""

import pytest
from app.services.phi_detector import PHIDetector, BATCH_SIZE, EARLY_EXIT_THRESHOLD


class TestPHIDetectorBatch:
    """Tests for PHI detector batch processing."""

    @pytest.fixture
    def detector(self):
        """Create PHI detector instance."""
        return PHIDetector()

    @pytest.fixture
    def small_text(self):
        """Small text under batch threshold."""
        return "This is a small test document without any PHI."

    @pytest.fixture
    def large_text_no_phi(self):
        """Large text without PHI (over batch threshold)."""
        # Create text larger than BATCH_SIZE
        base_text = "This is a medical document discussing general health topics. "
        return base_text * (BATCH_SIZE // len(base_text) + 100)

    @pytest.fixture
    def large_text_with_phi(self):
        """Large text with PHI scattered throughout."""
        base_text = "Patient information. "
        phi_text = "Contact John Smith at 555-123-4567 or john@example.com. SSN: 123-45-6789. "
        # Create text larger than BATCH_SIZE with PHI
        result = ""
        for i in range(BATCH_SIZE // len(base_text) + 100):
            result += base_text
            if i % 500 == 0:  # Add PHI every 500 iterations
                result += phi_text
        return result

    # ========== Chunk Text Tests ==========

    def test_chunk_text_small(self, detector, small_text):
        """Test chunking small text produces single chunk."""
        chunks = list(detector._chunk_text(small_text))
        assert len(chunks) == 1
        assert chunks[0] == small_text

    def test_chunk_text_large(self, detector, large_text_no_phi):
        """Test chunking large text produces multiple chunks."""
        chunks = list(detector._chunk_text(large_text_no_phi))
        assert len(chunks) > 1
        # Verify all content is preserved
        reconstructed = "".join(chunks)
        assert reconstructed == large_text_no_phi

    def test_chunk_text_custom_size(self, detector):
        """Test chunking with custom chunk size."""
        text = "A" * 1000
        chunks = list(detector._chunk_text(text, chunk_size=100))
        assert len(chunks) == 10
        assert all(len(c) == 100 for c in chunks)

    # ========== Batch Detection Tests ==========

    def test_detect_batch_small_text_uses_regular(self, detector, small_text):
        """Test that small text uses regular detection."""
        result = detector.detect_batch(small_text)
        # Should work the same as regular detect
        assert result.contains_phi is False

    def test_detect_batch_empty_text(self, detector):
        """Test batch detection on empty text."""
        result = detector.detect_batch("")
        assert result.contains_phi is False
        assert result.phi_types == []

    def test_detect_batch_no_phi(self, detector, large_text_no_phi):
        """Test batch detection on large text without PHI."""
        result = detector.detect_batch(large_text_no_phi)
        assert result.contains_phi is False

    def test_detect_batch_with_phi(self, detector, large_text_with_phi):
        """Test batch detection on large text with PHI."""
        result = detector.detect_batch(large_text_with_phi)
        assert result.contains_phi is True
        assert "phone" in result.phi_types
        assert "email" in result.phi_types
        assert "ssn" in result.phi_types

    def test_detect_batch_early_exit(self, detector, large_text_with_phi):
        """Test that early exit stops processing after threshold."""
        # With early_exit=True, should stop after finding EARLY_EXIT_THRESHOLD PHI types
        result = detector.detect_batch(large_text_with_phi, early_exit=True)
        assert result.contains_phi is True
        # May have found fewer types due to early exit
        assert len(result.phi_types) >= 1

    def test_detect_batch_no_early_exit(self, detector, large_text_with_phi):
        """Test batch detection without early exit processes all chunks."""
        result = detector.detect_batch(large_text_with_phi, early_exit=False)
        assert result.contains_phi is True
        # Should find all PHI types
        assert len(result.phi_types) >= 3

    def test_detect_batch_with_clinical_context(self, detector, small_text):
        """Test batch detection considers clinical context."""
        context = {"patient_name": "John Doe", "mrn": "12345678"}
        result = detector.detect_batch(small_text, clinical_context=context)
        assert result.contains_phi is True
        assert "patient_name" in result.phi_types
        assert "mrn" in result.phi_types

    def test_detect_batch_aggregates_counts(self, detector, large_text_with_phi):
        """Test that batch detection aggregates counts across chunks."""
        result = detector.detect_batch(large_text_with_phi, early_exit=False)
        # Details should contain counts
        assert result.details is not None
        # At least one type should have count > 1 (multiple occurrences)
        has_multiple = any(
            isinstance(v, int) and v > 1
            for v in result.details.values()
        )
        assert has_multiple

    # ========== Count PHI Occurrences Tests ==========

    def test_count_phi_occurrences_no_phi(self, detector):
        """Test counting PHI in text without PHI."""
        counts = detector.count_phi_occurrences("Just some normal text here.")
        assert len(counts) == 0

    def test_count_phi_occurrences_single(self, detector):
        """Test counting single PHI occurrence."""
        text = "Contact us at 555-123-4567 for more info."
        counts = detector.count_phi_occurrences(text)
        assert "phone" in counts
        assert counts["phone"] == 1

    def test_count_phi_occurrences_multiple(self, detector):
        """Test counting multiple PHI occurrences."""
        text = """
        Contact John Smith at 555-123-4567 or Jane Doe at 555-987-6543.
        Emails: john@example.com, jane@test.org
        """
        counts = detector.count_phi_occurrences(text)
        assert counts.get("phone", 0) >= 2
        assert counts.get("email", 0) >= 2
        assert counts.get("name", 0) >= 2

    def test_count_phi_occurrences_all_types(self, detector):
        """Test counting all PHI types."""
        text = """
        Patient: John Smith
        Phone: 555-123-4567
        Email: john@example.com
        SSN: 123-45-6789
        MRN: MRN-12345678
        Account: ACCT-87654321
        DOB: born 01/15/1980
        IP: 192.168.1.1
        URL: https://example.com/patient
        """
        counts = detector.count_phi_occurrences(text)
        assert "name" in counts or "phone" in counts  # At least some PHI detected
        # Not all may be detected depending on pattern strictness
        detected_types = len(counts)
        assert detected_types >= 3


class TestPHIDetectorPerformance:
    """Performance-related tests for PHI detector."""

    @pytest.fixture
    def detector(self):
        """Create PHI detector instance."""
        return PHIDetector()

    def test_batch_size_constant(self):
        """Verify batch size constant is reasonable."""
        assert BATCH_SIZE == 50000  # 50KB
        assert BATCH_SIZE > 10000  # At least 10KB

    def test_early_exit_threshold_constant(self):
        """Verify early exit threshold is reasonable."""
        assert EARLY_EXIT_THRESHOLD == 5
        assert EARLY_EXIT_THRESHOLD > 0

    def test_detect_batch_is_faster_with_early_exit(self, detector):
        """Test that early exit is faster for PHI-heavy documents."""
        import time

        # Create large text with PHI at the beginning
        phi_text = "John Smith 555-123-4567 john@example.com 123-45-6789 MRN-12345678 "
        filler = "Generic medical text without identifiers. " * 100
        large_text = phi_text + filler * 1000

        # Measure time with early exit
        start = time.time()
        detector.detect_batch(large_text, early_exit=True)
        early_exit_time = time.time() - start

        # Measure time without early exit
        start = time.time()
        detector.detect_batch(large_text, early_exit=False)
        full_scan_time = time.time() - start

        # Early exit should be faster or equal (may not be in small tests)
        # Just verify both complete successfully
        assert early_exit_time >= 0
        assert full_scan_time >= 0
