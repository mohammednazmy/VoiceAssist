"""
Thinker Service - LLM Orchestration for Voice Pipeline

Unified reasoning service that manages:
- Conversation context (shared between voice and chat modes)
- Streaming LLM responses with token callbacks
- Tool/function calling with result injection
- RAG context retrieval

Phase: Thinker/Talker Voice Pipeline Migration
"""

import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional

import pytz
from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_client import LLMClient, LLMRequest, ToolCall
from app.services.repair_strategy_service import RepairStrategy, repair_strategy_service
from app.services.tools.tool_service import ToolExecutionContext, tool_service

logger = get_logger(__name__)


# ==============================================================================
# Data Classes
# ==============================================================================


class ThinkingState(str, Enum):
    """State of the thinking process."""

    IDLE = "idle"
    PROCESSING = "processing"
    TOOL_CALLING = "tool_calling"
    GENERATING = "generating"
    COMPLETE = "complete"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class ConversationMessage:
    """A message in the conversation history."""

    role: str  # "user", "assistant", "system", "tool"
    content: str
    message_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    source_mode: str = "chat"  # "chat" or "voice"
    tool_call_id: Optional[str] = None  # For tool results
    tool_calls: Optional[List[Dict]] = None  # For assistant messages with tool calls
    citations: Optional[List[Dict]] = None


@dataclass
class ToolCallEvent:
    """Event emitted when a tool is called."""

    tool_id: str
    tool_name: str
    arguments: Dict[str, Any]


@dataclass
class ToolResultEvent:
    """Event emitted when a tool returns a result."""

    tool_id: str
    tool_name: str
    result: Any
    citations: Optional[List[Dict]] = None


@dataclass
class ThinkerResponse:
    """Response from the Thinker service."""

    text: str
    message_id: str
    citations: Optional[List[Dict]] = None
    tool_calls_made: List[str] = field(default_factory=list)
    latency_ms: int = 0
    tokens_used: int = 0
    state: ThinkingState = ThinkingState.COMPLETE

    # Phase 7: Confidence scoring for conversational repair
    confidence: float = 1.0  # 0-1, AI's confidence in understanding the query
    needs_clarification: bool = False  # True if AI needs more info from user
    repair_applied: bool = False  # True if a repair strategy was applied


@dataclass
class ThinkerMetrics:
    """Metrics for a thinking session."""

    total_tokens: int = 0
    tool_calls_count: int = 0
    first_token_latency_ms: int = 0
    total_latency_ms: int = 0
    cancelled: bool = False


# ==============================================================================
# Conversation Context Manager
# ==============================================================================


