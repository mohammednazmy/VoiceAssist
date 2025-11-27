"""
Medical AI API Endpoints

Provides endpoints for medical-specific AI capabilities:
- Medical text embeddings (PubMedBERT, BioGPT, SciBERT)
- Named Entity Recognition (NER) with UMLS linking
- Multi-hop reasoning for complex medical queries
"""

from typing import Any, Dict, List, Optional

from app.api.deps import get_current_user
from app.core.logging import get_logger
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = get_logger(__name__)

router = APIRouter(prefix="/api/medical-ai", tags=["medical-ai"])


# Request/Response Models


class EmbeddingRequest(BaseModel):
    """Request for medical embedding generation"""

    text: str = Field(..., min_length=1, max_length=10000)
    model_type: str = Field(
        default="pubmedbert",
        description="Model to use: pubmedbert, biogpt, scibert",
    )
    pooling: str = Field(default="cls", description="Pooling strategy: cls or mean")


class EmbeddingResponse(BaseModel):
    """Response with embedding vector"""

    embedding: List[float]
    model: str
    text_length: int
    truncated: bool
    embedding_dim: int
    metadata: Dict[str, Any]


class BatchEmbeddingRequest(BaseModel):
    """Request for batch embedding generation"""

    texts: List[str] = Field(..., min_items=1, max_items=100)
    model_type: str = Field(default="pubmedbert")
    pooling: str = Field(default="cls")


class TextGenerationRequest(BaseModel):
    """Request for medical text generation"""

    prompt: str = Field(..., min_length=1, max_length=2000)
    max_length: int = Field(default=200, ge=10, le=1000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)


class NERRequest(BaseModel):
    """Request for medical NER"""

    text: str = Field(..., min_length=1, max_length=50000)
    detect_negation: bool = Field(default=True)
    min_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    include_ontology_mappings: bool = Field(default=True)


class NEREntity(BaseModel):
    """Extracted medical entity"""

    text: str
    type: str
    start: int
    end: int
    negated: bool
    uncertain: bool
    umls_concepts: List[Dict[str, Any]]
    ontology_mappings: List[Dict[str, Any]]


class NERResponse(BaseModel):
    """Response with extracted entities"""

    entities: List[NEREntity]
    text_length: int
    processing_time_ms: float
    model_used: str
    abbreviations: Dict[str, str]


class ReasoningRequest(BaseModel):
    """Request for multi-hop reasoning"""

    query: str = Field(..., min_length=5, max_length=2000)
    max_hops: int = Field(default=3, ge=1, le=5)
    context: Optional[str] = Field(default=None, max_length=5000)
    strategy: Optional[str] = Field(
        default=None,
        description="Reasoning strategy: direct, multi_hop, comparative, causal, temporal",
    )


class ReasoningStep(BaseModel):
    """A step in the reasoning chain"""

    step: int
    question: str
    answer: str
    confidence: float
    sources: List[str]


class ReasoningResponse(BaseModel):
    """Response with reasoning result"""

    original_query: str
    strategy: str
    reasoning_chain: List[ReasoningStep]
    final_answer: str
    confidence: float
    sources: List[str]
    metadata: Dict[str, Any]


class SimilarityRequest(BaseModel):
    """Request for semantic similarity computation"""

    text1: str = Field(..., min_length=1, max_length=5000)
    text2: str = Field(..., min_length=1, max_length=5000)
    model_type: str = Field(default="pubmedbert")


class SimilarityResponse(BaseModel):
    """Response with similarity score"""

    similarity: float
    model: str


class SearchRequest(BaseModel):
    """Request for hybrid search"""

    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=10, ge=1, le=100)
    alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Balance: 1.0 = pure semantic, 0.0 = pure keyword",
    )
    rerank: bool = Field(default=True)
    expand_query: bool = Field(default=True)
    filters: Optional[Dict[str, Any]] = None


class SearchResult(BaseModel):
    """Search result item"""

    doc_id: str
    content: str
    score: float
    source: str
    metadata: Dict[str, Any]


class SearchResponse(BaseModel):
    """Response with search results"""

    results: List[SearchResult]
    query: str
    expanded_query: Optional[str]
    total: int


# API Endpoints


