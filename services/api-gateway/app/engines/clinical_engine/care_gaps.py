"""
Care Gaps - Quality Measure Tracking

Tracks HEDIS/MIPS quality measures and identifies care gaps:
- Preventive care gaps (screenings, immunizations)
- Chronic disease management gaps
- Quality measure compliance

Phase 5: Complete interface definitions (implementation requires EHR integration).
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class MeasureCategory(Enum):
    """Categories of quality measures"""

    PREVENTIVE = "preventive"  # Screenings, immunizations
    CHRONIC = "chronic"  # Chronic disease management
    BEHAVIORAL = "behavioral"  # Mental health, substance use
    ACUTE = "acute"  # Acute care measures
    EFFICIENCY = "efficiency"  # Resource utilization


class MeasureStatus(Enum):
    """Status of a quality measure for a patient"""

    MET = "met"  # Requirement satisfied
    NOT_MET = "not_met"  # Gap exists
    EXCLUDED = "excluded"  # Patient excluded from measure
    PENDING = "pending"  # Awaiting data
    NOT_APPLICABLE = "not_applicable"  # Doesn't apply to patient


class GapPriority(Enum):
    """Priority of care gap"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class QualityMeasure:
    """Definition of a quality measure"""

    measure_id: str
    measure_name: str
    category: MeasureCategory
    description: str
    numerator_criteria: str
    denominator_criteria: str
    exclusion_criteria: Optional[str] = None
    reporting_period: str = "annual"
    age_range: Optional[tuple] = None  # (min_age, max_age)
    applicable_conditions: List[str] = field(default_factory=list)


@dataclass
class CareGap:
    """An identified care gap for a patient"""

    measure_id: str
    measure_name: str
    patient_id: str
    gap_type: str
    priority: GapPriority
    due_date: Optional[date] = None
    last_completed: Optional[date] = None
    recommended_actions: List[str] = field(default_factory=list)
    reason: str = ""


@dataclass
class MeasureResult:
    """Result of measure compliance check"""

    measure_id: str
    measure_name: str
    status: MeasureStatus
    compliance_date: Optional[date] = None
    next_due_date: Optional[date] = None
    notes: str = ""


@dataclass
class PatientGapSummary:
    """Summary of care gaps for a patient"""

    patient_id: str
    assessment_date: datetime
    total_measures: int
    met_measures: int
    gap_count: int
    high_priority_gaps: int
    gaps: List[CareGap] = field(default_factory=list)
    measure_results: List[MeasureResult] = field(default_factory=list)


