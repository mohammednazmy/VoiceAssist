"""
User Preferences - Long-Term Preference Storage

Manages persistent user preferences:
- Voice and speech settings
- Display preferences
- Workflow customizations
"""

import logging
from datetime import datetime
from typing import Any, Dict

logger = logging.getLogger(__name__)


class UserPreferences:
    """
    Long-term user preference storage.

    Stores preferences like:
    - voice_id: Preferred TTS voice
    - speech_rate: Preferred speech speed
    - language: Preferred language
    - specialty: Medical specialty
    - theme: UI theme preference
    """

    # Default preferences
    DEFAULTS = {
        "voice_id": "default",
        "speech_rate": 1.0,
        "language": "en",
        "specialty": None,
        "theme": "system",
        "abbreviation_expansion": False,
        "confirmation_required": True,
        "auto_submit": False,
    }

    def __init__(self):
        self._preferences: Dict[str, Dict[str, Any]] = {}
        logger.info("UserPreferences initialized")

    async def get(
        self,
        user_id: str,
        key: str,
        default: Any = None,
    ) -> Any:
        """Get a single preference value"""
        user_prefs = self._preferences.get(user_id, {})
        if key in user_prefs:
            return user_prefs[key]
        if key in self.DEFAULTS:
            return self.DEFAULTS[key]
        return default

    async def set(
        self,
        user_id: str,
        key: str,
        value: Any,
    ) -> bool:
        """Set a preference value"""
        if user_id not in self._preferences:
            self._preferences[user_id] = {}

        self._preferences[user_id][key] = value
        self._preferences[user_id]["_updated_at"] = datetime.utcnow().isoformat()

        # Persist to database
        await self._persist(user_id)

        logger.debug(f"Set preference {key}={value} for user {user_id}")
        return True

    async def get_all(self, user_id: str) -> Dict[str, Any]:
        """Get all preferences for user"""
        user_prefs = self._preferences.get(user_id, {})

        # Merge with defaults
        result = self.DEFAULTS.copy()
        result.update({k: v for k, v in user_prefs.items() if not k.startswith("_")})

        return result

    async def update_multiple(
        self,
        user_id: str,
        preferences: Dict[str, Any],
    ) -> bool:
        """Update multiple preferences at once"""
        if user_id not in self._preferences:
            self._preferences[user_id] = {}

        for key, value in preferences.items():
            self._preferences[user_id][key] = value

        self._preferences[user_id]["_updated_at"] = datetime.utcnow().isoformat()
        await self._persist(user_id)

        return True

    async def reset_to_defaults(self, user_id: str) -> bool:
        """Reset user preferences to defaults"""
        if user_id in self._preferences:
            del self._preferences[user_id]
        return True

    async def delete(self, user_id: str, key: str) -> bool:
        """Delete a specific preference"""
        if user_id in self._preferences and key in self._preferences[user_id]:
            del self._preferences[user_id][key]
            await self._persist(user_id)
            return True
        return False

    async def load(self, user_id: str) -> Dict[str, Any]:
        """Load preferences from database"""
        # TODO: Implement database loading
        # For now, use in-memory storage
        return self._preferences.get(user_id, {})

    async def _persist(self, user_id: str) -> None:
        """Persist preferences to database"""
        # TODO: Implement database persistence
        logger.debug(f"Would persist preferences for user {user_id}")


__all__ = ["UserPreferences"]
