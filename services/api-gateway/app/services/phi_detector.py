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
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


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
