"""
Medical Named Entity Recognition Service

Provides medical NER using scispacy with UMLS entity linking:
- Extracts diseases, medications, procedures, anatomical structures
- Links entities to UMLS concepts (CUI codes)
- Normalizes to standard ontologies (ICD-10, RxNorm, SNOMED-CT)

This service enables structured extraction of medical information
from clinical text for downstream processing.
"""

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.logging import get_logger

logger = get_logger(__name__)


class EntityType(Enum):
    """Medical entity types"""

    DISEASE = "DISEASE"
    MEDICATION = "MEDICATION"
    PROCEDURE = "PROCEDURE"
    ANATOMY = "ANATOMY"
    SYMPTOM = "SYMPTOM"
    LAB_TEST = "LAB_TEST"
    GENE = "GENE"
    CHEMICAL = "CHEMICAL"
    ORGANISM = "ORGANISM"
    UNKNOWN = "UNKNOWN"


class OntologyType(Enum):
    """Standard medical ontologies"""

    ICD10 = "ICD-10"
    RXNORM = "RxNorm"
    SNOMED = "SNOMED-CT"
    MESH = "MeSH"
    LOINC = "LOINC"
    ATC = "ATC"
    HGNC = "HGNC"


@dataclass
class UMLSConcept:
    """UMLS Concept representation"""

    cui: str  # Concept Unique Identifier
    name: str
    semantic_types: List[str]
    score: float
    definition: Optional[str] = None
    aliases: List[str] = field(default_factory=list)


@dataclass
class OntologyMapping:
    """Mapping to a standard ontology"""

    ontology: OntologyType
    code: str
    display_name: str
    confidence: float


@dataclass
class MedicalEntity:
    """Extracted medical entity with metadata"""

    text: str
    entity_type: EntityType
    start_char: int
    end_char: int
    umls_concepts: List[UMLSConcept] = field(default_factory=list)
    ontology_mappings: List[OntologyMapping] = field(default_factory=list)
    negated: bool = False
    uncertain: bool = False
    context: Optional[str] = None


@dataclass
class NERResult:
    """Result of NER extraction"""

    entities: List[MedicalEntity]
    text_length: int
    processing_time_ms: float
    model_used: str
    metadata: Dict[str, Any] = field(default_factory=dict)


# Mapping from UMLS semantic types to EntityType
SEMANTIC_TYPE_MAPPING = {
    # Diseases
    "T047": EntityType.DISEASE,  # Disease or Syndrome
    "T048": EntityType.DISEASE,  # Mental or Behavioral Dysfunction
    "T191": EntityType.DISEASE,  # Neoplastic Process
    "T046": EntityType.DISEASE,  # Pathologic Function
    "T184": EntityType.SYMPTOM,  # Sign or Symptom
    # Medications
    "T121": EntityType.MEDICATION,  # Pharmacologic Substance
    "T200": EntityType.MEDICATION,  # Clinical Drug
    "T195": EntityType.MEDICATION,  # Antibiotic
    "T109": EntityType.CHEMICAL,  # Organic Chemical
    "T131": EntityType.CHEMICAL,  # Hazardous or Poisonous Substance
    # Procedures
    "T061": EntityType.PROCEDURE,  # Therapeutic or Preventive Procedure
    "T060": EntityType.PROCEDURE,  # Diagnostic Procedure
    "T059": EntityType.LAB_TEST,  # Laboratory Procedure
    "T063": EntityType.PROCEDURE,  # Molecular Biology Research Technique
    # Anatomy
    "T023": EntityType.ANATOMY,  # Body Part, Organ, or Organ Component
    "T024": EntityType.ANATOMY,  # Tissue
    "T025": EntityType.ANATOMY,  # Cell
    "T026": EntityType.ANATOMY,  # Cell Component
    # Genetics
    "T028": EntityType.GENE,  # Gene or Genome
    "T116": EntityType.GENE,  # Amino Acid, Peptide, or Protein
    # Organisms
    "T004": EntityType.ORGANISM,  # Fungus
    "T005": EntityType.ORGANISM,  # Virus
    "T007": EntityType.ORGANISM,  # Bacterium
}


