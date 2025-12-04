"""
Medication Reconciliation Service - Compare and Verify Medication Lists

Compares medications mentioned during dictation with patient context (EHR):
- Detects discrepancies between sources
- Identifies duplicate therapies
- Detects potential omissions
- Generates reconciliation alerts

Phase 5 Implementation for VoiceAssist Voice Mode.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DiscrepancyType(Enum):
    """Types of medication discrepancies"""

    OMISSION = "omission"  # In EHR but not mentioned
    ADDITION = "addition"  # Mentioned but not in EHR
    DOSE_CHANGE = "dose_change"  # Different dose
    FREQUENCY_CHANGE = "frequency_change"  # Different frequency
    DUPLICATE_THERAPY = "duplicate"  # Same therapeutic class
    DISCONTINUED = "discontinued"  # Should be stopped
    NEW_MEDICATION = "new"  # Newly prescribed


class DiscrepancySeverity(Enum):
    """Severity of medication discrepancy"""

    HIGH = "high"  # Requires immediate attention
    MEDIUM = "medium"  # Should be clarified
    LOW = "low"  # Informational


@dataclass
class MedicationEntry:
    """Represents a medication with dosing details"""

    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    prescriber: Optional[str] = None
    indication: Optional[str] = None
    source: str = "unknown"  # "ehr", "dictation", "patient_reported"


@dataclass
class MedicationDiscrepancy:
    """A discrepancy between medication sources"""

    discrepancy_type: DiscrepancyType
    severity: DiscrepancySeverity
    medication_name: str
    ehr_entry: Optional[MedicationEntry] = None
    dictation_entry: Optional[MedicationEntry] = None
    message: str = ""
    recommendations: List[str] = field(default_factory=list)


@dataclass
class ReconciliationResult:
    """Result of medication reconciliation"""

    reconciled_at: datetime
    session_id: str
    ehr_medication_count: int
    dictation_medication_count: int
    discrepancies: List[MedicationDiscrepancy] = field(default_factory=list)
    matched_medications: List[str] = field(default_factory=list)
    needs_review: bool = False
    review_reasons: List[str] = field(default_factory=list)


class MedicationReconciliationService:
    """
    Medication reconciliation between dictation and EHR.

    Compares medications from:
    1. EHR/patient context (prior medication list)
    2. Dictation (medications mentioned in current encounter)

    Detects:
    - Omissions: EHR medications not mentioned
    - Additions: New medications in dictation
    - Duplicates: Same therapeutic class medications
    - Changes: Dose or frequency modifications
    """

    # Therapeutic drug classes for duplicate detection
    DRUG_CLASSES = {
        # ACE Inhibitors
        "ace_inhibitor": ["lisinopril", "enalapril", "benazepril", "ramipril", "captopril"],
        # ARBs
        "arb": ["losartan", "valsartan", "irbesartan", "olmesartan", "candesartan"],
        # Beta Blockers
        "beta_blocker": ["metoprolol", "atenolol", "carvedilol", "bisoprolol", "propranolol"],
        # Calcium Channel Blockers
        "ccb": ["amlodipine", "nifedipine", "diltiazem", "verapamil"],
        # Statins
        "statin": ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
        # PPIs
        "ppi": ["omeprazole", "pantoprazole", "esomeprazole", "lansoprazole", "rabeprazole"],
        # H2 Blockers
        "h2_blocker": ["famotidine", "ranitidine", "cimetidine"],
        # SSRIs
        "ssri": ["sertraline", "fluoxetine", "paroxetine", "escitalopram", "citalopram"],
        # SNRIs
        "snri": ["venlafaxine", "duloxetine", "desvenlafaxine"],
        # Benzodiazepines
        "benzodiazepine": ["alprazolam", "lorazepam", "diazepam", "clonazepam"],
        # Opioids
        "opioid": ["oxycodone", "hydrocodone", "morphine", "tramadol", "fentanyl"],
        # Thiazides
        "thiazide": ["hydrochlorothiazide", "chlorthalidone", "indapamide"],
        # Loop diuretics
        "loop_diuretic": ["furosemide", "bumetanide", "torsemide"],
        # Sulfonylureas
        "sulfonylurea": ["glipizide", "glyburide", "glimepiride"],
        # DPP-4 inhibitors
        "dpp4": ["sitagliptin", "saxagliptin", "linagliptin", "alogliptin"],
        # GLP-1 agonists
        "glp1": ["semaglutide", "liraglutide", "dulaglutide", "exenatide"],
        # SGLT2 inhibitors
        "sglt2": ["empagliflozin", "dapagliflozin", "canagliflozin"],
        # Anticoagulants
        "anticoagulant": ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "enoxaparin"],
    }

    # High-risk medications requiring extra attention
    HIGH_RISK_MEDICATIONS = {
        "warfarin",
        "insulin",
        "methotrexate",
        "digoxin",
        "lithium",
        "opioid",
        "anticoagulant",
        "chemotherapy",
    }

    # Medication name normalization
    MEDICATION_ALIASES = {
        "eliquis": "apixaban",
        "xarelto": "rivaroxaban",
        "pradaxa": "dabigatran",
        "coumadin": "warfarin",
        "lipitor": "atorvastatin",
        "crestor": "rosuvastatin",
        "zocor": "simvastatin",
        "prilosec": "omeprazole",
        "protonix": "pantoprazole",
        "nexium": "esomeprazole",
        "toprol": "metoprolol",
        "lopressor": "metoprolol",
        "coreg": "carvedilol",
        "norvasc": "amlodipine",
        "zoloft": "sertraline",
        "prozac": "fluoxetine",
        "lexapro": "escitalopram",
        "cymbalta": "duloxetine",
        "glucophage": "metformin",
        "januvia": "sitagliptin",
        "jardiance": "empagliflozin",
        "ozempic": "semaglutide",
        "lasix": "furosemide",
        "bumex": "bumetanide",
    }

    def __init__(self, event_bus=None, clinical_reasoning=None):
        self.event_bus = event_bus
        self.clinical_reasoning = clinical_reasoning
        logger.info("MedicationReconciliationService initialized")

    def _normalize_medication_name(self, name: str) -> str:
        """Normalize medication name (lowercase, resolve aliases)"""
        name_lower = name.lower().strip()
        return self.MEDICATION_ALIASES.get(name_lower, name_lower)

    def _get_drug_class(self, medication: str) -> Optional[str]:
        """Get therapeutic class for a medication"""
        med_lower = self._normalize_medication_name(medication)
        for drug_class, medications in self.DRUG_CLASSES.items():
            if med_lower in medications:
                return drug_class
        return None

    def _is_high_risk(self, medication: str) -> bool:
        """Check if medication is high-risk"""
        med_lower = self._normalize_medication_name(medication)
        drug_class = self._get_drug_class(medication)
        return med_lower in self.HIGH_RISK_MEDICATIONS or drug_class in self.HIGH_RISK_MEDICATIONS

    async def reconcile(
        self,
        ehr_medications: List[MedicationEntry],
        dictation_medications: List[MedicationEntry],
        session_id: str,
        check_interactions: bool = True,
    ) -> ReconciliationResult:
        """
        Reconcile medication lists from EHR and dictation.

        Args:
            ehr_medications: Medications from patient's EHR
            dictation_medications: Medications mentioned in dictation
            session_id: Session ID for event publishing
            check_interactions: Whether to check for drug interactions

        Returns:
            ReconciliationResult with discrepancies and recommendations
        """
        discrepancies = []
        matched = []
        review_reasons = []

        # Normalize medication names
        ehr_meds_normalized = {self._normalize_medication_name(m.name): m for m in ehr_medications}
        dictation_meds_normalized = {self._normalize_medication_name(m.name): m for m in dictation_medications}

        # Find matches
        ehr_names = set(ehr_meds_normalized.keys())
        dictation_names = set(dictation_meds_normalized.keys())
        common_meds = ehr_names & dictation_names

        for med_name in common_meds:
            matched.append(med_name)
            # Check for dose/frequency changes
            ehr_entry = ehr_meds_normalized[med_name]
            dict_entry = dictation_meds_normalized[med_name]

            if ehr_entry.dose and dict_entry.dose and ehr_entry.dose != dict_entry.dose:
                discrepancies.append(
                    MedicationDiscrepancy(
                        discrepancy_type=DiscrepancyType.DOSE_CHANGE,
                        severity=DiscrepancySeverity.MEDIUM,
                        medication_name=med_name,
                        ehr_entry=ehr_entry,
                        dictation_entry=dict_entry,
                        message=f"Dose change: {ehr_entry.dose} -> {dict_entry.dose}",
                        recommendations=["Verify intended dose change", "Update medication list"],
                    )
                )

            if ehr_entry.frequency and dict_entry.frequency and ehr_entry.frequency != dict_entry.frequency:
                discrepancies.append(
                    MedicationDiscrepancy(
                        discrepancy_type=DiscrepancyType.FREQUENCY_CHANGE,
                        severity=DiscrepancySeverity.MEDIUM,
                        medication_name=med_name,
                        ehr_entry=ehr_entry,
                        dictation_entry=dict_entry,
                        message=f"Frequency change: {ehr_entry.frequency} -> {dict_entry.frequency}",
                        recommendations=["Verify intended frequency change"],
                    )
                )

        # Find omissions (in EHR but not in dictation)
        omissions = ehr_names - dictation_names
        for med_name in omissions:
            ehr_entry = ehr_meds_normalized[med_name]
            severity = DiscrepancySeverity.HIGH if self._is_high_risk(med_name) else DiscrepancySeverity.MEDIUM
            discrepancies.append(
                MedicationDiscrepancy(
                    discrepancy_type=DiscrepancyType.OMISSION,
                    severity=severity,
                    medication_name=med_name,
                    ehr_entry=ehr_entry,
                    message=f"EHR medication '{med_name}' not mentioned in encounter",
                    recommendations=[
                        "Confirm patient is still taking this medication",
                        "Document if discontinued",
                    ],
                )
            )
            if self._is_high_risk(med_name):
                review_reasons.append(f"High-risk medication omitted: {med_name}")

        # Find additions (in dictation but not in EHR)
        additions = dictation_names - ehr_names
        for med_name in additions:
            dict_entry = dictation_meds_normalized[med_name]
            discrepancies.append(
                MedicationDiscrepancy(
                    discrepancy_type=DiscrepancyType.ADDITION,
                    severity=DiscrepancySeverity.MEDIUM,
                    medication_name=med_name,
                    dictation_entry=dict_entry,
                    message=f"New medication '{med_name}' mentioned in encounter",
                    recommendations=[
                        "Add to medication list if newly prescribed",
                        "Document indication",
                    ],
                )
            )

        # Check for duplicate therapies
        duplicates = self._find_duplicate_therapies(
            list(ehr_meds_normalized.values()) + list(dictation_meds_normalized.values())
        )
        for duplicate in duplicates:
            discrepancies.append(duplicate)
            review_reasons.append(f"Duplicate therapy: {duplicate.message}")

        # Check drug interactions if clinical reasoning service available
        if check_interactions and self.clinical_reasoning:
            all_meds = list(ehr_names | dictation_names)
            interactions = await self.clinical_reasoning.check_drug_interactions(all_meds, session_id)
            for interaction in interactions:
                if interaction.severity in ["contraindicated", "major"]:
                    review_reasons.append(f"Drug interaction: {interaction.drug1} + {interaction.drug2}")

        # Determine if review is needed
        needs_review = len(review_reasons) > 0 or any(d.severity == DiscrepancySeverity.HIGH for d in discrepancies)

        result = ReconciliationResult(
            reconciled_at=datetime.utcnow(),
            session_id=session_id,
            ehr_medication_count=len(ehr_medications),
            dictation_medication_count=len(dictation_medications),
            discrepancies=discrepancies,
            matched_medications=matched,
            needs_review=needs_review,
            review_reasons=review_reasons,
        )

        # Publish events for significant discrepancies
        await self._publish_reconciliation_events(result, session_id)

        return result

    def _find_duplicate_therapies(
        self,
        medications: List[MedicationEntry],
    ) -> List[MedicationDiscrepancy]:
        """Find duplicate therapies in medication list"""
        duplicates = []
        class_medications: Dict[str, List[MedicationEntry]] = {}

        for med in medications:
            drug_class = self._get_drug_class(med.name)
            if drug_class:
                if drug_class not in class_medications:
                    class_medications[drug_class] = []
                class_medications[drug_class].append(med)

        for drug_class, meds in class_medications.items():
            if len(meds) > 1:
                # Remove duplicates (same medication from different sources)
                unique_meds = list({self._normalize_medication_name(m.name): m for m in meds}.values())
                if len(unique_meds) > 1:
                    med_names = [m.name for m in unique_meds]
                    duplicates.append(
                        MedicationDiscrepancy(
                            discrepancy_type=DiscrepancyType.DUPLICATE_THERAPY,
                            severity=DiscrepancySeverity.MEDIUM,
                            medication_name=", ".join(med_names),
                            message=f"Duplicate {drug_class}: {', '.join(med_names)}",
                            recommendations=[
                                f"Review need for multiple {drug_class} medications",
                                "Consider consolidating therapy",
                            ],
                        )
                    )

        return duplicates

    async def _publish_reconciliation_events(
        self,
        result: ReconciliationResult,
        session_id: str,
    ) -> None:
        """Publish reconciliation events to event bus"""
        if not self.event_bus:
            return

        # Publish summary event
        await self.event_bus.publish_event(
            event_type="medication.reconciliation_complete",
            data={
                "ehr_count": result.ehr_medication_count,
                "dictation_count": result.dictation_medication_count,
                "discrepancy_count": len(result.discrepancies),
                "matched_count": len(result.matched_medications),
                "needs_review": result.needs_review,
            },
            session_id=session_id,
            source_engine="clinical",
        )

        # Publish individual alerts for high-severity discrepancies
        for discrepancy in result.discrepancies:
            if discrepancy.severity == DiscrepancySeverity.HIGH:
                await self.event_bus.publish_event(
                    event_type="context.clinical_alert",
                    data={
                        "alert_type": "medication_discrepancy",
                        "severity": "high",
                        "discrepancy_type": discrepancy.discrepancy_type.value,
                        "medication": discrepancy.medication_name,
                        "message": discrepancy.message,
                        "recommendations": discrepancy.recommendations,
                        "topic": "medication_safety",
                    },
                    session_id=session_id,
                    source_engine="clinical",
                )

    async def reconcile_simple(
        self,
        ehr_medication_names: List[str],
        dictation_medication_names: List[str],
        session_id: str,
    ) -> ReconciliationResult:
        """
        Simple reconciliation using just medication names.

        Convenience method when full MedicationEntry objects aren't available.
        """
        ehr_entries = [MedicationEntry(name=name, source="ehr") for name in ehr_medication_names]
        dictation_entries = [MedicationEntry(name=name, source="dictation") for name in dictation_medication_names]
        return await self.reconcile(ehr_entries, dictation_entries, session_id)

    def get_reconciliation_stats(self) -> Dict[str, Any]:
        """Get statistics about reconciliation capabilities"""
        return {
            "drug_classes": len(self.DRUG_CLASSES),
            "high_risk_medications": len(self.HIGH_RISK_MEDICATIONS),
            "medication_aliases": len(self.MEDICATION_ALIASES),
        }


__all__ = [
    "MedicationReconciliationService",
    "MedicationEntry",
    "MedicationDiscrepancy",
    "ReconciliationResult",
    "DiscrepancyType",
    "DiscrepancySeverity",
]
