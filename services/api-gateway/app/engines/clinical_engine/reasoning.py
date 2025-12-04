"""
Clinical Reasoning - Drug Interactions and Contraindications

Provides clinical decision support:
- Drug-drug interactions
- Drug-condition contraindications
- Dosage warnings

Phase 5 Enhancements:
- Expanded drug interaction database
- Alternative therapy suggestions
- Allergy cross-reactivity checking
- Renal/hepatic dosing adjustments
- Event publishing for clinical alerts
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class InteractionSeverity(Enum):
    """Severity of drug interactions"""

    CONTRAINDICATED = "contraindicated"  # Never use together
    MAJOR = "major"  # Serious, monitor closely
    MODERATE = "moderate"  # Monitor, adjust doses
    MINOR = "minor"  # Low risk, monitor


@dataclass
class DrugInteractionDetail:
    """Detailed drug interaction information"""

    drug1: str
    drug2: str
    severity: InteractionSeverity
    mechanism: str
    clinical_effect: str
    management: str
    monitoring: List[str] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)


@dataclass
class AllergyAlert:
    """Allergy cross-reactivity alert"""

    allergen: str
    medication: str
    cross_reactivity_risk: str  # "high", "moderate", "low"
    recommendation: str


@dataclass
class DosingGuidance:
    """Dosing recommendation based on patient factors"""

    medication: str
    indication: str
    recommended_dose: str
    frequency: str
    adjustments: List[str] = field(default_factory=list)
    max_dose: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


class ClinicalReasoning:
    """
    Clinical reasoning service for drug safety checks.

    Uses DrugBank/RxNorm data for:
    - Drug-drug interaction checking
    - Contraindication detection
    - Allergy cross-reactivity

    Phase 5 Features:
    - Expanded interaction database with mechanisms
    - Alternative therapy suggestions
    - Allergy cross-reactivity with risk levels
    - Renal/hepatic dosing adjustments
    - Event publishing for clinical alerts
    """

    # Expanded drug interactions with mechanisms
    INTERACTIONS = {
        # Anticoagulant interactions
        ("warfarin", "aspirin"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Additive antiplatelet effect",
            "clinical_effect": "Increased risk of major bleeding",
            "management": "Use with caution, monitor INR closely",
            "monitoring": ["INR", "signs of bleeding", "hemoglobin"],
            "alternatives": ["Consider PPI for GI protection"],
        },
        ("warfarin", "nsaid"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "NSAID inhibits platelet function and may displace warfarin",
            "clinical_effect": "Increased risk of GI bleeding",
            "management": "Avoid NSAIDs if possible, use acetaminophen",
            "monitoring": ["INR", "GI symptoms", "stool guaiac"],
            "alternatives": ["acetaminophen", "topical NSAIDs"],
        },
        ("warfarin", "fluconazole"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "CYP2C9 inhibition increases warfarin levels",
            "clinical_effect": "Elevated INR, increased bleeding risk",
            "management": "Reduce warfarin dose by 25-50%, monitor INR",
            "monitoring": ["INR q2-3 days during antifungal"],
            "alternatives": ["terbinafine for fungal infections"],
        },
        ("apixaban", "rifampin"): {
            "severity": InteractionSeverity.CONTRAINDICATED,
            "mechanism": "P-gp and CYP3A4 induction decreases apixaban levels",
            "clinical_effect": "Subtherapeutic anticoagulation, stroke risk",
            "management": "Do not use together",
            "monitoring": [],
            "alternatives": ["warfarin with INR monitoring"],
        },
        # ACE inhibitor interactions
        ("lisinopril", "potassium"): {
            "severity": InteractionSeverity.MODERATE,
            "mechanism": "ACE inhibitors decrease aldosterone, retain potassium",
            "clinical_effect": "Risk of hyperkalemia",
            "management": "Monitor potassium, avoid supplements unless indicated",
            "monitoring": ["serum potassium", "renal function"],
            "alternatives": ["use K-sparing diuretics cautiously"],
        },
        ("lisinopril", "nsaid"): {
            "severity": InteractionSeverity.MODERATE,
            "mechanism": "NSAIDs reduce prostaglandin-mediated vasodilation",
            "clinical_effect": "Reduced antihypertensive effect, worsened renal function",
            "management": "Avoid chronic NSAID use, monitor BP and creatinine",
            "monitoring": ["blood pressure", "creatinine", "potassium"],
            "alternatives": ["acetaminophen for pain"],
        },
        # Diabetes medications
        ("metformin", "contrast"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Contrast-induced nephropathy impairs metformin clearance",
            "clinical_effect": "Risk of lactic acidosis",
            "management": "Hold metformin 48h before/after IV contrast",
            "monitoring": ["creatinine before restarting"],
            "alternatives": [],
        },
        ("sulfonylurea", "fluoroquinolone"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Increased insulin release",
            "clinical_effect": "Severe hypoglycemia",
            "management": "Monitor glucose closely, consider alternative antibiotic",
            "monitoring": ["blood glucose", "symptoms of hypoglycemia"],
            "alternatives": ["beta-lactam antibiotics"],
        },
        # Statin interactions
        ("simvastatin", "amiodarone"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "CYP3A4 inhibition increases statin levels",
            "clinical_effect": "Increased risk of myopathy/rhabdomyolysis",
            "management": "Limit simvastatin to 20mg daily",
            "monitoring": ["muscle symptoms", "CK if symptomatic"],
            "alternatives": ["pravastatin", "rosuvastatin"],
        },
        ("statin", "gemfibrozil"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "OATP1B1 inhibition and glucuronidation interference",
            "clinical_effect": "Significantly increased statin levels, myopathy risk",
            "management": "Avoid combination, especially with simvastatin/lovastatin",
            "monitoring": ["muscle symptoms", "CK"],
            "alternatives": ["fenofibrate (lower interaction risk)"],
        },
        # Psychiatric medications
        ("ssri", "maoi"): {
            "severity": InteractionSeverity.CONTRAINDICATED,
            "mechanism": "Excessive serotonin accumulation",
            "clinical_effect": "Life-threatening serotonin syndrome",
            "management": "Contraindicated - wait 14+ days between",
            "monitoring": [],
            "alternatives": ["bupropion (different mechanism)"],
        },
        ("ssri", "tramadol"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Additive serotonergic effect",
            "clinical_effect": "Risk of serotonin syndrome and seizures",
            "management": "Use lowest effective doses, monitor for toxicity",
            "monitoring": ["mental status", "neuromuscular symptoms"],
            "alternatives": ["non-serotonergic analgesics"],
        },
        ("lithium", "nsaid"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "NSAIDs reduce lithium clearance",
            "clinical_effect": "Lithium toxicity",
            "management": "Avoid NSAIDs or reduce lithium dose 20-50%",
            "monitoring": ["lithium levels", "renal function"],
            "alternatives": ["acetaminophen", "aspirin (less interaction)"],
        },
        # Opioid interactions
        ("opioid", "benzodiazepine"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Additive CNS and respiratory depression",
            "clinical_effect": "Overdose, respiratory failure, death",
            "management": "Avoid if possible, use lowest doses if necessary",
            "monitoring": ["respiratory rate", "sedation level"],
            "alternatives": ["non-benzodiazepine anxiolytics"],
        },
        # QT prolongation
        ("qtc_prolonging", "qtc_prolonging"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "Additive QT prolongation",
            "clinical_effect": "Torsades de pointes, sudden cardiac death",
            "management": "Avoid combinations, check ECG, correct electrolytes",
            "monitoring": ["ECG", "potassium", "magnesium"],
            "alternatives": ["check crediblemeds.org for alternatives"],
        },
        # Antibiotic interactions
        ("ciprofloxacin", "theophylline"): {
            "severity": InteractionSeverity.MAJOR,
            "mechanism": "CYP1A2 inhibition increases theophylline levels",
            "clinical_effect": "Theophylline toxicity (seizures, arrhythmias)",
            "management": "Reduce theophylline dose 50%, monitor levels",
            "monitoring": ["theophylline levels", "heart rate"],
            "alternatives": ["levofloxacin", "azithromycin"],
        },
    }

    # Expanded drug class mappings
    DRUG_CLASSES = {
        # SSRIs
        "fluoxetine": ["ssri", "antidepressant", "cyp2d6_inhibitor"],
        "sertraline": ["ssri", "antidepressant"],
        "paroxetine": ["ssri", "antidepressant", "cyp2d6_inhibitor"],
        "escitalopram": ["ssri", "antidepressant"],
        "citalopram": ["ssri", "antidepressant", "qtc_prolonging"],
        # SNRIs
        "venlafaxine": ["snri", "antidepressant"],
        "duloxetine": ["snri", "antidepressant"],
        # MAOIs
        "phenelzine": ["maoi", "antidepressant"],
        "tranylcypromine": ["maoi", "antidepressant"],
        "selegiline": ["maoi", "antidepressant"],
        # Opioids
        "morphine": ["opioid", "cns_depressant"],
        "oxycodone": ["opioid", "cns_depressant"],
        "hydrocodone": ["opioid", "cns_depressant"],
        "fentanyl": ["opioid", "cns_depressant"],
        "tramadol": ["opioid", "serotonergic"],
        # Benzodiazepines
        "alprazolam": ["benzodiazepine", "cns_depressant"],
        "lorazepam": ["benzodiazepine", "cns_depressant"],
        "diazepam": ["benzodiazepine", "cns_depressant"],
        "clonazepam": ["benzodiazepine", "cns_depressant"],
        # Statins
        "simvastatin": ["statin", "cyp3a4_substrate"],
        "atorvastatin": ["statin", "cyp3a4_substrate"],
        "lovastatin": ["statin", "cyp3a4_substrate"],
        "pravastatin": ["statin"],
        "rosuvastatin": ["statin"],
        # NSAIDs
        "ibuprofen": ["nsaid"],
        "naproxen": ["nsaid"],
        "diclofenac": ["nsaid"],
        "celecoxib": ["nsaid", "cox2_selective"],
        "meloxicam": ["nsaid"],
        # Sulfonylureas
        "glipizide": ["sulfonylurea"],
        "glyburide": ["sulfonylurea"],
        "glimepiride": ["sulfonylurea"],
        # QT prolonging drugs
        "amiodarone": ["antiarrhythmic", "qtc_prolonging", "cyp3a4_inhibitor"],
        "sotalol": ["beta_blocker", "qtc_prolonging"],
        "haloperidol": ["antipsychotic", "qtc_prolonging"],
        "ziprasidone": ["antipsychotic", "qtc_prolonging"],
        "ondansetron": ["antiemetic", "qtc_prolonging"],
        # Fluoroquinolones
        "ciprofloxacin": ["fluoroquinolone", "cyp1a2_inhibitor"],
        "levofloxacin": ["fluoroquinolone", "qtc_prolonging"],
        "moxifloxacin": ["fluoroquinolone", "qtc_prolonging"],
    }

    # Contraindications (drug -> condition)
    CONTRAINDICATIONS = {
        "metformin": [
            ("renal failure", "major", "Avoid in severe renal impairment (eGFR <30)"),
            ("liver disease", "major", "Increased risk of lactic acidosis"),
            ("heart failure", "moderate", "Use with caution in decompensated HF"),
        ],
        "lisinopril": [
            ("pregnancy", "contraindicated", "Teratogenic - avoid in pregnancy"),
            ("angioedema", "contraindicated", "History of ACE-inhibitor angioedema"),
            ("bilateral renal artery stenosis", "contraindicated", "Risk of acute renal failure"),
        ],
        "nsaid": [
            ("gi bleed", "major", "Increased bleeding risk"),
            ("renal failure", "moderate", "May worsen renal function"),
            ("heart failure", "moderate", "May cause fluid retention"),
            ("pregnancy", "contraindicated", "Third trimester - premature ductus closure"),
        ],
        "warfarin": [
            ("active bleeding", "contraindicated", "Will worsen hemorrhage"),
            ("pregnancy", "contraindicated", "Teratogenic, crosses placenta"),
            ("severe liver disease", "major", "Impaired coagulation factor synthesis"),
        ],
        "beta_blocker": [
            ("asthma", "major", "May precipitate bronchospasm"),
            ("bradycardia", "major", "Heart rate <50, avoid"),
            ("heart block", "contraindicated", "2nd/3rd degree without pacemaker"),
        ],
        "sulfonylurea": [
            ("g6pd deficiency", "major", "Risk of hemolysis"),
            ("severe renal failure", "major", "Active metabolites accumulate"),
        ],
    }

    # Allergy cross-reactivity patterns
    ALLERGY_CROSSREACTIVITY = {
        "penicillin": {
            "high_risk": ["ampicillin", "amoxicillin", "piperacillin"],
            "moderate_risk": ["cephalexin", "cefazolin", "ceftriaxone"],  # ~2% cross-reactivity
            "low_risk": ["aztreonam", "carbapenems"],  # <1% cross-reactivity
            "safe_alternatives": ["azithromycin", "fluoroquinolones", "vancomycin"],
        },
        "sulfa": {
            "high_risk": ["sulfamethoxazole", "sulfasalazine"],
            "moderate_risk": ["thiazides", "furosemide", "sulfonylureas"],  # Controversial
            "low_risk": [],
            "safe_alternatives": ["fluoroquinolones", "nitrofurantoin"],
        },
        "aspirin": {
            "high_risk": ["nsaid"],  # NSAIDs can trigger similar reactions
            "moderate_risk": [],
            "low_risk": ["cox2_selective"],  # COX-2 inhibitors may be tolerated
            "safe_alternatives": ["acetaminophen"],
        },
        "iodine_contrast": {
            "high_risk": ["iodinated contrast"],
            "moderate_risk": [],
            "low_risk": ["povidone-iodine"],  # Topical, different mechanism
            "safe_alternatives": ["gadolinium contrast", "non-contrast imaging"],
        },
    }

    # Renal dosing adjustments
    RENAL_DOSING = {
        "metformin": {
            "egfr_30_45": "Max 1000mg daily, monitor more frequently",
            "egfr_below_30": "Contraindicated",
        },
        "gabapentin": {
            "egfr_30_60": "300mg once daily max",
            "egfr_15_30": "300mg every other day",
            "egfr_below_15": "150mg every other day or post-dialysis",
        },
        "enoxaparin": {
            "egfr_below_30": "1mg/kg once daily (instead of twice daily)",
        },
        "ciprofloxacin": {
            "egfr_30_50": "250-500mg q12h (reduce by 50%)",
            "egfr_below_30": "250-500mg q18h",
        },
        "vancomycin": {
            "egfr_below_50": "Dose based on levels, extend interval",
        },
        "lisinopril": {
            "egfr_below_30": "Start at 2.5-5mg daily",
        },
    }

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        logger.info("ClinicalReasoning initialized")

    async def check_drug_interactions(
        self,
        medications: List[str],
        session_id: Optional[str] = None,
    ) -> List["DrugInteraction"]:
        """
        Check for drug-drug interactions.

        Args:
            medications: List of medication names
            session_id: Session ID for event publishing

        Returns:
            List of interactions sorted by severity
        """
        from . import DrugInteraction

        interactions = []
        meds_lower = [m.lower() for m in medications]

        # Expand to include drug classes
        all_terms = set(meds_lower)
        med_to_classes: Dict[str, List[str]] = {}
        for med in meds_lower:
            if med in self.DRUG_CLASSES:
                classes = self.DRUG_CLASSES[med]
                all_terms.update(classes)
                med_to_classes[med] = classes

        # Check all pairs
        checked = set()
        for med1 in all_terms:
            for med2 in all_terms:
                if med1 == med2:
                    continue
                pair = tuple(sorted([med1, med2]))
                if pair in checked:
                    continue
                checked.add(pair)

                # Check for interaction
                if pair in self.INTERACTIONS:
                    data = self.INTERACTIONS[pair]
                    severity = data["severity"]
                    if isinstance(severity, InteractionSeverity):
                        severity_str = severity.value
                    else:
                        severity_str = severity

                    interactions.append(
                        DrugInteraction(
                            drug1=med1,
                            drug2=med2,
                            severity=severity_str,
                            description=data.get("clinical_effect", data.get("description", "")),
                            recommendation=data.get("management", data.get("recommendation", "")),
                        )
                    )

        # Sort by severity
        severity_order = {"contraindicated": 0, "major": 1, "moderate": 2, "minor": 3}
        interactions.sort(key=lambda i: severity_order.get(i.severity, 4))

        # Publish events for severe interactions
        if session_id and self.event_bus:
            for interaction in interactions:
                if interaction.severity in ["contraindicated", "major"]:
                    await self._publish_interaction_alert(interaction, session_id)

        return interactions

    async def check_drug_interactions_detailed(
        self,
        medications: List[str],
        session_id: Optional[str] = None,
    ) -> List[DrugInteractionDetail]:
        """
        Check for drug-drug interactions with full details.

        Returns detailed information including mechanism, monitoring, alternatives.
        """
        interactions = []
        meds_lower = [m.lower() for m in medications]

        # Expand to include drug classes
        all_terms = set(meds_lower)
        for med in meds_lower:
            if med in self.DRUG_CLASSES:
                all_terms.update(self.DRUG_CLASSES[med])

        # Check all pairs
        checked = set()
        for med1 in all_terms:
            for med2 in all_terms:
                if med1 == med2:
                    continue
                pair = tuple(sorted([med1, med2]))
                if pair in checked:
                    continue
                checked.add(pair)

                # Check for interaction
                if pair in self.INTERACTIONS:
                    data = self.INTERACTIONS[pair]
                    severity = data["severity"]
                    if isinstance(severity, str):
                        severity = InteractionSeverity(severity)

                    interactions.append(
                        DrugInteractionDetail(
                            drug1=med1,
                            drug2=med2,
                            severity=severity,
                            mechanism=data.get("mechanism", "Unknown"),
                            clinical_effect=data.get("clinical_effect", ""),
                            management=data.get("management", ""),
                            monitoring=data.get("monitoring", []),
                            alternatives=data.get("alternatives", []),
                        )
                    )

        # Sort by severity
        severity_order = {
            InteractionSeverity.CONTRAINDICATED: 0,
            InteractionSeverity.MAJOR: 1,
            InteractionSeverity.MODERATE: 2,
            InteractionSeverity.MINOR: 3,
        }
        interactions.sort(key=lambda i: severity_order.get(i.severity, 4))

        return interactions

    async def _publish_interaction_alert(
        self,
        interaction: "DrugInteraction",
        session_id: str,
    ) -> None:
        """Publish drug interaction alert to event bus"""
        if not self.event_bus:
            return

        await self.event_bus.publish_event(
            event_type="context.clinical_alert",
            data={
                "alert_type": "drug_interaction",
                "severity": interaction.severity,
                "drugs": [interaction.drug1, interaction.drug2],
                "description": interaction.description,
                "recommendation": interaction.recommendation,
                "topic": "medication_safety",
            },
            session_id=session_id,
            source_engine="clinical",
        )

    async def check_contraindications(
        self,
        medication: str,
        conditions: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Check medication contraindications against patient conditions.

        Returns list of contraindication alerts.
        """
        med_lower = medication.lower()
        conditions_lower = [c.lower() for c in conditions]

        alerts = []

        # Check medication and its classes
        meds_to_check = [med_lower]
        if med_lower in self.DRUG_CLASSES:
            meds_to_check.extend(self.DRUG_CLASSES[med_lower])

        for med in meds_to_check:
            if med in self.CONTRAINDICATIONS:
                for condition, severity, description in self.CONTRAINDICATIONS[med]:
                    if any(condition in c for c in conditions_lower):
                        alerts.append(
                            {
                                "medication": medication,
                                "condition": condition,
                                "severity": severity,
                                "description": description,
                            }
                        )

        return alerts

    async def check_allergy_crossreact(
        self,
        medication: str,
        allergies: List[str],
        session_id: Optional[str] = None,
    ) -> List[AllergyAlert]:
        """
        Check for allergy cross-reactivity.

        Args:
            medication: Medication to check
            allergies: Patient's known allergies

        Returns:
            List of allergy alerts with risk levels
        """
        alerts = []
        med_lower = medication.lower()
        allergies_lower = [a.lower() for a in allergies]

        # Get drug classes for the medication
        med_classes = [med_lower]
        if med_lower in self.DRUG_CLASSES:
            med_classes.extend(self.DRUG_CLASSES[med_lower])

        for allergen in allergies_lower:
            if allergen in self.ALLERGY_CROSSREACTIVITY:
                cross_react = self.ALLERGY_CROSSREACTIVITY[allergen]

                # Check high risk
                for high_risk_drug in cross_react.get("high_risk", []):
                    if high_risk_drug in med_classes or med_lower == high_risk_drug:
                        alerts.append(
                            AllergyAlert(
                                allergen=allergen,
                                medication=medication,
                                cross_reactivity_risk="high",
                                recommendation=f"Avoid {medication} - same drug class as {allergen}",
                            )
                        )

                # Check moderate risk
                for mod_risk_drug in cross_react.get("moderate_risk", []):
                    if mod_risk_drug in med_classes or med_lower == mod_risk_drug:
                        alerts.append(
                            AllergyAlert(
                                allergen=allergen,
                                medication=medication,
                                cross_reactivity_risk="moderate",
                                recommendation=f"Use caution - ~2-5% cross-reactivity with {allergen}",
                            )
                        )

                # Check low risk
                for low_risk_drug in cross_react.get("low_risk", []):
                    if low_risk_drug in med_classes or med_lower == low_risk_drug:
                        alerts.append(
                            AllergyAlert(
                                allergen=allergen,
                                medication=medication,
                                cross_reactivity_risk="low",
                                recommendation=f"Low risk - <1% cross-reactivity with {allergen}",
                            )
                        )

        # Publish alert for high-risk cross-reactivity
        if session_id and self.event_bus:
            high_risk_alerts = [a for a in alerts if a.cross_reactivity_risk == "high"]
            for alert in high_risk_alerts:
                await self.event_bus.publish_event(
                    event_type="context.clinical_alert",
                    data={
                        "alert_type": "allergy_cross_reactivity",
                        "severity": "major",
                        "allergen": alert.allergen,
                        "medication": alert.medication,
                        "risk": alert.cross_reactivity_risk,
                        "recommendation": alert.recommendation,
                        "topic": "medication_safety",
                    },
                    session_id=session_id,
                    source_engine="clinical",
                )

        return alerts

    def get_safe_alternatives(
        self,
        allergen: str,
    ) -> List[str]:
        """Get safe medication alternatives for a given allergen"""
        if allergen.lower() in self.ALLERGY_CROSSREACTIVITY:
            return self.ALLERGY_CROSSREACTIVITY[allergen.lower()].get("safe_alternatives", [])
        return []

    async def get_dosing_guidance(
        self,
        medication: str,
        indication: str,
        patient_factors: Dict[str, Any],
    ) -> Optional[DosingGuidance]:
        """
        Get dosing recommendations based on patient factors.

        Args:
            medication: Medication name
            indication: Indication for use
            patient_factors: Dict with egfr, weight, age, hepatic_function, etc.

        Returns:
            DosingGuidance with recommended dose and adjustments
        """
        med_lower = medication.lower()
        adjustments = []
        warnings = []

        # Check renal dosing adjustments
        egfr = patient_factors.get("egfr")
        if egfr is not None and med_lower in self.RENAL_DOSING:
            renal_adjustments = self.RENAL_DOSING[med_lower]

            if egfr < 15:
                if "egfr_below_15" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR <15): {renal_adjustments['egfr_below_15']}")
                elif "egfr_below_30" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR <30): {renal_adjustments['egfr_below_30']}")
            elif egfr < 30:
                if "egfr_below_30" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR <30): {renal_adjustments['egfr_below_30']}")
                elif "egfr_15_30" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR 15-30): {renal_adjustments['egfr_15_30']}")
            elif egfr < 45:
                if "egfr_30_45" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR 30-45): {renal_adjustments['egfr_30_45']}")
            elif egfr < 60:
                if "egfr_30_60" in renal_adjustments:
                    adjustments.append(f"Renal (eGFR 30-60): {renal_adjustments['egfr_30_60']}")

        # Check age-related adjustments
        age = patient_factors.get("age")
        if age is not None and age >= 65:
            if med_lower in ["opioid", "benzodiazepine"] or (
                med_lower in self.DRUG_CLASSES
                and any(c in ["opioid", "benzodiazepine"] for c in self.DRUG_CLASSES[med_lower])
            ):
                adjustments.append("Elderly: Start at lower doses, titrate slowly")
                warnings.append("Increased fall risk in elderly patients")

        # Check weight-based dosing
        weight = patient_factors.get("weight")
        if weight is not None:
            if med_lower in ["enoxaparin", "heparin"]:
                adjustments.append(f"Weight-based: Consider actual body weight ({weight}kg)")
            if weight > 120 and med_lower in ["apixaban", "rivaroxaban"]:
                warnings.append("Limited data in obesity, consider alternative anticoagulation")

        # Return guidance if we have any information
        if adjustments or warnings:
            return DosingGuidance(
                medication=medication,
                indication=indication,
                recommended_dose="Adjust per below",
                frequency="Per standard dosing",
                adjustments=adjustments,
                warnings=warnings,
            )

        return None

    def get_alternatives_for_interaction(
        self,
        drug1: str,
        drug2: str,
    ) -> List[str]:
        """
        Get alternative medications to avoid an interaction.

        Returns list of alternatives for either drug.
        """
        pair = tuple(sorted([drug1.lower(), drug2.lower()]))
        if pair in self.INTERACTIONS:
            return self.INTERACTIONS[pair].get("alternatives", [])
        return []

    def get_monitoring_recommendations(
        self,
        medications: List[str],
    ) -> Dict[str, List[str]]:
        """
        Get combined monitoring recommendations for a medication list.

        Returns dict of medication -> monitoring parameters.
        """
        recommendations = {}
        meds_lower = [m.lower() for m in medications]

        # Expand to include drug classes
        all_terms = set(meds_lower)
        for med in meds_lower:
            if med in self.DRUG_CLASSES:
                all_terms.update(self.DRUG_CLASSES[med])

        # Check for interactions and collect monitoring
        checked = set()
        for med1 in all_terms:
            for med2 in all_terms:
                if med1 == med2:
                    continue
                pair = tuple(sorted([med1, med2]))
                if pair in checked:
                    continue
                checked.add(pair)

                if pair in self.INTERACTIONS:
                    data = self.INTERACTIONS[pair]
                    monitoring = data.get("monitoring", [])
                    if monitoring:
                        key = f"{med1} + {med2}"
                        recommendations[key] = monitoring

        return recommendations

    def get_reasoning_stats(self) -> Dict[str, Any]:
        """Get statistics about clinical reasoning capabilities"""
        return {
            "interaction_count": len(self.INTERACTIONS),
            "drug_classes": len(self.DRUG_CLASSES),
            "contraindication_drugs": len(self.CONTRAINDICATIONS),
            "allergy_patterns": len(self.ALLERGY_CROSSREACTIVITY),
            "renal_dosing_drugs": len(self.RENAL_DOSING),
        }


__all__ = [
    "ClinicalReasoning",
    "InteractionSeverity",
    "DrugInteractionDetail",
    "AllergyAlert",
    "DosingGuidance",
]
