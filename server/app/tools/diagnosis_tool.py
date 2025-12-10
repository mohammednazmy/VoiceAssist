"""
VoiceAssist V2 - Differential Diagnosis Tool

AI-powered differential diagnosis generation using RAG + LLM.

Tool:
- generate_differential_diagnosis: Generate DDx from symptoms
"""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.llm_client import LLMClient, LLMRequest
from app.services.search_aggregator import SearchAggregator, SearchResult
from app.tools.base import RiskLevel, ToolCategory, ToolDefinition, ToolResult

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


def _build_symptom_query(args: GenerateDifferentialDiagnosisArgs) -> str:
    """Build a search query from symptoms and patient info."""
    parts = [args.chief_complaint]
    parts.extend(args.symptoms)

    if args.patient_age:
        if args.patient_age < 18:
            parts.append("pediatric")
        elif args.patient_age >= 65:
            parts.append("elderly geriatric")

    if args.patient_sex:
        sex_map = {"M": "male", "F": "female", "Other": ""}
        parts.append(sex_map.get(args.patient_sex, ""))

    if args.relevant_history:
        parts.extend(args.relevant_history[:3])

    return " ".join(filter(None, parts))


def _build_ddx_prompt(
    args: GenerateDifferentialDiagnosisArgs,
    context: str,
    max_results: int
) -> str:
    """Build the LLM prompt for differential diagnosis generation."""
    patient_info = []
    if args.patient_age:
        patient_info.append(f"Age: {args.patient_age}")
    if args.patient_sex:
        patient_info.append(f"Sex: {args.patient_sex}")
    if args.relevant_history:
        patient_info.append(f"History: {', '.join(args.relevant_history)}")

    patient_section = "\n".join(patient_info) if patient_info else "Not provided"

    prompt = f"""You are an expert clinical diagnostic assistant. Generate a differential diagnosis based on the following patient presentation.

Chief Complaint: {args.chief_complaint}

Symptoms: {', '.join(args.symptoms)}

Patient Information:
{patient_section}

"""
    if context:
        prompt += f"""Relevant Medical Knowledge:
{context}

"""

    prompt += f"""Generate up to {max_results} differential diagnoses ranked by probability.

For each diagnosis, provide:
1. The diagnosis name
2. Probability level (high, medium, or low)
3. Key supporting features from the presentation
4. Missing features that would strengthen or weaken this diagnosis
5. Recommended next steps (workup, tests, consults)

Respond in JSON format with this exact structure:
{{
  "diagnoses": [
    {{
      "diagnosis": "Diagnosis Name",
      "probability": "high|medium|low",
      "key_features": ["feature1", "feature2"],
      "missing_features": ["missing1", "missing2"],
      "next_steps": ["step1", "step2"]
    }}
  ],
  "reasoning": "Brief clinical reasoning explaining the differential"
}}

IMPORTANT: Respond ONLY with valid JSON. No additional text."""

    return prompt


def _parse_llm_response(response_text: str) -> tuple[List[DiagnosisCandidate], str]:
    """Parse LLM response into structured diagnosis candidates."""
    diagnoses = []
    reasoning = ""

    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if not json_match:
        logger.warning("Could not extract JSON from LLM response")
        return diagnoses, "Unable to parse differential diagnosis response."

    try:
        data = json.loads(json_match.group())

        reasoning = data.get("reasoning", "")

        for dx in data.get("diagnoses", []):
            candidate = DiagnosisCandidate(
                diagnosis=dx.get("diagnosis", "Unknown"),
                probability=dx.get("probability", "low"),
                key_features=dx.get("key_features", []),
                missing_features=dx.get("missing_features", []),
                next_steps=dx.get("next_steps", [])
            )
            diagnoses.append(candidate)

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in LLM response: {e}")
        return diagnoses, "Error parsing diagnosis response."

    return diagnoses, reasoning


async def _generate_differential_async(
    args: GenerateDifferentialDiagnosisArgs,
    user_id: int
) -> ToolResult:
    """Async implementation of differential diagnosis generation."""
    start_time = datetime.utcnow()

    try:
        settings = get_settings()
        logger.info(
            f"Generating differential diagnosis for user {user_id}: "
            f"{args.chief_complaint}"
        )

        # Step 1: Build search query from symptoms
        search_query = _build_symptom_query(args)
        logger.debug(f"Search query: {search_query}")

        # Step 2: Search medical knowledge base for relevant context
        context = ""
        search_results: List[SearchResult] = []

        try:
            search_aggregator = SearchAggregator(
                qdrant_url=settings.qdrant_url,
                collection_name="medical_kb",
                embedding_model="text-embedding-3-small"
            )

            search_results = await search_aggregator.search(
                query=search_query,
                top_k=5,
                score_threshold=0.3,
                filter_conditions={"source_type": "textbook"}
            )

            if not search_results:
                search_results = await search_aggregator.search(
                    query=search_query,
                    top_k=5,
                    score_threshold=0.2
                )

            if search_results:
                context = search_aggregator.format_context_for_rag(search_results)
                logger.info(
                    f"Found {len(search_results)} relevant documents "
                    f"for DDx generation"
                )

        except Exception as e:
            logger.warning(
                f"Knowledge base search failed, proceeding without context: {e}"
            )

        # Step 3: Build LLM prompt
        max_results = args.max_results or 10
        prompt = _build_ddx_prompt(args, context, max_results)

        # Step 4: Call LLM (always use phi_present=True for patient data)
        llm_client = LLMClient()
        llm_request = LLMRequest(
            prompt=prompt,
            intent="diagnosis",
            temperature=0.2,
            max_tokens=1500,
            phi_present=True,
            trace_id=f"ddx-{user_id}-{int(start_time.timestamp())}"
        )

        llm_response = await llm_client.generate(llm_request)

        # Step 5: Parse response
        diagnoses, reasoning = _parse_llm_response(llm_response.text)

        if not diagnoses:
            logger.warning("No diagnoses parsed from LLM response")
            return ToolResult(
                tool_name="generate_differential_diagnosis",
                success=False,
                error="Failed to generate differential diagnosis. Please try again.",
                execution_time_ms=(
                    datetime.utcnow() - start_time
                ).total_seconds() * 1000
            )

        # Step 6: Build result
        result_data = GenerateDifferentialDiagnosisResult(
            chief_complaint=args.chief_complaint,
            diagnoses=diagnoses[:max_results],
            reasoning=reasoning or (
                "Based on presenting symptoms and patient demographics, "
                "the differential diagnoses are listed by probability."
            )
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Generated {len(diagnoses)} differential diagnoses "
            f"in {execution_time:.2f}ms"
        )

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


def generate_differential(
    args: GenerateDifferentialDiagnosisArgs,
    user_id: int
) -> ToolResult:
    """
    Generate differential diagnosis using RAG + LLM.

    Pipeline:
    1. Build search query from symptoms and patient info
    2. Query vector database for relevant medical knowledge
    3. Construct prompt with clinical context
    4. Generate differential using LLM
    5. Parse and return structured diagnosis candidates
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run,
                _generate_differential_async(args, user_id)
            )
            return future.result(timeout=20)
    else:
        return asyncio.run(_generate_differential_async(args, user_id))


def register_diagnosis_tools():
    from app.tools.registry import register_tool
    register_tool("generate_differential_diagnosis", GENERATE_DIFFERENTIAL_DIAGNOSIS_DEF, GenerateDifferentialDiagnosisArgs, generate_differential)
    logger.info("Diagnosis tools registered")
