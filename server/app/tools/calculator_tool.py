"""
VoiceAssist V2 - Medical Calculator Tool

Medical scoring systems and calculators.

Tool:
- calculate_medical_score: Wells, CHADS-VASC, GRACE, MELD, renal dosing, etc.
"""

import logging
import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

from app.tools.base import ToolDefinition, ToolResult, ToolCategory, RiskLevel

logger = logging.getLogger(__name__)


# Tool 7: Calculate Medical Score
class CalculateMedicalScoreArgs(BaseModel):
    calculator_name: str = Field(..., regex=r'^(wells_dvt|wells_pe|chadsvasc|hasbled|grace|meld|renal_dosing|bmi)$')
    parameters: Dict[str, Any] = Field(..., description="Calculator-specific parameters")


class MedicalScoreResult(BaseModel):
    calculator_name: str
    score: Union[float, str]
    interpretation: str
    risk_category: Optional[str] = None
    recommendations: Optional[List[str]] = None
    parameters_used: Dict[str, Any]


CALCULATE_MEDICAL_SCORE_DEF = ToolDefinition(
    name="calculate_medical_score",
    description="Calculate medical risk scores and dosing. Supported calculators: wells_dvt, wells_pe, chadsvasc, hasbled, grace, meld, renal_dosing, bmi.",
    parameters={
        "type": "object",
        "properties": {
            "calculator_name": {
                "type": "string",
                "enum": ["wells_dvt", "wells_pe", "chadsvasc", "hasbled", "grace", "meld", "renal_dosing", "bmi"],
                "description": "Calculator to use"
            },
            "parameters": {
                "type": "object",
                "description": "Calculator-specific parameters (varies by calculator)"
            }
        },
        "required": ["calculator_name", "parameters"]
    },
    category=ToolCategory.CALCULATION,
    requires_phi=True,  # Patient data used
    requires_confirmation=False,  # Deterministic calculation
    risk_level=RiskLevel.MEDIUM,
    rate_limit=50,  # High limit for local calculation
    timeout_seconds=5
)


