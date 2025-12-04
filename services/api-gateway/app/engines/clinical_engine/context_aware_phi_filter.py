"""
Context-Aware PHI Filter - Intelligent Alert Suppression

Suppresses PHI alerts when the detected PHI matches the current
patient context, avoiding false positives for expected PHI.

Phase 4 Features:
- Patient context matching (name, DOB, MRN, etc.)
- Fuzzy name matching for variations
- Provider context awareness
- Organization context for facility names
"""

import logging
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import Enum
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class SuppressionReason(Enum):
    """Reasons for suppressing a PHI alert"""

    CURRENT_PATIENT_NAME = "current_patient_name"
    CURRENT_PATIENT_DOB = "current_patient_dob"
    CURRENT_PATIENT_MRN = "current_patient_mrn"
    CURRENT_PATIENT_PHONE = "current_patient_phone"
    CURRENT_PATIENT_ADDRESS = "current_patient_address"
    CURRENT_PROVIDER_NAME = "current_provider_name"
    CURRENT_FACILITY_NAME = "current_facility_name"
    KNOWN_CLINICAL_TERM = "known_clinical_term"
    FALSE_POSITIVE_PATTERN = "false_positive_pattern"


@dataclass
class PatientContext:
    """Current patient information for context-aware filtering"""

    patient_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    dob: Optional[str] = None  # YYYY-MM-DD format
    mrn: Optional[str] = None
    ssn_last4: Optional[str] = None  # Only last 4 for matching
    phone: Optional[str] = None
    address: Optional[Dict[str, str]] = None  # street, city, state, zip
    email: Optional[str] = None

    @property
    def name_parts(self) -> Set[str]:
        """Get all name parts for matching"""
        parts = set()
        if self.first_name:
            parts.add(self.first_name.lower())
        if self.last_name:
            parts.add(self.last_name.lower())
        if self.middle_name:
            parts.add(self.middle_name.lower())
        return parts


@dataclass
class ProviderContext:
    """Current provider information"""

    provider_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    specialty: Optional[str] = None
    facility_name: Optional[str] = None


