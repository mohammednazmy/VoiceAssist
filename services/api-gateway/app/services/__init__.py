"""
Service layer for external integrations

This module provides services for:
- Voice processing (VAD, echo cancellation, noise suppression)
- Voice authentication (speaker verification)
- OpenAI Realtime API integration
- Medical AI (embeddings, NER, reasoning)
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
from app.services.medical_embedding_service import (
    EmbeddingResult,
    GenerationResult,
    MedicalEmbeddingService,
    MedicalModelType,
    ModelConfig,
    medical_embedding_service,
)
from app.services.medical_ner_service import (
    EntityType,
    MedicalEntity,
    MedicalNERService,
    NERResult,
    OntologyMapping,
    OntologyType,
    UMLSConcept,
    medical_ner_service,
)
from app.services.multi_hop_reasoning_service import (
    HybridSearchEngine,
    MultiHopReasoner,
    ReasoningResult,
    ReasoningStep,
    ReasoningStrategy,
    SearchResult,
    hybrid_search_engine,
    multi_hop_reasoner,
)
from app.services.realtime_voice_service import RealtimeVoiceService, realtime_voice_service
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
    # Medical Embedding Service
    "MedicalEmbeddingService",
    "MedicalModelType",
    "ModelConfig",
    "EmbeddingResult",
    "GenerationResult",
    "medical_embedding_service",
    # Medical NER Service
    "MedicalNERService",
    "EntityType",
    "OntologyType",
    "UMLSConcept",
    "OntologyMapping",
    "MedicalEntity",
    "NERResult",
    "medical_ner_service",
    # Multi-Hop Reasoning Service
    "HybridSearchEngine",
    "MultiHopReasoner",
    "ReasoningStrategy",
    "SearchResult",
    "ReasoningStep",
    "ReasoningResult",
    "hybrid_search_engine",
    "multi_hop_reasoner",
]
