"""
Clinical Engine - Clinical Intelligence and Compliance

This engine handles all clinical/medical functionality:
- PHI Detection: Hybrid NER + regex for PHI identification
- Code Extraction: ICD-10, CPT, RxNorm code extraction
- Clinical Reasoning: Drug interactions, contraindications
- Care Gaps: Quality measure tracking (deferred)

Phase 4 Enhancements:
- EnhancedPHIDetector: Transformer-based NER + regex ensemble
- PHIConfidenceCalibrator: Platt scaling for confidence calibration
- ContextAwarePHIFilter: Intelligent alert suppression
- DeidentificationService: PHI removal and surrogation
- A/B testing for PHI NER model

Phase 5 Enhancements:
- CodeExtractor: Enhanced with high-impact detection and alerts
- ClinicalReasoning: Expanded drug interactions, allergy cross-reactivity
- MedicationReconciliationService: EHR vs dictation comparison
- LabTrendingService: Lab value monitoring and alerts
- CareGapsService: Quality measure tracking (interfaces)
- ClinicalPluginRegistry: Extensible clinical plugin architecture

Phase 6 Enhancements:
- EpicAdapter: FHIR R4 client for Epic EHR integration
- EHRDataService: Session context integration with EHR data
- EpicProviderMonitor: Health monitoring and circuit breaker
- Voice commands for EHR queries
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class PHIDetection:
    """PHI detection result"""

    text: str
    phi_type: str  # name, dob, mrn, ssn, phone, address, etc.
    start_pos: int
    end_pos: int
    confidence: float
    is_current_patient: bool = False
    suppressed: bool = False


@dataclass
class ClinicalCode:
    """Extracted clinical code"""

    code: str
    code_system: str  # icd10, cpt, rxnorm, snomed
    display_name: str
    confidence: float
    source_text: str


@dataclass
class DrugInteraction:
    """Drug interaction alert"""

    drug1: str
    drug2: str
    severity: str  # minor, moderate, major, contraindicated
    description: str
    recommendation: str


class ClinicalEngine:
    """
    Facade for all clinical intelligence functionality.

    Consolidates:
    - dictation_phi_monitor.py → phi_detector.py
    - code_extractor.py (ICD-10, CPT, RxNorm)
    - reasoning.py (drug interactions)
    - care_gaps.py (HEDIS/MIPS measures)

    Phase 4 Components:
    - enhanced_phi_detector.py (transformer NER + regex ensemble)
    - phi_confidence_calibrator.py (Platt scaling)
    - context_aware_phi_filter.py (intelligent suppression)
    - deidentification_service.py (PHI removal/surrogation)

    Phase 5 Components:
    - medication_reconciliation.py (EHR vs dictation comparison)
    - lab_trending.py (lab value monitoring and alerts)
    - clinical_plugins.py (extensible plugin architecture)

    Phase 6 Components:
    - Epic adapter for FHIR R4 EHR access
    - EHR data service for session context
    - Provider monitoring with circuit breaker
    """

    def __init__(
        self,
        event_bus=None,
        policy_config=None,
        policy_service=None,
        audit_service=None,
    ):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self.policy_service = policy_service
        self.audit_service = audit_service

        # Legacy/Core components
        self._phi_detector = None
        self._code_extractor = None
        self._reasoning = None
        self._care_gaps = None

        # Phase 4 components
        self._enhanced_phi_detector = None
        self._phi_calibrator = None
        self._phi_filter = None
        self._deidentification_service = None

        # Phase 5 components
        self._medication_reconciliation = None
        self._lab_trending = None
        self._clinical_plugin_registry = None

        # Phase 6 components
        self._epic_adapter = None
        self._ehr_data_service = None
        self._provider_monitor = None

        # Feature flags
        self._use_enhanced_phi = self._is_feature_enabled("phi_ner_model")
        self._use_clinical_plugins = self._is_feature_enabled("clinical_plugins")
        self._use_epic_fhir = self._is_feature_enabled("epic_fhir_read_only")

        logger.info(
            f"ClinicalEngine initialized "
            f"(enhanced PHI: {self._use_enhanced_phi}, "
            f"plugins: {self._use_clinical_plugins}, "
            f"epic FHIR: {self._use_epic_fhir})"
        )

    def _is_feature_enabled(self, feature: str, user_id: Optional[str] = None) -> bool:
        """Check if a feature is enabled via policy service"""
        if self.policy_service:
            return self.policy_service.is_feature_enabled(feature, user_id)
        if self.policy_config:
            features = getattr(self.policy_config, "features", {})
            return features.get(feature, False)
        return False

    def _get_ab_variant(self, test_name: str, user_id: str) -> Optional[str]:
        """Get A/B test variant for a user"""
        if self.policy_service:
            return self.policy_service.get_variant(test_name, user_id)
        return None

    async def initialize(self):
        """Initialize sub-components lazily"""
        from .care_gaps import CareGapsService
        from .code_extractor import CodeExtractor
        from .phi_detector import PHIDetector
        from .reasoning import ClinicalReasoning

        # Initialize core components
        self._phi_detector = PHIDetector(self.policy_config)
        self._code_extractor = CodeExtractor(
            event_bus=self.event_bus,
            policy_config=self.policy_config,
        )
        self._reasoning = ClinicalReasoning(
            event_bus=self.event_bus,
            policy_config=self.policy_config,
        )
        self._care_gaps = CareGapsService(event_bus=self.event_bus)

        # Initialize Phase 4 components if enabled
        if self._use_enhanced_phi:
            await self._initialize_enhanced_phi()

        # Initialize Phase 5 components
        await self._initialize_phase5_components()

        # Initialize Phase 6 components if enabled
        if self._use_epic_fhir:
            await self._initialize_phase6_components()

        logger.info("ClinicalEngine sub-components initialized")

    async def _initialize_phase5_components(self):
        """Initialize Phase 5 clinical intelligence components"""
        from .clinical_plugins import CardiologyPlugin, ClinicalPluginRegistry, OncologyPlugin
        from .lab_trending import LabTrendingService
        from .medication_reconciliation import MedicationReconciliationService

        # Medication reconciliation
        if self._is_feature_enabled("medication_reconciliation"):
            self._medication_reconciliation = MedicationReconciliationService(
                event_bus=self.event_bus,
                clinical_reasoning=self._reasoning,
            )

        # Lab trending
        if self._is_feature_enabled("lab_trending"):
            self._lab_trending = LabTrendingService(event_bus=self.event_bus)

        # Clinical plugins
        if self._use_clinical_plugins:
            self._clinical_plugin_registry = ClinicalPluginRegistry(
                event_bus=self.event_bus,
                policy_config=self.policy_config,
            )
            # Register default specialty plugins
            self._clinical_plugin_registry.register(CardiologyPlugin(self.event_bus, self.policy_config))
            self._clinical_plugin_registry.register(OncologyPlugin(self.event_bus, self.policy_config))

        logger.info("Phase 5 clinical intelligence components initialized")

    async def _initialize_phase6_components(self):
        """Initialize Phase 6 Epic FHIR integration components"""
        try:
            from app.integrations.fhir import EHRDataService, EpicAdapter, EpicConfig, EpicEnvironment
            from app.integrations.fhir.provider_monitor import EpicProviderMonitor

            # Get Epic configuration from policy config
            environment = EpicEnvironment.SANDBOX
            if self.policy_config:
                env_str = getattr(self.policy_config, "epic_environment", "sandbox")
                environment = EpicEnvironment(env_str)

            # Create Epic config
            epic_config = EpicConfig(
                environment=environment,
                timeout_seconds=getattr(self.policy_config, "epic_timeout_seconds", 30) if self.policy_config else 30,
                max_retries=getattr(self.policy_config, "epic_max_retries", 3) if self.policy_config else 3,
            )

            # Initialize Epic adapter
            self._epic_adapter = EpicAdapter(
                epic_config=epic_config,
                event_bus=self.event_bus,
                audit_service=self.audit_service,
            )
            await self._epic_adapter.initialize()

            # Initialize EHR data service
            self._ehr_data_service = EHRDataService(
                epic_adapter=self._epic_adapter,
                event_bus=self.event_bus,
                audit_service=self.audit_service,
                policy_service=self.policy_service,
            )

            # Initialize provider monitor
            if self._is_feature_enabled("epic_provider_monitoring"):
                self._provider_monitor = EpicProviderMonitor(
                    epic_adapter=self._epic_adapter,
                    event_bus=self.event_bus,
                    health_check_interval_seconds=(
                        getattr(
                            self.policy_config,
                            "epic_health_check_interval_seconds",
                            30,
                        )
                        if self.policy_config
                        else 30
                    ),
                )
                await self._provider_monitor.start_monitoring()

            logger.info("Phase 6 Epic FHIR integration initialized")

        except ImportError as e:
            logger.warning(f"Phase 6 components not available: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize Phase 6 components: {e}")

    async def _initialize_enhanced_phi(self):
        """Initialize enhanced PHI detection components"""
        from .context_aware_phi_filter import ContextAwarePHIFilter
        from .deidentification_service import DeidentificationService
        from .enhanced_phi_detector import EnhancedPHIDetector
        from .phi_confidence_calibrator import PHIConfidenceCalibrator

        # Initialize calibrator and filter
        self._phi_calibrator = PHIConfidenceCalibrator()
        self._phi_filter = ContextAwarePHIFilter()

        # Initialize enhanced detector with dependencies
        self._enhanced_phi_detector = EnhancedPHIDetector(
            policy_config=self.policy_config,
            event_bus=self.event_bus,
            calibrator=self._phi_calibrator,
            context_filter=self._phi_filter,
        )
        await self._enhanced_phi_detector.initialize()

        # Initialize de-identification service
        self._deidentification_service = DeidentificationService(
            phi_detector=self._enhanced_phi_detector,
            audit_service=self.audit_service,
        )

        logger.info("Phase 4 enhanced PHI components initialized")

    async def detect_phi(
        self,
        text: str,
        session_id: str,
        patient_context: Optional[Dict] = None,
        user_id: Optional[str] = None,
    ) -> List[PHIDetection]:
        """
        Detect PHI in text.

        Uses hybrid NER + regex approach for comprehensive detection.
        Context-aware: suppresses alerts for current patient's own data.

        Phase 4: Uses enhanced detector with A/B testing when enabled.
        """
        if not self._phi_detector:
            await self.initialize()

        # Check A/B test variant for PHI NER model
        use_enhanced = self._use_enhanced_phi
        if user_id:
            variant = self._get_ab_variant("phi_ner_model", user_id)
            if variant == "ner_hybrid":
                use_enhanced = True
            elif variant == "regex":
                use_enhanced = False

        # Use enhanced detector if available and enabled
        if use_enhanced and self._enhanced_phi_detector:
            enhanced_results = await self._enhanced_phi_detector.detect(text, patient_context, session_id, user_id)
            # Convert to legacy format for backward compatibility
            return self._convert_enhanced_to_legacy(enhanced_results)

        # Fallback to legacy detector
        detections = await self._phi_detector.detect(text, patient_context)

        # Publish PHI events
        if self.event_bus:
            for detection in detections:
                if detection.suppressed:
                    await self.event_bus.publish_event(
                        event_type="phi.suppressed",
                        data={
                            "phi_type": detection.phi_type,
                            "reason": "current_patient",
                        },
                        session_id=session_id,
                        source_engine="clinical",
                    )
                else:
                    await self.event_bus.publish_event(
                        event_type="phi.detected",
                        data={
                            "phi_type": detection.phi_type,
                            "confidence": detection.confidence,
                        },
                        session_id=session_id,
                        source_engine="clinical",
                    )

        return detections

    def _convert_enhanced_to_legacy(
        self,
        enhanced_detections: List["EnhancedPHIDetection"],
    ) -> List[PHIDetection]:
        """Convert enhanced detections to legacy format"""
        return [
            PHIDetection(
                text=d.text,
                phi_type=d.phi_category.value,
                start_pos=d.start_pos,
                end_pos=d.end_pos,
                confidence=d.calibrated_confidence,
                is_current_patient=d.is_current_patient,
                suppressed=d.suppressed,
            )
            for d in enhanced_detections
        ]

    # ===== Phase 4: Enhanced PHI Detection =====

    async def detect_phi_enhanced(
        self,
        text: str,
        session_id: str,
        patient_context: Optional[Dict] = None,
        user_id: Optional[str] = None,
    ) -> List["EnhancedPHIDetection"]:
        """
        Detect PHI using enhanced NER + regex ensemble.

        Returns enhanced detections with calibrated confidence scores.
        """
        if not self._enhanced_phi_detector:
            await self._initialize_enhanced_phi()

        return await self._enhanced_phi_detector.detect(text, patient_context, session_id, user_id)

    async def deidentify_text(
        self,
        text: str,
        session_id: str,
        method: Optional[str] = None,
        patient_context: Optional[Dict] = None,
    ) -> "DeidentificationResult":
        """
        De-identify text by removing or replacing PHI.

        Args:
            text: Text to de-identify
            session_id: Session ID for consistent tokenization
            method: "redact", "mask", "surrogate", "token", or "shift"
            patient_context: Patient context for detection

        Returns:
            DeidentificationResult with transformed text
        """
        if not self._deidentification_service:
            await self._initialize_enhanced_phi()

        from .deidentification_service import DeidentificationMethod

        method_enum = None
        if method:
            method_enum = DeidentificationMethod(method)

        return await self._deidentification_service.deidentify(text, session_id, method_enum, patient_context)

    async def reidentify_text(
        self,
        text: str,
        session_id: str,
    ) -> Optional[str]:
        """
        Re-identify tokenized text (reverse de-identification).

        Only works for TOKEN method with valid session.
        """
        if not self._deidentification_service:
            return None

        return await self._deidentification_service.reidentify(text, session_id)

    async def record_phi_feedback(
        self,
        phi_category: str,
        raw_confidence: float,
        is_correct: bool,
    ) -> None:
        """
        Record feedback for PHI confidence calibration.

        Used to improve calibration over time.
        """
        if self._phi_calibrator:
            await self._phi_calibrator.record_feedback(phi_category, raw_confidence, is_correct)

    def get_phi_calibration_stats(self) -> Dict[str, Any]:
        """Get PHI calibration statistics per category"""
        if self._phi_calibrator:
            return self._phi_calibrator.get_category_stats()
        return {}

    def get_phi_model_info(self) -> Dict[str, Any]:
        """Get information about PHI detection model"""
        if self._enhanced_phi_detector:
            return self._enhanced_phi_detector.get_model_info()
        return {"ner_enabled": False, "model_loaded": False}

    async def extract_codes(
        self,
        text: str,
        code_systems: Optional[List[str]] = None,
    ) -> List[ClinicalCode]:
        """
        Extract clinical codes from text.

        Supports ICD-10, CPT, RxNorm, SNOMED code extraction.
        """
        if not self._code_extractor:
            await self.initialize()

        return await self._code_extractor.extract(text, code_systems)

    async def check_interactions(
        self,
        medications: List[str],
        session_id: Optional[str] = None,
    ) -> List[DrugInteraction]:
        """
        Check for drug-drug interactions.

        Returns list of interactions sorted by severity.
        """
        if not self._reasoning:
            await self.initialize()

        interactions = await self._reasoning.check_drug_interactions(medications)

        # Publish alert for severe interactions
        if self.event_bus and session_id:
            severe = [i for i in interactions if i.severity in ["major", "contraindicated"]]
            if severe:
                await self.event_bus.publish_event(
                    event_type="clinical.alert",
                    data={
                        "alert_type": "drug_interaction",
                        "severity": severe[0].severity,
                        "count": len(severe),
                        "topic": "medication_safety",
                    },
                    session_id=session_id,
                    source_engine="clinical",
                )

        return interactions

    async def get_contraindications(
        self,
        medication: str,
        conditions: List[str],
    ) -> List[Dict[str, Any]]:
        """Check medication contraindications against conditions"""
        if not self._reasoning:
            await self.initialize()

        return await self._reasoning.check_contraindications(medication, conditions)

    # ===== Phase 5: Clinical Intelligence Methods =====

    async def extract_codes_with_suggestions(
        self,
        text: str,
        code_systems: Optional[List[str]] = None,
        max_suggestions: int = 5,
        session_id: Optional[str] = None,
    ) -> tuple:
        """
        Extract codes and provide ranked suggestions.

        Returns:
            Tuple of (extracted_codes, ranked_suggestions)
        """
        if not self._code_extractor:
            await self.initialize()

        return await self._code_extractor.extract_with_suggestions(text, code_systems, max_suggestions, session_id)

    async def check_allergy_crossreactivity(
        self,
        medication: str,
        allergies: List[str],
        session_id: Optional[str] = None,
    ) -> List[Any]:
        """
        Check for allergy cross-reactivity.

        Returns list of AllergyAlert objects with risk levels.
        """
        if not self._reasoning:
            await self.initialize()

        return await self._reasoning.check_allergy_crossreact(medication, allergies, session_id)

    async def get_dosing_guidance(
        self,
        medication: str,
        indication: str,
        patient_factors: Dict[str, Any],
    ) -> Optional[Any]:
        """
        Get dosing recommendations based on patient factors.

        Args:
            medication: Medication name
            indication: Indication for use
            patient_factors: Dict with egfr, weight, age, etc.

        Returns:
            DosingGuidance with recommended dose and adjustments
        """
        if not self._reasoning:
            await self.initialize()

        return await self._reasoning.get_dosing_guidance(medication, indication, patient_factors)

    async def reconcile_medications(
        self,
        ehr_medications: List[str],
        dictation_medications: List[str],
        session_id: str,
    ) -> Any:
        """
        Reconcile medications from EHR and dictation.

        Args:
            ehr_medications: Medications from patient's EHR
            dictation_medications: Medications mentioned in dictation
            session_id: Session ID for event publishing

        Returns:
            ReconciliationResult with discrepancies
        """
        if not self._medication_reconciliation:
            await self.initialize()

        if not self._medication_reconciliation:
            logger.warning("Medication reconciliation service not available")
            return None

        return await self._medication_reconciliation.reconcile_simple(
            ehr_medications, dictation_medications, session_id
        )

    async def check_lab_value(
        self,
        test_name: str,
        value: float,
        unit: str,
        patient_conditions: Optional[List[str]] = None,
        session_id: Optional[str] = None,
    ) -> List[Any]:
        """
        Check a lab value for alerts.

        Returns list of LabAlert objects.
        """
        if not self._lab_trending:
            await self.initialize()

        if not self._lab_trending:
            logger.warning("Lab trending service not available")
            return []

        from datetime import datetime

        from .lab_trending import LabValue

        lab = LabValue(
            test_name=test_name,
            value=value,
            unit=unit,
            timestamp=datetime.utcnow(),
        )

        return await self._lab_trending.check_value(lab, patient_conditions, session_id)

    async def analyze_lab_trend(
        self,
        test_name: str,
        values: List[tuple],  # List of (value, timestamp) tuples
        session_id: Optional[str] = None,
    ) -> Optional[Any]:
        """
        Analyze trend for a series of lab values.

        Args:
            test_name: Name of the lab test
            values: List of (value, timestamp) tuples
            session_id: Session ID for event publishing

        Returns:
            LabTrend if sufficient data
        """
        if not self._lab_trending:
            await self.initialize()

        if not self._lab_trending:
            return None

        from .lab_trending import LabValue

        lab_values = [
            LabValue(
                test_name=test_name,
                value=v[0],
                unit="",
                timestamp=v[1],
            )
            for v in values
        ]

        return await self._lab_trending.analyze_trend(test_name, lab_values, session_id)

    async def detect_care_gaps(
        self,
        patient_id: str,
        patient_data: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Detect care gaps for a patient.

        Returns PatientGapSummary with all gaps.
        """
        if not self._care_gaps:
            await self.initialize()

        return await self._care_gaps.detect_gaps(patient_id, patient_data)

    async def run_clinical_plugins(
        self,
        session_id: str,
        patient_context: Optional[Dict[str, Any]] = None,
        text: Optional[str] = None,
        specialty: Optional[str] = None,
    ) -> List[Any]:
        """
        Run clinical plugins on current context.

        Args:
            session_id: Session ID
            patient_context: Patient data
            text: Current text being processed
            specialty: Optional specialty filter

        Returns:
            List of PluginResult objects
        """
        if not self._clinical_plugin_registry:
            return []

        from .clinical_plugins import PluginContext

        context = PluginContext(
            session_id=session_id,
            patient_context=patient_context,
            current_text=text,
            medications=patient_context.get("medications") if patient_context else None,
            conditions=patient_context.get("conditions") if patient_context else None,
            allergies=patient_context.get("allergies") if patient_context else None,
            lab_values=patient_context.get("labs") if patient_context else None,
        )

        return await self._clinical_plugin_registry.process_all(context, specialty)

    def register_clinical_plugin(self, plugin: Any) -> bool:
        """Register a clinical plugin"""
        if not self._clinical_plugin_registry:
            logger.warning("Clinical plugin registry not initialized")
            return False

        return self._clinical_plugin_registry.register(plugin)

    # ===== Phase 6: Epic FHIR Integration Methods =====

    async def load_patient_from_ehr(
        self,
        session_id: str,
        patient_fhir_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Load patient data from Epic EHR into session context.

        Args:
            session_id: Session ID
            patient_fhir_id: Epic patient FHIR ID
            user_id: User ID for audit

        Returns:
            EHR session context as dict
        """
        if not self._ehr_data_service:
            logger.warning("EHR data service not available")
            return None

        context = await self._ehr_data_service.set_patient(
            session_id=session_id,
            patient_fhir_id=patient_fhir_id,
            user_id=user_id,
        )

        return context.to_dict() if context else None

    async def get_ehr_context(
        self,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Get EHR data for session, formatted for memory context.

        Args:
            session_id: Session ID

        Returns:
            EHR data formatted for memory engine
        """
        if not self._ehr_data_service:
            return {"ehr_loaded": False, "ehr_status": "not_configured"}

        return self._ehr_data_service.get_memory_context(session_id)

    async def handle_ehr_voice_query(
        self,
        session_id: str,
        query: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Handle a voice query for EHR data.

        Args:
            session_id: Session ID
            query: Voice query text
            user_id: User ID for audit

        Returns:
            Query result with data and speech text
        """
        if not self._ehr_data_service:
            return {
                "success": False,
                "error": "EHR service not available",
                "speak_text": "EHR access is not currently available.",
            }

        result = await self._ehr_data_service.handle_voice_query(
            session_id=session_id,
            query=query,
            user_id=user_id,
        )

        return {
            "success": result.success,
            "query_type": result.query_type,
            "data": result.data,
            "summary": result.summary,
            "speak_text": result.speak_text,
            "error": result.error,
        }

    async def get_patient_from_ehr(
        self,
        patient_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get patient demographics from Epic EHR.

        Args:
            patient_id: Epic patient FHIR ID

        Returns:
            Patient data as dict
        """
        if not self._epic_adapter:
            return None

        patient = await self._epic_adapter.get_patient(patient_id)
        return patient.to_dict() if patient else None

    async def get_patient_summary_from_ehr(
        self,
        patient_id: str,
    ) -> Dict[str, Any]:
        """
        Get comprehensive patient summary from Epic EHR.

        Includes medications, conditions, allergies, vitals, and labs.

        Args:
            patient_id: Epic patient FHIR ID

        Returns:
            Patient summary dict
        """
        if not self._epic_adapter:
            return {"error": "Epic adapter not available"}

        return await self._epic_adapter.get_patient_summary(patient_id)

    def get_epic_health_status(self) -> Dict[str, Any]:
        """Get Epic API health status"""
        if not self._provider_monitor:
            return {"status": "not_configured"}

        return self._provider_monitor.get_status()

    def is_epic_available(self) -> bool:
        """Check if Epic API is available"""
        if not self._provider_monitor:
            return False

        return self._provider_monitor.is_available()

    def get_ehr_data_service(self):
        """Get the EHR data service instance"""
        return self._ehr_data_service

    def get_epic_adapter(self):
        """Get the Epic adapter instance"""
        return self._epic_adapter

    def get_clinical_engine_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics about the clinical engine"""
        stats = {
            "phase": 6,
            "phi_detection": {
                "enhanced": self._use_enhanced_phi,
                "calibration": self.get_phi_calibration_stats(),
            },
            "epic_fhir": {
                "enabled": self._use_epic_fhir,
                "available": self.is_epic_available(),
                "health": self.get_epic_health_status() if self._provider_monitor else None,
            },
        }

        if self._code_extractor:
            stats["code_extraction"] = self._code_extractor.get_extraction_stats()

        if self._reasoning:
            stats["clinical_reasoning"] = self._reasoning.get_reasoning_stats()

        if self._medication_reconciliation:
            stats["medication_reconciliation"] = self._medication_reconciliation.get_reconciliation_stats()

        if self._lab_trending:
            stats["lab_trending"] = self._lab_trending.get_trending_stats()

        if self._care_gaps:
            stats["care_gaps"] = self._care_gaps.get_care_gap_stats()

        if self._clinical_plugin_registry:
            stats["plugins"] = self._clinical_plugin_registry.get_registry_stats()

        return stats


__all__ = [
    "ClinicalEngine",
    "PHIDetection",
    "ClinicalCode",
    "DrugInteraction",
    # Phase 4 exports
    "EnhancedPHIDetection",
    "PHICategory",
    "DeidentificationResult",
    "DeidentificationMethod",
    # Phase 5 exports
    "CodeSeverity",
    "CodeSuggestion",
    "ClinicalAlert",
    "InteractionSeverity",
    "DrugInteractionDetail",
    "AllergyAlert",
    "DosingGuidance",
    "MedicationEntry",
    "MedicationDiscrepancy",
    "ReconciliationResult",
    "LabValue",
    "LabTrend",
    "LabAlert",
    "CareGap",
    "PatientGapSummary",
    "BaseClinicalPlugin",
    "ClinicalPluginRegistry",
    # Phase 6 exports
    "EpicAdapter",
    "EpicConfig",
    "EHRDataService",
    "EHRSessionContext",
    "FHIRPatient",
    "FHIRMedication",
    "FHIRCondition",
    "FHIRObservation",
    "FHIRAllergyIntolerance",
]

from .care_gaps import CareGap, PatientGapSummary

# Phase 5 re-exports for convenience
from .code_extractor import ClinicalAlert, CodeSeverity, CodeSuggestion
from .deidentification_service import DeidentificationMethod, DeidentificationResult

# Phase 4 re-exports for convenience
from .enhanced_phi_detector import EnhancedPHIDetection, PHICategory
from .lab_trending import LabAlert, LabTrend, LabValue
from .medication_reconciliation import MedicationDiscrepancy, MedicationEntry, ReconciliationResult
from .reasoning import AllergyAlert, DosingGuidance, DrugInteractionDetail, InteractionSeverity

# Phase 6 re-exports for convenience (conditional to handle missing dependencies)
try:
    from app.integrations.fhir import (
        EHRDataService,
        EHRSessionContext,
        EpicAdapter,
        EpicConfig,
        FHIRAllergyIntolerance,
        FHIRCondition,
        FHIRMedication,
        FHIRObservation,
        FHIRPatient,
    )
except ImportError:
    # Phase 6 components not installed
    pass
from .clinical_plugins import BaseClinicalPlugin, ClinicalPluginRegistry
