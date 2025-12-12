"""
Knowledge Graph API endpoints.

Provides entity extraction, relationship management, and graph queries
for medical knowledge discovery.
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.logging import get_logger
from app.models.entity import Entity, EntityMention, EntityRelationship
from app.services.auth import get_current_active_user, require_admin
from app.services.knowledge_graph_service import KnowledgeGraphService
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/knowledge-graph", tags=["knowledge-graph"])


# Request/Response Models
class EntitySearchRequest(BaseModel):
    """Entity search parameters."""

    query: str = Field(..., min_length=1, description="Search query")
    entity_type: Optional[str] = Field(None, description="Filter by entity type")
    limit: int = Field(20, ge=1, le=100, description="Maximum results")


class EntityResponse(BaseModel):
    """Entity response model."""

    id: str
    name: str
    canonical_name: Optional[str]
    entity_type: str
    aliases: Optional[List[str]]
    external_ids: Optional[Dict[str, Any]]
    description: Optional[str]
    mention_count: int
    document_count: int


class EntityBriefResponse(BaseModel):
    """Brief entity response for listings."""

    id: str
    name: str
    entity_type: str
    mention_count: int


class RelationshipResponse(BaseModel):
    """Entity relationship response."""

    id: str
    source_entity_id: str
    target_entity_id: str
    relationship_type: str
    evidence_text: Optional[str]
    confidence: Optional[float]


class EntityWithRelationshipsResponse(BaseModel):
    """Entity with its relationships."""

    entity: EntityResponse
    incoming: List[Dict[str, Any]]
    outgoing: List[Dict[str, Any]]


class PathResponse(BaseModel):
    """Path between entities."""

    path: List[Dict[str, Any]]
    length: int


class ExtractionRequest(BaseModel):
    """Document extraction request."""

    force_reprocess: bool = Field(False, description="Force re-extraction even if already processed")


class ExtractionStatusResponse(BaseModel):
    """Extraction status response."""

    document_id: str
    status: str
    entities_count: Optional[int]
    relationships_count: Optional[int]
    extraction_method: Optional[str]
    error_message: Optional[str]


class ManualEntityRequest(BaseModel):
    """Request to create a manual entity."""

    name: str = Field(..., min_length=1, max_length=500)
    entity_type: str = Field(..., min_length=1, max_length=50)
    canonical_name: Optional[str] = Field(None, max_length=500)
    aliases: Optional[List[str]] = None
    external_ids: Optional[Dict[str, str]] = None
    description: Optional[str] = None


class ManualRelationshipRequest(BaseModel):
    """Request to create a manual relationship."""

    source_entity_id: str
    target_entity_id: str
    relationship_type: str = Field(..., min_length=1, max_length=100)
    evidence_text: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)


class GraphStatsResponse(BaseModel):
    """Knowledge graph statistics."""

    total_entities: int
    total_relationships: int
    total_mentions: int
    entities_by_type: Dict[str, int]
    relationships_by_type: Dict[str, int]
    top_entities: List[EntityBriefResponse]


# Helper function
def get_knowledge_graph_service(db: Session = Depends(get_db)) -> KnowledgeGraphService:
    """Get knowledge graph service instance."""
    return KnowledgeGraphService(db)


# ============ Entity Search Endpoints ============


@router.get("/entities/search", response_model=List[EntityBriefResponse])
async def search_entities(
    query: str = Query(..., min_length=1, description="Search query"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """
    Search for entities by name, canonical name, or aliases.

    Returns brief entity information suitable for autocomplete or listings.
    """
    service = KnowledgeGraphService(db)
    entities = service.search_entities(query=query, entity_type=entity_type, limit=limit)

    return [entity.to_brief() for entity in entities]


@router.get("/entities/{entity_id}", response_model=EntityWithRelationshipsResponse)
async def get_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get detailed entity information including relationships.

    Returns the entity with all incoming and outgoing relationships.
    """
    service = KnowledgeGraphService(db)
    result = service.get_entity_relationships(entity_id)

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    return result


