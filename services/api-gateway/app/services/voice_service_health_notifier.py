"""
Voice Service Health Notifier (WebSocket Reliability Phase 3)

Monitors voice service health and notifies WebSocket clients of degradation
events. Provides graceful degradation with fallback levels:
- FULL_VOICE: All services operational (STT + LLM + TTS)
- DEGRADED_VOICE: Using fallback providers (reduced quality/latency)
- TEXT_ONLY: Voice services unavailable, fallback to text chat

Feature Flag: backend.voice_ws_graceful_degradation

Message Types:
- service.degraded: Service quality has decreased
- service.recovered: Service quality has improved
- service.mode_change: Overall voice mode has changed
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.logging import get_logger
from app.services.voice_fallback_orchestrator import ServiceHealth, ServiceType, VoiceFallbackOrchestrator

logger = get_logger(__name__)


class VoiceServiceMode(str, Enum):
    """Overall voice service mode."""

    FULL_VOICE = "full_voice"  # All services at full capacity
    DEGRADED_VOICE = "degraded_voice"  # Using fallback providers
    TEXT_ONLY = "text_only"  # Voice unavailable, text fallback
    UNKNOWN = "unknown"


@dataclass
class ServiceDegradationEvent:
    """Event describing a service degradation or recovery."""

    service_type: ServiceType
    provider_name: str
    old_health: ServiceHealth
    new_health: ServiceHealth
    timestamp: str
    message: str
    is_recovery: bool


@dataclass
class ServiceModeChangeEvent:
    """Event describing an overall mode change."""

    old_mode: VoiceServiceMode
    new_mode: VoiceServiceMode
    timestamp: str
    reason: str
    affected_services: List[str]
    fallback_info: Dict[str, Any]


class VoiceServiceHealthNotifier:
    """
    Monitors voice service health and notifies clients of degradation events.

    Integrates with VoiceFallbackOrchestrator to track service health and
    sends WebSocket messages to connected clients when services degrade or
    recover.

    Usage:
        notifier = VoiceServiceHealthNotifier(orchestrator)
        notifier.register_session(session_id, send_callback)
        await notifier.start()
        ...
        notifier.unregister_session(session_id)
        await notifier.stop()
    """

    def __init__(
        self,
        orchestrator: Optional[VoiceFallbackOrchestrator] = None,
        check_interval_seconds: float = 5.0,
    ):
        """
        Initialize the health notifier.

        Args:
            orchestrator: Voice fallback orchestrator to monitor
            check_interval_seconds: How often to check service health
        """
        self._orchestrator = orchestrator
        self._check_interval = check_interval_seconds
        self._running = False
        self._check_task: Optional[asyncio.Task] = None

        # Current state
        self._current_mode = VoiceServiceMode.UNKNOWN
        self._service_health: Dict[ServiceType, ServiceHealth] = {}
        self._active_fallbacks: Dict[ServiceType, str] = {}

        # Registered sessions and their send callbacks
        self._sessions: Dict[str, Callable[[Dict[str, Any]], None]] = {}
        self._lock = asyncio.Lock()

    @property
    def current_mode(self) -> VoiceServiceMode:
        """Get current voice service mode."""
        return self._current_mode

    @property
    def service_health(self) -> Dict[ServiceType, ServiceHealth]:
        """Get current health of each service type."""
        return self._service_health.copy()

    def set_orchestrator(self, orchestrator: VoiceFallbackOrchestrator) -> None:
        """Set the fallback orchestrator to monitor."""
        self._orchestrator = orchestrator

    async def start(self) -> None:
        """Start health monitoring."""
        if self._running:
            return

        self._running = True
        self._check_task = asyncio.create_task(self._health_check_loop())
        logger.info("VoiceServiceHealthNotifier started")

    async def stop(self) -> None:
        """Stop health monitoring."""
        self._running = False

        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass
            self._check_task = None

        logger.info("VoiceServiceHealthNotifier stopped")

    def register_session(
        self,
        session_id: str,
        send_callback: Callable[[Dict[str, Any]], None],
    ) -> None:
        """
        Register a session to receive health notifications.

        Args:
            session_id: Unique session identifier
            send_callback: Async callback to send messages to the client
        """
        self._sessions[session_id] = send_callback
        logger.debug(f"Registered session for health notifications: {session_id}")

        # Send current status immediately
        asyncio.create_task(self._send_initial_status(session_id))

    def unregister_session(self, session_id: str) -> None:
        """
        Unregister a session from health notifications.

        Args:
            session_id: Session identifier to unregister
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.debug(f"Unregistered session from health notifications: {session_id}")

    async def _send_initial_status(self, session_id: str) -> None:
        """Send current service status to a newly registered session."""
        callback = self._sessions.get(session_id)
        if not callback:
            return

        try:
            message = {
                "type": "service.status",
                "mode": self._current_mode.value,
                "services": {
                    st.value: {
                        "health": self._service_health.get(st, ServiceHealth.UNKNOWN).value,
                        "fallback_provider": self._active_fallbacks.get(st),
                    }
                    for st in [ServiceType.STT, ServiceType.TTS, ServiceType.LLM]
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await self._send_to_session(session_id, message)
        except Exception as e:
            logger.warning(f"Failed to send initial status to {session_id}: {e}")

    async def _health_check_loop(self) -> None:
        """Background task to check service health."""
        while self._running:
            try:
                await asyncio.sleep(self._check_interval)

                if self._orchestrator:
                    await self._check_and_notify()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check error: {e}")

    async def _check_and_notify(self) -> None:
        """Check service health and notify clients of changes."""
        if not self._orchestrator:
            return

        # Get current health from orchestrator
        new_health = {}
        new_fallbacks = {}

        for service_type in [ServiceType.STT, ServiceType.TTS, ServiceType.LLM]:
            health, fallback = self._get_service_status(service_type)
            new_health[service_type] = health
            if fallback:
                new_fallbacks[service_type] = fallback

        # Check for health changes
        for service_type in new_health:
            old = self._service_health.get(service_type, ServiceHealth.UNKNOWN)
            new = new_health[service_type]

            if old != new:
                is_recovery = self._is_health_improvement(old, new)
                event = ServiceDegradationEvent(
                    service_type=service_type,
                    provider_name=new_fallbacks.get(service_type, "primary"),
                    old_health=old,
                    new_health=new,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    message=self._get_health_message(service_type, old, new),
                    is_recovery=is_recovery,
                )
                await self._notify_degradation(event)

        # Update stored health
        self._service_health = new_health
        self._active_fallbacks = new_fallbacks

        # Calculate overall mode
        new_mode = self._calculate_mode(new_health)
        if new_mode != self._current_mode:
            old_mode = self._current_mode
            self._current_mode = new_mode

            event = ServiceModeChangeEvent(
                old_mode=old_mode,
                new_mode=new_mode,
                timestamp=datetime.now(timezone.utc).isoformat(),
                reason=self._get_mode_change_reason(old_mode, new_mode, new_health),
                affected_services=[st.value for st, h in new_health.items() if h != ServiceHealth.HEALTHY],
                fallback_info={st.value: p for st, p in new_fallbacks.items()},
            )
            await self._notify_mode_change(event)

    def _get_service_status(self, service_type: ServiceType) -> tuple[ServiceHealth, Optional[str]]:
        """Get health and fallback provider for a service type."""
        if not self._orchestrator:
            return ServiceHealth.UNKNOWN, None

        providers = self._orchestrator._providers.get(service_type, [])
        if not providers:
            return ServiceHealth.UNKNOWN, None

        # Check primary provider (first in priority order)
        primary = providers[0] if providers else None
        if not primary:
            return ServiceHealth.UNKNOWN, None

        # If primary is healthy, no fallback
        if primary.health == ServiceHealth.HEALTHY:
            return ServiceHealth.HEALTHY, None

        # Check if any fallback is healthy
        for provider in providers[1:]:
            if provider.health == ServiceHealth.HEALTHY:
                return ServiceHealth.DEGRADED, provider.config.name

        # All providers unhealthy
        return ServiceHealth.UNHEALTHY, None

    def _is_health_improvement(self, old: ServiceHealth, new: ServiceHealth) -> bool:
        """Check if health change is an improvement."""
        health_order = {
            ServiceHealth.UNHEALTHY: 0,
            ServiceHealth.UNKNOWN: 1,
            ServiceHealth.DEGRADED: 2,
            ServiceHealth.HEALTHY: 3,
        }
        return health_order.get(new, 0) > health_order.get(old, 0)

    def _calculate_mode(self, health: Dict[ServiceType, ServiceHealth]) -> VoiceServiceMode:
        """Calculate overall voice mode from service health."""
        stt_health = health.get(ServiceType.STT, ServiceHealth.UNKNOWN)
        tts_health = health.get(ServiceType.TTS, ServiceHealth.UNKNOWN)
        llm_health = health.get(ServiceType.LLM, ServiceHealth.UNKNOWN)

        # All services healthy = full voice
        all_healthy = all(h == ServiceHealth.HEALTHY for h in [stt_health, tts_health, llm_health])
        if all_healthy:
            return VoiceServiceMode.FULL_VOICE

        # Any service unhealthy = check if voice is possible
        any_unhealthy = any(h == ServiceHealth.UNHEALTHY for h in [stt_health, tts_health])
        if any_unhealthy:
            # STT or TTS completely down = text only
            return VoiceServiceMode.TEXT_ONLY

        # Degraded but functional
        return VoiceServiceMode.DEGRADED_VOICE

    def _get_health_message(
        self,
        service_type: ServiceType,
        old: ServiceHealth,
        new: ServiceHealth,
    ) -> str:
        """Generate human-readable health change message."""
        service_names = {
            ServiceType.STT: "Speech recognition",
            ServiceType.TTS: "Text-to-speech",
            ServiceType.LLM: "AI assistant",
        }
        service_name = service_names.get(service_type, service_type.value)

        if new == ServiceHealth.HEALTHY:
            return f"{service_name} has recovered to full capacity"
        elif new == ServiceHealth.DEGRADED:
            return f"{service_name} is running with reduced capacity"
        elif new == ServiceHealth.UNHEALTHY:
            return f"{service_name} is temporarily unavailable"
        else:
            return f"{service_name} status is being checked"

    def _get_mode_change_reason(
        self,
        old_mode: VoiceServiceMode,
        new_mode: VoiceServiceMode,
        health: Dict[ServiceType, ServiceHealth],
    ) -> str:
        """Generate reason for mode change."""
        if new_mode == VoiceServiceMode.FULL_VOICE:
            return "All voice services have recovered"
        elif new_mode == VoiceServiceMode.DEGRADED_VOICE:
            degraded = [st.value for st, h in health.items() if h == ServiceHealth.DEGRADED]
            return f"Using fallback providers for: {', '.join(degraded)}"
        elif new_mode == VoiceServiceMode.TEXT_ONLY:
            unhealthy = [st.value for st, h in health.items() if h == ServiceHealth.UNHEALTHY]
            return f"Voice unavailable - {', '.join(unhealthy)} services down"
        return "Service status changed"

    async def _notify_degradation(self, event: ServiceDegradationEvent) -> None:
        """Notify all sessions of a degradation event."""
        message_type = "service.recovered" if event.is_recovery else "service.degraded"

        message = {
            "type": message_type,
            "service": event.service_type.value,
            "provider": event.provider_name,
            "health": event.new_health.value,
            "previous_health": event.old_health.value,
            "message": event.message,
            "timestamp": event.timestamp,
        }

        logger.info(
            f"Service {message_type}: {event.service_type.value} "
            f"({event.old_health.value} -> {event.new_health.value})"
        )

        await self._broadcast(message)

    async def _notify_mode_change(self, event: ServiceModeChangeEvent) -> None:
        """Notify all sessions of a mode change."""
        message = {
            "type": "service.mode_change",
            "mode": event.new_mode.value,
            "previous_mode": event.old_mode.value,
            "reason": event.reason,
            "affected_services": event.affected_services,
            "fallback_info": event.fallback_info,
            "timestamp": event.timestamp,
            "capabilities": self._get_mode_capabilities(event.new_mode),
        }

        logger.warning(f"Voice mode change: {event.old_mode.value} -> {event.new_mode.value} " f"({event.reason})")

        await self._broadcast(message)

    def _get_mode_capabilities(self, mode: VoiceServiceMode) -> Dict[str, bool]:
        """Get capabilities available in a given mode."""
        return {
            "voice_input": mode != VoiceServiceMode.TEXT_ONLY,
            "voice_output": mode != VoiceServiceMode.TEXT_ONLY,
            "text_input": True,  # Always available
            "text_output": True,  # Always available
            "tools": mode != VoiceServiceMode.TEXT_ONLY,
            "full_quality": mode == VoiceServiceMode.FULL_VOICE,
        }

    async def _broadcast(self, message: Dict[str, Any]) -> None:
        """Broadcast a message to all registered sessions."""
        async with self._lock:
            for session_id in list(self._sessions.keys()):
                await self._send_to_session(session_id, message)

    async def _send_to_session(self, session_id: str, message: Dict[str, Any]) -> None:
        """Send a message to a specific session."""
        callback = self._sessions.get(session_id)
        if not callback:
            return

        try:
            # Handle both sync and async callbacks
            if asyncio.iscoroutinefunction(callback):
                await callback(message)
            else:
                callback(message)
        except Exception as e:
            logger.warning(f"Failed to send to session {session_id}: {e}")
            # Remove failed session
            self.unregister_session(session_id)

    def get_status_summary(self) -> Dict[str, Any]:
        """Get current status summary for monitoring."""
        return {
            "mode": self._current_mode.value,
            "services": {
                st.value: {
                    "health": self._service_health.get(st, ServiceHealth.UNKNOWN).value,
                    "fallback": self._active_fallbacks.get(st),
                }
                for st in [ServiceType.STT, ServiceType.TTS, ServiceType.LLM]
            },
            "registered_sessions": len(self._sessions),
            "capabilities": self._get_mode_capabilities(self._current_mode),
        }


# Global singleton instance
voice_service_health_notifier = VoiceServiceHealthNotifier()
