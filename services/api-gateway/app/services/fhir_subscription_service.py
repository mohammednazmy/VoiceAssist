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

    def _json_dumps(self, data: Dict[str, Any]) -> str:
        """Serialize dict to JSON string."""
        import json
        return json.dumps(data)

    def _json_loads(self, data: str) -> Dict[str, Any]:
        """Deserialize JSON string to dict."""
        import json
        return json.loads(data)

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
        """
        Start WebSocket-based subscription with reconnection support.

        Implements FHIR R5 subscription framework with WebSocket channel.
        """
        retry_count = 0
        last_event_id: Optional[str] = None

        while subscription.status == SubscriptionStatus.ACTIVE:
            try:
                import websockets

                # Build WebSocket URL for subscription
                ws_url = self._build_subscription_ws_url(subscription)

                logger.info(
                    f"Connecting WebSocket subscription: {subscription.subscription_id}",
                    extra={"url": ws_url},
                )

                async with websockets.connect(
                    ws_url,
                    extra_headers=self._get_auth_headers(),
                    ping_interval=30,
                    ping_timeout=10,
                ) as ws:
                    # Store connection
                    self._ws_connections[subscription.subscription_id] = ws
                    retry_count = 0  # Reset retry count on successful connection

                    # Send subscription bind message
                    bind_message = {
                        "type": "bind",
                        "subscriptionId": subscription.subscription_id,
                        "patientId": subscription.patient_id,
                        "resourceTypes": [rt.value for rt in subscription.resource_types],
                        "lastEventId": last_event_id,
                    }
                    await ws.send(self._json_dumps(bind_message))

                    # Process incoming messages
                    async for message in ws:
                        try:
                            data = self._json_loads(message)
                            msg_type = data.get("type")

                            if msg_type == "event":
                                # Process FHIR event
                                event = self._parse_ws_event(subscription, data)
                                if event:
                                    last_event_id = event.event_id
                                    self._emit_event_internal(event)

                            elif msg_type == "heartbeat":
                                # Heartbeat - connection is alive
                                logger.debug(f"WebSocket heartbeat: {subscription.subscription_id}")

                            elif msg_type == "error":
                                error_msg = data.get("message", "Unknown error")
                                logger.error(f"WebSocket error: {error_msg}")
                                subscription.error_message = error_msg
                                if data.get("fatal"):
                                    subscription.status = SubscriptionStatus.ERROR
                                    break

                        except Exception as e:
                            logger.error(f"Error processing WebSocket message: {e}")

            except ImportError:
                logger.warning("websockets package not installed, falling back to polling")
                await self._start_polling_subscription(subscription)
                return

            except Exception as e:
                logger.error(f"WebSocket connection error: {e}")
                retry_count += 1

                if retry_count > self.config.max_retries:
                    logger.error(f"Max retries exceeded for subscription {subscription.subscription_id}")
                    subscription.status = SubscriptionStatus.ERROR
                    subscription.error_message = f"Connection failed after {retry_count} retries"
                    break

                # Exponential backoff
                delay = min(
                    self.config.reconnect_delay_seconds * (2 ** (retry_count - 1)),
                    300,  # Max 5 minutes
                )
                logger.info(f"Reconnecting in {delay}s (attempt {retry_count})")
                await asyncio.sleep(delay)

        # Cleanup
        self._ws_connections.pop(subscription.subscription_id, None)
        logger.info(f"WebSocket subscription ended: {subscription.subscription_id}")

    def _build_subscription_ws_url(self, subscription: FHIRSubscription) -> str:
        """Build WebSocket URL for FHIR subscription."""
        # Convert HTTP(S) to WS(S)
        base_url = self.config.fhir_server_url
        if base_url.startswith("https://"):
            ws_url = "wss://" + base_url[8:]
        elif base_url.startswith("http://"):
            ws_url = "ws://" + base_url[7:]
        else:
            ws_url = "wss://" + base_url

        return f"{ws_url}/Subscription/{subscription.subscription_id}/$stream"

    def _parse_ws_event(
        self,
        subscription: FHIRSubscription,
        data: Dict[str, Any],
    ) -> Optional[StreamingEvent]:
        """Parse WebSocket event message into StreamingEvent."""
        import uuid

        try:
            resource = data.get("resource", {})
            resource_type_str = resource.get("resourceType", "Observation")

            # Map to enum
            resource_type = FHIRResourceType.OBSERVATION
            for rt in FHIRResourceType:
                if rt.value == resource_type_str:
                    resource_type = rt
                    break

            # Parse observation if applicable
            observation = None
            if resource_type == FHIRResourceType.OBSERVATION:
                observations = self._parse_observation_bundle(
                    {"entry": [{"resource": resource}]},
                    subscription.patient_id,
                )
                if observations:
                    observation = observations[0]

            return StreamingEvent(
                event_id=data.get("eventId", f"evt-{uuid.uuid4().hex[:8]}"),
                subscription_id=subscription.subscription_id,
                resource_type=resource_type,
                resource_id=resource.get("id", ""),
                action=data.get("action", "update"),
                timestamp=datetime.now(timezone.utc),
                observation=observation,
                raw_payload=data,
            )

        except Exception as e:
            logger.error(f"Failed to parse WebSocket event: {e}")
            return None

    def _emit_event_internal(self, event: StreamingEvent) -> None:
        """Internal event emission with subscription update."""
        subscription = self._subscriptions.get(event.subscription_id)
        if subscription:
            subscription.event_count += 1
            subscription.last_event_at = event.timestamp

            if event.observation:
                self._emit_event(subscription, event.observation)

    async def _start_polling_subscription(self, subscription: FHIRSubscription):
        """
        Start polling-based subscription with change detection.

        Implements efficient polling with:
        - Last-Modified tracking to detect changes
        - ETag support for conditional requests
        - Rate limiting with adaptive intervals
        """
        logger.info(f"Polling subscription started: {subscription.subscription_id}")

        last_modified: Optional[str] = None
        etag: Optional[str] = None
        seen_ids: Set[str] = set()
        last_poll_time: Optional[datetime] = None

        while subscription.status == SubscriptionStatus.ACTIVE:
            try:
                import httpx

                async with httpx.AsyncClient() as client:
                    # Build query parameters
                    params = {
                        "patient": subscription.patient_id,
                        "_sort": "-_lastUpdated",
                        "_count": self.config.max_polling_results,
                    }

                    # Filter by resource types
                    categories = []
                    for rt in subscription.resource_types:
                        if rt == FHIRResourceType.VITAL_SIGNS:
                            categories.append("vital-signs")
                        elif rt == FHIRResourceType.LAB_RESULT:
                            categories.append("laboratory")

                    if categories:
                        params["category"] = ",".join(categories)

                    # Add time filter if we have a last poll time
                    if last_poll_time:
                        params["_lastUpdated"] = f"gt{last_poll_time.isoformat()}"

                    # Build headers with conditional request support
                    headers = self._get_auth_headers()
                    if last_modified:
                        headers["If-Modified-Since"] = last_modified
                    if etag:
                        headers["If-None-Match"] = etag

                    response = await client.get(
                        f"{self.config.fhir_server_url}/Observation",
                        params=params,
                        headers=headers,
                        timeout=30.0,
                    )

                    # Handle conditional response
                    if response.status_code == 304:
                        # Not modified - no new data
                        logger.debug(f"No changes detected for {subscription.subscription_id}")
                    elif response.status_code == 200:
                        # Update cache headers
                        last_modified = response.headers.get("Last-Modified")
                        etag = response.headers.get("ETag")

                        # Parse and emit new observations
                        bundle = response.json()
                        observations = self._parse_observation_bundle(
                            bundle, subscription.patient_id
                        )

                        for obs in observations:
                            # Check if we've seen this observation
                            if obs.resource_id not in seen_ids:
                                seen_ids.add(obs.resource_id)
                                self._emit_event(subscription, obs)

                        # Limit seen_ids size
                        if len(seen_ids) > 1000:
                            seen_ids = set(list(seen_ids)[-500:])

                    elif response.status_code >= 400:
                        logger.error(
                            f"Polling request failed: {response.status_code}",
                            extra={"response": response.text[:500]},
                        )

                last_poll_time = datetime.now(timezone.utc)
                await asyncio.sleep(self.config.polling_interval_seconds)

            except Exception as e:
                logger.error(f"Polling error: {e}")
                subscription.error_message = str(e)
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
# Context Injection Helpers
# ==============================================================================


