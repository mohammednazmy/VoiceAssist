"""
VoiceAssist V2 - Calendar Tool

Handles calendar operations via CalDAV (Nextcloud Calendar).

Tools:
- get_calendar_events: Retrieve events for date range
- create_calendar_event: Create new calendar event
"""

import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.tools.base import (
    RiskLevel,
    ToolCategory,
    ToolDefinition,
    ToolError,
    ToolResult,
)

logger = logging.getLogger(__name__)


# ============================================================================
# CalDAV Client Helper Functions
# ============================================================================

def _get_caldav_url(username: str, calendar_name: str = "personal") -> str:
    """Build CalDAV URL for Nextcloud calendar."""
    settings = get_settings()
    base_url = settings.nextcloud_base_url.rstrip("/")
    # Nextcloud CalDAV endpoint format
    return f"{base_url}/remote.php/dav/calendars/{quote(username)}/{quote(calendar_name)}/"


def _get_auth() -> tuple[str, str]:
    """Get Nextcloud authentication credentials."""
    settings = get_settings()
    return (settings.nextcloud_username, settings.nextcloud_password)


def _parse_icalendar_datetime(dt_str: str) -> Optional[datetime]:
    """Parse iCalendar datetime string to Python datetime."""
    if not dt_str:
        return None

    # Remove any parameters (e.g., TZID=...)
    dt_str = dt_str.split(":")[-1] if ":" in dt_str else dt_str

    # Handle different formats
    formats = [
        "%Y%m%dT%H%M%SZ",  # UTC format
        "%Y%m%dT%H%M%S",   # Local format
        "%Y%m%d",          # All-day format
    ]

    for fmt in formats:
        try:
            return datetime.strptime(dt_str, fmt)
        except ValueError:
            continue

    return None


def _parse_vevent(vevent_text: str, calendar_name: str) -> Optional[CalendarEvent]:
    """Parse a VEVENT block into a CalendarEvent object."""
    try:
        # Extract UID
        uid_match = re.search(r"UID:(.+?)(?:\r?\n)", vevent_text)
        uid = uid_match.group(1).strip() if uid_match else str(uuid.uuid4())

        # Extract SUMMARY (title)
        summary_match = re.search(r"SUMMARY:(.+?)(?:\r?\n)", vevent_text)
        title = summary_match.group(1).strip() if summary_match else "Untitled Event"

        # Extract DTSTART
        dtstart_match = re.search(r"DTSTART[^:]*:(.+?)(?:\r?\n)", vevent_text)
        dtstart_str = dtstart_match.group(1).strip() if dtstart_match else ""
        start_dt = _parse_icalendar_datetime(dtstart_str)

        # Extract DTEND
        dtend_match = re.search(r"DTEND[^:]*:(.+?)(?:\r?\n)", vevent_text)
        dtend_str = dtend_match.group(1).strip() if dtend_match else ""
        end_dt = _parse_icalendar_datetime(dtend_str)

        # If no end time, assume 1 hour duration
        if start_dt and not end_dt:
            end_dt = start_dt + timedelta(hours=1)

        if not start_dt:
            return None

        # Extract LOCATION
        location_match = re.search(r"LOCATION:(.+?)(?:\r?\n)", vevent_text)
        location = location_match.group(1).strip() if location_match else None

        # Extract DESCRIPTION
        desc_match = re.search(r"DESCRIPTION:(.+?)(?:\r?\n)", vevent_text, re.DOTALL)
        description = desc_match.group(1).strip() if desc_match else None
        # Handle line folding in description
        if description:
            description = description.replace("\r\n ", "").replace("\n ", "")

        # Check if all-day event (no time component in DTSTART)
        all_day = len(dtstart_str) == 8  # YYYYMMDD format

        return CalendarEvent(
            id=uid,
            title=title,
            start=start_dt.isoformat() + "Z" if start_dt else "",
            end=end_dt.isoformat() + "Z" if end_dt else "",
            location=location,
            description=description,
            calendar_name=calendar_name,
            all_day=all_day
        )
    except Exception as e:
        logger.warning(f"Error parsing VEVENT: {e}")
        return None