@router.get("/entities/{entity_id}/mentions")
async def get_entity_mentions(
    entity_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get all document mentions for an entity.

    Returns paginated list of where this entity appears in the knowledge base.
    """
    # Verify entity exists
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    # Get mentions with pagination
    offset = (page - 1) * page_size
    mentions_query = db.query(EntityMention).filter(EntityMention.entity_id == entity_id)

    total = mentions_query.count()
    mentions = mentions_query.order_by(EntityMention.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "entity_id": entity_id,
        "entity_name": entity.display_name,
        "total": total,
        "page": page,
        "page_size": page_size,
        "mentions": [m.to_dict() for m in mentions],
    }


# ============ Relationship Endpoints ============


@router.get("/relationships/types")
async def get_relationship_types(
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get all valid relationship types.

    Returns the list of supported relationship types with descriptions.
    """
    return {
        "types": [
            {"type": "treats", "description": "Drug/procedure treats condition"},
            {"type": "causes", "description": "Entity causes condition/symptom"},
            {"type": "contraindicated_with", "description": "Drug contraindicated with condition/drug"},
            {"type": "interacts_with", "description": "Drug-drug interaction"},
            {"type": "symptom_of", "description": "Symptom is associated with condition"},
            {"type": "side_effect_of", "description": "Side effect of drug/procedure"},
            {"type": "located_in", "description": "Anatomical location relationship"},
            {"type": "diagnosed_by", "description": "Condition diagnosed by test/procedure"},
            {"type": "part_of", "description": "Anatomical part-of relationship"},
        ]
    }


@router.get("/path")
async def find_path_between_entities(
    source_id: str = Query(..., description="Source entity ID"),
    target_id: str = Query(..., description="Target entity ID"),
    max_depth: int = Query(3, ge=1, le=5, description="Maximum path length"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Find shortest path between two entities.

    Uses BFS to find the shortest relationship path connecting two entities.
    """
    service = KnowledgeGraphService(db)
    path = service.find_path(source_id, target_id, max_depth)

    if not path:
        return {"path": [], "length": 0, "message": "No path found between entities"}

    return {"path": path, "length": len(path)}


# ============ Entity Type Endpoints ============


@router.get("/entity-types")
async def get_entity_types(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get all entity types with counts.

    Returns the distribution of entities across types.
    """
    from sqlalchemy import func

    type_counts = (
        db.query(Entity.entity_type, func.count(Entity.id).label("count"))
        .group_by(Entity.entity_type)
        .order_by(func.count(Entity.id).desc())
        .all()
    )

    return {
        "types": [
            {"type": "drug", "description": "Medications and pharmaceutical compounds"},
            {"type": "condition", "description": "Medical conditions and diseases"},
            {"type": "procedure", "description": "Medical procedures and interventions"},
            {"type": "anatomy", "description": "Anatomical structures and body parts"},
            {"type": "symptom", "description": "Signs and symptoms"},
            {"type": "test", "description": "Diagnostic tests and lab values"},
            {"type": "device", "description": "Medical devices and equipment"},
            {"type": "organism", "description": "Pathogens and organisms"},
            {"type": "other", "description": "Other medical entities"},
        ],
        "counts": {row[0]: row[1] for row in type_counts},
    }


@router.get("/entities/by-type/{entity_type}")
async def get_entities_by_type(
    entity_type: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    sort_by: str = Query("mention_count", description="Sort field: name, mention_count, document_count"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get all entities of a specific type.

    Returns paginated list of entities filtered by type.
    """
    offset = (page - 1) * page_size
    query = db.query(Entity).filter(Entity.entity_type == entity_type)

    total = query.count()

    # Apply sorting
    if sort_by == "name":
        query = query.order_by(Entity.name)
    elif sort_by == "document_count":
        query = query.order_by(Entity.document_count.desc())
    else:  # mention_count
        query = query.order_by(Entity.mention_count.desc())

    entities = query.offset(offset).limit(page_size).all()

    return {
        "entity_type": entity_type,
        "total": total,
        "page": page,
        "page_size": page_size,
        "entities": [e.to_brief() for e in entities],
    }


# ============ Document Extraction Endpoints ============


@router.post("/documents/{document_id}/extract")
async def extract_entities_from_document(
    document_id: str,
    request: ExtractionRequest = ExtractionRequest(),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Extract entities and relationships from a document.

    Processes document text to identify medical entities and their relationships.
    This operation may take several seconds for large documents.
    """
    service = KnowledgeGraphService(db)

    try:
        result = await service.extract_entities_from_document(
            document_id=document_id, force_reprocess=request.force_reprocess
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("entity_extraction_failed", document_id=document_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Extraction failed: {str(e)}"
        )


@router.get("/documents/{document_id}/extraction-status")
async def get_extraction_status(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get entity extraction status for a document.

    Returns the current extraction status and statistics.
    """
    from app.models.entity import DocumentEntityExtraction

    extraction = db.query(DocumentEntityExtraction).filter(DocumentEntityExtraction.document_id == document_id).first()

    if not extraction:
        return {"document_id": document_id, "status": "not_started", "entities_count": None, "relationships_count": None}

    return extraction.to_dict()


@router.get("/documents/{document_id}/entities")
async def get_document_entities(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get all entities mentioned in a document.

    Returns entities grouped by type with mention counts.
    """
    from sqlalchemy import func

    # Get entities with mention counts for this document
    results = (
        db.query(Entity, func.count(EntityMention.id).label("doc_mentions"))
        .join(EntityMention, Entity.id == EntityMention.entity_id)
        .filter(EntityMention.document_id == document_id)
        .group_by(Entity.id)
        .order_by(func.count(EntityMention.id).desc())
        .all()
    )

    # Group by type
    by_type: Dict[str, List[Dict]] = {}
    for entity, doc_mentions in results:
        entity_type = entity.entity_type
        if entity_type not in by_type:
            by_type[entity_type] = []
        by_type[entity_type].append(
            {"id": str(entity.id), "name": entity.display_name, "mentions_in_document": doc_mentions}
        )

    return {"document_id": document_id, "total_entities": len(results), "entities_by_type": by_type}


# ============ Graph Statistics Endpoints ============


@router.get("/stats")
async def get_graph_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get knowledge graph statistics.

    Returns overall statistics about the knowledge graph.
    """
    from sqlalchemy import func

    # Count totals
    total_entities = db.query(func.count(Entity.id)).scalar() or 0
    total_relationships = db.query(func.count(EntityRelationship.id)).scalar() or 0
    total_mentions = db.query(func.count(EntityMention.id)).scalar() or 0

    # Entities by type
    type_counts = (
        db.query(Entity.entity_type, func.count(Entity.id)).group_by(Entity.entity_type).all()
    )
    entities_by_type = {row[0]: row[1] for row in type_counts}

    # Relationships by type
    rel_counts = (
        db.query(EntityRelationship.relationship_type, func.count(EntityRelationship.id))
        .group_by(EntityRelationship.relationship_type)
        .all()
    )
    relationships_by_type = {row[0]: row[1] for row in rel_counts}

    # Top entities by mention count
    top_entities = db.query(Entity).order_by(Entity.mention_count.desc()).limit(10).all()

    return {
        "total_entities": total_entities,
        "total_relationships": total_relationships,
        "total_mentions": total_mentions,
        "entities_by_type": entities_by_type,
        "relationships_by_type": relationships_by_type,
        "top_entities": [e.to_brief() for e in top_entities],
    }


# ============ Admin Endpoints ============


@router.post("/admin/entities", response_model=EntityResponse)
async def create_entity_manual(
    request: ManualEntityRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Manually create an entity (admin only).

    Creates a new entity without document extraction.
    """
    # Check for existing entity with same name and type
    existing = (
        db.query(Entity)
        .filter(Entity.name == request.name, Entity.entity_type == request.entity_type)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entity '{request.name}' of type '{request.entity_type}' already exists",
        )

    entity = Entity(
        name=request.name,
        entity_type=request.entity_type,
        canonical_name=request.canonical_name,
        aliases=request.aliases,
        external_ids=request.external_ids,
        description=request.description,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)

    logger.info("entity_created_manual", entity_id=str(entity.id), name=request.name, entity_type=request.entity_type)

    return entity.to_dict()


@router.put("/admin/entities/{entity_id}")
async def update_entity(
    entity_id: str,
    request: ManualEntityRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Update an entity (admin only).

    Allows editing entity details like canonical name, aliases, etc.
    """
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    entity.name = request.name
    entity.entity_type = request.entity_type
    entity.canonical_name = request.canonical_name
    entity.aliases = request.aliases
    entity.external_ids = request.external_ids
    entity.description = request.description

    db.commit()
    db.refresh(entity)

    logger.info("entity_updated", entity_id=entity_id)

    return entity.to_dict()


@router.delete("/admin/entities/{entity_id}")
async def delete_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Delete an entity (admin only).

    Removes entity and all associated mentions and relationships.
    """
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    entity_name = entity.name
    db.delete(entity)
    db.commit()

    logger.info("entity_deleted", entity_id=entity_id, name=entity_name)

    return {"status": "deleted", "entity_id": entity_id}


@router.post("/admin/relationships")
async def create_relationship_manual(
    request: ManualRelationshipRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Manually create a relationship between entities (admin only).
    """
    # Validate relationship type
    if request.relationship_type not in EntityRelationship.VALID_RELATIONSHIP_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid relationship type. Valid types: {EntityRelationship.VALID_RELATIONSHIP_TYPES}",
        )

    # Verify both entities exist
    source = db.query(Entity).filter(Entity.id == request.source_entity_id).first()
    target = db.query(Entity).filter(Entity.id == request.target_entity_id).first()

    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source entity not found")
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target entity not found")

    # Check for existing relationship
    existing = (
        db.query(EntityRelationship)
        .filter(
            EntityRelationship.source_entity_id == request.source_entity_id,
            EntityRelationship.target_entity_id == request.target_entity_id,
            EntityRelationship.relationship_type == request.relationship_type,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Relationship already exists")

    relationship = EntityRelationship(
        source_entity_id=request.source_entity_id,
        target_entity_id=request.target_entity_id,
        relationship_type=request.relationship_type,
        evidence_text=request.evidence_text,
        confidence=request.confidence or 1.0,
        extraction_method="manual",
    )
    db.add(relationship)
    db.commit()
    db.refresh(relationship)

    logger.info(
        "relationship_created_manual",
        relationship_id=str(relationship.id),
        source_id=request.source_entity_id,
        target_id=request.target_entity_id,
        type=request.relationship_type,
    )

    return relationship.to_dict()


@router.delete("/admin/relationships/{relationship_id}")
async def delete_relationship(
    relationship_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Delete a relationship (admin only).
    """
    relationship = db.query(EntityRelationship).filter(EntityRelationship.id == relationship_id).first()
    if not relationship:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    db.delete(relationship)
    db.commit()

    logger.info("relationship_deleted", relationship_id=relationship_id)

    return {"status": "deleted", "relationship_id": relationship_id}


@router.post("/admin/bulk-extract")
async def bulk_extract_entities(
    document_ids: List[str],
    force_reprocess: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    Queue multiple documents for entity extraction (admin only).

    Processes documents in sequence. For large batches, consider using
    background job processing.
    """
    if len(document_ids) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50 documents per bulk extraction request",
        )

    service = KnowledgeGraphService(db)
    results = []

    for doc_id in document_ids:
        try:
            result = await service.extract_entities_from_document(
                document_id=doc_id, force_reprocess=force_reprocess
            )
            results.append({"document_id": doc_id, "status": "success", "result": result})
        except Exception as e:
            results.append({"document_id": doc_id, "status": "error", "error": str(e)})

    successful = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "error")

    return {
        "total": len(document_ids),
        "successful": successful,
        "failed": failed,
        "results": results,
    }


@router.get("/admin/extractions")
async def list_extraction_statuses(
    status_filter: Optional[str] = Query(None, description="Filter by status: pending, processing, complete, failed"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
) -> Dict[str, Any]:
    """
    List all document extraction statuses (admin only).
    """
    from app.models.entity import DocumentEntityExtraction

    query = db.query(DocumentEntityExtraction)

    if status_filter:
        query = query.filter(DocumentEntityExtraction.status == status_filter)

    total = query.count()
    offset = (page - 1) * page_size

    extractions = query.order_by(DocumentEntityExtraction.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "extractions": [e.to_dict() for e in extractions],
    }
