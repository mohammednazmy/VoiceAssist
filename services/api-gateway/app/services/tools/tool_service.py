"""
Unified Tool Service for VoiceAssist

Provides a central registry and executor for all function calling tools.
Used by both Voice Mode (OpenAI Realtime API) and Chat Mode (Chat Completions API).
"""

import json
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ToolCategory(str, Enum):
    """Categories for organizing tools."""

    CALENDAR = "calendar"
    SEARCH = "search"
    MEDICAL = "medical"
    KNOWLEDGE = "knowledge"
    UTILITY = "utility"


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
    mode: str = "chat"  # "voice" or "chat"
    trace_id: Optional[str] = None
    db_session: Optional[AsyncSession] = None


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
                            "enum": ["google", "microsoft", "apple", "nextcloud", "all"],
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
                                "enum": ["review", "clinical trial", "meta-analysis", "case report", "guideline"],
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
                    "Search the medical knowledge base for relevant information "
                    "from textbooks, guidelines, and curated content."
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
                            "description": "Filter by source types (e.g., 'textbook', 'guideline')",
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

        try:
            logger.info(f"Executing tool: {name} with args: {json.dumps(arguments)[:500]}")
            result = await handler(arguments, context)
            duration_ms = int((time.time() - start_time) * 1000)

            if isinstance(result, ToolResult):
                result.duration_ms = duration_ms
                return result

            # Wrap plain result
            return ToolResult(
                success=True,
                data=result,
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.exception(f"Error executing tool {name}: {e}")
            return ToolResult(
                success=False,
                data=None,
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=duration_ms,
            )

    def _get_dynamic_handler(self, tool_name: str) -> Optional[ToolHandler]:
        """
        Get a handler dynamically based on tool name.

        This allows lazy loading of handlers without circular imports.
        """
        from app.services.tools import calendar_tool, medical_tools, search_tools

        handler_map = {
            # Calendar tools
            "calendar_create_event": calendar_tool.handle_create_event,
            "calendar_list_events": calendar_tool.handle_list_events,
            # Search tools
            "web_search": search_tools.handle_web_search,
            "pubmed_search": search_tools.handle_pubmed_search,
            "kb_search": search_tools.handle_kb_search,
            # Medical tools
            "medical_calculator": medical_tools.handle_medical_calculator,
        }

        return handler_map.get(tool_name)


# Global singleton instance
tool_service = ToolService()
