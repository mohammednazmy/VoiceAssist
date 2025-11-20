"""
VoiceAssist V2 - Medical Calculator Tool

Medical scoring systems and calculators.

Tool:
- calculate_medical_score: Wells, CHADS-VASC, GRACE, MELD, renal dosing, etc.
"""

from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime
import logging

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

        # STUB: Implement calculator logic
        # TODO: Create calculator library with validated formulas

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

        else:
            # Stub for other calculators
            result_data = MedicalScoreResult(
                calculator_name=args.calculator_name,
                score="N/A",
                interpretation=f"Calculator '{args.calculator_name}' not yet implemented (stub)",
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
