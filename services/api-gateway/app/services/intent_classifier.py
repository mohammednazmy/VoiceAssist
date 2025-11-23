"""Intent Classification Service for VoiceAssist.

This module classifies the medical intent of user queries to enable:
- Better routing to appropriate models
- Intent-specific prompt engineering
- Analytics on query types

Supported intents:
- diagnosis: Questions about diagnosis, differential diagnosis
- treatment: Questions about treatment plans, therapies
- drug: Questions about medications, dosing, interactions
- guideline: Questions about clinical guidelines, protocols
- summary: Requests to summarize patient information
- other: General medical questions

FUTURE: This could be enhanced with ML-based classification using:
- Fine-tuned BERT models
- Few-shot learning with GPT
- Traditional ML classifiers (SVM, Random Forest)
"""

from __future__ import annotations

import logging
from typing import Literal

logger = logging.getLogger(__name__)

IntentType = Literal["diagnosis", "treatment", "drug", "guideline", "summary", "other"]


class IntentClassifier:
    """Rule-based intent classifier using keyword matching.

    This is a simple implementation for MVP. Production systems should use
    ML-based classification for better accuracy.
    """

    def __init__(self):
        # Define keyword patterns for each intent
        self.intent_keywords = {
            "diagnosis": [
                "diagnose",
                "diagnosis",
                "differential",
                "could be",
                "what is causing",
                "what causes",
                "symptoms suggest",
                "likely diagnosis",
                "rule out",
                "consider",
                "diagnostic",
                "presenting with",
            ],
            "treatment": [
                "treat",
                "treatment",
                "therapy",
                "manage",
                "management",
                "intervention",
                "procedure",
                "surgery",
                "operation",
                "how to treat",
                "what should i do",
                "next steps",
                "care plan",
            ],
            "drug": [
                "medication",
                "drug",
                "prescription",
                "dose",
                "dosage",
                "dosing",
                "mg",
                "tablet",
                "pill",
                "antibiotic",
                "interaction",
                "side effect",
                "contraindication",
                "pharma",
            ],
            "guideline": [
                "guideline",
                "protocol",
                "recommendation",
                "standard of care",
                "best practice",
                "accomodation",
                "acc",
                "aha",
                "who",
                "cdc",
                "uptodate",
                "evidence based",
            ],
            "summary": [
                "summarize",
                "summary",
                "brief",
                "overview",
                "recap",
                "condense",
                "key points",
                "in short",
            ],
        }

    def classify(self, query: str, clinical_context: dict | None = None) -> IntentType:
        """Classify the intent of a medical query.

        Uses keyword matching with scoring to determine the most likely intent.

        Args:
            query: User query text
            clinical_context: Optional clinical context (may provide additional signals)

        Returns:
            IntentType: The classified intent
        """
        if not query:
            return "other"

        query_lower = query.lower()

        # Score each intent based on keyword matches
        intent_scores = {intent: 0 for intent in self.intent_keywords.keys()}

        for intent, keywords in self.intent_keywords.items():
            for keyword in keywords:
                if keyword in query_lower:
                    # Weight matches by keyword length (longer = more specific)
                    intent_scores[intent] += len(keyword.split())

        # Get the highest scoring intent
        if max(intent_scores.values()) > 0:
            best_intent = max(intent_scores.items(), key=lambda x: x[1])[0]
            logger.debug(
                f"Intent classified as '{best_intent}' with score {intent_scores[best_intent]}"
            )
            return best_intent  # type: ignore

        # Default to "other" if no keywords matched
        logger.debug("Intent classified as 'other' (no keyword matches)")
        return "other"

    def get_confidence(self, query: str, intent: IntentType) -> float:
        """Get confidence score for a classification.

        Args:
            query: User query text
            intent: Classified intent

        Returns:
            Confidence score (0.0 - 1.0)
        """
        if not query or intent == "other":
            return 0.5  # Medium confidence for default

        query_lower = query.lower()
        keywords = self.intent_keywords.get(intent, [])

        matches = sum(1 for kw in keywords if kw in query_lower)

        if matches == 0:
            return 0.5
        elif matches == 1:
            return 0.7
        elif matches == 2:
            return 0.85
        else:
            return 0.95
