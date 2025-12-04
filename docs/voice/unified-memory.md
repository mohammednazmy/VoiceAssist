---
title: Unified Conversation Memory
slug: unified-memory
status: stable
stability: production
owner: backend
audience:
  - human
  - ai-agents
tags: [voice, memory, context, conversation, multimodal, v4]
summary: Guide to unified conversation memory across voice and text modes
lastUpdated: "2024-12-04"
---

# Unified Conversation Memory

Voice Mode v4.1 introduces unified conversation memory that maintains context across voice and text interactions, enabling seamless mode switching.

## Overview

The unified memory system provides:

- **Cross-modal context**: Conversation history shared between voice and text
- **Language switching events**: Tracks when users switch languages
- **Mode transition handling**: Preserves context when switching voice ↔ text
- **Session persistence**: Maintains memory across browser refreshes
- **Privacy controls**: User-controlled memory retention

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Memory Store                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                      ┌──────────────┐         │
│  │  Voice Mode  │◄────── Shared ──────►│  Text Mode   │         │
│  │              │        Memory        │              │         │
│  └──────────────┘                      └──────────────┘         │
│         │                                     │                  │
│         ▼                                     ▼                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │             Conversation Context                  │           │
│  ├──────────────────────────────────────────────────┤           │
│  │ • Message history (last 50 messages)             │           │
│  │ • Language preferences & switches                │           │
│  │ • RAG context (retrieved passages)               │           │
│  │ • User preferences                               │           │
│  │ • Session metadata                               │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Memory Architecture

### Memory Layers

| Layer      | Scope           | Retention    | Storage    |
| ---------- | --------------- | ------------ | ---------- |
| Session    | Current session | Until close  | Redis      |
| Short-term | Last 24 hours   | 24h TTL      | Redis      |
| Long-term  | User history    | Configurable | PostgreSQL |
| Episodic   | Key moments     | Indefinite   | PostgreSQL |

### Memory Entry Structure

```python
@dataclass
class MemoryEntry:
    """Single memory entry in the conversation."""

    id: str
    session_id: str
    user_id: str
    timestamp: datetime

    # Content
    role: Literal["user", "assistant", "system"]
    content: str
    mode: Literal["voice", "text"]

    # Context
    language: str
    detected_language: str
    language_switched: bool

    # RAG context
    retrieved_passages: List[str]
    sources: List[Dict]

    # Metadata
    latency_ms: Optional[float]
    degradations: List[str]
    phi_detected: bool
```

## Implementation

### UnifiedMemoryService

```python
from app.services.unified_memory import UnifiedMemoryService

memory_service = UnifiedMemoryService()

# Add voice message to memory
await memory_service.add_entry(
    session_id="session_123",
    user_id="user_456",
    entry=MemoryEntry(
        role="user",
        content="What is metformin used for?",
        mode="voice",
        language="en",
        detected_language="en",
        language_switched=False
    )
)

# Get context for LLM
context = await memory_service.get_context(
    session_id="session_123",
    max_messages=10,
    include_rag=True
)
```

### Cross-Modal Context

When switching from voice to text (or vice versa):

```python
async def handle_mode_switch(
    session_id: str,
    from_mode: str,
    to_mode: str
) -> ConversationContext:
    """Handle mode switch while preserving context."""

    # Get existing conversation context
    context = await memory_service.get_context(session_id)

    # Add mode switch event
    await memory_service.add_event(
        session_id=session_id,
        event_type="mode_switch",
        data={
            "from_mode": from_mode,
            "to_mode": to_mode,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    # Return context for new mode
    return context
```

### Language Switching Events

Track language changes for multilingual users:

```python
async def track_language_switch(
    session_id: str,
    from_language: str,
    to_language: str,
    trigger: str  # "user_request" | "auto_detected" | "explicit_setting"
):
    """Track when user switches languages."""

    await memory_service.add_event(
        session_id=session_id,
        event_type="language_switch",
        data={
            "from_language": from_language,
            "to_language": to_language,
            "trigger": trigger,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    # Update session language preference
    await session_service.update_language(
        session_id=session_id,
        language=to_language
    )
```

## Context Building

### Building LLM Context

```python
async def build_llm_context(
    session_id: str,
    current_query: str,
    rag_results: List[Dict]
) -> List[Dict]:
    """Build context for LLM including memory."""

    # Get conversation history
    history = await memory_service.get_history(
        session_id=session_id,
        max_messages=10
    )

    # Get language switches (for context awareness)
    language_events = await memory_service.get_events(
        session_id=session_id,
        event_type="language_switch",
        limit=5
    )

    # Build messages array
    messages = []

    # System prompt with context
    system_prompt = build_system_prompt(
        language_history=language_events,
        rag_context=rag_results
    )
    messages.append({"role": "system", "content": system_prompt})

    # Add conversation history
    for entry in history:
        messages.append({
            "role": entry.role,
            "content": entry.content
        })

    # Add current query
    messages.append({
        "role": "user",
        "content": current_query
    })

    return messages
```

### Context Truncation

When context exceeds token limits:

```python
async def truncate_context(
    messages: List[Dict],
    max_tokens: int = 4000
) -> List[Dict]:
    """Truncate context while preserving important information."""

    # Always keep: system prompt, last 3 messages
    protected = messages[:1] + messages[-3:]
    middle = messages[1:-3]

    # Count tokens
    total_tokens = count_tokens(messages)

    if total_tokens <= max_tokens:
        return messages

    # Summarize middle messages
    if middle:
        summary = await summarize_messages(middle)
        summary_message = {
            "role": "system",
            "content": f"[Previous conversation summary: {summary}]"
        }
        return [messages[0], summary_message] + messages[-3:]

    return protected
```

