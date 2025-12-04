"""
EHR Command Executor - Voice Commands for EHR Write Operations

Phase 6b: Enables voice commands for creating orders and notes in Epic:
- "Order CBC" / "Order basic metabolic panel"
- "Prescribe amoxicillin 500 mg twice daily"
- "Add diagnosis type 2 diabetes"
- "Save note" / "Submit dictation"

Requires explicit confirmation before submitting any order.
Publishes ehr.order_submitted events for auditing.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from ..plugin_registry import DictationPlugin

logger = logging.getLogger(__name__)


# ==============================================================================
# Command Models
# ==============================================================================


class OrderType(str, Enum):
    """Types of EHR orders"""

    MEDICATION = "medication"
    LAB = "lab"
    IMAGING = "imaging"
    PROCEDURE = "procedure"
    DIAGNOSIS = "diagnosis"
    NOTE = "note"


class OrderStatus(str, Enum):
    """Order status in workflow"""

    PENDING_CONFIRMATION = "pending_confirmation"
    CONFIRMED = "confirmed"
    SUBMITTED = "submitted"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ParsedOrder:
    """Parsed order from voice command"""

    order_type: OrderType
    raw_text: str
    parsed_data: Dict[str, Any] = field(default_factory=dict)
    status: OrderStatus = OrderStatus.PENDING_CONFIRMATION
    confidence: float = 0.0

    # Resolved codes
    code: Optional[str] = None
    code_system: Optional[str] = None
    code_display: Optional[str] = None

    # Order details
    quantity: Optional[float] = None
    unit: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    priority: str = "routine"

    # Warnings and conflicts
    warnings: List[str] = field(default_factory=list)
    conflicts: List[Dict[str, Any]] = field(default_factory=list)

    # Result
    result_id: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_type": self.order_type.value,
            "raw_text": self.raw_text,
            "status": self.status.value,
            "confidence": self.confidence,
            "code": self.code,
            "code_system": self.code_system,
            "code_display": self.code_display,
            "quantity": self.quantity,
            "unit": self.unit,
            "frequency": self.frequency,
            "duration": self.duration,
            "priority": self.priority,
            "warnings": self.warnings,
            "conflicts": self.conflicts,
            "result_id": self.result_id,
            "error": self.error,
        }

    def get_confirmation_text(self) -> str:
        """Generate confirmation speech text"""
        if self.order_type == OrderType.MEDICATION:
            text = f"Prescribe {self.code_display or 'medication'}"
            if self.quantity and self.unit:
                text += f", {self.quantity} {self.unit}"
            if self.frequency:
                text += f", {self.frequency}"
            return text + "?"

        elif self.order_type == OrderType.LAB:
            return f"Order {self.code_display or 'lab test'}?"

        elif self.order_type == OrderType.IMAGING:
            return f"Order {self.code_display or 'imaging study'}?"

        elif self.order_type == OrderType.DIAGNOSIS:
            return f"Add diagnosis: {self.code_display}?"

        elif self.order_type == OrderType.NOTE:
            return "Save the current note to the patient's chart?"

        return f"Submit {self.order_type.value}?"


@dataclass
class OrderSession:
    """Session state for order workflow"""

    session_id: str
    patient_id: Optional[str] = None
    practitioner_id: Optional[str] = None
    encounter_id: Optional[str] = None

    pending_order: Optional[ParsedOrder] = None
    submitted_orders: List[ParsedOrder] = field(default_factory=list)

    created_at: datetime = field(default_factory=datetime.utcnow)


# ==============================================================================
# Command Patterns
# ==============================================================================


# Medication patterns
MEDICATION_PATTERNS = [
    # "prescribe amoxicillin 500 mg twice daily"
    r"(?:prescribe|order|start)\s+(\w+(?:\s+\w+)?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?)\s*(?:(\w+(?:\s+\w+)?)\s*(?:daily|times?\s+(?:a\s+)?day|bid|tid|qid|prn))?",
    # "prescribe metformin"
    r"(?:prescribe|order|start)\s+(\w+(?:\s+\w+)?)",
    # "give patient lisinopril 10 mg daily"
    r"(?:give\s+(?:the\s+)?patient)\s+(\w+(?:\s+\w+)?)\s*(?:(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?))?",
]

# Lab order patterns
LAB_PATTERNS = [
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:cbc|complete\s+blood\s+count)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:bmp|basic\s+metabolic\s+panel)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:cmp|complete\s+metabolic\s+panel)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:lfts?|liver\s+function\s+tests?)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:tsh|thyroid)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:ua|urinalysis)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:hba1c|hemoglobin\s+a1c|a1c)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:lipid\s+panel|cholesterol)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:pt|inr|coagulation)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:troponin|cardiac\s+enzymes)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:bnp|pro\s*bnp)",
    r"order\s+(?:a\s+)?(?:stat\s+)?labs?",
]

# Imaging patterns
IMAGING_PATTERNS = [
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:chest\s+)?(?:x-?ray|xray|cxr)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:ct|cat)\s+(?:scan\s+)?(?:of\s+)?(\w+)",
    r"order\s+(?:a\s+)?(?:stat\s+)?mri\s+(?:of\s+)?(\w+)",
    r"order\s+(?:a\s+)?(?:stat\s+)?ultrasound\s+(?:of\s+)?(\w+)",
    r"order\s+(?:a\s+)?(?:stat\s+)?(?:echo|echocardiogram)",
]

# Diagnosis patterns
DIAGNOSIS_PATTERNS = [
    r"(?:add|document)\s+diagnosis\s+(?:of\s+)?(.+)",
    r"(?:add|document)\s+(?:to\s+)?(?:problem\s+list)?\s*(.+)",
    r"patient\s+has\s+(?:a\s+)?(?:diagnosis\s+of\s+)?(.+)",
]

# Note save patterns
NOTE_PATTERNS = [
    r"save\s+(?:the\s+)?note",
    r"submit\s+(?:the\s+)?(?:note|dictation)",
    r"sign\s+(?:the\s+)?note",
    r"finalize\s+(?:the\s+)?(?:note|dictation)",
]

# Confirmation patterns
CONFIRMATION_PATTERNS = [
    r"(?:yes|confirm|correct|submit|proceed|do\s+it|go\s+ahead)",
]

# Cancellation patterns
CANCELLATION_PATTERNS = [
    r"(?:no|cancel|nevermind|never\s+mind|stop|wait)",
]


# ==============================================================================
# Code Mappings (simplified - would use terminology service in production)
# ==============================================================================


LAB_CODE_MAP = {
    "cbc": ("58410-2", "http://loinc.org", "Complete blood count"),
    "complete blood count": ("58410-2", "http://loinc.org", "Complete blood count"),
    "bmp": ("51990-0", "http://loinc.org", "Basic metabolic panel"),
    "basic metabolic panel": ("51990-0", "http://loinc.org", "Basic metabolic panel"),
    "cmp": ("24323-8", "http://loinc.org", "Complete metabolic panel"),
    "complete metabolic panel": (
        "24323-8",
        "http://loinc.org",
        "Complete metabolic panel",
    ),
    "lft": ("24325-3", "http://loinc.org", "Liver function panel"),
    "liver function": ("24325-3", "http://loinc.org", "Liver function panel"),
    "tsh": ("3016-3", "http://loinc.org", "TSH"),
    "thyroid": ("3016-3", "http://loinc.org", "TSH"),
    "ua": ("24356-8", "http://loinc.org", "Urinalysis complete"),
    "urinalysis": ("24356-8", "http://loinc.org", "Urinalysis complete"),
    "hba1c": ("4548-4", "http://loinc.org", "Hemoglobin A1c"),
    "a1c": ("4548-4", "http://loinc.org", "Hemoglobin A1c"),
    "hemoglobin a1c": ("4548-4", "http://loinc.org", "Hemoglobin A1c"),
    "lipid": ("57698-3", "http://loinc.org", "Lipid panel"),
    "lipid panel": ("57698-3", "http://loinc.org", "Lipid panel"),
    "cholesterol": ("57698-3", "http://loinc.org", "Lipid panel"),
    "pt": ("5902-2", "http://loinc.org", "Prothrombin time"),
    "inr": ("6301-6", "http://loinc.org", "INR"),
    "troponin": ("6598-7", "http://loinc.org", "Troponin I"),
    "cardiac enzymes": ("6598-7", "http://loinc.org", "Troponin I"),
    "bnp": ("42637-9", "http://loinc.org", "BNP"),
    "pro bnp": ("33762-6", "http://loinc.org", "NT-proBNP"),
}

IMAGING_CODE_MAP = {
    "chest x-ray": ("36643-5", "http://loinc.org", "Chest X-ray"),
    "cxr": ("36643-5", "http://loinc.org", "Chest X-ray"),
    "ct head": ("24725-4", "http://loinc.org", "CT Head without contrast"),
    "ct chest": ("24627-2", "http://loinc.org", "CT Chest without contrast"),
    "ct abdomen": ("24558-9", "http://loinc.org", "CT Abdomen without contrast"),
    "mri brain": ("24590-2", "http://loinc.org", "MRI Brain without contrast"),
    "echo": ("34552-0", "http://loinc.org", "Echocardiogram"),
    "echocardiogram": ("34552-0", "http://loinc.org", "Echocardiogram"),
}

# Common medication RxNorm codes (simplified)
MEDICATION_CODE_MAP = {
    "amoxicillin": (
        "723",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Amoxicillin",
    ),
    "lisinopril": (
        "29046",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Lisinopril",
    ),
    "metformin": ("6809", "http://www.nlm.nih.gov/research/umls/rxnorm", "Metformin"),
    "atorvastatin": (
        "83367",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Atorvastatin",
    ),
    "omeprazole": ("7646", "http://www.nlm.nih.gov/research/umls/rxnorm", "Omeprazole"),
    "amlodipine": (
        "17767",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Amlodipine",
    ),
    "metoprolol": ("6918", "http://www.nlm.nih.gov/research/umls/rxnorm", "Metoprolol"),
    "losartan": ("52175", "http://www.nlm.nih.gov/research/umls/rxnorm", "Losartan"),
    "gabapentin": (
        "25480",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Gabapentin",
    ),
    "hydrochlorothiazide": (
        "5487",
        "http://www.nlm.nih.gov/research/umls/rxnorm",
        "Hydrochlorothiazide",
    ),
}


# ==============================================================================
# EHR Command Executor Plugin
# ==============================================================================


class EHRCommandExecutor(DictationPlugin):
    """
    Plugin for executing EHR write operations via voice commands.

    Handles parsing voice commands into structured orders,
    conflict detection, confirmation workflow, and submission.
    """

    plugin_id = "ehr_command_executor"
    plugin_name = "EHR Order Commands"
    sections = []

    vocabulary_boost = [
        # Medications
        "prescribe",
        "order",
        "start",
        "amoxicillin",
        "lisinopril",
        "metformin",
        "atorvastatin",
        "omeprazole",
        "amlodipine",
        "metoprolol",
        "losartan",
        "gabapentin",
        "hydrochlorothiazide",
        "milligrams",
        "micrograms",
        "units",
        "tablets",
        "daily",
        "twice daily",
        "three times daily",
        "four times daily",
        "bid",
        "tid",
        "qid",
        "prn",
        "as needed",
        # Labs
        "CBC",
        "BMP",
        "CMP",
        "LFTs",
        "TSH",
        "A1C",
        "lipid panel",
        "urinalysis",
        "troponin",
        "BNP",
        "INR",
        "PT",
        # Imaging
        "x-ray",
        "CT scan",
        "MRI",
        "ultrasound",
        "echocardiogram",
        # Actions
        "confirm",
        "submit",
        "cancel",
        "save note",
        "sign note",
    ]

    # Command patterns compiled
    _medication_patterns = [re.compile(p, re.IGNORECASE) for p in MEDICATION_PATTERNS]
    _lab_patterns = [re.compile(p, re.IGNORECASE) for p in LAB_PATTERNS]
    _imaging_patterns = [re.compile(p, re.IGNORECASE) for p in IMAGING_PATTERNS]
    _diagnosis_patterns = [re.compile(p, re.IGNORECASE) for p in DIAGNOSIS_PATTERNS]
    _note_patterns = [re.compile(p, re.IGNORECASE) for p in NOTE_PATTERNS]
    _confirm_patterns = [re.compile(p, re.IGNORECASE) for p in CONFIRMATION_PATTERNS]
    _cancel_patterns = [re.compile(p, re.IGNORECASE) for p in CANCELLATION_PATTERNS]

    def __init__(
        self,
        epic_adapter=None,
        event_bus=None,
        policy_service=None,
        audit_service=None,
    ):
        super().__init__()
        self.epic_adapter = epic_adapter
        self.event_bus = event_bus
        self.policy_service = policy_service
        self.audit_service = audit_service

        # Session state
        self._sessions: Dict[str, OrderSession] = {}

    def is_enabled(self, user_id: Optional[str] = None) -> bool:
        """Check if EHR write commands are enabled"""
        if self.policy_service:
            return self.policy_service.is_feature_enabled(
                "epic_fhir_write", user_id
            ) and self.policy_service.is_feature_enabled("epic_voice_commands", user_id)
        return self.epic_adapter is not None

    async def on_activate(self, context: Dict) -> None:
        """Initialize order session"""
        session_id = context.get("session_id")
        patient_id = context.get("patient_fhir_id")
        practitioner_id = context.get("practitioner_id")
        encounter_id = context.get("encounter_id")

        self._sessions[session_id] = OrderSession(
            session_id=session_id,
            patient_id=patient_id,
            practitioner_id=practitioner_id,
            encounter_id=encounter_id,
        )

        logger.info(f"EHR command executor activated for session {session_id}")

    async def on_deactivate(self, context: Dict) -> None:
        """Clean up session"""
        session_id = context.get("session_id")
        if session_id in self._sessions:
            del self._sessions[session_id]

    # =========================================================================
    # Command Detection
    # =========================================================================

    def matches_command(self, text: str) -> Optional[str]:
        """
        Check if text matches any order command.

        Returns command type or None.
        """
        text = text.strip().lower()

        # Check for confirmation/cancellation first (during pending order)
        for pattern in self._confirm_patterns:
            if pattern.search(text):
                return "confirm"

        for pattern in self._cancel_patterns:
            if pattern.search(text):
                return "cancel"

        # Check order types
        for pattern in self._medication_patterns:
            if pattern.search(text):
                return "medication"

        for pattern in self._lab_patterns:
            if pattern.search(text):
                return "lab"

        for pattern in self._imaging_patterns:
            if pattern.search(text):
                return "imaging"

        for pattern in self._diagnosis_patterns:
            if pattern.search(text):
                return "diagnosis"

        for pattern in self._note_patterns:
            if pattern.search(text):
                return "note"

        return None

    # =========================================================================
    # Command Handling
    # =========================================================================

    async def handle_command(
        self,
        command_type: str,
        text: str,
        session_id: str,
        user_id: Optional[str] = None,
        context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Handle a voice command for EHR operations.

        Returns result with status and speech text.
        """
        session = self._sessions.get(session_id)
        if not session:
            return {
                "success": False,
                "error": "No active order session",
                "speak_text": "Unable to process order. Please try again.",
            }

        # Handle confirmation/cancellation
        if command_type == "confirm":
            return await self._handle_confirmation(session, user_id)

        if command_type == "cancel":
            return await self._handle_cancellation(session)

        # Parse new order
        order = await self._parse_order(command_type, text, session)

        if not order.code:
            return {
                "success": False,
                "error": "Could not parse order",
                "speak_text": "I didn't understand that order. Please try again.",
                "order": order.to_dict(),
            }

        # Check for conflicts
        if self.epic_adapter and session.patient_id:
            await self._check_conflicts(order, session.patient_id)

        # Set as pending order
        session.pending_order = order

        # Build confirmation request
        confirm_text = order.get_confirmation_text()

        if order.warnings:
            confirm_text = f"Warning: {order.warnings[0]}. " + confirm_text

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="ehr.order_pending",
                data={
                    "order_type": order.order_type.value,
                    "code": order.code,
                    "display": order.code_display,
                    "has_conflicts": bool(order.conflicts),
                },
                session_id=session_id,
                source_engine="dictation",
            )

        return {
            "success": True,
            "status": "pending_confirmation",
            "order": order.to_dict(),
            "speak_text": confirm_text,
            "requires_confirmation": True,
        }

    async def _parse_order(
        self,
        command_type: str,
        text: str,
        session: OrderSession,
    ) -> ParsedOrder:
        """Parse voice command into structured order"""
        order = ParsedOrder(
            order_type=(OrderType(command_type) if command_type != "note" else OrderType.NOTE),
            raw_text=text,
        )

        text_lower = text.lower()

        if command_type == "medication":
            order = self._parse_medication_order(text_lower, order)

        elif command_type == "lab":
            order = self._parse_lab_order(text_lower, order)

        elif command_type == "imaging":
            order = self._parse_imaging_order(text_lower, order)

        elif command_type == "diagnosis":
            order = self._parse_diagnosis(text_lower, order)

        elif command_type == "note":
            order.order_type = OrderType.NOTE
            order.confidence = 1.0

        return order

    def _parse_medication_order(self, text: str, order: ParsedOrder) -> ParsedOrder:
        """Parse medication order from text"""
        order.order_type = OrderType.MEDICATION

        for pattern in self._medication_patterns:
            match = pattern.search(text)
            if match:
                groups = match.groups()

                # Extract medication name
                med_name = groups[0].lower() if groups else None

                if med_name and med_name in MEDICATION_CODE_MAP:
                    code, system, display = MEDICATION_CODE_MAP[med_name]
                    order.code = code
                    order.code_system = system
                    order.code_display = display
                    order.confidence = 0.9
                elif med_name:
                    order.code_display = med_name.title()
                    order.confidence = 0.5
                    order.warnings.append("Medication code not found - manual entry may be required")

                # Extract dosage if present
                if len(groups) > 1 and groups[1]:
                    order.quantity = float(groups[1])
                if len(groups) > 2 and groups[2]:
                    order.unit = groups[2]
                if len(groups) > 3 and groups[3]:
                    order.frequency = groups[3]

                break

        # Try to detect frequency from common patterns
        if not order.frequency:
            freq_patterns = {
                r"once\s+(?:a\s+)?day|daily|qd": "once daily",
                r"twice\s+(?:a\s+)?day|bid": "twice daily",
                r"three\s+times\s+(?:a\s+)?day|tid": "three times daily",
                r"four\s+times\s+(?:a\s+)?day|qid": "four times daily",
                r"as\s+needed|prn": "as needed",
                r"at\s+bedtime|qhs": "at bedtime",
            }
            for pattern, freq in freq_patterns.items():
                if re.search(pattern, text):
                    order.frequency = freq
                    break

        # Detect priority
        if "stat" in text:
            order.priority = "stat"
        elif "urgent" in text:
            order.priority = "urgent"

        return order

    def _parse_lab_order(self, text: str, order: ParsedOrder) -> ParsedOrder:
        """Parse lab order from text"""
        order.order_type = OrderType.LAB

        # Check for known lab types
        for key, (code, system, display) in LAB_CODE_MAP.items():
            if key in text:
                order.code = code
                order.code_system = system
                order.code_display = display
                order.confidence = 0.95
                break

        # Detect priority
        if "stat" in text:
            order.priority = "stat"
        elif "urgent" in text or "asap" in text:
            order.priority = "asap"

        return order

    def _parse_imaging_order(self, text: str, order: ParsedOrder) -> ParsedOrder:
        """Parse imaging order from text"""
        order.order_type = OrderType.IMAGING

        # Check for known imaging types
        for key, (code, system, display) in IMAGING_CODE_MAP.items():
            if key in text:
                order.code = code
                order.code_system = system
                order.code_display = display
                order.confidence = 0.9
                break

        # Try to extract body part for CT/MRI
        if not order.code:
            body_parts = [
                "head",
                "brain",
                "chest",
                "abdomen",
                "pelvis",
                "spine",
                "knee",
                "shoulder",
            ]
            for part in body_parts:
                if part in text:
                    if "ct" in text:
                        order.code_display = f"CT {part.title()}"
                    elif "mri" in text:
                        order.code_display = f"MRI {part.title()}"
                    order.confidence = 0.7
                    order.warnings.append("Specific order code not found - manual selection required")
                    break

        # Detect priority
        if "stat" in text:
            order.priority = "stat"

        return order

    def _parse_diagnosis(self, text: str, order: ParsedOrder) -> ParsedOrder:
        """Parse diagnosis from text"""
        order.order_type = OrderType.DIAGNOSIS

        # Extract diagnosis text
        for pattern in self._diagnosis_patterns:
            match = pattern.search(text)
            if match:
                diagnosis_text = match.group(1).strip()
                order.code_display = diagnosis_text.title()
                order.confidence = 0.6
                order.warnings.append("ICD-10 code lookup required")
                break

        return order

    async def _check_conflicts(self, order: ParsedOrder, patient_id: str) -> None:
        """Check for order conflicts"""
        if not self.epic_adapter or not order.code:
            return

        try:
            if order.order_type == OrderType.MEDICATION:
                conflicts = await self.epic_adapter.check_medication_conflicts(patient_id, order.code)
                if conflicts.get("has_conflicts"):
                    order.conflicts = conflicts.get("duplicate_orders", [])
                    order.warnings.extend(conflicts.get("warnings", []))

            elif order.order_type in (OrderType.LAB, OrderType.IMAGING):
                conflicts = await self.epic_adapter.check_service_request_conflicts(patient_id, order.code)
                if conflicts.get("has_conflicts"):
                    order.conflicts = conflicts.get("recent_same_order", [])
                    order.warnings.extend(conflicts.get("warnings", []))

        except Exception as e:
            logger.warning(f"Error checking conflicts: {e}")

    # =========================================================================
    # Confirmation Workflow
    # =========================================================================

    async def _handle_confirmation(
        self,
        session: OrderSession,
        user_id: Optional[str],
    ) -> Dict[str, Any]:
        """Handle order confirmation"""
        if not session.pending_order:
            return {
                "success": False,
                "error": "No pending order to confirm",
                "speak_text": "There is no pending order to confirm.",
            }

        order = session.pending_order
        order.status = OrderStatus.CONFIRMED

        # Submit the order
        result = await self._submit_order(order, session, user_id)

        if result["success"]:
            session.submitted_orders.append(order)
            session.pending_order = None

        return result

    async def _handle_cancellation(self, session: OrderSession) -> Dict[str, Any]:
        """Handle order cancellation"""
        if not session.pending_order:
            return {
                "success": True,
                "speak_text": "There is no pending order to cancel.",
            }

        order = session.pending_order
        order.status = OrderStatus.CANCELLED
        session.pending_order = None

        return {
            "success": True,
            "status": "cancelled",
            "speak_text": f"Order cancelled: {order.code_display}",
        }

    async def _submit_order(
        self,
        order: ParsedOrder,
        session: OrderSession,
        user_id: Optional[str],
    ) -> Dict[str, Any]:
        """Submit order to Epic"""
        if not self.epic_adapter:
            order.status = OrderStatus.FAILED
            order.error = "EHR adapter not available"
            return {
                "success": False,
                "error": order.error,
                "speak_text": "Unable to submit order. The EHR system is not available.",
            }

        if not session.patient_id:
            order.status = OrderStatus.FAILED
            order.error = "No patient selected"
            return {
                "success": False,
                "error": order.error,
                "speak_text": "Unable to submit order. No patient is selected.",
            }

        try:
            if order.order_type == OrderType.MEDICATION:
                result = await self.epic_adapter.create_medication_request(
                    patient_id=session.patient_id,
                    medication_code=order.code,
                    medication_system=order.code_system,
                    medication_display=order.code_display,
                    dosage_instruction=self._build_dosage_instruction(order),
                    requester_id=session.practitioner_id or "unknown",
                    encounter_id=session.encounter_id,
                )

            elif order.order_type in (OrderType.LAB, OrderType.IMAGING):
                category = "laboratory" if order.order_type == OrderType.LAB else "imaging"
                result = await self.epic_adapter.create_service_request(
                    patient_id=session.patient_id,
                    code=order.code,
                    code_system=order.code_system,
                    code_display=order.code_display,
                    category=category,
                    requester_id=session.practitioner_id or "unknown",
                    encounter_id=session.encounter_id,
                    priority=order.priority,
                )

            else:
                order.status = OrderStatus.FAILED
                order.error = f"Order type {order.order_type} not yet supported"
                return {
                    "success": False,
                    "error": order.error,
                    "speak_text": "This order type is not yet supported.",
                }

            order.status = OrderStatus.SUBMITTED
            order.result_id = result.resource_id

            # Publish success event
            if self.event_bus:
                await self.event_bus.publish_event(
                    event_type="ehr.order_submitted",
                    data={
                        "order_type": order.order_type.value,
                        "resource_id": result.resource_id,
                        "code": order.code,
                        "display": order.code_display,
                        "patient_id": session.patient_id,
                    },
                    session_id=session.session_id,
                    source_engine="dictation",
                )

            return {
                "success": True,
                "status": "submitted",
                "resource_id": result.resource_id,
                "order": order.to_dict(),
                "speak_text": f"Order submitted: {order.code_display}",
            }

        except Exception as e:
            order.status = OrderStatus.FAILED
            order.error = str(e)
            logger.error(f"Failed to submit order: {e}")

            return {
                "success": False,
                "error": str(e),
                "speak_text": "Unable to submit order. Please try again or submit manually.",
            }

    def _build_dosage_instruction(self, order: ParsedOrder) -> str:
        """Build dosage instruction string"""
        parts = []

        if order.quantity and order.unit:
            parts.append(f"{order.quantity} {order.unit}")

        if order.frequency:
            parts.append(order.frequency)

        if order.duration:
            parts.append(f"for {order.duration}")

        return ", ".join(parts) if parts else "As directed"

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def get_pending_order(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get pending order for session"""
        session = self._sessions.get(session_id)
        if session and session.pending_order:
            return session.pending_order.to_dict()
        return None

    def get_submitted_orders(self, session_id: str) -> List[Dict[str, Any]]:
        """Get submitted orders for session"""
        session = self._sessions.get(session_id)
        if session:
            return [o.to_dict() for o in session.submitted_orders]
        return []

    def get_available_commands(self) -> List[Dict[str, str]]:
        """Get list of available voice commands"""
        return [
            {
                "command": "Prescribe [medication] [dose] [frequency]",
                "description": "Create a medication order",
                "example": "Prescribe amoxicillin 500 mg three times daily",
            },
            {
                "command": "Order [lab test]",
                "description": "Create a lab order",
                "example": "Order CBC",
            },
            {
                "command": "Order [imaging study]",
                "description": "Create an imaging order",
                "example": "Order chest x-ray",
            },
            {
                "command": "Save note / Submit dictation",
                "description": "Save the current note to the patient's chart",
            },
            {
                "command": "Confirm / Yes",
                "description": "Confirm a pending order",
            },
            {
                "command": "Cancel / No",
                "description": "Cancel a pending order",
            },
        ]


__all__ = [
    "EHRCommandExecutor",
    "ParsedOrder",
    "OrderType",
    "OrderStatus",
    "OrderSession",
]