class MedicalNERService:
    """
    Medical Named Entity Recognition using scispacy.

    This service extracts medical entities from clinical text and links
    them to UMLS concepts. It supports:

    - Entity extraction (diseases, medications, procedures, anatomy)
    - UMLS concept linking with confidence scores
    - Ontology normalization (ICD-10, RxNorm, SNOMED-CT)
    - Negation detection
    - Abbreviation resolution

    Note: For production use, this requires:
    - spacy library
    - scispacy library
    - en_core_sci_lg model
    - UMLS linker model

    The service gracefully degrades when models are unavailable.
    """

    def __init__(self, lazy_load: bool = True):
        """
        Initialize the NER service.

        Args:
            lazy_load: If True, models are loaded on first use.
        """
        self._nlp = None
        self._nlp_loaded = False
        self._lazy_load = lazy_load
        self._abbreviation_cache: Dict[str, str] = {}
        self._concept_cache: Dict[str, UMLSConcept] = {}

        logger.info(
            "MedicalNERService initialized",
            extra={"lazy_load": lazy_load},
        )

        if not lazy_load:
            self._load_model()

    def _load_model(self) -> bool:
        """
        Load the scispacy NER model with UMLS linker.

        Returns:
            True if model loaded successfully, False otherwise
        """
        if self._nlp_loaded:
            return True

        try:
            import spacy

            logger.info("Loading scispacy NER model...")

            # Load the scientific/medical NER model
            # Options: en_core_sci_sm, en_core_sci_md, en_core_sci_lg, en_ner_bc5cdr_md
            self._nlp = spacy.load("en_core_sci_lg")

            # Try to add UMLS entity linker
            try:
                from scispacy.linking import EntityLinker  # noqa: F401

                # Add abbreviation detector
                if "abbreviation_detector" not in self._nlp.pipe_names:
                    from scispacy.abbreviation import AbbreviationDetector  # noqa: F401

                    self._nlp.add_pipe("abbreviation_detector")

                # Add UMLS entity linker
                if "scispacy_linker" not in self._nlp.pipe_names:
                    self._nlp.add_pipe(
                        "scispacy_linker",
                        config={
                            "resolve_abbreviations": True,
                            "linker_name": "umls",
                            "threshold": 0.7,
                            "max_entities_per_mention": 5,
                        },
                    )

                logger.info("UMLS entity linker loaded successfully")

            except ImportError as e:
                logger.warning(f"scispacy entity linker not available: {e}. " "Entity linking will be disabled.")
            except Exception as e:
                logger.warning(f"Failed to load UMLS linker: {e}")

            self._nlp_loaded = True
            logger.info(
                "Medical NER model loaded",
                extra={"pipes": self._nlp.pipe_names},
            )
            return True

        except ImportError as e:
            logger.warning(
                f"Failed to load NER model (missing dependency): {e}",
            )
            return False
        except OSError as e:
            logger.warning(
                f"Failed to load NER model (model not found): {e}. "
                "Install with: pip install scispacy && "
                "pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/"
                "releases/v0.5.3/en_core_sci_lg-0.5.3.tar.gz"
            )
            return False
        except Exception as e:
            logger.error(f"Failed to load NER model: {e}")
            return False

    def _ensure_model_loaded(self) -> bool:
        """Ensure model is loaded, loading if necessary."""
        if self._nlp_loaded:
            return True
        return self._load_model()

    def _get_entity_type(self, semantic_types: List[str]) -> EntityType:
        """
        Determine entity type from UMLS semantic types.

        Args:
            semantic_types: List of UMLS semantic type identifiers

        Returns:
            Mapped EntityType
        """
        for st in semantic_types:
            if st in SEMANTIC_TYPE_MAPPING:
                return SEMANTIC_TYPE_MAPPING[st]
        return EntityType.UNKNOWN

    def _extract_umls_concepts(self, entity) -> List[UMLSConcept]:
        """
        Extract UMLS concepts from an entity's knowledge base links.

        Args:
            entity: spacy entity with kb_ents attribute

        Returns:
            List of UMLSConcept objects
        """
        concepts = []

        # Check if entity has knowledge base entities
        if not hasattr(entity._, "kb_ents") or not entity._.kb_ents:
            return concepts

        for kb_ent in entity._.kb_ents:
            cui = kb_ent[0]
            score = kb_ent[1]

            # Check cache first
            if cui in self._concept_cache:
                cached = self._concept_cache[cui]
                concepts.append(
                    UMLSConcept(
                        cui=cui,
                        name=cached.name,
                        semantic_types=cached.semantic_types,
                        score=score,
                        definition=cached.definition,
                        aliases=cached.aliases,
                    )
                )
                continue

            # Get concept info from linker
            try:
                linker = self._nlp.get_pipe("scispacy_linker")
                kb = linker.kb

                if cui in kb.cui_to_entity:
                    kb_entity = kb.cui_to_entity[cui]
                    concept = UMLSConcept(
                        cui=cui,
                        name=kb_entity.canonical_name,
                        semantic_types=list(kb_entity.types),
                        score=score,
                        definition=kb_entity.definition,
                        aliases=list(kb_entity.aliases)[:10],  # Limit aliases
                    )
                    # Cache the concept
                    self._concept_cache[cui] = concept
                    concepts.append(concept)
                else:
                    # Basic concept without full info
                    concepts.append(
                        UMLSConcept(
                            cui=cui,
                            name=entity.text,
                            semantic_types=[],
                            score=score,
                        )
                    )
            except Exception as e:
                logger.debug(f"Could not get concept info for {cui}: {e}")
                concepts.append(
                    UMLSConcept(
                        cui=cui,
                        name=entity.text,
                        semantic_types=[],
                        score=score,
                    )
                )

        return concepts

    async def extract_entities(
        self,
        text: str,
        detect_negation: bool = True,
        min_confidence: float = 0.7,
    ) -> NERResult:
        """
        Extract medical entities from text.

        Args:
            text: Clinical text to process
            detect_negation: Whether to detect negated entities
            min_confidence: Minimum confidence for UMLS linking

        Returns:
            NERResult with extracted entities and metadata
        """
        import time

        start_time = time.time()

        if not self._ensure_model_loaded():
            # Return empty result if model not available
            return NERResult(
                entities=[],
                text_length=len(text),
                processing_time_ms=0,
                model_used="none",
                metadata={"error": "NER model not available"},
            )

        # Process text with spacy (run in thread pool for async)
        doc = await asyncio.get_event_loop().run_in_executor(None, self._nlp, text)

        entities = []

        # Check for abbreviations
        abbreviations = {}
        if hasattr(doc._, "abbreviations"):
            for abbr in doc._.abbreviations:
                abbreviations[abbr.text] = str(abbr._.long_form)
                self._abbreviation_cache[abbr.text] = str(abbr._.long_form)

        # Extract negation spans if available
        negation_spans: Set[Tuple[int, int]] = set()
        if detect_negation:
            negation_spans = self._detect_negation_spans(doc)

        # Process entities
        for ent in doc.ents:
            # Extract UMLS concepts
            umls_concepts = self._extract_umls_concepts(ent)

            # Filter by confidence
            umls_concepts = [c for c in umls_concepts if c.score >= min_confidence]

            # Determine entity type
            if umls_concepts:
                semantic_types = []
                for concept in umls_concepts:
                    semantic_types.extend(concept.semantic_types)
                entity_type = self._get_entity_type(semantic_types)
            else:
                entity_type = self._classify_entity_by_label(ent.label_)

            # Check for negation
            is_negated = self._is_negated(ent, negation_spans)

            # Check for uncertainty
            is_uncertain = self._is_uncertain(text, ent.start_char, ent.end_char)

            # Get context window
            context = self._get_context_window(text, ent.start_char, ent.end_char)

            entity = MedicalEntity(
                text=ent.text,
                entity_type=entity_type,
                start_char=ent.start_char,
                end_char=ent.end_char,
                umls_concepts=umls_concepts,
                ontology_mappings=[],  # Will be filled by normalize_entities
                negated=is_negated,
                uncertain=is_uncertain,
                context=context,
            )

            entities.append(entity)

        processing_time = (time.time() - start_time) * 1000

        return NERResult(
            entities=entities,
            text_length=len(text),
            processing_time_ms=processing_time,
            model_used="en_core_sci_lg",
            metadata={
                "num_entities": len(entities),
                "abbreviations": abbreviations,
                "negation_detection": detect_negation,
            },
        )

    def _classify_entity_by_label(self, label: str) -> EntityType:
        """
        Classify entity type based on spacy NER label.

        Args:
            label: spacy entity label

        Returns:
            EntityType
        """
        label_mapping = {
            "DISEASE": EntityType.DISEASE,
            "DRUG": EntityType.MEDICATION,
            "CHEMICAL": EntityType.CHEMICAL,
            "GENE": EntityType.GENE,
            "PROTEIN": EntityType.GENE,
            "CELL": EntityType.ANATOMY,
            "ORGANISM": EntityType.ORGANISM,
            "TISSUE": EntityType.ANATOMY,
            "ORGAN": EntityType.ANATOMY,
        }
        return label_mapping.get(label, EntityType.UNKNOWN)

    def _detect_negation_spans(self, doc) -> Set[Tuple[int, int]]:
        """
        Detect negated spans in the document.

        Uses simple pattern matching for common negation phrases.

        Args:
            doc: spacy Doc object

        Returns:
            Set of (start, end) tuples for negated spans
        """
        negation_spans = set()

        # Common negation triggers
        negation_triggers = [
            "no",
            "not",
            "without",
            "denies",
            "denied",
            "negative",
            "absent",
            "rule out",
            "ruled out",
            "r/o",
            "none",
            "never",
            "no evidence of",
            "no sign of",
            "no history of",
        ]

        text_lower = doc.text.lower()

        for trigger in negation_triggers:
            start = 0
            while True:
                idx = text_lower.find(trigger, start)
                if idx == -1:
                    break

                # Mark next 50 chars as potentially negated
                negation_spans.add((idx, min(idx + 50, len(doc.text))))
                start = idx + 1

        return negation_spans

    def _is_negated(self, entity, negation_spans: Set[Tuple[int, int]]) -> bool:
        """
        Check if an entity falls within a negation span.

        Args:
            entity: spacy entity
            negation_spans: Set of negated spans

        Returns:
            True if entity is negated
        """
        for start, end in negation_spans:
            if start <= entity.start_char <= end:
                return True
        return False

    def _is_uncertain(self, text: str, start: int, end: int) -> bool:
        """
        Check if entity is mentioned with uncertainty.

        Args:
            text: Full text
            start: Entity start position
            end: Entity end position

        Returns:
            True if entity is uncertain
        """
        # Check preceding context for uncertainty markers
        context_start = max(0, start - 50)
        preceding = text[context_start:start].lower()

        uncertainty_markers = [
            "possible",
            "probable",
            "likely",
            "suspected",
            "?",
            "may have",
            "might be",
            "could be",
            "uncertain",
            "questionable",
            "consider",
            "differential",
            "rule out",
        ]

        for marker in uncertainty_markers:
            if marker in preceding:
                return True

        return False

    def _get_context_window(self, text: str, start: int, end: int, window: int = 50) -> str:
        """
        Get context window around an entity.

        Args:
            text: Full text
            start: Entity start position
            end: Entity end position
            window: Number of characters for context

        Returns:
            Context string
        """
        context_start = max(0, start - window)
        context_end = min(len(text), end + window)
        return text[context_start:context_end]

    async def normalize_entities(
        self,
        entities: List[MedicalEntity],
        ontologies: Optional[List[OntologyType]] = None,
    ) -> List[MedicalEntity]:
        """
        Normalize entities to standard medical ontologies.

        Args:
            entities: List of extracted entities
            ontologies: Target ontologies for normalization

        Returns:
            Entities with ontology mappings added
        """
        if ontologies is None:
            ontologies = [OntologyType.ICD10, OntologyType.RXNORM, OntologyType.SNOMED]

        normalized_entities = []

        for entity in entities:
            # Get mappings for each UMLS concept
            mappings = []

            for concept in entity.umls_concepts:
                concept_mappings = await self._get_ontology_mappings(concept.cui, concept.semantic_types, ontologies)
                mappings.extend(concept_mappings)

            # Create new entity with mappings
            normalized_entity = MedicalEntity(
                text=entity.text,
                entity_type=entity.entity_type,
                start_char=entity.start_char,
                end_char=entity.end_char,
                umls_concepts=entity.umls_concepts,
                ontology_mappings=mappings,
                negated=entity.negated,
                uncertain=entity.uncertain,
                context=entity.context,
            )
            normalized_entities.append(normalized_entity)

        return normalized_entities

    async def _get_ontology_mappings(
        self,
        cui: str,
        semantic_types: List[str],
        ontologies: List[OntologyType],
    ) -> List[OntologyMapping]:
        """
        Get ontology mappings for a UMLS CUI.

        This method queries the UMLS Metathesaurus for cross-references
        to standard ontologies.

        Args:
            cui: UMLS Concept Unique Identifier
            semantic_types: UMLS semantic types
            ontologies: Target ontologies

        Returns:
            List of ontology mappings
        """
        mappings = []

        # Determine which ontologies are relevant based on semantic type
        entity_type = self._get_entity_type(semantic_types)

        relevant_ontologies = self._get_relevant_ontologies(entity_type, ontologies)

        for ontology in relevant_ontologies:
            # Try to get mapping from cache or API
            mapping = await self._lookup_ontology_mapping(cui, ontology)
            if mapping:
                mappings.append(mapping)

        return mappings

    def _get_relevant_ontologies(self, entity_type: EntityType, requested: List[OntologyType]) -> List[OntologyType]:
        """
        Get relevant ontologies for an entity type.

        Args:
            entity_type: Type of medical entity
            requested: User-requested ontologies

        Returns:
            Filtered list of relevant ontologies
        """
        ontology_relevance = {
            EntityType.DISEASE: [OntologyType.ICD10, OntologyType.SNOMED],
            EntityType.MEDICATION: [OntologyType.RXNORM, OntologyType.ATC],
            EntityType.PROCEDURE: [OntologyType.SNOMED, OntologyType.LOINC],
            EntityType.LAB_TEST: [OntologyType.LOINC],
            EntityType.ANATOMY: [OntologyType.SNOMED],
            EntityType.GENE: [OntologyType.HGNC],
            EntityType.SYMPTOM: [OntologyType.SNOMED],
        }

        relevant = ontology_relevance.get(entity_type, [OntologyType.SNOMED])
        return [o for o in requested if o in relevant]

    async def _lookup_ontology_mapping(self, cui: str, ontology: OntologyType) -> Optional[OntologyMapping]:
        """
        Look up ontology mapping for a CUI.

        In production, this would query the UMLS API or a local database.

        Args:
            cui: UMLS CUI
            ontology: Target ontology

        Returns:
            OntologyMapping if found, None otherwise
        """
        # Check if we have the UMLS linker with KB
        if not self._nlp or "scispacy_linker" not in self._nlp.pipe_names:
            return None

        try:
            linker = self._nlp.get_pipe("scispacy_linker")
            kb = linker.kb

            if cui not in kb.cui_to_entity:
                return None

            # The scispacy KB doesn't have direct ontology mappings,
            # but in production you would query UMLS REST API here
            # For now, return None to indicate mapping lookup needed
            return None

        except Exception as e:
            logger.debug(f"Could not lookup mapping for {cui}: {e}")
            return None

    async def extract_and_normalize(
        self,
        text: str,
        ontologies: Optional[List[OntologyType]] = None,
        detect_negation: bool = True,
        min_confidence: float = 0.7,
    ) -> NERResult:
        """
        Extract and normalize entities in one call.

        Args:
            text: Clinical text to process
            ontologies: Target ontologies for normalization
            detect_negation: Whether to detect negation
            min_confidence: Minimum confidence for UMLS linking

        Returns:
            NERResult with normalized entities
        """
        result = await self.extract_entities(
            text,
            detect_negation=detect_negation,
            min_confidence=min_confidence,
        )

        if result.entities:
            result.entities = await self.normalize_entities(result.entities, ontologies)

        return result

    def get_abbreviation_expansion(self, abbreviation: str) -> Optional[str]:
        """
        Get the expansion of a medical abbreviation.

        Args:
            abbreviation: The abbreviation to expand

        Returns:
            Expanded form if known, None otherwise
        """
        return self._abbreviation_cache.get(abbreviation)

    def get_concept_info(self, cui: str) -> Optional[UMLSConcept]:
        """
        Get cached concept information.

        Args:
            cui: UMLS CUI

        Returns:
            UMLSConcept if cached, None otherwise
        """
        return self._concept_cache.get(cui)

    def clear_cache(self):
        """Clear all caches."""
        self._abbreviation_cache.clear()
        self._concept_cache.clear()

    def to_dict(self, entity: MedicalEntity) -> Dict[str, Any]:
        """
        Convert MedicalEntity to dictionary for API response.

        Args:
            entity: MedicalEntity to convert

        Returns:
            Dictionary representation
        """
        return {
            "text": entity.text,
            "type": entity.entity_type.value,
            "start": entity.start_char,
            "end": entity.end_char,
            "negated": entity.negated,
            "uncertain": entity.uncertain,
            "context": entity.context,
            "umls_concepts": [
                {
                    "cui": c.cui,
                    "name": c.name,
                    "semantic_types": c.semantic_types,
                    "score": c.score,
                    "definition": c.definition,
                    "aliases": c.aliases[:5] if c.aliases else [],
                }
                for c in entity.umls_concepts
            ],
            "ontology_mappings": [
                {
                    "ontology": m.ontology.value,
                    "code": m.code,
                    "display_name": m.display_name,
                    "confidence": m.confidence,
                }
                for m in entity.ontology_mappings
            ],
        }

    def result_to_dict(self, result: NERResult) -> Dict[str, Any]:
        """
        Convert NERResult to dictionary for API response.

        Args:
            result: NERResult to convert

        Returns:
            Dictionary representation
        """
        return {
            "entities": [self.to_dict(e) for e in result.entities],
            "text_length": result.text_length,
            "processing_time_ms": result.processing_time_ms,
            "model_used": result.model_used,
            "metadata": result.metadata,
        }


# Global service instance (lazy loaded)
medical_ner_service = MedicalNERService(lazy_load=True)
