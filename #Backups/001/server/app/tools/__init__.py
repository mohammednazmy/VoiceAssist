"""
VoiceAssist V2 - Tools Package

This package contains all tool implementations for the OpenAI Realtime API integration.

Architecture:
- base.py: Base classes and shared types
- registry.py: Tool registration and discovery
- [tool]_tool.py: Individual tool implementations

All tools use Pydantic models for type-safe argument and result handling.
"""

from app.tools.base import ToolDefinition, ToolResult, ToolCategory, RiskLevel
from app.tools.registry import TOOL_REGISTRY, TOOL_MODELS, TOOL_HANDLERS, register_tool

__all__ = [
    "ToolDefinition",
    "ToolResult",
    "ToolCategory",
    "RiskLevel",
    "TOOL_REGISTRY",
    "TOOL_MODELS",
    "TOOL_HANDLERS",
    "register_tool",
]