async def _caldav_query_events(
    calendar_url: str,
    auth: tuple[str, str],
    start_date: str,
    end_date: str,
    calendar_name: str,
) -> List[CalendarEvent]:
    """
    Query CalDAV server for events in date range using REPORT method.

    Args:
        calendar_url: CalDAV calendar URL
        auth: (username, password) tuple
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        calendar_name: Name of the calendar

    Returns:
        List of CalendarEvent objects
    """
    # Build CalDAV REPORT request body
    # This uses calendar-query with time-range filter
    report_body = f"""<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{start_date.replace('-', '')}T000000Z"
                      end="{end_date.replace('-', '')}T235959Z"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"""

    headers = {
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(
            method="REPORT",
            url=calendar_url,
            content=report_body,
            headers=headers,
            auth=auth,
        )
        response.raise_for_status()

    # Parse response - extract VEVENT blocks from calendar-data elements
    events = []
    vevent_pattern = re.compile(r"BEGIN:VEVENT(.+?)END:VEVENT", re.DOTALL)

    for match in vevent_pattern.finditer(response.text):
        vevent_text = "BEGIN:VEVENT" + match.group(1) + "END:VEVENT"
        event = _parse_vevent(vevent_text, calendar_name)
        if event:
            events.append(event)

    return events


def _generate_icalendar_event(
    uid: str,
    title: str,
    start_datetime: str,
    end_datetime: str,
    location: Optional[str] = None,
    description: Optional[str] = None,
    all_day: bool = False,
) -> str:
    """Generate iCalendar VEVENT string."""
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    # Parse and format datetime
    try:
        start_dt = datetime.fromisoformat(start_datetime.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_datetime.replace("Z", "+00:00"))

        if all_day:
            dtstart = start_dt.strftime("%Y%m%d")
            dtend = end_dt.strftime("%Y%m%d")
            dtstart_line = f"DTSTART;VALUE=DATE:{dtstart}"
            dtend_line = f"DTEND;VALUE=DATE:{dtend}"
        else:
            dtstart = start_dt.strftime("%Y%m%dT%H%M%SZ")
            dtend = end_dt.strftime("%Y%m%dT%H%M%SZ")
            dtstart_line = f"DTSTART:{dtstart}"
            dtend_line = f"DTEND:{dtend}"
    except Exception:
        # Fallback to raw strings
        dtstart_line = f"DTSTART:{start_datetime}"
        dtend_line = f"DTEND:{end_datetime}"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//VoiceAssist//Calendar//EN",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now}",
        dtstart_line,
        dtend_line,
        f"SUMMARY:{title}",
    ]

    if location:
        lines.append(f"LOCATION:{location}")
    if description:
        # Escape special characters and fold long lines
        desc = description.replace("\\", "\\\\").replace("\n", "\\n")
        lines.append(f"DESCRIPTION:{desc}")

    lines.extend([
        "END:VEVENT",
        "END:VCALENDAR",
    ])

    return "\r\n".join(lines)


async def _caldav_create_event(
    calendar_url: str,
    auth: tuple[str, str],
    uid: str,
    icalendar_data: str,
) -> bool:
    """
    Create event on CalDAV server using PUT method.

    Args:
        calendar_url: CalDAV calendar URL
        auth: (username, password) tuple
        uid: Event UID
        icalendar_data: iCalendar formatted event data

    Returns:
        True if created successfully
    """
    event_url = f"{calendar_url}{uid}.ics"

    headers = {
        "Content-Type": "text/calendar; charset=utf-8",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.put(
            url=event_url,
            content=icalendar_data,
            headers=headers,
            auth=auth,
        )
        # 201 Created or 204 No Content indicates success
        return response.status_code in (201, 204)


# ============================================================================
# Tool 1: Get Calendar Events
# ============================================================================

class GetCalendarEventsArgs(BaseModel):
    """Arguments for get_calendar_events tool"""
    start_date: str = Field(..., regex=r'^\d{4}-\d{2}-\d{2}$', description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., regex=r'^\d{4}-\d{2}-\d{2}$', description="End date (YYYY-MM-DD)")
    calendar_name: Optional[str] = Field(None, description="Filter by calendar name")
    max_results: Optional[int] = Field(50, ge=1, le=100, description="Maximum number of events to return")


class CalendarEvent(BaseModel):
    """Calendar event model"""
    id: str
    title: str
    start: str  # ISO 8601 datetime
    end: str    # ISO 8601 datetime
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_name: str
    all_day: bool = False


class GetCalendarEventsResult(BaseModel):
    """Result from get_calendar_events"""
    events: List[CalendarEvent]
    total_count: int
    date_range: str


GET_CALENDAR_EVENTS_DEF = ToolDefinition(
    name="get_calendar_events",
    description="Retrieve calendar events for a specific date range. Use this to answer questions about appointments, meetings, and schedule.",
    parameters={
        "type": "object",
        "properties": {
            "start_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format",
                "pattern": r"^\d{4}-\d{2}-\d{2}$"
            },
            "end_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format",
                "pattern": r"^\d{4}-\d{2}-\d{2}$"
            },
            "calendar_name": {
                "type": "string",
                "description": "Optional: filter by specific calendar name"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of events to return (1-100)",
                "minimum": 1,
                "maximum": 100,
                "default": 50
            }
        },
        "required": ["start_date", "end_date"]
    },
    category=ToolCategory.CALENDAR,
    requires_phi=True,  # Patient appointments may contain PHI
    requires_confirmation=False,  # Read-only operation
    risk_level=RiskLevel.LOW,
    rate_limit=10,  # 10 calls/minute
    timeout_seconds=10
)


