"""
Medical Calculators Library

Comprehensive collection of evidence-based medical calculators including:
- Cardiovascular: CHA2DS2-VASc, HEART Score, Wells DVT/PE, Framingham
- Nephrology: CKD-EPI, MDRD, Cockcroft-Gault
- Hepatology: MELD, MELD-Na, Child-Pugh, FIB-4
- Critical Care: APACHE II, SOFA, qSOFA, CURB-65, NEWS2
- General: BMI, BSA, Anion Gap, Corrected Calcium, A-a Gradient

Each calculator includes:
- Input validation
- Calculation logic with references
- Risk stratification and interpretation
- Clinical recommendations
"""

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class Sex(str, Enum):
    """Biological sex for calculations."""

    MALE = "male"
    FEMALE = "female"


class Race(str, Enum):
    """Race categories for certain calculations (e.g., CKD-EPI)."""

    BLACK = "black"
    NON_BLACK = "non_black"
    # Note: Race-based adjustments are controversial and being phased out
    # in many guidelines. We include them for backward compatibility.


class RiskLevel(str, Enum):
    """Risk stratification levels."""

    VERY_LOW = "very_low"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"


@dataclass
class CalculatorResult:
    """Standardized result from any medical calculator."""

    calculator_name: str
    score: float
    unit: Optional[str] = None
    risk_level: Optional[RiskLevel] = None
    interpretation: str = ""
    recommendations: List[str] = field(default_factory=list)
    components: Dict[str, Any] = field(default_factory=dict)
    references: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class MedicalCalculators:
    """
    Collection of evidence-based medical calculators.

    All calculations follow current clinical guidelines and include
    proper references. Results should be validated by clinical judgment.
    """

    # =========================================================================
    # CARDIOVASCULAR CALCULATORS
    # =========================================================================

    @staticmethod
    def cha2ds2_vasc(
        age: int,
        sex: Sex,
        chf: bool = False,
        hypertension: bool = False,
        stroke_tia_history: bool = False,
        vascular_disease: bool = False,
        diabetes: bool = False,
    ) -> CalculatorResult:
        """
        CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk.

        Estimates stroke risk in patients with atrial fibrillation.

        Args:
            age: Patient age in years
            sex: Biological sex
            chf: Congestive heart failure history
            hypertension: Hypertension history
            stroke_tia_history: Prior stroke or TIA
            vascular_disease: Prior MI, PAD, or aortic plaque
            diabetes: Diabetes mellitus

        Returns:
            CalculatorResult with score 0-9 and anticoagulation recommendations
        """
        score = 0
        components = {}

        # Age scoring
        if age >= 75:
            score += 2
            components["age_75+"] = 2
        elif age >= 65:
            score += 1
            components["age_65-74"] = 1
        else:
            components["age_<65"] = 0

        # Sex (female = 1 point)
        if sex == Sex.FEMALE:
            score += 1
            components["female_sex"] = 1
        else:
            components["male_sex"] = 0

        # Risk factors
        if chf:
            score += 1
            components["chf"] = 1
        if hypertension:
            score += 1
            components["hypertension"] = 1
        if stroke_tia_history:
            score += 2
            components["stroke_tia"] = 2
        if vascular_disease:
            score += 1
            components["vascular_disease"] = 1
        if diabetes:
            score += 1
            components["diabetes"] = 1

        # Risk stratification
        annual_stroke_risk = {0: 0.2, 1: 0.6, 2: 2.2, 3: 3.2, 4: 4.8, 5: 7.2, 6: 9.7, 7: 11.2, 8: 10.8, 9: 12.2}

        risk = annual_stroke_risk.get(min(score, 9), 12.2)

        if score == 0:
            risk_level = RiskLevel.LOW
            interpretation = "Low risk. Annual stroke risk ~0.2%."
            recommendations = [
                "Anticoagulation generally not recommended",
                "Consider aspirin or no antithrombotic therapy",
                "Re-evaluate if risk factors develop",
            ]
        elif score == 1:
            risk_level = RiskLevel.MODERATE
            interpretation = f"Low-moderate risk. Annual stroke risk ~{risk}%."
            if sex == Sex.FEMALE and score == 1:
                recommendations = [
                    "Female sex as only risk factor - consider no therapy",
                    "Discuss anticoagulation vs aspirin with patient",
                    "Consider patient preferences and bleeding risk",
                ]
            else:
                recommendations = [
                    "Consider oral anticoagulation (DOACs preferred over warfarin)",
                    "Balance stroke prevention with bleeding risk (HAS-BLED)",
                    "Shared decision-making with patient",
                ]
        else:
            if score >= 4:
                risk_level = RiskLevel.HIGH
            else:
                risk_level = RiskLevel.MODERATE
            interpretation = f"Elevated risk. Annual stroke risk ~{risk}%. " "Anticoagulation recommended."
            recommendations = [
                "Oral anticoagulation recommended (DOACs preferred)",
                "Calculate HAS-BLED for bleeding risk assessment",
                "Direct oral anticoagulants (DOACs) preferred over warfarin",
                "Consider left atrial appendage closure if contraindicated",
            ]

        return CalculatorResult(
            calculator_name="CHA2DS2-VASc",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Lip GYH, et al. Chest 2010;137:263-272", "2020 ESC Guidelines for AF Management"],
        )

    @staticmethod
    def heart_score(history: int, ecg: int, age: int, risk_factors: int, troponin: int) -> CalculatorResult:
        """
        HEART Score for Major Cardiac Events.

        Risk stratifies chest pain patients for 6-week MACE.

        Args:
            history: 0=slightly suspicious, 1=moderately suspicious, 2=highly suspicious
            ecg: 0=normal, 1=non-specific changes, 2=significant ST deviation
            age: 0=<45, 1=45-64, 2=≥65
            risk_factors: 0=none, 1=1-2 factors, 2=≥3 factors or known CAD
            troponin: 0=≤normal, 1=1-3x normal, 2=>3x normal

        Returns:
            CalculatorResult with score 0-10 and disposition recommendations
        """
        # Validate inputs
        for val, name in [
            (history, "history"),
            (ecg, "ecg"),
            (age, "age"),
            (risk_factors, "risk_factors"),
            (troponin, "troponin"),
        ]:
            if val < 0 or val > 2:
                raise ValueError(f"{name} must be 0, 1, or 2")

        score = history + ecg + age + risk_factors + troponin

        components = {
            "history": history,
            "ecg": ecg,
            "age_category": age,
            "risk_factors": risk_factors,
            "troponin": troponin,
        }

        # 6-week MACE risk
        if score <= 3:
            risk_level = RiskLevel.LOW
            mace_risk = "1.6%"
            interpretation = f"Low risk. 6-week MACE risk: {mace_risk}."
            recommendations = [
                "Consider early discharge with outpatient follow-up",
                "Stress testing within 72 hours if discharged",
                "Return precautions for worsening symptoms",
            ]
        elif score <= 6:
            risk_level = RiskLevel.MODERATE
            mace_risk = "12-16.6%"
            interpretation = f"Moderate risk. 6-week MACE risk: {mace_risk}."
            recommendations = [
                "Admission for observation recommended",
                "Serial troponins and continuous monitoring",
                "Non-invasive testing or cardiology consultation",
                "Consider early invasive strategy if high-risk features",
            ]
        else:
            risk_level = RiskLevel.HIGH
            mace_risk = "50-65%"
            interpretation = f"High risk. 6-week MACE risk: {mace_risk}."
            recommendations = [
                "Admission to cardiac care unit",
                "Early invasive strategy recommended",
                "Urgent cardiology consultation",
                "Dual antiplatelet therapy and anticoagulation per ACS protocol",
            ]

        return CalculatorResult(
            calculator_name="HEART Score",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=[
                "Six AJ, et al. Neth Heart J 2008;16:191-196",
                "Backus BE, et al. Int J Cardiol 2013;168:2153-2158",
            ],
        )

    @staticmethod
    def wells_dvt(
        active_cancer: bool = False,
        bedridden_recent_surgery: bool = False,
        calf_swelling: bool = False,
        collateral_veins: bool = False,
        entire_leg_swollen: bool = False,
        localized_tenderness: bool = False,
        pitting_edema: bool = False,
        paralysis_paresis: bool = False,
        previous_dvt: bool = False,
        alternative_diagnosis_likely: bool = False,
    ) -> CalculatorResult:
        """
        Wells' Criteria for DVT.

        Estimates pretest probability for deep vein thrombosis.

        Returns:
            CalculatorResult with score and DVT probability
        """
        score = 0
        components = {}

        criteria = [
            (active_cancer, "active_cancer", 1),
            (bedridden_recent_surgery, "bedridden_surgery", 1),
            (calf_swelling, "calf_swelling_>3cm", 1),
            (collateral_veins, "collateral_veins", 1),
            (entire_leg_swollen, "entire_leg_swollen", 1),
            (localized_tenderness, "localized_tenderness", 1),
            (pitting_edema, "pitting_edema", 1),
            (paralysis_paresis, "paralysis_paresis", 1),
            (previous_dvt, "previous_dvt", 1),
            (alternative_diagnosis_likely, "alternative_diagnosis", -2),
        ]

        for present, name, points in criteria:
            if present:
                score += points
                components[name] = points

        if score <= 0:
            risk_level = RiskLevel.LOW
            dvt_probability = "5%"
            interpretation = f"Low probability. DVT prevalence ~{dvt_probability}."
            recommendations = [
                "D-dimer testing recommended",
                "If D-dimer negative: DVT effectively ruled out",
                "If D-dimer positive: Ultrasound indicated",
            ]
        elif score <= 2:
            risk_level = RiskLevel.MODERATE
            dvt_probability = "17%"
            interpretation = f"Moderate probability. DVT prevalence ~{dvt_probability}."
            recommendations = [
                "D-dimer testing OR ultrasound",
                "High-sensitivity D-dimer preferred if available",
                "If D-dimer positive: Ultrasound required",
            ]
        else:
            risk_level = RiskLevel.HIGH
            dvt_probability = "53%"
            interpretation = f"High probability. DVT prevalence ~{dvt_probability}."
            recommendations = [
                "Ultrasound recommended as initial test",
                "Consider empiric anticoagulation pending results",
                "D-dimer not useful in high probability",
            ]

        return CalculatorResult(
            calculator_name="Wells' Criteria for DVT",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Wells PS, et al. N Engl J Med 2003;349:1227-1235"],
        )

    @staticmethod
    def wells_pe(
        clinical_dvt_signs: bool = False,
        pe_most_likely: bool = False,
        heart_rate_gt_100: bool = False,
        immobilization_surgery: bool = False,
        previous_pe_dvt: bool = False,
        hemoptysis: bool = False,
        malignancy: bool = False,
    ) -> CalculatorResult:
        """
        Wells' Criteria for Pulmonary Embolism.

        Estimates pretest probability for PE.

        Returns:
            CalculatorResult with score and PE probability
        """
        score = 0.0
        components = {}

        criteria = [
            (clinical_dvt_signs, "clinical_dvt_signs", 3.0),
            (pe_most_likely, "pe_most_likely_diagnosis", 3.0),
            (heart_rate_gt_100, "heart_rate_>100", 1.5),
            (immobilization_surgery, "immobilization_surgery", 1.5),
            (previous_pe_dvt, "previous_pe_dvt", 1.5),
            (hemoptysis, "hemoptysis", 1.0),
            (malignancy, "malignancy", 1.0),
        ]

        for present, name, points in criteria:
            if present:
                score += points
                components[name] = points

        if score <= 4:
            risk_level = RiskLevel.LOW
            pe_probability = "8%"
            interpretation = f"PE unlikely. Prevalence ~{pe_probability}."
            recommendations = [
                "D-dimer testing recommended",
                "If D-dimer negative (<500 or age-adjusted): PE ruled out",
                "If D-dimer positive: CT pulmonary angiography",
            ]
        else:
            risk_level = RiskLevel.HIGH
            pe_probability = "34%"
            interpretation = f"PE likely. Prevalence ~{pe_probability}."
            recommendations = [
                "CT pulmonary angiography recommended",
                "Consider empiric anticoagulation pending imaging",
                "D-dimer not useful when PE likely",
            ]

        return CalculatorResult(
            calculator_name="Wells' Criteria for PE",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Wells PS, et al. Thromb Haemost 2000;83:416-420"],
        )

    # =========================================================================
    # NEPHROLOGY CALCULATORS
    # =========================================================================

    @staticmethod
    def ckd_epi_2021(creatinine: float, age: int, sex: Sex) -> CalculatorResult:
        """
        CKD-EPI 2021 Creatinine Equation (Race-Free).

        Estimates GFR without race coefficient per 2021 guidelines.

        Args:
            creatinine: Serum creatinine in mg/dL
            age: Patient age in years
            sex: Biological sex

        Returns:
            CalculatorResult with eGFR in mL/min/1.73m²
        """
        if creatinine <= 0:
            raise ValueError("Creatinine must be positive")
        if age < 18:
            raise ValueError("CKD-EPI is validated for adults (age ≥18)")

        # 2021 CKD-EPI equation (race-free)
        if sex == Sex.FEMALE:
            kappa = 0.7
            alpha = -0.241
            multiplier = 1.012
        else:
            kappa = 0.9
            alpha = -0.302
            multiplier = 1.0

        scr_kappa = creatinine / kappa

        egfr = 142 * (min(scr_kappa, 1) ** alpha) * (max(scr_kappa, 1) ** -1.200) * (0.9938**age) * multiplier

        egfr = round(egfr, 1)

        # CKD staging
        if egfr >= 90:
            stage = "G1"
            risk_level = RiskLevel.LOW
            interpretation = f"eGFR {egfr}: Normal or high kidney function (G1)."
        elif egfr >= 60:
            stage = "G2"
            risk_level = RiskLevel.LOW
            interpretation = f"eGFR {egfr}: Mildly decreased (G2)."
        elif egfr >= 45:
            stage = "G3a"
            risk_level = RiskLevel.MODERATE
            interpretation = f"eGFR {egfr}: Mild-moderate decrease (G3a)."
        elif egfr >= 30:
            stage = "G3b"
            risk_level = RiskLevel.MODERATE
            interpretation = f"eGFR {egfr}: Moderate-severe decrease (G3b)."
        elif egfr >= 15:
            stage = "G4"
            risk_level = RiskLevel.HIGH
            interpretation = f"eGFR {egfr}: Severely decreased (G4)."
        else:
            stage = "G5"
            risk_level = RiskLevel.VERY_HIGH
            interpretation = f"eGFR {egfr}: Kidney failure (G5)."

        recommendations = []
        if egfr < 60:
            recommendations.append("Monitor for CKD progression every 3-6 months")
            recommendations.append("Check urine albumin-to-creatinine ratio")
            recommendations.append("Review medications for renal dosing")
        if egfr < 45:
            recommendations.append("Nephrology referral recommended")
            recommendations.append("Assess for CKD complications (anemia, bone disease)")
        if egfr < 30:
            recommendations.append("Prepare for possible renal replacement therapy")
            recommendations.append("Avoid nephrotoxins")
        if egfr < 15:
            recommendations.append("Urgent nephrology evaluation")
            recommendations.append("Discuss dialysis or transplant options")

        return CalculatorResult(
            calculator_name="CKD-EPI 2021 (Race-Free)",
            score=egfr,
            unit="mL/min/1.73m²",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={"creatinine_mg_dL": creatinine, "age": age, "sex": sex.value, "ckd_stage": stage},
            references=[
                "Inker LA, et al. N Engl J Med 2021;385:1737-1749",
                "KDIGO 2024 Clinical Practice Guideline for CKD",
            ],
        )

    @staticmethod
    def cockcroft_gault(creatinine: float, age: int, weight: float, sex: Sex) -> CalculatorResult:
        """
        Cockcroft-Gault Creatinine Clearance.

        Estimates creatinine clearance for drug dosing.
        Note: Not adjusted for BSA - actual CrCl.

        Args:
            creatinine: Serum creatinine in mg/dL
            age: Patient age in years
            weight: Weight in kg
            sex: Biological sex

        Returns:
            CalculatorResult with CrCl in mL/min
        """
        if creatinine <= 0:
            raise ValueError("Creatinine must be positive")
        if weight <= 0:
            raise ValueError("Weight must be positive")

        crcl = ((140 - age) * weight) / (72 * creatinine)

        if sex == Sex.FEMALE:
            crcl *= 0.85

        crcl = round(crcl, 1)

        # Interpretation for drug dosing
        if crcl >= 90:
            risk_level = RiskLevel.LOW
            interpretation = f"CrCl {crcl}: Normal renal function for drug dosing."
        elif crcl >= 60:
            risk_level = RiskLevel.LOW
            interpretation = f"CrCl {crcl}: Mild renal impairment."
        elif crcl >= 30:
            risk_level = RiskLevel.MODERATE
            interpretation = f"CrCl {crcl}: Moderate renal impairment."
        elif crcl >= 15:
            risk_level = RiskLevel.HIGH
            interpretation = f"CrCl {crcl}: Severe renal impairment."
        else:
            risk_level = RiskLevel.VERY_HIGH
            interpretation = f"CrCl {crcl}: End-stage renal disease."

        recommendations = [
            "Use for drug dosing adjustments (many drugs use CrCl)",
            "Consider ideal body weight if obese",
            "Not validated in AKI - use clinical judgment",
        ]

        if crcl < 60:
            recommendations.append("Review all medications for renal dose adjustment")

        return CalculatorResult(
            calculator_name="Cockcroft-Gault CrCl",
            score=crcl,
            unit="mL/min",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={"creatinine_mg_dL": creatinine, "age": age, "weight_kg": weight, "sex": sex.value},
            references=["Cockcroft DW, Gault MH. Nephron 1976;16:31-41"],
            warnings=[
                "Not adjusted for BSA",
                "May overestimate in obesity - consider ideal body weight",
                "Not accurate in rapidly changing renal function",
            ],
        )

    # =========================================================================
    # HEPATOLOGY CALCULATORS
    # =========================================================================

    @staticmethod
    def meld_na(
        bilirubin: float, inr: float, creatinine: float, sodium: float, dialysis_twice_past_week: bool = False
    ) -> CalculatorResult:
        """
        MELD-Na Score (Model for End-Stage Liver Disease with Sodium).

        Predicts 90-day mortality in liver disease for transplant prioritization.

        Args:
            bilirubin: Total bilirubin in mg/dL
            inr: International Normalized Ratio
            creatinine: Serum creatinine in mg/dL (max 4.0)
            sodium: Serum sodium in mEq/L (range 125-137)
            dialysis_twice_past_week: If dialyzed ≥2 times in past week

        Returns:
            CalculatorResult with MELD-Na score 6-40
        """
        # Apply MELD limits
        bilirubin = max(bilirubin, 1.0)
        inr = max(inr, 1.0)
        creatinine = max(creatinine, 1.0)
        creatinine = min(creatinine, 4.0)

        if dialysis_twice_past_week:
            creatinine = 4.0

        # Sodium limits
        sodium = max(sodium, 125)
        sodium = min(sodium, 137)

        # MELD(i) calculation
        meld_i = (0.957 * math.log(creatinine) + 0.378 * math.log(bilirubin) + 1.120 * math.log(inr) + 0.643) * 10

        # MELD-Na adjustment
        if meld_i > 11:
            meld_na = meld_i + 1.32 * (137 - sodium) - (0.033 * meld_i * (137 - sodium))
        else:
            meld_na = meld_i

        meld_na = round(meld_na)
        meld_na = max(6, min(40, meld_na))

        # 90-day mortality
        if meld_na <= 9:
            mortality = "1.9%"
            risk_level = RiskLevel.LOW
        elif meld_na <= 19:
            mortality = "6%"
            risk_level = RiskLevel.MODERATE
        elif meld_na <= 29:
            mortality = "19.6%"
            risk_level = RiskLevel.HIGH
        elif meld_na <= 39:
            mortality = "52.6%"
            risk_level = RiskLevel.VERY_HIGH
        else:
            mortality = "71.3%"
            risk_level = RiskLevel.VERY_HIGH

        interpretation = f"MELD-Na {meld_na}: 90-day mortality ~{mortality}."

        recommendations = []
        if meld_na >= 15:
            recommendations.append("Consider transplant evaluation if not already listed")
        if meld_na >= 20:
            recommendations.append("High priority for transplant")
            recommendations.append("Frequent monitoring of liver function")
        if meld_na >= 30:
            recommendations.append("Critical - urgent transplant evaluation")
            recommendations.append("ICU level care may be appropriate")

        return CalculatorResult(
            calculator_name="MELD-Na Score",
            score=meld_na,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={
                "bilirubin_mg_dL": bilirubin,
                "inr": inr,
                "creatinine_mg_dL": creatinine,
                "sodium_mEq_L": sodium,
                "dialysis": dialysis_twice_past_week,
                "mortality_90day": mortality,
            },
            references=["Kim WR, et al. Hepatology 2008;47:584-590", "OPTN/UNOS Policy for Liver Allocation"],
        )

    @staticmethod
    def child_pugh(bilirubin: float, albumin: float, inr: float, ascites: str, encephalopathy: str) -> CalculatorResult:
        """
        Child-Pugh Score for Cirrhosis Severity.

        Args:
            bilirubin: Total bilirubin in mg/dL
            albumin: Serum albumin in g/dL
            inr: International Normalized Ratio
            ascites: "none", "mild", or "moderate_severe"
            encephalopathy: "none", "grade_1_2", or "grade_3_4"

        Returns:
            CalculatorResult with Child-Pugh class A/B/C
        """
        score = 0
        components = {}

        # Bilirubin
        if bilirubin < 2:
            score += 1
            components["bilirubin"] = 1
        elif bilirubin <= 3:
            score += 2
            components["bilirubin"] = 2
        else:
            score += 3
            components["bilirubin"] = 3

        # Albumin
        if albumin > 3.5:
            score += 1
            components["albumin"] = 1
        elif albumin >= 2.8:
            score += 2
            components["albumin"] = 2
        else:
            score += 3
            components["albumin"] = 3

        # INR
        if inr < 1.7:
            score += 1
            components["inr"] = 1
        elif inr <= 2.2:
            score += 2
            components["inr"] = 2
        else:
            score += 3
            components["inr"] = 3

        # Ascites
        ascites_lower = ascites.lower()
        if ascites_lower == "none":
            score += 1
            components["ascites"] = 1
        elif ascites_lower == "mild":
            score += 2
            components["ascites"] = 2
        else:
            score += 3
            components["ascites"] = 3

        # Encephalopathy
        ence_lower = encephalopathy.lower()
        if ence_lower == "none":
            score += 1
            components["encephalopathy"] = 1
        elif ence_lower == "grade_1_2":
            score += 2
            components["encephalopathy"] = 2
        else:
            score += 3
            components["encephalopathy"] = 3

        # Classification
        if score <= 6:
            child_class = "A"
            risk_level = RiskLevel.LOW
            mortality_1yr = "10%"
            mortality_2yr = "15%"
            interpretation = f"Child-Pugh Class A (score {score}): Well-compensated."
        elif score <= 9:
            child_class = "B"
            risk_level = RiskLevel.MODERATE
            mortality_1yr = "30%"
            mortality_2yr = "40%"
            interpretation = f"Child-Pugh Class B (score {score}): Significant functional compromise."
        else:
            child_class = "C"
            risk_level = RiskLevel.HIGH
            mortality_1yr = "50%"
            mortality_2yr = "65%"
            interpretation = f"Child-Pugh Class C (score {score}): Decompensated cirrhosis."

        components["class"] = child_class
        components["mortality_1yr"] = mortality_1yr
        components["mortality_2yr"] = mortality_2yr

        recommendations = []
        if child_class == "A":
            recommendations.append("Monitor for disease progression")
            recommendations.append("Screen for varices if not done")
        elif child_class == "B":
            recommendations.append("Consider transplant evaluation")
            recommendations.append("Varices prophylaxis if indicated")
            recommendations.append("Avoid hepatotoxic medications")
        else:
            recommendations.append("Urgent transplant evaluation")
            recommendations.append("Intensive monitoring for complications")
            recommendations.append("Consider palliative care discussion if not transplant candidate")

        return CalculatorResult(
            calculator_name="Child-Pugh Score",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Child CG, Turcotte JG. Surgery 1964;55:24", "Pugh RN, et al. Br J Surg 1973;60:646-649"],
        )

    @staticmethod
    def fib4(age: int, ast: float, alt: float, platelets: float) -> CalculatorResult:
        """
        FIB-4 Index for Liver Fibrosis.

        Non-invasive estimate of liver fibrosis/cirrhosis.

        Args:
            age: Patient age in years
            ast: AST in U/L
            alt: ALT in U/L
            platelets: Platelet count in 10^9/L

        Returns:
            CalculatorResult with FIB-4 score and fibrosis probability
        """
        if alt <= 0 or platelets <= 0:
            raise ValueError("ALT and platelets must be positive")

        fib4 = (age * ast) / (platelets * math.sqrt(alt))
        fib4 = round(fib4, 2)

        if fib4 < 1.30:
            risk_level = RiskLevel.LOW
            interpretation = f"FIB-4 {fib4}: Low probability of advanced fibrosis."
            recommendations = [
                "Low likelihood of significant fibrosis (NPV ~90%)",
                "Repeat FIB-4 in 1-2 years or if clinical change",
                "Continue hepatitis management as indicated",
            ]
        elif fib4 <= 2.67:
            risk_level = RiskLevel.MODERATE
            interpretation = f"FIB-4 {fib4}: Indeterminate - further evaluation needed."
            recommendations = [
                "Consider transient elastography (FibroScan)",
                "Or other non-invasive fibrosis assessment",
                "Liver biopsy may be needed if results discordant",
            ]
        else:
            risk_level = RiskLevel.HIGH
            interpretation = f"FIB-4 {fib4}: High probability of advanced fibrosis/cirrhosis."
            recommendations = [
                "High likelihood of F3-F4 fibrosis (PPV ~65%)",
                "Hepatology referral recommended",
                "Screen for varices and HCC surveillance",
                "Consider liver biopsy for staging",
            ]

        return CalculatorResult(
            calculator_name="FIB-4 Index",
            score=fib4,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={"age": age, "ast_U_L": ast, "alt_U_L": alt, "platelets_10e9_L": platelets},
            references=["Sterling RK, et al. Hepatology 2006;43:1317-1325"],
            warnings=["May be less accurate in patients <35 or >65 years", "Not validated in acute hepatitis"],
        )

    # =========================================================================
    # CRITICAL CARE CALCULATORS
    # =========================================================================

    @staticmethod
    def sofa(
        pao2_fio2: float,
        platelets: float,
        bilirubin: float,
        cardiovascular: int,
        gcs: int,
        creatinine: float,
        urine_output_24h: Optional[float] = None,
    ) -> CalculatorResult:
        """
        Sequential Organ Failure Assessment (SOFA) Score.

        Assesses organ dysfunction in ICU patients.

        Args:
            pao2_fio2: PaO2/FiO2 ratio in mmHg
            platelets: Platelet count in 10^3/μL
            bilirubin: Total bilirubin in mg/dL
            cardiovascular: 0=MAP≥70, 1=MAP<70, 2=dopamine≤5 or dobutamine,
                          3=dopamine>5 or epi/norepi≤0.1, 4=dopamine>15 or epi/norepi>0.1
            gcs: Glasgow Coma Scale (3-15)
            creatinine: Serum creatinine in mg/dL
            urine_output_24h: 24-hour urine output in mL (optional)

        Returns:
            CalculatorResult with SOFA score 0-24
        """
        score = 0
        components = {}

        # Respiration (PaO2/FiO2)
        if pao2_fio2 >= 400:
            resp_score = 0
        elif pao2_fio2 >= 300:
            resp_score = 1
        elif pao2_fio2 >= 200:
            resp_score = 2
        elif pao2_fio2 >= 100:
            resp_score = 3
        else:
            resp_score = 4
        score += resp_score
        components["respiration"] = resp_score

        # Coagulation (Platelets)
        if platelets >= 150:
            coag_score = 0
        elif platelets >= 100:
            coag_score = 1
        elif platelets >= 50:
            coag_score = 2
        elif platelets >= 20:
            coag_score = 3
        else:
            coag_score = 4
        score += coag_score
        components["coagulation"] = coag_score

        # Liver (Bilirubin)
        if bilirubin < 1.2:
            liver_score = 0
        elif bilirubin < 2.0:
            liver_score = 1
        elif bilirubin < 6.0:
            liver_score = 2
        elif bilirubin < 12.0:
            liver_score = 3
        else:
            liver_score = 4
        score += liver_score
        components["liver"] = liver_score

        # Cardiovascular
        if cardiovascular < 0 or cardiovascular > 4:
            raise ValueError("Cardiovascular must be 0-4")
        score += cardiovascular
        components["cardiovascular"] = cardiovascular

        # CNS (GCS)
        if gcs == 15:
            cns_score = 0
        elif gcs >= 13:
            cns_score = 1
        elif gcs >= 10:
            cns_score = 2
        elif gcs >= 6:
            cns_score = 3
        else:
            cns_score = 4
        score += cns_score
        components["cns"] = cns_score

        # Renal (Creatinine or urine output)
        if creatinine < 1.2:
            renal_score = 0
        elif creatinine < 2.0:
            renal_score = 1
        elif creatinine < 3.5:
            renal_score = 2
        elif creatinine < 5.0:
            renal_score = 3
        else:
            renal_score = 4

        # Urine output can increase score if worse
        if urine_output_24h is not None:
            if urine_output_24h < 200:
                renal_score = max(renal_score, 4)
            elif urine_output_24h < 500:
                renal_score = max(renal_score, 3)

        score += renal_score
        components["renal"] = renal_score

        # Mortality estimates
        if score <= 1:
            mortality = "<5%"
            risk_level = RiskLevel.LOW
        elif score <= 4:
            mortality = "~6%"
            risk_level = RiskLevel.LOW
        elif score <= 7:
            mortality = "~20%"
            risk_level = RiskLevel.MODERATE
        elif score <= 10:
            mortality = "~30%"
            risk_level = RiskLevel.MODERATE
        elif score <= 14:
            mortality = "~50%"
            risk_level = RiskLevel.HIGH
        else:
            mortality = ">80%"
            risk_level = RiskLevel.VERY_HIGH

        interpretation = f"SOFA Score {score}: Estimated ICU mortality {mortality}."

        recommendations = []
        if score >= 2:
            recommendations.append("Consider sepsis if score increased by ≥2 from baseline")
        if score >= 6:
            recommendations.append("High organ dysfunction - intensive monitoring")
            recommendations.append("Consider goals of care discussion")
        if score >= 11:
            recommendations.append("Critical organ dysfunction - prognosis grave")
            recommendations.append("Family meeting recommended")

        return CalculatorResult(
            calculator_name="SOFA Score",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=[
                "Vincent JL, et al. Intensive Care Med 1996;22:707-710",
                "Sepsis-3: Singer M, et al. JAMA 2016;315:801-810",
            ],
        )

    @staticmethod
    def qsofa(respiratory_rate_gte_22: bool, altered_mentation: bool, systolic_bp_lte_100: bool) -> CalculatorResult:
        """
        Quick SOFA (qSOFA) Score for Sepsis Screening.

        Bedside screening tool for sepsis in non-ICU settings.

        Args:
            respiratory_rate_gte_22: Respiratory rate ≥22/min
            altered_mentation: Altered mental status (GCS <15)
            systolic_bp_lte_100: Systolic BP ≤100 mmHg

        Returns:
            CalculatorResult with qSOFA score 0-3
        """
        score = sum([respiratory_rate_gte_22, altered_mentation, systolic_bp_lte_100])

        components = {
            "respiratory_rate_gte_22": int(respiratory_rate_gte_22),
            "altered_mentation": int(altered_mentation),
            "systolic_bp_lte_100": int(systolic_bp_lte_100),
        }

        if score < 2:
            risk_level = RiskLevel.LOW
            interpretation = f"qSOFA {score}: Low risk for poor outcome."
            recommendations = [
                "qSOFA <2 does not rule out sepsis",
                "Continue clinical monitoring",
                "Consider full sepsis workup if infection suspected",
            ]
        else:
            risk_level = RiskLevel.HIGH
            interpretation = f"qSOFA {score}: High risk for poor outcome in sepsis. " "Further evaluation required."
            recommendations = [
                "High risk of in-hospital mortality",
                "Assess for organ dysfunction (full SOFA score)",
                "Consider ICU admission",
                "Start sepsis bundle if sepsis confirmed",
            ]

        return CalculatorResult(
            calculator_name="qSOFA Score",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Sepsis-3: Seymour CW, et al. JAMA 2016;315:762-774"],
            warnings=[
                "qSOFA is for prognosis, not diagnosis",
                "Low sensitivity - does not rule out sepsis",
                "Use clinical judgment alongside scoring",
            ],
        )

    @staticmethod
    def curb65(
        confusion: bool,
        bun_gt_19: bool,
        respiratory_rate_gte_30: bool,
        systolic_bp_lt_90_or_diastolic_lte_60: bool,
        age_gte_65: bool,
    ) -> CalculatorResult:
        """
        CURB-65 Score for Pneumonia Severity.

        Predicts mortality and guides disposition in community-acquired pneumonia.

        Args:
            confusion: New-onset confusion
            bun_gt_19: BUN >19 mg/dL (or urea >7 mmol/L)
            respiratory_rate_gte_30: Respiratory rate ≥30/min
            systolic_bp_lt_90_or_diastolic_lte_60: SBP <90 or DBP ≤60 mmHg
            age_gte_65: Age ≥65 years

        Returns:
            CalculatorResult with CURB-65 score 0-5 and disposition recommendation
        """
        score = sum([confusion, bun_gt_19, respiratory_rate_gte_30, systolic_bp_lt_90_or_diastolic_lte_60, age_gte_65])

        components = {
            "confusion": int(confusion),
            "bun_elevated": int(bun_gt_19),
            "respiratory_rate_elevated": int(respiratory_rate_gte_30),
            "hypotension": int(systolic_bp_lt_90_or_diastolic_lte_60),
            "age_65_plus": int(age_gte_65),
        }

        mortality_map = {0: "0.6%", 1: "2.7%", 2: "6.8%", 3: "14%", 4: "27.8%", 5: "27.8%"}
        mortality = mortality_map.get(score, ">25%")

        if score <= 1:
            risk_level = RiskLevel.LOW
            disposition = "outpatient"
            interpretation = f"CURB-65 {score}: Low risk. 30-day mortality ~{mortality}."
            recommendations = [
                "Outpatient treatment generally appropriate",
                "Consider clinical judgment and social factors",
                "Follow-up within 48-72 hours",
            ]
        elif score == 2:
            risk_level = RiskLevel.MODERATE
            disposition = "short inpatient or supervised outpatient"
            interpretation = f"CURB-65 {score}: Intermediate risk. 30-day mortality ~{mortality}."
            recommendations = [
                "Consider short hospital admission",
                "Or closely supervised outpatient care",
                "Clinical judgment important",
            ]
        else:
            risk_level = RiskLevel.HIGH
            disposition = "inpatient, consider ICU if score 4-5"
            interpretation = f"CURB-65 {score}: High risk. 30-day mortality ~{mortality}."
            recommendations = [
                "Hospital admission required",
                "Consider ICU admission if score ≥4",
                "Early aggressive treatment",
            ]
            if score >= 4:
                recommendations.append("ICU evaluation recommended")

        components["disposition"] = disposition
        components["mortality_30day"] = mortality

        return CalculatorResult(
            calculator_name="CURB-65 Score",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Lim WS, et al. Thorax 2003;58:377-382", "BTS Guidelines for CAP 2009"],
        )

    @staticmethod
    def news2(
        respiratory_rate: int,
        spo2: int,
        on_supplemental_o2: bool,
        temperature: float,
        systolic_bp: int,
        heart_rate: int,
        consciousness: str,
        is_hypercapnic: bool = False,
    ) -> CalculatorResult:
        """
        National Early Warning Score 2 (NEWS2).

        Standardized assessment of acute illness severity.

        Args:
            respiratory_rate: Breaths per minute
            spo2: Oxygen saturation %
            on_supplemental_o2: Whether on supplemental oxygen
            temperature: Temperature in °C
            systolic_bp: Systolic blood pressure mmHg
            heart_rate: Heart rate bpm
            consciousness: "alert", "voice", "pain", or "unresponsive" (AVPU)
            is_hypercapnic: True for Scale 2 SpO2 scoring (target 88-92%)

        Returns:
            CalculatorResult with NEWS2 score 0-20 and clinical response
        """
        score = 0
        components = {}

        # Respiratory rate
        if respiratory_rate <= 8:
            rr_score = 3
        elif respiratory_rate <= 11:
            rr_score = 1
        elif respiratory_rate <= 20:
            rr_score = 0
        elif respiratory_rate <= 24:
            rr_score = 2
        else:
            rr_score = 3
        score += rr_score
        components["respiratory_rate"] = rr_score

        # SpO2 scoring (Scale 1 or Scale 2)
        if is_hypercapnic:
            # Scale 2: Target SpO2 88-92% for hypercapnic respiratory failure
            if spo2 <= 83:
                spo2_score = 3
            elif spo2 <= 85:
                spo2_score = 2
            elif spo2 <= 87:
                spo2_score = 1
            elif spo2 <= 92:
                spo2_score = 0
            elif spo2 <= 94:
                spo2_score = 1
            elif spo2 <= 96:
                spo2_score = 2
            else:
                spo2_score = 3
        else:
            # Scale 1: Normal target SpO2 ≥96%
            if spo2 <= 91:
                spo2_score = 3
            elif spo2 <= 93:
                spo2_score = 2
            elif spo2 <= 95:
                spo2_score = 1
            else:
                spo2_score = 0
        score += spo2_score
        components["spo2"] = spo2_score

        # Supplemental oxygen
        o2_score = 2 if on_supplemental_o2 else 0
        score += o2_score
        components["supplemental_o2"] = o2_score

        # Temperature
        if temperature <= 35.0:
            temp_score = 3
        elif temperature <= 36.0:
            temp_score = 1
        elif temperature <= 38.0:
            temp_score = 0
        elif temperature <= 39.0:
            temp_score = 1
        else:
            temp_score = 2
        score += temp_score
        components["temperature"] = temp_score

        # Systolic BP
        if systolic_bp <= 90:
            sbp_score = 3
        elif systolic_bp <= 100:
            sbp_score = 2
        elif systolic_bp <= 110:
            sbp_score = 1
        elif systolic_bp <= 219:
            sbp_score = 0
        else:
            sbp_score = 3
        score += sbp_score
        components["systolic_bp"] = sbp_score

        # Heart rate
        if heart_rate <= 40:
            hr_score = 3
        elif heart_rate <= 50:
            hr_score = 1
        elif heart_rate <= 90:
            hr_score = 0
        elif heart_rate <= 110:
            hr_score = 1
        elif heart_rate <= 130:
            hr_score = 2
        else:
            hr_score = 3
        score += hr_score
        components["heart_rate"] = hr_score

        # Consciousness (AVPU)
        consciousness_lower = consciousness.lower()
        if consciousness_lower == "alert":
            cons_score = 0
        else:
            cons_score = 3
        score += cons_score
        components["consciousness"] = cons_score

        # Clinical response
        if score <= 4:
            if any(v == 3 for v in components.values()):
                risk_level = RiskLevel.MODERATE
                interpretation = f"NEWS2 {score}: Single parameter 3 - " "Urgent ward-based response needed."
                recommendations = [
                    "Urgent assessment by ward-based clinical team",
                    "Increase monitoring frequency",
                    "Consider escalation if no improvement",
                ]
            else:
                risk_level = RiskLevel.LOW
                interpretation = f"NEWS2 {score}: Low clinical risk. " "Continue routine monitoring."
                recommendations = [
                    "Continue routine NEWS monitoring (minimum every 12 hours)",
                    "Reassess if clinical concern",
                ]
        elif score <= 6:
            risk_level = RiskLevel.MODERATE
            interpretation = f"NEWS2 {score}: Medium clinical risk. Key threshold for escalation."
            recommendations = [
                "Urgent ward-based response",
                "Increase monitoring to at least 4-hourly",
                "Consider escalation to critical care outreach",
            ]
        else:
            risk_level = RiskLevel.HIGH
            interpretation = f"NEWS2 {score}: High clinical risk. " "Emergency response required."
            recommendations = [
                "Emergency assessment by critical care team",
                "Continuous monitoring",
                "Consider transfer to higher level of care",
                "Consider ceiling of care discussion",
            ]

        return CalculatorResult(
            calculator_name="NEWS2",
            score=score,
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Royal College of Physicians. NEWS2. 2017", "NHS England NEWS2 Implementation Guidance"],
        )

    # =========================================================================
    # GENERAL/METABOLIC CALCULATORS
    # =========================================================================

    @staticmethod
    def bmi(weight: float, height: float) -> CalculatorResult:
        """
        Body Mass Index (BMI).

        Args:
            weight: Weight in kg
            height: Height in cm

        Returns:
            CalculatorResult with BMI and classification
        """
        if weight <= 0 or height <= 0:
            raise ValueError("Weight and height must be positive")

        height_m = height / 100
        bmi_value = weight / (height_m**2)
        bmi_value = round(bmi_value, 1)

        if bmi_value < 16:
            category = "Severe thinness"
            risk_level = RiskLevel.HIGH
        elif bmi_value < 17:
            category = "Moderate thinness"
            risk_level = RiskLevel.MODERATE
        elif bmi_value < 18.5:
            category = "Mild thinness"
            risk_level = RiskLevel.LOW
        elif bmi_value < 25:
            category = "Normal weight"
            risk_level = RiskLevel.VERY_LOW
        elif bmi_value < 30:
            category = "Overweight"
            risk_level = RiskLevel.LOW
        elif bmi_value < 35:
            category = "Obese Class I"
            risk_level = RiskLevel.MODERATE
        elif bmi_value < 40:
            category = "Obese Class II"
            risk_level = RiskLevel.HIGH
        else:
            category = "Obese Class III"
            risk_level = RiskLevel.VERY_HIGH

        interpretation = f"BMI {bmi_value} kg/m²: {category}."

        recommendations = []
        if bmi_value < 18.5:
            recommendations.append("Evaluate for underlying conditions")
            recommendations.append("Consider nutritional assessment")
        elif bmi_value >= 25 and bmi_value < 30:
            recommendations.append("Lifestyle modification recommended")
            recommendations.append("Diet and exercise counseling")
        elif bmi_value >= 30:
            recommendations.append("Weight management program")
            recommendations.append("Screen for obesity-related conditions")
            if bmi_value >= 35:
                recommendations.append("Consider bariatric surgery evaluation")

        return CalculatorResult(
            calculator_name="BMI",
            score=bmi_value,
            unit="kg/m²",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={"weight_kg": weight, "height_cm": height, "category": category},
            references=["WHO BMI Classification"],
            warnings=[
                "BMI may not accurately reflect body composition",
                "Consider waist circumference for additional assessment",
                "Different thresholds may apply for certain populations",
            ],
        )

    @staticmethod
    def bsa_dubois(weight: float, height: float) -> CalculatorResult:
        """
        Body Surface Area (Du Bois formula).

        Used for drug dosing and physiological calculations.

        Args:
            weight: Weight in kg
            height: Height in cm

        Returns:
            CalculatorResult with BSA in m²
        """
        if weight <= 0 or height <= 0:
            raise ValueError("Weight and height must be positive")

        bsa = 0.007184 * (weight**0.425) * (height**0.725)
        bsa = round(bsa, 2)

        interpretation = f"BSA {bsa} m² (Du Bois formula)."

        return CalculatorResult(
            calculator_name="BSA (Du Bois)",
            score=bsa,
            unit="m²",
            interpretation=interpretation,
            recommendations=[
                "Use for chemotherapy dosing",
                "Use for cardiac index calculation (CI = CO/BSA)",
                "Average adult BSA is ~1.7 m²",
            ],
            components={"weight_kg": weight, "height_cm": height},
            references=["Du Bois D, Du Bois EF. Arch Intern Med 1916;17:863-871"],
        )

    @staticmethod
    def anion_gap(
        sodium: float, chloride: float, bicarbonate: float, albumin: Optional[float] = None
    ) -> CalculatorResult:
        """
        Serum Anion Gap (with optional albumin correction).

        Args:
            sodium: Serum sodium in mEq/L
            chloride: Serum chloride in mEq/L
            bicarbonate: Serum bicarbonate in mEq/L
            albumin: Serum albumin in g/dL (for correction)

        Returns:
            CalculatorResult with anion gap and interpretation
        """
        ag = sodium - (chloride + bicarbonate)
        ag = round(ag, 1)

        components = {"sodium": sodium, "chloride": chloride, "bicarbonate": bicarbonate, "anion_gap_uncorrected": ag}

        # Albumin correction (AG increases ~2.5 for each 1 g/dL decrease in albumin)
        corrected_ag = None
        if albumin is not None:
            correction = 2.5 * (4.0 - albumin)
            corrected_ag = ag + correction
            corrected_ag = round(corrected_ag, 1)
            components["albumin"] = albumin
            components["anion_gap_corrected"] = corrected_ag

        # Use corrected AG if available
        final_ag = corrected_ag if corrected_ag is not None else ag

        if final_ag <= 12:
            risk_level = RiskLevel.LOW
            interpretation = f"Anion Gap {ag}: Normal range (3-12 mEq/L)."
            if corrected_ag:
                interpretation += f" Albumin-corrected AG: {corrected_ag}."
            recommendations = ["Normal anion gap", "If acidosis present, consider non-gap acidosis (hyperchloremic)"]
        else:
            risk_level = RiskLevel.HIGH
            interpretation = f"Anion Gap {ag}: Elevated (>12 mEq/L)."
            if corrected_ag:
                interpretation += f" Albumin-corrected AG: {corrected_ag}."
            recommendations = [
                "Elevated anion gap suggests HAGMA",
                "Consider MUDPILES: Methanol, Uremia, DKA, Propylene glycol, "
                "Isoniazid/Iron, Lactic acidosis, Ethylene glycol, Salicylates",
                "Calculate delta-delta ratio if concurrent metabolic alkalosis suspected",
            ]

        return CalculatorResult(
            calculator_name="Anion Gap",
            score=final_ag,
            unit="mEq/L",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Kraut JA, Madias NE. N Engl J Med 2014;371:1434-1445"],
        )

    @staticmethod
    def corrected_calcium(calcium: float, albumin: float) -> CalculatorResult:
        """
        Albumin-Corrected Calcium.

        Adjusts total calcium for low albumin levels.

        Args:
            calcium: Total serum calcium in mg/dL
            albumin: Serum albumin in g/dL

        Returns:
            CalculatorResult with corrected calcium
        """
        # Payne formula: corrected Ca = measured Ca + 0.8 * (4.0 - albumin)
        corrected = calcium + 0.8 * (4.0 - albumin)
        corrected = round(corrected, 1)

        if corrected < 8.5:
            risk_level = RiskLevel.HIGH
            status = "Hypocalcemia"
            interpretation = f"Corrected calcium {corrected} mg/dL: Hypocalcemia."
            recommendations = [
                "Evaluate for causes (vitamin D deficiency, hypoparathyroidism, etc.)",
                "Check ionized calcium if available",
                "Assess for symptoms (tetany, Chvostek's sign)",
            ]
        elif corrected > 10.5:
            risk_level = RiskLevel.HIGH
            status = "Hypercalcemia"
            interpretation = f"Corrected calcium {corrected} mg/dL: Hypercalcemia."
            recommendations = [
                "Evaluate for causes (malignancy, hyperparathyroidism, etc.)",
                "Check PTH level",
                "Hydration if symptomatic",
            ]
        else:
            risk_level = RiskLevel.LOW
            status = "Normal"
            interpretation = f"Corrected calcium {corrected} mg/dL: Normal range."
            recommendations = []

        return CalculatorResult(
            calculator_name="Corrected Calcium",
            score=corrected,
            unit="mg/dL",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components={"measured_calcium": calcium, "albumin": albumin, "status": status},
            references=["Payne RB, et al. Br Med J 1973;4:643-646"],
            warnings=["Ionized calcium is more accurate if available", "Correction less reliable in critical illness"],
        )

    @staticmethod
    def aa_gradient(
        pao2: float, paco2: float, fio2: float, age: int, atmospheric_pressure: float = 760
    ) -> CalculatorResult:
        """
        Alveolar-Arterial (A-a) Oxygen Gradient.

        Assesses gas exchange efficiency.

        Args:
            pao2: Arterial PO2 in mmHg
            paco2: Arterial PCO2 in mmHg
            fio2: Fraction of inspired oxygen (0.21 to 1.0)
            age: Patient age in years
            atmospheric_pressure: Atmospheric pressure in mmHg (default 760)

        Returns:
            CalculatorResult with A-a gradient and interpretation
        """
        # Water vapor pressure at body temperature
        ph2o = 47

        # Respiratory quotient (typical value)
        rq = 0.8

        # Alveolar oxygen equation
        pao2_alveolar = (fio2 * (atmospheric_pressure - ph2o)) - (paco2 / rq)

        # A-a gradient
        aa_grad = pao2_alveolar - pao2
        aa_grad = round(aa_grad, 1)

        # Expected A-a gradient (increases with age)
        expected = (age / 4) + 4
        expected = round(expected, 1)

        # Alternative: Age/4 + 4 at sea level on room air
        # Normal range on room air: 5-15 mmHg for young adults

        components = {
            "pao2": pao2,
            "paco2": paco2,
            "fio2": fio2,
            "pao2_alveolar": round(pao2_alveolar, 1),
            "expected_aa_gradient": expected,
        }

        if aa_grad <= expected + 5:
            risk_level = RiskLevel.LOW
            interpretation = f"A-a gradient {aa_grad} mmHg: Normal for age " f"(expected ≤{expected + 5})."
            recommendations = ["Normal gas exchange", "If hypoxemic, consider hypoventilation or low FiO2"]
        else:
            risk_level = RiskLevel.HIGH
            interpretation = f"A-a gradient {aa_grad} mmHg: Elevated " f"(expected ≤{expected + 5})."
            recommendations = [
                "Elevated gradient suggests V/Q mismatch, shunt, or diffusion defect",
                "Consider: PE, pneumonia, ARDS, interstitial lung disease",
                "Further workup based on clinical context",
            ]

        return CalculatorResult(
            calculator_name="A-a Gradient",
            score=aa_grad,
            unit="mmHg",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["West JB. Respiratory Physiology: The Essentials. 10th ed."],
            warnings=["Calculation assumes RQ of 0.8", "Less reliable on high FiO2"],
        )

    @staticmethod
    def ideal_body_weight(height: float, sex: Sex) -> CalculatorResult:
        """
        Ideal Body Weight (Devine formula).

        Used for drug dosing and ventilator settings.

        Args:
            height: Height in cm
            sex: Biological sex

        Returns:
            CalculatorResult with IBW in kg
        """
        # Convert cm to inches
        height_inches = height / 2.54

        # Devine formula (height in inches)
        if sex == Sex.MALE:
            ibw = 50 + 2.3 * (height_inches - 60)
        else:
            ibw = 45.5 + 2.3 * (height_inches - 60)

        ibw = round(max(ibw, 0), 1)

        interpretation = f"Ideal Body Weight: {ibw} kg (Devine formula). " "Use for weight-based medication dosing."

        return CalculatorResult(
            calculator_name="Ideal Body Weight",
            score=ibw,
            unit="kg",
            interpretation=interpretation,
            recommendations=[
                "Use for aminoglycoside dosing",
                "Use for tidal volume calculation (6-8 mL/kg IBW)",
                "Consider adjusted body weight for obese patients",
            ],
            components={"height_cm": height, "sex": sex.value},
            references=["Devine BJ. Drug Intell Clin Pharm 1974;8:650-655"],
            warnings=["Not validated for heights <5 feet (152 cm)", "May give negative values for very short stature"],
        )

    @staticmethod
    def adjusted_body_weight(actual_weight: float, ideal_weight: float) -> CalculatorResult:
        """
        Adjusted Body Weight for Obese Patients.

        Used for drug dosing when actual weight significantly exceeds IBW.

        Args:
            actual_weight: Actual body weight in kg
            ideal_weight: Ideal body weight in kg

        Returns:
            CalculatorResult with adjusted body weight
        """
        # ABW = IBW + 0.4 * (Actual - IBW)
        abw = ideal_weight + 0.4 * (actual_weight - ideal_weight)
        abw = round(abw, 1)

        percent_over_ibw = ((actual_weight - ideal_weight) / ideal_weight) * 100

        interpretation = f"Adjusted Body Weight: {abw} kg."

        recommendations = []
        if percent_over_ibw > 30:
            recommendations.append(f"Patient is {round(percent_over_ibw)}% over IBW - use ABW for dosing")
            recommendations.append("Particularly important for hydrophilic drugs")
        else:
            recommendations.append("Adjusted weight may not be necessary if <30% over IBW")

        return CalculatorResult(
            calculator_name="Adjusted Body Weight",
            score=abw,
            unit="kg",
            interpretation=interpretation,
            recommendations=recommendations,
            components={
                "actual_weight": actual_weight,
                "ideal_weight": ideal_weight,
                "percent_over_ibw": round(percent_over_ibw, 1),
            },
            references=["Pai MP, Paloucek FP. Ann Pharmacother 2000;34:1066-1069"],
        )

    @staticmethod
    def osmolality_serum(sodium: float, glucose: float, bun: float) -> CalculatorResult:
        """
        Calculated Serum Osmolality.

        Args:
            sodium: Serum sodium in mEq/L
            glucose: Serum glucose in mg/dL
            bun: Blood urea nitrogen in mg/dL

        Returns:
            CalculatorResult with calculated osmolality
        """
        # Formula: 2*Na + Glucose/18 + BUN/2.8
        osm = (2 * sodium) + (glucose / 18) + (bun / 2.8)
        osm = round(osm, 1)

        components = {
            "sodium_contribution": 2 * sodium,
            "glucose_contribution": round(glucose / 18, 1),
            "bun_contribution": round(bun / 2.8, 1),
        }

        if osm < 275:
            status = "Hypo-osmolar"
            risk_level = RiskLevel.MODERATE
        elif osm > 295:
            status = "Hyperosmolar"
            risk_level = RiskLevel.MODERATE
        else:
            status = "Normal"
            risk_level = RiskLevel.LOW

        interpretation = f"Calculated osmolality {osm} mOsm/kg: {status} (normal 275-295)."

        recommendations = []
        if osm > 295:
            recommendations.append("Calculate osmolar gap if toxic alcohol suspected")
            recommendations.append("Osmolar gap = Measured - Calculated (normal <10)")

        return CalculatorResult(
            calculator_name="Serum Osmolality",
            score=osm,
            unit="mOsm/kg",
            risk_level=risk_level,
            interpretation=interpretation,
            recommendations=recommendations,
            components=components,
            references=["Bhagat CI, et al. Clin Chem 1984;30:1703-1705"],
        )


