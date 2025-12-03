"""
Prompt management request and response schemas
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

# Type aliases for clarity
PromptTypeEnum = Literal["chat", "voice", "persona", "system"]
PromptStatusEnum = Literal["draft", "published", "archived"]
IntentCategoryEnum = Literal["diagnosis", "treatment", "drug", "guideline", "summary", "other"]


class PromptCreate(BaseModel):
    """Create new prompt request"""

    name: str = Field(
        ...,
        min_length=3,
        max_length=255,
        pattern=r"^[a-z][a-z0-9_:]{2,254}$",
        description="Unique identifier slug (e.g., 'intent:diagnosis', 'persona:friendly')",
    )
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    prompt_type: PromptTypeEnum = "chat"
    intent_category: Optional[IntentCategoryEnum] = None
    system_prompt: str = Field(..., min_length=1, max_length=50000)
    # Model settings
    temperature: Optional[float] = Field(None, ge=0, le=2, description="LLM temperature (0-2)")
    max_tokens: Optional[int] = Field(None, ge=64, le=4096, description="Max response tokens")
    model_name: Optional[str] = Field(None, max_length=100, description="Model override")
    metadata: Optional[Dict[str, Any]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate name format"""
        if not v.islower():
            raise ValueError("Name must be lowercase")
        if " " in v:
            raise ValueError("Name cannot contain spaces")
        return v


class PromptUpdate(BaseModel):
    """Update prompt request"""

    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    system_prompt: Optional[str] = Field(None, min_length=1, max_length=50000)
    intent_category: Optional[IntentCategoryEnum] = None
    # Model settings
    temperature: Optional[float] = Field(None, ge=0, le=2)
    max_tokens: Optional[int] = Field(None, ge=64, le=4096)
    model_name: Optional[str] = Field(None, max_length=100)
    metadata: Optional[Dict[str, Any]] = None
    change_summary: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class PromptPublish(BaseModel):
    """Publish prompt request"""

    change_summary: Optional[str] = Field(None, max_length=500)


class PromptRollback(BaseModel):
    """Rollback prompt request"""

    version_number: int = Field(..., ge=1)
    reason: Optional[str] = Field(None, max_length=500)


class PromptTest(BaseModel):
    """Test prompt in sandbox request"""

    test_message: str = Field(..., min_length=1, max_length=4000)
    use_draft: bool = Field(
        default=True,
        description="If true, test with draft content; if false, test with published content",
    )
    model_override: Optional[str] = Field(None, max_length=100)
    temperature_override: Optional[float] = Field(None, ge=0, le=2)
    max_tokens_override: Optional[int] = Field(None, ge=1, le=4096)


class PromptDuplicate(BaseModel):
    """Duplicate prompt request"""

    new_name: str = Field(..., min_length=3, max_length=255, pattern=r"^[a-z][a-z0-9_:]{2,254}$")
    new_display_name: Optional[str] = Field(None, min_length=1, max_length=255)


class PromptListQuery(BaseModel):
    """Query parameters for listing prompts"""

    prompt_type: Optional[PromptTypeEnum] = None
    status: Optional[PromptStatusEnum] = None
    intent_category: Optional[IntentCategoryEnum] = None
    is_active: Optional[bool] = None
    search: Optional[str] = Field(None, max_length=255)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: Literal["name", "display_name", "updated_at", "created_at"] = "updated_at"
    sort_order: Literal["asc", "desc"] = "desc"


# Response schemas


class PromptVersionResponse(BaseModel):
    """Prompt version response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_id: UUID
    version_number: int
    system_prompt: str
    prompt_type: str
    intent_category: Optional[str]
    metadata: Optional[Dict[str, Any]]
    change_summary: Optional[str]
    changed_by_id: Optional[UUID]
    changed_by_email: Optional[str]
    status: str
    created_at: datetime

    @field_serializer("id", "prompt_id", "changed_by_id")
    def serialize_uuid(self, value: Optional[UUID]) -> Optional[str]:
        """Convert UUID to string for JSON response"""
        return str(value) if value else None

    @field_serializer("created_at")
    def serialize_datetime(self, value: datetime) -> str:
        """Convert datetime to ISO format string"""
        return value.isoformat()


class PromptResponse(BaseModel):
    """Prompt response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    display_name: str
    description: Optional[str]
    prompt_type: str
    intent_category: Optional[str]
    system_prompt: str
    published_content: Optional[str]
    status: str
    is_active: bool
    current_version: int
    # Model settings
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    model_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    created_by_id: Optional[UUID]
    updated_by_id: Optional[UUID]
    created_by_email: Optional[str] = None
    updated_by_email: Optional[str] = None

    # Computed fields
    character_count: Optional[int] = None
    token_estimate: Optional[int] = None

    @field_serializer("id", "created_by_id", "updated_by_id")
    def serialize_uuid(self, value: Optional[UUID]) -> Optional[str]:
        """Convert UUID to string for JSON response"""
        return str(value) if value else None

    @field_serializer("created_at", "updated_at", "published_at")
    def serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        """Convert datetime to ISO format string"""
        if value is None:
            return None
        return value.isoformat()


class PromptListResponse(BaseModel):
    """Paginated prompt list response"""

    prompts: List[PromptResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PromptTestResponse(BaseModel):
    """Test prompt response"""

    prompt_id: str
    prompt_name: str
    test_input: str
    response: str
    model: str
    latency_ms: int
    tokens_used: int
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    used_draft: bool
    cost_estimate: Optional[float] = None


class PromptCompareResponse(BaseModel):
    """Compare draft vs production response"""

    prompt_id: str
    prompt_name: str
    test_input: str
    draft_response: PromptTestResponse
    production_response: PromptTestResponse


class PromptVersionDiffResponse(BaseModel):
    """Diff between two versions"""

    prompt_id: str
    version_a: int
    version_b: int
    additions: int
    deletions: int
    unified_diff: str
    version_a_content: str
    version_b_content: str


class PromptStatsResponse(BaseModel):
    """Prompt statistics response"""

    total: int
    published: int
    draft: int
    archived: int
    by_type: Dict[str, int]
    by_intent: Dict[str, int]


# WebSocket event schemas


class PromptUpdateEvent(BaseModel):
    """WebSocket event for prompt updates"""

    event: Literal["prompt_updated", "prompt_published", "prompt_deleted", "prompt_rolled_back"]
    prompt_id: str
    prompt_name: str
    version: Optional[int] = None
    updated_by: Optional[str] = None
    timestamp: str


class PromptEditingEvent(BaseModel):
    """WebSocket event for edit tracking"""

    event: Literal["prompt_editing_started", "prompt_editing_stopped"]
    prompt_id: str
    user_id: str
    user_email: str
    timestamp: str
