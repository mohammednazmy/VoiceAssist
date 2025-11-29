"""
Multi-Provider Calendar Tool for VoiceAssist

Supports Google Calendar, Microsoft Outlook, Apple iCloud, and Nextcloud (CalDAV).
Handles multi-calendar scenarios with user clarification flow.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import dateparser
from app.services.tools.tool_service import ToolExecutionContext, ToolResult
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_user_calendar_connections(
    user_id: str, db_session: Optional[AsyncSession] = None
) -> List[Dict[str, Any]]:
    """Get all calendar connections for a user."""
    if not db_session:
        # Return empty list if no database session
        return []

    from sqlalchemy import text

    result = await db_session.execute(
        text(
            """
            SELECT id, provider, provider_display_name, status, caldav_url,
                   last_sync_at, connected_at
            FROM user_calendar_connections
            WHERE user_id = :user_id
            ORDER BY connected_at
        """
        ),
        {"user_id": user_id},
    )
    rows = result.fetchall()
    return [
        {
            "id": str(row.id),
            "provider": row.provider,
            "provider_display_name": row.provider_display_name,
            "status": row.status,
            "caldav_url": row.caldav_url,
            "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
            "connected_at": row.connected_at.isoformat() if row.connected_at else None,
        }
        for row in rows
    ]


def parse_datetime(time_str: str) -> Optional[datetime]:
    """Parse a natural language time string into a datetime."""
    if not time_str:
        return None

    # Use dateparser for natural language parsing
    settings = {
        "PREFER_DATES_FROM": "future",
        "PREFER_DAY_OF_MONTH": "first",
        "RETURN_AS_TIMEZONE_AWARE": True,
    }

    parsed = dateparser.parse(time_str, settings=settings)
    return parsed


async def handle_create_event(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    Create a calendar event.

    Handles multi-calendar scenarios by asking for clarification when needed.
    """
    title = arguments.get("title")
    start_time_str = arguments.get("start_time")
    end_time_str = arguments.get("end_time")
    description = arguments.get("description")
    location = arguments.get("location")
    calendar_provider = arguments.get("calendar_provider")

    if not title or not start_time_str:
        return ToolResult(
            success=False,
            data=None,
            error="Title and start_time are required",
            error_type="ValidationError",
        )

    # Parse the start time
    start_dt = parse_datetime(start_time_str)
    if not start_dt:
        return ToolResult(
            success=False,
            data=None,
            error=f"Could not parse start time: {start_time_str}",
            error_type="ParseError",
        )

    # Parse end time or default to 1 hour after start
    if end_time_str:
        end_dt = parse_datetime(end_time_str)
        if not end_dt:
            end_dt = start_dt + timedelta(hours=1)
    else:
        end_dt = start_dt + timedelta(hours=1)

    # Get user's calendar connections
    connections = await get_user_calendar_connections(context.user_id, context.db_session)
    connected = [c for c in connections if c["status"] == "connected"]

    if not connected:
        return ToolResult(
            success=False,
            data={
                "needs_connection": True,
                "available_providers": ["google", "microsoft", "apple", "nextcloud"],
            },
            needs_connection=True,
            message=(
                "You don't have any calendars connected. "
                "Would you like to connect Google Calendar, Outlook, iCloud, or Nextcloud?"
            ),
        )

    # If multiple calendars and no preference specified
    if len(connected) > 1 and not calendar_provider:
        providers = [c["provider"] for c in connected]
        provider_names = [c["provider_display_name"] or c["provider"] for c in connected]
        return ToolResult(
            success=False,
            data={
                "needs_clarification": True,
                "available_calendars": providers,
                "calendar_names": provider_names,
            },
            needs_clarification=True,
            available_calendars=providers,
            message=f"Which calendar should I add this to? You have {', '.join(provider_names)} connected.",
        )

    # Select the calendar to use
    target_provider = calendar_provider or connected[0]["provider"]
    target_connection = next((c for c in connected if c["provider"] == target_provider), None)

    if not target_connection:
        return ToolResult(
            success=False,
            data=None,
            error=f"No connected calendar found for provider: {target_provider}",
            error_type="ConnectionNotFound",
        )

    # Create the event using the appropriate provider
    try:
        if target_provider == "google":
            result = await _create_google_event(
                context.user_id,
                target_connection,
                title,
                start_dt,
                end_dt,
                description,
                location,
                context.db_session,
            )
        elif target_provider == "microsoft":
            result = await _create_microsoft_event(
                context.user_id,
                target_connection,
                title,
                start_dt,
                end_dt,
                description,
                location,
                context.db_session,
            )
        elif target_provider in ["apple", "nextcloud", "caldav"]:
            result = await _create_caldav_event(
                context.user_id,
                target_connection,
                title,
                start_dt,
                end_dt,
                description,
                location,
                context.db_session,
            )
        else:
            return ToolResult(
                success=False,
                data=None,
                error=f"Unsupported calendar provider: {target_provider}",
                error_type="UnsupportedProvider",
            )

        return ToolResult(
            success=True,
            data={
                "event_id": result.get("event_id"),
                "calendar": target_connection["provider_display_name"] or target_provider.title(),
                "title": title,
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
            },
            message=(
                f"Added '{title}' to your {target_provider.title()} Calendar "
                f"for {start_dt.strftime('%A, %B %d at %I:%M %p')}."
            ),
        )

    except Exception as e:
        logger.exception(f"Error creating calendar event: {e}")
        return ToolResult(
            success=False,
            data=None,
            error=str(e),
            error_type=type(e).__name__,
        )


