"""
Reference Resolver - Pronoun and Entity Resolution

Resolves pronouns and ambiguous references using memory context:
- Pronoun resolution (it, he, she, they, this, that)
- Entity resolution (the patient, the medication, etc.)
- Confidence-based clarification prompts
- Integration with MemoryEngine for context

Phase 3: Conversation Quality Improvements
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ReferenceType(Enum):
    """Types of references that can be resolved"""

    PRONOUN_PERSONAL = "pronoun_personal"  # he, she, they
    PRONOUN_DEMONSTRATIVE = "pronoun_demonstrative"  # this, that, these, those
    PRONOUN_RELATIVE = "pronoun_relative"  # which, who, that
    ENTITY_DEFINITE = "entity_definite"  # the patient, the medication
    ENTITY_ANAPHORIC = "entity_anaphoric"  # the same one, another one


@dataclass
class ResolvedReference:
    """Result of reference resolution"""

    original_text: str
    reference_type: ReferenceType
    resolved_entity: Optional[str] = None
    resolved_value: Optional[str] = None
    confidence: float = 0.0
    alternatives: List[Tuple[str, float]] = field(default_factory=list)
    needs_clarification: bool = False
    clarification_prompt: Optional[str] = None


@dataclass
class EntityMention:
    """An entity mentioned in conversation"""

    entity_type: str  # person, medication, condition, etc.
    value: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    salience: float = 1.0  # How prominent/recent the entity is
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ReferenceContext:
    """Context for reference resolution"""

    session_id: str
    recent_entities: List[EntityMention] = field(default_factory=list)
    recent_topics: List[str] = field(default_factory=list)
    last_subject: Optional[EntityMention] = None
    last_object: Optional[EntityMention] = None
    last_location: Optional[str] = None


class ReferenceResolver:
    """
    Resolves pronouns and ambiguous references using memory context.

    Resolution process:
    1. Identify references in text (pronouns, definite NPs)
    2. Find candidate referents from recent context
    3. Score candidates by salience and grammatical fit
    4. If confidence is high, resolve; otherwise prompt for clarification

    Integrates with MemoryEngine for conversation context.
    """

    # Pronouns to resolve
    PERSONAL_PRONOUNS = {
        "he": {"gender": "male", "number": "singular", "person": 3},
        "him": {"gender": "male", "number": "singular", "person": 3, "case": "object"},
        "his": {
            "gender": "male",
            "number": "singular",
            "person": 3,
            "case": "possessive",
        },
        "she": {"gender": "female", "number": "singular", "person": 3},
        "her": {"gender": "female", "number": "singular", "person": 3},
        "hers": {
            "gender": "female",
            "number": "singular",
            "person": 3,
            "case": "possessive",
        },
        "it": {"gender": "neuter", "number": "singular", "person": 3},
        "its": {
            "gender": "neuter",
            "number": "singular",
            "person": 3,
            "case": "possessive",
        },
        "they": {"number": "plural", "person": 3},
        "them": {"number": "plural", "person": 3, "case": "object"},
        "their": {"number": "plural", "person": 3, "case": "possessive"},
    }

    DEMONSTRATIVE_PRONOUNS = {
        "this": {"proximity": "near", "number": "singular"},
        "that": {"proximity": "far", "number": "singular"},
        "these": {"proximity": "near", "number": "plural"},
        "those": {"proximity": "far", "number": "plural"},
    }

    # Entity patterns for definite references
    ENTITY_PATTERNS = {
        "patient": r"the\s+patient",
        "medication": r"the\s+(medication|drug|medicine|prescription)",
        "condition": r"the\s+(condition|diagnosis|disease|illness)",
        "doctor": r"the\s+(doctor|physician|provider)",
        "appointment": r"the\s+appointment",
        "test": r"the\s+(test|lab|labs|result|results)",
        "procedure": r"the\s+procedure",
        "dosage": r"the\s+dosage",
    }

    # Confidence thresholds
    HIGH_CONFIDENCE_THRESHOLD = 0.8
    LOW_CONFIDENCE_THRESHOLD = 0.4

    def __init__(self, memory_engine=None, event_bus=None):
        self.memory_engine = memory_engine
        self.event_bus = event_bus
        self._session_contexts: Dict[str, ReferenceContext] = {}
        logger.info("ReferenceResolver initialized")

    async def resolve_references(
        self,
        text: str,
        session_id: str,
        memory_context: Optional[Dict] = None,
    ) -> List[ResolvedReference]:
        """
        Resolve all references in the given text.

        Args:
            text: Text containing potential references
            session_id: Session identifier for context
            memory_context: Optional memory context from MemoryEngine

        Returns:
            List of resolved references
        """
        # Get or create session context
        context = await self._get_or_create_context(session_id, memory_context)

        # Find all references
        references = []

        # Find pronouns
        pronoun_refs = self._find_pronouns(text)
        references.extend(pronoun_refs)

        # Find definite entity references
        entity_refs = self._find_entity_references(text)
        references.extend(entity_refs)

        # Resolve each reference
        resolved = []
        for ref in references:
            result = await self._resolve_single(ref, context)
            resolved.append(result)

            # Log resolution for analytics
            logger.debug(
                f"Resolved reference: '{ref['text']}' -> "
                f"'{result.resolved_value}' (confidence: {result.confidence:.2f})"
            )

        return resolved

    async def update_context(
        self,
        session_id: str,
        entities: List[Dict[str, Any]],
        topics: Optional[List[str]] = None,
    ) -> None:
        """
        Update session context with new entities and topics.

        Called after processing user input to maintain entity salience.
        """
        context = self._session_contexts.get(session_id)
        if not context:
            context = ReferenceContext(session_id=session_id)
            self._session_contexts[session_id] = context

        # Add new entities
        for entity_data in entities:
            entity = EntityMention(
                entity_type=entity_data.get("type", "unknown"),
                value=entity_data.get("value", ""),
                salience=entity_data.get("salience", 1.0),
                attributes=entity_data.get("attributes", {}),
            )
            context.recent_entities.insert(0, entity)

            # Update subject/object tracking
            role = entity_data.get("role")
            if role == "subject":
                context.last_subject = entity
            elif role == "object":
                context.last_object = entity

        # Decay salience of older entities
        for entity in context.recent_entities[len(entities) :]:
            entity.salience *= 0.8

        # Keep only recent entities (last 20)
        context.recent_entities = context.recent_entities[:20]

        # Update topics
        if topics:
            context.recent_topics = topics[:5] + context.recent_topics
            context.recent_topics = context.recent_topics[:10]

    async def get_clarification_options(
        self,
        session_id: str,
        reference_text: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get clarification options for an ambiguous reference.

        Returns options the user can choose from.
        """
        context = self._session_contexts.get(session_id)
        if not context:
            return None

        # Find matching candidates
        candidates = self._find_candidates(reference_text, context)

        if len(candidates) <= 1:
            return None

        # Build clarification options
        options = []
        for entity, score in candidates[:4]:  # Max 4 options
            options.append(
                {
                    "value": entity.value,
                    "type": entity.entity_type,
                    "description": self._describe_entity(entity),
                }
            )

        return {
            "reference": reference_text,
            "options": options,
            "prompt": f"Which {self._get_reference_category(reference_text)} are you referring to?",
        }

    def _find_pronouns(self, text: str) -> List[Dict]:
        """Find pronouns in text"""
        references = []
        words = text.lower().split()

        for i, word in enumerate(words):
            # Remove punctuation
            clean_word = re.sub(r"[^\w]", "", word)

            if clean_word in self.PERSONAL_PRONOUNS:
                references.append(
                    {
                        "text": clean_word,
                        "type": ReferenceType.PRONOUN_PERSONAL,
                        "position": i,
                        "features": self.PERSONAL_PRONOUNS[clean_word],
                    }
                )
            elif clean_word in self.DEMONSTRATIVE_PRONOUNS:
                references.append(
                    {
                        "text": clean_word,
                        "type": ReferenceType.PRONOUN_DEMONSTRATIVE,
                        "position": i,
                        "features": self.DEMONSTRATIVE_PRONOUNS[clean_word],
                    }
                )

        return references

    def _find_entity_references(self, text: str) -> List[Dict]:
        """Find definite entity references in text"""
        references = []
        text_lower = text.lower()

        for entity_type, pattern in self.ENTITY_PATTERNS.items():
            matches = re.finditer(pattern, text_lower)
            for match in matches:
                references.append(
                    {
                        "text": match.group(0),
                        "type": ReferenceType.ENTITY_DEFINITE,
                        "entity_type": entity_type,
                        "position": match.start(),
                    }
                )

        return references

    async def _resolve_single(
        self,
        reference: Dict,
        context: ReferenceContext,
    ) -> ResolvedReference:
        """Resolve a single reference"""
        ref_type = reference["type"]
        ref_text = reference["text"]

        # Find candidates
        candidates = self._find_candidates(ref_text, context, reference.get("features"))

        if not candidates:
            return ResolvedReference(
                original_text=ref_text,
                reference_type=ref_type,
                confidence=0.0,
                needs_clarification=True,
                clarification_prompt=self._generate_clarification(ref_text, ref_type),
            )

        # Score and rank candidates
        best_entity, best_score = candidates[0]
        alternatives = candidates[1:4]  # Up to 3 alternatives

        # Determine if clarification needed
        needs_clarification = best_score < self.HIGH_CONFIDENCE_THRESHOLD
        if len(candidates) > 1:
            second_score = candidates[1][1]
            # If top two are close, need clarification
            if best_score - second_score < 0.2:
                needs_clarification = True

        return ResolvedReference(
            original_text=ref_text,
            reference_type=ref_type,
            resolved_entity=best_entity.entity_type,
            resolved_value=best_entity.value,
            confidence=best_score,
            alternatives=[(e.value, s) for e, s in alternatives],
            needs_clarification=needs_clarification,
            clarification_prompt=(
                self._generate_clarification(ref_text, ref_type, candidates) if needs_clarification else None
            ),
        )

    def _find_candidates(
        self,
        ref_text: str,
        context: ReferenceContext,
        features: Optional[Dict] = None,
    ) -> List[Tuple[EntityMention, float]]:
        """Find candidate referents from context"""
        candidates = []

        for entity in context.recent_entities:
            score = self._score_candidate(entity, ref_text, features, context)
            if score > 0.1:
                candidates.append((entity, score))

        # Sort by score
        candidates.sort(key=lambda x: -x[1])
        return candidates

    def _score_candidate(
        self,
        entity: EntityMention,
        ref_text: str,
        features: Optional[Dict],
        context: ReferenceContext,
    ) -> float:
        """Score a candidate entity for a reference"""
        score = entity.salience  # Start with salience

        # Check grammatical agreement
        if features:
            # Gender agreement
            entity_gender = entity.attributes.get("gender")
            ref_gender = features.get("gender")
            if entity_gender and ref_gender:
                if entity_gender == ref_gender:
                    score *= 1.2
                else:
                    score *= 0.3

            # Number agreement
            entity_number = entity.attributes.get("number", "singular")
            ref_number = features.get("number", "singular")
            if entity_number == ref_number:
                score *= 1.1
            else:
                score *= 0.5

        # Recency bonus
        age = (datetime.utcnow() - entity.timestamp).total_seconds()
        if age < 60:  # Last minute
            score *= 1.5
        elif age < 300:  # Last 5 minutes
            score *= 1.2

        # Subject/object preference for pronouns
        if ref_text in ["it", "he", "she", "they"]:
            if context.last_subject and entity.value == context.last_subject.value:
                score *= 1.3
        elif ref_text in ["him", "her", "them"]:
            if context.last_object and entity.value == context.last_object.value:
                score *= 1.3

        # Demonstrative preference (this = recent, that = older)
        if ref_text == "this":
            if age < 30:
                score *= 1.4
        elif ref_text == "that":
            if age > 60:
                score *= 1.2

        return min(1.0, score)

    def _generate_clarification(
        self,
        ref_text: str,
        ref_type: ReferenceType,
        candidates: Optional[List[Tuple[EntityMention, float]]] = None,
    ) -> str:
        """Generate a clarification prompt"""
        if not candidates:
            if ref_type == ReferenceType.PRONOUN_PERSONAL:
                return "Who are you referring to?"
            elif ref_type == ReferenceType.PRONOUN_DEMONSTRATIVE:
                return "What are you referring to?"
            else:
                return f"Could you clarify which {ref_text} you mean?"

        # Multiple candidates - offer options
        if len(candidates) == 2:
            return f"Do you mean {candidates[0][0].value} or {candidates[1][0].value}?"
        else:
            options = ", ".join(c[0].value for c in candidates[:3])
            return f"Which one are you referring to: {options}?"

    def _describe_entity(self, entity: EntityMention) -> str:
        """Generate a description for an entity"""
        desc = entity.value
        if entity.attributes:
            attrs = []
            if "specialty" in entity.attributes:
                attrs.append(entity.attributes["specialty"])
            if "date" in entity.attributes:
                attrs.append(f"on {entity.attributes['date']}")
            if attrs:
                desc += f" ({', '.join(attrs)})"
        return desc

    def _get_reference_category(self, ref_text: str) -> str:
        """Get human-readable category for a reference"""
        if ref_text in self.PERSONAL_PRONOUNS:
            return "person"
        elif ref_text in self.DEMONSTRATIVE_PRONOUNS:
            return "item"
        else:
            for entity_type, pattern in self.ENTITY_PATTERNS.items():
                if re.search(pattern, ref_text.lower()):
                    return entity_type
        return "reference"

    async def _get_or_create_context(
        self,
        session_id: str,
        memory_context: Optional[Dict],
    ) -> ReferenceContext:
        """Get or create session context, optionally from memory"""
        if session_id in self._session_contexts:
            return self._session_contexts[session_id]

        context = ReferenceContext(session_id=session_id)

        # Load from memory context if provided
        if memory_context:
            entities = memory_context.get("recent_entities", [])
            for entity_data in entities:
                entity = EntityMention(
                    entity_type=entity_data.get("type", "unknown"),
                    value=entity_data.get("value", ""),
                    salience=entity_data.get("salience", 0.5),
                    attributes=entity_data.get("attributes", {}),
                )
                context.recent_entities.append(entity)

            context.recent_topics = memory_context.get("recent_topics", [])

        self._session_contexts[session_id] = context
        return context

    def clear_session(self, session_id: str) -> None:
        """Clear session context"""
        self._session_contexts.pop(session_id, None)


__all__ = [
    "ReferenceResolver",
    "ResolvedReference",
    "ReferenceType",
    "EntityMention",
    "ReferenceContext",
]
