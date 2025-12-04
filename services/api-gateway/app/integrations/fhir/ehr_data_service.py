"""
EHR Data Service - Context Integration Layer

Bridges the FHIR client with VoiceAssist engines:
- Fetches EHR data on demand or session start
- Merges EHR data into Memory Engine context
- Publishes memory.context_updated events
- Handles missing/partial data gracefully
- Provides voice command handlers for EHR queries
- Manages EHR data caching per session
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

from .epic_adapter import EpicAdapter
from .fhir_models import (
    FHIRAllergyIntolerance,
    FHIRCondition,
    FHIRMedication,
    FHIRObservation,
    FHIRPatient,
    FHIRProcedure,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


class EHRDataStatus(str, Enum):
    """Status of EHR data fetch"""

    PENDING = "pending"
    LOADING = "loading"
    LOADED = "loaded"
    PARTIAL = "partial"
    ERROR = "error"
    UNAVAILABLE = "unavailable"


@dataclass
class EHRSessionContext:
    """
    EHR data for a session.

    Contains all fetched patient data and metadata.
    """

    session_id: str
    patient_fhir_id: Optional[str] = None

    # Data
    patient: Optional[FHIRPatient] = None
    medications: List[FHIRMedication] = field(default_factory=list)
    conditions: List[FHIRCondition] = field(default_factory=list)
    allergies: List[FHIRAllergyIntolerance] = field(default_factory=list)
    vitals: List[FHIRObservation] = field(default_factory=list)
    labs: List[FHIRObservation] = field(default_factory=list)
    procedures: List[FHIRProcedure] = field(default_factory=list)

    # Status
    status: EHRDataStatus = EHRDataStatus.PENDING
    last_updated: Optional[datetime] = None
    errors: List[str] = field(default_factory=list)

    # Data freshness
    data_ttl_minutes: int = 15

    @property
    def is_stale(self) -> bool:
        """Check if data needs refresh"""
        if not self.last_updated:
            return True
        age = datetime.utcnow() - self.last_updated
        return age > timedelta(minutes=self.data_ttl_minutes)

    @property
    def has_data(self) -> bool:
        """Check if any data is loaded"""
        return bool(self.patient or self.medications or self.conditions or self.allergies or self.vitals or self.labs)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "session_id": self.session_id,
            "patient_fhir_id": self.patient_fhir_id,
            "patient": self.patient.to_dict() if self.patient else None,
            "medications": [m.to_dict() for m in self.medications],
            "conditions": [c.to_dict() for c in self.conditions],
            "allergies": [a.to_dict() for a in self.allergies],
            "vitals": [v.to_dict() for v in self.vitals],
            "labs": [l.to_dict() for l in self.labs],
            "procedures": [p.to_dict() for p in self.procedures],
            "status": self.status.value,
            "last_updated": (self.last_updated.isoformat() if self.last_updated else None),
            "errors": self.errors,
            "is_stale": self.is_stale,
        }

    def to_memory_context(self) -> Dict[str, Any]:
        """
        Convert to format suitable for Memory Engine context.

        Returns simplified structure for AI consumption.
        """
        context = {
            "ehr_loaded": self.has_data,
            "ehr_status": self.status.value,
        }

        if self.patient:
            context["patient"] = {
                "id": self.patient.id,
                "name": self.patient.full_name,
                "age": self.patient.age,
                "gender": self.patient.gender,
                "mrn": self.patient.mrn,
            }

        if self.medications:
            context["medications"] = [
                {
                    "name": m.medication_name,
                    "dosage": m.dosage_instruction,
                    "status": m.status.value,
                    "is_active": m.is_active,
                }
                for m in self.medications
            ]
            context["active_medication_count"] = sum(1 for m in self.medications if m.is_active)

        if self.conditions:
            context["conditions"] = [
                {
                    "name": c.condition_name,
                    "status": c.clinical_status.value,
                    "icd10": c.icd10_code,
                    "is_chronic": c.is_chronic,
                }
                for c in self.conditions
            ]
            context["active_condition_count"] = sum(1 for c in self.conditions if c.is_active)

        if self.allergies:
            context["allergies"] = [
                {
                    "allergen": a.allergen_name,
                    "is_medication": a.is_medication_allergy,
                    "is_severe": a.is_severe,
                    "reaction": a.reaction_summary,
                }
                for a in self.allergies
            ]
            context["severe_allergy_count"] = sum(1 for a in self.allergies if a.is_severe)

        if self.vitals:
            # Get most recent vitals
            recent_vitals = {}
            for v in sorted(
                self.vitals,
                key=lambda x: x.effective_datetime or datetime.min,
                reverse=True,
            ):
                name = v.observation_name
                if name not in recent_vitals:
                    recent_vitals[name] = {
                        "value": v.display_value,
                        "is_abnormal": v.is_abnormal,
                        "timestamp": (v.effective_datetime.isoformat() if v.effective_datetime else None),
                    }
            context["vitals"] = recent_vitals

        if self.labs:
            # Get most recent abnormal labs
            context["abnormal_labs"] = [
                {
                    "name": l.observation_name,
                    "value": l.display_value,
                    "reference_range": l.reference_range_display,
                    "timestamp": (l.effective_datetime.isoformat() if l.effective_datetime else None),
                }
                for l in self.labs
                if l.is_abnormal
            ][
                :10
            ]  # Limit to 10 most recent

        return context


@dataclass
class EHRQueryResult:
    """Result of an EHR voice query"""

    success: bool
    query_type: str
    data: Any = None
    summary: str = ""
    speak_text: str = ""  # For TTS
    error: Optional[str] = None


# ==============================================================================
# EHR Data Service
# ==============================================================================


class EHRDataService:
    """
    Service for fetching and managing EHR data in sessions.

    Provides:
    - Session-scoped EHR data fetching
    - Integration with Memory Engine context
    - Voice command handlers for EHR queries
    - Automatic cache management
    - Event publishing for context updates
    """

    # Voice command patterns
    VOICE_COMMANDS = {
        "medications": [
            "show medications",
            "list medications",
            "current medications",
            "what medications",
        ],
        "allergies": [
            "show allergies",
            "list allergies",
            "patient allergies",
            "what allergies",
        ],
        "conditions": [
            "show conditions",
            "list conditions",
            "problem list",
            "diagnoses",
        ],
        "vitals": ["show vitals", "latest vitals", "vital signs", "current vitals"],
        "labs": ["show labs", "recent labs", "lab results", "latest cbc", "latest bmp"],
        "summary": ["patient summary", "clinical summary", "show summary"],
    }

    def __init__(
        self,
        epic_adapter: Optional[EpicAdapter] = None,
        event_bus=None,
        audit_service=None,
        policy_service=None,
    ):
        self.epic_adapter = epic_adapter
        self.event_bus = event_bus
        self.audit_service = audit_service
        self.policy_service = policy_service

        self._session_contexts: Dict[str, EHRSessionContext] = {}
        self._loading_locks: Dict[str, asyncio.Lock] = {}

        logger.info("EHRDataService initialized")

    def is_enabled(self, user_id: Optional[str] = None) -> bool:
        """Check if EHR integration is enabled"""
        if self.policy_service:
            return self.policy_service.is_feature_enabled("epic_fhir_read_only", user_id)
        return self.epic_adapter is not None

    async def initialize_session(
        self,
        session_id: str,
        patient_fhir_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> EHRSessionContext:
        """
        Initialize EHR context for a session.

        If patient_fhir_id is provided, immediately starts data fetch.
        """
        context = EHRSessionContext(
            session_id=session_id,
            patient_fhir_id=patient_fhir_id,
        )
        self._session_contexts[session_id] = context

        if patient_fhir_id and self.is_enabled(user_id):
            # Start async data fetch
            asyncio.create_task(self._fetch_patient_data(session_id, patient_fhir_id, user_id))

        return context

    async def get_session_context(
        self,
        session_id: str,
    ) -> Optional[EHRSessionContext]:
        """Get EHR context for a session"""
        return self._session_contexts.get(session_id)

    async def set_patient(
        self,
        session_id: str,
        patient_fhir_id: str,
        user_id: Optional[str] = None,
    ) -> EHRSessionContext:
        """
        Set patient for a session and fetch their data.

        Args:
            session_id: Session ID
            patient_fhir_id: Epic patient FHIR ID
            user_id: User ID for audit

        Returns:
            Updated EHR context
        """
        context = self._session_contexts.get(session_id)
        if not context:
            context = await self.initialize_session(session_id, patient_fhir_id, user_id)
        else:
            context.patient_fhir_id = patient_fhir_id
            await self._fetch_patient_data(session_id, patient_fhir_id, user_id)

        return context

    async def _fetch_patient_data(
        self,
        session_id: str,
        patient_fhir_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Fetch all patient data from EHR"""
        context = self._session_contexts.get(session_id)
        if not context:
            return

        # Get or create lock
        if session_id not in self._loading_locks:
            self._loading_locks[session_id] = asyncio.Lock()

        async with self._loading_locks[session_id]:
            context.status = EHRDataStatus.LOADING

            if not self.epic_adapter:
                context.status = EHRDataStatus.UNAVAILABLE
                context.errors.append("EHR adapter not configured")
                return

            try:
                # Fetch all data in parallel
                results = await asyncio.gather(
                    self.epic_adapter.get_patient(patient_fhir_id),
                    self.epic_adapter.get_patient_medications(patient_fhir_id),
                    self.epic_adapter.get_patient_conditions(patient_fhir_id),
                    self.epic_adapter.get_patient_allergies(patient_fhir_id),
                    self.epic_adapter.get_patient_vitals(patient_fhir_id),
                    self.epic_adapter.get_patient_labs(patient_fhir_id),
                    return_exceptions=True,
                )

                # Process results
                patient, meds, conditions, allergies, vitals, labs = results

                if isinstance(patient, FHIRPatient):
                    context.patient = patient
                elif isinstance(patient, Exception):
                    context.errors.append(f"Patient fetch error: {patient}")

                if isinstance(meds, list):
                    context.medications = meds
                elif isinstance(meds, Exception):
                    context.errors.append(f"Medications fetch error: {meds}")

                if isinstance(conditions, list):
                    context.conditions = conditions
                elif isinstance(conditions, Exception):
                    context.errors.append(f"Conditions fetch error: {conditions}")

                if isinstance(allergies, list):
                    context.allergies = allergies
                elif isinstance(allergies, Exception):
                    context.errors.append(f"Allergies fetch error: {allergies}")

                if isinstance(vitals, list):
                    context.vitals = vitals
                elif isinstance(vitals, Exception):
                    context.errors.append(f"Vitals fetch error: {vitals}")

                if isinstance(labs, list):
                    context.labs = labs
                elif isinstance(labs, Exception):
                    context.errors.append(f"Labs fetch error: {labs}")

                # Set status
                context.last_updated = datetime.utcnow()
                if context.errors:
                    context.status = EHRDataStatus.PARTIAL if context.has_data else EHRDataStatus.ERROR
                else:
                    context.status = EHRDataStatus.LOADED

                # Audit log
                if self.audit_service and user_id:
                    await self.audit_service.log_ehr_access(
                        user_id=user_id,
                        session_id=session_id,
                        action="read",
                        resource_type="patient_summary",
                        resource_id=patient_fhir_id,
                        details={
                            "medications_count": len(context.medications),
                            "conditions_count": len(context.conditions),
                            "allergies_count": len(context.allergies),
                            "vitals_count": len(context.vitals),
                            "labs_count": len(context.labs),
                        },
                    )

                # Publish context update event
                await self._publish_context_update(session_id, context)

            except Exception as e:
                context.status = EHRDataStatus.ERROR
                context.errors.append(str(e))
                logger.error(f"Error fetching EHR data for session {session_id}: {e}")

    async def _publish_context_update(
        self,
        session_id: str,
        context: EHRSessionContext,
    ) -> None:
        """Publish memory.context_updated event"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="memory.context_updated",
            data={
                "source": "ehr",
                "patient_id": context.patient_fhir_id,
                "status": context.status.value,
                "has_medications": bool(context.medications),
                "has_conditions": bool(context.conditions),
                "has_allergies": bool(context.allergies),
                "has_vitals": bool(context.vitals),
                "has_labs": bool(context.labs),
                "severe_allergies": sum(1 for a in context.allergies if a.is_severe),
                "abnormal_labs": sum(1 for l in context.labs if l.is_abnormal),
            },
            session_id=session_id,
            source_engine="integration",
        )

    async def refresh_session_data(
        self,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[EHRSessionContext]:
        """Refresh EHR data for a session"""
        context = self._session_contexts.get(session_id)
        if not context or not context.patient_fhir_id:
            return None

        await self._fetch_patient_data(session_id, context.patient_fhir_id, user_id)
        return context

    def get_memory_context(self, session_id: str) -> Dict[str, Any]:
        """Get EHR data formatted for Memory Engine context"""
        context = self._session_contexts.get(session_id)
        if not context:
            return {"ehr_loaded": False, "ehr_status": "not_initialized"}
        return context.to_memory_context()

    # =========================================================================
    # Voice Command Handlers
    # =========================================================================

    async def handle_voice_query(
        self,
        session_id: str,
        query: str,
        user_id: Optional[str] = None,
    ) -> EHRQueryResult:
        """
        Handle a voice query for EHR data.

        Args:
            session_id: Session ID
            query: Voice query text
            user_id: User ID for audit

        Returns:
            EHRQueryResult with data and speech text
        """
        context = self._session_contexts.get(session_id)
        if not context or not context.has_data:
            return EHRQueryResult(
                success=False,
                query_type="unknown",
                error="No patient data loaded",
                speak_text="No patient data is currently loaded.",
            )

        # Determine query type
        query_lower = query.lower()
        query_type = self._classify_query(query_lower)

        if query_type == "medications":
            return await self._handle_medications_query(context)
        elif query_type == "allergies":
            return await self._handle_allergies_query(context)
        elif query_type == "conditions":
            return await self._handle_conditions_query(context)
        elif query_type == "vitals":
            return await self._handle_vitals_query(context)
        elif query_type == "labs":
            return await self._handle_labs_query(context, query_lower)
        elif query_type == "summary":
            return await self._handle_summary_query(context)
        else:
            return EHRQueryResult(
                success=False,
                query_type="unknown",
                error="Query not recognized",
                speak_text="I'm not sure what EHR data you're asking for.",
            )

    def _classify_query(self, query: str) -> str:
        """Classify voice query type"""
        for query_type, patterns in self.VOICE_COMMANDS.items():
            for pattern in patterns:
                if pattern in query:
                    return query_type
        return "unknown"

    async def _handle_medications_query(
        self,
        context: EHRSessionContext,
    ) -> EHRQueryResult:
        """Handle medications query"""
        if not context.medications:
            return EHRQueryResult(
                success=True,
                query_type="medications",
                data=[],
                summary="No medications on file",
                speak_text="The patient has no medications on file.",
            )

        active_meds = [m for m in context.medications if m.is_active]
        med_list = [f"{m.medication_name}: {m.dosage_instruction or 'dosing not specified'}" for m in active_meds[:10]]

        summary = f"Found {len(active_meds)} active medications"
        speak_text = f"The patient has {len(active_meds)} active medications. "
        if active_meds:
            speak_text += "The first few are: " + ", ".join(m.medication_name for m in active_meds[:5])

        return EHRQueryResult(
            success=True,
            query_type="medications",
            data=[m.to_dict() for m in active_meds],
            summary=summary,
            speak_text=speak_text,
        )

    async def _handle_allergies_query(
        self,
        context: EHRSessionContext,
    ) -> EHRQueryResult:
        """Handle allergies query"""
        if not context.allergies:
            return EHRQueryResult(
                success=True,
                query_type="allergies",
                data=[],
                summary="No known drug allergies (NKDA)",
                speak_text="The patient has no known drug allergies.",
            )

        severe = [a for a in context.allergies if a.is_severe]
        med_allergies = [a for a in context.allergies if a.is_medication_allergy]

        summary = f"Found {len(context.allergies)} allergies"
        if severe:
            summary += f" ({len(severe)} severe)"

        speak_text = f"The patient has {len(context.allergies)} documented allergies. "
        if severe:
            speak_text += f"Warning: {len(severe)} are severe, including: "
            speak_text += ", ".join(a.allergen_name for a in severe[:3])

        return EHRQueryResult(
            success=True,
            query_type="allergies",
            data=[a.to_dict() for a in context.allergies],
            summary=summary,
            speak_text=speak_text,
        )

    async def _handle_conditions_query(
        self,
        context: EHRSessionContext,
    ) -> EHRQueryResult:
        """Handle conditions/problem list query"""
        if not context.conditions:
            return EHRQueryResult(
                success=True,
                query_type="conditions",
                data=[],
                summary="No documented conditions",
                speak_text="The patient has no documented conditions.",
            )

        active = [c for c in context.conditions if c.is_active]
        chronic = [c for c in active if c.is_chronic]

        summary = f"Found {len(active)} active conditions"
        if chronic:
            summary += f" ({len(chronic)} chronic)"

        speak_text = f"The patient has {len(active)} active conditions. "
        if active:
            speak_text += "These include: " + ", ".join(c.condition_name for c in active[:5])

        return EHRQueryResult(
            success=True,
            query_type="conditions",
            data=[c.to_dict() for c in active],
            summary=summary,
            speak_text=speak_text,
        )

    async def _handle_vitals_query(
        self,
        context: EHRSessionContext,
    ) -> EHRQueryResult:
        """Handle vitals query"""
        if not context.vitals:
            return EHRQueryResult(
                success=True,
                query_type="vitals",
                data=[],
                summary="No recent vitals",
                speak_text="No recent vital signs are available.",
            )

        # Get most recent of each type
        latest = {}
        for v in sorted(
            context.vitals,
            key=lambda x: x.effective_datetime or datetime.min,
            reverse=True,
        ):
            name = v.observation_name
            if name not in latest:
                latest[name] = v

        abnormal = [v for v in latest.values() if v.is_abnormal]

        summary = f"Latest vitals available for {len(latest)} measurements"
        speak_text = "Here are the latest vitals. "

        vital_readings = []
        for name, v in latest.items():
            reading = f"{name}: {v.display_value}"
            if v.is_abnormal:
                reading += " (abnormal)"
            vital_readings.append(reading)

        speak_text += ". ".join(vital_readings[:5])

        return EHRQueryResult(
            success=True,
            query_type="vitals",
            data={name: v.to_dict() for name, v in latest.items()},
            summary=summary,
            speak_text=speak_text,
        )

    async def _handle_labs_query(
        self,
        context: EHRSessionContext,
        query: str,
    ) -> EHRQueryResult:
        """Handle labs query"""
        if not context.labs:
            return EHRQueryResult(
                success=True,
                query_type="labs",
                data=[],
                summary="No recent labs",
                speak_text="No recent lab results are available.",
            )

        # Check for specific lab type
        labs = context.labs
        if "cbc" in query:
            labs = [
                l
                for l in labs
                if "cbc" in l.observation_name.lower() or l.loinc_code in ["6690-2", "718-7", "789-8", "787-2"]
            ]
        elif "bmp" in query or "metabolic" in query:
            labs = [
                l
                for l in labs
                if "metabolic" in l.observation_name.lower()
                or l.observation_name.lower() in ["sodium", "potassium", "glucose", "creatinine"]
            ]

        abnormal = [l for l in labs if l.is_abnormal]

        summary = f"Found {len(labs)} lab results"
        if abnormal:
            summary += f" ({len(abnormal)} abnormal)"

        speak_text = f"Found {len(labs)} lab results. "
        if abnormal:
            speak_text += f"Note: {len(abnormal)} are abnormal. "
            speak_text += "Abnormal results include: "
            speak_text += ", ".join(f"{l.observation_name} at {l.display_value}" for l in abnormal[:3])
        elif labs:
            speak_text += "All results are within normal limits."

        return EHRQueryResult(
            success=True,
            query_type="labs",
            data=[l.to_dict() for l in labs],
            summary=summary,
            speak_text=speak_text,
        )

    async def _handle_summary_query(
        self,
        context: EHRSessionContext,
    ) -> EHRQueryResult:
        """Handle summary query"""
        parts = []

        if context.patient:
            parts.append(f"{context.patient.full_name}, " f"{context.patient.age} year old {context.patient.gender}")

        if context.conditions:
            active = [c for c in context.conditions if c.is_active]
            parts.append(f"{len(active)} active conditions")

        if context.medications:
            active = [m for m in context.medications if m.is_active]
            parts.append(f"{len(active)} medications")

        if context.allergies:
            severe = [a for a in context.allergies if a.is_severe]
            if severe:
                parts.append(f"{len(severe)} severe allergies")
            else:
                parts.append(f"{len(context.allergies)} allergies")

        summary = ". ".join(parts)
        speak_text = "Patient summary: " + summary

        return EHRQueryResult(
            success=True,
            query_type="summary",
            data=context.to_dict(),
            summary=summary,
            speak_text=speak_text,
        )

    # =========================================================================
    # Cleanup
    # =========================================================================

    def clear_session(self, session_id: str) -> None:
        """Clear EHR data for a session"""
        if session_id in self._session_contexts:
            del self._session_contexts[session_id]
        if session_id in self._loading_locks:
            del self._loading_locks[session_id]

    def clear_all_sessions(self) -> None:
        """Clear all session data"""
        self._session_contexts.clear()
        self._loading_locks.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics"""
        contexts = list(self._session_contexts.values())
        return {
            "active_sessions": len(contexts),
            "loaded_sessions": sum(1 for c in contexts if c.status == EHRDataStatus.LOADED),
            "partial_sessions": sum(1 for c in contexts if c.status == EHRDataStatus.PARTIAL),
            "error_sessions": sum(1 for c in contexts if c.status == EHRDataStatus.ERROR),
            "adapter_healthy": (self.epic_adapter.is_healthy() if self.epic_adapter else False),
        }


__all__ = [
    "EHRDataService",
    "EHRDataStatus",
    "EHRSessionContext",
    "EHRQueryResult",
]
