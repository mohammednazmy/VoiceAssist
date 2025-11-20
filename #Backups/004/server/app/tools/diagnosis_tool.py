"""
VoiceAssist V2 - Differential Diagnosis Tool

AI-powered differential diagnosis generation.

Tool:
- generate_differential_diagnosis: Generate DDx from symptoms
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from app.tools.base import ToolDefinition, ToolResult, ToolCategory, RiskLevel

logger = logging.getLogger(__name__)


# Tool 9: Generate Differential Diagnosis
class GenerateDifferentialDiagnosisArgs(BaseModel):
    chief_complaint: str = Field(..., min_length=1, max_length=500)
    symptoms: List[str] = Field(..., min_items=1, max_items=20)
    patient_age: Optional[int] = Field(None, ge=0, le=120)
    patient_sex: Optional[str] = Field(None, regex=r'^(M|F|Other)$')
    relevant_history: Optional[List[str]] = Field(None, max_items=10)
    max_results: Optional[int] = Field(10, ge=1, le=20)


class DiagnosisCandidate(BaseModel):
    diagnosis: str
    probability: str  # high, medium, low
    key_features: List[str]
    missing_features: List[str]
    next_steps: List[str]


class GenerateDifferentialDiagnosisResult(BaseModel):
    chief_complaint: str
    diagnoses: List[DiagnosisCandidate]
    reasoning: str
    disclaimers: List[str] = [
        "This is not a substitute for clinical judgment",
        "Consider patient context and physical exam findings",
        "Always perform appropriate workup and consult specialists as needed"
    ]


GENERATE_DIFFERENTIAL_DIAGNOSIS_DEF = ToolDefinition(
    name="generate_differential_diagnosis",
    description="Generate a differential diagnosis list based on chief complaint and symptoms. Uses AI and medical knowledge base.",
    parameters={
        "type": "object",
        "properties": {
            "chief_complaint": {"type": "string", "description": "Chief complaint"},
            "symptoms": {"type": "array", "items": {"type": "string"}, "description": "List of symptoms"},
            "patient_age": {"type": "integer", "minimum": 0, "maximum": 120},
            "patient_sex": {"type": "string", "enum": ["M", "F", "Other"]},
            "relevant_history": {"type": "array", "items": {"type": "string"}},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 20, "default": 10}
        },
        "required": ["chief_complaint", "symptoms"]
    },
    category=ToolCategory.MEDICAL,
    requires_phi=True,  # Patient symptoms
    requires_confirmation=False,  # Informational
    risk_level=RiskLevel.MEDIUM,  # Clinical decision support
    rate_limit=10,
    timeout_seconds=15
)


def generate_differential(args: GenerateDifferentialDiagnosisArgs, user_id: int) -> ToolResult:
    """
    Generate differential diagnosis.

    STUB IMPLEMENTATION - Replace with RAG + BioGPT in Phase 5.
    """
    start_time = datetime.utcnow()

    try:
        logger.info(f"Generating differential diagnosis for user {user_id}: {args.chief_complaint}")

        # STUB: Mock differential diagnosis
        # TODO: Implement with RAG system + medical knowledge base + BioGPT
        # - Query vector DB for similar cases
        # - Extract relevant medical knowledge
        # - Use BioGPT to generate differential
        # - Rank by probability

        mock_diagnoses = [
            DiagnosisCandidate(
                diagnosis="Acute Coronary Syndrome",
                probability="high",
                key_features=["chest pain", "diaphoresis", "radiation to left arm"],
                missing_features=["ST elevation on ECG (pending)"],
                next_steps=["ECG", "Troponin", "Chest X-ray", "Cardiology consult"]
            ),
            DiagnosisCandidate(
                diagnosis="Pulmonary Embolism",
                probability="medium",
                key_features=["chest pain", "shortness of breath"],
                missing_features=["tachycardia", "hypoxia"],
                next_steps=["D-dimer", "CT angiography if indicated"]
            )
        ]

        result_data = GenerateDifferentialDiagnosisResult(
            chief_complaint=args.chief_complaint,
            diagnoses=mock_diagnoses[:args.max_results],
            reasoning="Based on presenting symptoms and patient demographics, the most likely diagnoses are listed above."
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="generate_differential_diagnosis",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except Exception as e:
        logger.error(f"Error generating differential diagnosis: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="generate_differential_diagnosis",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


def register_diagnosis_tools():
    from app.tools.registry import register_tool
    register_tool("generate_differential_diagnosis", GENERATE_DIFFERENTIAL_DIAGNOSIS_DEF, GenerateDifferentialDiagnosisArgs, generate_differential)
    logger.info("Diagnosis tools registered")
