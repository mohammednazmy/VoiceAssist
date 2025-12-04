"""
De-identification Service - PHI Removal and Surrogation

Removes or replaces PHI in text before storage or export.
Supports multiple de-identification strategies.

Phase 4 Features:
- Complete PHI removal (redaction)
- Surrogate generation (realistic replacements)
- Date shifting (preserve temporal relationships)
- Reversible de-identification with secure tokens
- Audit logging of all operations
"""

import hashlib
import logging
import random
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class DeidentificationMethod(Enum):
    """De-identification methods"""

    REDACT = "redact"  # Replace with [REDACTED]
    MASK = "mask"  # Replace with *** or XXX
    SURROGATE = "surrogate"  # Replace with realistic fake data
    TOKEN = "token"  # Replace with reversible token
    SHIFT = "shift"  # Shift dates by fixed amount


@dataclass
class DeidentificationConfig:
    """Configuration for de-identification"""

    default_method: DeidentificationMethod = DeidentificationMethod.REDACT
    date_shift_days: int = 0  # Days to shift dates (0 = random per session)
    preserve_age: bool = True  # Preserve age when shifting dates
    preserve_format: bool = True  # Keep same format (e.g., XXX-XXX-XXXX for phone)
    generate_surrogates: bool = False  # Generate realistic surrogates
    enable_audit: bool = True  # Log all de-identification operations


@dataclass
class DeidentificationResult:
    """Result of de-identification operation"""

    original_text: str
    deidentified_text: str
    phi_count: int
    method_used: DeidentificationMethod
    replacements: List[Dict[str, Any]] = field(default_factory=list)
    reversible: bool = False
    token_map: Optional[Dict[str, str]] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


class SurrogateGenerator:
    """Generates realistic surrogate data for PHI replacement"""

    # Fake names for surrogation
    FIRST_NAMES_MALE = [
        "James",
        "John",
        "Robert",
        "Michael",
        "William",
        "David",
        "Richard",
        "Joseph",
        "Thomas",
        "Charles",
        "Christopher",
        "Daniel",
        "Matthew",
    ]
    FIRST_NAMES_FEMALE = [
        "Mary",
        "Patricia",
        "Jennifer",
        "Linda",
        "Elizabeth",
        "Barbara",
        "Susan",
        "Jessica",
        "Sarah",
        "Karen",
        "Nancy",
        "Margaret",
    ]
    LAST_NAMES = [
        "Smith",
        "Johnson",
        "Williams",
        "Brown",
        "Jones",
        "Garcia",
        "Miller",
        "Davis",
        "Rodriguez",
        "Martinez",
        "Hernandez",
        "Lopez",
        "Wilson",
    ]

    # Fake addresses
    STREET_NAMES = [
        "Main",
        "Oak",
        "Maple",
        "Cedar",
        "Pine",
        "Elm",
        "Washington",
        "Park",
        "Lake",
        "Hill",
        "Forest",
        "River",
        "Spring",
    ]
    STREET_TYPES = ["St", "Ave", "Rd", "Dr", "Ln", "Blvd", "Way"]
    CITIES = [
        "Springfield",
        "Riverside",
        "Franklin",
        "Clinton",
        "Madison",
        "Georgetown",
        "Salem",
        "Bristol",
        "Chester",
        "Dover",
    ]
    STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI"]

    def __init__(self, seed: Optional[int] = None):
        self._rng = random.Random(seed)

    def generate_name(self, gender: Optional[str] = None) -> str:
        """Generate a surrogate name"""
        if gender == "female":
            first = self._rng.choice(self.FIRST_NAMES_FEMALE)
        elif gender == "male":
            first = self._rng.choice(self.FIRST_NAMES_MALE)
        else:
            first = self._rng.choice(self.FIRST_NAMES_MALE + self.FIRST_NAMES_FEMALE)
        last = self._rng.choice(self.LAST_NAMES)
        return f"{first} {last}"

    def generate_phone(self, preserve_format: bool = True) -> str:
        """Generate a surrogate phone number"""
        area = self._rng.randint(200, 999)
        exchange = self._rng.randint(200, 999)
        subscriber = self._rng.randint(1000, 9999)
        if preserve_format:
            return f"({area}) {exchange}-{subscriber}"
        return f"{area}{exchange}{subscriber}"

    def generate_ssn(self, preserve_format: bool = True) -> str:
        """Generate a surrogate SSN (fake, not valid)"""
        # Use invalid area numbers (900-999 are not valid)
        area = self._rng.randint(900, 999)
        group = self._rng.randint(10, 99)
        serial = self._rng.randint(1000, 9999)
        if preserve_format:
            return f"{area}-{group}-{serial}"
        return f"{area}{group}{serial}"

    def generate_mrn(self, length: int = 8) -> str:
        """Generate a surrogate MRN"""
        return "".join(str(self._rng.randint(0, 9)) for _ in range(length))

    def generate_email(self, name: Optional[str] = None) -> str:
        """Generate a surrogate email"""
        if name:
            user = name.lower().replace(" ", ".")
        else:
            user = f"patient{self._rng.randint(1000, 9999)}"
        domain = self._rng.choice(["email.example", "mail.example", "test.example"])
        return f"{user}@{domain}.com"

    def generate_address(self) -> str:
        """Generate a surrogate address"""
        number = self._rng.randint(100, 9999)
        street = self._rng.choice(self.STREET_NAMES)
        street_type = self._rng.choice(self.STREET_TYPES)
        city = self._rng.choice(self.CITIES)
        state = self._rng.choice(self.STATES)
        zip_code = self._rng.randint(10000, 99999)
        return f"{number} {street} {street_type}, {city}, {state} {zip_code}"

    def generate_date(
        self,
        original_date: Optional[str] = None,
        shift_days: int = 0,
    ) -> str:
        """Generate a surrogate date"""
        if original_date and shift_days:
            # Parse and shift
            try:
                from dateutil.parser import parse

                dt = parse(original_date)
                shifted = dt + timedelta(days=shift_days)
                return shifted.strftime("%m/%d/%Y")
            except Exception:
                pass

        # Random date in reasonable range
        year = self._rng.randint(1940, 2005)
        month = self._rng.randint(1, 12)
        day = self._rng.randint(1, 28)
        return f"{month:02d}/{day:02d}/{year}"