def get_events(args: GetCalendarEventsArgs, user_id: int) -> ToolResult:
    """
    Get calendar events for date range using CalDAV.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with events list
    """
    import asyncio

    start_time = datetime.utcnow()

    try:
        logger.info(
            f"Getting calendar events for user {user_id}: "
            f"{args.start_date} to {args.end_date}"
        )

        settings = get_settings()

        # Check if Nextcloud is configured
        if not settings.nextcloud_username or not settings.nextcloud_password:
            logger.warning("Nextcloud credentials not configured, returning empty results")
            result_data = GetCalendarEventsResult(
                events=[],
                total_count=0,
                date_range=f"{args.start_date} to {args.end_date}"
            )
            execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            return ToolResult(
                tool_name="get_calendar_events",
                success=True,
                result=result_data.dict(),
                execution_time_ms=execution_time
            )

        # Determine calendar to query
        calendar_name = args.calendar_name or settings.nextcloud_default_calendar
        calendar_url = _get_caldav_url(settings.nextcloud_username, calendar_name)
        auth = _get_auth()

        async def _query():
            return await _caldav_query_events(
                calendar_url=calendar_url,
                auth=auth,
                start_date=args.start_date,
                end_date=args.end_date,
                calendar_name=calendar_name,
            )

        # Run async query
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _query())
                events = future.result(timeout=15)
        else:
            events = asyncio.run(_query())

        # Sort by start time and limit results
        events.sort(key=lambda e: e.start)
        events = events[:args.max_results]

        result_data = GetCalendarEventsResult(
            events=events,
            total_count=len(events),
            date_range=f"{args.start_date} to {args.end_date}"
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Retrieved {len(events)} calendar events in {execution_time:.2f}ms"
        )

        return ToolResult(
            tool_name="get_calendar_events",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"CalDAV HTTP error: {e}")
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="get_calendar_events",
            success=False,
            error=f"Calendar server error: {e.response.status_code}",
            execution_time_ms=execution_time
        )
    except httpx.TimeoutException:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="get_calendar_events",
            success=False,
            error="Calendar request timed out",
            execution_time_ms=execution_time
        )
    except Exception as e:
        logger.error(f"Error getting calendar events: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="get_calendar_events",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


# ============================================================================
# Tool 2: Create Calendar Event
# ============================================================================

class CreateCalendarEventArgs(BaseModel):
    """Arguments for create_calendar_event tool"""
    title: str = Field(..., min_length=1, max_length=200, description="Event title")
    start_datetime: str = Field(..., description="Start datetime (ISO 8601 format)")
    end_datetime: str = Field(..., description="End datetime (ISO 8601 format)")
    location: Optional[str] = Field(None, max_length=500, description="Event location")
    description: Optional[str] = Field(None, max_length=2000, description="Event description")
    calendar_name: Optional[str] = Field("Default", description="Calendar name")
    all_day: bool = Field(False, description="Is this an all-day event?")


class CreateCalendarEventResult(BaseModel):
    """Result from create_calendar_event"""
    event_id: str
    title: str
    start: str
    end: str
    created: bool = True
    message: str


CREATE_CALENDAR_EVENT_DEF = ToolDefinition(
    name="create_calendar_event",
    description="Create a new calendar event. IMPORTANT: Always ask for user confirmation before creating events.",
    parameters={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Event title",
                "minLength": 1,
                "maxLength": 200
            },
            "start_datetime": {
                "type": "string",
                "description": "Start datetime in ISO 8601 format (e.g., 2024-01-15T14:00:00Z)"
            },
            "end_datetime": {
                "type": "string",
                "description": "End datetime in ISO 8601 format"
            },
            "location": {
                "type": "string",
                "description": "Event location",
                "maxLength": 500
            },
            "description": {
                "type": "string",
                "description": "Event description",
                "maxLength": 2000
            },
            "calendar_name": {
                "type": "string",
                "description": "Calendar name (default: 'Default')",
                "default": "Default"
            },
            "all_day": {
                "type": "boolean",
                "description": "Is this an all-day event?",
                "default": False
            }
        },
        "required": ["title", "start_datetime", "end_datetime"]
    },
    category=ToolCategory.CALENDAR,
    requires_phi=True,  # May contain patient names
    requires_confirmation=True,  # User must confirm before creating
    risk_level=RiskLevel.MEDIUM,
    rate_limit=5,  # 5 calls/minute
    timeout_seconds=10
)


