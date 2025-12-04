---
title: Talker Service
slug: services/talker-service
summary: >-
  Text-to-speech synthesis service using ElevenLabs with sentence chunking for
  gapless audio playback.
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
  - tts
  - elevenlabs
  - voice
  - backend
category: reference
ai_summary: >-
  > Location: services/api-gateway/app/services/talker_service.py > Status:
  Production Ready > Last Updated: 2025-12-01 The TalkerService handles
  text-to-speech synthesis for the Thinker-Talker voice pipeline. It streams LLM
  tokens through a sentence chunker and synthesizes speech via ElevenLabs fo...
---

# Talker Service

> **Location:** `services/api-gateway/app/services/talker_service.py`
> **Status:** Production Ready
> **Last Updated:** 2025-12-01

## Overview

The TalkerService handles text-to-speech synthesis for the Thinker-Talker voice pipeline. It streams LLM tokens through a sentence chunker and synthesizes speech via ElevenLabs for gapless audio playback.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       TalkerService                              │
│                                                                  │
│   LLM Tokens ──►┌──────────────────┐                            │
│                 │ Markdown Buffer  │  (accumulates for pattern  │
│                 │                  │   detection before strip)   │
│                 └────────┬─────────┘                            │
│                          │                                       │
│                          ▼                                       │
│                 ┌──────────────────┐                            │
│                 │ SentenceChunker  │  (splits at natural        │
│                 │ (40-120-200 chars)│   boundaries)              │
│                 └────────┬─────────┘                            │
│                          │                                       │
│                          ▼                                       │
│                 ┌──────────────────┐                            │
│                 │ strip_markdown   │  (removes **bold**,        │
│                 │ _for_tts()       │   [links](url), LaTeX)     │
│                 └────────┬─────────┘                            │
│                          │                                       │
│                          ▼                                       │
│                 ┌──────────────────┐                            │
│                 │ ElevenLabs TTS   │  (streaming synthesis      │
│                 │ (sequential)     │   with previous_text)      │
│                 └────────┬─────────┘                            │
│                          │                                       │
│                          ▼                                       │
│                   Audio Chunks ──► on_audio_chunk callback       │
└─────────────────────────────────────────────────────────────────┘
```

## Classes

### TalkerService

Main service class (singleton pattern).

```python
from app.services.talker_service import talker_service

# Check if TTS is available
if talker_service.is_enabled():
    # Start a speaking session
    session = await talker_service.start_session(
        on_audio_chunk=handle_audio,
        voice_config=VoiceConfig(
            voice_id="TxGEqnHWrfWFTfGW9XjX",
            stability=0.78,
        ),
    )

    # Feed tokens from LLM
    for token in llm_stream:
        await session.add_token(token)

    # Finish and get metrics
    metrics = await session.finish()
```

#### Methods

| Method                   | Description               | Parameters                       | Returns                |
| ------------------------ | ------------------------- | -------------------------------- | ---------------------- |
| `is_enabled()`           | Check if TTS is available | None                             | `bool`                 |
| `get_provider()`         | Get active TTS provider   | None                             | `TTSProvider`          |
| `start_session()`        | Start a TTS session       | `on_audio_chunk`, `voice_config` | `TalkerSession`        |
| `synthesize_text()`      | Simple text synthesis     | `text`, `voice_config`           | `AsyncIterator[bytes]` |
| `get_available_voices()` | List available voices     | None                             | `List[Dict]`           |

### TalkerSession

Session class for streaming TTS.

```python
class TalkerSession:
    """
    A single TTS speaking session with streaming support.

    Manages the flow:
    1. Receive LLM tokens
    2. Chunk into sentences
    3. Synthesize each sentence
    4. Stream audio chunks to callback
    """