class DeidentificationService:
    """
    De-identifies text by removing or replacing PHI.

    Supports multiple strategies:
    - Redaction: Replace with [REDACTED]
    - Masking: Replace with asterisks
    - Surrogation: Replace with realistic fake data
    - Tokenization: Replace with reversible tokens
    - Date shifting: Shift dates by fixed amount

    Integrates with audit service for compliance logging.

    Usage:
        service = DeidentificationService(detector, audit_service)
        result = await service.deidentify(text, session_id)
    """

    # Redaction markers per category
    REDACTION_MARKERS = {
        "name": "[NAME]",
        "date": "[DATE]",
        "dob": "[DOB]",
        "ssn": "[SSN]",
        "mrn": "[MRN]",
        "phone": "[PHONE]",
        "email": "[EMAIL]",
        "address": "[ADDRESS]",
        "default": "[REDACTED]",
    }

    def __init__(
        self,
        phi_detector=None,
        audit_service=None,
        config: Optional[DeidentificationConfig] = None,
    ):
        self._detector = phi_detector
        self._audit_service = audit_service
        self.config = config or DeidentificationConfig()
        self._surrogate_generator = SurrogateGenerator()
        self._token_store: Dict[str, Dict[str, str]] = {}  # session_id -> token_map
        self._date_shifts: Dict[str, int] = {}  # session_id -> shift_days

        logger.info("DeidentificationService initialized")

    async def deidentify(
        self,
        text: str,
        session_id: str,
        method: Optional[DeidentificationMethod] = None,
        patient_context: Optional[Dict] = None,
    ) -> DeidentificationResult:
        """
        De-identify text by removing or replacing PHI.

        Args:
            text: Text to de-identify
            session_id: Session ID for consistent tokenization
            method: De-identification method (default from config)
            patient_context: Patient context for context-aware detection

        Returns:
            DeidentificationResult with transformed text
        """
        method = method or self.config.default_method

        # Detect PHI
        if not self._detector:
            from .enhanced_phi_detector import EnhancedPHIDetector

            self._detector = EnhancedPHIDetector()
            await self._detector.initialize()

        detections = await self._detector.detect(text, patient_context, session_id)

        # Sort detections by position (reverse for safe replacement)
        detections = sorted(detections, key=lambda d: -d.start_pos)

        # Apply de-identification
        deidentified_text = text
        replacements = []

        for detection in detections:
            if detection.suppressed:
                continue  # Skip suppressed detections

            replacement = self._generate_replacement(detection, method, session_id)

            # Replace in text
            deidentified_text = (
                deidentified_text[: detection.start_pos] + replacement + deidentified_text[detection.end_pos :]
            )

            replacements.append(
                {
                    "original": detection.text,
                    "replacement": replacement,
                    "phi_type": detection.phi_category.value,
                    "position": detection.start_pos,
                    "method": method.value,
                }
            )

        # Audit logging
        if self.config.enable_audit and self._audit_service:
            await self._log_audit(
                session_id=session_id,
                phi_count=len(replacements),
                method=method,
            )

        return DeidentificationResult(
            original_text=text,
            deidentified_text=deidentified_text,
            phi_count=len(replacements),
            method_used=method,
            replacements=replacements,
            reversible=method == DeidentificationMethod.TOKEN,
            token_map=self._token_store.get(session_id) if method == DeidentificationMethod.TOKEN else None,
        )

    def _generate_replacement(
        self,
        detection: "EnhancedPHIDetection",
        method: DeidentificationMethod,
        session_id: str,
    ) -> str:
        """Generate replacement text for detected PHI"""
        phi_type = detection.phi_category.value
        original = detection.text

        if method == DeidentificationMethod.REDACT:
            return self.REDACTION_MARKERS.get(phi_type, self.REDACTION_MARKERS["default"])

        elif method == DeidentificationMethod.MASK:
            if self.config.preserve_format:
                return self._mask_preserving_format(original)
            return "*" * len(original)

        elif method == DeidentificationMethod.SURROGATE:
            return self._generate_surrogate(detection, session_id)

        elif method == DeidentificationMethod.TOKEN:
            return self._generate_token(original, session_id)

        elif method == DeidentificationMethod.SHIFT:
            if phi_type in ("date", "dob"):
                return self._shift_date(original, session_id)
            return original

        return self.REDACTION_MARKERS["default"]

    def _mask_preserving_format(self, text: str) -> str:
        """Mask text while preserving format (digits, dashes, etc.)"""
        result = []
        for char in text:
            if char.isalpha():
                result.append("X")
            elif char.isdigit():
                result.append("9")
            else:
                result.append(char)
        return "".join(result)

    def _generate_surrogate(
        self,
        detection: "EnhancedPHIDetection",
        session_id: str,
    ) -> str:
        """Generate a surrogate value for PHI"""
        phi_type = detection.phi_category.value

        if phi_type == "name":
            return self._surrogate_generator.generate_name()
        elif phi_type == "phone":
            return self._surrogate_generator.generate_phone(self.config.preserve_format)
        elif phi_type == "ssn":
            return self._surrogate_generator.generate_ssn(self.config.preserve_format)
        elif phi_type == "mrn":
            return self._surrogate_generator.generate_mrn()
        elif phi_type == "email":
            return self._surrogate_generator.generate_email()
        elif phi_type in ("address", "city", "state", "zip"):
            return self._surrogate_generator.generate_address()
        elif phi_type in ("date", "dob"):
            shift = self._get_date_shift(session_id)
            return self._surrogate_generator.generate_date(detection.text, shift)
        else:
            return self.REDACTION_MARKERS.get(phi_type, self.REDACTION_MARKERS["default"])

    def _generate_token(self, original: str, session_id: str) -> str:
        """Generate a reversible token for PHI"""
        if session_id not in self._token_store:
            self._token_store[session_id] = {}

        # Check if we already have a token for this value
        for token, value in self._token_store[session_id].items():
            if value == original:
                return token

        # Generate new token
        token = f"[[TOKEN_{secrets.token_hex(4).upper()}]]"
        self._token_store[session_id][token] = original
        return token

    def _get_date_shift(self, session_id: str) -> int:
        """Get consistent date shift for session"""
        if session_id not in self._date_shifts:
            if self.config.date_shift_days:
                self._date_shifts[session_id] = self.config.date_shift_days
            else:
                # Random shift between 30-365 days
                self._date_shifts[session_id] = random.randint(30, 365)
        return self._date_shifts[session_id]

    def _shift_date(self, date_str: str, session_id: str) -> str:
        """Shift a date by the session's shift amount"""
        try:
            from dateutil.parser import parse

            dt = parse(date_str)
            shift = self._get_date_shift(session_id)
            shifted = dt + timedelta(days=shift)
            # Try to preserve original format
            if "/" in date_str:
                return shifted.strftime("%m/%d/%Y")
            elif "-" in date_str:
                return shifted.strftime("%Y-%m-%d")
            return shifted.strftime("%m/%d/%Y")
        except Exception:
            return "[DATE]"

    async def reidentify(
        self,
        text: str,
        session_id: str,
    ) -> Optional[str]:
        """
        Re-identify tokenized text (reverse de-identification).

        Only works for TOKEN method with valid session.
        """
        if session_id not in self._token_store:
            return None

        result = text
        for token, original in self._token_store[session_id].items():
            result = result.replace(token, original)

        return result

    def clear_session_tokens(self, session_id: str) -> bool:
        """Clear stored tokens for a session"""
        if session_id in self._token_store:
            del self._token_store[session_id]
            return True
        if session_id in self._date_shifts:
            del self._date_shifts[session_id]
        return False

    async def _log_audit(
        self,
        session_id: str,
        phi_count: int,
        method: DeidentificationMethod,
    ) -> None:
        """Log de-identification operation to audit service"""
        if not self._audit_service:
            return

        try:
            await self._audit_service.log_event(
                event_type="phi.deidentified",
                session_id=session_id,
                details={
                    "phi_count": phi_count,
                    "method": method.value,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get de-identification statistics"""
        return {
            "active_sessions": len(self._token_store),
            "total_tokens": sum(len(t) for t in self._token_store.values()),
            "date_shift_sessions": len(self._date_shifts),
        }


__all__ = [
    "DeidentificationService",
    "DeidentificationConfig",
    "DeidentificationResult",
    "DeidentificationMethod",
    "SurrogateGenerator",
]
