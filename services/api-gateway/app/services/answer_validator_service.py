"""
Answer Validator Service for RAG response verification.

Validates AI responses against source documents with:
- Claim extraction from responses
- Source attribution and citation generation
- Confidence scoring
- Hallucination detection
"""

import json
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import get_logger
from app.models.response_validation import ResponseValidation, ResponseValidationCitation
from sqlalchemy.orm import Session

logger = get_logger(__name__)


@dataclass
class Claim:
    """Extracted claim from response."""

    text: str
    index: int
    claim_type: str = "factual"  # factual, opinion, procedural
    start_char: int = 0
    end_char: int = 0


@dataclass
class SourceMatch:
    """Match between claim and source document."""

    document_id: str
    document_title: str
    page_number: Optional[int]
    chunk_id: Optional[str]
    chunk_text: str
    similarity_score: float
    status: str  # supported, partial, unsupported
    confidence: float
    relevant_excerpt: Optional[str] = None
    explanation: Optional[str] = None
    exact_match: bool = False


@dataclass
class ValidationResult:
    """Complete validation result."""

    overall_confidence: float
    claims: List[Claim]
    citations: List[Tuple[Claim, SourceMatch]]
    annotated_response: str
    unsupported_claims: List[Claim]
    validation_time_ms: int
    details: Dict[str, Any] = field(default_factory=dict)


