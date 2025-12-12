"""PHI Detection Service for VoiceAssist.

This module provides PHI (Protected Health Information) detection to ensure
HIPAA compliance by identifying sensitive patient information in queries and
clinical contexts.

IMPORTANT: This is a basic implementation using pattern matching. For production,
consider using specialized medical NLP services like:
- AWS Comprehend Medical
- Microsoft Text Analytics for Health
- Custom NER models trained on medical data

See SECURITY_COMPLIANCE.md for full HIPAA requirements.

Performance Optimizations:
- Batch processing for large documents (chunks of 50KB)
- Pre-compiled regex patterns (at init)
- Early exit when PHI detected (optional)
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Generator

logger = logging.getLogger(__name__)

# Constants for batch processing
BATCH_SIZE = 50000  # 50KB chunks for large document processing
EARLY_EXIT_THRESHOLD = 5  # Stop after finding this many PHI types (optional)


class PHIDetectionResult:
    """Result of PHI detection"""

    def __init__(
        self,
        contains_phi: bool,
        phi_types: List[str],
        confidence: float = 1.0,
        details: Optional[Dict] = None,
    ):
        self.contains_phi = contains_phi
        self.phi_types = phi_types  # List of detected PHI types
        self.confidence = confidence  # Confidence score (0.0 - 1.0)
        self.details = details or {}  # Additional details about detection


class PHIDetector:
    """Basic PHI detector using pattern matching.

    Detects common PHI elements according to HIPAA Safe Harbor rules:
    - Names (first name + last name patterns)
    - Social Security Numbers
    - Medical Record Numbers
    - Account Numbers
    - Phone Numbers
    - Email Addresses
    - Dates (when combined with patient identifiers)
    - IP Addresses
    - URLs

    This is a conservative detector - it may flag some false positives
    to ensure PHI is not inadvertently sent to cloud services.
    """

    def __init__(self):
        # Compile regex patterns for performance
        self.patterns = {
            # SSN patterns (xxx-xx-xxxx or xxxxxxxxx)
            "ssn": re.compile(r"\b\d{3}[- ]?\d{2}[- ]?\d{4}\b"),
            # Phone numbers (various formats)
            "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
            # Email addresses
            "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
            # Medical Record Numbers (MRN-xxxxxxx or MRN xxxxxxx)
            "mrn": re.compile(
                r"\b(?:MRN|mrn|medical record|record number)[\s:-]?\d{6,}\b",
                re.IGNORECASE,
            ),
            # Account numbers (ACCT-xxxxxx or Account: xxxxxx)
            "account": re.compile(r"\b(?:ACCT|acct|account)[\s:-]?\d{6,}\b", re.IGNORECASE),
            # IP addresses
            "ip_address": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
            # URLs
            "url": re.compile(r"https?://[^\s]+"),
            # Dates with specific patient context (conservative - many false positives)
            # Only flag if date appears with words like "patient", "born", "dob", etc.
            "dob": re.compile(
                r"\b(?:born|dob|date of birth|birthday)[\s:]?"
                r"(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12][0-9]|3[01])[/-](?:19|20)\d{2}\b",
                re.IGNORECASE,
            ),
        }

        # Name detection (basic - looks for capitalized words that might be names)
        # This is very conservative and will have false positives
        self.name_pattern = re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b")

        # Known medical/clinical terms that are NOT PHI
        # (to reduce false positives from name detection)
        self.medical_terms = {
            "heart disease",
            "blood pressure",
            "diabetes mellitus",
            "atrial fibrillation",
            "chronic kidney",
            "coronary artery",
            "pulmonary embolism",
            "myocardial infarction",
            # Add more as needed
        }

    def detect(self, text: str, clinical_context: Optional[Dict] = None) -> PHIDetectionResult:
        """Detect PHI in text and clinical context.

        Args:
            text: Query text to analyze
            clinical_context: Optional clinical context dict

        Returns:
            PHIDetectionResult with detection results
        """
        if not text:
            return PHIDetectionResult(contains_phi=False, phi_types=[])

        phi_types = []
        details = {}

        # Check patterns
        for phi_type, pattern in self.patterns.items():
            matches = pattern.findall(text)
            if matches:
                phi_types.append(phi_type)
                details[phi_type] = len(matches)
                logger.warning(f"Detected potential PHI type '{phi_type}' in query (count={len(matches)})")

        # Check for names (but filter out medical terms)
        name_matches = self.name_pattern.findall(text)
        if name_matches:
            # Filter out known medical terms
            actual_names = [name for name in name_matches if name.lower() not in self.medical_terms]
            if actual_names:
                phi_types.append("name")
                details["name"] = len(actual_names)
                logger.warning(f"Detected potential names in query (count={len(actual_names)})")

        # Check clinical context for PHI
        if clinical_context:
            # Clinical context containing specific patient demographics is considered PHI
            phi_fields = ["patient_name", "patient_id", "ssn", "mrn", "dob"]
            for field in phi_fields:
                if clinical_context.get(field):
                    if field not in phi_types:
                        phi_types.append(field)
                    details[f"clinical_context_{field}"] = True

        contains_phi = len(phi_types) > 0

        if contains_phi:
            logger.warning(f"PHI detected: types={phi_types}, confidence=high, details={details}")

        return PHIDetectionResult(
            contains_phi=contains_phi,
            phi_types=phi_types,
            confidence=0.8,  # Pattern matching has good confidence but not perfect
            details=details,
        )

    def sanitize(self, text: str) -> str:
        """Redact detected PHI from text.

        Args:
            text: Text to sanitize

        Returns:
            Sanitized text with PHI redacted
        """
        sanitized = text

        # Replace each PHI pattern with redaction marker
        for phi_type, pattern in self.patterns.items():
            sanitized = pattern.sub(f"[{phi_type.upper()}_REDACTED]", sanitized)

        # Replace names
        sanitized = self.name_pattern.sub("[NAME_REDACTED]", sanitized)

        return sanitized

    def _chunk_text(self, text: str, chunk_size: int = BATCH_SIZE) -> Generator[str, None, None]:
        """Split large text into chunks for batch processing.

        Args:
            text: Text to chunk
            chunk_size: Size of each chunk in characters

        Yields:
            Text chunks
        """
        for i in range(0, len(text), chunk_size):
            yield text[i:i + chunk_size]

    def detect_batch(
        self,
        text: str,
        clinical_context: Optional[Dict] = None,
        early_exit: bool = True,
    ) -> PHIDetectionResult:
        """Detect PHI in large text using batch processing.

        Optimized for large documents - processes in chunks and can
        optionally exit early once PHI is confirmed.

        Args:
            text: Large text to analyze (e.g., entire document)
            clinical_context: Optional clinical context dict
            early_exit: If True, stop after finding PHI (faster for large docs)

        Returns:
            PHIDetectionResult with detection results
        """
        if not text:
            return PHIDetectionResult(contains_phi=False, phi_types=[])

        # For small texts, use regular detection
        if len(text) < BATCH_SIZE:
            return self.detect(text, clinical_context)

        logger.debug(f"Starting batch PHI detection on {len(text)} characters")

        all_phi_types = set()
        all_details: Dict = {}
        chunks_processed = 0

        for chunk in self._chunk_text(text):
            chunks_processed += 1

            # Check patterns in this chunk
            for phi_type, pattern in self.patterns.items():
                matches = pattern.findall(chunk)
                if matches:
                    all_phi_types.add(phi_type)
                    all_details[phi_type] = all_details.get(phi_type, 0) + len(matches)

            # Check for names in this chunk
            name_matches = self.name_pattern.findall(chunk)
            if name_matches:
                actual_names = [name for name in name_matches if name.lower() not in self.medical_terms]
                if actual_names:
                    all_phi_types.add("name")
                    all_details["name"] = all_details.get("name", 0) + len(actual_names)

            # Early exit if we've found enough PHI types
            if early_exit and len(all_phi_types) >= EARLY_EXIT_THRESHOLD:
                logger.info(
                    f"PHI detection early exit after {chunks_processed} chunks, "
                    f"found {len(all_phi_types)} PHI types"
                )
                break

        # Also check clinical context
        if clinical_context:
            phi_fields = ["patient_name", "patient_id", "ssn", "mrn", "dob"]
            for field in phi_fields:
                if clinical_context.get(field):
                    all_phi_types.add(field)
                    all_details[f"clinical_context_{field}"] = True

        phi_types_list = list(all_phi_types)
        contains_phi = len(phi_types_list) > 0

        if contains_phi:
            logger.warning(
                f"PHI detected in batch processing: types={phi_types_list}, "
                f"chunks_processed={chunks_processed}, details={all_details}"
            )

        return PHIDetectionResult(
            contains_phi=contains_phi,
            phi_types=phi_types_list,
            confidence=0.8,
            details=all_details,
        )

    def count_phi_occurrences(self, text: str) -> Dict[str, int]:
        """Count occurrences of each PHI type in text.

        Useful for generating reports on PHI density in documents.

        Args:
            text: Text to analyze

        Returns:
            Dictionary mapping PHI type to count
        """
        counts: Dict[str, int] = {}

        for phi_type, pattern in self.patterns.items():
            matches = pattern.findall(text)
            if matches:
                counts[phi_type] = len(matches)

        # Count names
        name_matches = self.name_pattern.findall(text)
        actual_names = [name for name in name_matches if name.lower() not in self.medical_terms]
        if actual_names:
            counts["name"] = len(actual_names)

        return counts
