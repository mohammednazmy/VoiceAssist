"""
PHI Detector - Hybrid NER + Regex PHI Detection

Combines regex patterns (fast, high precision) with NER models
(comprehensive) for robust PHI detection.
"""

import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Pattern

logger = logging.getLogger(__name__)


@dataclass
class RegexPattern:
    """Compiled regex pattern with metadata"""

    pattern: Pattern
    phi_type: str
    confidence: float


class PHIDetector:
    """
    Hybrid PHI detection using regex + NER ensemble.

    Regex provides fast, high-precision detection for structured PHI:
    - SSN, phone numbers, dates, MRN formats

    NER (when available) provides comprehensive detection:
    - Names, addresses, organization names

    Context-aware suppression:
    - Doesn't alert on current patient's own data
    - Fuzzy matching for name variations
    """

    # HIPAA 18 Safe Harbor identifiers to detect
    PHI_TYPES = [
        "name",
        "dob",
        "age_over_89",
        "ssn",
        "mrn",
        "phone",
        "fax",
        "email",
        "address",
        "url",
        "ip",
        "device_id",
        "license",
        "vehicle_id",
        "account",
        "certificate",
        "biometric",
        "photo",
    ]

    # Regex patterns for structured PHI
    PATTERNS = [
        # SSN
        (r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b", "ssn", 0.95),
        # Phone numbers
        (r"\b(?:\+1[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b", "phone", 0.9),
        # Dates (various formats)
        (
            r"\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b",
            "dob",
            0.8,
        ),
        (
            r"\b(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])\b",
            "dob",
            0.8,
        ),
        # Email
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "email", 0.95),
        # MRN (common formats)
        (r"\bMRN[:\s#]*\d{6,10}\b", "mrn", 0.95),
        (r"\b\d{2}-\d{6,8}\b", "mrn", 0.7),  # Less confident, common MRN format
        # Zip codes (5 or 9 digit)
        (r"\b\d{5}(?:-\d{4})?\b", "address", 0.6),
        # Age over 89
        (r"\b(?:9[0-9]|1[0-4]\d|150)\s*(?:years?|yo|y\.?o\.?)\b", "age_over_89", 0.9),
    ]

    def __init__(self, policy_config=None):
        self.policy_config = policy_config
        self._compiled_patterns: List[RegexPattern] = []
        self._ner_model = None

        # Get config
        if policy_config:
            self.confidence_threshold = getattr(policy_config, "phi_confidence_threshold", 0.85)
        else:
            self.confidence_threshold = 0.85

        # Compile patterns
        self._compile_patterns()
        logger.info("PHIDetector initialized")

    def _compile_patterns(self):
        """Compile regex patterns"""
        for pattern, phi_type, confidence in self.PATTERNS:
            try:
                compiled = re.compile(pattern, re.IGNORECASE)
                self._compiled_patterns.append(RegexPattern(compiled, phi_type, confidence))
            except re.error as e:
                logger.error(f"Failed to compile pattern: {pattern} - {e}")

    async def detect(
        self,
        text: str,
        patient_context: Optional[Dict] = None,
    ) -> List["PHIDetection"]:
        """
        Detect PHI in text.

        Args:
            text: Text to scan
            patient_context: Current patient info for context-aware suppression

        Returns:
            List of PHI detections
        """

        detections = []

        # Regex detection
        regex_detections = self._detect_regex(text)
        detections.extend(regex_detections)

        # NER detection (if model available)
        if self._ner_model:
            ner_detections = await self._detect_ner(text)
            detections.extend(ner_detections)

        # Deduplicate overlapping detections
        detections = self._deduplicate(detections)

        # Context-aware suppression
        if patient_context:
            detections = self._apply_context_suppression(detections, patient_context)

        # Filter by confidence threshold
        detections = [d for d in detections if d.confidence >= self.confidence_threshold]

        return detections

    def _detect_regex(self, text: str) -> List["PHIDetection"]:
        """Detect PHI using regex patterns"""
        from . import PHIDetection

        detections = []
        for pattern in self._compiled_patterns:
            for match in pattern.pattern.finditer(text):
                detections.append(
                    PHIDetection(
                        text=match.group(),
                        phi_type=pattern.phi_type,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        confidence=pattern.confidence,
                    )
                )
        return detections

    async def _detect_ner(self, text: str) -> List["PHIDetection"]:
        """Detect PHI using NER model"""

        # TODO: Implement NER model inference
        # Will use fine-tuned model on i2b2 PHI dataset
        return []

    def _deduplicate(self, detections: List["PHIDetection"]) -> List["PHIDetection"]:
        """Remove overlapping detections, keeping highest confidence"""
        if not detections:
            return []

        # Sort by position, then confidence descending
        sorted_detections = sorted(
            detections,
            key=lambda d: (d.start_pos, -d.confidence),
        )

        result = []
        last_end = -1

        for detection in sorted_detections:
            if detection.start_pos >= last_end:
                result.append(detection)
                last_end = detection.end_pos
            # If overlapping, higher confidence one was already added

        return result

    def _apply_context_suppression(
        self,
        detections: List["PHIDetection"],
        patient_context: Dict,
    ) -> List["PHIDetection"]:
        """Suppress alerts for current patient's own data"""
        patient_name = patient_context.get("name", "").lower()
        patient_dob = patient_context.get("dob", "")
        patient_mrn = patient_context.get("mrn", "")

        for detection in detections:
            text_lower = detection.text.lower()

            # Check if matches current patient
            is_current = False

            if detection.phi_type == "name" and patient_name:
                # Fuzzy name matching
                name_parts = patient_name.split()
                if any(part in text_lower for part in name_parts):
                    is_current = True

            elif detection.phi_type == "dob" and patient_dob:
                # Normalize and compare dates
                if self._dates_match(detection.text, patient_dob):
                    is_current = True

            elif detection.phi_type == "mrn" and patient_mrn:
                # Extract digits and compare
                det_digits = re.sub(r"\D", "", detection.text)
                ctx_digits = re.sub(r"\D", "", patient_mrn)
                if det_digits == ctx_digits:
                    is_current = True

            if is_current:
                detection.is_current_patient = True
                detection.suppressed = True

        return detections

    def _dates_match(self, date1: str, date2: str) -> bool:
        """Check if two date strings match (various formats)"""
        # Extract digits
        d1 = re.sub(r"\D", "", date1)
        d2 = re.sub(r"\D", "", date2)

        # Compare digit sequences
        if d1 == d2:
            return True

        # Try different orderings (MMDDYYYY vs YYYYMMDD)
        if len(d1) == 8 and len(d2) == 8:
            if d1[4:8] + d1[0:4] == d2:
                return True
            if d1 == d2[4:8] + d2[0:4]:
                return True

        return False

    async def load_ner_model(self, model_path: str) -> bool:
        """Load NER model for enhanced detection"""
        try:
            # TODO: Load fine-tuned transformer model
            logger.info(f"Would load NER model from {model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load NER model: {e}")
            return False


__all__ = ["PHIDetector", "RegexPattern"]
