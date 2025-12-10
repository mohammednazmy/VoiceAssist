"""
Lab Trending Service - Monitor Lab Value Trends and Alerts

Monitors laboratory values and detects:
- Critical/panic values requiring immediate attention
- Significant changes from baseline
- Trends indicating disease progression
- Values outside target ranges

Phase 5 Implementation for VoiceAssist Voice Mode.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class LabAlertSeverity(Enum):
    """Severity of lab alerts"""

    CRITICAL = "critical"  # Panic values, immediate action
    HIGH = "high"  # Significantly abnormal
    MODERATE = "moderate"  # Abnormal, monitor closely
    LOW = "low"  # Mild abnormality


class TrendDirection(Enum):
    """Direction of lab value trend"""

    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    FLUCTUATING = "fluctuating"


@dataclass
class LabValue:
    """A single lab result"""

    test_name: str
    value: float
    unit: str
    timestamp: datetime
    reference_low: Optional[float] = None
    reference_high: Optional[float] = None
    is_critical: bool = False
    notes: Optional[str] = None


@dataclass
class LabTrend:
    """Trend analysis for a lab test"""

    test_name: str
    direction: TrendDirection
    percent_change: float
    time_span_days: int
    values: List[LabValue]
    is_significant: bool = False
    message: str = ""


@dataclass
class LabAlert:
    """Alert for abnormal lab value or trend"""

    test_name: str
    severity: LabAlertSeverity
    alert_type: str  # "critical_value", "significant_change", "trend", "out_of_range"
    current_value: float
    unit: str
    message: str
    recommendations: List[str] = field(default_factory=list)
    reference_range: Optional[str] = None


class LabTrendingService:
    """
    Lab trending and alerting service.

    Monitors:
    - Critical/panic values
    - Significant changes (>20% from baseline)
    - Trends over time
    - Values outside target ranges for specific conditions
    """

    # Critical (panic) value ranges - values outside these require immediate action
    CRITICAL_VALUES = {
        # Electrolytes
        "sodium": {"low": 120, "high": 160, "unit": "mEq/L"},
        "potassium": {"low": 2.5, "high": 6.5, "unit": "mEq/L"},
        "calcium": {"low": 6.0, "high": 13.0, "unit": "mg/dL"},
        "magnesium": {"low": 1.0, "high": 4.0, "unit": "mg/dL"},
        # Glucose
        "glucose": {"low": 40, "high": 500, "unit": "mg/dL"},
        # Renal
        "creatinine": {"high": 10.0, "unit": "mg/dL"},  # No critical low
        "bun": {"high": 100, "unit": "mg/dL"},
        # Hematology
        "hemoglobin": {"low": 7.0, "high": 20.0, "unit": "g/dL"},
        "hematocrit": {"low": 20, "high": 60, "unit": "%"},
        "platelets": {"low": 20, "high": 1000, "unit": "K/uL"},
        "wbc": {"low": 1.0, "high": 50.0, "unit": "K/uL"},
        # Coagulation
        "inr": {"high": 5.0, "unit": ""},
        "ptt": {"high": 100, "unit": "seconds"},
        # Cardiac
        "troponin": {"high": 0.5, "unit": "ng/mL"},  # Any elevation is significant
        # Hepatic
        "ast": {"high": 1000, "unit": "U/L"},
        "alt": {"high": 1000, "unit": "U/L"},
        "bilirubin_total": {"high": 15.0, "unit": "mg/dL"},
        # Blood gases
        "ph": {"low": 7.20, "high": 7.55, "unit": ""},
        "pco2": {"low": 20, "high": 70, "unit": "mmHg"},
        "po2": {"low": 40, "unit": "mmHg"},
        "lactate": {"high": 4.0, "unit": "mmol/L"},
    }

    # Normal reference ranges
    REFERENCE_RANGES = {
        # Electrolytes
        "sodium": {"low": 136, "high": 145, "unit": "mEq/L"},
        "potassium": {"low": 3.5, "high": 5.0, "unit": "mEq/L"},
        "chloride": {"low": 98, "high": 106, "unit": "mEq/L"},
        "bicarbonate": {"low": 22, "high": 28, "unit": "mEq/L"},
        "calcium": {"low": 8.5, "high": 10.5, "unit": "mg/dL"},
        "magnesium": {"low": 1.7, "high": 2.3, "unit": "mg/dL"},
        "phosphorus": {"low": 2.5, "high": 4.5, "unit": "mg/dL"},
        # Renal
        "creatinine": {"low": 0.7, "high": 1.3, "unit": "mg/dL"},
        "bun": {"low": 7, "high": 20, "unit": "mg/dL"},
        "egfr": {"low": 60, "unit": "mL/min/1.73m2"},  # No high critical
        # Glucose/Diabetes
        "glucose": {"low": 70, "high": 100, "unit": "mg/dL"},  # Fasting
        "hba1c": {"high": 5.7, "unit": "%"},  # Normal <5.7
        # Lipids
        "ldl": {"high": 100, "unit": "mg/dL"},  # Optimal
        "hdl": {"low": 40, "unit": "mg/dL"},
        "triglycerides": {"high": 150, "unit": "mg/dL"},
        "total_cholesterol": {"high": 200, "unit": "mg/dL"},
        # Hematology
        "hemoglobin": {"low": 12.0, "high": 17.5, "unit": "g/dL"},
        "hematocrit": {"low": 36, "high": 50, "unit": "%"},
        "wbc": {"low": 4.5, "high": 11.0, "unit": "K/uL"},
        "platelets": {"low": 150, "high": 400, "unit": "K/uL"},
        # Coagulation
        "inr": {"low": 0.9, "high": 1.1, "unit": ""},  # Normal, not on warfarin
        "ptt": {"low": 25, "high": 35, "unit": "seconds"},
        # Hepatic
        "ast": {"low": 10, "high": 40, "unit": "U/L"},
        "alt": {"low": 7, "high": 56, "unit": "U/L"},
        "alk_phos": {"low": 44, "high": 147, "unit": "U/L"},
        "bilirubin_total": {"low": 0.1, "high": 1.2, "unit": "mg/dL"},
        "albumin": {"low": 3.5, "high": 5.0, "unit": "g/dL"},
        # Thyroid
        "tsh": {"low": 0.4, "high": 4.0, "unit": "mIU/L"},
        "t4_free": {"low": 0.8, "high": 1.8, "unit": "ng/dL"},
        # Cardiac
        "bnp": {"high": 100, "unit": "pg/mL"},
        "troponin": {"high": 0.04, "unit": "ng/mL"},  # High sensitivity
        # Iron
        "ferritin": {"low": 12, "high": 300, "unit": "ng/mL"},
        "iron": {"low": 60, "high": 170, "unit": "mcg/dL"},
        # Inflammatory
        "crp": {"high": 1.0, "unit": "mg/L"},
        "esr": {"high": 20, "unit": "mm/hr"},
        # Blood gases
        "ph": {"low": 7.35, "high": 7.45, "unit": ""},
        "pco2": {"low": 35, "high": 45, "unit": "mmHg"},
        "po2": {"low": 80, "high": 100, "unit": "mmHg"},
        "lactate": {"high": 2.0, "unit": "mmol/L"},
    }

    # Target ranges for specific conditions
    TARGET_RANGES = {
        "diabetes": {
            "hba1c": {"high": 7.0, "unit": "%"},
            "glucose": {"low": 80, "high": 130, "unit": "mg/dL"},  # Pre-meal
        },
        "ckd": {
            "phosphorus": {"high": 4.5, "unit": "mg/dL"},
            "potassium": {"high": 5.0, "unit": "mEq/L"},
            "bicarbonate": {"low": 22, "unit": "mEq/L"},
        },
        "heart_failure": {
            "sodium": {"low": 135, "unit": "mEq/L"},
            "creatinine": {"high": 1.5, "unit": "mg/dL"},  # Monitor for worsening
        },
        "warfarin": {
            "inr": {"low": 2.0, "high": 3.0, "unit": ""},  # Standard range
        },
        "high_risk_cv": {
            "ldl": {"high": 70, "unit": "mg/dL"},  # Stricter target
        },
    }

    # Significant change thresholds (percent change)
    SIGNIFICANT_CHANGE = {
        "creatinine": 0.3,  # 0.3 mg/dL absolute or 50% relative = AKI
        "hemoglobin": 0.2,  # 20% drop significant
        "potassium": 0.15,  # 15% change
        "sodium": 0.1,  # 10% change (rapid changes dangerous)
        "glucose": 0.3,  # 30% change
        "platelets": 0.5,  # 50% drop concerning
        "wbc": 0.3,  # 30% change
        "troponin": 0.2,  # Any rise is significant
        "lactate": 0.5,  # Rising lactate concerning
        "inr": 0.3,  # INR fluctuations
    }

    # Lab name aliases for normalization
    LAB_ALIASES = {
        "k": "potassium",
        "na": "sodium",
        "cl": "chloride",
        "hco3": "bicarbonate",
        "bicarb": "bicarbonate",
        "co2": "bicarbonate",
        "mg": "magnesium",
        "ca": "calcium",
        "phos": "phosphorus",
        "cr": "creatinine",
        "scr": "creatinine",
        "hgb": "hemoglobin",
        "hb": "hemoglobin",
        "hct": "hematocrit",
        "plt": "platelets",
        "tbili": "bilirubin_total",
        "t. bili": "bilirubin_total",
        "alk phos": "alk_phos",
        "alkaline phosphatase": "alk_phos",
        "ft4": "t4_free",
        "free t4": "t4_free",
        "a1c": "hba1c",
        "hemoglobin a1c": "hba1c",
        "gfr": "egfr",
        "lactic acid": "lactate",
        "chol": "total_cholesterol",
    }

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._lab_history: Dict[str, List[LabValue]] = {}  # patient_id -> labs
        logger.info("LabTrendingService initialized")

    def _normalize_lab_name(self, name: str) -> str:
        """Normalize lab test name"""
        name_lower = name.lower().strip()
        return self.LAB_ALIASES.get(name_lower, name_lower)

    async def check_value(
        self,
        lab: LabValue,
        patient_conditions: Optional[List[str]] = None,
        session_id: Optional[str] = None,
    ) -> List[LabAlert]:
        """
        Check a single lab value for alerts.

        Args:
            lab: Lab value to check
            patient_conditions: Patient's conditions for target ranges
            session_id: Session ID for event publishing

        Returns:
            List of alerts for this lab value
        """
        alerts = []
        test_name = self._normalize_lab_name(lab.test_name)

        # Check for critical values
        if test_name in self.CRITICAL_VALUES:
            critical = self.CRITICAL_VALUES[test_name]
            if "low" in critical and lab.value < critical["low"]:
                alerts.append(
                    LabAlert(
                        test_name=test_name,
                        severity=LabAlertSeverity.CRITICAL,
                        alert_type="critical_value",
                        current_value=lab.value,
                        unit=critical["unit"],
                        message=f"CRITICAL LOW {test_name}: {lab.value} {critical['unit']} (critical <{critical['low']})",
                        recommendations=self._get_critical_recommendations(test_name, "low"),
                    )
                )
            if "high" in critical and lab.value > critical["high"]:
                alerts.append(
                    LabAlert(
                        test_name=test_name,
                        severity=LabAlertSeverity.CRITICAL,
                        alert_type="critical_value",
                        current_value=lab.value,
                        unit=critical["unit"],
                        message=f"CRITICAL HIGH {test_name}: {lab.value} {critical['unit']} (critical >{critical['high']})",
                        recommendations=self._get_critical_recommendations(test_name, "high"),
                    )
                )

        # Check against normal reference ranges (if not critical)
        if not alerts and test_name in self.REFERENCE_RANGES:
            ref = self.REFERENCE_RANGES[test_name]
            if "low" in ref and lab.value < ref["low"]:
                alerts.append(
                    LabAlert(
                        test_name=test_name,
                        severity=LabAlertSeverity.MODERATE,
                        alert_type="out_of_range",
                        current_value=lab.value,
                        unit=ref["unit"],
                        message=f"Low {test_name}: {lab.value} {ref['unit']} (normal {ref['low']}-{ref.get('high', 'N/A')})",
                        reference_range=f"{ref['low']}-{ref.get('high', 'N/A')} {ref['unit']}",
                    )
                )
            elif "high" in ref and lab.value > ref["high"]:
                alerts.append(
                    LabAlert(
                        test_name=test_name,
                        severity=LabAlertSeverity.MODERATE,
                        alert_type="out_of_range",
                        current_value=lab.value,
                        unit=ref["unit"],
                        message=f"High {test_name}: {lab.value} {ref['unit']} (normal {ref.get('low', 'N/A')}-{ref['high']})",
                        reference_range=f"{ref.get('low', 'N/A')}-{ref['high']} {ref['unit']}",
                    )
                )

        # Check condition-specific targets
        if patient_conditions:
            for condition in patient_conditions:
                condition_lower = condition.lower()
                if condition_lower in self.TARGET_RANGES:
                    targets = self.TARGET_RANGES[condition_lower]
                    if test_name in targets:
                        target = targets[test_name]
                        out_of_target = False
                        msg = ""
                        if "low" in target and lab.value < target["low"]:
                            out_of_target = True
                            msg = f"{test_name} below target for {condition}: {lab.value} (target >{target['low']})"
                        if "high" in target and lab.value > target["high"]:
                            out_of_target = True
                            msg = f"{test_name} above target for {condition}: {lab.value} (target <{target['high']})"

                        if out_of_target and msg:
                            alerts.append(
                                LabAlert(
                                    test_name=test_name,
                                    severity=LabAlertSeverity.LOW,
                                    alert_type="out_of_target",
                                    current_value=lab.value,
                                    unit=target["unit"],
                                    message=msg,
                                    recommendations=[f"Consider adjusting therapy for {condition}"],
                                )
                            )

        # Publish critical alerts
        if session_id and self.event_bus:
            for alert in alerts:
                if alert.severity == LabAlertSeverity.CRITICAL:
                    await self.event_bus.publish_event(
                        event_type="context.clinical_alert",
                        data={
                            "alert_type": "critical_lab",
                            "severity": "critical",
                            "test_name": alert.test_name,
                            "value": alert.current_value,
                            "unit": alert.unit,
                            "message": alert.message,
                            "recommendations": alert.recommendations,
                            "topic": "lab_monitoring",
                        },
                        session_id=session_id,
                        source_engine="clinical",
                    )

        return alerts

    def _get_critical_recommendations(self, test_name: str, direction: str) -> List[str]:
        """Get recommendations for critical lab values"""
        recommendations = {
            ("potassium", "high"): [
                "ECG to assess for hyperkalemia changes",
                "Hold potassium supplements and ACE/ARBs",
                "Consider calcium gluconate, insulin/glucose, kayexalate",
                "Repeat potassium urgently",
            ],
            ("potassium", "low"): [
                "ECG to assess for hypokalemia changes",
                "IV potassium replacement if symptomatic",
                "Oral replacement if asymptomatic and tolerating PO",
                "Check magnesium (hypomagnesemia causes refractory hypokalemia)",
            ],
            ("sodium", "low"): [
                "Assess volume status",
                "Limit free water intake",
                "Consider hypertonic saline if severe/symptomatic",
                "Correct slowly (<8-10 mEq/L per 24h to avoid ODS)",
            ],
            ("glucose", "low"): [
                "Give D50W if IV access and symptomatic",
                "Oral glucose if conscious",
                "Hold insulin/sulfonylureas",
                "Monitor glucose every 15 minutes",
            ],
            ("glucose", "high"): [
                "Check for DKA/HHS (anion gap, ketones, osmolality)",
                "Initiate IV fluids",
                "Consider insulin drip if DKA/HHS",
                "Check potassium before insulin",
            ],
            ("hemoglobin", "low"): [
                "Type and screen/crossmatch",
                "Consider transfusion if symptomatic or Hgb <7",
                "Identify source of blood loss",
                "Check iron studies, reticulocyte count",
            ],
            ("troponin", "high"): [
                "Activate ACS protocol if clinical suspicion",
                "Serial troponins q3-6h",
                "ECG now and serial",
                "Cardiology consult",
            ],
            ("lactate", "high"): [
                "Assess for sepsis, tissue hypoperfusion",
                "IV fluid resuscitation",
                "Source control if infection suspected",
                "Repeat lactate after resuscitation",
            ],
        }
        return recommendations.get((test_name, direction), ["Physician review required"])

    async def analyze_trend(
        self,
        test_name: str,
        values: List[LabValue],
        session_id: Optional[str] = None,
    ) -> Optional[LabTrend]:
        """
        Analyze trend for a series of lab values.

        Args:
            test_name: Name of the lab test
            values: List of lab values, ordered by time
            session_id: Session ID for event publishing

        Returns:
            LabTrend if sufficient data, None otherwise
        """
        if len(values) < 2:
            return None

        test_name = self._normalize_lab_name(test_name)

        # Sort by timestamp
        sorted_values = sorted(values, key=lambda v: v.timestamp)

        # Calculate time span
        time_span = (sorted_values[-1].timestamp - sorted_values[0].timestamp).days
        if time_span == 0:
            time_span = 1

        # Calculate percent change
        first_value = sorted_values[0].value
        last_value = sorted_values[-1].value
        if first_value == 0:
            percent_change = 0
        else:
            percent_change = (last_value - first_value) / first_value

        # Determine direction
        if len(sorted_values) >= 3:
            # Use linear regression-like approach
            increases = sum(
                1 for i in range(1, len(sorted_values)) if sorted_values[i].value > sorted_values[i - 1].value
            )
            decreases = sum(
                1 for i in range(1, len(sorted_values)) if sorted_values[i].value < sorted_values[i - 1].value
            )
            total_changes = len(sorted_values) - 1

            if increases / total_changes > 0.6:
                direction = TrendDirection.INCREASING
            elif decreases / total_changes > 0.6:
                direction = TrendDirection.DECREASING
            elif increases > 0 and decreases > 0:
                direction = TrendDirection.FLUCTUATING
            else:
                direction = TrendDirection.STABLE
        else:
            if percent_change > 0.05:
                direction = TrendDirection.INCREASING
            elif percent_change < -0.05:
                direction = TrendDirection.DECREASING
            else:
                direction = TrendDirection.STABLE

        # Check if change is significant
        threshold = self.SIGNIFICANT_CHANGE.get(test_name, 0.2)
        is_significant = abs(percent_change) >= threshold

        message = ""
        if is_significant:
            if direction == TrendDirection.INCREASING:
                message = f"{test_name} increasing: {first_value} -> {last_value} ({percent_change:+.1%}) over {time_span} days"
            elif direction == TrendDirection.DECREASING:
                message = f"{test_name} decreasing: {first_value} -> {last_value} ({percent_change:+.1%}) over {time_span} days"

        trend = LabTrend(
            test_name=test_name,
            direction=direction,
            percent_change=percent_change,
            time_span_days=time_span,
            values=sorted_values,
            is_significant=is_significant,
            message=message,
        )

        # Publish significant trend events
        if is_significant and session_id and self.event_bus:
            await self.event_bus.publish_event(
                event_type="context.clinical_alert",
                data={
                    "alert_type": "lab_trend",
                    "severity": "moderate",
                    "test_name": test_name,
                    "direction": direction.value,
                    "percent_change": percent_change,
                    "time_span_days": time_span,
                    "message": message,
                    "topic": "lab_monitoring",
                },
                session_id=session_id,
                source_engine="clinical",
            )

        return trend

    async def check_significant_change(
        self,
        test_name: str,
        current_value: float,
        previous_value: float,
        session_id: Optional[str] = None,
    ) -> Optional[LabAlert]:
        """
        Check for significant change between two values.

        Args:
            test_name: Name of the lab test
            current_value: Current lab value
            previous_value: Previous lab value
            session_id: Session ID for event publishing

        Returns:
            LabAlert if significant change detected
        """
        test_name = self._normalize_lab_name(test_name)

        if previous_value == 0:
            return None

        percent_change = (current_value - previous_value) / previous_value
        threshold = self.SIGNIFICANT_CHANGE.get(test_name, 0.2)

        if abs(percent_change) >= threshold:
            severity = LabAlertSeverity.HIGH if abs(percent_change) >= threshold * 2 else LabAlertSeverity.MODERATE
            direction = "increased" if percent_change > 0 else "decreased"
            unit = self.REFERENCE_RANGES.get(test_name, {}).get("unit", "")

            alert = LabAlert(
                test_name=test_name,
                severity=severity,
                alert_type="significant_change",
                current_value=current_value,
                unit=unit,
                message=f"{test_name} {direction} {abs(percent_change):.1%}: {previous_value} -> {current_value}",
                recommendations=[f"Review {test_name} change and clinical context"],
            )

            if session_id and self.event_bus:
                await self.event_bus.publish_event(
                    event_type="context.clinical_alert",
                    data={
                        "alert_type": "significant_lab_change",
                        "severity": severity.value,
                        "test_name": test_name,
                        "current_value": current_value,
                        "previous_value": previous_value,
                        "percent_change": percent_change,
                        "message": alert.message,
                        "topic": "lab_monitoring",
                    },
                    session_id=session_id,
                    source_engine="clinical",
                )

            return alert

        return None

    def get_reference_range(self, test_name: str) -> Optional[Dict[str, Any]]:
        """Get reference range for a lab test"""
        test_name = self._normalize_lab_name(test_name)
        return self.REFERENCE_RANGES.get(test_name)

    def get_trending_stats(self) -> Dict[str, Any]:
        """Get statistics about lab trending capabilities"""
        return {
            "critical_values": len(self.CRITICAL_VALUES),
            "reference_ranges": len(self.REFERENCE_RANGES),
            "condition_targets": len(self.TARGET_RANGES),
            "significant_change_thresholds": len(self.SIGNIFICANT_CHANGE),
            "lab_aliases": len(self.LAB_ALIASES),
        }


__all__ = [
    "LabTrendingService",
    "LabValue",
    "LabTrend",
    "LabAlert",
    "LabAlertSeverity",
    "TrendDirection",
]