class CareGapsService:
    """
    Care gap detection and quality measure tracking service.

    Tracks HEDIS, MIPS, and custom quality measures:
    - Preventive care (screenings, immunizations)
    - Chronic disease management (diabetes, hypertension)
    - Behavioral health measures

    Phase 5: Complete interface definitions.
    Full implementation requires EHR integration (Phase 6).
    """

    # Common HEDIS measures (sample definitions)
    MEASURES = {
        # Preventive Care
        "BCS": QualityMeasure(
            measure_id="BCS",
            measure_name="Breast Cancer Screening",
            category=MeasureCategory.PREVENTIVE,
            description="Mammogram within 2 years for women 50-74",
            numerator_criteria="Mammogram in measurement period or year prior",
            denominator_criteria="Women 52-74 as of Dec 31",
            age_range=(52, 74),
        ),
        "CCS": QualityMeasure(
            measure_id="CCS",
            measure_name="Cervical Cancer Screening",
            category=MeasureCategory.PREVENTIVE,
            description="Pap test within 3 years or HPV test within 5 years",
            numerator_criteria="Cervical cytology in past 3 years or hrHPV in past 5 years",
            denominator_criteria="Women 21-64",
            age_range=(21, 64),
        ),
        "COL": QualityMeasure(
            measure_id="COL",
            measure_name="Colorectal Cancer Screening",
            category=MeasureCategory.PREVENTIVE,
            description="Colonoscopy within 10 years or FIT/FOBT annually",
            numerator_criteria="Colonoscopy past 10 years, FIT past year, or Cologuard past 3 years",
            denominator_criteria="Adults 50-75",
            age_range=(50, 75),
        ),
        "FLU": QualityMeasure(
            measure_id="FLU",
            measure_name="Influenza Immunization",
            category=MeasureCategory.PREVENTIVE,
            description="Annual flu vaccine",
            numerator_criteria="Flu vaccine in measurement period",
            denominator_criteria="Adults 18+",
            reporting_period="flu_season",
        ),
        # Chronic Disease Management
        "HBD": QualityMeasure(
            measure_id="HBD",
            measure_name="Hemoglobin A1c Control",
            category=MeasureCategory.CHRONIC,
            description="HbA1c <8% for diabetics",
            numerator_criteria="Most recent HbA1c <8.0%",
            denominator_criteria="Patients with diabetes",
            applicable_conditions=["diabetes"],
        ),
        "CBP": QualityMeasure(
            measure_id="CBP",
            measure_name="Controlling Blood Pressure",
            category=MeasureCategory.CHRONIC,
            description="BP <140/90 for hypertensive patients",
            numerator_criteria="Most recent BP <140/90",
            denominator_criteria="Patients with hypertension",
            applicable_conditions=["hypertension"],
        ),
        "SPD": QualityMeasure(
            measure_id="SPD",
            measure_name="Statin Therapy for Diabetes",
            category=MeasureCategory.CHRONIC,
            description="Statin therapy for diabetics 40-75",
            numerator_criteria="On statin therapy",
            denominator_criteria="Diabetics age 40-75",
            age_range=(40, 75),
            applicable_conditions=["diabetes"],
        ),
        "KED": QualityMeasure(
            measure_id="KED",
            measure_name="Kidney Health Evaluation for Diabetes",
            category=MeasureCategory.CHRONIC,
            description="Annual uACR and eGFR for diabetics",
            numerator_criteria="Both uACR and eGFR in measurement period",
            denominator_criteria="Patients with diabetes",
            applicable_conditions=["diabetes"],
        ),
        # Behavioral Health
        "PHQ9": QualityMeasure(
            measure_id="PHQ9",
            measure_name="Depression Screening",
            category=MeasureCategory.BEHAVIORAL,
            description="Annual depression screening with PHQ-9",
            numerator_criteria="Documented PHQ-9 in measurement period",
            denominator_criteria="Adults 12+",
        ),
        "SUD": QualityMeasure(
            measure_id="SUD",
            measure_name="Substance Use Screening",
            category=MeasureCategory.BEHAVIORAL,
            description="Annual substance use screening",
            numerator_criteria="SBIRT or equivalent documented",
            denominator_criteria="Adults 18+",
        ),
    }

    # Screening intervals
    SCREENING_INTERVALS = {
        "mammogram": 730,  # 2 years
        "pap_smear": 1095,  # 3 years
        "hpv_test": 1825,  # 5 years
        "colonoscopy": 3650,  # 10 years
        "fit_fobt": 365,  # 1 year
        "a1c": 90,  # 90 days for diabetics
        "ldl": 365,  # Annual
        "microalbumin": 365,  # Annual for diabetics
        "eye_exam": 365,  # Annual for diabetics
        "foot_exam": 365,  # Annual for diabetics
        "flu_vaccine": 365,  # Annual
        "pneumonia_vaccine": None,  # Varies by age
        "shingles_vaccine": None,  # Once after 50
        "tdap": 3650,  # 10 years
        "depression_screen": 365,  # Annual
    }

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._patient_data: Dict[str, Dict[str, Any]] = {}
        logger.info("CareGapsService initialized")

    async def detect_gaps(
        self,
        patient_id: str,
        patient_data: Optional[Dict[str, Any]] = None,
        measures: Optional[List[str]] = None,
    ) -> PatientGapSummary:
        """
        Detect care gaps for a patient.

        Args:
            patient_id: Patient identifier
            patient_data: Patient demographics, conditions, procedures
            measures: Specific measures to check (default: all applicable)

        Returns:
            PatientGapSummary with all gaps and measure results
        """
        if not patient_data:
            patient_data = self._patient_data.get(patient_id, {})

        age = patient_data.get("age", 0)
        sex = patient_data.get("sex", "unknown")
        conditions = patient_data.get("conditions", [])
        procedures = patient_data.get("procedures", {})

        gaps = []
        results = []
        measures_to_check = measures or list(self.MEASURES.keys())

        for measure_id in measures_to_check:
            if measure_id not in self.MEASURES:
                continue

            measure = self.MEASURES[measure_id]

            # Check if measure applies to patient
            if not self._measure_applies(measure, age, sex, conditions):
                results.append(
                    MeasureResult(
                        measure_id=measure_id,
                        measure_name=measure.measure_name,
                        status=MeasureStatus.NOT_APPLICABLE,
                    )
                )
                continue

            # Check compliance
            is_met, last_date, next_due = self._check_compliance(measure, procedures, conditions)

            if is_met:
                results.append(
                    MeasureResult(
                        measure_id=measure_id,
                        measure_name=measure.measure_name,
                        status=MeasureStatus.MET,
                        compliance_date=last_date,
                        next_due_date=next_due,
                    )
                )
            else:
                # Gap detected
                priority = self._determine_priority(measure, conditions, next_due)
                gap = CareGap(
                    measure_id=measure_id,
                    measure_name=measure.measure_name,
                    patient_id=patient_id,
                    gap_type=measure.category.value,
                    priority=priority,
                    due_date=next_due,
                    last_completed=last_date,
                    recommended_actions=self._get_recommended_actions(measure),
                    reason=f"Overdue: {measure.description}",
                )
                gaps.append(gap)
                results.append(
                    MeasureResult(
                        measure_id=measure_id,
                        measure_name=measure.measure_name,
                        status=MeasureStatus.NOT_MET,
                        compliance_date=last_date,
                        next_due_date=next_due,
                    )
                )

        summary = PatientGapSummary(
            patient_id=patient_id,
            assessment_date=datetime.utcnow(),
            total_measures=len(results),
            met_measures=sum(1 for r in results if r.status == MeasureStatus.MET),
            gap_count=len(gaps),
            high_priority_gaps=sum(1 for g in gaps if g.priority == GapPriority.HIGH),
            gaps=gaps,
            measure_results=results,
        )

        # Publish gap events
        if gaps and self.event_bus:
            await self._publish_gap_events(summary, patient_id)

        return summary

    def _measure_applies(
        self,
        measure: QualityMeasure,
        age: int,
        sex: str,
        conditions: List[str],
    ) -> bool:
        """Check if a measure applies to the patient"""
        # Age check
        if measure.age_range:
            min_age, max_age = measure.age_range
            if age < min_age or age > max_age:
                return False

        # Sex-specific measures
        if measure.measure_id in ["BCS", "CCS"]:
            if sex.lower() not in ["female", "f"]:
                return False

        # Condition requirements
        if measure.applicable_conditions:
            conditions_lower = [c.lower() for c in conditions]
            if not any(req.lower() in conditions_lower for req in measure.applicable_conditions):
                return False

        return True

    def _check_compliance(
        self,
        measure: QualityMeasure,
        procedures: Dict[str, date],
        conditions: List[str],
    ) -> tuple:
        """Check if measure is compliant, return (is_met, last_date, next_due)"""
        # Placeholder - would check actual procedure dates
        # Returns (False, None, today) to indicate gap
        return (False, None, date.today())

    def _determine_priority(
        self,
        measure: QualityMeasure,
        conditions: List[str],
        due_date: Optional[date],
    ) -> GapPriority:
        """Determine priority of a care gap"""
        # High priority for chronic disease measures
        if measure.category == MeasureCategory.CHRONIC:
            return GapPriority.HIGH

        # High priority if significantly overdue
        if due_date:
            days_overdue = (date.today() - due_date).days
            if days_overdue > 365:
                return GapPriority.HIGH
            if days_overdue > 180:
                return GapPriority.MEDIUM

        return GapPriority.LOW

    def _get_recommended_actions(self, measure: QualityMeasure) -> List[str]:
        """Get recommended actions for a measure gap"""
        actions_map = {
            "BCS": ["Order mammogram", "Refer to radiology"],
            "CCS": ["Order Pap smear", "Consider HPV co-test if 30+"],
            "COL": ["Order colonoscopy", "Consider FIT if colonoscopy declined"],
            "FLU": ["Administer flu vaccine", "Document if refused"],
            "HBD": ["Order HbA1c", "Review diabetes management"],
            "CBP": ["Check blood pressure", "Adjust antihypertensive therapy"],
            "SPD": ["Add statin therapy", "Discuss ASCVD risk"],
            "KED": ["Order uACR and eGFR", "Review kidney function"],
            "PHQ9": ["Administer PHQ-9", "Discuss mental health"],
            "SUD": ["Perform SBIRT screening", "Discuss substance use"],
        }
        return actions_map.get(measure.measure_id, ["Review measure criteria"])

    async def _publish_gap_events(
        self,
        summary: PatientGapSummary,
        patient_id: str,
    ) -> None:
        """Publish care gap events"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="care_gap.detected",
            data={
                "patient_id": patient_id,
                "gap_count": summary.gap_count,
                "high_priority_count": summary.high_priority_gaps,
                "gaps": [
                    {
                        "measure_id": g.measure_id,
                        "measure_name": g.measure_name,
                        "priority": g.priority.value,
                    }
                    for g in summary.gaps
                ],
            },
            session_id=patient_id,
            source_engine="clinical",
        )

    async def get_due_screenings(
        self,
        patient_id: str,
        patient_data: Optional[Dict[str, Any]] = None,
    ) -> List[CareGap]:
        """Get list of due preventive screenings"""
        summary = await self.detect_gaps(patient_id, patient_data)
        return [g for g in summary.gaps if g.gap_type == MeasureCategory.PREVENTIVE.value]

    async def record_measure_completion(
        self,
        patient_id: str,
        measure_id: str,
        completion_date: date,
        notes: Optional[str] = None,
    ) -> MeasureResult:
        """
        Record completion of a quality measure.

        Args:
            patient_id: Patient identifier
            measure_id: Measure that was completed
            completion_date: Date of completion
            notes: Optional notes

        Returns:
            Updated MeasureResult
        """
        if measure_id not in self.MEASURES:
            raise ValueError(f"Unknown measure: {measure_id}")

        measure = self.MEASURES[measure_id]

        # Calculate next due date based on screening interval
        next_due = None
        interval_days = self.SCREENING_INTERVALS.get(measure_id.lower(), 365)  # Default to annual
        if interval_days:
            next_due = completion_date + timedelta(days=interval_days)

        result = MeasureResult(
            measure_id=measure_id,
            measure_name=measure.measure_name,
            status=MeasureStatus.MET,
            compliance_date=completion_date,
            next_due_date=next_due,
            notes=notes or "",
        )

        # Publish completion event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="care_gap.closed",
                data={
                    "patient_id": patient_id,
                    "measure_id": measure_id,
                    "measure_name": measure.measure_name,
                    "completion_date": completion_date.isoformat(),
                    "next_due": next_due.isoformat() if next_due else None,
                },
                session_id=patient_id,
                source_engine="clinical",
            )

        return result

    def get_available_measures(self) -> List[Dict[str, Any]]:
        """Get list of available quality measures"""
        return [
            {
                "measure_id": m.measure_id,
                "measure_name": m.measure_name,
                "category": m.category.value,
                "description": m.description,
            }
            for m in self.MEASURES.values()
        ]

    def get_care_gap_stats(self) -> Dict[str, Any]:
        """Get statistics about care gap capabilities"""
        return {
            "total_measures": len(self.MEASURES),
            "preventive_measures": sum(1 for m in self.MEASURES.values() if m.category == MeasureCategory.PREVENTIVE),
            "chronic_measures": sum(1 for m in self.MEASURES.values() if m.category == MeasureCategory.CHRONIC),
            "behavioral_measures": sum(1 for m in self.MEASURES.values() if m.category == MeasureCategory.BEHAVIORAL),
            "screening_intervals": len(self.SCREENING_INTERVALS),
        }


# Import timedelta for date calculations
from datetime import timedelta

__all__ = [
    "CareGapsService",
    "QualityMeasure",
    "CareGap",
    "MeasureResult",
    "PatientGapSummary",
    "MeasureCategory",
    "MeasureStatus",
    "GapPriority",
]
