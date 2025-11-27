"""
External Medical Integrations API

Endpoints for:
- UpToDate clinical decision support
- Enhanced PubMed literature search
- Medical calculators
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services.medical_calculators import CalculatorResult, MedicalCalculators, Sex, list_calculators
from ..services.pubmed_enhanced_service import ArticleType, DateRange, EnhancedPubMedService
from ..services.uptodate_service import Specialty, UpToDateService

router = APIRouter(prefix="/external-medical", tags=["external-medical"])

# Singleton instances
_uptodate_service: Optional[UpToDateService] = None
_pubmed_service: Optional[EnhancedPubMedService] = None


def get_uptodate_service() -> UpToDateService:
    """Get or create UpToDate service instance."""
    global _uptodate_service
    if _uptodate_service is None:
        _uptodate_service = UpToDateService()
    return _uptodate_service


def get_pubmed_service() -> EnhancedPubMedService:
    """Get or create PubMed service instance."""
    global _pubmed_service
    if _pubmed_service is None:
        _pubmed_service = EnhancedPubMedService()
    return _pubmed_service


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


# UpToDate Models
class UpToDateSearchRequest(BaseModel):
    """Request for UpToDate topic search."""

    query: str = Field(..., min_length=1, description="Search query")
    max_results: int = Field(10, ge=1, le=50, description="Maximum results")
    specialty: Optional[str] = Field(None, description="Filter by specialty")


class UpToDateTopicRequest(BaseModel):
    """Request for UpToDate topic content."""

    topic_id: str = Field(..., description="Topic ID")
    section: Optional[str] = Field(None, description="Specific section")


class DrugInteractionRequest(BaseModel):
    """Request for drug interaction check."""

    drugs: List[str] = Field(..., min_items=2, description="List of drug names")


# PubMed Models
class PubMedSearchRequest(BaseModel):
    """Request for PubMed search."""

    query: str = Field(..., min_length=1, description="Search query")
    max_results: int = Field(20, ge=1, le=100, description="Maximum results")
    article_types: Optional[List[str]] = Field(None, description="Article type filters")
    date_from: Optional[str] = Field(None, description="Start date (YYYY/MM/DD)")
    date_to: Optional[str] = Field(None, description="End date (YYYY/MM/DD)")
    include_abstract: bool = Field(True, description="Include abstracts")
    sort_by: str = Field("relevance", description="Sort order: relevance or date")


class PubMedArticleRequest(BaseModel):
    """Request for PubMed article details."""

    pmid: str = Field(..., description="PubMed ID")


class ClinicalTrialSearchRequest(BaseModel):
    """Request for clinical trial search."""

    condition: str = Field(..., description="Medical condition")
    intervention: Optional[str] = Field(None, description="Intervention filter")
    status: Optional[List[str]] = Field(None, description="Trial status filters")
    max_results: int = Field(20, ge=1, le=100, description="Maximum results")


# Calculator Models
class CalculatorInputRequest(BaseModel):
    """Generic calculator input request."""

    calculator_name: str = Field(..., description="Name of calculator to use")
    parameters: Dict[str, Any] = Field(..., description="Calculator parameters")


class CHA2DS2VAScRequest(BaseModel):
    """CHA2DS2-VASc calculator request."""

    age: int = Field(..., ge=0, le=120, description="Patient age")
    sex: str = Field(..., description="male or female")
    chf: bool = Field(False, description="Congestive heart failure")
    hypertension: bool = Field(False, description="Hypertension")
    stroke_tia_history: bool = Field(False, description="Prior stroke/TIA")
    vascular_disease: bool = Field(False, description="Vascular disease")
    diabetes: bool = Field(False, description="Diabetes")


class CKDEPIRequest(BaseModel):
    """CKD-EPI eGFR calculator request."""

    creatinine: float = Field(..., gt=0, description="Serum creatinine (mg/dL)")
    age: int = Field(..., ge=18, le=120, description="Patient age")
    sex: str = Field(..., description="male or female")


class MELDNaRequest(BaseModel):
    """MELD-Na calculator request."""

    bilirubin: float = Field(..., gt=0, description="Total bilirubin (mg/dL)")
    inr: float = Field(..., gt=0, description="INR")
    creatinine: float = Field(..., gt=0, description="Serum creatinine (mg/dL)")
    sodium: float = Field(..., gt=0, description="Serum sodium (mEq/L)")
    dialysis_twice_past_week: bool = Field(False, description="Dialysis ≥2x/week")


class SOFARequest(BaseModel):
    """SOFA score calculator request."""

    pao2_fio2: float = Field(..., gt=0, description="PaO2/FiO2 ratio")
    platelets: float = Field(..., gt=0, description="Platelets (10^3/μL)")
    bilirubin: float = Field(..., ge=0, description="Bilirubin (mg/dL)")
    cardiovascular: int = Field(..., ge=0, le=4, description="CV score 0-4")
    gcs: int = Field(..., ge=3, le=15, description="Glasgow Coma Scale")
    creatinine: float = Field(..., gt=0, description="Creatinine (mg/dL)")
    urine_output_24h: Optional[float] = Field(None, description="24h urine (mL)")


class BMIRequest(BaseModel):
    """BMI calculator request."""

    weight: float = Field(..., gt=0, description="Weight (kg)")
    height: float = Field(..., gt=0, description="Height (cm)")


class AnionGapRequest(BaseModel):
    """Anion gap calculator request."""

    sodium: float = Field(..., description="Sodium (mEq/L)")
    chloride: float = Field(..., description="Chloride (mEq/L)")
    bicarbonate: float = Field(..., description="Bicarbonate (mEq/L)")
    albumin: Optional[float] = Field(None, description="Albumin (g/dL)")


# =============================================================================
# UPTODATE ENDPOINTS
# =============================================================================


@router.post("/uptodate/search", response_model=List[dict])
async def search_uptodate(request: UpToDateSearchRequest, service: UpToDateService = Depends(get_uptodate_service)):
    """
    Search UpToDate topics.

    Returns list of relevant topics with summaries.
    """
    try:
        specialty = None
        if request.specialty:
            try:
                specialty = Specialty(request.specialty.lower())
            except ValueError:
                pass

        topics = await service.search_topics(query=request.query, max_results=request.max_results, specialty=specialty)

        return [
            {
                "topic_id": t.topic_id,
                "title": t.title,
                "url": t.url,
                "summary": t.summary,
                "specialty": t.specialty,
                "last_updated": t.last_updated.isoformat() if t.last_updated else None,
                "sections": t.sections,
            }
            for t in topics
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/uptodate/topic", response_model=dict)
async def get_uptodate_topic(request: UpToDateTopicRequest, service: UpToDateService = Depends(get_uptodate_service)):
    """
    Get full content of an UpToDate topic.

    Returns detailed topic content including sections and references.
    """
    try:
        content = await service.get_topic_content(topic_id=request.topic_id, section=request.section)

        if not content:
            raise HTTPException(status_code=404, detail="Topic not found")

        return {
            "topic_id": content.topic_id,
            "title": content.title,
            "content_html": content.content_html,
            "content_text": content.content_text,
            "sections": content.sections,
            "references": content.references,
            "last_updated": (content.last_updated.isoformat() if content.last_updated else None),
            "authors": content.authors,
            "editors": content.editors,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/uptodate/drug-interactions", response_model=dict)
async def check_drug_interactions(
    request: DrugInteractionRequest, service: UpToDateService = Depends(get_uptodate_service)
):
    """
    Check for drug-drug interactions.

    Returns interaction severity and clinical recommendations.
    """
    try:
        result = await service.check_drug_interactions(request.drugs)

        return {
            "drugs_checked": result.drugs_checked,
            "interactions": [
                {
                    "drug1": i.drug1,
                    "drug2": i.drug2,
                    "severity": i.severity.value,
                    "description": i.description,
                    "mechanism": i.mechanism,
                    "management": i.management,
                    "references": i.references,
                }
                for i in result.interactions
            ],
            "has_severe_interactions": result.has_severe_interactions,
            "summary": result.summary,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/uptodate/graphics/{topic_id}", response_model=List[dict])
async def get_topic_graphics(topic_id: str, service: UpToDateService = Depends(get_uptodate_service)):
    """
    Get medical graphics/images for a topic.

    Returns list of graphics with URLs and descriptions.
    """
    try:
        graphics = await service.get_graphics(topic_id)

        return [
            {
                "graphic_id": g.graphic_id,
                "title": g.title,
                "url": g.url,
                "thumbnail_url": g.thumbnail_url,
                "caption": g.caption,
                "graphic_type": g.graphic_type.value,
            }
            for g in graphics
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# PUBMED ENDPOINTS
# =============================================================================


@router.post("/pubmed/search", response_model=dict)
async def search_pubmed(request: PubMedSearchRequest, service: EnhancedPubMedService = Depends(get_pubmed_service)):
    """
    Search PubMed with enhanced features.

    Returns articles with abstracts, MeSH terms, and metadata.
    """
    try:
        # Convert article types
        article_types = None
        if request.article_types:
            article_types = []
            for at in request.article_types:
                try:
                    article_types.append(ArticleType(at.lower().replace(" ", "_")))
                except ValueError:
                    pass

        # Convert date range
        date_range = None
        if request.date_from or request.date_to:
            date_range = DateRange(start=request.date_from, end=request.date_to)

        result = await service.search(
            query=request.query,
            max_results=request.max_results,
            article_types=article_types,
            date_range=date_range,
            include_abstract=request.include_abstract,
            sort_by=request.sort_by,
        )

        return {
            "total_count": result.total_count,
            "query_translation": result.query_translation,
            "articles": [
                {
                    "pmid": a.pmid,
                    "title": a.title,
                    "authors": a.authors,
                    "journal": a.journal,
                    "publication_date": a.publication_date,
                    "abstract": a.abstract,
                    "doi": a.doi,
                    "pmc_id": a.pmc_id,
                    "mesh_terms": a.mesh_terms,
                    "keywords": a.keywords,
                    "article_type": a.article_type,
                    "citation_count": a.citation_count,
                }
                for a in result.articles
            ],
            "mesh_terms_used": result.mesh_terms_used,
            "suggested_queries": result.suggested_queries,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pubmed/article/{pmid}", response_model=dict)
async def get_pubmed_article(pmid: str, service: EnhancedPubMedService = Depends(get_pubmed_service)):
    """
    Get detailed information for a specific PubMed article.
    """
    try:
        result = await service.search(query=f"{pmid}[pmid]", max_results=1, include_abstract=True)

        if not result.articles:
            raise HTTPException(status_code=404, detail="Article not found")

        article = result.articles[0]
        return {
            "pmid": article.pmid,
            "title": article.title,
            "authors": article.authors,
            "journal": article.journal,
            "publication_date": article.publication_date,
            "abstract": article.abstract,
            "doi": article.doi,
            "pmc_id": article.pmc_id,
            "mesh_terms": article.mesh_terms,
            "keywords": article.keywords,
            "article_type": article.article_type,
            "citation_count": article.citation_count,
            "affiliations": article.affiliations,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pubmed/full-text/{pmid}")
async def get_full_text(pmid: str, service: EnhancedPubMedService = Depends(get_pubmed_service)):
    """
    Get full text of article from PMC if available.
    """
    try:
        text = await service.get_full_text(pmid)

        if not text:
            raise HTTPException(status_code=404, detail="Full text not available in PMC")

        return {"pmid": pmid, "full_text": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pubmed/similar/{pmid}", response_model=List[dict])
async def find_similar_articles(
    pmid: str, max_results: int = 10, service: EnhancedPubMedService = Depends(get_pubmed_service)
):
    """
    Find similar articles using PubMed's related articles feature.
    """
    try:
        articles = await service.find_similar_articles(pmid, max_results)

        return [
            {
                "pmid": a.pmid,
                "title": a.title,
                "authors": a.authors[:3],
                "journal": a.journal,
                "publication_date": a.publication_date,
                "abstract": a.abstract[:500] if a.abstract else None,
            }
            for a in articles
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pubmed/citations/{pmid}", response_model=dict)
async def get_citation_network(pmid: str, service: EnhancedPubMedService = Depends(get_pubmed_service)):
    """
    Get citation network for an article.

    Returns articles that cite this paper and references.
    """
    try:
        network = await service.get_citation_network(pmid)

        return {
            "pmid": network.pmid,
            "cited_by": [
                {"pmid": a.pmid, "title": a.title, "authors": a.authors[:3], "publication_date": a.publication_date}
                for a in network.cited_by
            ],
            "references": [
                {"pmid": a.pmid, "title": a.title, "authors": a.authors[:3], "publication_date": a.publication_date}
                for a in network.references
            ],
            "cited_by_count": network.cited_by_count,
            "references_count": network.references_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pubmed/clinical-trials", response_model=List[dict])
async def search_clinical_trials(
    request: ClinicalTrialSearchRequest, service: EnhancedPubMedService = Depends(get_pubmed_service)
):
    """
    Search for clinical trials related to a condition.
    """
    try:
        trials = await service.search_clinical_trials(
            condition=request.condition,
            intervention=request.intervention,
            status=request.status,
            max_results=request.max_results,
        )

        return [
            {
                "nct_id": t.nct_id,
                "title": t.title,
                "status": t.status,
                "phase": t.phase,
                "conditions": t.conditions,
                "interventions": t.interventions,
                "enrollment": t.enrollment,
                "start_date": t.start_date,
                "completion_date": t.completion_date,
                "locations": t.locations[:5],
                "url": t.url,
            }
            for t in trials
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# MEDICAL CALCULATOR ENDPOINTS
# =============================================================================


@router.get("/calculators", response_model=Dict[str, str])
async def list_available_calculators():
    """
    List all available medical calculators.
    """
    return list_calculators()


@router.post("/calculators/cha2ds2-vasc", response_model=dict)
async def calculate_cha2ds2_vasc(request: CHA2DS2VAScRequest):
    """
    Calculate CHA2DS2-VASc score for stroke risk in atrial fibrillation.
    """
    try:
        sex = Sex.MALE if request.sex.lower() == "male" else Sex.FEMALE

        result = MedicalCalculators.cha2ds2_vasc(
            age=request.age,
            sex=sex,
            chf=request.chf,
            hypertension=request.hypertension,
            stroke_tia_history=request.stroke_tia_history,
            vascular_disease=request.vascular_disease,
            diabetes=request.diabetes,
        )

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/ckd-epi", response_model=dict)
async def calculate_ckd_epi(request: CKDEPIRequest):
    """
    Calculate eGFR using CKD-EPI 2021 equation (race-free).
    """
    try:
        sex = Sex.MALE if request.sex.lower() == "male" else Sex.FEMALE

        result = MedicalCalculators.ckd_epi_2021(creatinine=request.creatinine, age=request.age, sex=sex)

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/meld-na", response_model=dict)
async def calculate_meld_na(request: MELDNaRequest):
    """
    Calculate MELD-Na score for liver disease severity.
    """
    try:
        result = MedicalCalculators.meld_na(
            bilirubin=request.bilirubin,
            inr=request.inr,
            creatinine=request.creatinine,
            sodium=request.sodium,
            dialysis_twice_past_week=request.dialysis_twice_past_week,
        )

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/sofa", response_model=dict)
async def calculate_sofa(request: SOFARequest):
    """
    Calculate SOFA score for organ dysfunction.
    """
    try:
        result = MedicalCalculators.sofa(
            pao2_fio2=request.pao2_fio2,
            platelets=request.platelets,
            bilirubin=request.bilirubin,
            cardiovascular=request.cardiovascular,
            gcs=request.gcs,
            creatinine=request.creatinine,
            urine_output_24h=request.urine_output_24h,
        )

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/bmi", response_model=dict)
async def calculate_bmi(request: BMIRequest):
    """
    Calculate Body Mass Index.
    """
    try:
        result = MedicalCalculators.bmi(weight=request.weight, height=request.height)

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/anion-gap", response_model=dict)
async def calculate_anion_gap(request: AnionGapRequest):
    """
    Calculate serum anion gap with optional albumin correction.
    """
    try:
        result = MedicalCalculators.anion_gap(
            sodium=request.sodium, chloride=request.chloride, bicarbonate=request.bicarbonate, albumin=request.albumin
        )

        return _format_calculator_result(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculators/generic", response_model=dict)
async def calculate_generic(request: CalculatorInputRequest):
    """
    Generic calculator endpoint - specify calculator name and parameters.

    Use /calculators endpoint to list available calculators.
    """
    calculator_map = {
        "cha2ds2_vasc": MedicalCalculators.cha2ds2_vasc,
        "heart_score": MedicalCalculators.heart_score,
        "wells_dvt": MedicalCalculators.wells_dvt,
        "wells_pe": MedicalCalculators.wells_pe,
        "ckd_epi_2021": MedicalCalculators.ckd_epi_2021,
        "cockcroft_gault": MedicalCalculators.cockcroft_gault,
        "meld_na": MedicalCalculators.meld_na,
        "child_pugh": MedicalCalculators.child_pugh,
        "fib4": MedicalCalculators.fib4,
        "sofa": MedicalCalculators.sofa,
        "qsofa": MedicalCalculators.qsofa,
        "curb65": MedicalCalculators.curb65,
        "news2": MedicalCalculators.news2,
        "bmi": MedicalCalculators.bmi,
        "bsa_dubois": MedicalCalculators.bsa_dubois,
        "anion_gap": MedicalCalculators.anion_gap,
        "corrected_calcium": MedicalCalculators.corrected_calcium,
        "aa_gradient": MedicalCalculators.aa_gradient,
        "ideal_body_weight": MedicalCalculators.ideal_body_weight,
        "adjusted_body_weight": MedicalCalculators.adjusted_body_weight,
        "osmolality_serum": MedicalCalculators.osmolality_serum,
    }

    if request.calculator_name not in calculator_map:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown calculator: {request.calculator_name}. " f"Available: {list(calculator_map.keys())}",
        )

    try:
        # Convert sex parameter if present
        params = request.parameters.copy()
        if "sex" in params:
            params["sex"] = Sex.MALE if params["sex"].lower() == "male" else Sex.FEMALE

        calculator_func = calculator_map[request.calculator_name]
        result = calculator_func(**params)

        return _format_calculator_result(result)
    except TypeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameters: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _format_calculator_result(result: CalculatorResult) -> dict:
    """Format calculator result for API response."""
    return {
        "calculator_name": result.calculator_name,
        "score": result.score,
        "unit": result.unit,
        "risk_level": result.risk_level.value if result.risk_level else None,
        "interpretation": result.interpretation,
        "recommendations": result.recommendations,
        "components": result.components,
        "references": result.references,
        "warnings": result.warnings,
    }


# =============================================================================
# HEALTH CHECK
# =============================================================================


@router.get("/health")
async def health_check():
    """Check health of external medical integration services."""
    return {
        "status": "healthy",
        "services": {"uptodate": "configured", "pubmed": "available", "calculators": "available"},
        "calculator_count": len(list_calculators()),
    }
