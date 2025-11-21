"""
CalDAV Integration Service (Phase 6)

Provides calendar operations via CalDAV protocol for Nextcloud Calendar integration.
Implements basic CRUD operations for calendar events with authentication.

MVP Implementation:
- Connect to Nextcloud CalDAV endpoint
- List calendar events within date range
- Create, update, and delete events
- Error handling and connection management

Future enhancements:
- Google Calendar sync via CalDAV
- Recurring event support
- Calendar sharing and permissions
- Event reminders and notifications
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

import caldav
from caldav.elements import dav, cdav
import vobject

logger = logging.getLogger(__name__)


@dataclass
class CalendarEvent:
    """Represents a calendar event."""
    uid: str
    summary: str
    description: Optional[str]
    start: datetime
    end: datetime
    location: Optional[str] = None
    organizer: Optional[str] = None
    attendees: List[str] = None

    def __post_init__(self):
        if self.attendees is None:
            self.attendees = []


class CalDAVService:
    """
    CalDAV integration service for calendar operations.

    Connects to Nextcloud Calendar (or any CalDAV-compatible server)
    and provides CRUD operations for events.
    """

    def __init__(
        self,
        caldav_url: str,
        username: str,
        password: str
    ):
        """
        Initialize CalDAV service.

        Args:
            caldav_url: CalDAV server URL (e.g., https://nextcloud.local/remote.php/dav/)
            username: Calendar user credentials
            password: Calendar user password
        """
        self.caldav_url = caldav_url
        self.username = username
        self.password = password
        self.client = None
        self.principal = None

    def connect(self) -> bool:
        """
        Establish connection to CalDAV server.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.client = caldav.DAVClient(
                url=self.caldav_url,
                username=self.username,
                password=self.password
            )

            # Get principal (user's calendar root)
            self.principal = self.client.principal()

            logger.info(f"Successfully connected to CalDAV server: {self.caldav_url}")
            return True

        except Exception as e:
            logger.error(f"Failed to connect to CalDAV server: {e}", exc_info=True)
            return False

    def list_calendars(self) -> List[Dict[str, Any]]:
        """
        List all calendars for the authenticated user.

        Returns:
            List of calendar dictionaries with id, name, and description
        """
        if not self.principal:
            if not self.connect():
                return []

        try:
            calendars = self.principal.calendars()

            calendar_list = []
            for cal in calendars:
                calendar_list.append({
                    "id": str(cal.url),
                    "name": cal.name,
                    "description": getattr(cal, 'description', None)
                })

            logger.info(f"Found {len(calendar_list)} calendars")
            return calendar_list

        except Exception as e:
            logger.error(f"Error listing calendars: {e}", exc_info=True)
            return []

    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[CalendarEvent]:
        """
        Retrieve calendar events within a date range.

        Args:
            calendar_id: Specific calendar to query (None = primary calendar)
            start_date: Start of date range (None = today)
            end_date: End of date range (None = 30 days from start)

        Returns:
            List of CalendarEvent objects
        """
        if not self.principal:
            if not self.connect():
                return []

        try:
            # Get calendar
            if calendar_id:
                calendar = self.client.calendar(url=calendar_id)
            else:
                calendars = self.principal.calendars()
                if not calendars:
                    logger.warning("No calendars found")
                    return []
                calendar = calendars[0]  # Use first calendar as primary

            # Set date range
            if not start_date:
                start_date = datetime.now()
            if not end_date:
                end_date = start_date + timedelta(days=30)

            # Query events
            events = calendar.date_search(start=start_date, end=end_date)

            # Parse events
            calendar_events = []
            for event in events:
                try:
                    vcal = vobject.readOne(event.data)
                    vevent = vcal.vevent

                    calendar_event = CalendarEvent(
                        uid=str(vevent.uid.value),
                        summary=str(vevent.summary.value),
                        description=str(vevent.description.value) if hasattr(vevent, 'description') else None,
                        start=vevent.dtstart.value,
                        end=vevent.dtend.value,
                        location=str(vevent.location.value) if hasattr(vevent, 'location') else None,
                        organizer=str(vevent.organizer.value) if hasattr(vevent, 'organizer') else None,
                        attendees=[str(a.value) for a in vevent.attendee_list] if hasattr(vevent, 'attendee_list') else []
                    )
                    calendar_events.append(calendar_event)

                except Exception as e:
                    logger.warning(f"Failed to parse event: {e}")
                    continue

            logger.info(f"Retrieved {len(calendar_events)} events")
            return calendar_events

        except Exception as e:
            logger.error(f"Error retrieving events: {e}", exc_info=True)
            return []

    def create_event(
        self,
        summary: str,
        start: datetime,
        end: datetime,
        description: Optional[str] = None,
        location: Optional[str] = None,
        calendar_id: Optional[str] = None
    ) -> Optional[str]:
        """
        Create a new calendar event.

        Args:
            summary: Event title
            start: Event start datetime
            end: Event end datetime
            description: Event description
            location: Event location
            calendar_id: Target calendar (None = primary)

        Returns:
            Event UID if successful, None otherwise
        """
        if not self.principal:
            if not self.connect():
                return None

        try:
            # Get calendar
            if calendar_id:
                calendar = self.client.calendar(url=calendar_id)
            else:
                calendars = self.principal.calendars()
                if not calendars:
                    logger.error("No calendars found")
                    return None
                calendar = calendars[0]

            # Create vCal object
            vcal = vobject.iCalendar()
            vevent = vcal.add('vevent')

            vevent.add('summary').value = summary
            vevent.add('dtstart').value = start
            vevent.add('dtend').value = end

            if description:
                vevent.add('description').value = description
            if location:
                vevent.add('location').value = location

            # Generate UID
            import uuid
            event_uid = str(uuid.uuid4())
            vevent.add('uid').value = event_uid

            # Add to calendar
            calendar.add_event(vcal.serialize())

            logger.info(f"Created event: {summary} (UID: {event_uid})")
            return event_uid

        except Exception as e:
            logger.error(f"Error creating event: {e}", exc_info=True)
            return None

    def update_event(
        self,
        event_uid: str,
        summary: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        calendar_id: Optional[str] = None
    ) -> bool:
        """
        Update an existing calendar event.

        Args:
            event_uid: Unique identifier of event to update
            summary: New event title
            start: New start datetime
            end: New end datetime
            description: New description
            location: New location
            calendar_id: Calendar containing the event

        Returns:
            True if successful, False otherwise
        """
        if not self.principal:
            if not self.connect():
                return False

        try:
            # Get calendar
            if calendar_id:
                calendar = self.client.calendar(url=calendar_id)
            else:
                calendars = self.principal.calendars()
                if not calendars:
                    return False
                calendar = calendars[0]

            # Find event by UID
            events = calendar.events()
            target_event = None

            for event in events:
                vcal = vobject.readOne(event.data)
                if str(vcal.vevent.uid.value) == event_uid:
                    target_event = event
                    break

            if not target_event:
                logger.warning(f"Event not found: {event_uid}")
                return False

            # Update event
            vcal = vobject.readOne(target_event.data)
            vevent = vcal.vevent

            if summary:
                vevent.summary.value = summary
            if start:
                vevent.dtstart.value = start
            if end:
                vevent.dtend.value = end
            if description:
                if hasattr(vevent, 'description'):
                    vevent.description.value = description
                else:
                    vevent.add('description').value = description
            if location:
                if hasattr(vevent, 'location'):
                    vevent.location.value = location
                else:
                    vevent.add('location').value = location

            # Save changes
            target_event.data = vcal.serialize()
            target_event.save()

            logger.info(f"Updated event: {event_uid}")
            return True

        except Exception as e:
            logger.error(f"Error updating event: {e}", exc_info=True)
            return False

    def delete_event(
        self,
        event_uid: str,
        calendar_id: Optional[str] = None
    ) -> bool:
        """
        Delete a calendar event.

        Args:
            event_uid: Unique identifier of event to delete
            calendar_id: Calendar containing the event

        Returns:
            True if successful, False otherwise
        """
        if not self.principal:
            if not self.connect():
                return False

        try:
            # Get calendar
            if calendar_id:
                calendar = self.client.calendar(url=calendar_id)
            else:
                calendars = self.principal.calendars()
                if not calendars:
                    return False
                calendar = calendars[0]

            # Find and delete event
            events = calendar.events()

            for event in events:
                vcal = vobject.readOne(event.data)
                if str(vcal.vevent.uid.value) == event_uid:
                    event.delete()
                    logger.info(f"Deleted event: {event_uid}")
                    return True

            logger.warning(f"Event not found: {event_uid}")
            return False

        except Exception as e:
            logger.error(f"Error deleting event: {e}", exc_info=True)
            return False
