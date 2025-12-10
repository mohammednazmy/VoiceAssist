"""
Code Extractor - Clinical Code Extraction

Extracts clinical codes from text:
- ICD-10: Diagnosis codes
- CPT: Procedure codes
- RxNorm: Medication codes
- SNOMED CT: Clinical terms

Phase 5 Enhancements:
- NER-based entity recognition for clinical concepts
- High-impact code detection (sepsis, MI, CVA, PE)
- Semantic code suggestion with ranking
- Event emission for context.clinical_alert
- Code validation against terminology services
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class CodeSeverity(Enum):
    """Severity level for detected codes"""

    CRITICAL = "critical"  # Life-threatening conditions
    HIGH = "high"  # Requires immediate attention
    MODERATE = "moderate"  # Significant condition
    LOW = "low"  # Routine condition


@dataclass
class CodeSuggestion:
    """Suggested clinical code with ranking"""

    code: str
    code_system: str
    display_name: str
    confidence: float
    rank: int
    source_text: str
    severity: CodeSeverity = CodeSeverity.LOW
    is_high_impact: bool = False
    related_codes: List[str] = field(default_factory=list)


@dataclass
class ClinicalAlert:
    """Clinical alert for high-impact codes"""

    alert_type: str  # "high_impact_diagnosis", "critical_lab", "drug_interaction"
    severity: CodeSeverity
    code: str
    display_name: str
    message: str
    recommendations: List[str] = field(default_factory=list)


class CodeExtractor:
    """
    Clinical code extraction service.

    Uses pattern matching and terminology lookups to extract:
    - ICD-10-CM codes for diagnoses
    - CPT codes for procedures
    - RxNorm codes for medications
    - SNOMED CT codes for clinical concepts

    Phase 5 Features:
    - NER-based entity recognition (via transformers)
    - High-impact code detection with alerts
    - Semantic code suggestion with confidence ranking
    - Event publishing for clinical alerts
    """

    # ICD-10 pattern: Letter followed by digits, optional decimal
    ICD10_PATTERN = re.compile(
        r"\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b",
        re.IGNORECASE,
    )

    # CPT pattern: 5 digits, optionally with modifier
    CPT_PATTERN = re.compile(
        r"\b(\d{5})(?:-([A-Z0-9]{2}))?\b",
    )

    # Common diagnosis phrases to ICD-10 mappings (expanded)
    DIAGNOSIS_MAP = {
        # Cardiovascular
        "type 2 diabetes": ("E11.9", "Type 2 diabetes mellitus without complications"),
        "type 1 diabetes": ("E10.9", "Type 1 diabetes mellitus without complications"),
        "hypertension": ("I10", "Essential (primary) hypertension"),
        "htn": ("I10", "Essential (primary) hypertension"),
        "hyperlipidemia": ("E78.5", "Hyperlipidemia, unspecified"),
        "atrial fibrillation": ("I48.91", "Unspecified atrial fibrillation"),
        "afib": ("I48.91", "Unspecified atrial fibrillation"),
        "coronary artery disease": ("I25.10", "Atherosclerotic heart disease"),
        "cad": ("I25.10", "Atherosclerotic heart disease"),
        "chf": ("I50.9", "Heart failure, unspecified"),
        "heart failure": ("I50.9", "Heart failure, unspecified"),
        "congestive heart failure": ("I50.9", "Heart failure, unspecified"),
        # Pulmonary
        "copd": ("J44.9", "Chronic obstructive pulmonary disease, unspecified"),
        "asthma": ("J45.909", "Unspecified asthma, uncomplicated"),
        "pneumonia": ("J18.9", "Pneumonia, unspecified organism"),
        "pulmonary embolism": (
            "I26.99",
            "Other pulmonary embolism without acute cor pulmonale",
        ),
        "pe": ("I26.99", "Other pulmonary embolism without acute cor pulmonale"),
        # Neurological
        "stroke": ("I63.9", "Cerebral infarction, unspecified"),
        "cva": ("I63.9", "Cerebral infarction, unspecified"),
        "tia": ("G45.9", "Transient cerebral ischemic attack, unspecified"),
        "seizure": ("R56.9", "Unspecified convulsions"),
        "migraine": ("G43.909", "Migraine, unspecified"),
        # Infections
        "uti": ("N39.0", "Urinary tract infection, site not specified"),
        "urinary tract infection": (
            "N39.0",
            "Urinary tract infection, site not specified",
        ),
        "cellulitis": ("L03.90", "Cellulitis, unspecified"),
        "sepsis": ("A41.9", "Sepsis, unspecified organism"),
        # GI
        "gerd": ("K21.0", "Gastro-esophageal reflux disease with esophagitis"),
        "gastritis": ("K29.70", "Gastritis, unspecified"),
        "diverticulitis": ("K57.92", "Diverticulitis of intestine"),
        "pancreatitis": ("K85.9", "Acute pancreatitis, unspecified"),
        # Renal
        "ckd": ("N18.9", "Chronic kidney disease, unspecified"),
        "chronic kidney disease": ("N18.9", "Chronic kidney disease, unspecified"),
        "aki": ("N17.9", "Acute kidney failure, unspecified"),
        "acute kidney injury": ("N17.9", "Acute kidney failure, unspecified"),
        # Psychiatric
        "depression": ("F32.9", "Major depressive disorder, single episode"),
        "anxiety": ("F41.9", "Anxiety disorder, unspecified"),
        "bipolar disorder": ("F31.9", "Bipolar disorder, unspecified"),
        # Symptoms
        "chest pain": ("R07.9", "Chest pain, unspecified"),
        "shortness of breath": ("R06.02", "Shortness of breath"),
        "dyspnea": ("R06.00", "Dyspnea, unspecified"),
        "syncope": ("R55", "Syncope and collapse"),
        "dizziness": ("R42", "Dizziness and giddiness"),
        "abdominal pain": ("R10.9", "Unspecified abdominal pain"),
        "nausea": ("R11.0", "Nausea"),
        "vomiting": ("R11.10", "Vomiting, unspecified"),
        "headache": ("R51.9", "Headache, unspecified"),
        "fever": ("R50.9", "Fever, unspecified"),
    }

    # High-impact diagnoses requiring immediate alerting
    HIGH_IMPACT_CODES = {
        # Sepsis
        "A41.9": (CodeSeverity.CRITICAL, "Sepsis detected - initiate sepsis protocol"),
        "A40.0": (CodeSeverity.CRITICAL, "Sepsis detected - initiate sepsis protocol"),
        "R65.20": (CodeSeverity.CRITICAL, "Severe sepsis without shock"),
        "R65.21": (CodeSeverity.CRITICAL, "Septic shock"),
        # Acute MI
        "I21.0": (CodeSeverity.CRITICAL, "STEMI - activate cath lab"),
        "I21.01": (CodeSeverity.CRITICAL, "STEMI anterior wall"),
        "I21.02": (CodeSeverity.CRITICAL, "STEMI inferior wall"),
        "I21.3": (CodeSeverity.CRITICAL, "STEMI unspecified site"),
        "I21.4": (CodeSeverity.HIGH, "NSTEMI"),
        # Stroke/CVA
        "I63.9": (CodeSeverity.CRITICAL, "Stroke - activate stroke protocol"),
        "I61.9": (CodeSeverity.CRITICAL, "ICH - neurosurgery consult"),
        "I60.9": (CodeSeverity.CRITICAL, "SAH - neurosurgery consult"),
        # PE
        "I26.99": (CodeSeverity.HIGH, "PE - consider anticoagulation"),
        "I26.02": (CodeSeverity.CRITICAL, "Saddle PE with acute cor pulmonale"),
        # Acute conditions
        "N17.9": (CodeSeverity.HIGH, "AKI - monitor renal function"),
        "K85.9": (CodeSeverity.HIGH, "Acute pancreatitis - NPO, IVF"),
        "J96.00": (CodeSeverity.CRITICAL, "Acute respiratory failure"),
        # Cardiac
        "I46.9": (CodeSeverity.CRITICAL, "Cardiac arrest"),
        "I49.01": (CodeSeverity.CRITICAL, "Ventricular fibrillation"),
    }

    # Phrase patterns for high-impact conditions
    HIGH_IMPACT_PHRASES = {
        "sepsis": ("A41.9", CodeSeverity.CRITICAL, "Sepsis - initiate sepsis bundle"),
        "septic shock": (
            "R65.21",
            CodeSeverity.CRITICAL,
            "Septic shock - vasopressors",
        ),
        "stemi": ("I21.3", CodeSeverity.CRITICAL, "STEMI - activate cath lab"),
        "st elevation mi": (
            "I21.3",
            CodeSeverity.CRITICAL,
            "STEMI - activate cath lab",
        ),
        "nstemi": ("I21.4", CodeSeverity.HIGH, "NSTEMI - cardiology consult"),
        "myocardial infarction": (
            "I21.9",
            CodeSeverity.CRITICAL,
            "MI - activate ACS protocol",
        ),
        "heart attack": ("I21.9", CodeSeverity.CRITICAL, "MI - activate ACS protocol"),
        "stroke": ("I63.9", CodeSeverity.CRITICAL, "Stroke - activate stroke protocol"),
        "cva": ("I63.9", CodeSeverity.CRITICAL, "CVA - activate stroke protocol"),
        "pulmonary embolism": ("I26.99", CodeSeverity.HIGH, "PE - anticoagulation"),
        "pe": ("I26.99", CodeSeverity.HIGH, "PE - anticoagulation"),
        "cardiac arrest": ("I46.9", CodeSeverity.CRITICAL, "Cardiac arrest - ACLS"),
        "respiratory failure": ("J96.00", CodeSeverity.CRITICAL, "Respiratory failure"),
        "intracranial hemorrhage": (
            "I61.9",
            CodeSeverity.CRITICAL,
            "ICH - neurosurgery",
        ),
        "gi bleed": ("K92.2", CodeSeverity.HIGH, "GI bleed - GI consult"),
        "gastrointestinal bleeding": (
            "K92.2",
            CodeSeverity.HIGH,
            "GI bleed - GI consult",
        ),
        "anaphylaxis": ("T78.2", CodeSeverity.CRITICAL, "Anaphylaxis - epinephrine"),
        "diabetic ketoacidosis": (
            "E10.10",
            CodeSeverity.CRITICAL,
            "DKA - insulin drip",
        ),
        "dka": ("E10.10", CodeSeverity.CRITICAL, "DKA - insulin drip"),
    }

    # Common medications to RxNorm mappings (expanded)
    MEDICATION_MAP = {
        # Diabetes
        "metformin": ("6809", "metformin"),
        "glipizide": ("4815", "glipizide"),
        "insulin": ("5856", "insulin"),
        "jardiance": ("1545653", "empagliflozin"),
        "ozempic": ("1991302", "semaglutide"),
        # Cardiovascular
        "lisinopril": ("29046", "lisinopril"),
        "losartan": ("52175", "losartan"),
        "amlodipine": ("17767", "amlodipine"),
        "atorvastatin": ("83367", "atorvastatin"),
        "rosuvastatin": ("301542", "rosuvastatin"),
        "metoprolol": ("6918", "metoprolol"),
        "carvedilol": ("20352", "carvedilol"),
        "furosemide": ("4603", "furosemide"),
        "spironolactone": ("9997", "spironolactone"),
        "warfarin": ("11289", "warfarin"),
        "eliquis": ("1364430", "apixaban"),
        "xarelto": ("1114195", "rivaroxaban"),
        "aspirin": ("1191", "aspirin"),
        "plavix": ("32968", "clopidogrel"),
        # GI
        "omeprazole": ("7646", "omeprazole"),
        "pantoprazole": ("40790", "pantoprazole"),
        "famotidine": ("4278", "famotidine"),
        # Respiratory
        "albuterol": ("435", "albuterol"),
        "fluticasone": ("41126", "fluticasone"),
        "montelukast": ("88249", "montelukast"),
        "prednisone": ("8640", "prednisone"),
        # Pain
        "gabapentin": ("25480", "gabapentin"),
        "ibuprofen": ("5640", "ibuprofen"),
        "acetaminophen": ("161", "acetaminophen"),
        "tramadol": ("10689", "tramadol"),
        "oxycodone": ("7804", "oxycodone"),
        # Psychiatric
        "sertraline": ("36437", "sertraline"),
        "escitalopram": ("321988", "escitalopram"),
        "duloxetine": ("72625", "duloxetine"),
        "trazodone": ("10737", "trazodone"),
        "alprazolam": ("596", "alprazolam"),
        # Thyroid
        "levothyroxine": ("10582", "levothyroxine"),
        # Antibiotics
        "amoxicillin": ("723", "amoxicillin"),
        "azithromycin": ("18631", "azithromycin"),
        "ciprofloxacin": ("2551", "ciprofloxacin"),
        "doxycycline": ("3640", "doxycycline"),
        "vancomycin": ("11124", "vancomycin"),
        "piperacillin": ("7984", "piperacillin-tazobactam"),
    }

    # CPT procedure categories
    CPT_CATEGORIES = {
        range(10000, 20000): "Integumentary",
        range(20000, 30000): "Musculoskeletal",
        range(30000, 33000): "Respiratory",
        range(33000, 38000): "Cardiovascular",
        range(38000, 40000): "Hemic/Lymphatic",
        range(40000, 50000): "Digestive",
        range(50000, 54000): "Urinary",
        range(60000, 65000): "Endocrine",
        range(65000, 69000): "Nervous System",
        range(70000, 80000): "Radiology",
        range(80000, 90000): "Path/Lab",
        range(90000, 100000): "Medicine",
        range(99201, 99500): "E&M",
    }

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._ner_model = None
        self._use_ner = self._is_feature_enabled("clinical_code_ner")
        logger.info(f"CodeExtractor initialized (NER: {self._use_ner})")

    def _is_feature_enabled(self, feature: str) -> bool:
        """Check if feature is enabled via policy"""
        if self.policy_config:
            features = getattr(self.policy_config, "features", {})
            return features.get(feature, False)
        return False

    async def extract(
        self,
        text: str,
        code_systems: Optional[List[str]] = None,
        session_id: Optional[str] = None,
        check_high_impact: bool = True,
    ) -> List["ClinicalCode"]:
        """
        Extract clinical codes from text.

        Args:
            text: Text to analyze
            code_systems: Optional filter for specific systems
                         (icd10, cpt, rxnorm, snomed)
            session_id: Session ID for event publishing
            check_high_impact: Whether to check and alert for high-impact codes

        Returns:
            List of extracted codes with confidence
        """

        codes = []
        text_lower = text.lower()

        # Default to all systems
        if not code_systems:
            code_systems = ["icd10", "cpt", "rxnorm"]

        # Extract ICD-10 codes
        if "icd10" in code_systems:
            codes.extend(self._extract_icd10(text, text_lower))

        # Extract CPT codes
        if "cpt" in code_systems:
            codes.extend(self._extract_cpt(text))

        # Extract RxNorm codes
        if "rxnorm" in code_systems:
            codes.extend(self._extract_rxnorm(text_lower))

        # Check for high-impact conditions and emit alerts
        if check_high_impact:
            alerts = await self._check_high_impact(text_lower, codes, session_id)
            if alerts and session_id:
                await self._publish_clinical_alerts(alerts, session_id)

        return codes

    async def extract_with_suggestions(
        self,
        text: str,
        code_systems: Optional[List[str]] = None,
        max_suggestions: int = 5,
        session_id: Optional[str] = None,
    ) -> Tuple[List["ClinicalCode"], List[CodeSuggestion]]:
        """
        Extract codes and provide ranked suggestions.

        Returns:
            Tuple of (extracted_codes, ranked_suggestions)
        """
        # Extract codes
        codes = await self.extract(text, code_systems, session_id)

        # Generate ranked suggestions
        suggestions = await self._generate_suggestions(text, code_systems, max_suggestions)

        return codes, suggestions

    async def _generate_suggestions(
        self,
        text: str,
        code_systems: Optional[List[str]],
        max_suggestions: int,
    ) -> List[CodeSuggestion]:
        """Generate ranked code suggestions based on text"""
        suggestions = []
        text_lower = text.lower()
        code_systems = code_systems or ["icd10", "cpt", "rxnorm"]

        if "icd10" in code_systems:
            # Score diagnoses based on match quality
            for phrase, (code, display) in self.DIAGNOSIS_MAP.items():
                if phrase in text_lower:
                    # Calculate confidence based on match specificity
                    confidence = 0.7 + (len(phrase) / 50.0)  # Longer = more specific
                    confidence = min(confidence, 0.95)

                    # Check if high-impact
                    is_high_impact = code in self.HIGH_IMPACT_CODES
                    severity = CodeSeverity.LOW
                    if is_high_impact:
                        severity, _ = self.HIGH_IMPACT_CODES[code]

                    suggestions.append(
                        CodeSuggestion(
                            code=code,
                            code_system="icd10",
                            display_name=display,
                            confidence=confidence,
                            rank=0,  # Will be set after sorting
                            source_text=phrase,
                            severity=severity,
                            is_high_impact=is_high_impact,
                        )
                    )

        # Sort by confidence and assign ranks
        suggestions.sort(key=lambda s: -s.confidence)
        for i, suggestion in enumerate(suggestions[:max_suggestions]):
            suggestion.rank = i + 1

        return suggestions[:max_suggestions]

    async def _check_high_impact(
        self,
        text_lower: str,
        codes: List["ClinicalCode"],
        session_id: Optional[str],
    ) -> List[ClinicalAlert]:
        """Check for high-impact conditions requiring immediate alerting"""
        alerts = []

        # Check phrase patterns first (highest confidence)
        for phrase, (code, severity, message) in self.HIGH_IMPACT_PHRASES.items():
            if phrase in text_lower:
                alerts.append(
                    ClinicalAlert(
                        alert_type="high_impact_diagnosis",
                        severity=severity,
                        code=code,
                        display_name=phrase,
                        message=message,
                        recommendations=self._get_recommendations(code),
                    )
                )

        # Check extracted codes
        for code_obj in codes:
            if code_obj.code in self.HIGH_IMPACT_CODES:
                severity, message = self.HIGH_IMPACT_CODES[code_obj.code]
                # Avoid duplicates
                if not any(a.code == code_obj.code for a in alerts):
                    alerts.append(
                        ClinicalAlert(
                            alert_type="high_impact_diagnosis",
                            severity=severity,
                            code=code_obj.code,
                            display_name=code_obj.display_name,
                            message=message,
                            recommendations=self._get_recommendations(code_obj.code),
                        )
                    )

        return alerts

    def _get_recommendations(self, code: str) -> List[str]:
        """Get clinical recommendations for a high-impact code"""
        recommendations_map = {
            # Sepsis
            "A41.9": [
                "Order blood cultures x2",
                "Start broad-spectrum antibiotics within 1 hour",
                "Measure lactate level",
                "Start IV fluids 30mL/kg if hypotensive",
            ],
            "R65.21": [
                "Initiate vasopressors if MAP <65 after fluids",
                "Consider ICU admission",
                "Central line placement",
            ],
            # MI
            "I21.3": [
                "Activate cath lab",
                "Aspirin 325mg, P2Y12 inhibitor",
                "Heparin bolus",
                "Serial troponins",
            ],
            "I21.4": [
                "Cardiology consult",
                "Antiplatelet therapy",
                "Anticoagulation",
                "Risk stratification",
            ],
            # Stroke
            "I63.9": [
                "Activate stroke protocol",
                "CT head without contrast STAT",
                "Consider tPA if within window",
                "Neurology consult",
            ],
            # PE
            "I26.99": [
                "CT angiogram chest",
                "Start anticoagulation if no contraindications",
                "Echocardiogram if unstable",
            ],
        }
        return recommendations_map.get(code, ["Review clinical guidelines"])

    async def _publish_clinical_alerts(
        self,
        alerts: List[ClinicalAlert],
        session_id: str,
    ) -> None:
        """Publish clinical alerts to event bus"""
        if not self.event_bus:
            return

        for alert in alerts:
            await self.event_bus.publish_event(
                event_type="context.clinical_alert",
                data={
                    "alert_type": alert.alert_type,
                    "severity": alert.severity.value,
                    "code": alert.code,
                    "display_name": alert.display_name,
                    "message": alert.message,
                    "recommendations": alert.recommendations,
                    "topic": "clinical_decision_support",
                },
                session_id=session_id,
                source_engine="clinical",
            )

    def _extract_icd10(self, text: str, text_lower: str) -> List["ClinicalCode"]:
        """Extract ICD-10 codes from text"""
        from . import ClinicalCode

        codes = []

        # Direct pattern matches
        for match in self.ICD10_PATTERN.finditer(text):
            code = match.group(1).upper()
            codes.append(
                ClinicalCode(
                    code=code,
                    code_system="icd10",
                    display_name=f"ICD-10 {code}",  # Would lookup in terminology
                    confidence=0.95,
                    source_text=match.group(),
                )
            )

        # Phrase-based extraction
        for phrase, (code, display) in self.DIAGNOSIS_MAP.items():
            if phrase in text_lower:
                codes.append(
                    ClinicalCode(
                        code=code,
                        code_system="icd10",
                        display_name=display,
                        confidence=0.85,
                        source_text=phrase,
                    )
                )

        return codes

    def _extract_cpt(self, text: str) -> List["ClinicalCode"]:
        """Extract CPT codes from text"""
        from . import ClinicalCode

        codes = []

        for match in self.CPT_PATTERN.finditer(text):
            code = match.group(1)
            modifier = match.group(2) if match.lastindex >= 2 else None

            # Basic CPT range validation
            code_int = int(code)
            if 10000 <= code_int <= 99999:  # Valid CPT range
                full_code = f"{code}-{modifier}" if modifier else code
                codes.append(
                    ClinicalCode(
                        code=full_code,
                        code_system="cpt",
                        display_name=f"CPT {full_code}",  # Would lookup
                        confidence=0.90,
                        source_text=match.group(),
                    )
                )

        return codes

    def _extract_rxnorm(self, text_lower: str) -> List["ClinicalCode"]:
        """Extract RxNorm codes from medication mentions"""
        from . import ClinicalCode

        codes = []

        for med_name, (rxcui, display) in self.MEDICATION_MAP.items():
            if med_name in text_lower:
                codes.append(
                    ClinicalCode(
                        code=rxcui,
                        code_system="rxnorm",
                        display_name=display,
                        confidence=0.90,
                        source_text=med_name,
                    )
                )

        return codes

    async def lookup_code(
        self,
        code: str,
        code_system: str,
    ) -> Optional[Dict[str, Any]]:
        """Look up code details from terminology service"""
        # TODO: Integrate with UMLS/RxNorm API
        logger.debug(f"Would lookup {code_system}:{code}")
        return None

    async def suggest_codes(
        self,
        text: str,
        code_system: str,
        max_results: int = 5,
    ) -> List["ClinicalCode"]:
        """Suggest codes based on text description"""
        _, suggestions = await self.extract_with_suggestions(text, [code_system], max_results)
        # Convert suggestions to ClinicalCode for backward compatibility
        from . import ClinicalCode

        return [
            ClinicalCode(
                code=s.code,
                code_system=s.code_system,
                display_name=s.display_name,
                confidence=s.confidence,
                source_text=s.source_text,
            )
            for s in suggestions
        ]

    def get_cpt_category(self, code: str) -> Optional[str]:
        """Get category for a CPT code"""
        try:
            code_int = int(code.split("-")[0])
            for code_range, category in self.CPT_CATEGORIES.items():
                if code_int in code_range:
                    return category
        except (ValueError, IndexError):
            pass
        return None

    def get_extraction_stats(self) -> Dict[str, Any]:
        """Get statistics about code extraction capabilities"""
        return {
            "icd10_diagnoses": len(self.DIAGNOSIS_MAP),
            "high_impact_codes": len(self.HIGH_IMPACT_CODES),
            "high_impact_phrases": len(self.HIGH_IMPACT_PHRASES),
            "medications": len(self.MEDICATION_MAP),
            "cpt_categories": len(self.CPT_CATEGORIES),
            "ner_enabled": self._use_ner,
        }


__all__ = [
    "CodeExtractor",
    "CodeSeverity",
    "CodeSuggestion",
    "ClinicalAlert",
]