```

#### Methods

| Method          | Description         | Parameters   | Returns         |
| --------------- | ------------------- | ------------ | --------------- |
| `add_token()`   | Add token from LLM  | `token: str` | `None`          |
| `finish()`      | Complete synthesis  | None         | `TalkerMetrics` |
| `cancel()`      | Cancel for barge-in | None         | `None`          |
| `get_metrics()` | Get session metrics | None         | `TalkerMetrics` |

#### Properties

| Property | Type          | Description   |
| -------- | ------------- | ------------- |
| `state`  | `TalkerState` | Current state |

### AudioQueue

Queue management for gapless playback.

```python
class AudioQueue:
    """
    Manages audio chunks for gapless playback with cancellation support.

    Features:
    - Async queue for audio chunks
    - Cancellation clears pending audio
    - Tracks queue state
    """

    async def put(self, chunk: AudioChunk) -> bool
    async def get(self) -> Optional[AudioChunk]
    async def cancel(self) -> None
    def finish(self) -> None
    def reset(self) -> None
```

## Data Classes

### TalkerState

```python
class TalkerState(str, Enum):
    IDLE = "idle"           # Ready for input
    SPEAKING = "speaking"   # Synthesizing/playing
    CANCELLED = "cancelled" # Interrupted by barge-in
```

### TTSProvider

```python
class TTSProvider(str, Enum):
    ELEVENLABS = "elevenlabs"
    OPENAI = "openai"  # Fallback
```

### VoiceConfig

```python
@dataclass
class VoiceConfig:
    provider: TTSProvider = TTSProvider.ELEVENLABS
    voice_id: str = "TxGEqnHWrfWFTfGW9XjX"  # Josh
    model_id: str = "eleven_turbo_v2_5"
    stability: float = 0.78         # 0.0-1.0, higher = consistent
    similarity_boost: float = 0.85  # 0.0-1.0, higher = clearer
    style: float = 0.08             # 0.0-1.0, lower = natural
    use_speaker_boost: bool = True
    output_format: str = "pcm_24000"
```

### AudioChunk

```python
@dataclass
class AudioChunk:
    data: bytes          # Raw audio bytes
    format: str          # "pcm16" or "mp3"
    is_final: bool       # True for last chunk
    sentence_index: int  # Which sentence this is from
    latency_ms: int      # Time since synthesis started
```

### TalkerMetrics

```python
@dataclass
class TalkerMetrics:
    sentences_processed: int = 0
    total_chars_synthesized: int = 0
    total_audio_bytes: int = 0
    total_latency_ms: int = 0
    first_audio_latency_ms: int = 0
    cancelled: bool = False
```

## Sentence Chunking

The TalkerSession uses `SentenceChunker` with these settings:

```python
self._chunker = SentenceChunker(
    ChunkerConfig(
        min_chunk_chars=40,    # Avoid tiny fragments
        optimal_chunk_chars=120,  # Full sentences
        max_chunk_chars=200,   # Allow complete thoughts
    )
)
```

### Why These Settings?

| Parameter             | Value | Rationale                              |
| --------------------- | ----- | -------------------------------------- |
| `min_chunk_chars`     | 40    | Prevents choppy TTS from short phrases |
| `optimal_chunk_chars` | 120   | Full sentences sound more natural      |
| `max_chunk_chars`     | 200   | Prevents excessive buffering           |

Trade-off: Larger chunks = better prosody but higher latency to first audio.

## Markdown Stripping

LLM responses often contain markdown that sounds unnatural when spoken:

````python
def strip_markdown_for_tts(text: str) -> str:
    """
    Converts:
    - [Link Text](URL) → "Link Text"
    - **bold** → "bold"
    - *italic* → "italic"
    - `code` → "code"
    - ```blocks``` → (removed)
    - # Headers → "Headers"
    - LaTeX formulas → (removed)
    """
````

### Markdown-Aware Token Buffering

The TalkerSession buffers tokens to detect incomplete patterns:

```python
def _process_markdown_token(self, token: str) -> str:
    """
    Accumulates tokens to detect patterns that should be stripped:
    - Markdown links: [text](url) - wait for closing )
    - LaTeX display: [ ... ] with backslashes
    - LaTeX inline: \\( ... \\)
    - Bold/italic: **text** - wait for closing **
    """
```

This prevents sending "[Link Te" to TTS before we know it's a markdown link.

## Voice Continuity

For consistent voice across sentences:

```python
async for audio_data in self._elevenlabs.synthesize_stream(
    text=tts_text,
    previous_text=self._previous_text,  # Context for voice continuity
    ...
):
    ...