class ConversationContext:
    """
    Manages conversation history for a session.

    Features:
    - Stores message history
    - Formats messages for LLM API
    - Handles token limits via truncation
    - Tracks mode (voice/chat) per message
    """

    MAX_HISTORY_MESSAGES = 20
    MAX_CONTEXT_TOKENS = 8000  # Reserve tokens for response

    def __init__(self, conversation_id: str, system_prompt: Optional[str] = None):
        self.conversation_id = conversation_id
        self.messages: List[ConversationMessage] = []
        self.system_prompt = system_prompt or self._default_system_prompt()

    def _default_system_prompt(self) -> str:
        # Get current time in user's timezone (default to Eastern)
        tz = pytz.timezone("America/New_York")
        now = datetime.now(tz)

        return f"""Your name is 'Asimo', you are a helpful medical AI voice assistant who helps medical doctors be more productive.

CURRENT TIME CONTEXT:
- Current date: {now.strftime("%A, %B %d, %Y")}
- Current time: {now.strftime("%I:%M %p %Z")}
- Day of week: {now.strftime("%A")}
- ISO format: {now.isoformat()}

When the user says relative times, calculate from current time:
- "in one hour" → {(now + timedelta(hours=1)).strftime("%I:%M %p")}
- "in 30 minutes" → {(now + timedelta(minutes=30)).strftime("%I:%M %p")}
- "tomorrow" → {(now + timedelta(days=1)).strftime("%A, %B %d, %Y")}
- "next week" → {(now + timedelta(days=7)).strftime("%A, %B %d, %Y")}

You MUST calculate dates/times yourself. NEVER ask the user for the current time.

CONVERSATION MEMORY:
You have access to the full conversation history. Use it to:
- Remember what the user said earlier (names, times, preferences)
- NEVER ask for information the user already provided
- Reference previous context naturally: "For that 'test event' you mentioned..."
- If the user says "make it longer" or "change the time", update what you just discussed

AVAILABLE TOOLS:
You have access to the following tools - use them when relevant:
- calendar_create_event: Create events on the user's connected calendar (Google, Microsoft, Apple, Nextcloud)
- calendar_list_events: View the user's upcoming schedule and appointments
- calendar_update_event: Modify existing events (change time, title, description, location)
- calendar_delete_event: Remove/cancel events from the calendar
- web_search: Search the web for current information
- pubmed_search: Search medical literature and research papers
- medical_calculator: Calculate medical scores (Wells DVT, CHA2DS2-VASc, BMI, eGFR, etc.)
- kb_search: Search the medical knowledge base to find candidate documents (especially by document title) and return matching documents + metadata
- knowledge_base_query: Retrieve relevant knowledge base excerpts + sources for a clinical question (you must synthesize the final answer)
- document_select: Open a document from the user's library for reading
- document_read_page: Read content from a specific page
- document_navigate: Move to next/previous page or section
- document_toc: Show the table of contents
- document_describe_figure: Describe figures and diagrams in the document

CALENDAR TOOL USAGE:
- When asked about calendar/schedule, USE calendar_list_events
- When asked to add/create an appointment, USE calendar_create_event
- When asked to change/modify/reschedule an event, USE calendar_update_event
- When asked to delete/remove/cancel an event, USE calendar_delete_event
- For update/delete: First use calendar_list_events to get the event_id, then use the appropriate tool

DOCUMENT NAVIGATION USAGE:
- When user wants to read a document, USE document_select with the document name
- When user says "read page X" or "go to page X", USE document_read_page
- When user says "next page", "previous page", "next section", USE document_navigate
- When user asks for table of contents or chapters, USE document_toc
- When user asks about a figure/diagram, USE document_describe_figure

DOCUMENT READING GUIDELINES:
- Summarize long page content for voice (keep it under 2-3 minutes of speaking)
- Break readings into digestible chunks
- Offer to continue: "Would you like me to continue reading?"
- Confirm navigation: "Now on page 42, Chapter 5: Cardiology"
- Mention figures: "This page has a diagram. Want me to describe it?"
- If the user hasn't opened a document, offer to help find one

KB AND RAG USAGE:
- For clinical knowledge questions where a KB-backed answer with citations is appropriate, prefer calling knowledge_base_query.
- Use kb_search when you primarily need to identify or compare relevant documents, or when the user asks to browse what the KB contains.
- If the user asks whether a specific document/book exists in the knowledge base, ALWAYS call kb_search with the title to verify. Do not guess.
- When calling kb_search for a specific title, leave any optional source/category filters empty unless the user explicitly requested a category.
- When you receive KB excerpts/sources from knowledge_base_query or kb_search, synthesize a concise answer and reference sources naturally in voice (e.g., "based on cardiology guidelines").

HANDLING PARTIAL INFORMATION:
When the user provides incomplete info, DO NOT ask rigid follow-up questions.
Instead:
- Use reasonable defaults (1 hour duration, no description)
- Infer from context (if they mentioned a time earlier, use it)
- Confirm naturally: "I'll create a 1-hour event at 3:30 PM. Sound good?"

GRACEFUL CLARIFICATION:
When you need more info, ask naturally:
- BAD: "What would you like to name this event?"
- GOOD: "Sure, what should I call it?"
- BAD: "Could you please tell me the start time?"
- GOOD: "When should I schedule it?"

PROACTIVE ASSISTANCE:
After completing a task, offer relevant follow-ups briefly:
- "Done! Want me to add a reminder?"
- "Created! Should I check for conflicts?"
- "Found 3 events. Want me to read them out?"

KEY BEHAVIORS:
- Keep responses concise and natural for voice
- Use short sentences (max 15-20 words)
- Avoid abbreviations - say "blood pressure" not "BP"
- Acknowledge questions briefly before answering
- Ask clarifying questions naturally when truly needed
- For medical questions, recommend consulting a healthcare professional

RESPONSE STRUCTURE:
1. Brief acknowledgment (1-2 words: "Sure.", "Got it.")
2. Core answer in 2-3 short sentences
3. Offer to elaborate if complex ("Would you like more details?")
"""

    def add_message(
        self,
        role: str,
        content: str,
        source_mode: str = "chat",
        tool_call_id: Optional[str] = None,
        tool_calls: Optional[List[Dict]] = None,
    ) -> ConversationMessage:
        """Add a message to the conversation."""
        message = ConversationMessage(
            role=role,
            content=content,
            source_mode=source_mode,
            tool_call_id=tool_call_id,
            tool_calls=tool_calls,
        )
        self.messages.append(message)

        # Trim old messages if needed (smart trim to preserve tool call chains)
        if len(self.messages) > self.MAX_HISTORY_MESSAGES:
            self._smart_trim()

        return message

    def _smart_trim(self) -> None:
        """
        Trim messages while preserving tool call chains.

        OpenAI requires: assistant (with tool_calls) -> tool (with tool_call_id)
        We can't break this chain or the API will reject the request.
        """
        if len(self.messages) <= self.MAX_HISTORY_MESSAGES:
            return

        # Find the first safe trim point (not in the middle of a tool call chain)
        trim_target = len(self.messages) - self.MAX_HISTORY_MESSAGES
        trim_point = 0

        for i in range(trim_target):
            msg = self.messages[i]
            next_msg = self.messages[i + 1] if i + 1 < len(self.messages) else None

            # Don't trim an assistant message if the next message is a tool result
            if msg.role == "assistant" and msg.tool_calls and next_msg and next_msg.role == "tool":
                continue

            # Don't trim a tool message (it needs its preceding assistant message)
            if msg.role == "tool":
                continue

            trim_point = i + 1

        self.messages = self.messages[trim_point:]

    def get_messages_for_llm(self) -> List[Dict]:
        """
        Get messages formatted for LLM API.

        Validates message ordering to ensure tool messages follow their
        corresponding assistant message with tool_calls (OpenAI requirement).
        """
        messages = [{"role": "system", "content": self.system_prompt}]

        # Track tool_call_ids that have been declared by assistant messages
        declared_tool_call_ids: set = set()

        for msg in self.messages:
            # Track tool_calls from assistant messages
            if msg.role == "assistant" and msg.tool_calls:
                for tc in msg.tool_calls:
                    if isinstance(tc, dict) and "id" in tc:
                        declared_tool_call_ids.add(tc["id"])

            # Skip orphaned tool messages (no preceding assistant with matching tool_calls)
            if msg.role == "tool" and msg.tool_call_id:
                if msg.tool_call_id not in declared_tool_call_ids:
                    logger.warning(f"Skipping orphaned tool message with tool_call_id={msg.tool_call_id}")
                    continue

            message_dict = {"role": msg.role, "content": msg.content}

            if msg.tool_call_id:
                message_dict["tool_call_id"] = msg.tool_call_id

            if msg.tool_calls:
                message_dict["tool_calls"] = msg.tool_calls

            messages.append(message_dict)

        return messages

    def clear(self) -> None:
        """Clear conversation history."""
        self.messages = []


