"""
VoiceAssist V2 - Tool Base Classes

Base classes and types for all tools.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ToolCategory(str, Enum):
    """Tool category enum"""
    CALENDAR = "calendar"
    FILE = "file"
    MEDICAL = "medical"
    CALCULATION = "calculation"
    SEARCH = "search"


class RiskLevel(str, Enum):
    """Tool risk level enum"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ToolDefinition(BaseModel):
    """
    Tool definition for OpenAI Realtime API and internal routing.

    This schema is sent to OpenAI to enable function calling.
    """
    name: str = Field(..., description="Unique tool name")
    description: str = Field(..., description="Tool description for AI model")
    parameters: Dict[str, Any] = Field(..., description="JSON Schema for tool arguments")

    # VoiceAssist-specific metadata
    category: ToolCategory
    requires_phi: bool = Field(..., description="True if tool processes PHI")
    requires_confirmation: bool = Field(..., description="True if user must confirm before execution")
    risk_level: RiskLevel
    rate_limit: Optional[int] = Field(None, description="Max calls per minute (None = unlimited)")
    timeout_seconds: int = Field(30, description="Maximum execution time in seconds")

    class Config:
        use_enum_values = True


class ToolResult(BaseModel):
    """
    Result from a tool execution.

    Returned to OpenAI Realtime API and logged to database.
    """
    tool_name: str
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: float
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    # Optional citation metadata
    citations: Optional[List[Dict[str, Any]]] = None


class ToolError(Exception):
    """Base exception for tool errors"""
    pass


class ToolValidationError(ToolError):
    """Raised when tool arguments are invalid"""
    pass


class ToolPermissionError(ToolError):
    """Raised when user lacks permission to call tool"""
    pass


class ToolRateLimitError(ToolError):
    """Raised when rate limit exceeded"""
    pass


class ToolTimeoutError(ToolError):
    """Raised when tool execution times out"""
    pass


class ToolExternalAPIError(ToolError):
    """Raised when external API call fails"""
    pass
