"""
Response Adaptation - Emotion-Aware Prompt Injection

Adapts LLM responses based on detected user emotion.
Provides guidance on tone, pacing, and content structure.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class AdaptationResult:
    """Result of response adaptation analysis"""

    system_prompt_addition: str
    tone_guidance: str
    pacing_hint: str
    should_acknowledge_emotion: bool
    suggested_opening: Optional[str] = None
    max_response_length: Optional[str] = None  # "brief", "normal", "detailed"


class ResponseAdaptation:
    """
    Emotion-aware response adaptation service.

    Provides guidance for LLM prompt construction based on
    detected user emotion to generate more empathetic responses.
    """

    # Emotion-specific adaptation templates
    EMOTION_ADAPTATIONS = {
        "frustration": {
            "system_prompt": (
                "The user appears frustrated. Be direct and solution-focused. "
                "Keep responses brief. Avoid lengthy explanations. "
                "Acknowledge their frustration briefly, then move to help."
            ),
            "tone": "calm, direct, helpful",
            "pacing": "quick",
            "acknowledge": True,
            "opening": "I understand. Let me help with that.",
            "length": "brief",
        },
        "confusion": {
            "system_prompt": (
                "The user seems confused. Break down information into simple steps. "
                "Use clear, simple language. Offer to explain differently if needed. "
                "Check for understanding before continuing."
            ),
            "tone": "patient, clear, supportive",
            "pacing": "measured",
            "acknowledge": True,
            "opening": "Let me explain that more clearly.",
            "length": "normal",
        },
        "anxiety": {
            "system_prompt": (
                "The user appears anxious. Use a reassuring tone. "
                "Provide clear structure and next steps. "
                "Avoid adding complexity or uncertainty. Be definitive."
            ),
            "tone": "reassuring, calm, structured",
            "pacing": "steady",
            "acknowledge": True,
            "opening": "It's okay. Let's go through this together.",
            "length": "normal",
        },
        "sadness": {
            "system_prompt": (
                "The user seems sad. Show empathy but don't dwell on the emotion. "
                "Be supportive and warm. Give them space if needed. "
                "Gently offer help without being pushy."
            ),
            "tone": "empathetic, warm, gentle",
            "pacing": "slow",
            "acknowledge": True,
            "opening": "I'm here for you.",
            "length": "normal",
        },
        "joy": {
            "system_prompt": (
                "The user is in a positive mood. Match their energy appropriately. "
                "Be engaged and enthusiastic. Build on their positive state."
            ),
            "tone": "warm, engaged, positive",
            "pacing": "normal",
            "acknowledge": False,
            "opening": None,
            "length": "normal",
        },
        "excitement": {
            "system_prompt": (
                "The user is excited. Match their enthusiasm while staying helpful. "
                "Keep the momentum going while providing useful information."
            ),
            "tone": "enthusiastic, engaging",
            "pacing": "quick",
            "acknowledge": False,
            "opening": None,
            "length": "normal",
        },
        "anger": {
            "system_prompt": (
                "The user appears angry. Stay calm and professional. "
                "Don't match their energy or become defensive. "
                "Acknowledge the issue and focus on resolution. Be very direct."
            ),
            "tone": "calm, professional, solution-focused",
            "pacing": "measured",
            "acknowledge": True,
            "opening": "I hear you. Let's fix this.",
            "length": "brief",
        },
        "neutral": {
            "system_prompt": "",
            "tone": "helpful, professional",
            "pacing": "normal",
            "acknowledge": False,
            "opening": None,
            "length": "normal",
        },
    }

    # Confidence threshold for applying adaptations
    MIN_CONFIDENCE_THRESHOLD = 0.5

    def __init__(self, min_confidence: float = 0.5):
        self.min_confidence = min_confidence
        logger.info(f"ResponseAdaptation initialized (min_conf={min_confidence})")

    async def get_adaptation(
        self,
        emotion_state: "EmotionState",
        context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Get response adaptation based on detected emotion.

        Args:
            emotion_state: Current detected emotion
            context: Optional session context

        Returns:
            Dict with adaptation guidance
        """
        emotion = emotion_state.dominant_emotion
        confidence = emotion_state.confidence

        # Use default if low confidence or unknown emotion
        if confidence < self.min_confidence:
            emotion = "neutral"

        adaptation = self.EMOTION_ADAPTATIONS.get(emotion, self.EMOTION_ADAPTATIONS["neutral"])

        result = {
            "system_prompt_addition": adaptation["system_prompt"],
            "tone_guidance": adaptation["tone"],
            "pacing_hint": adaptation["pacing"],
            "should_acknowledge_emotion": adaptation["acknowledge"],
            "suggested_opening": adaptation.get("opening"),
            "max_response_length": adaptation.get("length", "normal"),
            "detected_emotion": emotion,
            "confidence": confidence,
        }

        # Add context-aware adjustments
        if context:
            result = self._apply_context_adjustments(result, context)

        return result

    def _apply_context_adjustments(
        self,
        result: Dict[str, Any],
        context: Dict,
    ) -> Dict[str, Any]:
        """Apply context-specific adjustments to adaptation"""

        # Check if this is a clinical context
        if context.get("is_clinical", False):
            result["system_prompt_addition"] = (
                result["system_prompt_addition"] + " This is a clinical context - maintain professional accuracy."
            )

        # Check if user has expressed emotion preference
        if context.get("prefer_direct_responses", False):
            result["max_response_length"] = "brief"
            result["should_acknowledge_emotion"] = False

        # Check for repeat frustration (escalation pattern)
        frustration_count = context.get("recent_frustration_count", 0)
        if frustration_count > 2:
            result["system_prompt_addition"] = (
                result["system_prompt_addition"] + " Multiple frustrations detected - consider offering to escalate "
                "or try a completely different approach."
            )

        return result

    def build_emotion_aware_prompt(
        self,
        base_prompt: str,
        emotion_state: "EmotionState",
        context: Optional[Dict] = None,
    ) -> str:
        """
        Build complete system prompt with emotion awareness.

        Args:
            base_prompt: Original system prompt
            emotion_state: Detected emotion
            context: Session context

        Returns:
            Modified system prompt with emotion guidance
        """
        import asyncio

        # Get adaptation synchronously for prompt building
        adaptation = asyncio.get_event_loop().run_until_complete(self.get_adaptation(emotion_state, context))

        addition = adaptation["system_prompt_addition"]
        if not addition:
            return base_prompt

        # Insert emotion guidance after first paragraph
        paragraphs = base_prompt.split("\n\n")
        if len(paragraphs) > 1:
            paragraphs.insert(1, f"[Emotion Context: {addition}]")
            return "\n\n".join(paragraphs)
        else:
            return f"{base_prompt}\n\n[Emotion Context: {addition}]"


__all__ = ["ResponseAdaptation", "AdaptationResult"]
