"""
Unified Tool Service for VoiceAssist

Provides a central registry and executor for all function calling tools.
Used by both Voice Mode (OpenAI Realtime API) and Chat Mode (Chat Completions API).
"""

import json
import logging
import time
import uuid
import hashlib
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


_TOOL_ARG_REDACT_KEYS = {
    # Free-text fields that may contain PHI.
    "query",
    "question",
    "content",
    "text",
    "prompt",
    "transcript",
    "notes",
    "description",
    "message",
    "instructions",
    "summary",
}


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _sanitize_tool_arguments(value: Any, *, key: Optional[str] = None, depth: int = 0) -> Any:
    """
    Sanitize tool arguments for logging/analytics.

    HIPAA/PHI: Tool arguments can include user utterances, patient identifiers,
    and other sensitive text. We keep structure but redact free-text values.
    """
    if depth > 6:
        return {"_redacted": True, "reason": "max_depth"}

    if isinstance(value, dict):
        return {str(k): _sanitize_tool_arguments(v, key=str(k), depth=depth + 1) for k, v in value.items()}

    if isinstance(value, list):
        # Avoid unbounded logs
        out = [_sanitize_tool_arguments(v, key=key, depth=depth + 1) for v in value[:50]]
        if len(value) > 50:
            out.append({"_redacted": True, "reason": "truncated_list", "original_len": len(value)})
        return out

    if isinstance(value, str):
        if key and key.lower() in _TOOL_ARG_REDACT_KEYS:
            stripped = value.strip()
            return {"_redacted": True, "chars": len(stripped), "sha256_12": _hash_text(stripped) if stripped else None}
        return value

    return value


class ToolCategory(str, Enum):
    """Categories for organizing tools."""

    CALENDAR = "calendar"
    SEARCH = "search"
    MEDICAL = "medical"
    KNOWLEDGE = "knowledge"
    UTILITY = "utility"
    DOCUMENT = "document"


@dataclass
class ToolDefinition:
    """Definition of a tool that can be executed."""

    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema
    category: ToolCategory
    requires_auth: bool = False  # Requires user authentication/connection
    requires_confirmation: bool = False  # Should prompt user before executing
    enabled: bool = True


@dataclass
class ToolResult:
    """Result of a tool execution."""

    success: bool
    data: Any
    error: Optional[str] = None
    error_type: Optional[str] = None
    needs_clarification: bool = False
    needs_connection: bool = False
    available_calendars: Optional[List[str]] = None
    message: Optional[str] = None
    duration_ms: int = 0


@dataclass
class ToolExecutionContext:
    """Context for tool execution."""

    user_id: str
    session_id: Optional[str] = None
    # Mode in which the tool is being invoked ("voice" or "chat").
    mode: str = "chat"
    trace_id: Optional[str] = None
    db_session: Optional[AsyncSession] = None
    # Optional tenant context for multi-tenancy-aware analytics.
    organization_id: Optional[str] = None
    # Optional richer context for tools that need it (RAG, document
    # navigation, PHI-conscious behavior, etc.).
    conversation_id: Optional[str] = None
    clinical_context_id: Optional[str] = None
    # When true, tools that perform KB/RAG lookups should apply PHI-conscious
    # filters (e.g., exclude high-risk KB chunks). Defaults to False so that
    # existing behavior is unchanged unless explicitly enabled.
    exclude_phi: bool = False
    # Optional reading-mode hints for document-aware tools (voice mode).
    reading_mode_enabled: bool = False
    reading_detail: Optional[str] = None  # "short" | "full"
    reading_speed: Optional[str] = None  # "slow" | "normal" | "fast"


# Tool handler type
ToolHandler = Callable[[Dict[str, Any], ToolExecutionContext], Any]


