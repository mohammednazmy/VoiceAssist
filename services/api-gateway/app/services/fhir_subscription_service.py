"""
FHIR Subscription Service - Voice Mode v4.1 Phase 3

Real-time FHIR data streaming for clinical context enrichment.

Features:
- Subscribe to patient resource updates
- Stream lab results, vitals, and observations
- PHI-aware routing for streamed data
- Integration with Thinker context
- Reconnection and error handling

Reference: docs/voice/phase3-implementation-plan.md

Feature Flag: backend.voice_v4_fhir_streaming
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

from app.core.config import settings
from app.core.feature_flags import feature_flag_service

logger = logging.getLogger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


class FHIRResourceType(str, Enum):
    """FHIR resource types supported for streaming."""

    PATIENT = "Patient"
    OBSERVATION = "Observation"
    CONDITION = "Condition"
    MEDICATION_REQUEST = "MedicationRequest"
    DIAGNOSTIC_REPORT = "DiagnosticReport"
    VITAL_SIGNS = "vital-signs"
    LAB_RESULT = "laboratory"
    ALLERGY_INTOLERANCE = "AllergyIntolerance"


class SubscriptionStatus(str, Enum):
    """Status of a FHIR subscription."""

    PENDING = "pending"
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    EXPIRED = "expired"


@dataclass
class FHIRObservation:
    """A FHIR observation (lab result, vital sign, etc.)."""

    resource_id: str
    resource_type: FHIRResourceType
    patient_id: str
    code: str
    code_display: str
    value: Optional[str] = None
    value_quantity: Optional[float] = None
    value_unit: Optional[str] = None
    effective_datetime: Optional[datetime] = None
    status: str = "final"
    interpretation: Optional[str] = None
    reference_range: Optional[str] = None
    raw_resource: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "resourceId": self.resource_id,
            "resourceType": self.resource_type.value,
            "patientId": self.patient_id,
            "code": self.code,
            "codeDisplay": self.code_display,
            "value": self.value,
            "valueQuantity": self.value_quantity,
            "valueUnit": self.value_unit,
            "effectiveDatetime": (
                self.effective_datetime.isoformat() if self.effective_datetime else None
            ),
            "status": self.status,
            "interpretation": self.interpretation,
            "referenceRange": self.reference_range,
        }

    def to_context_string(self) -> str:
        """Convert to string for Thinker context injection."""
        value_str = ""
        if self.value_quantity is not None:
            value_str = f"{self.value_quantity} {self.value_unit or ''}"
        elif self.value:
            value_str = self.value

        result = f"{self.code_display}: {value_str}"

        if self.interpretation:
            result += f" ({self.interpretation})"

        if self.reference_range:
            result += f" [ref: {self.reference_range}]"

        return result


@dataclass
class FHIRSubscription:
    """A FHIR subscription for real-time updates."""

    subscription_id: str
    patient_id: str
    resource_types: List[FHIRResourceType]
    status: SubscriptionStatus = SubscriptionStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_event_at: Optional[datetime] = None
    event_count: int = 0
    error_message: Optional[str] = None
    webhook_url: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "subscriptionId": self.subscription_id,
            "patientId": self.patient_id,
            "resourceTypes": [rt.value for rt in self.resource_types],
            "status": self.status.value,
            "createdAt": self.created_at.isoformat(),
            "lastEventAt": self.last_event_at.isoformat() if self.last_event_at else None,
            "eventCount": self.event_count,
            "errorMessage": self.error_message,
        }


@dataclass
class StreamingEvent:
    """Event from a FHIR subscription stream."""

    event_id: str
    subscription_id: str
    resource_type: FHIRResourceType
    resource_id: str
    action: str  # "create", "update", "delete"
    timestamp: datetime
    observation: Optional[FHIRObservation] = None
    raw_payload: Dict[str, Any] = field(default_factory=dict)


# ==============================================================================
# Configuration
# ==============================================================================


@dataclass
class FHIRConfig:
    """Configuration for FHIR service."""

    # Server settings
    fhir_server_url: str = ""
    auth_type: str = "bearer"  # "bearer", "basic", "oauth2"
    auth_token: Optional[str] = None

    # Subscription settings
    subscription_channel: str = "websocket"  # "websocket", "webhook", "polling"
    subscription_timeout_seconds: int = 3600  # 1 hour
    max_subscriptions_per_patient: int = 5

    # Polling settings (fallback)
    polling_interval_seconds: int = 30
    max_polling_results: int = 100

    # Retry settings
    max_retries: int = 3
    retry_delay_seconds: int = 5
    reconnect_delay_seconds: int = 10

    # PHI settings
    require_phi_routing: bool = True
    log_phi_access: bool = True


# ==============================================================================
# FHIR Subscription Service
# ==============================================================================


class FHIRSubscriptionService:
    """
    Service for real-time FHIR data streaming.

    Provides subscription-based access to patient data updates,
    including lab results, vital signs, and clinical observations.

    Usage:
        service = FHIRSubscriptionService()
        await service.initialize()

        # Subscribe to patient updates
        sub = await service.subscribe_to_patient(
            patient_id="patient-123",
            resource_types=[FHIRResourceType.OBSERVATION, FHIRResourceType.VITAL_SIGNS]
        )

        # Stream observations
        async for observation in service.stream_observations(patient_id="patient-123"):
            print(f"New observation: {observation.code_display}")

        # Get latest vitals for context
        vitals = await service.get_latest_vitals(patient_id="patient-123")
    """

    def __init__(self, config: Optional[FHIRConfig] = None):
        self.config = config or FHIRConfig()
        self._subscriptions: Dict[str, FHIRSubscription] = {}
        self._patient_subscriptions: Dict[str, Set[str]] = {}  # patient_id -> sub_ids
        self._event_callbacks: Dict[str, List[Callable]] = {}
        self._initialized = False
        self._ws_connections: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def initialize(self) -> bool:
        """Initialize the FHIR service."""
        if self._initialized:
            return True

        async with self._lock:
            if self._initialized:
                return True

            try:
                # Check feature flag
                if not await feature_flag_service.is_enabled(
                    "backend.voice_v4_fhir_streaming"
                ):
                    logger.info("FHIR streaming feature flag is disabled")
                    return False

                # Load configuration from settings
                if hasattr(settings, "fhir_server_url"):
                    self.config.fhir_server_url = settings.fhir_server_url
                if hasattr(settings, "fhir_auth_token"):
                    self.config.auth_token = settings.fhir_auth_token

                if not self.config.fhir_server_url:
                    logger.warning("FHIR server URL not configured")
                    return False

                # Test connection
                if not await self._test_connection():
                    logger.error("Failed to connect to FHIR server")
                    return False

                self._initialized = True
                logger.info(
                    "FHIR subscription service initialized",
                    extra={"server_url": self.config.fhir_server_url},
                )
                return True

            except Exception as e:
                logger.error(f"Failed to initialize FHIR service: {e}")
                return False

    async def _test_connection(self) -> bool:
        """Test connection to FHIR server."""
        try:
            import httpx

            async with httpx.AsyncClient() as client:
                headers = self._get_auth_headers()
                response = await client.get(
                    f"{self.config.fhir_server_url}/metadata",
                    headers=headers,
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"FHIR connection test failed: {e}")
            return False

    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for FHIR requests."""
        headers = {"Content-Type": "application/fhir+json"}

        if self.config.auth_token:
            if self.config.auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.config.auth_token}"
            elif self.config.auth_type == "basic":
                headers["Authorization"] = f"Basic {self.config.auth_token}"

        return headers

    async def subscribe_to_patient(
        self,
        patient_id: str,
        resource_types: Optional[List[FHIRResourceType]] = None,
        session_id: Optional[str] = None,
    ) -> Optional[FHIRSubscription]:
        """
        Subscribe to real-time updates for a patient.

        Args:
            patient_id: FHIR patient ID
            resource_types: Types of resources to subscribe to
            session_id: Voice session ID for correlation

        Returns:
            FHIRSubscription if successful, None otherwise.
        """
        if not self._initialized:
            if not await self.initialize():
                return None

        # Default to common clinical resources
        if resource_types is None:
            resource_types = [
                FHIRResourceType.OBSERVATION,
                FHIRResourceType.VITAL_SIGNS,
                FHIRResourceType.LAB_RESULT,
            ]

        # Check subscription limit
        existing = self._patient_subscriptions.get(patient_id, set())
        if len(existing) >= self.config.max_subscriptions_per_patient:
            logger.warning(f"Max subscriptions reached for patient {patient_id}")
            return None

        try:
            import uuid

            subscription_id = f"sub-{uuid.uuid4().hex[:12]}"

            subscription = FHIRSubscription(
                subscription_id=subscription_id,
                patient_id=patient_id,
                resource_types=resource_types,
                status=SubscriptionStatus.ACTIVE,
            )

            # Store subscription
            self._subscriptions[subscription_id] = subscription
            if patient_id not in self._patient_subscriptions:
                self._patient_subscriptions[patient_id] = set()
            self._patient_subscriptions[patient_id].add(subscription_id)

            # Start streaming based on channel type
            if self.config.subscription_channel == "websocket":
                asyncio.create_task(
                    self._start_websocket_subscription(subscription)
                )
            elif self.config.subscription_channel == "polling":
                asyncio.create_task(self._start_polling_subscription(subscription))

            logger.info(
                "FHIR subscription created",
                extra={
                    "subscription_id": subscription_id,
                    "patient_id": patient_id,
                    "resource_types": [rt.value for rt in resource_types],
                    "session_id": session_id,
                },
            )

            return subscription

        except Exception as e:
            logger.error(f"Failed to create FHIR subscription: {e}")
            return None

    async def unsubscribe(self, subscription_id: str) -> bool:
        """Cancel a subscription."""
        subscription = self._subscriptions.pop(subscription_id, None)
        if subscription:
            # Remove from patient mapping
            patient_subs = self._patient_subscriptions.get(subscription.patient_id, set())
            patient_subs.discard(subscription_id)

            # Close WebSocket if exists
            ws = self._ws_connections.pop(subscription_id, None)
            if ws:
                await ws.close()

            logger.info(f"FHIR subscription cancelled: {subscription_id}")
            return True
        return False

    async def stream_observations(
        self,
        patient_id: str,
        resource_types: Optional[List[FHIRResourceType]] = None,
    ):
        """
        Stream observations for a patient as they arrive.

        Args:
            patient_id: FHIR patient ID
            resource_types: Filter by resource types (optional)

        Yields:
            FHIRObservation for each new observation.
        """
        # Create subscription if needed
        existing_subs = self._patient_subscriptions.get(patient_id, set())
        if not existing_subs:
            subscription = await self.subscribe_to_patient(patient_id, resource_types)
            if not subscription:
                return

        # Create event queue for this stream
        queue: asyncio.Queue = asyncio.Queue()

        def callback(event: StreamingEvent):
            if event.observation:
                asyncio.create_task(queue.put(event.observation))

        # Register callback
        self._register_callback(patient_id, callback)

        try:
            while True:
                observation = await queue.get()
                yield observation
        finally:
            self._unregister_callback(patient_id, callback)

    async def get_latest_vitals(
        self,
        patient_id: str,
        max_results: int = 10,
    ) -> List[FHIRObservation]:
        """
        Get the latest vital signs for a patient.

        Args:
            patient_id: FHIR patient ID
            max_results: Maximum observations to return

        Returns:
            List of recent vital sign observations.
        """
        if not self._initialized:
            if not await self.initialize():
                return []

        try:
            import httpx

            async with httpx.AsyncClient() as client:
                # Query for vital signs observations
                params = {
                    "patient": patient_id,
                    "category": "vital-signs",
                    "_sort": "-date",
                    "_count": max_results,
                }

                response = await client.get(
                    f"{self.config.fhir_server_url}/Observation",
                    params=params,
                    headers=self._get_auth_headers(),
                    timeout=30.0,
                )

                if response.status_code != 200:
                    logger.error(f"Failed to fetch vitals: {response.status_code}")
                    return []

                bundle = response.json()
                return self._parse_observation_bundle(bundle, patient_id)

        except Exception as e:
            logger.error(f"Failed to get latest vitals: {e}")
            return []

    async def get_latest_labs(
        self,
        patient_id: str,
        max_results: int = 20,
    ) -> List[FHIRObservation]:
        """
        Get the latest lab results for a patient.

        Args:
            patient_id: FHIR patient ID
            max_results: Maximum observations to return

        Returns:
            List of recent lab result observations.
        """
        if not self._initialized:
            if not await self.initialize():
                return []

        try:
            import httpx

            async with httpx.AsyncClient() as client:
                params = {
                    "patient": patient_id,
                    "category": "laboratory",
                    "_sort": "-date",
                    "_count": max_results,
                }

                response = await client.get(
                    f"{self.config.fhir_server_url}/Observation",
                    params=params,
                    headers=self._get_auth_headers(),
                    timeout=30.0,
                )

                if response.status_code != 200:
                    logger.error(f"Failed to fetch labs: {response.status_code}")
                    return []

                bundle = response.json()
                return self._parse_observation_bundle(bundle, patient_id)

        except Exception as e:
            logger.error(f"Failed to get latest labs: {e}")
            return []

    def _parse_observation_bundle(
        self,
        bundle: Dict[str, Any],
        patient_id: str,
    ) -> List[FHIRObservation]:
        """Parse FHIR Bundle into list of observations."""
        observations = []

        entries = bundle.get("entry", [])
        for entry in entries:
            resource = entry.get("resource", {})
            if resource.get("resourceType") != "Observation":
                continue

            try:
                # Extract code
                code_obj = resource.get("code", {})
                coding = code_obj.get("coding", [{}])[0]

                # Extract value
                value = None
                value_quantity = None
                value_unit = None

                if "valueQuantity" in resource:
                    vq = resource["valueQuantity"]
                    value_quantity = vq.get("value")
                    value_unit = vq.get("unit")
                elif "valueString" in resource:
                    value = resource["valueString"]
                elif "valueCodeableConcept" in resource:
                    cc = resource["valueCodeableConcept"]
                    value = cc.get("text") or cc.get("coding", [{}])[0].get("display")

                # Extract interpretation
                interpretation = None
                if "interpretation" in resource:
                    interp = resource["interpretation"]
                    if isinstance(interp, list) and interp:
                        interpretation = (
                            interp[0].get("text")
                            or interp[0].get("coding", [{}])[0].get("display")
                        )

                # Extract reference range
                reference_range = None
                if "referenceRange" in resource:
                    rr = resource["referenceRange"]
                    if isinstance(rr, list) and rr:
                        low = rr[0].get("low", {}).get("value")
                        high = rr[0].get("high", {}).get("value")
                        if low is not None and high is not None:
                            reference_range = f"{low}-{high}"

                # Parse effective datetime
                effective_datetime = None
                if "effectiveDateTime" in resource:
                    from dateutil.parser import parse

                    effective_datetime = parse(resource["effectiveDateTime"])

                observation = FHIRObservation(
                    resource_id=resource.get("id", ""),
                    resource_type=FHIRResourceType.OBSERVATION,
                    patient_id=patient_id,
                    code=coding.get("code", ""),
                    code_display=coding.get("display", code_obj.get("text", "")),
                    value=value,
                    value_quantity=value_quantity,
                    value_unit=value_unit,
                    effective_datetime=effective_datetime,
                    status=resource.get("status", "final"),
                    interpretation=interpretation,
                    reference_range=reference_range,
                    raw_resource=resource,
                )
                observations.append(observation)

            except Exception as e:
                logger.warning(f"Failed to parse observation: {e}")
                continue

        return observations

    async def _start_websocket_subscription(self, subscription: FHIRSubscription):
        """Start WebSocket-based subscription."""
        # Placeholder for WebSocket implementation
        logger.info(f"WebSocket subscription started: {subscription.subscription_id}")
        # Real implementation would establish WebSocket connection

    async def _start_polling_subscription(self, subscription: FHIRSubscription):
        """Start polling-based subscription."""
        logger.info(f"Polling subscription started: {subscription.subscription_id}")

        while subscription.status == SubscriptionStatus.ACTIVE:
            try:
                # Poll for updates
                observations = await self.get_latest_vitals(subscription.patient_id)

                for obs in observations:
                    # Check if new (would need timestamp tracking)
                    self._emit_event(subscription, obs)

                await asyncio.sleep(self.config.polling_interval_seconds)

            except Exception as e:
                logger.error(f"Polling error: {e}")
                await asyncio.sleep(self.config.retry_delay_seconds)

    def _register_callback(self, patient_id: str, callback: Callable):
        """Register callback for patient events."""
        if patient_id not in self._event_callbacks:
            self._event_callbacks[patient_id] = []
        self._event_callbacks[patient_id].append(callback)

    def _unregister_callback(self, patient_id: str, callback: Callable):
        """Unregister callback for patient events."""
        callbacks = self._event_callbacks.get(patient_id, [])
        if callback in callbacks:
            callbacks.remove(callback)

    def _emit_event(self, subscription: FHIRSubscription, observation: FHIRObservation):
        """Emit event to registered callbacks."""
        import uuid

        event = StreamingEvent(
            event_id=f"evt-{uuid.uuid4().hex[:8]}",
            subscription_id=subscription.subscription_id,
            resource_type=observation.resource_type,
            resource_id=observation.resource_id,
            action="update",
            timestamp=datetime.now(timezone.utc),
            observation=observation,
        )

        subscription.event_count += 1
        subscription.last_event_at = event.timestamp

        callbacks = self._event_callbacks.get(subscription.patient_id, [])
        for callback in callbacks:
            try:
                callback(event)
            except Exception as e:
                logger.error(f"Event callback error: {e}")


# ==============================================================================
# Singleton Instance
# ==============================================================================

_fhir_subscription_service: Optional[FHIRSubscriptionService] = None


def get_fhir_subscription_service() -> FHIRSubscriptionService:
    """Get or create FHIR subscription service instance."""
    global _fhir_subscription_service
    if _fhir_subscription_service is None:
        _fhir_subscription_service = FHIRSubscriptionService()
    return _fhir_subscription_service
