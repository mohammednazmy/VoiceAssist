"""
Progress Tracker - User Learning and Usage Progress

Tracks user progress through resources:
- Book/document reading progress
- Learning completion
- Notes and highlights
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ProgressEntry:
    """A progress entry for a resource"""

    user_id: str
    resource_type: str  # book, article, module, etc.
    resource_id: str
    location: Dict  # page, section, chapter, etc.
    progress_percent: float
    last_accessed: datetime = field(default_factory=datetime.utcnow)
    notes: List[Dict] = field(default_factory=list)


@dataclass
class UserNote:
    """A user note or highlight"""

    user_id: str
    resource_type: str
    resource_id: str
    location: Dict
    note_text: str
    highlight_text: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)


class ProgressTracker:
    """
    User progress tracking service.

    Tracks:
    - Reading/learning progress
    - Last position for resume
    - User notes and highlights
    """

    def __init__(self):
        self._progress: Dict[str, Dict[str, ProgressEntry]] = {}  # user_id -> resource_key -> entry
        self._notes: Dict[str, List[UserNote]] = {}  # user_id -> notes
        logger.info("ProgressTracker initialized")

    async def record(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
        location: Dict,
        progress_percent: float = 0.0,
    ) -> bool:
        """Record progress on a resource"""
        resource_key = f"{resource_type}:{resource_id}"

        if user_id not in self._progress:
            self._progress[user_id] = {}

        entry = ProgressEntry(
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            location=location,
            progress_percent=progress_percent,
            last_accessed=datetime.utcnow(),
        )

        self._progress[user_id][resource_key] = entry

        # Persist to database
        await self._persist_progress(entry)

        logger.debug(f"Recorded progress for {user_id} on {resource_key}: " f"{progress_percent:.1f}%")
        return True

    async def get_progress(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
    ) -> Optional[ProgressEntry]:
        """Get progress for a specific resource"""
        resource_key = f"{resource_type}:{resource_id}"
        user_progress = self._progress.get(user_id, {})
        return user_progress.get(resource_key)

    async def get_last_position(
        self,
        user_id: str,
        resource_type: Optional[str] = None,
    ) -> Optional[Dict]:
        """Get user's last position for resume"""
        user_progress = self._progress.get(user_id, {})

        if not user_progress:
            return None

        # Filter by resource type if specified
        entries = list(user_progress.values())
        if resource_type:
            entries = [e for e in entries if e.resource_type == resource_type]

        if not entries:
            return None

        # Return most recently accessed
        latest = max(entries, key=lambda e: e.last_accessed)

        return {
            "resource_type": latest.resource_type,
            "resource_id": latest.resource_id,
            "location": latest.location,
            "progress_percent": latest.progress_percent,
            "last_accessed": latest.last_accessed.isoformat(),
        }

    async def get_summary(self, user_id: str) -> Dict[str, Any]:
        """Get progress summary for user"""
        user_progress = self._progress.get(user_id, {})

        if not user_progress:
            return {
                "total_resources": 0,
                "completed": 0,
                "in_progress": 0,
                "recent": [],
            }

        entries = list(user_progress.values())
        completed = [e for e in entries if e.progress_percent >= 100]
        in_progress = [e for e in entries if 0 < e.progress_percent < 100]

        # Get 5 most recent
        recent = sorted(entries, key=lambda e: e.last_accessed, reverse=True)[:5]

        return {
            "total_resources": len(entries),
            "completed": len(completed),
            "in_progress": len(in_progress),
            "recent": [
                {
                    "resource_type": e.resource_type,
                    "resource_id": e.resource_id,
                    "progress_percent": e.progress_percent,
                    "last_accessed": e.last_accessed.isoformat(),
                }
                for e in recent
            ],
        }

    async def add_note(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
        location: Dict,
        note_text: str,
        highlight_text: Optional[str] = None,
    ) -> UserNote:
        """Add a user note"""
        note = UserNote(
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            location=location,
            note_text=note_text,
            highlight_text=highlight_text,
        )

        if user_id not in self._notes:
            self._notes[user_id] = []

        self._notes[user_id].append(note)

        # Persist
        await self._persist_note(note)

        return note

    async def get_notes(
        self,
        user_id: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
    ) -> List[UserNote]:
        """Get user notes, optionally filtered"""
        notes = self._notes.get(user_id, [])

        if resource_type:
            notes = [n for n in notes if n.resource_type == resource_type]
        if resource_id:
            notes = [n for n in notes if n.resource_id == resource_id]

        return notes

    async def delete_progress(self, user_id: str) -> bool:
        """Delete all progress for user"""
        if user_id in self._progress:
            del self._progress[user_id]
        if user_id in self._notes:
            del self._notes[user_id]
        return True

    async def _persist_progress(self, entry: ProgressEntry) -> None:
        """Persist progress to database"""
        # TODO: Implement database persistence
        pass

    async def _persist_note(self, note: UserNote) -> None:
        """Persist note to database"""
        # TODO: Implement database persistence
        pass


__all__ = ["ProgressTracker", "ProgressEntry", "UserNote"]