class ToolService:
    """
    Unified tool execution service for Voice and Chat modes.

    Provides:
    - Tool registration and discovery
    - OpenAI-compatible tool schema generation
    - Tool execution with error handling
    - Analytics logging
    """

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, ToolHandler] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        """Register all default tools."""
        # Calendar tools
        self.register(
            ToolDefinition(
                name="calendar_create_event",
                description=(
                    "Create a new calendar event or appointment. "
                    "Use this when the user wants to add something to their calendar."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Event title or name",
                        },
                        "start_time": {
                            "type": "string",
                            "description": (
                                "Start time in natural language " "(e.g., 'Thursday at 6pm', 'tomorrow at noon')"
                            ),
                        },
                        "end_time": {
                            "type": "string",
                            "description": "End time (optional, defaults to 1 hour after start)",
                        },
                        "description": {
                            "type": "string",
                            "description": "Event description or notes",
                        },
                        "location": {
                            "type": "string",
                            "description": "Event location",
                        },
                        "calendar_provider": {
                            "type": "string",
                            "enum": ["google", "microsoft", "apple", "nextcloud"],
                            "description": "Which calendar to use (if user has multiple connected)",
                        },
                    },
                    "required": ["title", "start_time"],
                },
                category=ToolCategory.CALENDAR,
                requires_auth=True,
            ),
        )

        self.register(
            ToolDefinition(
                name="calendar_list_events",
                description="List upcoming calendar events. Use when the user asks about their schedule.",
                parameters={
                    "type": "object",
                    "properties": {
                        "start_date": {
                            "type": "string",
                            "description": "Start date to search from (e.g., 'today', 'tomorrow', '2024-01-15')",
                        },
                        "end_date": {
                            "type": "string",
                            "description": "End date to search to (optional, defaults to 7 days from start)",
                        },
                        "calendar_provider": {
                            "type": "string",
                            "enum": [
                                "google",
                                "microsoft",
                                "apple",
                                "nextcloud",
                                "all",
                            ],
                            "description": "Which calendar to query (or 'all' for all connected calendars)",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of events to return (default 10)",
                        },
                    },
                    "required": [],
                },
                category=ToolCategory.CALENDAR,
                requires_auth=True,
            ),
        )

        self.register(
            ToolDefinition(
                name="calendar_update_event",
                description=(
                    "Update an existing calendar event. Use when the user wants to modify, "
                    "reschedule, or change details of an event. First list events to get the event ID."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "The ID of the event to update (get from calendar_list_events)",
                        },
                        "title": {
                            "type": "string",
                            "description": "New title for the event (optional)",
                        },
                        "start_time": {
                            "type": "string",
                            "description": "New start time in natural language (optional)",
                        },
                        "end_time": {
                            "type": "string",
                            "description": "New end time (optional)",
                        },
                        "description": {
                            "type": "string",
                            "description": "New description (optional)",
                        },
                        "location": {
                            "type": "string",
                            "description": "New location (optional)",
                        },
                        "calendar_provider": {
                            "type": "string",
                            "enum": ["google", "microsoft", "apple", "nextcloud"],
                            "description": "Which calendar the event is on",
                        },
                    },
                    "required": ["event_id"],
                },
                category=ToolCategory.CALENDAR,
                requires_auth=True,
            ),
        )

        self.register(
            ToolDefinition(
                name="calendar_delete_event",
                description=(
                    "Delete a calendar event. Use when the user wants to remove or cancel an event. "
                    "First list events to get the event ID, then confirm with the user before deleting."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "The ID of the event to delete (get from calendar_list_events)",
                        },
                        "calendar_provider": {
                            "type": "string",
                            "enum": ["google", "microsoft", "apple", "nextcloud"],
                            "description": "Which calendar the event is on",
                        },
                    },
                    "required": ["event_id"],
                },
                category=ToolCategory.CALENDAR,
                requires_auth=True,
                requires_confirmation=True,
            ),
        )

        # Web search tool
        self.register(
            ToolDefinition(
                name="web_search",
                description=(
                    "Search the web for information. Use when the user asks to "
                    "'google' something, look up current events, or find info not in KB."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum results to return (default 5)",
                        },
                    },
                    "required": ["query"],
                },
                category=ToolCategory.SEARCH,
            ),
        )

        # PubMed search tool
        self.register(
            ToolDefinition(
                name="pubmed_search",
                description=(
                    "Search PubMed for medical literature, research papers, "
                    "and clinical studies. Use for medical research queries."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query for PubMed",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum results (default 5)",
                        },
                        "date_range": {
                            "type": "string",
                            "description": "Date filter like '2024', 'last 5 years', 'last year'",
                        },
                        "article_types": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "review",
                                    "clinical trial",
                                    "meta-analysis",
                                    "case report",
                                    "guideline",
                                ],
                            },
                            "description": "Filter by article type",
                        },
                    },
                    "required": ["query"],
                },
                category=ToolCategory.MEDICAL,
            ),
        )

        # Medical calculator tool
        self.register(
            ToolDefinition(
                name="medical_calculator",
                description=(
                    "Calculate medical scores and risk assessments. "
                    "Includes Wells DVT, CHA2DS2-VASc, MELD, Child-Pugh, BMI, eGFR."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "calculator": {
                            "type": "string",
                            "description": "Calculator name (e.g., 'wells_dvt', 'cha2ds2_vasc', 'meld', 'bmi', 'egfr')",
                        },
                        "inputs": {
                            "type": "object",
                            "description": "Calculator-specific input parameters",
                        },
                    },
                    "required": ["calculator", "inputs"],
                },
                category=ToolCategory.MEDICAL,
            ),
        )

        # KB search tool (for searching the knowledge base)
        self.register(
            ToolDefinition(
                name="kb_search",
                description=(
                    "Search the user's knowledge base (including uploaded documents) to find candidate documents. "
                    "Use this to check whether a specific document exists (by title) or to surface relevant KB documents. "
                    "Leave 'sources' empty unless the user explicitly asks to filter by category/source type."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        },
                        "sources": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "Optional filter by source types/categories (e.g., 'guideline', 'journal'). "
                                "Leave empty to search across all accessible KB documents, including user uploads."
                            ),
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum results (default 5)",
                        },
                    },
                    "required": ["query"],
                },
                category=ToolCategory.KNOWLEDGE,
            ),
        )

        # Knowledge base RAG query tool (unified KB + RAG surface)
        self.register(
            ToolDefinition(
                name="knowledge_base_query",
                description=(
                    "Retrieve relevant knowledge base excerpts and sources for a clinical question. "
                    "Use the returned context + sources to synthesize the final answer."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "User's clinical question to answer using the knowledge base.",
                        },
                        "context_documents": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 20,
                            "description": "Approximate number of KB documents to draw context from (default 5).",
                        },
                        "filters": {
                            "type": "object",
                            "description": "Optional filters for KB selection (e.g., category, recency).",
                        },
                        "conversation_history": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "role": {"type": "string"},
                                    "content": {"type": "string"},
                                },
                                "required": ["role", "content"],
                            },
                            "description": "Optional short history to help disambiguate the question.",
                        },
                        "clinical_context_id": {
                            "type": "string",
                            "description": "Optional clinical context identifier to align with EHR context.",
                        },
                    },
                    "required": ["question"],
                },
                category=ToolCategory.KNOWLEDGE,
            ),
        )

        # Document navigation tools for voice mode
        self.register(
            ToolDefinition(
                name="document_select",
                description=(
                    "Select and open a document from the user's library for reading. "
                    "Use when user says 'I want to read Harrison's' or 'Open my cardiology textbook'. "
                    "The current conversation is inferred; do not invent conversation IDs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Document title or search term to find the document",
                        },
                        "conversation_id": {
                            "type": "string",
                            "description": "Optional (legacy). The conversation is inferred by the server.",
                        },
                    },
                    "required": ["query"],
                },
                category=ToolCategory.DOCUMENT,
            ),
        )

        self.register(
            ToolDefinition(
                name="document_read_page",
                description=(
                    "Read content from a specific page of the open document. "
                    "Use when user says 'Read page 40' or 'What's on page 100?'. "
                    "The current conversation is inferred; do not invent conversation IDs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "page_number": {
                            "type": "integer",
                            "description": "The page number to read",
                        },
                        "conversation_id": {
                            "type": "string",
                            "description": "Optional (legacy). The conversation is inferred by the server.",
                        },
                    },
                    "required": ["page_number"],
                },
                category=ToolCategory.DOCUMENT,
            ),
        )

        self.register(
            ToolDefinition(
                name="document_navigate",
                description=(
                    "Navigate through the document by pages or sections. "
                    "Use when user says 'Next page', 'Previous section', or 'Go to chapter 5'. "
                    "The current conversation is inferred; do not invent conversation IDs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "direction": {
                            "type": "string",
                            "enum": ["next", "previous"],
                            "description": "Direction to navigate",
                        },
                        "target_type": {
                            "type": "string",
                            "enum": ["page", "section"],
                            "description": "Navigate by page or section",
                        },
                        "section_name": {
                            "type": "string",
                            "description": "Optional section name to jump to directly (e.g., 'Cardiology', 'Chapter 5')",
                        },
                        "conversation_id": {
                            "type": "string",
                            "description": "Optional (legacy). The conversation is inferred by the server.",
                        },
                    },
                    "required": [],
                },
                category=ToolCategory.DOCUMENT,
            ),
        )

        self.register(
            ToolDefinition(
                name="document_toc",
                description=(
                    "Get the table of contents for the open document. "
                    "Use when user asks 'What's in the table of contents?' or 'Show me the chapters'. "
                    "The current conversation is inferred; do not invent conversation IDs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "conversation_id": {
                            "type": "string",
                            "description": "Optional (legacy). The conversation is inferred by the server.",
                        },
                    },
                    "required": [],
                },
                category=ToolCategory.DOCUMENT,
            ),
        )

        self.register(
            ToolDefinition(
                name="document_describe_figure",
                description=(
                    "Describe a figure or diagram in the document. "
                    "Use when user says 'Describe the figure' or 'What does the diagram show?'. "
                    "The current conversation is inferred; do not invent conversation IDs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "page_number": {
                            "type": "integer",
                            "description": "Page number with the figure (defaults to current page)",
                        },
                        "figure_number": {
                            "type": "integer",
                            "description": "Which figure on the page (1 = first figure, defaults to 1)",
                        },
                        "conversation_id": {
                            "type": "string",
                            "description": "Optional (legacy). The conversation is inferred by the server.",
                        },
                    },
                    "required": [],
                },
                category=ToolCategory.DOCUMENT,
            ),
        )

    def register(self, tool: ToolDefinition, handler: Optional[ToolHandler] = None):
        """Register a tool definition and optional handler."""
        self._tools[tool.name] = tool
        if handler:
            self._handlers[tool.name] = handler
        logger.debug(f"Registered tool: {tool.name}")

    def register_handler(self, tool_name: str, handler: ToolHandler):
        """Register a handler for an existing tool."""
        if tool_name not in self._tools:
            raise ValueError(f"Tool {tool_name} not registered")
        self._handlers[tool_name] = handler

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a tool definition by name."""
        return self._tools.get(name)

    def list_tools(self, category: Optional[ToolCategory] = None) -> List[ToolDefinition]:
        """List all registered tools, optionally filtered by category."""
        tools = list(self._tools.values())
        if category:
            tools = [t for t in tools if t.category == category]
        return [t for t in tools if t.enabled]

    def get_openai_tools(self, categories: Optional[List[ToolCategory]] = None) -> List[Dict[str, Any]]:
        """
        Return tools in OpenAI function calling format.

        Args:
            categories: Optional list of categories to include. If None, includes all.

        Returns:
            List of tool definitions in OpenAI format
        """
        tools = []
        for tool in self._tools.values():
            if not tool.enabled:
                continue
            if categories and tool.category not in categories:
                continue

            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
            )
        return tools

    def get_openai_tools_for_realtime(self, categories: Optional[List[ToolCategory]] = None) -> List[Dict[str, Any]]:
        """
        Return tools in OpenAI Realtime API format.

        The Realtime API uses a slightly different format than Chat Completions.
        """
        tools = []
        for tool in self._tools.values():
            if not tool.enabled:
                continue
            if categories and tool.category not in categories:
                continue

            tools.append(
                {
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            )
        return tools

    async def execute(
        self,
        name: str,
        arguments: Dict[str, Any],
        context: ToolExecutionContext,
    ) -> ToolResult:
        """
        Execute a tool by name with the given arguments.

        Args:
            name: Tool name
            arguments: Tool arguments
            context: Execution context with user info

        Returns:
            ToolResult with success/failure and data
        """
        start_time = time.time()

        tool = self._tools.get(name)
        if not tool:
            return ToolResult(
                success=False,
                data=None,
                error=f"Unknown tool: {name}",
                error_type="ToolNotFound",
            )

        if not tool.enabled:
            return ToolResult(
                success=False,
                data=None,
                error=f"Tool {name} is disabled",
                error_type="ToolDisabled",
            )

        handler = self._handlers.get(name)
        if not handler:
            # Fall back to dynamic handler lookup
            handler = self._get_dynamic_handler(name)

        if not handler:
            return ToolResult(
                success=False,
                data=None,
                error=f"No handler registered for tool: {name}",
                error_type="NoHandler",
            )

        call_id = str(uuid.uuid4())
        try:
            # HIPAA/PHI: Never log raw tool arguments.
            safe_args = _sanitize_tool_arguments(arguments)
            arg_keys = sorted(list(arguments.keys())) if isinstance(arguments, dict) else []
            logger.info(
                "tool_execute",
                extra={
                    "tool_name": name,
                    "call_id": call_id,
                    "conversation_id": context.conversation_id,
                    "session_id": context.session_id,
                    "user_id": context.user_id,
                    "arg_keys": arg_keys,
                    "exclude_phi": context.exclude_phi,
                    "reading_mode_enabled": context.reading_mode_enabled,
                    "clinical_context_id": context.clinical_context_id or None,
                },
            )
            result = await handler(arguments, context)
            duration_ms = int((time.time() - start_time) * 1000)

            if isinstance(result, ToolResult):
                result.duration_ms = duration_ms
            else:
                # Wrap plain result
                result = ToolResult(
                    success=True,
                    data=result,
                    duration_ms=duration_ms,
                )

            # Log to Redis for analytics (with organization_id)
            self._log_tool_invocation(
                tool_name=name,
                user_id=context.user_id,
                session_id=context.session_id,
                call_id=call_id,
                arguments=safe_args if isinstance(safe_args, dict) else {},
                success=result.success,
                duration_ms=result.duration_ms,
                error_message=result.error,
                organization_id=context.organization_id,
            )

            return result

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.exception(f"Error executing tool {name}: {e}")
            result = ToolResult(
                success=False,
                data=None,
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=duration_ms,
            )
            # Log failed invocation too
            self._log_tool_invocation(
                tool_name=name,
                user_id=context.user_id,
                session_id=context.session_id,
                call_id=call_id,
                arguments=_sanitize_tool_arguments(arguments) if isinstance(arguments, dict) else {},
                success=False,
                duration_ms=duration_ms,
                error_message=str(e),
                organization_id=context.organization_id,
            )
            return result

    def _log_tool_invocation(
        self,
        tool_name: str,
        user_id: str,
        session_id: Optional[str],
        call_id: str,
        arguments: Dict[str, Any],
        success: bool,
        duration_ms: int,
        error_message: Optional[str],
        organization_id: Optional[str],
    ) -> None:
        """Log tool invocation to Redis for analytics."""
        try:
            from app.api.admin_tools import log_tool_invocation

            log_tool_invocation(
                tool_name=tool_name,
                user_email=user_id,  # user_id is typically the email
                session_id=session_id or "",
                call_id=call_id,
                arguments=arguments,
                status="completed" if success else "failed",
                duration_ms=duration_ms,
                phi_detected=False,  # TODO: Detect PHI in arguments
                confirmation_required=False,
                user_confirmed=None,
                error_code=None,
                error_message=error_message,
                organization_id=organization_id,
            )
        except Exception as e:
            # Don't let logging failure break tool execution
            logger.warning(f"Failed to log tool invocation: {e}")

    def _get_dynamic_handler(self, tool_name: str) -> Optional[ToolHandler]:
        """
        Get a handler dynamically based on tool name.

        This allows lazy loading of handlers without circular imports.
        """
        from app.services.tools import calendar_tool, document_navigation_tool, medical_tools, search_tools

        handler_map = {
            # Calendar tools
            "calendar_create_event": calendar_tool.handle_create_event,
            "calendar_list_events": calendar_tool.handle_list_events,
            "calendar_update_event": calendar_tool.handle_update_event,
            "calendar_delete_event": calendar_tool.handle_delete_event,
            # Search tools
            "web_search": search_tools.handle_web_search,
            "pubmed_search": search_tools.handle_pubmed_search,
            "kb_search": search_tools.handle_kb_search,
            "knowledge_base_query": search_tools.handle_knowledge_base_query,
            # Medical tools
            "medical_calculator": medical_tools.handle_medical_calculator,
            # Document navigation tools
            "document_select": document_navigation_tool.handle_document_select,
            "document_read_page": document_navigation_tool.handle_document_read_page,
            "document_navigate": document_navigation_tool.handle_document_navigate,
            "document_toc": document_navigation_tool.handle_document_toc,
            "document_describe_figure": document_navigation_tool.handle_document_describe_figure,
        }

        return handler_map.get(tool_name)


# Global singleton instance
tool_service = ToolService()