# ==============================================================================
# Tool Registry
# ==============================================================================


class ToolRegistry:
    """
    Registry of available tools for the Thinker.

    Tools are registered with their OpenAI function schema and
    an async handler function.
    """

    def __init__(self):
        self._tools: Dict[str, Dict] = {}
        self._handlers: Dict[str, Callable] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: Dict,
        handler: Callable[[Dict], Awaitable[Any]],
    ) -> None:
        """Register a tool with its schema and handler."""
        self._tools[name] = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters,
            },
        }
        self._handlers[name] = handler

    def get_tools_schema(self) -> List[Dict]:
        """Get all tool schemas for LLM API."""
        return list(self._tools.values())

    async def execute(
        self,
        tool_name: str,
        arguments: Dict,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        clinical_context_id: Optional[str] = None,
        exclude_phi: bool = False,
        reading_mode_enabled: bool = False,
        reading_detail: Optional[str] = None,
        reading_speed: Optional[str] = None,
    ) -> Any:
        """Execute a tool and return its result."""
        handler = self._handlers.get(tool_name)
        if not handler:
            raise ValueError(f"Unknown tool: {tool_name}")

        # Handlers are responsible for constructing ToolExecutionContext
        # objects with the richer metadata provided here, including
        # tenant/organization context when available.
        return await handler(
            arguments,
            user_id=user_id,
            session_id=session_id,
            conversation_id=conversation_id,
            clinical_context_id=clinical_context_id,
            exclude_phi=exclude_phi,
            reading_mode_enabled=reading_mode_enabled,
            reading_detail=reading_detail,
            reading_speed=reading_speed,
        )

    def has_tools(self) -> bool:
        """Check if any tools are registered."""
        return len(self._tools) > 0


# ==============================================================================
# Thinker Service
# ==============================================================================