# Update for next synthesis
self._previous_text = tts_text
```

The `previous_text` parameter helps ElevenLabs maintain consistent prosody.

## Sequential Synthesis

To prevent voice variations between chunks:

```python
# Semaphore ensures one synthesis at a time
self._synthesis_semaphore = asyncio.Semaphore(1)

async with self._synthesis_semaphore:
    async for audio_data in self._elevenlabs.synthesize_stream(...):
        ...
```

Parallel synthesis can cause noticeable voice quality differences between sentences.

## Usage Examples

### Basic Token Streaming

```python
async def handle_llm_response(llm_stream):
    async def on_audio_chunk(chunk: AudioChunk):
        # Send to client via WebSocket
        await websocket.send_json({
            "type": "audio.output",
            "audio": base64.b64encode(chunk.data).decode(),
            "is_final": chunk.is_final,
        })

    session = await talker_service.start_session(on_audio_chunk=on_audio_chunk)

    async for token in llm_stream:
        await session.add_token(token)

    metrics = await session.finish()
    print(f"Synthesized {metrics.sentences_processed} sentences")
    print(f"First audio in {metrics.first_audio_latency_ms}ms")
```

### Custom Voice Configuration

```python
config = VoiceConfig(
    voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel (female)
    model_id="eleven_flash_v2_5",      # Lower latency
    stability=0.65,                    # More variation
    similarity_boost=0.90,             # Very clear
    style=0.15,                        # Slightly expressive
)

session = await talker_service.start_session(
    on_audio_chunk=handle_audio,
    voice_config=config,
)
```

### Handling Barge-in

```python
active_session = None

async def start_speaking(llm_stream):
    global active_session
    active_session = await talker_service.start_session(on_audio_chunk=send_audio)

    for token in llm_stream:
        if active_session.is_cancelled():
            break
        await active_session.add_token(token)

    await active_session.finish()

async def handle_barge_in():
    global active_session
    if active_session:
        await active_session.cancel()
        # Cancels pending synthesis and clears audio queue
```

### Simple Text Synthesis

```python
# For non-streaming use cases
async for audio_chunk in talker_service.synthesize_text(
    text="Hello, how can I help you today?",
    voice_config=VoiceConfig(voice_id="TxGEqnHWrfWFTfGW9XjX"),
):
    await send_audio(audio_chunk)
```

## Available Voices

```python
voices = talker_service.get_available_voices()
# Returns:
[
    {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "gender": "male", "premium": True},
    {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "gender": "male", "premium": True},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "gender": "female", "premium": True},
    {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "gender": "female", "premium": True},
    # ... more voices
]
```

## Performance Tuning

### Latency Optimization

| Setting               | Lower Latency       | Higher Quality      |
| --------------------- | ------------------- | ------------------- |
| `model_id`            | `eleven_flash_v2_5` | `eleven_turbo_v2_5` |
| `min_chunk_chars`     | 15                  | 40                  |
| `optimal_chunk_chars` | 50                  | 120                 |
| `output_format`       | `pcm_24000`         | `mp3_44100_192`     |

### Quality Optimization

| Setting            | More Natural | More Consistent |
| ------------------ | ------------ | --------------- |
| `stability`        | 0.50         | 0.85            |
| `similarity_boost` | 0.70         | 0.90            |
| `style`            | 0.20         | 0.05            |

## Error Handling

Synthesis errors don't fail the entire session:

```python
async def _synthesize_sentence(self, sentence: str) -> None:
    try:
        async for audio_data in self._elevenlabs.synthesize_stream(...):
            if self._state == TalkerState.CANCELLED:
                return
            await self._on_audio_chunk(chunk)
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}")
        # Session continues, just skips this sentence
```

## Related Documentation

- [Thinker-Talker Pipeline Overview](../THINKER_TALKER_PIPELINE.md)
- [Thinker Service](thinker-service.md)
- [Voice Pipeline WebSocket API](../api-reference/voice-pipeline-ws.md)
