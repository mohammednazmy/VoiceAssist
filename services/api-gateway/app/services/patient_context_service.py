"""
Patient Context Service - Context-Aware Clinical Assistance

Phase 9: Patient Context Integration for Medical Dictation.

Features:
- Retrieve patient demographics and history for dictation context
- Generate contextual prompts based on patient data
- Support condition-aware knowledge retrieval
- Integrate with RAG for medication interaction queries
- HIPAA-compliant data access with audit logging
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums and Types
# ==============================================================================


class PatientDataCategory(str, Enum):
    """Categories of patient data for context."""

    DEMOGRAPHICS = "demographics"
    MEDICATIONS = "medications"
    ALLERGIES = "allergies"
    CONDITIONS = "conditions"
    VITALS = "vitals"
    LABS = "labs"
    PROCEDURES = "procedures"
    NOTES = "notes"


class ContextRelevance(str, Enum):
    """Relevance level for context items."""

    HIGH = "high"  # Current medications, active conditions
    MEDIUM = "medium"  # Recent labs, recent visits
    LOW = "low"  # Historical data


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class Medication:
    """Patient medication record."""

    name: str
    dosage: str
    frequency: str
    route: str = "PO"
    start_date: Optional[datetime] = None
    prescriber: Optional[str] = None
    is_active: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "dosage": self.dosage,
            "frequency": self.frequency,
            "route": self.route,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "prescriber": self.prescriber,
            "is_active": self.is_active,
        }


@dataclass
class Allergy:
    """Patient allergy record."""

    allergen: str
    reaction: str
    severity: str = "moderate"  # mild, moderate, severe
    verified: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allergen": self.allergen,
            "reaction": self.reaction,
            "severity": self.severity,
            "verified": self.verified,
        }


@dataclass
class Condition:
    """Patient condition/diagnosis record."""

    name: str
    icd10_code: Optional[str] = None
    onset_date: Optional[datetime] = None
    status: str = "active"  # active, resolved, chronic
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "icd10_code": self.icd10_code,
            "onset_date": self.onset_date.isoformat() if self.onset_date else None,
            "status": self.status,
            "notes": self.notes,
        }


@dataclass
class VitalSign:
    """Patient vital sign record."""

    type: str  # BP, HR, RR, Temp, SpO2, Weight, Height
    value: str
    unit: str
    recorded_at: datetime
    is_abnormal: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "value": self.value,
            "unit": self.unit,
            "recorded_at": self.recorded_at.isoformat(),
            "is_abnormal": self.is_abnormal,
        }


@dataclass
class LabResult:
    """Patient lab result record."""

    test_name: str
    value: str
    unit: str
    reference_range: str
    collected_at: datetime
    is_abnormal: bool = False
    category: str = "general"  # CBC, BMP, CMP, etc.

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_name": self.test_name,
            "value": self.value,
            "unit": self.unit,
            "reference_range": self.reference_range,
            "collected_at": self.collected_at.isoformat(),
            "is_abnormal": self.is_abnormal,
            "category": self.category,
        }


@dataclass
class PatientDemographics:
    """Patient demographic information."""

    patient_id: str
    age: int
    sex: str  # M, F, O
    preferred_language: str = "en"
    # Note: Name, DOB, MRN are PHI - only used when explicitly needed
    mrn: Optional[str] = None
    name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patient_id": self.patient_id,
            "age": self.age,
            "sex": self.sex,
            "preferred_language": self.preferred_language,
            # Only include PHI if set
            "mrn": self.mrn,
            "name": self.name,
        }


@dataclass
class DictationContext:
    """
    Full patient context for dictation sessions.

    Contains all relevant patient information to provide
    context-aware assistance during clinical documentation.
    """

    demographics: PatientDemographics
    medications: List[Medication] = field(default_factory=list)
    allergies: List[Allergy] = field(default_factory=list)
    conditions: List[Condition] = field(default_factory=list)
    recent_vitals: List[VitalSign] = field(default_factory=list)
    recent_labs: List[LabResult] = field(default_factory=list)

    # Computed summaries
    medication_summary: str = ""
    allergy_summary: str = ""
    condition_summary: str = ""

    # Context metadata
    context_generated_at: datetime = field(default_factory=datetime.utcnow)
    data_freshness_hours: int = 24

    def to_dict(self) -> Dict[str, Any]:
        return {
            "demographics": self.demographics.to_dict(),
            "medications": [m.to_dict() for m in self.medications],
            "allergies": [a.to_dict() for a in self.allergies],
            "conditions": [c.to_dict() for c in self.conditions],
            "recent_vitals": [v.to_dict() for v in self.recent_vitals],
            "recent_labs": [lab.to_dict() for lab in self.recent_labs],
            "medication_summary": self.medication_summary,
            "allergy_summary": self.allergy_summary,
            "condition_summary": self.condition_summary,
            "context_generated_at": self.context_generated_at.isoformat(),
            "data_freshness_hours": self.data_freshness_hours,
        }


@dataclass
class ContextPrompt:
    """A contextual prompt or suggestion based on patient data."""

    prompt_type: str  # info, alert, suggestion, question
    category: PatientDataCategory
    message: str
    priority: int = 0  # Higher = more important
    data_reference: Optional[Dict[str, Any]] = None


# ==============================================================================
# Patient Context Service
# ==============================================================================


class PatientContextService:
    """
    Service for managing patient context during dictation.

    Provides context-aware clinical assistance by:
    - Retrieving relevant patient data for dictation sessions
    - Generating contextual prompts and suggestions
    - Supporting medication interaction queries
    - Integrating with RAG for condition-aware knowledge retrieval

    Usage:
        service = PatientContextService()

        # Get context for dictation
        context = await service.get_context_for_dictation(
            user_id="clinician_123",
            patient_id="patient_456"
        )

        # Generate prompts
        prompts = service.generate_context_prompts(context)
        for prompt in prompts:
            print(f"[{prompt.prompt_type}] {prompt.message}")
    """

    def __init__(self):
        self._context_cache: Dict[str, DictationContext] = {}
        self._cache_ttl_minutes = 15

    async def get_context_for_dictation(
        self,
        user_id: str,
        patient_id: str,
        include_categories: Optional[List[PatientDataCategory]] = None,
    ) -> DictationContext:
        """
        Retrieve patient context for dictation.

        Args:
            user_id: ID of the clinician (for audit logging)
            patient_id: ID of the patient
            include_categories: Optional list of categories to include.
                If None, includes all categories.

        Returns:
            DictationContext with patient data
        """
        # Check cache first
        cache_key = f"{user_id}:{patient_id}"
        if cache_key in self._context_cache:
            cached = self._context_cache[cache_key]
            cache_age = datetime.utcnow() - cached.context_generated_at
            if cache_age < timedelta(minutes=self._cache_ttl_minutes):
                logger.debug(f"Using cached context for patient {patient_id}")
                return cached

        logger.info(f"Building context for patient {patient_id} by user {user_id}")

        # In a real implementation, this would query EHR/database
        # For now, return a mock context structure
        context = await self._build_context(patient_id, include_categories)

        # Generate summaries
        context.medication_summary = self._summarize_medications(context.medications)
        context.allergy_summary = self._summarize_allergies(context.allergies)
        context.condition_summary = self._summarize_conditions(context.conditions)

        # Cache the context
        self._context_cache[cache_key] = context

        return context

    async def _build_context(
        self,
        patient_id: str,
        include_categories: Optional[List[PatientDataCategory]] = None,
    ) -> DictationContext:
        """
        Build patient context from data sources.

        In production, this would integrate with:
        - EHR systems (Epic, Cerner, etc.)
        - FHIR APIs
        - Local patient databases
        """
        # Default to all categories
        if include_categories is None:
            include_categories = list(PatientDataCategory)

        # Create base context with demographics
        context = DictationContext(
            demographics=PatientDemographics(
                patient_id=patient_id,
                age=0,  # Would be populated from EHR
                sex="",
            )
        )

        # Populate based on requested categories
        # In production, these would be database/API calls
        if PatientDataCategory.MEDICATIONS in include_categories:
            context.medications = await self._fetch_medications(patient_id)

        if PatientDataCategory.ALLERGIES in include_categories:
            context.allergies = await self._fetch_allergies(patient_id)

        if PatientDataCategory.CONDITIONS in include_categories:
            context.conditions = await self._fetch_conditions(patient_id)

        if PatientDataCategory.VITALS in include_categories:
            context.recent_vitals = await self._fetch_recent_vitals(patient_id)

        if PatientDataCategory.LABS in include_categories:
            context.recent_labs = await self._fetch_recent_labs(patient_id)

        return context

    async def _fetch_medications(self, patient_id: str) -> List[Medication]:
        """Fetch patient medications from data source."""
        # Placeholder - would integrate with EHR
        logger.debug(f"Fetching medications for patient {patient_id}")
        return []

    async def _fetch_allergies(self, patient_id: str) -> List[Allergy]:
        """Fetch patient allergies from data source."""
        logger.debug(f"Fetching allergies for patient {patient_id}")
        return []

    async def _fetch_conditions(self, patient_id: str) -> List[Condition]:
        """Fetch patient conditions from data source."""
        logger.debug(f"Fetching conditions for patient {patient_id}")
        return []

    async def _fetch_recent_vitals(self, patient_id: str) -> List[VitalSign]:
        """Fetch recent vital signs from data source."""
        logger.debug(f"Fetching recent vitals for patient {patient_id}")
        return []

    async def _fetch_recent_labs(self, patient_id: str) -> List[LabResult]:
        """Fetch recent lab results from data source."""
        logger.debug(f"Fetching recent labs for patient {patient_id}")
        return []

    def _summarize_medications(self, medications: List[Medication]) -> str:
        """Generate a text summary of medications."""
        if not medications:
            return "No current medications on file."

        active = [m for m in medications if m.is_active]
        if not active:
            return "No active medications."

        summary_parts = []
        for med in active[:5]:  # Limit to top 5
            summary_parts.append(f"{med.name} {med.dosage} {med.frequency}")

        if len(active) > 5:
            summary_parts.append(f"...and {len(active) - 5} more")

        return "Current medications: " + ", ".join(summary_parts)

    def _summarize_allergies(self, allergies: List[Allergy]) -> str:
        """Generate a text summary of allergies."""
        if not allergies:
            return "No known allergies (NKDA)."

        severe = [a for a in allergies if a.severity == "severe"]
        if severe:
            severe_list = ", ".join([a.allergen for a in severe])
            return f"ALLERGIES (SEVERE): {severe_list}"

        allergen_list = ", ".join([a.allergen for a in allergies[:5]])
        return f"Allergies: {allergen_list}"

    def _summarize_conditions(self, conditions: List[Condition]) -> str:
        """Generate a text summary of conditions."""
        if not conditions:
            return "No documented conditions."

        active = [c for c in conditions if c.status in ("active", "chronic")]
        if not active:
            return "No active conditions."

        condition_list = ", ".join([c.name for c in active[:5]])
        if len(active) > 5:
            condition_list += f" (+{len(active) - 5} more)"

        return f"Active conditions: {condition_list}"

    def generate_context_prompts(self, context: DictationContext) -> List[ContextPrompt]:
        """
        Generate contextual prompts based on patient data.

        Returns a list of prompts/suggestions that can help the clinician
        during dictation.

        Args:
            context: Patient context

        Returns:
            List of ContextPrompt objects
        """
        prompts = []

        # Allergy alerts (highest priority)
        severe_allergies = [a for a in context.allergies if a.severity == "severe"]
        if severe_allergies:
            allergens = ", ".join([a.allergen for a in severe_allergies])
            prompts.append(
                ContextPrompt(
                    prompt_type="alert",
                    category=PatientDataCategory.ALLERGIES,
                    message=f"Alert: Patient has severe allergies to {allergens}",
                    priority=100,
                    data_reference={"allergies": [a.to_dict() for a in severe_allergies]},
                )
            )

        # Lab result prompts
        abnormal_labs = [lab for lab in context.recent_labs if lab.is_abnormal]
        if abnormal_labs:
            lab_count = len(abnormal_labs)
            prompts.append(
                ContextPrompt(
                    prompt_type="info",
                    category=PatientDataCategory.LABS,
                    message=f"I see {lab_count} abnormal lab result(s). Would you like me to summarize them?",
                    priority=50,
                    data_reference={"labs": [lab.to_dict() for lab in abnormal_labs]},
                )
            )

        # Vital sign prompts
        abnormal_vitals = [v for v in context.recent_vitals if v.is_abnormal]
        if abnormal_vitals:
            vital_types = ", ".join(set([v.type for v in abnormal_vitals]))
            prompts.append(
                ContextPrompt(
                    prompt_type="info",
                    category=PatientDataCategory.VITALS,
                    message=f"Note: Abnormal vitals recorded for {vital_types}",
                    priority=40,
                    data_reference={"vitals": [v.to_dict() for v in abnormal_vitals]},
                )
            )

        # Medication count info
        active_meds = [m for m in context.medications if m.is_active]
        if len(active_meds) > 5:
            prompts.append(
                ContextPrompt(
                    prompt_type="info",
                    category=PatientDataCategory.MEDICATIONS,
                    message=f"Patient is on {len(active_meds)} active medications. Would you like to review them?",
                    priority=30,
                )
            )

        # Chronic condition reminder
        chronic = [c for c in context.conditions if c.status == "chronic"]
        if chronic:
            condition_names = ", ".join([c.name for c in chronic[:3]])
            prompts.append(
                ContextPrompt(
                    prompt_type="suggestion",
                    category=PatientDataCategory.CONDITIONS,
                    message=f"Patient has chronic conditions: {condition_names}. Consider addressing in assessment.",
                    priority=20,
                )
            )

        # Sort by priority (highest first)
        prompts.sort(key=lambda p: p.priority, reverse=True)

        return prompts

    def get_medication_context_for_rag(self, context: DictationContext) -> Dict[str, Any]:
        """
        Extract medication data for RAG queries.

        Returns context suitable for drug interaction checks
        and medication-related knowledge retrieval.
        """
        return {
            "current_medications": [m.name for m in context.medications if m.is_active],
            "medication_details": [m.to_dict() for m in context.medications if m.is_active],
            "allergies": [a.allergen for a in context.allergies],
            "conditions": [c.name for c in context.conditions if c.status != "resolved"],
        }

    def get_condition_context_for_rag(self, context: DictationContext) -> Dict[str, Any]:
        """
        Extract condition data for RAG queries.

        Returns context suitable for condition-aware
        knowledge retrieval.
        """
        active_conditions = [c for c in context.conditions if c.status != "resolved"]
        return {
            "active_conditions": [c.name for c in active_conditions],
            "icd10_codes": [c.icd10_code for c in active_conditions if c.icd10_code],
            "chronic_conditions": [c.name for c in active_conditions if c.status == "chronic"],
        }

    async def check_medication_interactions(
        self,
        context: DictationContext,
        new_medication: str,
    ) -> List[Dict[str, Any]]:
        """
        Check for interactions between a new medication and current meds.

        This would integrate with a drug interaction database in production.

        Args:
            context: Patient context with current medications
            new_medication: Name of medication being considered

        Returns:
            List of potential interactions
        """
        logger.info(
            f"Checking interactions for {new_medication} against " f"{len(context.medications)} current medications"
        )

        # Placeholder - would integrate with drug interaction API
        # Examples: DrugBank, RxNorm, OpenFDA
        interactions = []

        # In production, query drug interaction database here
        # For now, return empty list

        return interactions

    def clear_cache(self, patient_id: Optional[str] = None) -> None:
        """Clear cached context."""
        if patient_id:
            # Clear specific patient
            keys_to_remove = [k for k in self._context_cache.keys() if k.endswith(f":{patient_id}")]
            for key in keys_to_remove:
                del self._context_cache[key]
            logger.info(f"Cleared cache for patient {patient_id}")
        else:
            # Clear all
            self._context_cache.clear()
            logger.info("Cleared all patient context cache")


# Global service instance
patient_context_service = PatientContextService()