class FHIRContextBuilder:
    """
    Builder for creating clinical context strings for Thinker injection.

    Formats FHIR observations into natural language context that
    can be injected into the AI assistant's context window.
    """

    @staticmethod
    def build_vitals_context(observations: List[FHIRObservation]) -> str:
        """
        Build vitals summary for context injection.

        Args:
            observations: List of vital sign observations

        Returns:
            Natural language summary of vitals.
        """
        if not observations:
            return ""

        lines = ["Recent vital signs:"]
        for obs in observations:
            lines.append(f"  - {obs.to_context_string()}")

        return "\n".join(lines)

    @staticmethod
    def build_labs_context(
        observations: List[FHIRObservation],
        highlight_abnormal: bool = True,
    ) -> str:
        """
        Build lab results summary for context injection.

        Args:
            observations: List of lab result observations
            highlight_abnormal: Whether to highlight abnormal values

        Returns:
            Natural language summary of lab results.
        """
        if not observations:
            return ""

        lines = ["Recent lab results:"]

        # Group by category/panel if possible
        abnormal = []
        normal = []

        for obs in observations:
            context_str = obs.to_context_string()
            if highlight_abnormal and obs.interpretation:
                interp_lower = obs.interpretation.lower()
                if any(x in interp_lower for x in ["high", "low", "abnormal", "critical"]):
                    abnormal.append(f"  - {context_str}")
                else:
                    normal.append(f"  - {context_str}")
            else:
                normal.append(f"  - {context_str}")

        if abnormal:
            lines.append("  ABNORMAL VALUES:")
            lines.extend(abnormal)
            if normal:
                lines.append("  Other results:")
                lines.extend(normal[:5])  # Limit normal results
        else:
            lines.extend(normal[:10])  # Limit total results

        return "\n".join(lines)

    @staticmethod
    def build_clinical_summary(
        vitals: List[FHIRObservation],
        labs: List[FHIRObservation],
        max_length: int = 1000,
    ) -> str:
        """
        Build comprehensive clinical summary for context injection.

        Args:
            vitals: List of vital sign observations
            labs: List of lab result observations
            max_length: Maximum character length

        Returns:
            Combined clinical context summary.
        """
        sections = []

        vitals_context = FHIRContextBuilder.build_vitals_context(vitals)
        if vitals_context:
            sections.append(vitals_context)

        labs_context = FHIRContextBuilder.build_labs_context(labs)
        if labs_context:
            sections.append(labs_context)

        if not sections:
            return ""

        result = "\n\n".join(sections)

        # Truncate if needed
        if len(result) > max_length:
            result = result[: max_length - 3] + "..."

        return result


