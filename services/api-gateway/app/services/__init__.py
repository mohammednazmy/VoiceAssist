"""
Service layer for external integrations

This module provides services for:
- Voice processing (VAD, echo cancellation, noise suppression)
- Voice authentication (speaker verification)
- OpenAI Realtime API integration
- RAG pipeline orchestration
- External API integrations (Nextcloud, CalDAV, etc.)
"""

from app.services.audio_processor import (
    AudioProcessor,
    AudioProcessorConfig,
    EchoCanceller,
    NoiseSuppressor,
    StreamingAudioProcessor,
)
from app.services.medical_calculators import CalculatorResult, MedicalCalculators, RiskLevel, Sex, list_calculators

# Medical AI Services (Phase 2)
from app.services.medical_embedding_service import MedicalEmbeddingService
from app.services.medical_ner_service import MedicalEntity, MedicalNERService, NERResult
from app.services.multi_hop_reasoning_service import (
    HybridSearchEngine,
    MultiHopReasoner,
    ReasoningResult,
    ReasoningStrategy,
)
from app.services.pubmed_enhanced_service import (
    ArticleType,
    CitationNetwork,
    ClinicalTrial,
    EnhancedPubMedService,
    PubMedArticle,
    SearchResult,
)
from app.services.realtime_voice_service import RealtimeVoiceService, realtime_voice_service

# External Medical Integrations (Phase 3)
from app.services.uptodate_service import (
    DrugInteraction,
    DrugInteractionResult,
    InteractionSeverity,
    Specialty,
    UpToDateContent,
    UpToDateService,
    UpToDateTopic,
)
from app.services.voice_activity_detector import SpeechState, StreamingVAD, VADConfig, VoiceActivityDetector
from app.services.voice_authentication import (
    VoiceAuthenticationService,
    VoiceAuthStatus,
    VoicePrint,
    voice_auth_service,
)
from app.services.voice_websocket_handler import (
    ConnectionState,
    ConversationState,
    VoiceSessionConfig,
    VoiceSessionManager,
    VoiceWebSocketHandler,
    voice_session_manager,
)

__all__ = [
    # Audio Processing
    "AudioProcessor",
    "AudioProcessorConfig",
    "EchoCanceller",
    "NoiseSuppressor",
    "StreamingAudioProcessor",
    # Voice Activity Detection
    "VoiceActivityDetector",
    "VADConfig",
    "SpeechState",
    "StreamingVAD",
    # Voice Authentication
    "VoiceAuthenticationService",
    "VoiceAuthStatus",
    "VoicePrint",
    "voice_auth_service",
    # Voice WebSocket Handler
    "VoiceWebSocketHandler",
    "VoiceSessionConfig",
    "VoiceSessionManager",
    "ConnectionState",
    "ConversationState",
    "voice_session_manager",
    # Realtime Voice Service
    "RealtimeVoiceService",
    "realtime_voice_service",
    # Medical AI Services (Phase 2)
    "MedicalEmbeddingService",
    "MedicalNERService",
    "MedicalEntity",
    "NERResult",
    "MultiHopReasoner",
    "HybridSearchEngine",
    "ReasoningResult",
    "ReasoningStrategy",
    # External Medical Integrations (Phase 3)
    "UpToDateService",
    "UpToDateTopic",
    "UpToDateContent",
    "DrugInteraction",
    "DrugInteractionResult",
    "InteractionSeverity",
    "Specialty",
    "EnhancedPubMedService",
    "PubMedArticle",
    "SearchResult",
    "CitationNetwork",
    "ClinicalTrial",
    "ArticleType",
    "MedicalCalculators",
    "CalculatorResult",
    "Sex",
    "RiskLevel",
    "list_calculators",
]
