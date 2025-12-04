"""
Voice Policy Config - Unified Configuration for All Engines

Provides centralized configuration with:
- Global thresholds for all engines
- Feature flags for phased rollout
- A/B test variant assignment
- Runtime updates via Redis
"""

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class VoicePolicyConfig:
    """
    Global configuration injected into all engines at runtime.

    Central source of truth for thresholds, feature flags, and settings.
    Can be updated at runtime via Redis for dynamic tuning.
    """

    # ===== Emotion Engine =====
    emotion_deviation_threshold: float = 1.5  # Std devs for significant change
    baseline_learning_rate: float = 0.05  # EMA alpha for baseline
    emotion_confidence_min: float = 0.5  # Min confidence to apply emotion

    # ===== Conversation Engine =====
    repair_retry_limit: int = 3  # Max repairs before escalation
    backchannel_min_gap_ms: int = 5000  # Min time between backchannels
    response_delay_simple_ms: int = 200  # Delay for simple queries
    response_delay_complex_ms: int = 600  # Delay for complex queries
    turn_completion_threshold: float = 0.7  # Probability threshold for turn end

    # Phase 3: Turn-taking thresholds
    turn_end_pause_ms: int = 700  # Silence duration for turn end
    turn_continuation_pause_ms: int = 300  # Short pause, likely continuing
    turn_pitch_fall_threshold: float = -20.0  # Hz drop indicating finality
    turn_uncertain_wait_ms: int = 200  # Wait time for uncertain signals
    turn_high_confidence: float = 0.75  # Threshold for READY signal
    turn_low_confidence: float = 0.35  # Threshold for WAIT signal

    # Phase 3: Backchannel timing
    backchannel_min_speech_ms: int = 2000  # Min speech before backchannel
    backchannel_pause_min_ms: int = 150  # Optimal pause start
    backchannel_pause_max_ms: int = 400  # Optimal pause end
    backchannel_frustrated_gap_mult: float = 1.5  # Gap multiplier when frustrated

    # Phase 3: Repair thresholds
    repair_escalation_window_min: int = 2  # Minutes for escalation window
    repair_frustrated_threshold: int = 2  # Repairs before escalation when frustrated
    repair_anxious_threshold: int = 2  # Repairs before escalation when anxious

    # Phase 3: Reference resolution
    reference_high_confidence: float = 0.8  # High confidence for auto-resolution
    reference_low_confidence: float = 0.4  # Below this, always clarify

    # ===== Clinical Engine =====
    phi_alert_sensitivity: str = "high"  # low, medium, high
    phi_confidence_threshold: float = 0.85  # Min confidence for PHI detection
    phi_use_ner_model: bool = False  # Use NER model (vs regex only)

    # Phase 4: Enhanced PHI Detection
    phi_ner_model_path: str = "roberta-base-phi-i2b2"  # Path or name of NER model
    phi_ensemble_weight_ner: float = 0.6  # Weight for NER in ensemble
    phi_ensemble_weight_regex: float = 0.4  # Weight for regex in ensemble
    phi_calibration_enabled: bool = True  # Enable Platt scaling calibration
    phi_context_filter_enabled: bool = True  # Enable context-aware filtering

    # Phase 4: De-identification
    deidentification_default_method: str = "redact"  # redact, mask, surrogate, token
    deidentification_date_shift_days: int = 0  # 0 = random per session
    deidentification_preserve_format: bool = True
    deidentification_audit_enabled: bool = True

    # ===== Dictation Engine =====
    autocorrect_enabled: bool = True
    abbreviation_expansion: bool = False  # Expand abbreviations in output

    # Phase 4: Enhanced Dictation
    dictation_plugin_validation: bool = True  # Validate section content
    dictation_specialty_vocab_boost: bool = True  # Enable specialty vocabulary
    dictation_event_publishing: bool = True  # Publish dictation events

    # ===== Analytics Engine =====
    latency_anomaly_threshold: float = 0.2  # 20% deviation from baseline
    error_rate_alert_threshold: float = 0.05  # 5% error rate triggers alert
    circuit_breaker_threshold: int = 5  # Consecutive errors to open circuit

    # ===== Phase 6: Epic FHIR Integration =====
    epic_environment: str = "sandbox"  # sandbox or production
    epic_timeout_seconds: int = 30  # Request timeout
    epic_max_retries: int = 3  # Max retry attempts
    epic_cache_ttl_seconds: int = 300  # 5 minutes cache TTL
    epic_health_check_interval_seconds: int = 30  # Health check frequency
    epic_latency_threshold_ms: float = 2000.0  # Latency threshold for degraded status
    epic_error_rate_threshold: float = 0.1  # 10% error rate triggers degraded

    # Circuit breaker for Epic
    epic_circuit_failure_threshold: int = 5  # Failures to open circuit
    epic_circuit_success_threshold: int = 3  # Successes to close circuit
    epic_circuit_open_timeout_seconds: int = 60  # Time before half-open

    # EHR data freshness
    ehr_data_ttl_minutes: int = 15  # Session EHR data TTL
    ehr_auto_refresh: bool = True  # Auto-refresh stale data

    # ===== Feature Flags =====
    features: Dict[str, bool] = field(
        default_factory=lambda: {
            # Emotion features
            "emotion_personalization": True,
            "emotion_fusion": True,
            # Conversation features
            "predictive_turn_taking": True,
            "progressive_response": True,
            "ml_query_classifier": False,  # A/B test first
            # Phase 3 conversation features
            "predictive_turn_signal_events": True,  # Emit prosody.turn_signal events
            "emotion_aware_backchannels": True,  # Emotion-based phrase selection
            "backchannel_user_calibration": True,  # Per-user timing calibration
            "reference_resolution": True,  # Pronoun/entity resolution
            "repair_emotion_escalation": True,  # Emotion-aware repair escalation
            # Clinical features
            "phi_ner_model": False,  # A/B test first
            "code_extraction": True,
            "drug_interactions": True,
            # Phase 4 clinical features
            "phi_enhanced_detector": False,  # A/B test first
            "phi_confidence_calibration": True,
            "phi_context_filtering": True,
            "deidentification_service": True,
            # Phase 4 dictation features
            "dictation_plugins_active": True,
            "dictation_section_validation": True,
            "medical_autocorrect_enhanced": True,
            # Memory features
            "progress_tracking": True,
            "session_memory": True,
            # Analytics features
            "anomaly_detection": True,
            "adaptive_tuning": True,
            # Phase 5: Clinical Intelligence Features
            "clinical_code_extractor": True,  # ICD-10, CPT, RxNorm extraction
            "clinical_code_ner": False,  # NER-based code extraction (A/B test)
            "high_impact_detection": True,  # Detect critical diagnoses
            "drug_interaction_checker": True,  # Drug-drug interaction checking
            "drug_interaction_detailed": True,  # Include mechanism/alternatives
            "allergy_crossreactivity": True,  # Allergy cross-reactivity checking
            "dosing_guidance": True,  # Renal/hepatic dosing adjustments
            "medication_reconciliation": True,  # EHR vs dictation reconciliation
            "lab_trending": True,  # Lab value trending and alerts
            "critical_lab_alerts": True,  # Critical/panic value alerts
            "care_gap_detection": False,  # Care gap detection (requires EHR)
            "clinical_plugins": True,  # Clinical plugin architecture
            "clinical_events": True,  # Publish context.clinical_alert events
            # Phase 6: Epic FHIR Integration Features
            "epic_fhir_read_only": False,  # Master switch for Epic integration (A/B test)
            "epic_patient_context": True,  # Fetch patient demographics
            "epic_medications": True,  # Fetch medications
            "epic_conditions": True,  # Fetch conditions/problems
            "epic_allergies": True,  # Fetch allergies
            "epic_vitals": True,  # Fetch vital signs
            "epic_labs": True,  # Fetch lab results
            "epic_procedures": False,  # Fetch procedures (optional)
            "epic_voice_queries": True,  # Voice commands for EHR data
            "epic_context_enrichment": True,  # Merge EHR into session context
            "epic_discrepancy_detection": True,  # Compare EHR vs dictation
            "epic_provider_monitoring": True,  # Health monitoring for Epic API
            "epic_fallback_mode": True,  # Enable fallback when Epic unavailable
            "epic_audit_logging": True,  # Audit all EHR accesses
            # Phase 6b: Epic FHIR Write Operations
            "epic_fhir_write": False,  # Master switch for write operations (A/B test)
            "epic_voice_commands": True,  # Voice commands for orders (requires epic_fhir_write)
            "epic_medication_orders": True,  # Create MedicationRequest resources
            "epic_lab_orders": True,  # Create ServiceRequest for labs
            "epic_imaging_orders": True,  # Create ServiceRequest for imaging
            "epic_note_creation": True,  # Create DocumentReference (notes)
            "epic_conflict_detection": True,  # Check for duplicate orders
            "epic_order_confirmation": True,  # Require voice confirmation for orders
            "epic_write_audit_logging": True,  # Audit all write operations
        }
    )

    # ===== A/B Test Configuration =====
    ab_tests: Dict[str, Dict[str, Any]] = field(
        default_factory=lambda: {
            "ml_query_classifier": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["heuristic", "ml"],
            },
            "phi_ner_model": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["regex", "ner_hybrid"],
            },
            # Phase 3 A/B tests
            "predictive_turn_taking_v2": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["v1_basic", "v2_prosody"],
            },
            "emotion_aware_backchannels": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["static", "emotion_aware"],
            },
            "reference_resolution": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["disabled", "enabled"],
            },
            # Phase 4 A/B tests
            "phi_enhanced_detector": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["regex_only", "ner_ensemble"],
            },
            "deidentification_method": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["redact", "surrogate"],
            },
            "dictation_specialty_plugins": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["basic", "enhanced"],
            },
            "medical_autocorrect": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["basic", "ml_enhanced"],
            },
            # Phase 5 A/B tests
            "clinical_code_extraction": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["pattern_only", "ner_enhanced"],
            },
            "drug_interaction_level": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["basic", "detailed_with_alternatives"],
            },
            "lab_alerting": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["critical_only", "trending_enabled"],
            },
            "clinical_plugins": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["disabled", "specialty_plugins"],
            },
            # Phase 6 A/B tests
            "epic_fhir_integration": {
                "enabled": True,
                "control_percent": 80,  # 80% control (no EHR), 20% treatment
                "variants": ["disabled", "read_only"],
            },
            "epic_context_enrichment": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["manual_only", "auto_enriched"],
            },
            "epic_voice_queries": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["disabled", "enabled"],
            },
            "epic_discrepancy_alerts": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["silent", "alert_enabled"],
            },
            # Phase 6b A/B tests
            "epic_fhir_write": {
                "enabled": True,
                "control_percent": 90,  # 90% control (no write), 10% treatment
                "variants": ["disabled", "enabled"],
            },
            "epic_voice_orders": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["manual_only", "voice_enabled"],
            },
            "epic_order_confirmation": {
                "enabled": True,
                "control_percent": 0,  # 100% require confirmation (safety)
                "variants": ["required", "optional"],
            },
            "epic_conflict_detection_mode": {
                "enabled": True,
                "control_percent": 50,
                "variants": ["warn_only", "block_duplicates"],
            },
        }
    )