class ThinkerService:
    """
    Unified reasoning service for the Thinker/Talker pipeline.

    Handles:
    - Conversation context management (persisted across turns)
    - Streaming LLM responses with token callbacks
    - Tool calling with result injection
    - Cancellation support

    Usage:
        thinker = ThinkerService()

        # Create a session
        session = thinker.create_session(
            conversation_id="conv-123",
            on_token=handle_token,
            on_tool_call=handle_tool_call,
            on_tool_result=handle_tool_result,
        )

        # Process user input
        response = await session.think("What are the symptoms of diabetes?")
    """

    # Class-level context storage for conversation memory
    _conversation_contexts: Dict[str, ConversationContext] = {}
    _context_last_access: Dict[str, float] = {}
    CONTEXT_TTL_SECONDS = 3600  # 1 hour TTL for conversation contexts

    def __init__(self):
        self._llm_client = LLMClient(
            # For voice, prefer the dedicated voice pipeline model if configured.
            # This allows using a faster, latency-optimized model (e.g. gpt-4o-mini)
            # without affecting other services that may use different defaults.
            cloud_model=(
                settings.VOICE_PIPELINE_LLM_MODEL
                or settings.MODEL_SELECTION_DEFAULT
                or "gpt-4o-mini"
            ),
            openai_api_key=settings.OPENAI_API_KEY,
            openai_timeout_sec=settings.OPENAI_TIMEOUT_SEC,
        )
        self._tool_registry = ToolRegistry()
        self._setup_default_tools()

    def _get_or_create_context(
        self,
        conversation_id: str,
        system_prompt: Optional[str] = None,
    ) -> ConversationContext:
        """
        Get existing conversation context or create a new one.

        Maintains conversation memory across multiple turns/sessions.
        """
        # Clean up old contexts first
        self._cleanup_old_contexts()

        # Check if we have an existing context
        if conversation_id in ThinkerService._conversation_contexts:
            context = ThinkerService._conversation_contexts[conversation_id]
            ThinkerService._context_last_access[conversation_id] = time.time()
            logger.debug(f"Reusing existing context for {conversation_id} " f"with {len(context.messages)} messages")
            return context

        # Create new context
        context = ConversationContext(conversation_id, system_prompt)
        ThinkerService._conversation_contexts[conversation_id] = context
        ThinkerService._context_last_access[conversation_id] = time.time()
        logger.info(f"Created new conversation context for {conversation_id}")
        return context

    def _cleanup_old_contexts(self) -> None:
        """Remove conversation contexts that haven't been accessed recently."""
        current_time = time.time()
        expired = [
            conv_id
            for conv_id, last_access in ThinkerService._context_last_access.items()
            if current_time - last_access > self.CONTEXT_TTL_SECONDS
        ]
        for conv_id in expired:
            del ThinkerService._conversation_contexts[conv_id]
            del ThinkerService._context_last_access[conv_id]
            logger.debug(f"Cleaned up expired context: {conv_id}")

    def _setup_default_tools(self) -> None:
        """Set up default tools for voice mode queries."""
        # Register tools from the unified ToolService
        # This gives voice mode access to calendar, search, medical tools, etc.

        # Get all OpenAI-formatted tool schemas
        all_tools = tool_service.get_openai_tools()
        logger.info(f"Registering {len(all_tools)} tools for voice mode")

        for tool_def in all_tools:
            func = tool_def.get("function", {})
            tool_name = func.get("name", "")

            # Create a wrapper handler that bridges to the unified tool service.
            # We accept additional context parameters so that voice-mode tools
            # can respect PHI-conscious flags and attach to the correct session.
            async def tool_handler(
                arguments: Dict,
                user_id: Optional[str] = None,
                session_id: Optional[str] = None,
                conversation_id: Optional[str] = None,
                clinical_context_id: Optional[str] = None,
                exclude_phi: bool = False,
                reading_mode_enabled: bool = False,
                reading_detail: Optional[str] = None,
                reading_speed: Optional[str] = None,
                _tool_name: str = tool_name,  # Capture tool name in closure
            ) -> Any:
                from app.core.database import AsyncSessionLocal
                from app.models.session import Session as ChatSession

                # Create execution context with real user_id, organization context,
                # and database session. Organization is resolved from the
                # conversation/session when available.
                async with AsyncSessionLocal() as db_session:
                    org_id_str: Optional[str] = None
                    if conversation_id:
                        try:
                            conv_uuid = uuid.UUID(str(conversation_id))
                            session_obj = await db_session.get(ChatSession, conv_uuid)
                            if session_obj and session_obj.organization_id:
                                org_id_str = str(session_obj.organization_id)
                        except Exception:
                            # Best-effort: if parsing fails, fall back to no org
                            org_id_str = None

                    context = ToolExecutionContext(
                        user_id=user_id or "anonymous",
                        session_id=session_id,
                        mode="voice",
                        db_session=db_session,
                        conversation_id=conversation_id,
                        clinical_context_id=clinical_context_id,
                        exclude_phi=exclude_phi,
                        organization_id=org_id_str,
                    )

                    # Execute via the unified service
                    result = await tool_service.execute(_tool_name, arguments, context)

                    # Return the result in a format suitable for LLM
                    if result.success:
                        # Include both message and data for tools that return structured data
                        # This ensures the LLM can see event IDs, search results, etc.
                        if result.data and result.message:
                            # Format data as JSON for structured results
                            import json

                            data_str = json.dumps(result.data, default=str)
                            return f"{result.message}\n\nData: {data_str}"
                        return result.message or result.data or "Done."
                    else:
                        error_msg = result.error or "Tool execution failed."
                        logger.warning(f"Tool {_tool_name} failed: {error_msg}")
                        return error_msg

            # Register with our internal registry
            self._tool_registry.register(
                name=tool_name,
                description=func.get("description", ""),
                parameters=func.get("parameters", {}),
                handler=tool_handler,
            )

        logger.info(
            f"Tool registry initialized with {len(all_tools)} tools: " f"{[t['function']['name'] for t in all_tools]}"
        )

    def create_session(
        self,
        conversation_id: str,
        on_token: Optional[Callable[[str], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[ToolCallEvent], Awaitable[None]]] = None,
        on_tool_result: Optional[Callable[[ToolResultEvent], Awaitable[None]]] = None,
        system_prompt: Optional[str] = None,
        user_id: Optional[str] = None,
        *,
        exclude_phi: bool = False,
        clinical_context_id: Optional[str] = None,
        reading_mode_enabled: bool = False,
        reading_detail: Optional[str] = None,
        reading_speed: Optional[str] = None,
    ) -> "ThinkerSession":
        """
        Create a new thinking session.

        Reuses existing conversation context if available for the conversation_id,
        maintaining memory across multiple turns in the same conversation.

        Args:
            conversation_id: Unique conversation identifier
            on_token: Callback for each generated token
            on_tool_call: Callback when a tool is called
            on_tool_result: Callback when a tool returns
            system_prompt: Optional custom system prompt
            user_id: User ID for tool authentication (required for calendar, etc.)

        Returns:
            ThinkerSession for processing queries
        """
        # Get or create context - this maintains conversation memory across turns
        context = self._get_or_create_context(conversation_id, system_prompt)

        return ThinkerSession(
            llm_client=self._llm_client,
            tool_registry=self._tool_registry,
            context=context,
            on_token=on_token,
            on_tool_call=on_tool_call,
            on_tool_result=on_tool_result,
            user_id=user_id,
            exclude_phi=exclude_phi,
            clinical_context_id=clinical_context_id,
            reading_mode_enabled=reading_mode_enabled,
            reading_detail=reading_detail,
            reading_speed=reading_speed,
        )

    def register_tool(
        self,
        name: str,
        description: str,
        parameters: Dict,
        handler: Callable[[Dict], Awaitable[Any]],
    ) -> None:
        """Register a tool for use in thinking sessions."""
        self._tool_registry.register(name, description, parameters, handler)


