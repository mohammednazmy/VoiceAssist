"""
Privacy Enforcer - Privacy Settings Enforcement

Manages user privacy settings and enforces them:
- Granular consent toggles
- Natural language voice command handling
- Privacy mode (temporary disable)
- Data export and deletion (GDPR/CCPA)
- Audit trail for privacy changes
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class PrivacyChangeRecord:
    """Record of a privacy setting change"""

    timestamp: datetime
    setting: str
    old_value: Any
    new_value: Any
    source: str  # voice, api, ui


@dataclass
class GranularPrivacySettings:
    """User-controlled privacy preferences"""

    # Core consent toggles
    emotion_tracking_enabled: bool = True
    progress_tracking_enabled: bool = True
    clinical_reasoning_enabled: bool = True
    analytics_participation: bool = True
    voice_biometrics_enabled: bool = False  # Opt-in only
    personalization_enabled: bool = True

    # Data retention
    emotion_history_days: int = 30  # 0 = don't store
    progress_history_days: int = 365
    session_history_days: int = 7

    # Session-level overrides
    privacy_mode_active: bool = False  # Temporary disable all
    privacy_mode_expires: Optional[datetime] = None

    # Change history
    change_history: List[PrivacyChangeRecord] = field(default_factory=list)


class PrivacyEnforcer:
    """
    Privacy settings enforcement service.

    Handles:
    - Privacy settings management
    - Natural language voice command processing
    - Privacy mode with automatic expiration
    - Data export (GDPR/CCPA)
    - Data deletion with confirmation
    - Audit trail for privacy changes
    """

    # Voice commands for privacy control (pattern -> (setting, value))
    VOICE_COMMANDS = {
        r"(disable|turn off|stop)\s+(emotion|emotional)\s*(tracking)?": ("emotion_tracking_enabled", False),
        r"(enable|turn on|start)\s+(emotion|emotional)\s*(tracking)?": ("emotion_tracking_enabled", True),
        r"(disable|turn off|stop)\s+(progress)\s*(tracking)?": ("progress_tracking_enabled", False),
        r"(enable|turn on|start)\s+(progress)\s*(tracking)?": ("progress_tracking_enabled", True),
        r"(disable|turn off|stop)\s+(analytics|telemetry)": ("analytics_participation", False),
        r"(enable|turn on|start)\s+(analytics|telemetry)": ("analytics_participation", True),
        r"(disable|turn off|stop)\s+(clinical|medical)\s*(reasoning)?": ("clinical_reasoning_enabled", False),
        r"(enable|turn on|start)\s+(clinical|medical)\s*(reasoning)?": ("clinical_reasoning_enabled", True),
        r"(disable|turn off|stop)\s+(personalization|personalisation)": ("personalization_enabled", False),
        r"(enable|turn on|start)\s+(personalization|personalisation)": ("personalization_enabled", True),
        r"(go|switch|enable)\s*(to)?\s*private\s*(mode)?": ("privacy_mode_active", True),
        r"(exit|leave|disable)\s*private\s*(mode)?": ("privacy_mode_active", False),
        r"don'?t\s+(track|remember|store)\s+(anything|my data)": ("privacy_mode_active", True),
    }

    # Special commands with patterns
    SPECIAL_COMMANDS = {
        r"(export|download)\s*(all)?\s*my\s*data": "export",
        r"(delete|erase|remove)\s*(all)?\s*my\s*data": "delete",
        r"confirm\s*delete\s*(all)?\s*my\s*data": "confirm_delete",
        r"(what|show)\s*(is|are)?\s*my\s*privacy\s*(settings)?": "show_settings",
        r"(private|privacy)\s*mode\s*for\s*(\d+)\s*(hour|minute|min)s?": "timed_privacy",
    }

    # Setting descriptions for voice feedback
    SETTING_DESCRIPTIONS = {
        "emotion_tracking_enabled": "emotion tracking",
        "progress_tracking_enabled": "progress tracking",
        "analytics_participation": "analytics",
        "clinical_reasoning_enabled": "clinical reasoning",
        "personalization_enabled": "personalization",
        "privacy_mode_active": "privacy mode",
    }

    def __init__(self, event_bus=None):
        self.event_bus = event_bus
        self._settings: Dict[str, GranularPrivacySettings] = {}
        self._pending_deletions: Dict[str, datetime] = {}  # user_id -> confirmation expiry
        self._deletion_confirmation_timeout = timedelta(minutes=2)
        logger.info("PrivacyEnforcer initialized")

    async def get_settings(self, user_id: str) -> GranularPrivacySettings:
        """Get privacy settings for user"""
        if user_id not in self._settings:
            # Load from database or create default
            self._settings[user_id] = await self._load_settings(user_id)
        return self._settings[user_id]

    async def update_settings(
        self,
        user_id: str,
        updates: Dict[str, Any],
        source: str = "api",
    ) -> GranularPrivacySettings:
        """Update privacy settings with audit trail"""
        settings = await self.get_settings(user_id)

        for key, value in updates.items():
            if hasattr(settings, key):
                old_value = getattr(settings, key)
                setattr(settings, key, value)

                # Record change in history
                settings.change_history.append(
                    PrivacyChangeRecord(
                        timestamp=datetime.utcnow(),
                        setting=key,
                        old_value=old_value,
                        new_value=value,
                        source=source,
                    )
                )

        # Limit history size
        if len(settings.change_history) > 100:
            settings.change_history = settings.change_history[-100:]

        # Persist
        await self._save_settings(user_id, settings)

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="privacy.settings_changed",
                data={
                    "user_id": user_id,
                    "changes": list(updates.keys()),
                    "source": source,
                },
                session_id="system",
                source_engine="memory",
            )

        return settings

    async def handle_command(
        self,
        user_id: str,
        command: str,
        source: str = "voice",
    ) -> Dict[str, Any]:
        """
        Handle privacy-related voice commands.

        Supports natural language patterns like:
        - "disable emotion tracking"
        - "turn off analytics"
        - "go private"
        - "privacy mode for 30 minutes"
        - "export my data"
        - "delete my data" / "confirm delete my data"

        Returns result dict with success status and action taken.
        """
        command_lower = command.lower().strip()

        # Check for toggle commands (pattern matching)
        for pattern, (setting, value) in self.VOICE_COMMANDS.items():
            if re.search(pattern, command_lower, re.IGNORECASE):
                old_value = getattr(await self.get_settings(user_id), setting)
                await self.update_settings(user_id, {setting: value}, source=source)

                description = self.SETTING_DESCRIPTIONS.get(setting, setting)
                return {
                    "success": True,
                    "action": "toggle",
                    "setting": setting,
                    "old_value": old_value,
                    "new_value": value,
                    "message": f"{'Enabled' if value else 'Disabled'} {description}.",
                }

        # Check for special commands
        for pattern, action in self.SPECIAL_COMMANDS.items():
            match = re.search(pattern, command_lower, re.IGNORECASE)
            if match:
                if action == "export":
                    return await self._queue_data_export(user_id)

                elif action == "delete":
                    return await self._queue_data_deletion(user_id)

                elif action == "confirm_delete":
                    return await self._confirm_data_deletion(user_id)

                elif action == "show_settings":
                    return await self._get_settings_summary(user_id)

                elif action == "timed_privacy":
                    # Extract duration from match
                    duration = int(match.group(2))
                    unit = match.group(3).lower()

                    if unit.startswith("hour"):
                        expires = datetime.utcnow() + timedelta(hours=duration)
                    else:
                        expires = datetime.utcnow() + timedelta(minutes=duration)

                    return await self._enable_timed_privacy(user_id, expires, source)

        return {
            "success": False,
            "error": "Unknown privacy command",
            "hint": "Try 'disable emotion tracking', 'go private', or 'show my privacy settings'",
        }

    async def _enable_timed_privacy(
        self,
        user_id: str,
        expires: datetime,
        source: str,
    ) -> Dict[str, Any]:
        """Enable privacy mode with automatic expiration"""
        settings = await self.get_settings(user_id)

        settings.privacy_mode_active = True
        settings.privacy_mode_expires = expires

        # Record change
        settings.change_history.append(
            PrivacyChangeRecord(
                timestamp=datetime.utcnow(),
                setting="privacy_mode_active",
                old_value=False,
                new_value=True,
                source=source,
            )
        )

        await self._save_settings(user_id, settings)

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="privacy.settings_changed",
                data={
                    "user_id": user_id,
                    "changes": ["privacy_mode_active", "privacy_mode_expires"],
                    "expires": expires.isoformat(),
                },
                session_id="system",
                source_engine="memory",
            )

        # Calculate duration for message
        duration = expires - datetime.utcnow()
        minutes = int(duration.total_seconds() / 60)
        if minutes >= 60:
            duration_str = f"{minutes // 60} hour(s)"
        else:
            duration_str = f"{minutes} minute(s)"

        return {
            "success": True,
            "action": "timed_privacy",
            "expires": expires.isoformat(),
            "message": f"Privacy mode enabled for {duration_str}. All tracking is temporarily disabled.",
        }

    async def _confirm_data_deletion(self, user_id: str) -> Dict[str, Any]:
        """Handle deletion confirmation"""
        if user_id not in self._pending_deletions:
            return {
                "success": False,
                "error": "No pending deletion request. Say 'delete my data' first.",
            }

        expiry = self._pending_deletions[user_id]
        if datetime.utcnow() > expiry:
            del self._pending_deletions[user_id]
            return {
                "success": False,
                "error": "Deletion confirmation expired. Please start again.",
            }

        # Confirmed - perform deletion
        del self._pending_deletions[user_id]
        await self.delete_user_data(user_id)

        return {
            "success": True,
            "action": "data_deleted",
            "message": "All your personalization data has been permanently deleted.",
        }

    async def _get_settings_summary(self, user_id: str) -> Dict[str, Any]:
        """Get human-readable settings summary"""
        settings = await self.get_settings(user_id)

        enabled = []
        disabled = []

        if settings.emotion_tracking_enabled:
            enabled.append("emotion tracking")
        else:
            disabled.append("emotion tracking")

        if settings.progress_tracking_enabled:
            enabled.append("progress tracking")
        else:
            disabled.append("progress tracking")

        if settings.analytics_participation:
            enabled.append("analytics")
        else:
            disabled.append("analytics")

        if settings.clinical_reasoning_enabled:
            enabled.append("clinical reasoning")
        else:
            disabled.append("clinical reasoning")

        if settings.personalization_enabled:
            enabled.append("personalization")
        else:
            disabled.append("personalization")

        message_parts = []
        if enabled:
            message_parts.append(f"Enabled: {', '.join(enabled)}")
        if disabled:
            message_parts.append(f"Disabled: {', '.join(disabled)}")

        if settings.privacy_mode_active:
            if settings.privacy_mode_expires:
                remaining = settings.privacy_mode_expires - datetime.utcnow()
                minutes = max(0, int(remaining.total_seconds() / 60))
                message_parts.append(f"Privacy mode active ({minutes} minutes remaining)")
            else:
                message_parts.append("Privacy mode active")

        return {
            "success": True,
            "action": "show_settings",
            "settings": {
                "emotion_tracking": settings.emotion_tracking_enabled,
                "progress_tracking": settings.progress_tracking_enabled,
                "analytics": settings.analytics_participation,
                "clinical_reasoning": settings.clinical_reasoning_enabled,
                "personalization": settings.personalization_enabled,
                "privacy_mode": settings.privacy_mode_active,
            },
            "message": ". ".join(message_parts),
        }

    async def check_privacy_mode_expiry(self, user_id: str) -> bool:
        """Check if privacy mode has expired and disable if so"""
        settings = await self.get_settings(user_id)

        if settings.privacy_mode_active and settings.privacy_mode_expires:
            if datetime.utcnow() >= settings.privacy_mode_expires:
                settings.privacy_mode_active = False
                settings.privacy_mode_expires = None
                await self._save_settings(user_id, settings)

                if self.event_bus:
                    await self.event_bus.publish_event(
                        event_type="privacy.settings_changed",
                        data={"user_id": user_id, "changes": ["privacy_mode_expired"]},
                        session_id="system",
                        source_engine="memory",
                    )

                logger.info(f"Privacy mode expired for user {user_id}")
                return True

        return False

    async def export_user_data(self, user_id: str) -> Dict[str, Any]:
        """Export all user personalization data (GDPR/CCPA compliance)"""
        # Gather all user data
        data = {
            "user_id": user_id,
            "export_date": datetime.utcnow().isoformat(),
            "privacy_settings": {},
            "preferences": {},
            "emotion_baselines": {},
            "progress": {},
            "notes": [],
        }

        # Get privacy settings
        settings = await self.get_settings(user_id)
        data["privacy_settings"] = {
            "emotion_tracking_enabled": settings.emotion_tracking_enabled,
            "progress_tracking_enabled": settings.progress_tracking_enabled,
            "clinical_reasoning_enabled": settings.clinical_reasoning_enabled,
            "analytics_participation": settings.analytics_participation,
        }

        # TODO: Gather data from other engines
        # - EmotionEngine: baselines
        # - ProgressTracker: progress and notes
        # - UserPreferences: preferences

        logger.info(f"Exported data for user {user_id}")
        return data

    async def delete_user_data(self, user_id: str) -> bool:
        """Delete all user personalization data"""
        # Delete from all engines
        # TODO: Coordinate with other engines

        # Delete privacy settings
        if user_id in self._settings:
            del self._settings[user_id]

        # Publish deletion event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="privacy.data_deleted",
                data={"user_id": user_id},
                session_id="system",
                source_engine="memory",
            )

        logger.info(f"Deleted personalization data for user {user_id}")
        return True

    async def _queue_data_export(self, user_id: str) -> Dict[str, Any]:
        """Queue a data export request"""
        # TODO: Implement async export queue
        return {
            "success": True,
            "action": "export_queued",
            "message": "Your data export has been queued. You'll receive it shortly.",
        }

    async def _queue_data_deletion(self, user_id: str) -> Dict[str, Any]:
        """Queue a data deletion request with confirmation"""
        # Set up pending deletion with expiry
        expiry = datetime.utcnow() + self._deletion_confirmation_timeout
        self._pending_deletions[user_id] = expiry

        minutes = int(self._deletion_confirmation_timeout.total_seconds() / 60)

        return {
            "success": True,
            "action": "deletion_pending",
            "requires_confirmation": True,
            "expires": expiry.isoformat(),
            "message": f"To confirm deletion of all your data, say 'confirm delete my data' within {minutes} minutes.",
        }

    async def _load_settings(self, user_id: str) -> GranularPrivacySettings:
        """Load settings from database"""
        # TODO: Implement database loading
        return GranularPrivacySettings()

    async def _save_settings(
        self,
        user_id: str,
        settings: GranularPrivacySettings,
    ) -> None:
        """Save settings to database"""
        # TODO: Implement database persistence
        pass


__all__ = ["PrivacyEnforcer", "GranularPrivacySettings", "PrivacyChangeRecord"]