@router.post("/embed", response_model=EmbeddingResponse)
async def generate_medical_embedding(
    request: EmbeddingRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate medical-specific embeddings using specialized models.

    Models available:
    - pubmedbert: Best for biomedical literature
    - biogpt: For medical text (will fallback to pubmedbert for embeddings)
    - scibert: For general scientific text
    """
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)

        # Map string to enum
        model_map = {
            "pubmedbert": MedicalModelType.PUBMEDBERT,
            "biogpt": MedicalModelType.BIOGPT,
            "scibert": MedicalModelType.SCIBERT,
        }

        model_type = model_map.get(request.model_type.lower())
        if not model_type:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model type: {request.model_type}",
            )

        result = await service.generate_embedding(
            text=request.text,
            model_type=model_type,
            pooling=request.pooling,
        )

        return EmbeddingResponse(
            embedding=result.embedding,
            model=result.model,
            text_length=result.text_length,
            truncated=result.truncated,
            embedding_dim=len(result.embedding),
            metadata=result.metadata,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embed/batch")
async def generate_batch_embeddings(
    request: BatchEmbeddingRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate embeddings for multiple texts in batch.

    More efficient than individual calls for large numbers of texts.
    """
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)

        model_map = {
            "pubmedbert": MedicalModelType.PUBMEDBERT,
            "scibert": MedicalModelType.SCIBERT,
        }

        model_type = model_map.get(request.model_type.lower(), MedicalModelType.PUBMEDBERT)

        results = await service.generate_embeddings_batch(
            texts=request.texts,
            model_type=model_type,
            pooling=request.pooling,
        )

        return {
            "embeddings": [
                {
                    "embedding": r.embedding,
                    "model": r.model,
                    "text_length": r.text_length,
                    "truncated": r.truncated,
                }
                for r in results
            ],
            "total": len(results),
        }

    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_medical_text(
    request: TextGenerationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate medical text using BioGPT.

    Useful for:
    - Completing medical sentences
    - Generating medical descriptions
    - Expanding medical concepts
    """
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService

        service = MedicalEmbeddingService(lazy_load=True)

        result = await service.generate_text(
            prompt=request.prompt,
            max_length=request.max_length,
            temperature=request.temperature,
            top_p=request.top_p,
        )

        return {
            "generated_text": result.generated_text,
            "model": result.model,
            "prompt_length": result.prompt_length,
            "generation_length": result.generation_length,
            "metadata": result.metadata,
        }

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-entities", response_model=NERResponse)
async def extract_medical_entities(
    request: NERRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Extract medical entities from clinical text.

    Entities include:
    - Diseases and conditions
    - Medications and drugs
    - Procedures
    - Anatomical structures
    - Lab tests
    - Genes and proteins

    Returns UMLS concept links and optional ontology mappings.
    """
    try:
        from app.services.medical_ner_service import MedicalNERService, OntologyType

        service = MedicalNERService(lazy_load=True)

        # Extract entities
        result = await service.extract_entities(
            text=request.text,
            detect_negation=request.detect_negation,
            min_confidence=request.min_confidence,
        )

        # Optionally normalize to ontologies
        if request.include_ontology_mappings and result.entities:
            result.entities = await service.normalize_entities(
                result.entities,
                ontologies=[OntologyType.ICD10, OntologyType.RXNORM, OntologyType.SNOMED],
            )

        # Convert to response format
        entities = [
            NEREntity(
                text=e.text,
                type=e.entity_type.value,
                start=e.start_char,
                end=e.end_char,
                negated=e.negated,
                uncertain=e.uncertain,
                umls_concepts=[
                    {
                        "cui": c.cui,
                        "name": c.name,
                        "semantic_types": c.semantic_types,
                        "score": c.score,
                    }
                    for c in e.umls_concepts
                ],
                ontology_mappings=[
                    {
                        "ontology": m.ontology.value,
                        "code": m.code,
                        "display_name": m.display_name,
                    }
                    for m in e.ontology_mappings
                ],
            )
            for e in result.entities
        ]

        return NERResponse(
            entities=entities,
            text_length=result.text_length,
            processing_time_ms=result.processing_time_ms,
            model_used=result.model_used,
            abbreviations=result.metadata.get("abbreviations", {}),
        )

    except Exception as e:
        logger.error(f"NER extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reason", response_model=ReasoningResponse)
async def perform_multi_hop_reasoning(
    request: ReasoningRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Perform multi-hop reasoning on complex medical queries.

    This endpoint:
    1. Decomposes complex questions into sub-questions
    2. Answers each iteratively with retrieval
    3. Synthesizes a comprehensive final answer

    Strategies:
    - direct: Single-step for simple queries
    - multi_hop: Iterative for complex queries
    - comparative: For comparing treatments/conditions
    - causal: For cause-effect explanations
    - temporal: For timeline-based questions
    """
    try:
        from app.services.multi_hop_reasoning_service import MultiHopReasoner, ReasoningStrategy

        reasoner = MultiHopReasoner()

        # Parse strategy if provided
        strategy = None
        if request.strategy:
            try:
                strategy = ReasoningStrategy(request.strategy)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid strategy: {request.strategy}",
                )

        result = await reasoner.reason(
            query=request.query,
            max_hops=request.max_hops,
            context=request.context,
            strategy=strategy,
        )

        return ReasoningResponse(
            original_query=result.original_query,
            strategy=result.strategy.value,
            reasoning_chain=[
                ReasoningStep(
                    step=s.step_number,
                    question=s.question,
                    answer=s.answer,
                    confidence=s.confidence,
                    sources=s.sources,
                )
                for s in result.reasoning_chain
            ],
            final_answer=result.final_answer,
            confidence=result.confidence,
            sources=result.sources,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"Multi-hop reasoning failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/similarity", response_model=SimilarityResponse)
async def compute_similarity(
    request: SimilarityRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Compute semantic similarity between two medical texts.

    Returns a score between 0 (dissimilar) and 1 (identical meaning).
    """
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService, MedicalModelType

        service = MedicalEmbeddingService(lazy_load=True)

        model_map = {
            "pubmedbert": MedicalModelType.PUBMEDBERT,
            "scibert": MedicalModelType.SCIBERT,
        }

        model_type = model_map.get(request.model_type.lower(), MedicalModelType.PUBMEDBERT)

        similarity = await service.compute_similarity(request.text1, request.text2, model_type)

        return SimilarityResponse(
            similarity=similarity,
            model=model_type.value,
        )

    except Exception as e:
        logger.error(f"Similarity computation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=SearchResponse)
async def hybrid_search(
    request: SearchRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Perform hybrid search combining semantic and keyword search.

    Features:
    - Query expansion with medical synonyms
    - Reciprocal Rank Fusion of semantic + keyword results
    - Cross-encoder re-ranking for improved relevance
    """
    try:
        from app.services.multi_hop_reasoning_service import HybridSearchEngine

        search_engine = HybridSearchEngine(lazy_load=True)

        results = await search_engine.search(
            query=request.query,
            top_k=request.top_k,
            alpha=request.alpha,
            filters=request.filters,
            rerank=request.rerank,
            expand_query=request.expand_query,
        )

        # Get expanded query if enabled
        expanded = None
        if request.expand_query:
            expanded = await search_engine._expand_query(request.query)

        return SearchResponse(
            results=[
                SearchResult(
                    doc_id=r.doc_id,
                    content=r.content,
                    score=r.score,
                    source=r.source,
                    metadata=r.metadata,
                )
                for r in results
            ],
            query=request.query,
            expanded_query=expanded if expanded != request.query else None,
            total=len(results),
        )

    except Exception as e:
        logger.error(f"Hybrid search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_available_models(
    current_user: User = Depends(get_current_user),
):
    """
    List available medical AI models and their capabilities.
    """
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService

        service = MedicalEmbeddingService(lazy_load=True)
        models = service.get_available_models()

        return {
            "models": models,
            "embedding_models": ["pubmedbert", "scibert"],
            "generation_models": ["biogpt"],
            "ner_models": ["en_core_sci_lg"],
        }

    except Exception:
        return {
            "models": [],
            "embedding_models": ["pubmedbert", "scibert"],
            "generation_models": ["biogpt"],
            "ner_models": ["en_core_sci_lg"],
            "note": "Models not loaded - install dependencies to enable",
        }


@router.get("/health")
async def check_health():
    """
    Check health of medical AI services.
    """
    health = {
        "embedding_service": "unknown",
        "ner_service": "unknown",
        "reasoning_service": "unknown",
    }

    # Check embedding service
    try:
        from app.services.medical_embedding_service import MedicalEmbeddingService

        MedicalEmbeddingService(lazy_load=True)
        health["embedding_service"] = "available"
    except Exception:
        health["embedding_service"] = "unavailable"

    # Check NER service
    try:
        from app.services.medical_ner_service import MedicalNERService

        MedicalNERService(lazy_load=True)
        health["ner_service"] = "available"
    except Exception:
        health["ner_service"] = "unavailable"

    # Check reasoning service
    try:
        from app.services.multi_hop_reasoning_service import MultiHopReasoner

        MultiHopReasoner()
        health["reasoning_service"] = "available"
    except Exception:
        health["reasoning_service"] = "unavailable"

    return {
        "status": "healthy" if all(v == "available" for v in health.values()) else "degraded",
        "services": health,
    }
