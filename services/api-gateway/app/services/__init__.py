"""
Service layer for external integrations

This module provides services for:
- Voice processing (VAD, echo cancellation, noise suppression)
- Voice authentication (speaker verification)
- OpenAI Realtime API integration
- Medical AI (embeddings, NER, reasoning)
- RAG pipeline orchestration
- External API integrations (Nextcloud, CalDAV, CardDAV, Email, OIDC)
"""

from app.services.audio_processor import (
    AudioProcessor,
    AudioProcessorConfig,
    EchoCanceller,
    NoiseSuppressor,
    StreamingAudioProcessor,
)
from app.services.caldav_service import CalDAVService, CalendarEvent
from app.services.carddav_service import AddressBook, CardDAVService, Contact, ContactSearchQuery
from app.services.carddav_service import EmailAddress as CardEmailAddress
from app.services.carddav_service import EmailType, PhoneNumber, PhoneType, PostalAddress
from app.services.email_service import Email, EmailFolder, EmailService, EmailThread
from app.services.medical_calculators import CalculatorResult, MedicalCalculators, RiskLevel, Sex, list_calculators
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
from app.services.oidc_service import (
    AuthorizationRequest,
    OIDCClaims,
    OIDCProvider,
    OIDCProviderConfig,
    OIDCService,
    OIDCTokens,
)
from app.services.pubmed_enhanced_service import (
    ArticleType,
    CitationNetwork,
    ClinicalTrial,
    EnhancedPubMedService,
    PubMedArticle,
)
from app.services.pubmed_enhanced_service import SearchResult as PubMedSearchResult
from app.services.realtime_voice_service import RealtimeVoiceService, realtime_voice_service
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
    # OIDC Authentication
    "OIDCService",
    "OIDCProvider",
    "OIDCProviderConfig",
    "OIDCTokens",
    "OIDCClaims",
    "AuthorizationRequest",
    # CalDAV Calendar
    "CalDAVService",
    "CalendarEvent",
    # CardDAV Contacts
    "CardDAVService",
    "Contact",
    "AddressBook",
    "ContactSearchQuery",
    "PhoneNumber",
    "PhoneType",
    "CardEmailAddress",
    "EmailType",
    "PostalAddress",
    # Email Service
    "EmailService",
    "Email",
    "EmailFolder",
    "EmailThread",
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
    "PubMedSearchResult",
    "CitationNetwork",
    "ClinicalTrial",
    "ArticleType",
    "MedicalCalculators",
    "CalculatorResult",
    "Sex",
    "RiskLevel",
    "list_calculators",
]
