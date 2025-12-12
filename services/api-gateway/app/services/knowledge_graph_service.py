"""
Knowledge Graph Service for medical entity extraction and relationship management.

Provides:
- Entity extraction from documents using LLM
- Relationship extraction between entities
- Entity deduplication and canonicalization
- Graph queries and traversal
- Optional Neo4j integration
"""

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.logging import get_logger
from app.models.document import Document
from app.models.entity import DocumentEntityExtraction, Entity, EntityMention, EntityRelationship
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

logger = get_logger(__name__)


@dataclass
class ExtractedEntity:
    """Entity extracted from text."""

    text: str
    entity_type: str
    start_char: int = 0
    end_char: int = 0
    confidence: float = 0.0
    canonical_name: Optional[str] = None
    external_ids: Dict[str, str] = field(default_factory=dict)


@dataclass
class ExtractedRelationship:
    """Relationship extracted from text."""

    source_name: str
    target_name: str
    relationship_type: str
    evidence: str = ""
    confidence: float = 0.0


class KnowledgeGraphService:
    """
    Service for building and querying the medical knowledge graph.

    Extracts entities and relationships from documents,
    stores them in PostgreSQL, with optional Neo4j sync.
    """

    ENTITY_EXTRACTION_PROMPT = """Extract medical entities from this text.

Text:
{text}

Identify all medical entities and categorize them:
- drug: medications, compounds, pharmaceutical agents
- condition: diseases, disorders, syndromes
- procedure: medical procedures, surgeries, treatments
- anatomy: body parts, organs, tissues
- symptom: signs, symptoms, clinical findings
- test: diagnostic tests, lab values, imaging
- device: medical devices, equipment

Return a JSON array of entities:
[
  {{"text": "exact text from passage", "type": "drug|condition|procedure|anatomy|symptom|test|device", "canonical_name": "standard medical term if different"}}
]

Return ONLY valid JSON array."""

    RELATIONSHIP_EXTRACTION_PROMPT = """Identify medical relationships between these entities in the text.

Entities: {entities}

Text:
{text}

Valid relationship types:
- treats: drug/procedure treats a condition
- causes: entity causes another condition/symptom
- contraindicated_with: should not be used together
- interacts_with: drug-drug interaction
- symptom_of: symptom indicates a condition
- side_effect_of: adverse effect of a drug/procedure
- diagnosed_by: condition diagnosed by a test
- located_in: anatomical location

Return a JSON array:
[
  {{"source": "entity name", "target": "entity name", "type": "relationship type", "evidence": "quote from text"}}
]

Only include relationships clearly supported by the text. Return ONLY valid JSON array."""

    def __init__(self, db: Session, openai_client=None, neo4j_driver=None):
        """
        Initialize knowledge graph service.

        Args:
            db: SQLAlchemy session
            openai_client: Optional AsyncOpenAI client
            neo4j_driver: Optional Neo4j driver for graph database
        """
        self.db = db
        self._openai = openai_client
        self._neo4j = neo4j_driver

    async def _get_openai(self):
        """Lazily initialize OpenAI client."""
        if self._openai is None:
            from openai import AsyncOpenAI

            self._openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._openai

    async def extract_entities_from_document(
        self,
        document_id: str,
        force_reprocess: bool = False,
    ) -> Dict[str, Any]:
        """
        Extract entities and relationships from a document.

        Args:
            document_id: Document UUID
            force_reprocess: Force re-extraction even if already done

        Returns:
            Summary of extraction results
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return {"error": "Invalid document ID"}

        # Check existing extraction
        extraction = (
            self.db.query(DocumentEntityExtraction)
            .filter(DocumentEntityExtraction.document_id == doc_uuid)
            .first()
        )

        if extraction and extraction.status == "complete" and not force_reprocess:
            return {
                "status": "already_complete",
                "entities_count": extraction.entities_count,
                "relationships_count": extraction.relationships_count,
            }

        # Get document
        document = self.db.query(Document).filter(Document.id == doc_uuid).first()
        if not document:
            return {"error": "Document not found"}

        # Create or update extraction record
        if not extraction:
            extraction = DocumentEntityExtraction(document_id=doc_uuid)
            self.db.add(extraction)

        extraction.mark_processing()
        extraction.extraction_method = "llm"
        self.db.commit()

        try:
            # Get document content
            content = self._get_document_content(document)
            if not content:
                extraction.mark_failed("No content found in document")
                self.db.commit()
                return {"error": "No content found"}

            # Extract entities from content chunks
            all_entities: List[ExtractedEntity] = []
            all_relationships: List[ExtractedRelationship] = []

            # Process in chunks
            chunks = self._split_content(content)
            for i, chunk in enumerate(chunks):
                chunk_entities = await self._extract_entities(chunk["text"])
                all_entities.extend(chunk_entities)

                # Extract relationships if we have entities
                if chunk_entities:
                    entity_names = [e.canonical_name or e.text for e in chunk_entities]
                    relationships = await self._extract_relationships(chunk["text"], entity_names)
                    all_relationships.extend(relationships)

            # Deduplicate and store entities
            stored_entities = await self._store_entities(all_entities, doc_uuid)

            # Store relationships
            stored_relationships = await self._store_relationships(
                all_relationships, stored_entities, doc_uuid
            )

            # Update extraction record
            extraction.mark_complete(len(stored_entities), len(stored_relationships))
            self.db.commit()

            logger.info(
                f"Entity extraction complete for {document_id}: "
                f"{len(stored_entities)} entities, {len(stored_relationships)} relationships"
            )

            return {
                "status": "complete",
                "entities_count": len(stored_entities),
                "relationships_count": len(stored_relationships),
                "entities": [e.to_brief() for e in stored_entities.values()],
            }

        except Exception as e:
            extraction.mark_failed(str(e))
            self.db.commit()
            logger.error(f"Entity extraction failed: {e}", exc_info=True)
            return {"error": str(e)}

    def _get_document_content(self, document: Document) -> str:
        """Get text content from document."""
        # Try enhanced structure first
        if document.enhanced_structure:
            pages = document.enhanced_structure.get("pages", [])
            texts = []
            for page in pages:
                if "voice_narration" in page:
                    texts.append(page["voice_narration"])
                elif "content_blocks" in page:
                    for block in page["content_blocks"]:
                        if block.get("type") == "text":
                            texts.append(block.get("content", ""))
            if texts:
                return "\n\n".join(texts)

        # Fall back to raw text
        if document.raw_text:
            return document.raw_text

        return ""

    def _split_content(self, content: str, max_chars: int = 4000) -> List[Dict[str, Any]]:
        """Split content into chunks for processing."""
        chunks = []
        words = content.split()
        current_chunk = []
        current_length = 0

        for word in words:
            if current_length + len(word) > max_chars and current_chunk:
                chunks.append({"text": " ".join(current_chunk)})
                current_chunk = []
                current_length = 0
            current_chunk.append(word)
            current_length += len(word) + 1

        if current_chunk:
            chunks.append({"text": " ".join(current_chunk)})

        return chunks

    async def _extract_entities(self, text: str) -> List[ExtractedEntity]:
        """Extract entities from text using LLM."""
        if not text.strip():
            return []

        try:
            openai = await self._get_openai()

            completion = await openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a medical entity extractor. Extract entities accurately.",
                    },
                    {
                        "role": "user",
                        "content": self.ENTITY_EXTRACTION_PROMPT.format(text=text[:4000]),
                    },
                ],
                temperature=0.0,
                max_tokens=2000,
            )

            content = completion.choices[0].message.content.strip()

            # Parse JSON
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            entities_data = json.loads(content)

            entities = []
            for ent in entities_data:
                entities.append(
                    ExtractedEntity(
                        text=ent.get("text", ""),
                        entity_type=ent.get("type", "other"),
                        canonical_name=ent.get("canonical_name"),
                        confidence=0.8,  # Default confidence for LLM extraction
                    )
                )

            return entities

        except Exception as e:
            logger.warning(f"Entity extraction failed: {e}")
            return []

    async def _extract_relationships(
        self,
        text: str,
        entity_names: List[str],
    ) -> List[ExtractedRelationship]:
        """Extract relationships between entities using LLM."""
        if len(entity_names) < 2:
            return []

        try:
            openai = await self._get_openai()

            completion = await openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a medical relationship extractor. Extract relationships accurately.",
                    },
                    {
                        "role": "user",
                        "content": self.RELATIONSHIP_EXTRACTION_PROMPT.format(
                            entities=", ".join(entity_names[:20]),  # Limit entities
                            text=text[:3000],
                        ),
                    },
                ],
                temperature=0.0,
                max_tokens=1500,
            )

            content = completion.choices[0].message.content.strip()

            # Parse JSON
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            relationships_data = json.loads(content)

            relationships = []
            for rel in relationships_data:
                rel_type = rel.get("type", "").lower().replace(" ", "_").replace("-", "_")
                if rel_type in EntityRelationship.VALID_RELATIONSHIP_TYPES:
                    relationships.append(
                        ExtractedRelationship(
                            source_name=rel.get("source", ""),
                            target_name=rel.get("target", ""),
                            relationship_type=rel_type,
                            evidence=rel.get("evidence", ""),
                            confidence=0.7,
                        )
                    )

            return relationships

        except Exception as e:
            logger.warning(f"Relationship extraction failed: {e}")
            return []

    async def _store_entities(
        self,
        extracted: List[ExtractedEntity],
        document_id: uuid.UUID,
    ) -> Dict[str, Entity]:
        """Deduplicate and store entities, return mapping."""
        entity_map: Dict[str, Entity] = {}
        seen_names: Set[str] = set()

        for ext in extracted:
            name = ext.canonical_name or ext.text
            name_lower = name.lower().strip()

            if not name_lower or name_lower in seen_names:
                continue
            seen_names.add(name_lower)

            # Check if entity exists
            existing = (
                self.db.query(Entity)
                .filter(
                    or_(
                        func.lower(Entity.name) == name_lower,
                        func.lower(Entity.canonical_name) == name_lower,
                    )
                )
                .first()
            )

            if existing:
                entity = existing
                entity.increment_mention_count()
            else:
                entity = Entity(
                    name=ext.text,
                    canonical_name=ext.canonical_name,
                    entity_type=ext.entity_type,
                    external_ids=ext.external_ids if ext.external_ids else None,
                    mention_count=1,
                    document_count=1,
                )
                self.db.add(entity)
                self.db.flush()

            entity_map[name_lower] = entity

            # Create mention
            mention = EntityMention(
                entity_id=entity.id,
                document_id=document_id,
                start_char=ext.start_char,
                end_char=ext.end_char,
                confidence=ext.confidence,
                extraction_method="llm",
            )
            self.db.add(mention)

        self.db.commit()
        return entity_map

    async def _store_relationships(
        self,
        extracted: List[ExtractedRelationship],
        entity_map: Dict[str, Entity],
        document_id: uuid.UUID,
    ) -> List[EntityRelationship]:
        """Store relationships between entities."""
        stored = []

        for rel in extracted:
            source_key = rel.source_name.lower().strip()
            target_key = rel.target_name.lower().strip()

            source = entity_map.get(source_key)
            target = entity_map.get(target_key)

            if not source or not target:
                continue

            # Check for existing relationship
            existing = (
                self.db.query(EntityRelationship)
                .filter(
                    and_(
                        EntityRelationship.source_entity_id == source.id,
                        EntityRelationship.target_entity_id == target.id,
                        EntityRelationship.relationship_type == rel.relationship_type,
                    )
                )
                .first()
            )

            if existing:
                continue

            relationship = EntityRelationship(
                source_entity_id=source.id,
                target_entity_id=target.id,
                relationship_type=rel.relationship_type,
                evidence_text=rel.evidence,
                document_id=document_id,
                confidence=rel.confidence,
                extraction_method="llm",
            )
            self.db.add(relationship)
            stored.append(relationship)

        self.db.commit()
        return stored

    # Query Methods

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get entity by ID."""
        try:
            ent_uuid = uuid.UUID(entity_id)
            return self.db.query(Entity).filter(Entity.id == ent_uuid).first()
        except ValueError:
            return None

    def search_entities(
        self,
        query: str,
        entity_type: Optional[str] = None,
        limit: int = 20,
    ) -> List[Entity]:
        """Search entities by name."""
        search = self.db.query(Entity).filter(
            or_(
                Entity.name.ilike(f"%{query}%"),
                Entity.canonical_name.ilike(f"%{query}%"),
            )
        )

        if entity_type:
            search = search.filter(Entity.entity_type == entity_type)

        return search.order_by(Entity.mention_count.desc()).limit(limit).all()

    def get_entity_relationships(
        self,
        entity_id: str,
        relationship_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get all relationships for an entity."""
        try:
            ent_uuid = uuid.UUID(entity_id)
        except ValueError:
            return {"error": "Invalid entity ID"}

        entity = self.db.query(Entity).filter(Entity.id == ent_uuid).first()
        if not entity:
            return {"error": "Entity not found"}

        # Get outgoing relationships
        outgoing_query = self.db.query(EntityRelationship).filter(
            EntityRelationship.source_entity_id == ent_uuid
        )
        if relationship_type:
            outgoing_query = outgoing_query.filter(
                EntityRelationship.relationship_type == relationship_type
            )
        outgoing = outgoing_query.all()

        # Get incoming relationships
        incoming_query = self.db.query(EntityRelationship).filter(
            EntityRelationship.target_entity_id == ent_uuid
        )
        if relationship_type:
            incoming_query = incoming_query.filter(
                EntityRelationship.relationship_type == relationship_type
            )
        incoming = incoming_query.all()

        return {
            "entity": entity.to_dict(),
            "outgoing": [
                {
                    **r.to_dict(),
                    "target_entity": r.target_entity.to_brief() if r.target_entity else None,
                }
                for r in outgoing
            ],
            "incoming": [
                {
                    **r.to_dict(),
                    "source_entity": r.source_entity.to_brief() if r.source_entity else None,
                }
                for r in incoming
            ],
        }

    def get_document_entities(
        self,
        document_id: str,
    ) -> List[Entity]:
        """Get all entities mentioned in a document."""
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return []

        entity_ids = (
            self.db.query(EntityMention.entity_id)
            .filter(EntityMention.document_id == doc_uuid)
            .distinct()
        )

        return (
            self.db.query(Entity)
            .filter(Entity.id.in_(entity_ids))
            .order_by(Entity.mention_count.desc())
            .all()
        )

    def find_path(
        self,
        source_entity_id: str,
        target_entity_id: str,
        max_depth: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Find path between two entities in the graph.

        Uses BFS to find shortest paths.
        """
        try:
            source_uuid = uuid.UUID(source_entity_id)
            target_uuid = uuid.UUID(target_entity_id)
        except ValueError:
            return []

        # BFS for path finding
        visited = {source_uuid}
        queue = [(source_uuid, [])]

        while queue:
            current, path = queue.pop(0)

            if len(path) >= max_depth:
                continue

            # Get relationships from current
            relationships = (
                self.db.query(EntityRelationship)
                .filter(EntityRelationship.source_entity_id == current)
                .all()
            )

            for rel in relationships:
                if rel.target_entity_id == target_uuid:
                    # Found path
                    return path + [rel.to_dict()]

                if rel.target_entity_id not in visited:
                    visited.add(rel.target_entity_id)
                    queue.append((rel.target_entity_id, path + [rel.to_dict()]))

        return []  # No path found

    def get_stats(self) -> Dict[str, Any]:
        """Get knowledge graph statistics."""
        entity_counts = dict(
            self.db.query(Entity.entity_type, func.count(Entity.id))
            .group_by(Entity.entity_type)
            .all()
        )

        relationship_counts = dict(
            self.db.query(EntityRelationship.relationship_type, func.count(EntityRelationship.id))
            .group_by(EntityRelationship.relationship_type)
            .all()
        )

        total_entities = self.db.query(Entity).count()
        total_relationships = self.db.query(EntityRelationship).count()
        total_mentions = self.db.query(EntityMention).count()

        return {
            "total_entities": total_entities,
            "total_relationships": total_relationships,
            "total_mentions": total_mentions,
            "entities_by_type": entity_counts,
            "relationships_by_type": relationship_counts,
        }


def get_knowledge_graph_service(db: Session) -> KnowledgeGraphService:
    """Factory function to get KnowledgeGraphService."""
    return KnowledgeGraphService(db)
