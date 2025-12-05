---
title: Speaker Diarization Service
slug: voice/speaker-diarization-service
summary: >-
  Multi-speaker detection and attribution for conversations using pyannote.audio.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-04"
audience:
  - human
  - ai-agents
  - backend
tags:
  - voice
  - diarization
  - speaker-detection
  - pyannote
category: voice
ai_summary: >-
  Backend service for multi-speaker detection using pyannote.audio. Provides
  real-time speaker change detection, 512-dim voice embeddings, and speaker
  database for re-identification. Supports up to 4 concurrent speakers. See
  MODEL_VERSIONS.md for pinned model revisions.
---

# Speaker Diarization Service

**Phase 3 - Voice Mode v4.1**

Multi-speaker detection and attribution for conversations using pyannote.audio.

## Overview

The Speaker Diarization Service identifies and tracks multiple speakers in audio streams, enabling speaker-attributed transcripts and multi-party conversation support.

```
Audio Stream
    │
    ▼
┌─────────────────────────────────────────────────┐
│           Speaker Diarization Pipeline          │
│                                                 │
│  ┌─────────────┐   ┌──────────────┐   ┌──────┐ │
│  │ VAD/Segment │ → │  Embedding   │ → │Cluster│ │
│  │  Detection  │   │  Extraction  │   │       │ │
│  └─────────────┘   └──────────────┘   └──────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
    │
    ▼
Speaker Segments: [Speaker A: 0-5s] [Speaker B: 5-12s] [Speaker A: 12-15s]
```

## Features

- **Real-time Detection**: Streaming speaker change detection
- **Speaker Embeddings**: 512-dimensional voice prints
- **Speaker Database**: Persist and re-identify recurring speakers
- **Multi-speaker Support**: Up to 4 concurrent speakers
- **Offline & Streaming**: Both batch and real-time modes

## Requirements

```bash
pip install pyannote.audio torch torchaudio scipy
```

**Environment Variables:**

```bash
HUGGINGFACE_TOKEN=hf_xxxxxxxxxxxx  # Required for model access
```

## Feature Flag

Enable via feature flag:

```yaml
# flag_definitions.yaml
backend.voice_v4_speaker_diarization:
  default: false
  description: "Enable speaker diarization"
```

## Basic Usage

### Offline Processing

```python
from app.services.speaker_diarization_service import (
    get_speaker_diarization_service,
    DiarizationResult
)

# Get service instance
service = get_speaker_diarization_service()
await service.initialize()

# Process audio file
with open("conversation.wav", "rb") as f:
    audio_data = f.read()

result: DiarizationResult = await service.process_audio(
    audio_data=audio_data,
    sample_rate=16000,
    num_speakers=2  # Optional: specify if known
)

# Access results
print(f"Detected {result.num_speakers} speakers")
for segment in result.segments:
    print(f"  {segment.speaker_id}: {segment.start_ms}ms - {segment.end_ms}ms")
```

### Streaming Mode

```python
from app.services.speaker_diarization_service import (
    create_streaming_session,
    StreamingDiarizationSession
)

# Create session
session = await create_streaming_session(
    session_id="voice-session-123",
    sample_rate=16000
)

# Register speaker change callback
def on_speaker_change(segment):
    print(f"Speaker changed to: {segment.speaker_id}")

session.on_speaker_change(on_speaker_change)

# Process audio chunks
async for audio_chunk in audio_stream:
    segment = await session.process_chunk(audio_chunk)
    if segment:
        print(f"Current speaker: {segment.speaker_id}")

# Get final results
result = await session.stop()
```

## Data Structures

### SpeakerSegment

```python
@dataclass
class SpeakerSegment:
    speaker_id: str       # e.g., "SPEAKER_00"
    start_ms: int         # Segment start time
    end_ms: int           # Segment end time
    confidence: float     # Detection confidence (0-1)
    embedding: List[float] | None  # Optional voice embedding

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms
```

### DiarizationResult

```python
@dataclass
class DiarizationResult:
    segments: List[SpeakerSegment]
    num_speakers: int
    total_duration_ms: int
    processing_time_ms: float
    model_version: str = "pyannote-3.1"

    def get_speaker_summary(self) -> Dict[str, int]:
        """Total speaking time per speaker."""
```

### SpeakerProfile

```python
@dataclass
class SpeakerProfile:
    speaker_id: str
    name: str | None
    embedding: List[float] | None
    voice_samples: int
    first_seen: datetime
    last_seen: datetime
    metadata: Dict[str, Any]
```

## Speaker Database

The `SpeakerDatabase` class provides speaker re-identification:

```python
from app.services.speaker_diarization_service import (
    get_speaker_database,
    get_embedding_extractor
)

# Get instances
database = get_speaker_database()
extractor = get_embedding_extractor()
await extractor.initialize()

# Extract embedding from audio
embedding = await extractor.extract_embedding(audio_data)

# Find or create speaker profile
profile = await database.identify_or_create(
    embedding=embedding,
    threshold=0.75,  # Similarity threshold
    name="John"      # Optional name
)

print(f"Speaker: {profile.speaker_id}, Samples: {profile.voice_samples}")
```

### Persistence

```python
# Export database
data = database.to_dict()
with open("speakers.json", "w") as f:
    json.dump(data, f)

# Import database
with open("speakers.json", "r") as f:
    data = json.load(f)
database.load_from_dict(data)
```

