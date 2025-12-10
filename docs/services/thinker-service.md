---
title: Thinker Service
slug: services/thinker-service
summary: >-
  Reasoning engine managing conversation context, LLM orchestration, and tool
  calling in the voice pipeline.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-02"
audience:
  - developers
  - backend
  - agent
  - ai-agents
tags:
  - service
  - llm
  - reasoning
  - voice
  - backend
category: reference
ai_summary: >-
  > Location: services/api-gateway/app/services/thinker_service.py > Status:
  Production Ready > Last Updated: 2025-12-01 The ThinkerService is the
  reasoning engine of the Thinker-Talker voice pipeline. It manages conversation
  context, orchestrates LLM interactions, and handles tool calling with res...
---

# Thinker Service

> **Location:** `services/api-gateway/app/services/thinker_service.py`
> **Status:** Production Ready
> **Last Updated:** 2025-12-01

## Overview

The ThinkerService is the reasoning engine of the Thinker-Talker voice pipeline. It manages conversation context, orchestrates LLM interactions, and handles tool calling with result injection.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ThinkerService                              │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ ConversationContext │◄──│   ThinkerSession  │                 │
│  │ (shared memory)     │    │   (per-request)   │                │
│  └──────────────────┘    └──────────────────┘                   │
│           │                        │                             │
│           │                        ▼                             │
│           │              ┌──────────────────┐                   │
│           │              │    LLMClient     │                   │
│           │              │   (GPT-4o)       │                   │
│           │              └──────────────────┘                   │
│           │                        │                             │
│           │                        ▼                             │
│           │              ┌──────────────────┐                   │
│           │              │   ToolRegistry   │                   │
│           │              │ (calendar, search,│                  │
│           │              │  medical, KB)     │                   │
│           └──────────────┴──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Classes

### ThinkerService

Main service class (singleton pattern).

```python
from app.services.thinker_service import thinker_service

# Create a session for a conversation
session = thinker_service.create_session(
    conversation_id="conv-123",
    on_token=handle_token,         # Called for each LLM token
    on_tool_call=handle_tool_call, # Called when tool is invoked
    on_tool_result=handle_result,  # Called when tool returns
    user_id="user-456",            # Required for authenticated tools
)

# Process user input
response = await session.think("What's on my calendar today?")
```

#### Methods

| Method             | Description               | Parameters                                                                                  | Returns          |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| `create_session()` | Create a thinking session | `conversation_id`, `on_token`, `on_tool_call`, `on_tool_result`, `system_prompt`, `user_id` | `ThinkerSession` |
| `register_tool()`  | Register a new tool       | `name`, `description`, `parameters`, `handler`                                              | `None`           |

### ThinkerSession

Session class for processing individual requests.

```python
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
```

#### Methods

| Method          | Description              | Parameters                            | Returns               |
| --------------- | ------------------------ | ------------------------------------- | --------------------- |
| `think()`       | Process user input       | `user_input: str`, `source_mode: str` | `ThinkerResponse`     |
| `cancel()`      | Cancel processing        | None                                  | `None`                |
| `get_context()` | Get conversation context | None                                  | `ConversationContext` |
| `get_metrics()` | Get session metrics      | None                                  | `ThinkerMetrics`      |

#### Properties

| Property | Type            | Description              |
| -------- | --------------- | ------------------------ |
| `state`  | `ThinkingState` | Current processing state |

### ConversationContext

Manages conversation history with smart trimming.

```python
class ConversationContext:
    MAX_HISTORY_MESSAGES = 20    # Maximum messages to retain
    MAX_CONTEXT_TOKENS = 8000    # Token budget for context

    def __init__(self, conversation_id: str, system_prompt: str = None):
        self.conversation_id = conversation_id
        self.messages: List[ConversationMessage] = []
        self.system_prompt = system_prompt or self._default_system_prompt()
```

#### Smart Trimming

When message count exceeds `MAX_HISTORY_MESSAGES`, the context performs smart trimming:

```python
def _smart_trim(self) -> None:
    """
    Trim messages while preserving tool call chains.

    OpenAI requires: assistant (with tool_calls) -> tool (with tool_call_id)
    We can't break this chain or the API will reject the request.
    """
```

**Rules:**

- Never trim an assistant message if the next message is a tool result
- Never trim a tool message (it needs its preceding assistant message)
- Find the first safe trim point that doesn't break chains

#### Methods

| Method                   | Description                    |
| ------------------------ | ------------------------------ |
| `add_message()`          | Add a message to history       |
| `get_messages_for_llm()` | Format messages for OpenAI API |
| `clear()`                | Clear all history              |

### ToolRegistry

Registry for available tools.

```python
class ToolRegistry:
    def register(
        self,
        name: str,
        description: str,
        parameters: Dict,
        handler: Callable[[Dict], Awaitable[Any]],
    ) -> None:
        """Register a tool with its schema and handler."""

    def get_tools_schema(self) -> List[Dict]:
        """Get all tool schemas for LLM API."""

    async def execute(self, tool_name: str, arguments: Dict, user_id: str) -> Any:
        """Execute a tool and return its result."""
```

## Data Classes

### ThinkingState

```python
class ThinkingState(str, Enum):
    IDLE = "idle"           # Waiting for input
    PROCESSING = "processing"  # Building request
    TOOL_CALLING = "tool_calling"  # Executing tool
    GENERATING = "generating"  # Streaming response
    COMPLETE = "complete"    # Finished successfully
    CANCELLED = "cancelled"  # User interrupted
    ERROR = "error"          # Error occurred
```