def calculate_score(args: CalculateMedicalScoreArgs, user_id: int) -> ToolResult:
    """
    Calculate medical score.

    STUB IMPLEMENTATION - Replace with actual calculator library in Phase 5.
    """
    start_time = datetime.utcnow()

    try:
        logger.info(f"Calculating {args.calculator_name} for user {user_id}")

        if args.calculator_name == "wells_dvt":
            # Example: Wells' DVT Score
            score = sum([
                1 if args.parameters.get("active_cancer") else 0,
                1 if args.parameters.get("paralysis_recent") else 0,
                1 if args.parameters.get("bedridden_3days") else 0,
                1 if args.parameters.get("localized_tenderness") else 0,
                1 if args.parameters.get("entire_leg_swollen") else 0,
                1 if args.parameters.get("calf_swelling_3cm") else 0,
                1 if args.parameters.get("pitting_edema") else 0,
                1 if args.parameters.get("collateral_veins") else 0,
                -2 if args.parameters.get("alternative_diagnosis") else 0
            ])

            if score >= 3:
                interpretation = "High probability of DVT"
                risk_category = "high"
                recommendations = ["Consider urgent ultrasound", "Consider empiric anticoagulation"]
            elif score >= 1:
                interpretation = "Moderate probability of DVT"
                risk_category = "moderate"
                recommendations = ["Obtain D-dimer", "Consider ultrasound"]
            else:
                interpretation = "Low probability of DVT"
                risk_category = "low"
                recommendations = ["D-dimer may be appropriate"]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "wells_pe":
            # Wells' Score for Pulmonary Embolism
            score = sum([
                3.0 if args.parameters.get("clinical_signs_dvt") else 0,
                3.0 if args.parameters.get("pe_most_likely") else 0,
                1.5 if args.parameters.get("heart_rate_over_100") else 0,
                1.5 if args.parameters.get("immobilization_surgery") else 0,
                1.5 if args.parameters.get("previous_dvt_pe") else 0,
                1.0 if args.parameters.get("hemoptysis") else 0,
                1.0 if args.parameters.get("malignancy") else 0,
            ])

            if score > 6:
                interpretation = "High probability of PE"
                risk_category = "high"
                recommendations = [
                    "Consider CT pulmonary angiography",
                    "Consider empiric anticoagulation if high clinical suspicion"
                ]
            elif score >= 2:
                interpretation = "Moderate probability of PE"
                risk_category = "moderate"
                recommendations = [
                    "Obtain D-dimer",
                    "If D-dimer elevated, proceed to CT pulmonary angiography"
                ]
            else:
                interpretation = "Low probability of PE"
                risk_category = "low"
                recommendations = [
                    "D-dimer to rule out",
                    "If D-dimer negative, PE unlikely"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "chadsvasc":
            # CHA₂DS₂-VASc Score for AFib Stroke Risk
            score = sum([
                1 if args.parameters.get("chf") else 0,
                1 if args.parameters.get("hypertension") else 0,
                2 if args.parameters.get("age_75_or_older") else (
                    1 if args.parameters.get("age_65_to_74") else 0
                ),
                1 if args.parameters.get("diabetes") else 0,
                2 if args.parameters.get("stroke_tia_thromboembolism") else 0,
                1 if args.parameters.get("vascular_disease") else 0,
                1 if args.parameters.get("female") else 0,
            ])

            if score >= 2:
                interpretation = "High stroke risk - anticoagulation recommended"
                risk_category = "high"
                recommendations = [
                    "Oral anticoagulation recommended",
                    "Consider DOACs over warfarin unless contraindicated",
                    "Assess bleeding risk with HAS-BLED"
                ]
            elif score == 1:
                interpretation = "Moderate stroke risk"
                risk_category = "moderate"
                recommendations = [
                    "Consider oral anticoagulation or aspirin",
                    "Oral anticoagulation preferred over aspirin",
                    "Assess bleeding risk with HAS-BLED"
                ]
            else:
                interpretation = "Low stroke risk"
                risk_category = "low"
                recommendations = [
                    "No antithrombotic therapy or aspirin may be considered",
                    "Reassess risk factors periodically"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "hasbled":
            # HAS-BLED Score for Bleeding Risk
            score = sum([
                1 if args.parameters.get("hypertension_uncontrolled") else 0,
                1 if args.parameters.get("renal_disease") else 0,
                1 if args.parameters.get("liver_disease") else 0,
                1 if args.parameters.get("stroke_history") else 0,
                1 if args.parameters.get("bleeding_history") else 0,
                1 if args.parameters.get("labile_inr") else 0,
                1 if args.parameters.get("age_over_65") else 0,
                1 if args.parameters.get("antiplatelet_nsaid") else 0,
                1 if args.parameters.get("alcohol_excess") else 0,
            ])

            if score >= 3:
                interpretation = "High bleeding risk"
                risk_category = "high"
                recommendations = [
                    "High bleeding risk - use caution with anticoagulation",
                    "Consider modifiable risk factors",
                    "More frequent INR monitoring if on warfarin",
                    "DOACs may have better safety profile"
                ]
            else:
                interpretation = "Low to moderate bleeding risk"
                risk_category = "low"
                recommendations = [
                    "Standard precautions for anticoagulation",
                    "Address modifiable risk factors"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "grace":
            # GRACE Score for ACS Risk (simplified version)
            # Full GRACE uses continuous variables; this is categorical approximation
            score = 0

            # Age points
            age = args.parameters.get("age", 50)
            if age < 40:
                score += 0
            elif age < 50:
                score += 18
            elif age < 60:
                score += 36
            elif age < 70:
                score += 54
            elif age < 80:
                score += 72
            else:
                score += 90

            # Heart rate points
            hr = args.parameters.get("heart_rate", 70)
            if hr < 70:
                score += 0
            elif hr < 90:
                score += 7
            elif hr < 110:
                score += 13
            elif hr < 150:
                score += 23
            else:
                score += 36

            # Systolic BP points (inverse relationship)
            sbp = args.parameters.get("systolic_bp", 120)
            if sbp < 80:
                score += 63
            elif sbp < 100:
                score += 58
            elif sbp < 120:
                score += 47
            elif sbp < 140:
                score += 37
            elif sbp < 160:
                score += 26
            else:
                score += 0

            # Creatinine points
            creat = args.parameters.get("creatinine", 1.0)
            if creat < 0.4:
                score += 2
            elif creat < 0.8:
                score += 5
            elif creat < 1.2:
                score += 8
            elif creat < 1.6:
                score += 11
            elif creat < 2.0:
                score += 14
            else:
                score += 23

            # Killip class
            killip = args.parameters.get("killip_class", 1)
            score += {1: 0, 2: 21, 3: 43, 4: 64}.get(killip, 0)

            # Binary factors
            if args.parameters.get("cardiac_arrest"):
                score += 43
            if args.parameters.get("st_deviation"):
                score += 30
            if args.parameters.get("elevated_cardiac_markers"):
                score += 15

            if score > 140:
                interpretation = "High risk of in-hospital mortality (>3%)"
                risk_category = "high"
                recommendations = [
                    "Consider early invasive strategy",
                    "Intensive monitoring recommended",
                    "Aggressive medical therapy"
                ]
            elif score > 108:
                interpretation = "Intermediate risk of in-hospital mortality (1-3%)"
                risk_category = "moderate"
                recommendations = [
                    "Consider invasive vs conservative strategy",
                    "Close monitoring",
                    "Optimize medical therapy"
                ]
            else:
                interpretation = "Low risk of in-hospital mortality (<1%)"
                risk_category = "low"
                recommendations = [
                    "Conservative strategy may be appropriate",
                    "Standard ACS management",
                    "Consider early discharge if stable"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "meld":
            # MELD Score for Liver Disease
            bilirubin = max(args.parameters.get("bilirubin", 1.0), 1.0)
            creatinine = max(args.parameters.get("creatinine", 1.0), 1.0)
            creatinine = min(creatinine, 4.0)  # Cap at 4.0
            inr = max(args.parameters.get("inr", 1.0), 1.0)
            dialysis = args.parameters.get("dialysis_twice_weekly", False)

            if dialysis:
                creatinine = 4.0

            # MELD formula: 10 * (0.957 * ln(Cr) + 0.378 * ln(Bili) + 1.12 * ln(INR) + 0.643)
            score = 10 * (
                0.957 * math.log(creatinine) +
                0.378 * math.log(bilirubin) +
                1.12 * math.log(inr) +
                0.643
            )
            score = round(score)
            score = max(6, min(score, 40))  # Clamp to 6-40 range

            if score >= 25:
                interpretation = "Severe liver disease - high 3-month mortality"
                risk_category = "high"
                recommendations = [
                    "Urgent transplant evaluation if appropriate",
                    "3-month mortality ~50-75%",
                    "Consider ICU level care"
                ]
            elif score >= 17:
                interpretation = "Moderate liver disease"
                risk_category = "moderate"
                recommendations = [
                    "Transplant evaluation recommended",
                    "3-month mortality ~20%",
                    "Close monitoring"
                ]
            elif score >= 10:
                interpretation = "Mild to moderate liver disease"
                risk_category = "low"
                recommendations = [
                    "Continued monitoring",
                    "3-month mortality ~6%",
                    "Optimize medical management"
                ]
            else:
                interpretation = "Mild liver disease"
                risk_category = "low"
                recommendations = [
                    "Low short-term mortality",
                    "Routine follow-up"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=float(score),
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "renal_dosing":
            # Cockcroft-Gault Creatinine Clearance
            age = args.parameters.get("age")
            weight = args.parameters.get("weight_kg")
            creatinine = args.parameters.get("creatinine")
            is_female = args.parameters.get("female", False)

            if not all([age, weight, creatinine]):
                raise ValueError(
                    "Missing required parameters: age, weight_kg, creatinine"
                )

            # Cockcroft-Gault: CrCl = ((140 - age) * weight) / (72 * Cr)
            # Multiply by 0.85 for females
            crcl = ((140 - age) * weight) / (72 * creatinine)
            if is_female:
                crcl *= 0.85
            crcl = round(crcl, 1)

            if crcl >= 90:
                interpretation = "Normal kidney function"
                risk_category = "normal"
                recommendations = ["Standard dosing appropriate"]
            elif crcl >= 60:
                interpretation = "Mild kidney impairment (CKD Stage 2)"
                risk_category = "mild"
                recommendations = [
                    "Consider dose adjustment for renally cleared drugs",
                    "Monitor renal function"
                ]
            elif crcl >= 30:
                interpretation = "Moderate kidney impairment (CKD Stage 3)"
                risk_category = "moderate"
                recommendations = [
                    "Dose adjustment likely required",
                    "Avoid nephrotoxic agents if possible",
                    "Check drug-specific recommendations"
                ]
            elif crcl >= 15:
                interpretation = "Severe kidney impairment (CKD Stage 4)"
                risk_category = "high"
                recommendations = [
                    "Significant dose reduction required",
                    "Some drugs contraindicated",
                    "Nephrology referral recommended"
                ]
            else:
                interpretation = "Kidney failure (CKD Stage 5)"
                risk_category = "critical"
                recommendations = [
                    "Many drugs contraindicated or require dialysis dosing",
                    "Consult nephrology and pharmacy",
                    "Consider dialysis"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=crcl,
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        elif args.calculator_name == "bmi":
            # Body Mass Index
            weight = args.parameters.get("weight_kg")
            height = args.parameters.get("height_cm")

            if not weight or not height:
                raise ValueError("Missing required parameters: weight_kg, height_cm")

            height_m = height / 100
            bmi = weight / (height_m ** 2)
            bmi = round(bmi, 1)

            if bmi < 18.5:
                interpretation = "Underweight"
                risk_category = "underweight"
                recommendations = [
                    "Assess for underlying causes",
                    "Nutritional evaluation",
                    "Consider causes: malnutrition, malabsorption, chronic illness"
                ]
            elif bmi < 25:
                interpretation = "Normal weight"
                risk_category = "normal"
                recommendations = [
                    "Maintain healthy lifestyle",
                    "Regular physical activity"
                ]
            elif bmi < 30:
                interpretation = "Overweight"
                risk_category = "overweight"
                recommendations = [
                    "Lifestyle modification recommended",
                    "Diet and exercise counseling",
                    "Screen for metabolic syndrome"
                ]
            elif bmi < 35:
                interpretation = "Obesity Class I"
                risk_category = "obese_class_1"
                recommendations = [
                    "Weight loss strongly recommended",
                    "Screen for comorbidities: diabetes, HTN, OSA",
                    "Consider referral to weight management program"
                ]
            elif bmi < 40:
                interpretation = "Obesity Class II"
                risk_category = "obese_class_2"
                recommendations = [
                    "Intensive weight management",
                    "Evaluate for bariatric surgery",
                    "Comprehensive metabolic workup"
                ]
            else:
                interpretation = "Obesity Class III (Morbid Obesity)"
                risk_category = "obese_class_3"
                recommendations = [
                    "Bariatric surgery evaluation",
                    "Multidisciplinary weight management",
                    "Screen aggressively for comorbidities"
                ]

            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score=bmi,
                interpretation=interpretation,
                risk_category=risk_category,
                recommendations=recommendations,
                parameters_used=args.parameters
            )

        else:
            # Unknown calculator
            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score="N/A",
                interpretation=f"Calculator '{args.calculator_name}' not recognized",
                risk_category=None,
                recommendations=None,
                parameters_used=args.parameters
            )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="calculate_medical_score",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except Exception as e:
        logger.error(f"Error calculating medical score: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="calculate_medical_score",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


def register_calculator_tools():
    from app.tools.registry import register_tool
    register_tool("calculate_medical_score", CALCULATE_MEDICAL_SCORE_DEF, CalculateMedicalScoreArgs, calculate_score)
    logger.info("Calculator tools registered")