class ContextAwarePHIFilter:
    """
    Filters PHI detections based on current context.

    Suppresses alerts when PHI matches:
    - Current patient's own information
    - Current provider's name (expected in notes)
    - Current facility name
    - Known clinical terms that match PHI patterns

    Uses fuzzy matching for names to catch variations:
    - Nicknames (Bob/Robert, Bill/William)
    - Typos and transcription errors
    - Case variations

    Usage:
        filter = ContextAwarePHIFilter()
        filtered = await filter.filter(detections, patient_context)
    """

    # Common nicknames for fuzzy matching
    NICKNAME_MAP = {
        "robert": {"bob", "bobby", "rob", "bert"},
        "william": {"will", "bill", "billy", "willy"},
        "richard": {"rick", "dick", "rich", "ricky"},
        "james": {"jim", "jimmy", "jamie"},
        "john": {"jack", "johnny", "jon"},
        "michael": {"mike", "mikey", "mick"},
        "elizabeth": {"liz", "beth", "lizzy", "betty", "eliza"},
        "margaret": {"maggie", "meg", "peggy", "marge"},
        "jennifer": {"jen", "jenny"},
        "katherine": {"kate", "kathy", "katie", "kat"},
        "patricia": {"pat", "patty", "trish"},
        "thomas": {"tom", "tommy"},
        "joseph": {"joe", "joey"},
        "david": {"dave", "davey"},
        "daniel": {"dan", "danny"},
        "christopher": {"chris", "topher"},
        "matthew": {"matt", "matty"},
        "anthony": {"tony", "ant"},
    }

    # Clinical terms that might match PHI patterns
    FALSE_POSITIVE_TERMS = {
        # Time-related (match date patterns)
        "q4h",
        "q6h",
        "q8h",
        "q12h",
        "bid",
        "tid",
        "qid",
        # Measurement patterns
        "2-3",
        "4-5",
        "1-2",
        # Common clinical numbers
        "911",  # Emergency, not phone
        "411",  # Info
    }

    # Fuzzy match threshold (0-1)
    NAME_MATCH_THRESHOLD = 0.85

    def __init__(self):
        # Build reverse nickname map for fast lookup
        self._reverse_nicknames: Dict[str, Set[str]] = {}
        for formal, nicknames in self.NICKNAME_MAP.items():
            for nick in nicknames:
                if nick not in self._reverse_nicknames:
                    self._reverse_nicknames[nick] = set()
                self._reverse_nicknames[nick].add(formal)
            # Also map formal to itself and nicknames
            if formal not in self._reverse_nicknames:
                self._reverse_nicknames[formal] = set()
            self._reverse_nicknames[formal].update(nicknames)

        logger.info("ContextAwarePHIFilter initialized")

    async def filter(
        self,
        detections: List["EnhancedPHIDetection"],
        patient_context: Optional[Dict] = None,
        provider_context: Optional[Dict] = None,
    ) -> List["EnhancedPHIDetection"]:
        """
        Filter PHI detections based on context.

        Args:
            detections: List of PHI detections
            patient_context: Current patient info dict
            provider_context: Current provider info dict

        Returns:
            List of detections with suppression flags set
        """
        if not detections:
            return []

        # Convert dicts to dataclasses
        patient = self._parse_patient_context(patient_context) if patient_context else None
        provider = self._parse_provider_context(provider_context) if provider_context else None

        for detection in detections:
            # Check for false positive patterns
            if self._is_false_positive(detection.text):
                detection.suppressed = True
                detection.suppression_reason = SuppressionReason.FALSE_POSITIVE_PATTERN.value
                continue

            # Check patient context
            if patient:
                reason = self._check_patient_match(detection, patient)
                if reason:
                    detection.suppressed = True
                    detection.suppression_reason = reason.value
                    detection.is_current_patient = True
                    continue

            # Check provider context
            if provider:
                reason = self._check_provider_match(detection, provider)
                if reason:
                    detection.suppressed = True
                    detection.suppression_reason = reason.value
                    continue

        return detections

    def _parse_patient_context(self, context: Dict) -> PatientContext:
        """Parse patient context dict to dataclass"""
        return PatientContext(
            patient_id=context.get("id") or context.get("patient_id"),
            first_name=context.get("first_name") or context.get("given_name"),
            last_name=context.get("last_name") or context.get("family_name"),
            middle_name=context.get("middle_name"),
            dob=context.get("dob") or context.get("date_of_birth"),
            mrn=context.get("mrn") or context.get("medical_record_number"),
            ssn_last4=context.get("ssn_last4"),
            phone=context.get("phone") or context.get("phone_number"),
            address=context.get("address"),
            email=context.get("email"),
        )

    def _parse_provider_context(self, context: Dict) -> ProviderContext:
        """Parse provider context dict to dataclass"""
        return ProviderContext(
            provider_id=context.get("id") or context.get("provider_id"),
            first_name=context.get("first_name"),
            last_name=context.get("last_name"),
            specialty=context.get("specialty"),
            facility_name=context.get("facility") or context.get("facility_name"),
        )

    def _check_patient_match(
        self,
        detection: "EnhancedPHIDetection",
        patient: PatientContext,
    ) -> Optional[SuppressionReason]:
        """Check if detection matches patient context"""
        from .enhanced_phi_detector import PHICategory

        category = detection.phi_category
        text = detection.text.lower().strip()

        if category == PHICategory.NAME:
            if self._matches_name(text, patient):
                return SuppressionReason.CURRENT_PATIENT_NAME

        elif category in (PHICategory.DATE, PHICategory.DOB):
            if patient.dob and self._matches_date(text, patient.dob):
                return SuppressionReason.CURRENT_PATIENT_DOB

        elif category == PHICategory.MRN:
            if patient.mrn and self._matches_mrn(text, patient.mrn):
                return SuppressionReason.CURRENT_PATIENT_MRN

        elif category == PHICategory.PHONE:
            if patient.phone and self._matches_phone(text, patient.phone):
                return SuppressionReason.CURRENT_PATIENT_PHONE

        elif category == PHICategory.EMAIL:
            if patient.email and text == patient.email.lower():
                return SuppressionReason.CURRENT_PATIENT_NAME

        elif category in (PHICategory.ADDRESS, PHICategory.CITY, PHICategory.STATE, PHICategory.ZIP):
            if patient.address and self._matches_address(text, patient.address):
                return SuppressionReason.CURRENT_PATIENT_ADDRESS

        return None

    def _check_provider_match(
        self,
        detection: "EnhancedPHIDetection",
        provider: ProviderContext,
    ) -> Optional[SuppressionReason]:
        """Check if detection matches provider context"""
        from .enhanced_phi_detector import PHICategory

        category = detection.phi_category
        text = detection.text.lower().strip()

        if category == PHICategory.NAME:
            if provider.first_name and provider.last_name:
                name_parts = {provider.first_name.lower(), provider.last_name.lower()}
                if any(self._fuzzy_match(text, part) for part in name_parts):
                    return SuppressionReason.CURRENT_PROVIDER_NAME

        elif category == PHICategory.ORGANIZATION:
            if provider.facility_name:
                if self._fuzzy_match(text, provider.facility_name.lower()):
                    return SuppressionReason.CURRENT_FACILITY_NAME

        return None

    def _matches_name(self, detected_text: str, patient: PatientContext) -> bool:
        """Check if detected text matches patient name"""
        # Direct match on name parts
        if detected_text in patient.name_parts:
            return True

        # Check for nicknames
        for name_part in patient.name_parts:
            if self._are_name_variants(detected_text, name_part):
                return True

        # Fuzzy match for typos
        for name_part in patient.name_parts:
            if self._fuzzy_match(detected_text, name_part):
                return True

        # Check full name
        if patient.first_name and patient.last_name:
            full_name = f"{patient.first_name} {patient.last_name}".lower()
            if self._fuzzy_match(detected_text, full_name):
                return True

        return False

    def _are_name_variants(self, name1: str, name2: str) -> bool:
        """Check if names are variants of each other (nicknames)"""
        name1_lower = name1.lower()
        name2_lower = name2.lower()

        # Get all variants for each name
        variants1 = self._reverse_nicknames.get(name1_lower, set())
        variants1.add(name1_lower)

        variants2 = self._reverse_nicknames.get(name2_lower, set())
        variants2.add(name2_lower)

        # Check for overlap
        return bool(variants1 & variants2)

    def _fuzzy_match(self, text1: str, text2: str) -> bool:
        """Fuzzy string matching using sequence matcher"""
        if not text1 or not text2:
            return False
        ratio = SequenceMatcher(None, text1, text2).ratio()
        return ratio >= self.NAME_MATCH_THRESHOLD

    def _matches_date(self, detected_date: str, patient_dob: str) -> bool:
        """Check if detected date matches patient DOB"""
        # Extract digits only
        detected_digits = re.sub(r"\D", "", detected_date)
        patient_digits = re.sub(r"\D", "", patient_dob)

        if detected_digits == patient_digits:
            return True

        # Handle different date formats (MMDDYYYY vs YYYYMMDD)
        if len(detected_digits) == 8 and len(patient_digits) == 8:
            # MMDDYYYY
            mmddyyyy = detected_digits[4:8] + detected_digits[0:4]
            if mmddyyyy == patient_digits:
                return True
            # YYYYMMDD
            yyyymmdd = detected_digits[0:4] + detected_digits[4:8]
            if yyyymmdd == patient_digits:
                return True

        return False

    def _matches_mrn(self, detected_mrn: str, patient_mrn: str) -> bool:
        """Check if detected MRN matches patient MRN"""
        detected_digits = re.sub(r"\D", "", detected_mrn)
        patient_digits = re.sub(r"\D", "", patient_mrn)
        return detected_digits == patient_digits

    def _matches_phone(self, detected_phone: str, patient_phone: str) -> bool:
        """Check if detected phone matches patient phone"""
        detected_digits = re.sub(r"\D", "", detected_phone)
        patient_digits = re.sub(r"\D", "", patient_phone)

        # Handle 10-digit vs 11-digit (with country code)
        if len(detected_digits) == 11 and detected_digits.startswith("1"):
            detected_digits = detected_digits[1:]
        if len(patient_digits) == 11 and patient_digits.startswith("1"):
            patient_digits = patient_digits[1:]

        return detected_digits == patient_digits

    def _matches_address(
        self,
        detected_text: str,
        patient_address: Dict[str, str],
    ) -> bool:
        """Check if detected text matches patient address"""
        # Check each address component
        for key, value in patient_address.items():
            if value and detected_text.lower() == value.lower():
                return True

        # Check if detected text is part of full address
        full_address = " ".join(v for v in patient_address.values() if v).lower()
        if detected_text in full_address:
            return True

        return False

    def _is_false_positive(self, text: str) -> bool:
        """Check if text is a known false positive"""
        text_lower = text.lower().strip()
        return text_lower in self.FALSE_POSITIVE_TERMS


__all__ = [
    "ContextAwarePHIFilter",
    "PatientContext",
    "ProviderContext",
    "SuppressionReason",
]
