"""
VoiceAssist V2 - Calendar Tool

Handles calendar operations via CalDAV (Nextcloud Calendar).

Tools:
- get_calendar_events: Retrieve events for date range
- create_calendar_event: Create new calendar event
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from app.tools.base import (
    ToolDefinition,
    ToolResult,
    ToolCategory,
    RiskLevel,
    ToolError
)

logger = logging.getLogger(__name__)


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
    Get calendar events for date range.

    STUB IMPLEMENTATION - Replace with actual CalDAV integration in Phase 6.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with events list
    """
    start_time = datetime.utcnow()

    try:
        logger.info(f"Getting calendar events for user {user_id}: {args.start_date} to {args.end_date}")

        # STUB: Return mock data
        # TODO: Implement CalDAV client to query Nextcloud Calendar
        # - Connect to Nextcloud CalDAV endpoint
        # - Query events in date range
        # - Parse iCal format
        # - Return structured events

        mock_events = [
            CalendarEvent(
                id="event-1",
                title="Morning Rounds",
                start=f"{args.start_date}T08:00:00Z",
                end=f"{args.start_date}T09:00:00Z",
                location="Hospital - Floor 3",
                description="Daily morning rounds with team",
                calendar_name="Work",
                all_day=False
            ),
            CalendarEvent(
                id="event-2",
                title="Patient Consultation",
                start=f"{args.start_date}T10:00:00Z",
                end=f"{args.start_date}T10:30:00Z",
                location="Clinic Room 2",
                description="Follow-up consultation",
                calendar_name="Work",
                all_day=False
            )
        ]

        result_data = GetCalendarEventsResult(
            events=mock_events[:args.max_results],
            total_count=len(mock_events),
            date_range=f"{args.start_date} to {args.end_date}"
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="get_calendar_events",
            success=True,
            result=result_data.dict(),
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
    Create a calendar event.

    STUB IMPLEMENTATION - Replace with actual CalDAV integration in Phase 6.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with created event details
    """
    start_time = datetime.utcnow()

    try:
        logger.info(f"Creating calendar event for user {user_id}: {args.title}")

        # STUB: Simulate event creation
        # TODO: Implement CalDAV client to create event
        # - Connect to Nextcloud CalDAV endpoint
        # - Generate iCal format event
        # - POST to calendar
        # - Return event ID

        event_id = f"event-{datetime.utcnow().timestamp()}"

        result_data = CreateCalendarEventResult(
            event_id=event_id,
            title=args.title,
            start=args.start_datetime,
            end=args.end_datetime,
            created=True,
            message=f"Event '{args.title}' created successfully"
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return ToolResult(
            tool_name="create_calendar_event",
            success=True,
            result=result_data.dict(),
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