async def _create_google_event(
    user_id: str,
    connection: Dict[str, Any],
    title: str,
    start: datetime,
    end: datetime,
    description: Optional[str],
    location: Optional[str],
    db_session: Optional[AsyncSession],
) -> Dict[str, Any]:
    """Create event via Google Calendar API."""
    from app.services.tools.oauth_service import oauth_service

    # Get decrypted tokens
    tokens = await oauth_service.get_decrypted_tokens(connection["id"], db_session)
    if not tokens:
        raise ValueError("No valid tokens found for Google Calendar")

    # Use google-api-python-client
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=oauth_service.get_client_id("google"),
        client_secret=oauth_service.get_client_secret("google"),
    )

    service = build("calendar", "v3", credentials=creds)

    event_body = {
        "summary": title,
        "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
    }

    if description:
        event_body["description"] = description
    if location:
        event_body["location"] = location

    event = service.events().insert(calendarId="primary", body=event_body).execute()

    return {"event_id": event["id"], "html_link": event.get("htmlLink")}


async def _create_microsoft_event(
    user_id: str,
    connection: Dict[str, Any],
    title: str,
    start: datetime,
    end: datetime,
    description: Optional[str],
    location: Optional[str],
    db_session: Optional[AsyncSession],
) -> Dict[str, Any]:
    """Create event via Microsoft Graph API."""
    import httpx
    from app.services.tools.oauth_service import oauth_service

    # Get decrypted tokens
    tokens = await oauth_service.get_decrypted_tokens(connection["id"], db_session)
    if not tokens:
        raise ValueError("No valid tokens found for Microsoft Calendar")

    event_body = {
        "subject": title,
        "start": {
            "dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        },
    }

    if description:
        event_body["body"] = {"contentType": "text", "content": description}
    if location:
        event_body["location"] = {"displayName": location}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://graph.microsoft.com/v1.0/me/events",
            headers={
                "Authorization": f"Bearer {tokens['access_token']}",
                "Content-Type": "application/json",
            },
            json=event_body,
        )
        response.raise_for_status()
        event = response.json()

    return {"event_id": event["id"], "web_link": event.get("webLink")}


async def _create_caldav_event(
    user_id: str,
    connection: Dict[str, Any],
    title: str,
    start: datetime,
    end: datetime,
    description: Optional[str],
    location: Optional[str],
    db_session: Optional[AsyncSession],
) -> Dict[str, Any]:
    """Create event via CalDAV (Apple iCloud, Nextcloud, etc.)."""
    from app.services.caldav_service import CalDAVService, CalendarEvent

    # Get CalDAV credentials
    caldav_url = connection.get("caldav_url")
    if not caldav_url:
        raise ValueError("No CalDAV URL configured for this connection")

    from app.services.tools.oauth_service import oauth_service

    caldav_creds = await oauth_service.get_caldav_credentials(connection["id"], db_session)
    if not caldav_creds:
        raise ValueError("No CalDAV credentials found")

    # Create CalDAV service
    caldav_service = CalDAVService(
        url=caldav_url,
        username=caldav_creds["username"],
        password=caldav_creds["password"],
    )

    # Create the event
    event = CalendarEvent(
        uid=None,  # Will be generated
        summary=title,
        start=start,
        end=end,
        description=description,
        location=location,
    )

    created_event = await caldav_service.create_event(event)

    return {"event_id": created_event.uid}


