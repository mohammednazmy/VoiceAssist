"""
VoiceAssist V2 - Tool Registry

Central registry for all tools with their definitions, models, and handlers.
"""

from typing import Dict, Type, Callable, Any
from pydantic import BaseModel
import logging

from app.tools.base import ToolDefinition, ToolResult

logger = logging.getLogger(__name__)

# Global tool registry
TOOL_REGISTRY: Dict[str, ToolDefinition] = {}
TOOL_MODELS: Dict[str, Type[BaseModel]] = {}
TOOL_HANDLERS: Dict[str, Callable] = {}


def register_tool(
    name: str,
    definition: ToolDefinition,
    model: Type[BaseModel],
    handler: Callable[[BaseModel, int], ToolResult]
):
    """
    Register a tool with its definition, argument model, and handler.

    Args:
        name: Unique tool name
        definition: Tool definition for OpenAI
        model: Pydantic model for tool arguments
        handler: Callable that executes the tool (args: BaseModel, user_id: int) -> ToolResult

    Example:
        register_tool(
            name="get_calendar_events",
            definition=GET_CALENDAR_EVENTS_DEF,
            model=GetCalendarEventsArgs,
            handler=calendar_tool.get_events
        )
    """
    if name in TOOL_REGISTRY:
        logger.warning(f"Tool '{name}' already registered, overwriting")

    TOOL_REGISTRY[name] = definition
    TOOL_MODELS[name] = model
    TOOL_HANDLERS[name] = handler

    logger.info(f"Registered tool: {name} (category={definition.category}, phi={definition.requires_phi})")


def get_tool_definition(name: str) -> ToolDefinition:
    """Get tool definition by name"""
    if name not in TOOL_REGISTRY:
        raise KeyError(f"Tool '{name}' not found in registry")
    return TOOL_REGISTRY[name]


def get_tool_model(name: str) -> Type[BaseModel]:
    """Get tool argument model by name"""
    if name not in TOOL_MODELS:
        raise KeyError(f"Tool model for '{name}' not found in registry")
    return TOOL_MODELS[name]


def get_tool_handler(name: str) -> Callable:
    """Get tool handler function by name"""
    if name not in TOOL_HANDLERS:
        raise KeyError(f"Tool handler for '{name}' not found in registry")
    return TOOL_HANDLERS[name]


def list_tools() -> Dict[str, ToolDefinition]:
    """List all registered tools"""
    return TOOL_REGISTRY.copy()


def get_tools_for_openai() -> List[Dict[str, Any]]:
    """
    Get tool definitions in OpenAI Realtime API format.

    Returns list of tool schemas for function calling.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": definition.name,
                "description": definition.description,
                "parameters": definition.parameters
            }
        }
        for definition in TOOL_REGISTRY.values()
    ]