def create_event(args: CreateCalendarEventArgs, user_id: int) -> ToolResult:
    """
    Create a calendar event using CalDAV.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with created event details
    """
    import asyncio

    start_time = datetime.utcnow()

    try:
        logger.info(f"Creating calendar event for user {user_id}: {args.title}")

        settings = get_settings()

        # Check if Nextcloud is configured
        if not settings.nextcloud_username or not settings.nextcloud_password:
            return ToolResult(
                tool_name="create_calendar_event",
                success=False,
                error="Calendar not configured. Please set Nextcloud credentials.",
                execution_time_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )

        # Generate unique event ID
        event_uid = f"voiceassist-{uuid.uuid4()}"

        # Determine calendar
        calendar_name = args.calendar_name or settings.nextcloud_default_calendar
        calendar_url = _get_caldav_url(settings.nextcloud_username, calendar_name)
        auth = _get_auth()

        # Generate iCalendar data
        icalendar_data = _generate_icalendar_event(
            uid=event_uid,
            title=args.title,
            start_datetime=args.start_datetime,
            end_datetime=args.end_datetime,
            location=args.location,
            description=args.description,
            all_day=args.all_day,
        )

        async def _create():
            return await _caldav_create_event(
                calendar_url=calendar_url,
                auth=auth,
                uid=event_uid,
                icalendar_data=icalendar_data,
            )

        # Run async create
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _create())
                created = future.result(timeout=15)
        else:
            created = asyncio.run(_create())

        if not created:
            return ToolResult(
                tool_name="create_calendar_event",
                success=False,
                error="Failed to create event on calendar server",
                execution_time_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )

        result_data = CreateCalendarEventResult(
            event_id=event_uid,
            title=args.title,
            start=args.start_datetime,
            end=args.end_datetime,
            created=True,
            message=f"Event '{args.title}' created successfully in calendar '{calendar_name}'"
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Created calendar event '{args.title}' (uid={event_uid}) "
            f"in {execution_time:.2f}ms"
        )

        return ToolResult(
            tool_name="create_calendar_event",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"CalDAV HTTP error creating event: {e}")
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="create_calendar_event",
            success=False,
            error=f"Calendar server error: {e.response.status_code}",
            execution_time_ms=execution_time
        )
    except httpx.TimeoutException:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="create_calendar_event",
            success=False,
            error="Calendar request timed out",
            execution_time_ms=execution_time
        )
    except Exception as e:
        logger.error(f"Error creating calendar event: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="create_calendar_event",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


# ============================================================================
# Tool Registration
# ============================================================================

def register_calendar_tools():
    """Register all calendar tools with the tool registry"""
    from app.tools.registry import register_tool

    register_tool(
        name="get_calendar_events",
        definition=GET_CALENDAR_EVENTS_DEF,
        model=GetCalendarEventsArgs,
        handler=get_events
    )

    register_tool(
        name="create_calendar_event",
        definition=CREATE_CALENDAR_EVENT_DEF,
        model=CreateCalendarEventArgs,
        handler=create_event
    )

    logger.info("Calendar tools registered")