async def handle_list_events(arguments: Dict[str, Any], context: ToolExecutionContext) -> ToolResult:
    """
    List calendar events.

    Supports querying across multiple calendars.
    """
    start_date_str = arguments.get("start_date", "today")
    end_date_str = arguments.get("end_date")
    calendar_provider = arguments.get("calendar_provider", "all")
    max_results = arguments.get("max_results", 10)

    # Parse dates
    start_dt = parse_datetime(start_date_str) or datetime.now()
    if end_date_str:
        end_dt = parse_datetime(end_date_str)
    else:
        end_dt = start_dt + timedelta(days=7)

    # Get user's calendar connections
    connections = await get_user_calendar_connections(context.user_id, context.db_session)
    connected = [c for c in connections if c["status"] == "connected"]

    if not connected:
        return ToolResult(
            success=False,
            data={"needs_connection": True},
            needs_connection=True,
            message="You don't have any calendars connected.",
        )

    # Filter by provider if specified
    if calendar_provider and calendar_provider != "all":
        connected = [c for c in connected if c["provider"] == calendar_provider]
        if not connected:
            return ToolResult(
                success=False,
                data=None,
                error=f"No connected {calendar_provider} calendar found",
            )

    all_events = []

    for conn in connected:
        try:
            if conn["provider"] == "google":
                events = await _list_google_events(
                    context.user_id, conn, start_dt, end_dt, max_results, context.db_session
                )
            elif conn["provider"] == "microsoft":
                events = await _list_microsoft_events(
                    context.user_id, conn, start_dt, end_dt, max_results, context.db_session
                )
            elif conn["provider"] in ["apple", "nextcloud", "caldav"]:
                events = await _list_caldav_events(
                    context.user_id, conn, start_dt, end_dt, max_results, context.db_session
                )
            else:
                continue

            # Add provider info to each event
            for event in events:
                event["calendar"] = conn["provider_display_name"] or conn["provider"]
                event["provider"] = conn["provider"]

            all_events.extend(events)

        except Exception as e:
            logger.warning(f"Error listing events from {conn['provider']}: {e}")
            # Continue with other calendars

    # Sort by start time and limit
    all_events.sort(key=lambda e: e.get("start", ""))
    all_events = all_events[:max_results]

    if not all_events:
        return ToolResult(
            success=True,
            data={"events": [], "count": 0},
            message=f"No events found between {start_dt.strftime('%B %d')} and {end_dt.strftime('%B %d')}.",
        )

    return ToolResult(
        success=True,
        data={
            "events": all_events,
            "count": len(all_events),
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat(),
        },
        message=f"Found {len(all_events)} events.",
    )


async def _list_google_events(
    user_id: str,
    connection: Dict[str, Any],
    start: datetime,
    end: datetime,
    max_results: int,
    db_session: Optional[AsyncSession],
) -> List[Dict[str, Any]]:
    """List events from Google Calendar."""
    from app.services.tools.oauth_service import oauth_service
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    tokens = await oauth_service.get_decrypted_tokens(connection["id"], db_session)
    if not tokens:
        return []

    creds = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=oauth_service.get_client_id("google"),
        client_secret=oauth_service.get_client_secret("google"),
    )

    service = build("calendar", "v3", credentials=creds)

    events_result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=start.isoformat() + "Z",
            timeMax=end.isoformat() + "Z",
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    events = []
    for item in events_result.get("items", []):
        events.append(
            {
                "id": item["id"],
                "title": item.get("summary", "Untitled"),
                "start": item["start"].get("dateTime", item["start"].get("date")),
                "end": item["end"].get("dateTime", item["end"].get("date")),
                "location": item.get("location"),
                "description": item.get("description"),
            }
        )

    return events


async def _list_microsoft_events(
    user_id: str,
    connection: Dict[str, Any],
    start: datetime,
    end: datetime,
    max_results: int,
    db_session: Optional[AsyncSession],
) -> List[Dict[str, Any]]:
    """List events from Microsoft Calendar."""
    import httpx
    from app.services.tools.oauth_service import oauth_service

    tokens = await oauth_service.get_decrypted_tokens(connection["id"], db_session)
    if not tokens:
        return []

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://graph.microsoft.com/v1.0/me/calendarView",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            params={
                "startDateTime": start.isoformat(),
                "endDateTime": end.isoformat(),
                "$top": max_results,
                "$orderby": "start/dateTime",
            },
        )
        response.raise_for_status()
        data = response.json()

    events = []
    for item in data.get("value", []):
        events.append(
            {
                "id": item["id"],
                "title": item.get("subject", "Untitled"),
                "start": item["start"]["dateTime"],
                "end": item["end"]["dateTime"],
                "location": item.get("location", {}).get("displayName"),
                "description": item.get("body", {}).get("content"),
            }
        )

    return events


async def _list_caldav_events(
    user_id: str,
    connection: Dict[str, Any],
    start: datetime,
    end: datetime,
    max_results: int,
    db_session: Optional[AsyncSession],
) -> List[Dict[str, Any]]:
    """List events from CalDAV calendar."""
    from app.services.caldav_service import CalDAVService
    from app.services.tools.oauth_service import oauth_service

    caldav_url = connection.get("caldav_url")
    if not caldav_url:
        return []

    caldav_creds = await oauth_service.get_caldav_credentials(connection["id"], db_session)
    if not caldav_creds:
        return []

    caldav_service = CalDAVService(
        url=caldav_url,
        username=caldav_creds["username"],
        password=caldav_creds["password"],
    )

    events_list = await caldav_service.list_events(start, end)

    events = []
    for event in events_list[:max_results]:
        events.append(
            {
                "id": event.uid,
                "title": event.summary,
                "start": event.start.isoformat() if event.start else None,
                "end": event.end.isoformat() if event.end else None,
                "location": event.location,
                "description": event.description,
            }
        )

    return events