class PolicyService:
    """
    Manages policy configuration with runtime updates.

    Provides:
    - Feature flag checking with A/B test support
    - User-level overrides
    - Runtime configuration updates
    """

    def __init__(self, config: Optional[VoicePolicyConfig] = None):
        self.config = config or VoicePolicyConfig()
        self._user_overrides: Dict[str, Dict[str, Any]] = {}
        self._ab_assignments: Dict[str, Dict[str, str]] = {}
        logger.info("PolicyService initialized")

    def is_feature_enabled(
        self,
        feature: str,
        user_id: Optional[str] = None,
    ) -> bool:
        """
        Check if feature is enabled.

        Considers:
        1. User-level overrides
        2. A/B test assignments
        3. Global feature flags
        """
        # Check user override first
        if user_id and user_id in self._user_overrides:
            override = self._user_overrides[user_id].get(feature)
            if override is not None:
                return override

        # Check A/B test
        if user_id and feature in self.config.ab_tests:
            test_config = self.config.ab_tests[feature]
            if test_config.get("enabled", False):
                variant = self._get_ab_variant(user_id, feature, test_config)
                # First variant is control (feature off), second is treatment
                return variant != test_config["variants"][0]

        # Return global flag
        return self.config.features.get(feature, False)

    def get_variant(
        self,
        test_name: str,
        user_id: str,
    ) -> Optional[str]:
        """Get A/B test variant for user"""
        if test_name not in self.config.ab_tests:
            return None

        test_config = self.config.ab_tests[test_name]
        if not test_config.get("enabled", False):
            return None

        return self._get_ab_variant(user_id, test_name, test_config)

    def _get_ab_variant(
        self,
        user_id: str,
        test_name: str,
        test_config: Dict[str, Any],
    ) -> str:
        """
        Get deterministic A/B variant using consistent hashing.

        Same user always gets same variant for a test.
        """
        cache_key = f"{user_id}:{test_name}"

        # Check cached assignment
        if user_id in self._ab_assignments:
            if test_name in self._ab_assignments[user_id]:
                return self._ab_assignments[user_id][test_name]

        # Calculate variant deterministically
        hash_input = f"{user_id}:{test_name}"
        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
        bucket = hash_value % 100

        control_percent = test_config.get("control_percent", 50)
        variants = test_config.get("variants", ["control", "treatment"])

        if bucket < control_percent:
            variant = variants[0]  # Control
        else:
            variant = variants[1] if len(variants) > 1 else variants[0]

        # Cache assignment
        if user_id not in self._ab_assignments:
            self._ab_assignments[user_id] = {}
        self._ab_assignments[user_id][test_name] = variant

        return variant

    def set_user_override(
        self,
        user_id: str,
        feature: str,
        enabled: bool,
    ) -> None:
        """Set user-level feature override"""
        if user_id not in self._user_overrides:
            self._user_overrides[user_id] = {}
        self._user_overrides[user_id][feature] = enabled
        logger.info(f"Set override for {user_id}: {feature}={enabled}")

    def clear_user_overrides(self, user_id: str) -> None:
        """Clear all overrides for a user"""
        if user_id in self._user_overrides:
            del self._user_overrides[user_id]

    def get_config_value(self, key: str) -> Any:
        """Get a configuration value by key"""
        return getattr(self.config, key, None)

    def update_config(self, updates: Dict[str, Any]) -> None:
        """Update configuration values at runtime"""
        for key, value in updates.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                logger.info(f"Updated config: {key}={value}")

    def update_feature_flag(self, feature: str, enabled: bool) -> None:
        """Update a feature flag"""
        self.config.features[feature] = enabled
        logger.info(f"Updated feature flag: {feature}={enabled}")

    def get_all_features(self) -> Dict[str, bool]:
        """Get all feature flags"""
        return self.config.features.copy()

    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            "emotion_deviation_threshold": self.config.emotion_deviation_threshold,
            "baseline_learning_rate": self.config.baseline_learning_rate,
            "repair_retry_limit": self.config.repair_retry_limit,
            "backchannel_min_gap_ms": self.config.backchannel_min_gap_ms,
            "response_delay_complex_ms": self.config.response_delay_complex_ms,
            "phi_confidence_threshold": self.config.phi_confidence_threshold,
            "latency_anomaly_threshold": self.config.latency_anomaly_threshold,
            "features": self.config.features,
            "ab_tests": self.config.ab_tests,
        }


# Global policy service instance
_policy_service_instance: Optional[PolicyService] = None


def get_policy_service() -> PolicyService:
    """Get the global policy service instance"""
    global _policy_service_instance
    if _policy_service_instance is None:
        _policy_service_instance = PolicyService()
    return _policy_service_instance


def reset_policy_service() -> None:
    """Reset the global policy service (for testing)"""
    global _policy_service_instance
    _policy_service_instance = None


__all__ = [
    "VoicePolicyConfig",
    "PolicyService",
    "get_policy_service",
    "reset_policy_service",
]
