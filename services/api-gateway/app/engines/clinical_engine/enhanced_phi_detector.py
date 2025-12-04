"""
Enhanced PHI Detector - Transformer-Based NER + Regex Ensemble

Combines fine-tuned transformer model (RoBERTa on i2b2 PHI dataset)
with regex patterns for comprehensive PHI detection.

Phase 4 Features:
- NER model inference with batch processing
- Confidence calibration using Platt scaling
- Context-aware PHI filtering
- Event publishing for PHI alerts
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class PHICategory(Enum):
    """HIPAA Safe Harbor PHI categories"""

    NAME = "name"
    DATE = "date"
    DOB = "dob"
    AGE = "age_over_89"
    SSN = "ssn"
    MRN = "mrn"
    PHONE = "phone"
    FAX = "fax"
    EMAIL = "email"
    ADDRESS = "address"
    CITY = "city"
    STATE = "state"
    ZIP = "zip"
    URL = "url"
    IP = "ip"
    DEVICE_ID = "device_id"
    LICENSE = "license"
    VEHICLE_ID = "vehicle_id"
    ACCOUNT = "account"
    CERTIFICATE = "certificate"
    BIOMETRIC = "biometric"
    PHOTO = "photo"
    ORGANIZATION = "organization"


@dataclass
class NERPrediction:
    """Raw NER model prediction"""

    text: str
    entity_type: str
    start_pos: int
    end_pos: int
    raw_score: float
    model_name: str = "roberta-phi"


@dataclass
class EnhancedPHIDetection:
    """Enhanced PHI detection result with calibrated confidence"""

    text: str
    phi_category: PHICategory
    start_pos: int
    end_pos: int
    raw_confidence: float
    calibrated_confidence: float
    source: str  # "regex", "ner", "ensemble"
    is_current_patient: bool = False
    suppressed: bool = False
    suppression_reason: Optional[str] = None
    detected_at: datetime = field(default_factory=datetime.utcnow)
    context_snippet: Optional[str] = None


class EnhancedPHIDetector:
    """
    Transformer-based PHI detector with calibrated confidence.

    Architecture:
    1. Regex patterns for structured PHI (SSN, phone, dates, emails)
    2. Fine-tuned RoBERTa model for unstructured PHI (names, addresses)
    3. Ensemble scoring with learned weights
    4. Platt scaling for confidence calibration
    5. Context-aware filtering for current patient

    Usage:
        detector = EnhancedPHIDetector(policy_config, event_bus)
        await detector.initialize()
        detections = await detector.detect(text, patient_context, session_id)
    """

    # NER model entity type to PHI category mapping
    NER_TO_PHI_MAP = {
        "PERSON": PHICategory.NAME,
        "PER": PHICategory.NAME,
        "NAME": PHICategory.NAME,
        "PATIENT": PHICategory.NAME,
        "DOCTOR": PHICategory.NAME,
        "DATE": PHICategory.DATE,
        "TIME": PHICategory.DATE,
        "AGE": PHICategory.AGE,
        "LOCATION": PHICategory.ADDRESS,
        "LOC": PHICategory.ADDRESS,
        "ADDRESS": PHICategory.ADDRESS,
        "CITY": PHICategory.CITY,
        "STATE": PHICategory.STATE,
        "ZIP": PHICategory.ZIP,
        "COUNTRY": PHICategory.ADDRESS,
        "ORG": PHICategory.ORGANIZATION,
        "ORGANIZATION": PHICategory.ORGANIZATION,
        "HOSPITAL": PHICategory.ORGANIZATION,
        "PHONE": PHICategory.PHONE,
        "FAX": PHICategory.FAX,
        "EMAIL": PHICategory.EMAIL,
        "URL": PHICategory.URL,
        "ID": PHICategory.MRN,
        "MEDICALRECORD": PHICategory.MRN,
        "SSN": PHICategory.SSN,
        "DEVICE": PHICategory.DEVICE_ID,
        "IDNUM": PHICategory.MRN,
    }

    # Model configuration
    DEFAULT_MODEL_NAME = "roberta-base-phi-i2b2"
    MAX_SEQUENCE_LENGTH = 512
    BATCH_SIZE = 8

    def __init__(
        self,
        policy_config=None,
        event_bus=None,
        calibrator=None,
        context_filter=None,
    ):
        self.policy_config = policy_config
        self.event_bus = event_bus
        self._calibrator = calibrator
        self._context_filter = context_filter

        # Model state
        self._model = None
        self._tokenizer = None
        self._model_loaded = False

        # Regex detector (from existing implementation)
        self._regex_detector = None

        # Configuration
        self._use_ner = self._get_config("phi_use_ner_model", False)
        self._confidence_threshold = self._get_config("phi_confidence_threshold", 0.85)
        self._ensemble_weight_ner = 0.6
        self._ensemble_weight_regex = 0.4

        logger.info(
            f"EnhancedPHIDetector initialized (NER: {self._use_ner}, " f"threshold: {self._confidence_threshold})"
        )

    def _get_config(self, key: str, default: Any) -> Any:
        """Get configuration value with fallback"""
        if self.policy_config:
            return getattr(self.policy_config, key, default)
        return default

    async def initialize(self) -> bool:
        """Initialize detector components"""
        from .phi_detector import PHIDetector

        # Initialize regex detector
        self._regex_detector = PHIDetector(self.policy_config)

        # Initialize NER model if enabled
        if self._use_ner:
            success = await self._load_ner_model()
            if not success:
                logger.warning("NER model failed to load, falling back to regex-only mode")
                self._use_ner = False

        # Initialize calibrator if not provided
        if self._calibrator is None:
            from .phi_confidence_calibrator import PHIConfidenceCalibrator

            self._calibrator = PHIConfidenceCalibrator()

        # Initialize context filter if not provided
        if self._context_filter is None:
            from .context_aware_phi_filter import ContextAwarePHIFilter

            self._context_filter = ContextAwarePHIFilter()

        logger.info("EnhancedPHIDetector initialization complete")
        return True

    async def _load_ner_model(self) -> bool:
        """Load fine-tuned NER model"""
        try:
            # Lazy import to avoid loading transformers unless needed
            try:
                from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline
            except ImportError:
                logger.warning("transformers library not installed, NER disabled")
                return False

            model_path = self._get_config("phi_ner_model_path", self.DEFAULT_MODEL_NAME)

            logger.info(f"Loading NER model from {model_path}")

            # Load tokenizer and model
            self._tokenizer = AutoTokenizer.from_pretrained(model_path)
            self._model = AutoModelForTokenClassification.from_pretrained(model_path)

            # Create pipeline for easier inference
            self._ner_pipeline = pipeline(
                "ner",
                model=self._model,
                tokenizer=self._tokenizer,
                aggregation_strategy="simple",
            )

            self._model_loaded = True
            logger.info("NER model loaded successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to load NER model: {e}")
            return False

    async def detect(
        self,
        text: str,
        patient_context: Optional[Dict] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[EnhancedPHIDetection]:
        """
        Detect PHI in text using ensemble approach.

        Args:
            text: Text to scan for PHI
            patient_context: Current patient info for context-aware filtering
            session_id: Session ID for event publishing
            user_id: User ID for A/B test variants

        Returns:
            List of enhanced PHI detections with calibrated confidence
        """
        if not self._regex_detector:
            await self.initialize()

        all_detections = []

        # Run regex detection
        regex_detections = await self._detect_regex(text)
        all_detections.extend(regex_detections)

        # Run NER detection if enabled
        if self._use_ner and self._model_loaded:
            ner_detections = await self._detect_ner(text)
            all_detections.extend(ner_detections)

        # Merge overlapping detections
        merged = self._merge_detections(all_detections)

        # Calibrate confidence scores
        calibrated = self._calibrator.calibrate_batch(merged)

        # Apply context-aware filtering
        if patient_context:
            filtered = await self._context_filter.filter(calibrated, patient_context)
        else:
            filtered = calibrated

        # Filter by confidence threshold
        final = [d for d in filtered if d.calibrated_confidence >= self._confidence_threshold]

        # Publish PHI alert events
        if self.event_bus and session_id:
            await self._publish_phi_events(final, session_id, user_id)

        return final

    async def _detect_regex(self, text: str) -> List[EnhancedPHIDetection]:
        """Detect PHI using regex patterns"""

        regex_results = self._regex_detector._detect_regex(text)
        enhanced = []

        for detection in regex_results:
            phi_category = self._map_phi_type_to_category(detection.phi_type)
            enhanced.append(
                EnhancedPHIDetection(
                    text=detection.text,
                    phi_category=phi_category,
                    start_pos=detection.start_pos,
                    end_pos=detection.end_pos,
                    raw_confidence=detection.confidence,
                    calibrated_confidence=detection.confidence,  # Will be calibrated later
                    source="regex",
                    context_snippet=self._get_context_snippet(text, detection.start_pos, detection.end_pos),
                )
            )

        return enhanced

    async def _detect_ner(self, text: str) -> List[EnhancedPHIDetection]:
        """Detect PHI using NER model"""
        if not self._model_loaded:
            return []

        try:
            # Handle long texts by chunking
            chunks = self._chunk_text(text)
            all_predictions = []

            for chunk_text, chunk_offset in chunks:
                predictions = await asyncio.to_thread(self._ner_pipeline, chunk_text)

                for pred in predictions:
                    # Adjust positions for chunk offset
                    all_predictions.append(
                        NERPrediction(
                            text=pred.get("word", ""),
                            entity_type=pred.get("entity_group", "O"),
                            start_pos=pred.get("start", 0) + chunk_offset,
                            end_pos=pred.get("end", 0) + chunk_offset,
                            raw_score=pred.get("score", 0.0),
                        )
                    )

            # Convert NER predictions to enhanced detections
            enhanced = []
            for pred in all_predictions:
                phi_category = self._map_ner_entity_to_category(pred.entity_type)
                if phi_category:
                    enhanced.append(
                        EnhancedPHIDetection(
                            text=pred.text,
                            phi_category=phi_category,
                            start_pos=pred.start_pos,
                            end_pos=pred.end_pos,
                            raw_confidence=pred.raw_score,
                            calibrated_confidence=pred.raw_score,  # Will be calibrated later
                            source="ner",
                            context_snippet=self._get_context_snippet(text, pred.start_pos, pred.end_pos),
                        )
                    )

            return enhanced

        except Exception as e:
            logger.error(f"NER detection failed: {e}")
            return []

    def _chunk_text(self, text: str) -> List[Tuple[str, int]]:
        """Split text into chunks for model processing"""
        chunks = []
        max_len = self.MAX_SEQUENCE_LENGTH - 10  # Leave room for special tokens

        # Simple word-boundary chunking
        words = text.split()
        current_chunk = []
        current_len = 0
        current_offset = 0

        for word in words:
            word_len = len(word) + 1  # +1 for space
            if current_len + word_len > max_len and current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append((chunk_text, current_offset))
                current_offset += len(chunk_text) + 1
                current_chunk = [word]
                current_len = len(word)
            else:
                current_chunk.append(word)
                current_len += word_len

        # Add remaining chunk
        if current_chunk:
            chunks.append((" ".join(current_chunk), current_offset))

        return chunks if chunks else [(text, 0)]

    def _merge_detections(
        self,
        detections: List[EnhancedPHIDetection],
    ) -> List[EnhancedPHIDetection]:
        """Merge overlapping detections from different sources"""
        if not detections:
            return []

        # Sort by position
        sorted_detections = sorted(detections, key=lambda d: (d.start_pos, -d.raw_confidence))

        merged = []
        current = None

        for detection in sorted_detections:
            if current is None:
                current = detection
            elif detection.start_pos < current.end_pos:
                # Overlapping - merge with ensemble scoring
                current = self._merge_two_detections(current, detection)
            else:
                # No overlap - add current and start new
                merged.append(current)
                current = detection

        if current:
            merged.append(current)

        return merged

    def _merge_two_detections(
        self,
        det1: EnhancedPHIDetection,
        det2: EnhancedPHIDetection,
    ) -> EnhancedPHIDetection:
        """Merge two overlapping detections"""
        # Prefer detection with higher confidence
        if det1.raw_confidence >= det2.raw_confidence:
            primary, secondary = det1, det2
        else:
            primary, secondary = det2, det1

        # Ensemble confidence if from different sources
        if det1.source != det2.source:
            ensemble_confidence = self._ensemble_weight_ner * max(
                det1.raw_confidence, det2.raw_confidence
            ) + self._ensemble_weight_regex * min(det1.raw_confidence, det2.raw_confidence)
            source = "ensemble"
        else:
            ensemble_confidence = primary.raw_confidence
            source = primary.source

        # Take the union of positions
        return EnhancedPHIDetection(
            text=primary.text,
            phi_category=primary.phi_category,
            start_pos=min(det1.start_pos, det2.start_pos),
            end_pos=max(det1.end_pos, det2.end_pos),
            raw_confidence=ensemble_confidence,
            calibrated_confidence=ensemble_confidence,
            source=source,
            context_snippet=primary.context_snippet,
        )

    def _map_phi_type_to_category(self, phi_type: str) -> PHICategory:
        """Map legacy PHI type to category enum"""
        phi_type_lower = phi_type.lower()
        try:
            return PHICategory(phi_type_lower)
        except ValueError:
            return PHICategory.MRN  # Default category

    def _map_ner_entity_to_category(self, entity_type: str) -> Optional[PHICategory]:
        """Map NER entity type to PHI category"""
        entity_upper = entity_type.upper()
        return self.NER_TO_PHI_MAP.get(entity_upper)

    def _get_context_snippet(
        self,
        text: str,
        start: int,
        end: int,
        context_chars: int = 30,
    ) -> str:
        """Get context snippet around detection"""
        snippet_start = max(0, start - context_chars)
        snippet_end = min(len(text), end + context_chars)
        snippet = text[snippet_start:snippet_end]

        if snippet_start > 0:
            snippet = "..." + snippet
        if snippet_end < len(text):
            snippet = snippet + "..."

        return snippet

    async def _publish_phi_events(
        self,
        detections: List[EnhancedPHIDetection],
        session_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Publish PHI detection events"""
        if not self.event_bus:
            return

        # Group by suppression status
        active = [d for d in detections if not d.suppressed]
        suppressed = [d for d in detections if d.suppressed]

        # Publish active PHI alerts
        if active:
            await self.event_bus.publish_event(
                event_type="context.phi_alert",
                data={
                    "count": len(active),
                    "phi_types": list(set(d.phi_category.value for d in active)),
                    "highest_confidence": max(d.calibrated_confidence for d in active),
                    "sources": list(set(d.source for d in active)),
                    "session_id": session_id,
                    "user_id": user_id,
                },
                session_id=session_id,
                source_engine="clinical",
            )

        # Publish suppressed PHI info (for analytics)
        if suppressed:
            await self.event_bus.publish_event(
                event_type="phi.suppressed",
                data={
                    "count": len(suppressed),
                    "reasons": list(set(d.suppression_reason for d in suppressed if d.suppression_reason)),
                },
                session_id=session_id,
                source_engine="clinical",
            )

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded model"""
        return {
            "ner_enabled": self._use_ner,
            "model_loaded": self._model_loaded,
            "model_name": self.DEFAULT_MODEL_NAME if self._model_loaded else None,
            "confidence_threshold": self._confidence_threshold,
            "ensemble_weights": {
                "ner": self._ensemble_weight_ner,
                "regex": self._ensemble_weight_regex,
            },
        }


__all__ = [
    "EnhancedPHIDetector",
    "EnhancedPHIDetection",
    "PHICategory",
    "NERPrediction",
]
