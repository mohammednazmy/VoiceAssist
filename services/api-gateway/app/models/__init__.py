"""Database models"""

from app.models.admin_audit_log import AdminAuditLog
from app.models.attachment import MessageAttachment
from app.models.audio_narration import AudioNarration
from app.models.audit_log import AuditLog
from app.models.background_job import BackgroundJob
from app.models.response_validation import ResponseValidation, ResponseValidationCitation
from app.models.document_version import DocumentVersion, FreshnessAlert
from app.models.entity import DocumentEntityExtraction, Entity, EntityMention, EntityRelationship
from app.models.multimodal import DocumentImage, DocumentImageExtraction, MultimodalSearchLog, MultimodalTextChunk
from app.models.learning import (
    Flashcard,
    FlashcardReview,
    FlashcardSuggestion,
    StudyDeck,
    StudySession,
    UserLearningStats,
)
from app.models.organization import (
    Organization,
    OrganizationAPIKey,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)
from app.models.analytics import (
    AnalyticsCostTracking,
    AnalyticsDailyMetrics,
    AnalyticsDocumentStats,
    AnalyticsErrorSummary,
    AnalyticsHourlyMetrics,
    AnalyticsSearchQuery,
    AnalyticsSystemHealth,
    AnalyticsUserActivity,
)
from app.models.citation import MessageCitation
from app.models.clinical_context import ClinicalContext
from app.models.conversation_memory import ConversationMemory, UserContext, UserSpeechProfile
from app.models.document import Document
from app.models.feature_flag import FeatureFlag
from app.models.feature_flag_analytics import FeatureFlagAnalytics
from app.models.folder import ConversationFolder
from app.models.message import Message
from app.models.prompt import Prompt, PromptStatus, PromptType, PromptVersion
from app.models.session import Session
from app.models.session_event import SessionEvent
from app.models.system_api_key import SystemAPIKey
from app.models.user import User
from app.models.user_api_key import UserAPIKey
from app.models.user_emotion_profile import RepairSessionHistory, UserEmotionProfile, UserNote, UserProgressRecord
from app.models.user_feature_flag import UserFeatureFlag
from app.models.user_voice_preferences import UserVoicePreferences
from app.models.voice_document_session import VoiceDocumentSession
from app.models.voice_session_metrics import VoiceSessionMetrics

__all__ = [
    "AdminAuditLog",
    "AudioNarration",
    "AuditLog",
    "BackgroundJob",
    "ResponseValidation",
    "ResponseValidationCitation",
    "DocumentVersion",
    "FreshnessAlert",
    "DocumentEntityExtraction",
    "Entity",
    "EntityMention",
    "EntityRelationship",
    "DocumentImage",
    "DocumentImageExtraction",
    "MultimodalSearchLog",
    "MultimodalTextChunk",
    "Flashcard",
    "FlashcardReview",
    "FlashcardSuggestion",
    "StudyDeck",
    "StudySession",
    "UserLearningStats",
    "ClinicalContext",
    "ConversationFolder",
    "ConversationMemory",
    "User",
    "UserContext",
    "UserSpeechProfile",
    "Session",
    "Message",
    "MessageAttachment",
    "MessageCitation",
    "Document",
    "FeatureFlag",
    "UserFeatureFlag",
    "FeatureFlagAnalytics",
    "SessionEvent",
    "SystemAPIKey",
    "UserAPIKey",
    "UserVoicePreferences",
    "VoiceDocumentSession",
    "Prompt",
    "PromptVersion",
    "PromptType",
    "PromptStatus",
    "VoiceSessionMetrics",
    "UserEmotionProfile",
    "UserProgressRecord",
    "UserNote",
    "RepairSessionHistory",
    "Organization",
    "OrganizationMembership",
    "OrganizationInvitation",
    "OrganizationAPIKey",
    "OrganizationAuditLog",
    "AnalyticsDailyMetrics",
    "AnalyticsHourlyMetrics",
    "AnalyticsUserActivity",
    "AnalyticsSystemHealth",
    "AnalyticsDocumentStats",
    "AnalyticsSearchQuery",
    "AnalyticsErrorSummary",
    "AnalyticsCostTracking",
]