## Configuration

### DiarizationConfig

```python
@dataclass
class DiarizationConfig:
    # Model settings
    model_name: str = "pyannote/speaker-diarization-3.1"
    use_gpu: bool = True
    device: str = "cuda"  # or "cpu"

    # Detection settings
    min_speakers: int = 1
    max_speakers: int = 4
    min_segment_duration_ms: int = 200
    min_cluster_size: int = 3

    # Embedding settings
    embedding_model: str = "pyannote/embedding"
    embedding_dim: int = 512
    similarity_threshold: float = 0.75

    # Streaming settings
    chunk_duration_ms: int = 1000
    overlap_duration_ms: int = 200

    # Performance
    max_processing_time_ms: int = 500
```

### Custom Configuration

```python
from app.services.speaker_diarization_service import (
    SpeakerDiarizationService,
    DiarizationConfig
)

config = DiarizationConfig(
    max_speakers=2,  # Two-person conversation
    use_gpu=False,   # CPU-only
    similarity_threshold=0.8,  # Stricter matching
)

service = SpeakerDiarizationService(config)
await service.initialize()
```

## Streaming Session Management

### Session Lifecycle

```python
session = await create_streaming_session("session-123")

# Session properties
session.session_id      # Unique identifier
session.is_active       # Whether session is running
session.current_speaker # Current detected speaker

# Process audio
await session.process_chunk(audio_bytes)

# End session
result = await session.stop()
```

### Speaker Change Callbacks

```python
def on_speaker_change(segment: SpeakerSegment):
    # Update UI
    update_speaker_indicator(segment.speaker_id)

    # Log change
    logger.info(f"Speaker changed: {segment.speaker_id}")

    # Notify Thinker
    inject_speaker_context(segment)

session.on_speaker_change(on_speaker_change)
```

## Integration with Voice Pipeline

### Thinker Context Injection

```python
async def process_with_diarization(audio_data: bytes):
    # Get diarization
    result = await diarization_service.process_audio(audio_data)

    # Build speaker context
    speaker_context = []
    for segment in result.segments:
        transcript = get_transcript_for_segment(segment)
        speaker_context.append(f"[{segment.speaker_id}]: {transcript}")

    # Inject into Thinker
    context = "\n".join(speaker_context)
    response = await thinker.generate(
        messages=[...],
        system_context=f"Conversation transcript:\n{context}"
    )
```

### Frontend Integration

See [SpeakerAttributedTranscript Component](#frontend-component) below.

## Performance Considerations

### GPU vs CPU

| Mode | Latency (1s audio) | Memory    | Recommended Use     |
| ---- | ------------------ | --------- | ------------------- |
| GPU  | ~100ms             | ~2GB VRAM | Real-time streaming |
| CPU  | ~500ms             | ~1GB RAM  | Batch processing    |

### Streaming Optimization

```python
# Optimize for real-time
config = DiarizationConfig(
    chunk_duration_ms=500,   # Smaller chunks
    overlap_duration_ms=100, # Less overlap
    max_processing_time_ms=300,  # Strict budget
)
```

### Memory Management

```python
# Clear session when done
await session.stop()

# Clear database periodically
if database.profile_count > 100:
    database.prune_old_profiles(max_age_days=30)
```

## Testing

### Integration Test Example

```python
import pytest
from app.services.speaker_diarization_service import (
    get_speaker_diarization_service,
    create_streaming_session
)

@pytest.mark.asyncio
async def test_diarization_two_speakers():
    """Test detection of two distinct speakers."""
    service = get_speaker_diarization_service()
    await service.initialize()

    # Load test audio with two speakers
    with open("tests/fixtures/two_speakers.wav", "rb") as f:
        audio = f.read()

    result = await service.process_audio(audio)

    assert result.num_speakers == 2
    assert len(result.segments) > 0
    assert all(s.confidence > 0.5 for s in result.segments)


@pytest.mark.asyncio
async def test_streaming_session():
    """Test streaming diarization session."""
    session = await create_streaming_session("test-session")

    # Simulate audio chunks
    for chunk in generate_test_chunks():
        segment = await session.process_chunk(chunk)

    result = await session.stop()
    assert result.num_speakers >= 1
```

## Frontend Component

### SpeakerAttributedTranscript

```tsx
// See: apps/web-app/src/components/voice/SpeakerAttributedTranscript.tsx

interface TranscriptSegment {
  speakerId: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

function SpeakerAttributedTranscript({
  segments,
  speakerNames,
}: {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      {segments.map((segment, i) => (
        <div key={i} className="flex gap-2">
          <span className="font-medium text-blue-600">{speakerNames[segment.speakerId] || segment.speakerId}:</span>
          <span>{segment.text}</span>
        </div>
      ))}
    </div>
  );
}
```

## Troubleshooting

### Common Issues

**Model fails to load:**

```
Error: Failed to initialize diarization service: 401 Unauthorized
```

→ Check `HUGGINGFACE_TOKEN` environment variable

**Out of memory:**

```
Error: CUDA out of memory
```

→ Set `use_gpu=False` or reduce `max_speakers`

**Poor accuracy:**
→ Increase `min_segment_duration_ms` or adjust `similarity_threshold`

## Related Documentation

- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
- [Adaptive Quality Service](./adaptive-quality-service.md)
- [FHIR Streaming Service](./fhir-streaming-service.md)