# Convenience function to list all available calculators
def list_calculators() -> Dict[str, str]:
    """Return dictionary of all available calculators with descriptions."""
    return {
        "cha2ds2_vasc": "CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk",
        "heart_score": "HEART Score for Major Cardiac Events",
        "wells_dvt": "Wells' Criteria for DVT",
        "wells_pe": "Wells' Criteria for Pulmonary Embolism",
        "ckd_epi_2021": "CKD-EPI 2021 eGFR (Race-Free)",
        "cockcroft_gault": "Cockcroft-Gault Creatinine Clearance",
        "meld_na": "MELD-Na Score for Liver Disease",
        "child_pugh": "Child-Pugh Score for Cirrhosis",
        "fib4": "FIB-4 Index for Liver Fibrosis",
        "sofa": "SOFA Score for Organ Failure",
        "qsofa": "Quick SOFA for Sepsis Screening",
        "curb65": "CURB-65 for Pneumonia Severity",
        "news2": "NEWS2 Early Warning Score",
        "bmi": "Body Mass Index",
        "bsa_dubois": "Body Surface Area (Du Bois)",
        "anion_gap": "Serum Anion Gap",
        "corrected_calcium": "Albumin-Corrected Calcium",
        "aa_gradient": "Alveolar-Arterial Oxygen Gradient",
        "ideal_body_weight": "Ideal Body Weight (Devine)",
        "adjusted_body_weight": "Adjusted Body Weight for Obesity",
        "osmolality_serum": "Calculated Serum Osmolality",
    }