## Session Persistence

### Redis Session Storage

```python
class RedisMemoryStore:
    """Redis-backed memory store for sessions."""

    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        self.ttl = 86400  # 24 hours

    async def save_session(
        self,
        session_id: str,
        memory: List[MemoryEntry]
    ):
        key = f"memory:{session_id}"
        data = json.dumps([entry.to_dict() for entry in memory])
        await self.redis.set(key, data, ex=self.ttl)

    async def load_session(
        self,
        session_id: str
    ) -> List[MemoryEntry]:
        key = f"memory:{session_id}"
        data = await self.redis.get(key)
        if data:
            entries = json.loads(data)
            return [MemoryEntry.from_dict(e) for e in entries]
        return []

    async def extend_ttl(self, session_id: str):
        key = f"memory:{session_id}"
        await self.redis.expire(key, self.ttl)
```

### Long-term Storage

For persistent memory across sessions:

```python
class PostgresMemoryStore:
    """PostgreSQL-backed long-term memory store."""

    async def save_conversation(
        self,
        user_id: str,
        session_id: str,
        entries: List[MemoryEntry]
    ):
        """Save conversation to long-term storage."""

        async with self.db.transaction():
            # Save conversation record
            conversation = await self.db.execute(
                """
                INSERT INTO conversations (user_id, session_id, created_at)
                VALUES ($1, $2, NOW())
                RETURNING id
                """,
                user_id, session_id
            )

            # Save entries
            for entry in entries:
                await self.db.execute(
                    """
                    INSERT INTO conversation_entries
                    (conversation_id, role, content, mode, language, timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    conversation.id,
                    entry.role,
                    entry.content,
                    entry.mode,
                    entry.language,
                    entry.timestamp
                )
```

## Privacy Controls

### User Memory Settings

```python
@dataclass
class MemorySettings:
    """User's memory and privacy preferences."""

    enabled: bool = True
    retention_days: int = 30
    cross_session: bool = True
    save_voice_transcripts: bool = True
    save_rag_context: bool = True
    anonymize_phi: bool = True
```

### Memory Deletion

```python
async def delete_user_memory(
    user_id: str,
    scope: Literal["session", "day", "all"]
):
    """Delete user's conversation memory."""

    if scope == "session":
        await redis_store.delete_session(user_id)
    elif scope == "day":
        await postgres_store.delete_today(user_id)
    elif scope == "all":
        await redis_store.delete_all(user_id)
        await postgres_store.delete_all(user_id)

    logger.info(f"Deleted memory for user {user_id}, scope: {scope}")
```

## Frontend Integration

### Memory Hook

```tsx
import { useUnifiedMemory } from "@/hooks/useUnifiedMemory";

const ChatContainer = () => {
  const { messages, addMessage, clearMemory, mode, switchMode } = useUnifiedMemory();

  const handleSend = async (content: string) => {
    // Add to unified memory
    await addMessage({
      role: "user",
      content,
      mode: mode, // "voice" or "text"
      language: currentLanguage,
    });

    // Get AI response
    const response = await fetchResponse(content);

    // Add response to memory
    await addMessage({
      role: "assistant",
      content: response.text,
      mode: mode,
      language: response.language,
    });
  };

  return (
    <div>
      <ChatHistory messages={messages} />
      <ModeSwitch mode={mode} onSwitch={switchMode} />
      <ChatInput onSend={handleSend} mode={mode} />
    </div>
  );
};
```

### Mode Switch UI

```tsx
const ModeSwitch: React.FC<{ mode: Mode; onSwitch: (m: Mode) => void }> = ({ mode, onSwitch }) => {
  return (
    <div className="flex gap-2 p-2 bg-gray-100 rounded-lg">
      <button
        className={cn("px-4 py-2 rounded", mode === "text" ? "bg-white shadow" : "text-gray-600")}
        onClick={() => onSwitch("text")}
        aria-pressed={mode === "text"}
      >
        💬 Text
      </button>
      <button
        className={cn("px-4 py-2 rounded", mode === "voice" ? "bg-white shadow" : "text-gray-600")}
        onClick={() => onSwitch("voice")}
        aria-pressed={mode === "voice"}
      >
        🎤 Voice
      </button>
    </div>
  );
};
```

## Testing

### Unit Tests

```python
@pytest.mark.asyncio
async def test_cross_modal_context():
    """Test context preservation across voice/text modes."""
    memory = UnifiedMemoryService()

    # Add voice message
    await memory.add_entry(
        session_id="s1",
        entry=MemoryEntry(
            role="user",
            content="What is diabetes?",
            mode="voice",
            language="en"
        )
    )

    # Switch to text mode
    await memory.add_event(
        session_id="s1",
        event_type="mode_switch",
        data={"from_mode": "voice", "to_mode": "text"}
    )

    # Get context for text mode
    context = await memory.get_context("s1")

    assert len(context.messages) == 1
    assert context.messages[0].content == "What is diabetes?"
    assert context.messages[0].mode == "voice"

@pytest.mark.asyncio
async def test_language_switch_tracking():
    """Test language switch event tracking."""
    memory = UnifiedMemoryService()

    await memory.track_language_switch(
        session_id="s1",
        from_language="en",
        to_language="ar",
        trigger="auto_detected"
    )

    events = await memory.get_events("s1", "language_switch")

    assert len(events) == 1
    assert events[0]["from_language"] == "en"
    assert events[0]["to_language"] == "ar"
```

## Related Documentation

- [Voice Mode v4.1 Overview](./voice-mode-v4-overview.md)
- [Multilingual RAG Architecture](./multilingual-rag-architecture.md)
- [Latency Budgets Guide](./latency-budgets-guide.md)
