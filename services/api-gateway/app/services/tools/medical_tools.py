"""
Medical Tools for VoiceAssist

Provides access to medical calculators and risk assessment tools.
"""

import logging
from typing import Any, Dict

from app.services.tools.tool_service import ToolExecutionContext, ToolResult

logger = logging.getLogger(__name__)


async def handle_medical_calculator(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Execute a medical calculator.

    Available calculators:
    - wells_dvt: Wells DVT Score
    - wells_pe: Wells PE Score
    - cha2ds2_vasc: CHA2DS2-VASc Score
    - hasbled: HAS-BLED Score
    - meld: MELD Score
    - meld_na: MELD-Na Score
    - child_pugh: Child-Pugh Score
    - bmi: BMI Calculator
    - bsa: Body Surface Area
    - egfr: eGFR (CKD-EPI)
    - creatinine_clearance: Creatinine Clearance (Cockcroft-Gault)
    - corrected_calcium: Corrected Calcium
    - anion_gap: Anion Gap
    - map: Mean Arterial Pressure
    - sofa: SOFA Score
    - apache2: APACHE II Score
    - curb65: CURB-65 Score

    Args:
        arguments: Contains 'calculator' name and 'inputs' dict
        context: Execution context
    """
    calculator_name = arguments.get("calculator", "").lower()
    inputs = arguments.get("inputs", {})

    if not calculator_name:
        return ToolResult(
            success=False,
            data=None,
            error="Calculator name is required",
            error_type="ValidationError",
        )

    try:
        from app.services.medical_calculators import MedicalCalculators

        calc = MedicalCalculators()

        # Map calculator names to functions
        calculator_map = {
            "wells_dvt": ("wells_dvt_score", _convert_wells_dvt_inputs),
            "wells_pe": ("wells_pe_score", _convert_wells_pe_inputs),
            "cha2ds2_vasc": ("cha2ds2_vasc", _convert_cha2ds2_inputs),
            "hasbled": ("hasbled_score", _convert_hasbled_inputs),
            "meld": ("meld_score", _convert_meld_inputs),
            "meld_na": ("meld_na_score", _convert_meld_na_inputs),
            "child_pugh": ("child_pugh_score", _convert_child_pugh_inputs),
            "bmi": ("bmi", _convert_bmi_inputs),
            "bsa": ("bsa", _convert_bsa_inputs),
            "egfr": ("egfr_ckd_epi", _convert_egfr_inputs),
            "creatinine_clearance": ("creatinine_clearance", _convert_crcl_inputs),
            "corrected_calcium": ("corrected_calcium", _convert_calcium_inputs),
            "anion_gap": ("anion_gap", _convert_anion_gap_inputs),
            "map": ("mean_arterial_pressure", _convert_map_inputs),
            "sofa": ("sofa_score", _convert_sofa_inputs),
            "curb65": ("curb65_score", _convert_curb65_inputs),
        }

        if calculator_name not in calculator_map:
            available = list(calculator_map.keys())
            return ToolResult(
                success=False,
                data={"available_calculators": available},
                error=f"Unknown calculator: {calculator_name}. Available: {', '.join(available)}",
                error_type="ValidationError",
            )

        method_name, input_converter = calculator_map[calculator_name]

        # Convert inputs
        try:
            converted_inputs = input_converter(inputs)
        except Exception as e:
            return ToolResult(
                success=False,
                data=None,
                error=f"Invalid inputs: {str(e)}",
                error_type="ValidationError",
            )

        # Get calculator method
        calculator_method = getattr(calc, method_name, None)
        if not calculator_method:
            return ToolResult(
                success=False,
                data=None,
                error=f"Calculator method not found: {method_name}",
                error_type="InternalError",
            )

        # Execute calculator
        result = calculator_method(**converted_inputs)

        return ToolResult(
            success=True,
            data={
                "calculator": calculator_name,
                "inputs": inputs,
                "score": result.score,
                "interpretation": result.interpretation,
                "risk_level": result.risk_level.value if result.risk_level else None,
                "details": result.details,
                "recommendations": result.recommendations,
                "references": result.references,
            },
            message=f"{calculator_name.upper()}: {result.score} - {result.interpretation}",
        )

    except Exception as e:
        logger.exception(f"Error in medical calculator: {e}")
        return ToolResult(
            success=False,
            data=None,
            error=str(e),
            error_type=type(e).__name__,
        )


# Input conversion functions for each calculator


def _convert_wells_dvt_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Wells DVT inputs."""
    return {
        "active_cancer": inputs.get("active_cancer", False),
        "paralysis_paresis": inputs.get("paralysis_paresis", False),
        "bedridden_recent": inputs.get("bedridden_recent", False),
        "tenderness_dvt": inputs.get("tenderness_dvt", False),
        "entire_leg_swollen": inputs.get("entire_leg_swollen", False),
        "calf_swelling": inputs.get("calf_swelling", False),
        "pitting_edema": inputs.get("pitting_edema", False),
        "collateral_veins": inputs.get("collateral_veins", False),
        "previous_dvt": inputs.get("previous_dvt", False),
        "alternative_diagnosis": inputs.get("alternative_diagnosis", False),
    }


def _convert_wells_pe_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Wells PE inputs."""
    return {
        "clinical_dvt": inputs.get("clinical_dvt", False),
        "alternative_diagnosis": inputs.get("alternative_diagnosis", False),
        "heart_rate_gt_100": inputs.get("heart_rate_gt_100", False),
        "immobilization_surgery": inputs.get("immobilization_surgery", False),
        "previous_pe_dvt": inputs.get("previous_pe_dvt", False),
        "hemoptysis": inputs.get("hemoptysis", False),
        "malignancy": inputs.get("malignancy", False),
    }


def _convert_cha2ds2_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert CHA2DS2-VASc inputs."""
    from app.services.medical_calculators import Sex

    sex_str = inputs.get("sex", "male").lower()
    sex = Sex.FEMALE if sex_str in ["female", "f"] else Sex.MALE

    return {
        "age": inputs.get("age", 65),
        "sex": sex,
        "chf": inputs.get("chf", False),
        "hypertension": inputs.get("hypertension", False),
        "stroke_tia": inputs.get("stroke_tia", False),
        "vascular_disease": inputs.get("vascular_disease", False),
        "diabetes": inputs.get("diabetes", False),
    }


def _convert_hasbled_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert HAS-BLED inputs."""
    return {
        "hypertension": inputs.get("hypertension", False),
        "renal_disease": inputs.get("renal_disease", False),
        "liver_disease": inputs.get("liver_disease", False),
        "stroke_history": inputs.get("stroke_history", False),
        "bleeding_history": inputs.get("bleeding_history", False),
        "labile_inr": inputs.get("labile_inr", False),
        "elderly": inputs.get("elderly", False),
        "drugs": inputs.get("drugs", False),
        "alcohol": inputs.get("alcohol", False),
    }


def _convert_meld_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MELD inputs."""
    return {
        "bilirubin": inputs.get("bilirubin", 1.0),
        "inr": inputs.get("inr", 1.0),
        "creatinine": inputs.get("creatinine", 1.0),
        "dialysis": inputs.get("dialysis", False),
    }


def _convert_meld_na_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MELD-Na inputs."""
    return {
        "bilirubin": inputs.get("bilirubin", 1.0),
        "inr": inputs.get("inr", 1.0),
        "creatinine": inputs.get("creatinine", 1.0),
        "sodium": inputs.get("sodium", 140),
        "dialysis": inputs.get("dialysis", False),
    }


def _convert_child_pugh_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Child-Pugh inputs."""
    return {
        "bilirubin": inputs.get("bilirubin", 1.0),
        "albumin": inputs.get("albumin", 3.5),
        "inr": inputs.get("inr", 1.0),
        "ascites": inputs.get("ascites", "none"),
        "encephalopathy": inputs.get("encephalopathy", "none"),
    }


def _convert_bmi_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert BMI inputs."""
    return {
        "weight_kg": inputs.get("weight_kg") or inputs.get("weight"),
        "height_cm": inputs.get("height_cm") or inputs.get("height"),
    }


def _convert_bsa_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert BSA inputs."""
    return {
        "weight_kg": inputs.get("weight_kg") or inputs.get("weight"),
        "height_cm": inputs.get("height_cm") or inputs.get("height"),
    }


def _convert_egfr_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert eGFR inputs."""
    from app.services.medical_calculators import Sex

    sex_str = inputs.get("sex", "male").lower()
    sex = Sex.FEMALE if sex_str in ["female", "f"] else Sex.MALE

    return {
        "creatinine": inputs.get("creatinine"),
        "age": inputs.get("age"),
        "sex": sex,
        "race_black": inputs.get("race_black", False),
    }


def _convert_crcl_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Creatinine Clearance inputs."""
    from app.services.medical_calculators import Sex

    sex_str = inputs.get("sex", "male").lower()
    sex = Sex.FEMALE if sex_str in ["female", "f"] else Sex.MALE

    return {
        "creatinine": inputs.get("creatinine"),
        "age": inputs.get("age"),
        "weight_kg": inputs.get("weight_kg") or inputs.get("weight"),
        "sex": sex,
    }


def _convert_calcium_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Corrected Calcium inputs."""
    return {
        "calcium": inputs.get("calcium"),
        "albumin": inputs.get("albumin"),
    }


def _convert_anion_gap_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Anion Gap inputs."""
    return {
        "sodium": inputs.get("sodium"),
        "chloride": inputs.get("chloride"),
        "bicarbonate": inputs.get("bicarbonate"),
        "albumin": inputs.get("albumin"),
    }


def _convert_map_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MAP inputs."""
    return {
        "systolic": inputs.get("systolic"),
        "diastolic": inputs.get("diastolic"),
    }


def _convert_sofa_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert SOFA inputs."""
    return {
        "pao2_fio2": inputs.get("pao2_fio2"),
        "platelets": inputs.get("platelets"),
        "bilirubin": inputs.get("bilirubin"),
        "map": inputs.get("map"),
        "vasopressor": inputs.get("vasopressor", "none"),
        "gcs": inputs.get("gcs"),
        "creatinine": inputs.get("creatinine"),
        "urine_output": inputs.get("urine_output"),
    }


def _convert_curb65_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert CURB-65 inputs."""
    return {
        "confusion": inputs.get("confusion", False),
        "bun": inputs.get("bun"),
        "respiratory_rate": inputs.get("respiratory_rate"),
        "bp_systolic": inputs.get("bp_systolic"),
        "bp_diastolic": inputs.get("bp_diastolic"),
        "age": inputs.get("age"),
    }
