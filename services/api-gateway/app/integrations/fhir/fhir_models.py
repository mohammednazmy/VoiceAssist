"""
FHIR R4 Resource Models

Internal representations of FHIR R4 resources normalized for VoiceAssist.
Maps FHIR JSON to strongly-typed Python dataclasses with validation.

Supported Resources:
- Patient: Demographics and identifiers
- MedicationRequest: Active and historical medications
- Condition: Problems, diagnoses
- Observation: Labs, vitals
- Procedure: Surgical and non-surgical procedures
- AllergyIntolerance: Drug and environmental allergies
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ==============================================================================
# Enums
# ==============================================================================


class FHIRResourceType(str, Enum):
    """Supported FHIR resource types"""

    PATIENT = "Patient"
    MEDICATION_REQUEST = "MedicationRequest"
    CONDITION = "Condition"
    OBSERVATION = "Observation"
    PROCEDURE = "Procedure"
    ALLERGY_INTOLERANCE = "AllergyIntolerance"
    ENCOUNTER = "Encounter"
    DIAGNOSTIC_REPORT = "DiagnosticReport"
    IMMUNIZATION = "Immunization"
    CARE_PLAN = "CarePlan"
    # Phase 6b: Write operation resource types
    SERVICE_REQUEST = "ServiceRequest"
    DOCUMENT_REFERENCE = "DocumentReference"


class MedicationStatus(str, Enum):
    """Medication request status"""

    ACTIVE = "active"
    ON_HOLD = "on-hold"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    ENTERED_IN_ERROR = "entered-in-error"
    STOPPED = "stopped"
    DRAFT = "draft"
    UNKNOWN = "unknown"


class ConditionStatus(str, Enum):
    """Condition clinical status"""

    ACTIVE = "active"
    RECURRENCE = "recurrence"
    RELAPSE = "relapse"
    INACTIVE = "inactive"
    REMISSION = "remission"
    RESOLVED = "resolved"


class ObservationStatus(str, Enum):
    """Observation status"""

    REGISTERED = "registered"
    PRELIMINARY = "preliminary"
    FINAL = "final"
    AMENDED = "amended"
    CORRECTED = "corrected"
    CANCELLED = "cancelled"
    ENTERED_IN_ERROR = "entered-in-error"
    UNKNOWN = "unknown"


class AllergyCategory(str, Enum):
    """Allergy category"""

    FOOD = "food"
    MEDICATION = "medication"
    ENVIRONMENT = "environment"
    BIOLOGIC = "biologic"


class AllergySeverity(str, Enum):
    """Allergy reaction severity"""

    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class AllergyCriticality(str, Enum):
    """Allergy criticality"""

    LOW = "low"
    HIGH = "high"
    UNABLE_TO_ASSESS = "unable-to-assess"


# ==============================================================================
# Base Classes
# ==============================================================================


@dataclass
class CodeableConcept:
    """FHIR CodeableConcept - coded value with text"""

    code: str
    system: str
    display: str
    text: Optional[str] = None

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> Optional["CodeableConcept"]:
        """Parse from FHIR JSON"""
        if not data:
            return None

        # Get first coding
        codings = data.get("coding", [])
        if codings:
            coding = codings[0]
            return cls(
                code=coding.get("code", ""),
                system=coding.get("system", ""),
                display=coding.get("display", ""),
                text=data.get("text"),
            )

        # Text only
        if data.get("text"):
            return cls(
                code="",
                system="",
                display=data["text"],
                text=data["text"],
            )

        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "system": self.system,
            "display": self.display,
            "text": self.text,
        }


@dataclass
class Identifier:
    """FHIR Identifier - MRN, SSN, etc."""

    value: str
    system: str
    type_code: Optional[str] = None
    type_display: Optional[str] = None

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "Identifier":
        """Parse from FHIR JSON"""
        type_info = data.get("type", {})
        codings = type_info.get("coding", [])
        type_coding = codings[0] if codings else {}

        return cls(
            value=data.get("value", ""),
            system=data.get("system", ""),
            type_code=type_coding.get("code"),
            type_display=type_coding.get("display"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "system": self.system,
            "type_code": self.type_code,
            "type_display": self.type_display,
        }


@dataclass
class Reference:
    """FHIR Reference - link to another resource"""

    reference: str  # e.g., "Patient/123"
    display: Optional[str] = None
    type: Optional[str] = None

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> Optional["Reference"]:
        """Parse from FHIR JSON"""
        if not data:
            return None

        return cls(
            reference=data.get("reference", ""),
            display=data.get("display"),
            type=data.get("type"),
        )

    def get_id(self) -> Optional[str]:
        """Extract resource ID from reference"""
        if "/" in self.reference:
            return self.reference.split("/")[-1]
        return self.reference

    def to_dict(self) -> Dict[str, Any]:
        return {
            "reference": self.reference,
            "display": self.display,
            "type": self.type,
        }


@dataclass
class Period:
    """FHIR Period - time range"""

    start: Optional[datetime] = None
    end: Optional[datetime] = None

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> Optional["Period"]:
        """Parse from FHIR JSON"""
        if not data:
            return None

        start = None
        end = None

        if data.get("start"):
            start = _parse_fhir_datetime(data["start"])
        if data.get("end"):
            end = _parse_fhir_datetime(data["end"])

        return cls(start=start, end=end)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "start": self.start.isoformat() if self.start else None,
            "end": self.end.isoformat() if self.end else None,
        }


@dataclass
class Quantity:
    """FHIR Quantity - value with unit"""

    value: float
    unit: str
    code: Optional[str] = None
    system: Optional[str] = None

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> Optional["Quantity"]:
        """Parse from FHIR JSON"""
        if not data:
            return None

        return cls(
            value=data.get("value", 0),
            unit=data.get("unit", ""),
            code=data.get("code"),
            system=data.get("system"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "unit": self.unit,
            "code": self.code,
            "system": self.system,
        }


# ==============================================================================
# Resource Models
# ==============================================================================


@dataclass
class FHIRPatient:
    """FHIR Patient resource"""

    id: str
    identifiers: List[Identifier] = field(default_factory=list)
    active: bool = True

    # Demographics
    family_name: Optional[str] = None
    given_names: List[str] = field(default_factory=list)
    birth_date: Optional[date] = None
    gender: Optional[str] = None  # male, female, other, unknown
    deceased: bool = False

    # Contact
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    # Preferred language
    language: Optional[str] = None

    # Reference to managing organization
    managing_organization: Optional[Reference] = None

    # Raw FHIR data for extensibility
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRPatient":
        """Parse from FHIR JSON"""
        patient = cls(
            id=data.get("id", ""),
            active=data.get("active", True),
            _raw=data,
        )

        # Identifiers
        for ident in data.get("identifier", []):
            patient.identifiers.append(Identifier.from_fhir(ident))

        # Name
        names = data.get("name", [])
        if names:
            # Use official or first name
            name = next((n for n in names if n.get("use") == "official"), names[0])
            patient.family_name = name.get("family")
            patient.given_names = name.get("given", [])

        # Birth date
        if data.get("birthDate"):
            try:
                patient.birth_date = date.fromisoformat(data["birthDate"])
            except ValueError:
                pass

        patient.gender = data.get("gender")
        patient.deceased = data.get("deceasedBoolean", False)

        # Telecom
        for telecom in data.get("telecom", []):
            system = telecom.get("system")
            value = telecom.get("value")
            if system == "phone" and not patient.phone:
                patient.phone = value
            elif system == "email" and not patient.email:
                patient.email = value

        # Address
        addresses = data.get("address", [])
        if addresses:
            addr = addresses[0]
            lines = addr.get("line", [])
            patient.address_line = lines[0] if lines else None
            patient.city = addr.get("city")
            patient.state = addr.get("state")
            patient.postal_code = addr.get("postalCode")
            patient.country = addr.get("country")

        # Language
        comm = data.get("communication", [])
        if comm:
            lang = comm[0].get("language", {})
            codings = lang.get("coding", [])
            if codings:
                patient.language = codings[0].get("code")

        # Managing org
        if data.get("managingOrganization"):
            patient.managing_organization = Reference.from_fhir(data["managingOrganization"])

        return patient

    @property
    def full_name(self) -> str:
        """Get full display name"""
        parts = list(self.given_names)
        if self.family_name:
            parts.append(self.family_name)
        return " ".join(parts) if parts else "Unknown"

    @property
    def age(self) -> Optional[int]:
        """Calculate age from birth date"""
        if not self.birth_date:
            return None
        today = date.today()
        return (
            today.year
            - self.birth_date.year
            - ((today.month, today.day) < (self.birth_date.month, self.birth_date.day))
        )

    @property
    def mrn(self) -> Optional[str]:
        """Get MRN from identifiers"""
        for ident in self.identifiers:
            if ident.type_code == "MR":
                return ident.value
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "identifiers": [i.to_dict() for i in self.identifiers],
            "active": self.active,
            "full_name": self.full_name,
            "family_name": self.family_name,
            "given_names": self.given_names,
            "birth_date": self.birth_date.isoformat() if self.birth_date else None,
            "age": self.age,
            "gender": self.gender,
            "deceased": self.deceased,
            "phone": self.phone,
            "email": self.email,
            "address": {
                "line": self.address_line,
                "city": self.city,
                "state": self.state,
                "postal_code": self.postal_code,
                "country": self.country,
            },
            "language": self.language,
            "mrn": self.mrn,
        }


@dataclass
class FHIRMedication:
    """FHIR MedicationRequest resource"""

    id: str
    status: MedicationStatus = MedicationStatus.ACTIVE

    # Medication info
    medication_code: Optional[CodeableConcept] = None
    medication_reference: Optional[Reference] = None

    # Prescription details
    dosage_instruction: Optional[str] = None
    dose_quantity: Optional[Quantity] = None
    frequency: Optional[str] = None
    route: Optional[CodeableConcept] = None
    as_needed: bool = False
    as_needed_reason: Optional[str] = None

    # Timing
    authored_on: Optional[datetime] = None
    validity_period: Optional[Period] = None

    # Requester
    requester: Optional[Reference] = None
    patient: Optional[Reference] = None

    # Reason
    reason_code: Optional[CodeableConcept] = None

    # Supply
    dispense_quantity: Optional[Quantity] = None
    number_of_refills: int = 0

    # Raw FHIR data
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRMedication":
        """Parse from FHIR JSON"""
        med = cls(
            id=data.get("id", ""),
            status=MedicationStatus(data.get("status", "unknown")),
            _raw=data,
        )

        # Medication (codeable concept or reference)
        if data.get("medicationCodeableConcept"):
            med.medication_code = CodeableConcept.from_fhir(data["medicationCodeableConcept"])
        if data.get("medicationReference"):
            med.medication_reference = Reference.from_fhir(data["medicationReference"])

        # Dosage instructions
        dosages = data.get("dosageInstruction", [])
        if dosages:
            dosage = dosages[0]
            med.dosage_instruction = dosage.get("text")
            med.as_needed = dosage.get("asNeededBoolean", False)

            # Dose quantity
            dose_dose = dosage.get("doseAndRate", [])
            if dose_dose:
                dose_q = dose_dose[0].get("doseQuantity")
                if dose_q:
                    med.dose_quantity = Quantity.from_fhir(dose_q)

            # Route
            if dosage.get("route"):
                med.route = CodeableConcept.from_fhir(dosage["route"])

            # Frequency from timing
            timing = dosage.get("timing", {})
            repeat = timing.get("repeat", {})
            if repeat:
                freq = repeat.get("frequency", 1)
                period = repeat.get("period", 1)
                period_unit = repeat.get("periodUnit", "d")
                med.frequency = f"{freq}x per {period} {period_unit}"

        # Authored date
        if data.get("authoredOn"):
            med.authored_on = _parse_fhir_datetime(data["authoredOn"])

        # Requester
        if data.get("requester"):
            med.requester = Reference.from_fhir(data["requester"])

        # Patient
        if data.get("subject"):
            med.patient = Reference.from_fhir(data["subject"])

        # Reason
        reasons = data.get("reasonCode", [])
        if reasons:
            med.reason_code = CodeableConcept.from_fhir(reasons[0])

        # Dispense info
        dispense = data.get("dispenseRequest", {})
        if dispense.get("quantity"):
            med.dispense_quantity = Quantity.from_fhir(dispense["quantity"])
        med.number_of_refills = dispense.get("numberOfRepeatsAllowed", 0)

        return med

    @property
    def medication_name(self) -> str:
        """Get medication display name"""
        if self.medication_code:
            return self.medication_code.display or self.medication_code.text or ""
        if self.medication_reference:
            return self.medication_reference.display or ""
        return "Unknown medication"

    @property
    def is_active(self) -> bool:
        """Check if medication is currently active"""
        return self.status == MedicationStatus.ACTIVE

    @property
    def rxnorm_code(self) -> Optional[str]:
        """Get RxNorm code if available"""
        if self.medication_code and "rxnorm" in self.medication_code.system.lower():
            return self.medication_code.code
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status.value,
            "medication_name": self.medication_name,
            "medication_code": (self.medication_code.to_dict() if self.medication_code else None),
            "dosage_instruction": self.dosage_instruction,
            "dose_quantity": (self.dose_quantity.to_dict() if self.dose_quantity else None),
            "frequency": self.frequency,
            "route": self.route.to_dict() if self.route else None,
            "as_needed": self.as_needed,
            "authored_on": self.authored_on.isoformat() if self.authored_on else None,
            "requester": self.requester.to_dict() if self.requester else None,
            "reason": self.reason_code.to_dict() if self.reason_code else None,
            "refills": self.number_of_refills,
            "is_active": self.is_active,
            "rxnorm_code": self.rxnorm_code,
        }


@dataclass
class FHIRCondition:
    """FHIR Condition resource"""

    id: str
    clinical_status: ConditionStatus = ConditionStatus.ACTIVE

    # Condition info
    code: Optional[CodeableConcept] = None
    category: List[CodeableConcept] = field(default_factory=list)
    severity: Optional[CodeableConcept] = None

    # Verification
    verification_status: Optional[str] = None  # confirmed, unconfirmed, etc.

    # Patient
    patient: Optional[Reference] = None

    # Timing
    onset_datetime: Optional[datetime] = None
    abatement_datetime: Optional[datetime] = None
    recorded_date: Optional[datetime] = None

    # Asserter
    asserter: Optional[Reference] = None

    # Notes
    notes: List[str] = field(default_factory=list)

    # Raw FHIR data
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRCondition":
        """Parse from FHIR JSON"""
        cond = cls(
            id=data.get("id", ""),
            _raw=data,
        )

        # Clinical status
        status_data = data.get("clinicalStatus", {})
        codings = status_data.get("coding", [])
        if codings:
            status_code = codings[0].get("code", "active")
            try:
                cond.clinical_status = ConditionStatus(status_code)
            except ValueError:
                cond.clinical_status = ConditionStatus.ACTIVE

        # Verification status
        verif = data.get("verificationStatus", {})
        verif_codings = verif.get("coding", [])
        if verif_codings:
            cond.verification_status = verif_codings[0].get("code")

        # Condition code
        if data.get("code"):
            cond.code = CodeableConcept.from_fhir(data["code"])

        # Category
        for cat in data.get("category", []):
            cc = CodeableConcept.from_fhir(cat)
            if cc:
                cond.category.append(cc)

        # Severity
        if data.get("severity"):
            cond.severity = CodeableConcept.from_fhir(data["severity"])

        # Patient
        if data.get("subject"):
            cond.patient = Reference.from_fhir(data["subject"])

        # Onset
        if data.get("onsetDateTime"):
            cond.onset_datetime = _parse_fhir_datetime(data["onsetDateTime"])

        # Abatement
        if data.get("abatementDateTime"):
            cond.abatement_datetime = _parse_fhir_datetime(data["abatementDateTime"])

        # Recorded date
        if data.get("recordedDate"):
            cond.recorded_date = _parse_fhir_datetime(data["recordedDate"])

        # Asserter
        if data.get("asserter"):
            cond.asserter = Reference.from_fhir(data["asserter"])

        # Notes
        for note in data.get("note", []):
            if note.get("text"):
                cond.notes.append(note["text"])

        return cond

    @property
    def condition_name(self) -> str:
        """Get condition display name"""
        if self.code:
            return self.code.display or self.code.text or ""
        return "Unknown condition"

    @property
    def icd10_code(self) -> Optional[str]:
        """Get ICD-10 code if available"""
        if self.code and "icd" in self.code.system.lower():
            return self.code.code
        return None

    @property
    def is_active(self) -> bool:
        """Check if condition is active"""
        return self.clinical_status in [
            ConditionStatus.ACTIVE,
            ConditionStatus.RECURRENCE,
            ConditionStatus.RELAPSE,
        ]

    @property
    def is_chronic(self) -> bool:
        """Check if condition appears chronic (no abatement)"""
        return self.is_active and self.abatement_datetime is None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "clinical_status": self.clinical_status.value,
            "verification_status": self.verification_status,
            "condition_name": self.condition_name,
            "code": self.code.to_dict() if self.code else None,
            "icd10_code": self.icd10_code,
            "category": [c.to_dict() for c in self.category],
            "severity": self.severity.to_dict() if self.severity else None,
            "onset_datetime": (self.onset_datetime.isoformat() if self.onset_datetime else None),
            "abatement_datetime": (self.abatement_datetime.isoformat() if self.abatement_datetime else None),
            "recorded_date": (self.recorded_date.isoformat() if self.recorded_date else None),
            "is_active": self.is_active,
            "is_chronic": self.is_chronic,
            "notes": self.notes,
        }


@dataclass
class FHIRObservation:
    """FHIR Observation resource (labs, vitals)"""

    id: str
    status: ObservationStatus = ObservationStatus.FINAL

    # Observation type
    code: Optional[CodeableConcept] = None
    category: List[CodeableConcept] = field(default_factory=list)

    # Value
    value_quantity: Optional[Quantity] = None
    value_string: Optional[str] = None
    value_codeable_concept: Optional[CodeableConcept] = None

    # Reference range
    reference_range_low: Optional[Quantity] = None
    reference_range_high: Optional[Quantity] = None
    reference_range_text: Optional[str] = None

    # Interpretation
    interpretation: Optional[CodeableConcept] = None
    is_abnormal: bool = False

    # Timing
    effective_datetime: Optional[datetime] = None
    issued: Optional[datetime] = None

    # Patient
    patient: Optional[Reference] = None

    # Performer
    performer: Optional[Reference] = None

    # Notes
    notes: List[str] = field(default_factory=list)

    # Raw FHIR data
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRObservation":
        """Parse from FHIR JSON"""
        obs = cls(
            id=data.get("id", ""),
            status=ObservationStatus(data.get("status", "unknown")),
            _raw=data,
        )

        # Code
        if data.get("code"):
            obs.code = CodeableConcept.from_fhir(data["code"])

        # Category
        for cat in data.get("category", []):
            cc = CodeableConcept.from_fhir(cat)
            if cc:
                obs.category.append(cc)

        # Value
        if data.get("valueQuantity"):
            obs.value_quantity = Quantity.from_fhir(data["valueQuantity"])
        if data.get("valueString"):
            obs.value_string = data["valueString"]
        if data.get("valueCodeableConcept"):
            obs.value_codeable_concept = CodeableConcept.from_fhir(data["valueCodeableConcept"])

        # Reference range
        ref_ranges = data.get("referenceRange", [])
        if ref_ranges:
            ref = ref_ranges[0]
            if ref.get("low"):
                obs.reference_range_low = Quantity.from_fhir(ref["low"])
            if ref.get("high"):
                obs.reference_range_high = Quantity.from_fhir(ref["high"])
            obs.reference_range_text = ref.get("text")

        # Interpretation
        interps = data.get("interpretation", [])
        if interps:
            obs.interpretation = CodeableConcept.from_fhir(interps[0])
            # Check for abnormal interpretations
            if obs.interpretation:
                abnormal_codes = ["H", "HH", "L", "LL", "A", "AA", "C"]
                obs.is_abnormal = obs.interpretation.code in abnormal_codes

        # Timing
        if data.get("effectiveDateTime"):
            obs.effective_datetime = _parse_fhir_datetime(data["effectiveDateTime"])
        if data.get("issued"):
            obs.issued = _parse_fhir_datetime(data["issued"])

        # Patient
        if data.get("subject"):
            obs.patient = Reference.from_fhir(data["subject"])

        # Performer
        performers = data.get("performer", [])
        if performers:
            obs.performer = Reference.from_fhir(performers[0])

        # Notes
        for note in data.get("note", []):
            if note.get("text"):
                obs.notes.append(note["text"])

        return obs

    @property
    def observation_name(self) -> str:
        """Get observation display name"""
        if self.code:
            return self.code.display or self.code.text or ""
        return "Unknown observation"

    @property
    def loinc_code(self) -> Optional[str]:
        """Get LOINC code if available"""
        if self.code and "loinc" in self.code.system.lower():
            return self.code.code
        return None

    @property
    def is_vital(self) -> bool:
        """Check if observation is a vital sign"""
        for cat in self.category:
            if cat.code == "vital-signs":
                return True
        return False

    @property
    def is_lab(self) -> bool:
        """Check if observation is a lab result"""
        for cat in self.category:
            if cat.code == "laboratory":
                return True
        return False

    @property
    def display_value(self) -> str:
        """Get formatted display value"""
        if self.value_quantity:
            return f"{self.value_quantity.value} {self.value_quantity.unit}"
        if self.value_string:
            return self.value_string
        if self.value_codeable_concept:
            return self.value_codeable_concept.display or ""
        return ""

    @property
    def reference_range_display(self) -> str:
        """Get formatted reference range"""
        if self.reference_range_text:
            return self.reference_range_text
        parts = []
        if self.reference_range_low:
            parts.append(f"{self.reference_range_low.value}")
        if self.reference_range_high:
            if parts:
                parts.append("-")
            parts.append(f"{self.reference_range_high.value}")
        if parts and self.reference_range_low:
            parts.append(self.reference_range_low.unit)
        return " ".join(parts)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status.value,
            "observation_name": self.observation_name,
            "code": self.code.to_dict() if self.code else None,
            "loinc_code": self.loinc_code,
            "category": [c.to_dict() for c in self.category],
            "value": self.display_value,
            "value_quantity": (self.value_quantity.to_dict() if self.value_quantity else None),
            "reference_range": self.reference_range_display,
            "interpretation": (self.interpretation.to_dict() if self.interpretation else None),
            "is_abnormal": self.is_abnormal,
            "is_vital": self.is_vital,
            "is_lab": self.is_lab,
            "effective_datetime": (self.effective_datetime.isoformat() if self.effective_datetime else None),
            "notes": self.notes,
        }


@dataclass
class FHIRProcedure:
    """FHIR Procedure resource"""

    id: str
    status: str = "completed"  # preparation, in-progress, completed, etc.

    # Procedure info
    code: Optional[CodeableConcept] = None
    category: Optional[CodeableConcept] = None

    # Patient
    patient: Optional[Reference] = None

    # Timing
    performed_datetime: Optional[datetime] = None
    performed_period: Optional[Period] = None

    # Performer
    performer: Optional[Reference] = None

    # Location
    location: Optional[Reference] = None

    # Reason
    reason_code: Optional[CodeableConcept] = None

    # Outcome
    outcome: Optional[CodeableConcept] = None

    # Notes
    notes: List[str] = field(default_factory=list)

    # Raw FHIR data
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRProcedure":
        """Parse from FHIR JSON"""
        proc = cls(
            id=data.get("id", ""),
            status=data.get("status", "completed"),
            _raw=data,
        )

        # Code
        if data.get("code"):
            proc.code = CodeableConcept.from_fhir(data["code"])

        # Category
        if data.get("category"):
            proc.category = CodeableConcept.from_fhir(data["category"])

        # Patient
        if data.get("subject"):
            proc.patient = Reference.from_fhir(data["subject"])

        # Performed
        if data.get("performedDateTime"):
            proc.performed_datetime = _parse_fhir_datetime(data["performedDateTime"])
        if data.get("performedPeriod"):
            proc.performed_period = Period.from_fhir(data["performedPeriod"])

        # Performer
        performers = data.get("performer", [])
        if performers:
            actor = performers[0].get("actor")
            if actor:
                proc.performer = Reference.from_fhir(actor)

        # Location
        if data.get("location"):
            proc.location = Reference.from_fhir(data["location"])

        # Reason
        reasons = data.get("reasonCode", [])
        if reasons:
            proc.reason_code = CodeableConcept.from_fhir(reasons[0])

        # Outcome
        if data.get("outcome"):
            proc.outcome = CodeableConcept.from_fhir(data["outcome"])

        # Notes
        for note in data.get("note", []):
            if note.get("text"):
                proc.notes.append(note["text"])

        return proc

    @property
    def procedure_name(self) -> str:
        """Get procedure display name"""
        if self.code:
            return self.code.display or self.code.text or ""
        return "Unknown procedure"

    @property
    def cpt_code(self) -> Optional[str]:
        """Get CPT code if available"""
        if self.code and "cpt" in self.code.system.lower():
            return self.code.code
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "procedure_name": self.procedure_name,
            "code": self.code.to_dict() if self.code else None,
            "cpt_code": self.cpt_code,
            "category": self.category.to_dict() if self.category else None,
            "performed_datetime": (self.performed_datetime.isoformat() if self.performed_datetime else None),
            "performer": self.performer.to_dict() if self.performer else None,
            "reason": self.reason_code.to_dict() if self.reason_code else None,
            "outcome": self.outcome.to_dict() if self.outcome else None,
            "notes": self.notes,
        }


@dataclass
class FHIRAllergyIntolerance:
    """FHIR AllergyIntolerance resource"""

    id: str
    clinical_status: str = "active"  # active, inactive, resolved

    # Allergy info
    code: Optional[CodeableConcept] = None
    category: List[AllergyCategory] = field(default_factory=list)
    type: str = "allergy"  # allergy or intolerance
    criticality: AllergyCriticality = AllergyCriticality.LOW

    # Verification
    verification_status: Optional[str] = None

    # Patient
    patient: Optional[Reference] = None

    # Reactions
    reactions: List[Dict[str, Any]] = field(default_factory=list)

    # Timing
    onset_datetime: Optional[datetime] = None
    recorded_date: Optional[datetime] = None
    last_occurrence: Optional[datetime] = None

    # Asserter
    asserter: Optional[Reference] = None
    recorder: Optional[Reference] = None

    # Notes
    notes: List[str] = field(default_factory=list)

    # Raw FHIR data
    _raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_fhir(cls, data: Dict[str, Any]) -> "FHIRAllergyIntolerance":
        """Parse from FHIR JSON"""
        allergy = cls(
            id=data.get("id", ""),
            type=data.get("type", "allergy"),
            _raw=data,
        )

        # Clinical status
        status_data = data.get("clinicalStatus", {})
        codings = status_data.get("coding", [])
        if codings:
            allergy.clinical_status = codings[0].get("code", "active")

        # Verification
        verif = data.get("verificationStatus", {})
        verif_codings = verif.get("coding", [])
        if verif_codings:
            allergy.verification_status = verif_codings[0].get("code")

        # Code (allergen)
        if data.get("code"):
            allergy.code = CodeableConcept.from_fhir(data["code"])

        # Category
        for cat in data.get("category", []):
            try:
                allergy.category.append(AllergyCategory(cat))
            except ValueError:
                pass

        # Criticality
        if data.get("criticality"):
            try:
                allergy.criticality = AllergyCriticality(data["criticality"])
            except ValueError:
                pass

        # Patient
        if data.get("patient"):
            allergy.patient = Reference.from_fhir(data["patient"])

        # Reactions
        for reaction in data.get("reaction", []):
            reaction_data = {
                "manifestations": [],
                "severity": reaction.get("severity"),
                "onset": reaction.get("onset"),
            }
            for manif in reaction.get("manifestation", []):
                cc = CodeableConcept.from_fhir(manif)
                if cc:
                    reaction_data["manifestations"].append(cc.display)
            allergy.reactions.append(reaction_data)

        # Timing
        if data.get("onsetDateTime"):
            allergy.onset_datetime = _parse_fhir_datetime(data["onsetDateTime"])
        if data.get("recordedDate"):
            allergy.recorded_date = _parse_fhir_datetime(data["recordedDate"])
        if data.get("lastOccurrence"):
            allergy.last_occurrence = _parse_fhir_datetime(data["lastOccurrence"])

        # Asserter/Recorder
        if data.get("asserter"):
            allergy.asserter = Reference.from_fhir(data["asserter"])
        if data.get("recorder"):
            allergy.recorder = Reference.from_fhir(data["recorder"])

        # Notes
        for note in data.get("note", []):
            if note.get("text"):
                allergy.notes.append(note["text"])

        return allergy

    @property
    def allergen_name(self) -> str:
        """Get allergen display name"""
        if self.code:
            return self.code.display or self.code.text or ""
        return "Unknown allergen"

    @property
    def is_medication_allergy(self) -> bool:
        """Check if this is a medication allergy"""
        return AllergyCategory.MEDICATION in self.category

    @property
    def is_severe(self) -> bool:
        """Check if this is a severe allergy"""
        return self.criticality == AllergyCriticality.HIGH

    @property
    def reaction_summary(self) -> str:
        """Get summary of reactions"""
        manifestations = []
        for reaction in self.reactions:
            manifestations.extend(reaction.get("manifestations", []))
        return ", ".join(manifestations[:3]) if manifestations else "Unknown reaction"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "clinical_status": self.clinical_status,
            "verification_status": self.verification_status,
            "allergen_name": self.allergen_name,
            "code": self.code.to_dict() if self.code else None,
            "category": [c.value for c in self.category],
            "type": self.type,
            "criticality": self.criticality.value,
            "is_medication_allergy": self.is_medication_allergy,
            "is_severe": self.is_severe,
            "reactions": self.reactions,
            "reaction_summary": self.reaction_summary,
            "onset_datetime": (self.onset_datetime.isoformat() if self.onset_datetime else None),
            "recorded_date": (self.recorded_date.isoformat() if self.recorded_date else None),
            "notes": self.notes,
        }


# ==============================================================================
# Helper Functions
# ==============================================================================


def _parse_fhir_datetime(value: str) -> Optional[datetime]:
    """Parse FHIR datetime string"""
    if not value:
        return None

    # Try various formats
    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value.replace("+00:00", "Z"), fmt)
        except ValueError:
            continue

    logger.warning(f"Could not parse FHIR datetime: {value}")
    return None


__all__ = [
    "FHIRResourceType",
    "MedicationStatus",
    "ConditionStatus",
    "ObservationStatus",
    "AllergyCategory",
    "AllergySeverity",
    "AllergyCriticality",
    "CodeableConcept",
    "Identifier",
    "Reference",
    "Period",
    "Quantity",
    "FHIRPatient",
    "FHIRMedication",
    "FHIRCondition",
    "FHIRObservation",
    "FHIRProcedure",
    "FHIRAllergyIntolerance",
]