### ConversationMessage

```python
@dataclass
class ConversationMessage:
    role: str              # "user", "assistant", "system", "tool"
    content: str
    message_id: str        # Auto-generated UUID
    timestamp: float       # Unix timestamp
    source_mode: str       # "chat" or "voice"
    tool_call_id: str      # For tool results
    tool_calls: List[Dict] # For assistant messages with tool calls
    citations: List[Dict]  # Source citations
```

### ThinkerResponse

```python
@dataclass
class ThinkerResponse:
    text: str                    # Complete response text
    message_id: str              # Unique ID
    citations: List[Dict]        # Source citations
    tool_calls_made: List[str]   # Names of tools called
    latency_ms: int              # Total processing time
    tokens_used: int             # Token count
    state: ThinkingState         # Final state
```

### ThinkerMetrics

```python
@dataclass
class ThinkerMetrics:
    total_tokens: int = 0
    tool_calls_count: int = 0
    first_token_latency_ms: int = 0
    total_latency_ms: int = 0
    cancelled: bool = False
```

## Available Tools

The ThinkerService automatically registers tools from the unified ToolService:

| Tool                    | Description               | Requires Auth |
| ----------------------- | ------------------------- | ------------- |
| `calendar_create_event` | Create calendar events    | Yes           |
| `calendar_list_events`  | List upcoming events      | Yes           |
| `calendar_update_event` | Modify existing events    | Yes           |
| `calendar_delete_event` | Remove events             | Yes           |
| `web_search`            | Search the web            | No            |
| `pubmed_search`         | Search medical literature | No            |
| `medical_calculator`    | Calculate medical scores  | No            |
| `kb_search`             | Search knowledge base     | No            |

## System Prompt

The default system prompt includes:

1. **Current Time Context**: Dynamic date/time with relative calculations
2. **Conversation Memory**: Instructions to use conversation history
3. **Tool Usage Guidelines**: When and how to use each tool
4. **Response Style**: Concise, natural, voice-optimized

```python
def _default_system_prompt(self) -> str:
    tz = pytz.timezone("America/New_York")
    now = datetime.now(tz)

    return f"""You are VoiceAssist, a helpful AI voice assistant.

CURRENT TIME CONTEXT:
- Current date: {now.strftime("%A, %B %d, %Y")}
- Current time: {now.strftime("%I:%M %p %Z")}

CONVERSATION MEMORY:
You have access to the full conversation history...

AVAILABLE TOOLS:
- calendar_create_event: Create events...
- web_search: Search the web...
...

KEY BEHAVIORS:
- Keep responses concise and natural for voice
- Use short sentences (max 15-20 words)
- Avoid abbreviations - say "blood pressure" not "BP"
"""
```

## Usage Examples

### Basic Query Processing

```python
from app.services.thinker_service import thinker_service

async def handle_voice_query(conversation_id: str, transcript: str, user_id: str):
    # Token streaming callback
    async def on_token(token: str):
        await send_to_tts(token)

    # Create session with callbacks
    session = thinker_service.create_session(
        conversation_id=conversation_id,
        on_token=on_token,
        user_id=user_id,
    )

    # Process the transcript
    response = await session.think(transcript, source_mode="voice")

    print(f"Response: {response.text}")
    print(f"Tools used: {response.tool_calls_made}")
    print(f"Latency: {response.latency_ms}ms")
```

### With Tool Call Handling

```python
async def handle_tool_call(event: ToolCallEvent):
    """Called when LLM decides to call a tool."""
    await send_to_client({
        "type": "tool.call",
        "tool_name": event.tool_name,
        "arguments": event.arguments,
    })

async def handle_tool_result(event: ToolResultEvent):
    """Called when tool execution completes."""
    await send_to_client({
        "type": "tool.result",
        "tool_name": event.tool_name,
        "result": event.result,
    })

session = thinker_service.create_session(
    conversation_id="conv-123",
    on_token=on_token,
    on_tool_call=handle_tool_call,
    on_tool_result=handle_tool_result,
    user_id="user-456",
)
```

### Cancellation (Barge-in)

```python
# Store session reference
active_session = thinker_service.create_session(...)

# When user barges in:
async def handle_barge_in():
    await active_session.cancel()
    print(f"Cancelled: {active_session.is_cancelled()}")
```

## Context Persistence

Conversation contexts are persisted across turns:

```python
# Class-level storage
_conversation_contexts: Dict[str, ConversationContext] = {}
_context_last_access: Dict[str, float] = {}
CONTEXT_TTL_SECONDS = 3600  # 1 hour TTL
```

- Contexts are automatically cleaned up after 1 hour of inactivity
- Same conversation_id reuses existing context
- Context persists across voice and chat modes

## Error Handling

```python
try:
    response = await session.think(transcript)
except Exception as e:
    # Errors are caught and returned in response
    response = ThinkerResponse(
        text=f"I apologize, but I encountered an error: {str(e)}",
        message_id=message_id,
        state=ThinkingState.ERROR,
    )
```

## Related Documentation

- [Thinker-Talker Pipeline Overview](../THINKER_TALKER_PIPELINE.md)
- [Talker Service](talker-service.md)
- [Tool Service](../../services/api-gateway/app/services/tools/tool_service.py)