class AnswerValidatorService:
    """
    Validates RAG answers against source documents.

    Uses LLM for claim extraction and verification, combined
    with semantic similarity for source matching.
    """

    CLAIM_EXTRACTION_PROMPT = """Extract factual claims from this response that can be verified against source documents.

Response:
{response}

Return a JSON array of claims. Each claim should have:
- "text": the exact claim text from the response
- "type": one of "factual" (verifiable facts), "opinion" (subjective), or "procedural" (steps/instructions)
- "start": approximate character position where claim starts
- "end": approximate character position where claim ends

Only extract claims that make specific factual assertions. Skip:
- General statements that don't assert specific facts
- Questions or prompts
- Transitional phrases

Return ONLY valid JSON array, no other text:
[{{"text": "...", "type": "factual", "start": 0, "end": 50}}]"""

    CLAIM_VERIFICATION_PROMPT = """Verify if this claim is supported by the source text.

Claim: {claim}

Source text:
{source_text}

Analyze whether the source text supports, partially supports, or does not support the claim.

Return JSON with:
{{
  "supported": true/false/partial,
  "confidence": 0.0-1.0 (how confident are you in this assessment),
  "relevant_excerpt": "exact quote from source if it supports the claim (or null)",
  "explanation": "brief explanation of your reasoning"
}}

Return ONLY valid JSON, no other text."""

    def __init__(self, openai_client=None):
        """
        Initialize validator service.

        Args:
            openai_client: Optional AsyncOpenAI client (will be created if not provided)
        """
        self._openai = openai_client

    async def _get_openai(self):
        """Lazily initialize OpenAI client."""
        if self._openai is None:
            import os

            from openai import AsyncOpenAI

            self._openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._openai

    async def validate_response(
        self,
        response_text: str,
        source_chunks: List[Dict[str, Any]],
        query: str,
        db: Optional[Session] = None,
        message_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> ValidationResult:
        """
        Validate a response against source documents.

        Args:
            response_text: The generated response to validate
            source_chunks: Retrieved chunks used for generation
            query: Original user query
            db: Optional database session for persistence
            message_id: Optional message ID to link validation
            session_id: Optional session ID
            user_id: Optional user ID

        Returns:
            ValidationResult with citations and confidence scores
        """
        start_time = time.time()

        try:
            # Step 1: Extract claims from response
            claims = await self._extract_claims(response_text)
            logger.info(f"Extracted {len(claims)} claims from response")

            if not claims:
                # No verifiable claims found
                return ValidationResult(
                    overall_confidence=1.0,
                    claims=[],
                    citations=[],
                    annotated_response=response_text,
                    unsupported_claims=[],
                    validation_time_ms=int((time.time() - start_time) * 1000),
                    details={"message": "No verifiable claims found in response"},
                )

            # Step 2: Find supporting evidence for each claim
            citations: List[Tuple[Claim, SourceMatch]] = []
            unsupported: List[Claim] = []

            for claim in claims:
                best_match = await self._find_best_source(claim, source_chunks)

                if best_match:
                    citations.append((claim, best_match))
                    if best_match.status == "unsupported":
                        unsupported.append(claim)
                else:
                    # No source found at all
                    no_match = SourceMatch(
                        document_id="",
                        document_title="",
                        page_number=None,
                        chunk_id=None,
                        chunk_text="",
                        similarity_score=0.0,
                        status="unsupported",
                        confidence=0.0,
                        explanation="No supporting source found",
                    )
                    citations.append((claim, no_match))
                    unsupported.append(claim)

            # Step 3: Calculate overall confidence
            supported_count = len([c for _, m in citations if m.status == "supported"])
            partial_count = len([c for _, m in citations if m.status == "partial"])
            total = len(claims)

            overall_confidence = (supported_count + 0.5 * partial_count) / total if total > 0 else 1.0

            # Step 4: Generate annotated response
            annotated = self._annotate_response(response_text, claims, citations)

            validation_time_ms = int((time.time() - start_time) * 1000)

            result = ValidationResult(
                overall_confidence=overall_confidence,
                claims=claims,
                citations=citations,
                annotated_response=annotated,
                unsupported_claims=unsupported,
                validation_time_ms=validation_time_ms,
                details={
                    "total_claims": total,
                    "supported": supported_count,
                    "partial": partial_count,
                    "unsupported": len(unsupported),
                    "source_chunks_count": len(source_chunks),
                },
            )

            # Persist to database if session provided
            if db:
                await self._persist_validation(
                    db=db,
                    result=result,
                    query=query,
                    response_text=response_text,
                    message_id=message_id,
                    session_id=session_id,
                    user_id=user_id,
                )

            logger.info(
                f"Validation complete: confidence={overall_confidence:.2f}, "
                f"claims={total}, supported={supported_count}, unsupported={len(unsupported)}"
            )

            return result

        except Exception as e:
            logger.error(f"Validation failed: {e}", exc_info=True)
            # Return a default result on error
            return ValidationResult(
                overall_confidence=0.0,
                claims=[],
                citations=[],
                annotated_response=response_text,
                unsupported_claims=[],
                validation_time_ms=int((time.time() - start_time) * 1000),
                details={"error": str(e)},
            )

    async def _extract_claims(self, response_text: str) -> List[Claim]:
        """Extract verifiable claims from response using LLM."""
        try:
            openai = await self._get_openai()

            completion = await openai.chat.completions.create(
                model="gpt-4o-mini",  # Fast model for extraction
                messages=[
                    {
                        "role": "system",
                        "content": "You are a claim extractor. Extract factual claims that can be verified.",
                    },
                    {
                        "role": "user",
                        "content": self.CLAIM_EXTRACTION_PROMPT.format(response=response_text),
                    },
                ],
                temperature=0.0,
                max_tokens=2000,
            )

            content = completion.choices[0].message.content.strip()

            # Parse JSON response
            # Handle potential markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            claims_data = json.loads(content)

            claims = []
            for i, claim_info in enumerate(claims_data):
                claims.append(
                    Claim(
                        text=claim_info.get("text", ""),
                        index=i,
                        claim_type=claim_info.get("type", "factual"),
                        start_char=claim_info.get("start", 0),
                        end_char=claim_info.get("end", 0),
                    )
                )

            return claims

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse claims JSON: {e}")
            return []
        except Exception as e:
            logger.error(f"Claim extraction failed: {e}")
            return []

    async def _find_best_source(
        self,
        claim: Claim,
        source_chunks: List[Dict[str, Any]],
    ) -> Optional[SourceMatch]:
        """Find the best supporting source for a claim."""
        if not source_chunks:
            return None

        best_match: Optional[SourceMatch] = None
        best_confidence = 0.0

        # Check each source chunk
        for chunk in source_chunks:
            verification = await self._verify_claim_against_source(
                claim.text,
                chunk.get("text", chunk.get("content", "")),
            )

            if verification is None:
                continue

            confidence = verification.get("confidence", 0.0)

            # Determine status
            supported_value = verification.get("supported")
            if supported_value is True or supported_value == "true":
                status = "supported"
            elif supported_value == "partial" or supported_value == "partially":
                status = "partial"
            else:
                status = "unsupported"

            # Check for exact match
            exact_match = self._check_exact_match(claim.text, chunk.get("text", ""))

            # Boost confidence for exact matches
            if exact_match:
                confidence = min(1.0, confidence + 0.2)
                status = "supported"

            # Track best match
            if status != "unsupported" and confidence > best_confidence:
                best_confidence = confidence
                best_match = SourceMatch(
                    document_id=str(chunk.get("document_id", "")),
                    document_title=chunk.get("title", chunk.get("document_title", "")),
                    page_number=chunk.get("page_number"),
                    chunk_id=chunk.get("chunk_id", chunk.get("id")),
                    chunk_text=chunk.get("text", chunk.get("content", "")),
                    similarity_score=chunk.get("score", chunk.get("similarity", 0.0)),
                    status=status,
                    confidence=confidence,
                    relevant_excerpt=verification.get("relevant_excerpt"),
                    explanation=verification.get("explanation"),
                    exact_match=exact_match,
                )

        return best_match

    async def _verify_claim_against_source(
        self,
        claim: str,
        source_text: str,
    ) -> Optional[Dict[str, Any]]:
        """Use LLM to verify if source supports claim."""
        if not source_text.strip():
            return None

        try:
            openai = await self._get_openai()

            completion = await openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a fact checker. Verify claims against source text.",
                    },
                    {
                        "role": "user",
                        "content": self.CLAIM_VERIFICATION_PROMPT.format(
                            claim=claim,
                            source_text=source_text[:3000],  # Limit source text
                        ),
                    },
                ],
                temperature=0.0,
                max_tokens=500,
            )

            content = completion.choices[0].message.content.strip()

            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            return json.loads(content)

        except Exception as e:
            logger.warning(f"Claim verification failed: {e}")
            return None

    def _check_exact_match(self, claim: str, source_text: str) -> bool:
        """Check if claim text appears exactly in source."""
        # Normalize whitespace
        claim_normalized = " ".join(claim.lower().split())
        source_normalized = " ".join(source_text.lower().split())

        # Check for exact or near-exact match
        return claim_normalized in source_normalized

    def _annotate_response(
        self,
        response_text: str,
        claims: List[Claim],
        citations: List[Tuple[Claim, SourceMatch]],
    ) -> str:
        """Generate annotated response with inline citations."""
        if not citations:
            return response_text

        # Build citation map
        citation_map: Dict[int, str] = {}
        for claim, match in citations:
            if match.status == "unsupported":
                citation_map[claim.index] = " [⚠️ Unverified]"
            elif match.status == "partial":
                title = match.document_title[:20] + "..." if len(match.document_title or "") > 20 else match.document_title or "Source"
                page = f", p.{match.page_number}" if match.page_number else ""
                citation_map[claim.index] = f" [{title}{page}*]"
            else:
                title = match.document_title[:20] + "..." if len(match.document_title or "") > 20 else match.document_title or "Source"
                page = f", p.{match.page_number}" if match.page_number else ""
                citation_map[claim.index] = f" [{title}{page}]"

        # Insert citations into response
        # Sort claims by end position (reverse) to insert from back to front
        sorted_claims = sorted(claims, key=lambda c: c.end_char if c.end_char > 0 else len(response_text), reverse=True)

        annotated = response_text
        for claim in sorted_claims:
            if claim.index in citation_map:
                # Find claim in response
                claim_pos = annotated.find(claim.text)
                if claim_pos >= 0:
                    end_pos = claim_pos + len(claim.text)
                    annotated = annotated[:end_pos] + citation_map[claim.index] + annotated[end_pos:]

        return annotated

    async def _persist_validation(
        self,
        db: Session,
        result: ValidationResult,
        query: str,
        response_text: str,
        message_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> ResponseValidation:
        """Persist validation result to database."""
        try:
            validation = ResponseValidation(
                query_id=uuid.uuid4(),  # Generate new query ID
                message_id=uuid.UUID(message_id) if message_id else None,
                session_id=uuid.UUID(session_id) if session_id else None,
                user_id=uuid.UUID(user_id) if user_id else None,
                query_text=query,
                response_text=response_text,
                overall_confidence=result.overall_confidence,
                claims_total=len(result.claims),
                claims_validated=result.details.get("supported", 0),
                claims_partial=result.details.get("partial", 0),
                claims_unsupported=len(result.unsupported_claims),
                validation_details=result.details,
                annotated_response=result.annotated_response,
                validation_time_ms=result.validation_time_ms,
            )
            db.add(validation)
            db.flush()

            # Add citations
            for claim, match in result.citations:
                citation = ResponseValidationCitation(
                    validation_id=validation.id,
                    claim_text=claim.text,
                    claim_index=claim.index,
                    claim_type=claim.claim_type,
                    claim_start_char=claim.start_char,
                    claim_end_char=claim.end_char,
                    document_id=uuid.UUID(match.document_id) if match.document_id else None,
                    document_title=match.document_title,
                    page_number=match.page_number,
                    chunk_id=match.chunk_id,
                    chunk_text=match.chunk_text[:2000] if match.chunk_text else None,
                    similarity_score=match.similarity_score,
                    exact_match=match.exact_match,
                    relevant_excerpt=match.relevant_excerpt,
                    status=match.status,
                    confidence=match.confidence,
                    explanation=match.explanation,
                )
                db.add(citation)

            db.commit()
            return validation

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to persist validation: {e}")
            raise

    async def get_validation_history(
        self,
        db: Session,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 20,
    ) -> List[ResponseValidation]:
        """Get validation history for a session or user."""
        query = db.query(ResponseValidation)

        if session_id:
            query = query.filter(ResponseValidation.session_id == uuid.UUID(session_id))
        elif user_id:
            query = query.filter(ResponseValidation.user_id == uuid.UUID(user_id))

        return query.order_by(ResponseValidation.created_at.desc()).limit(limit).all()

    async def get_validation_stats(
        self,
        db: Session,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get aggregate validation statistics."""
        from sqlalchemy import func

        query = db.query(
            func.count(ResponseValidation.id).label("total_validations"),
            func.avg(ResponseValidation.overall_confidence).label("avg_confidence"),
            func.sum(ResponseValidation.claims_total).label("total_claims"),
            func.sum(ResponseValidation.claims_validated).label("total_validated"),
            func.sum(ResponseValidation.claims_unsupported).label("total_unsupported"),
        )

        if user_id:
            query = query.filter(ResponseValidation.user_id == uuid.UUID(user_id))

        result = query.first()

        total_claims = result.total_claims or 0
        total_validated = result.total_validated or 0

        return {
            "total_validations": result.total_validations or 0,
            "avg_confidence": float(result.avg_confidence or 0),
            "total_claims": total_claims,
            "total_validated": total_validated,
            "total_unsupported": result.total_unsupported or 0,
            "overall_support_rate": total_validated / total_claims if total_claims > 0 else 0,
        }


# Singleton instance
_answer_validator: Optional[AnswerValidatorService] = None


def get_answer_validator_service() -> AnswerValidatorService:
    """Get or create answer validator service singleton."""
    global _answer_validator
    if _answer_validator is None:
        _answer_validator = AnswerValidatorService()
    return _answer_validator