class ThinkerSession:
    """
    A single thinking session with streaming support.

    Manages the flow:
    1. Receive user input
    2. Add to conversation context
    3. Call LLM with streaming
    4. Handle tool calls if needed
    5. Stream response tokens to callback
    """

    def __init__(
        self,
        llm_client: LLMClient,
        tool_registry: ToolRegistry,
        context: ConversationContext,
        on_token: Optional[Callable[[str], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[ToolCallEvent], Awaitable[None]]] = None,
        on_tool_result: Optional[Callable[[ToolResultEvent], Awaitable[None]]] = None,
        user_id: Optional[str] = None,
        *,
        exclude_phi: bool = False,
        clinical_context_id: Optional[str] = None,
        reading_mode_enabled: bool = False,
        reading_detail: Optional[str] = None,
        reading_speed: Optional[str] = None,
    ):
        self._llm_client = llm_client
        self._tool_registry = tool_registry
        self._context = context
        self._on_token = on_token
        self._on_tool_call = on_tool_call
        self._on_tool_result = on_tool_result
        self._user_id = user_id  # User ID for tool authentication

        # PHI-conscious / RAG-aware settings for this thinking session.
        # These are primarily populated from voice pipeline configuration
        # when running in Thinker/Talker mode.
        self._exclude_phi = exclude_phi
        self._clinical_context_id = clinical_context_id

        # Document reading preferences (used by document navigation tools).
        self._reading_mode_enabled = reading_mode_enabled
        self._reading_detail = reading_detail
        self._reading_speed = reading_speed

        # Track the current pipeline session id (when provided) so that
        # tool executions can attach to the right session for telemetry.
        self._current_session_id: Optional[str] = None

        self._state = ThinkingState.IDLE
        self._cancelled = False
        self._metrics = ThinkerMetrics()
        self._start_time: Optional[float] = None
        self._first_token_time: Optional[float] = None

    @property
    def state(self) -> ThinkingState:
        """Get current state."""
        return self._state

    def is_cancelled(self) -> bool:
        """Check if session was cancelled."""
        return self._cancelled

    async def think(
        self,
        user_input: str,
        source_mode: str = "voice",
        emotion_context: Optional[Dict] = None,
        memory_context: Optional[Dict] = None,
        transcript_confidence: float = 1.0,
        session_id: Optional[str] = None,
    ) -> ThinkerResponse:
        """
        Process user input and generate a response.

        Args:
            user_input: The user's question or statement
            source_mode: "voice" or "chat"
            emotion_context: Optional emotion context for response adaptation
                - emotion: EmotionResult from emotion detection
                - trend: EmotionTrend for trending analysis
                - prompt_addition: String to add to system prompt
            memory_context: Optional conversation memory context (Phase 4)
                - current_topic: What user is discussing
                - recent_entities: People/places mentioned
                - emotional_state: User's emotional state
                - context_items: Other relevant context
            transcript_confidence: STT confidence score (0-1) for Phase 7 repair
            session_id: Session ID for repair strategy tracking

        Returns:
            ThinkerResponse with the generated text and metadata
        """
        if self._cancelled:
            return ThinkerResponse(
                text="",
                message_id="",
                state=ThinkingState.CANCELLED,
            )

        # Track the current session id for downstream tooling (RAG, analytics)
        self._current_session_id = session_id

        self._start_time = time.time()
        self._state = ThinkingState.PROCESSING
        message_id = str(uuid.uuid4())

        # Add user message to context
        self._context.add_message("user", user_input, source_mode=source_mode)

        try:
            # Build LLM request
            messages = self._context.get_messages_for_llm()

            # Inject emotion context into system prompt if available
            if emotion_context and emotion_context.get("prompt_addition"):
                # Find the system message and append emotion context
                for msg in messages:
                    if msg.get("role") == "system":
                        msg["content"] = msg["content"] + "\n" + emotion_context["prompt_addition"]
                        break

            # Phase 4: Inject memory context into system prompt if available
            if memory_context:
                memory_prompt = self._build_memory_prompt(memory_context)
                if memory_prompt:
                    for msg in messages:
                        if msg.get("role") == "system":
                            msg["content"] = msg["content"] + "\n" + memory_prompt
                            break

            # Get tool schemas if available
            tools = None
            if self._tool_registry.has_tools():
                tools = self._tool_registry.get_tools_schema()

            # Stream response
            self._state = ThinkingState.GENERATING
            full_response = ""
            text_before_tool = ""  # Track text before any tool calls
            tool_calls_made = []
            had_tool_calls = False

            async for chunk in self._stream_llm(messages, tools):
                if self._cancelled:
                    self._state = ThinkingState.CANCELLED
                    break

                if isinstance(chunk, str):
                    # Text token
                    full_response += chunk
                    if not had_tool_calls:
                        text_before_tool += chunk
                    if self._on_token:
                        await self._on_token(chunk)

                    # Track first token latency
                    if self._first_token_time is None:
                        self._first_token_time = time.time()
                        self._metrics.first_token_latency_ms = int((self._first_token_time - self._start_time) * 1000)

                elif isinstance(chunk, ToolCall):
                    # Tool call - _handle_tool_call adds all necessary messages to context
                    # and calls LLM again to get response based on tool result
                    self._state = ThinkingState.TOOL_CALLING
                    tool_calls_made.append(chunk.name)
                    had_tool_calls = True
                    # Pass any text that came before this tool call
                    follow_up = await self._handle_tool_call(chunk, text_before_tool)
                    full_response += follow_up
                    text_before_tool = ""  # Reset for potential next tool call
                    self._state = ThinkingState.GENERATING

            # Only add assistant response if there were NO tool calls
            # (tool calls handle their own context additions)
            if not had_tool_calls and full_response:
                self._context.add_message(
                    "assistant",
                    full_response,
                    source_mode=source_mode,
                )

            self._metrics.total_latency_ms = int((time.time() - self._start_time) * 1000)

            if self._cancelled:
                self._state = ThinkingState.CANCELLED
                self._metrics.cancelled = True
            else:
                self._state = ThinkingState.COMPLETE

            # Phase 7: Apply conversational repair strategy if needed
            response_confidence, possible_interpretations = self._estimate_confidence(user_input, transcript_confidence)

            repair_applied = False
            needs_clarification = False
            final_response = full_response

            # Only apply repair strategies in voice mode and when confidence is low
            if source_mode == "voice" and response_confidence < 0.7:
                repair_recommendation = repair_strategy_service.get_repair_recommendation(
                    transcript=user_input,
                    transcript_confidence=transcript_confidence,
                    response_confidence=response_confidence,
                    session_id=session_id,
                    possible_interpretations=possible_interpretations,
                )

                if repair_recommendation.strategy != RepairStrategy.NO_REPAIR:
                    final_response = repair_strategy_service.apply_repair(repair_recommendation, full_response)
                    repair_applied = True
                    needs_clarification = repair_recommendation.strategy in [
                        RepairStrategy.ECHO_CHECK,
                        RepairStrategy.CLARIFY_SPECIFIC,
                        RepairStrategy.REQUEST_REPHRASE,
                    ]

                    logger.info(
                        f"Applied repair strategy: {repair_recommendation.strategy.value}, "
                        f"confidence: {response_confidence:.2f}"
                    )

            return ThinkerResponse(
                text=final_response,
                message_id=message_id,
                tool_calls_made=tool_calls_made,
                latency_ms=self._metrics.total_latency_ms,
                tokens_used=self._metrics.total_tokens,
                state=self._state,
                confidence=response_confidence,
                needs_clarification=needs_clarification,
                repair_applied=repair_applied,
            )

        except Exception as e:
            logger.error(f"Thinker error: {e}")
            self._state = ThinkingState.ERROR
            return ThinkerResponse(
                text=f"I apologize, but I encountered an error: {str(e)}",
                message_id=message_id,
                state=ThinkingState.ERROR,
            )

    async def _stream_llm(
        self,
        messages: List[Dict],
        tools: Optional[List[Dict]] = None,
    ) -> AsyncIterator[str | ToolCall]:
        """
        Stream LLM response, yielding text tokens and tool calls.

        Args:
            messages: Conversation messages for LLM
            tools: Optional tool schemas

        Yields:
            Text tokens (str) or ToolCall objects
        """
        req = LLMRequest(
            messages=messages,
            tools=tools,
            tool_choice="auto" if tools else None,
            temperature=0.7,
            # Use voice-specific max tokens so we can keep
            # voice responses shorter and latency lower without
            # impacting other LLM callers.
            max_tokens=getattr(settings, "VOICE_PIPELINE_MAX_TOKENS", 1024),
        )

        # Use streaming generation
        accumulated_text = []

        async def chunk_callback(chunk: str) -> None:
            accumulated_text.append(chunk)

        response = await self._llm_client.stream_generate(req, on_chunk=chunk_callback)

        # Yield accumulated text
        for chunk in accumulated_text:
            yield chunk

        # Check for tool calls
        if response.tool_calls:
            for tool_call in response.tool_calls:
                yield tool_call

        self._metrics.total_tokens = response.used_tokens

    async def _handle_tool_call(
        self,
        tool_call: ToolCall,
        preceding_text: str = "",
    ) -> str:
        """
        Handle a tool call from the LLM.

        Args:
            tool_call: The tool call to execute
            preceding_text: Any text the LLM generated before the tool call

        Returns the follow-up response from the LLM after processing the tool result.
        """
        try:
            # Parse arguments
            arguments = json.loads(tool_call.arguments)
            # HIPAA/PHI: Do not log raw tool arguments (may contain PHI or transcript text).
            # Log only a minimal, non-content summary for observability.
            arg_keys: list[str] = sorted([str(k) for k in arguments.keys()]) if isinstance(arguments, dict) else []
            query_chars = len(arguments.get("query", "")) if isinstance(arguments, dict) and isinstance(arguments.get("query"), str) else None
            question_chars = (
                len(arguments.get("question", "")) if isinstance(arguments, dict) and isinstance(arguments.get("question"), str) else None
            )
            sources_count = None
            if isinstance(arguments, dict):
                raw_sources = arguments.get("sources")
                if isinstance(raw_sources, list):
                    sources_count = len(raw_sources)
                elif isinstance(raw_sources, str) and raw_sources.strip():
                    sources_count = 1

            logger.info(
                "tool_execute_start",
                tool_name=tool_call.name,
                tool_id=tool_call.id,
                conversation_id=self._context.conversation_id,
                user_id=self._user_id,
                arg_keys=arg_keys,
                query_chars=query_chars,
                question_chars=question_chars,
                sources_count=sources_count,
            )

            # Notify callback
            if self._on_tool_call:
                await self._on_tool_call(
                    ToolCallEvent(
                        tool_id=tool_call.id,
                        tool_name=tool_call.name,
                        arguments=arguments,
                    )
                )

            # IMPORTANT: Add the assistant message WITH tool_calls BEFORE adding tool result
            # OpenAI requires: assistant (with tool_calls) -> tool (with tool_call_id)
            # Include any preceding text in this message
            self._context.add_message(
                "assistant",
                preceding_text,  # Include text that came before tool call
                tool_calls=[
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.name,
                            "arguments": tool_call.arguments,
                        },
                    }
                ],
            )

            # Execute tool with user_id for authentication. For voice sessions
            # this also carries PHI-conscious flags and conversation/session
            # identifiers so RAG-aware tools can respect exclude_phi.
            self._metrics.tool_calls_count += 1
            result = await self._tool_registry.execute(
                tool_call.name,
                arguments,
                user_id=self._user_id,
                session_id=self._current_session_id,
                conversation_id=self._context.conversation_id,
                clinical_context_id=self._clinical_context_id,
                exclude_phi=self._exclude_phi,
                reading_mode_enabled=self._reading_mode_enabled,
                reading_detail=self._reading_detail,
                reading_speed=self._reading_speed,
            )
            result_str = json.dumps(result) if not isinstance(result, str) else result
            logger.info(
                "tool_execute_complete",
                tool_name=tool_call.name,
                tool_id=tool_call.id,
                conversation_id=self._context.conversation_id,
                user_id=self._user_id,
                result_type=type(result).__name__,
                result_chars=len(result_str),
            )

            # Add tool result to context
            self._context.add_message(
                "tool",
                result_str,
                tool_call_id=tool_call.id,
            )

            # Notify callback
            if self._on_tool_result:
                await self._on_tool_result(
                    ToolResultEvent(
                        tool_id=tool_call.id,
                        tool_name=tool_call.name,
                        result=result,
                    )
                )

            # Now call LLM again to get the response based on tool result
            messages = self._context.get_messages_for_llm()
            follow_up_response = ""

            async for chunk in self._stream_llm(messages, tools=None):
                if self._cancelled:
                    break
                if isinstance(chunk, str):
                    follow_up_response += chunk
                    if self._on_token:
                        await self._on_token(chunk)

            # Add the follow-up response to context
            if follow_up_response:
                self._context.add_message(
                    "assistant",
                    follow_up_response,
                )

            return follow_up_response

        except Exception as e:
            logger.error(f"Tool execution error: {e}")
            # Add the assistant message with tool_calls first
            self._context.add_message(
                "assistant",
                preceding_text,
                tool_calls=[
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.name,
                            "arguments": tool_call.arguments,
                        },
                    }
                ],
            )
            # Add error result to context
            self._context.add_message(
                "tool",
                f"Error: {str(e)}",
                tool_call_id=tool_call.id,
            )
            error_response = f"I encountered an error while trying to help: {str(e)}"
            # Add error response to context
            self._context.add_message("assistant", error_response)
            return error_response

    async def cancel(self) -> None:
        """Cancel the thinking session."""
        self._cancelled = True
        self._state = ThinkingState.CANCELLED
        self._metrics.cancelled = True
        logger.info("Thinker session cancelled")

    def _build_memory_prompt(self, memory_context: Dict) -> Optional[str]:
        """
        Build a prompt addition from conversation memory context.

        Phase 4: Memory & Context Enhancement

        Args:
            memory_context: Dict with conversation context summary
                - current_topic: What the user is discussing
                - recent_entities: People/places/terms mentioned
                - emotional_state: User's current emotional state
                - context_items: Other relevant context

        Returns:
            String to append to system prompt, or None if empty context
        """
        parts = []

        # Add current topic
        if memory_context.get("current_topic"):
            parts.append(f"Current topic: {memory_context['current_topic']}")

        # Add recent entities for reference resolution
        entities = memory_context.get("recent_entities", [])
        if entities:
            parts.append(f"Recently mentioned: {', '.join(entities[:5])}")

        # Add emotional state for tone adaptation
        if memory_context.get("emotional_state"):
            parts.append(f"User's emotional state: {memory_context['emotional_state']}")

        if not parts:
            return None

        return "\n[Conversation Context]\n" + "\n".join(parts)

    def _estimate_confidence(
        self,
        user_input: str,
        transcript_confidence: float = 1.0,
    ) -> tuple[float, list[str]]:
        """
        Phase 7: Estimate AI's confidence in understanding the user's query.

        Analyzes query characteristics to determine how confident we should be
        in our understanding before responding.

        Args:
            user_input: The user's transcribed text
            transcript_confidence: STT confidence score (0-1)

        Returns:
            Tuple of (confidence_score, possible_interpretations)
        """
        import re

        confidence = 1.0
        possible_interpretations: list[str] = []

        # Factor 1: Transcript confidence from STT
        if transcript_confidence < 0.7:
            confidence *= 0.7
        elif transcript_confidence < 0.85:
            confidence *= 0.85

        # Factor 2: Query length (very short queries are often ambiguous)
        words = user_input.strip().split()
        word_count = len(words)
        if word_count <= 2:
            confidence *= 0.7
            possible_interpretations.append("short query - may need clarification")
        elif word_count <= 4:
            confidence *= 0.85

        # Factor 3: Ambiguous pronouns without clear referent
        ambiguous_pronouns = re.findall(r"\b(it|that|this|those|them|they|he|she)\b", user_input.lower())
        if ambiguous_pronouns and word_count < 6:
            # Check if we have recent context that could resolve the pronoun
            recent_messages = self._context.messages[-3:] if len(self._context.messages) >= 3 else []
            has_context = len(recent_messages) > 0
            if not has_context:
                confidence *= 0.75
                possible_interpretations.append(f"ambiguous reference: '{ambiguous_pronouns[0]}'")

        # Factor 4: Question words that suggest incomplete information
        incomplete_patterns = [
            r"^\s*(what|which|where|when|how)\s*\??\s*$",  # Single question word
            r"^\s*(um+|uh+|er+|ah+)\s",  # Hesitation markers at start
        ]
        for pattern in incomplete_patterns:
            if re.search(pattern, user_input.lower()):
                confidence *= 0.6
                possible_interpretations.append("incomplete query detected")
                break

        # Factor 5: Multiple possible interpretations
        # Check for words that have multiple common meanings
        ambiguous_terms = {
            "book": ["make a reservation", "a physical book"],
            "set": ["configure", "a collection"],
            "run": ["execute", "physical exercise"],
            "check": ["verify", "medical checkup", "a bank check"],
            "light": ["turn on light", "not heavy"],
        }
        for term, meanings in ambiguous_terms.items():
            if re.search(rf"\b{term}\b", user_input.lower()):
                # Only flag if context doesn't disambiguate
                if word_count < 5:
                    confidence *= 0.85
                    possible_interpretations.extend(meanings[:2])
                    break

        # Cap confidence between 0.3 and 1.0
        confidence = max(0.3, min(1.0, confidence))

        return confidence, possible_interpretations

    def get_context(self) -> ConversationContext:
        """Get the conversation context."""
        return self._context

    def get_metrics(self) -> ThinkerMetrics:
        """Get session metrics."""
        return self._metrics


# Global service instance
thinker_service = ThinkerService()