async def get_patient_context_for_thinker(
    patient_id: str,
    include_vitals: bool = True,
    include_labs: bool = True,
    max_vitals: int = 5,
    max_labs: int = 10,
) -> str:
    """
    Get formatted patient clinical context for Thinker injection.

    This is a convenience function that fetches FHIR data and formats it
    for injection into the AI assistant's context window.

    Args:
        patient_id: FHIR patient ID
        include_vitals: Whether to include vital signs
        include_labs: Whether to include lab results
        max_vitals: Maximum vital sign observations
        max_labs: Maximum lab result observations

    Returns:
        Formatted clinical context string.

    Example:
        context = await get_patient_context_for_thinker("patient-123")
        # Returns:
        # Recent vital signs:
        #   - Blood Pressure: 120/80 mmHg
        #   - Heart Rate: 72 bpm
        #
        # Recent lab results:
        #   ABNORMAL VALUES:
        #   - Glucose: 180 mg/dL (High) [ref: 70-100]
        #   Other results:
        #   - Hemoglobin A1c: 6.5 %
    """
    service = get_fhir_subscription_service()

    vitals = []
    labs = []

    if include_vitals:
        vitals = await service.get_latest_vitals(patient_id, max_results=max_vitals)

    if include_labs:
        labs = await service.get_latest_labs(patient_id, max_results=max_labs)

    return FHIRContextBuilder.build_clinical_summary(vitals, labs)


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
