"""
VoiceAssist Engines Module

This module contains consolidated engines for the voice mode enhancement system.
Each engine provides a cohesive set of related functionality with clean interfaces.

Engines:
- EmotionEngine: Emotion detection, personalization, and fusion
- ConversationEngine: Turn-taking, repair strategies, and progressive responses
- ClinicalEngine: PHI detection, clinical reasoning, and code extraction
- DictationEngine: Medical dictation with specialty plugins
- MemoryEngine: User context, preferences, and privacy enforcement
- AnalyticsEngine: Metrics collection, anomaly detection, and adaptive tuning
"""

from .analytics_engine import AnalyticsEngine
from .clinical_engine import ClinicalEngine
from .conversation_engine import ConversationEngine
from .dictation_engine import DictationEngine
from .emotion_engine import EmotionEngine
from .memory_engine import MemoryEngine

__all__ = [
    "EmotionEngine",
    "ConversationEngine",
    "ClinicalEngine",
    "DictationEngine",
    "MemoryEngine",
    "AnalyticsEngine",
]
