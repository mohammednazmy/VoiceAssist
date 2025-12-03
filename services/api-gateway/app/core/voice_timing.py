"""
Voice pipeline timing utilities for per-stage latency tracking.

Provides a PipelineTimings class that tracks timing for each stage of the
voice processing pipeline, enabling detailed performance analysis and SLO monitoring.

Pipeline stages:
- audio_receive: Time to receive audio chunk from client
- vad_process: Voice Activity Detection processing time
- stt_transcribe: Speech-to-text transcription time
- llm_process: LLM inference time
- tts_synthesize: Text-to-speech synthesis time
- audio_send: Time to send audio chunk to client
"""

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class PipelineStage(str, Enum):
    """Voice pipeline processing stages."""

    AUDIO_RECEIVE = "audio_receive"
    VAD_PROCESS = "vad_process"
    STT_TRANSCRIBE = "stt_transcribe"
    LLM_PROCESS = "llm_process"
    TTS_SYNTHESIZE = "tts_synthesize"
    AUDIO_SEND = "audio_send"

    # Composite stages
    TTFA = "ttfa"  # Time to first audio (end-to-end)
    TOTAL = "total"  # Total pipeline time


@dataclass
class StageTimingRecord:
    """Records timing for a single stage execution."""

    stage: PipelineStage
    start_time: float
    end_time: Optional[float] = None
    duration_ms: Optional[float] = None
    metadata: Dict = field(default_factory=dict)

    def complete(self):
        """Mark the stage as complete and calculate duration."""
        if self.end_time is None:
            self.end_time = time.time()
            self.duration_ms = (self.end_time - self.start_time) * 1000


@dataclass
class PipelineTimings:
    """
    Tracks timing for all stages of a voice pipeline request.

    Usage:
        timings = PipelineTimings(session_id="abc123", request_id="req456")

        with timings.time_stage(PipelineStage.STT_TRANSCRIBE):
            transcript = await stt_client.transcribe(audio)

        with timings.time_stage(PipelineStage.LLM_PROCESS):
            response = await llm_client.generate(transcript)

        timings.record_ttfa()  # When first audio byte is ready
        timings.finalize()  # When response is complete

        # Get metrics
        print(timings.total_duration_ms)
        print(timings.stage_durations)
    """

    session_id: str
    request_id: str

    # Timing records
    stages: Dict[PipelineStage, StageTimingRecord] = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    ttfa_time: Optional[float] = None

    # Metadata
    user_id: Optional[str] = None
    transcript_length: Optional[int] = None
    response_length: Optional[int] = None

    def __post_init__(self):
        self._active_stage: Optional[PipelineStage] = None

    @contextmanager
    def time_stage(self, stage: PipelineStage, **metadata):
        """
        Context manager for timing a pipeline stage.

        Usage:
            with timings.time_stage(PipelineStage.STT_TRANSCRIBE, provider="deepgram"):
                result = await transcribe()
        """
        record = StageTimingRecord(
            stage=stage,
            start_time=time.time(),
            metadata=metadata,
        )
        self.stages[stage] = record
        self._active_stage = stage

        try:
            yield record
        finally:
            record.complete()
            self._active_stage = None
            self._emit_stage_metric(record)

    def start_stage(self, stage: PipelineStage, **metadata) -> StageTimingRecord:
        """
        Manually start timing a stage (for non-context-manager usage).

        Usage:
            record = timings.start_stage(PipelineStage.LLM_PROCESS)
            # ... do work ...
            timings.end_stage(record)
        """
        record = StageTimingRecord(
            stage=stage,
            start_time=time.time(),
            metadata=metadata,
        )
        self.stages[stage] = record
        self._active_stage = stage
        return record

    def end_stage(self, record: StageTimingRecord):
        """Complete a manually started stage."""
        record.complete()
        self._active_stage = None
        self._emit_stage_metric(record)

    def record_ttfa(self):
        """
        Record Time To First Audio.

        Call this when the first audio byte is ready to be sent to the client.
        """
        if self.ttfa_time is None:
            self.ttfa_time = time.time()
            ttfa_ms = (self.ttfa_time - self.start_time) * 1000

            # Record TTFA metric
            from app.core.metrics import voice_ttfa_seconds

            voice_ttfa_seconds.observe(ttfa_ms / 1000)

            logger.info(
                "voice_ttfa_recorded",
                session_id=self.session_id,
                request_id=self.request_id,
                ttfa_ms=round(ttfa_ms, 2),
            )

    def finalize(self):
        """
        Finalize timing when the pipeline request is complete.

        Records total duration and logs summary.
        """
        self.end_time = time.time()
        total_ms = self.total_duration_ms

        # Emit total metric
        from app.core.metrics import voice_pipeline_stage_latency_seconds

        voice_pipeline_stage_latency_seconds.labels(stage=PipelineStage.TOTAL.value).observe(total_ms / 1000)

        # Log summary
        logger.info(
            "voice_pipeline_complete",
            session_id=self.session_id,
            request_id=self.request_id,
            total_ms=round(total_ms, 2),
            ttfa_ms=round(self.ttfa_duration_ms, 2) if self.ttfa_duration_ms else None,
            stages=self.stage_durations,
        )

    def _emit_stage_metric(self, record: StageTimingRecord):
        """Emit Prometheus metric for stage timing."""
        from app.core.metrics import voice_pipeline_stage_latency_seconds

        if record.duration_ms is not None:
            voice_pipeline_stage_latency_seconds.labels(stage=record.stage.value).observe(record.duration_ms / 1000)

    @property
    def total_duration_ms(self) -> float:
        """Get total pipeline duration in milliseconds."""
        end = self.end_time or time.time()
        return (end - self.start_time) * 1000

    @property
    def ttfa_duration_ms(self) -> Optional[float]:
        """Get TTFA duration in milliseconds."""
        if self.ttfa_time:
            return (self.ttfa_time - self.start_time) * 1000
        return None

    @property
    def stage_durations(self) -> Dict[str, float]:
        """Get all stage durations as a dictionary."""
        return {stage.value: record.duration_ms for stage, record in self.stages.items() if record.duration_ms}

    def get_stage_duration(self, stage: PipelineStage) -> Optional[float]:
        """Get duration for a specific stage in milliseconds."""
        record = self.stages.get(stage)
        return record.duration_ms if record else None

    def to_dict(self) -> Dict:
        """Convert timings to dictionary for serialization."""
        return {
            "session_id": self.session_id,
            "request_id": self.request_id,
            "total_ms": round(self.total_duration_ms, 2),
            "ttfa_ms": (round(self.ttfa_duration_ms, 2) if self.ttfa_duration_ms else None),
            "stages": {k: round(v, 2) for k, v in self.stage_durations.items()},
            "transcript_length": self.transcript_length,
            "response_length": self.response_length,
        }


class PipelineTimingAccumulator:
    """
    Accumulates timing stats across multiple pipeline requests for session-level metrics.

    Usage:
        accumulator = PipelineTimingAccumulator(session_id="abc123")

        # For each request
        accumulator.add(pipeline_timings)

        # At end of session
        summary = accumulator.get_summary()
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.request_count = 0
        self.total_duration_ms = 0.0
        self.ttfa_durations: list[float] = []
        self.stage_totals: Dict[str, float] = {}
        self.stage_counts: Dict[str, int] = {}

    def add(self, timings: PipelineTimings):
        """Add a completed pipeline timing to the accumulator."""
        self.request_count += 1
        self.total_duration_ms += timings.total_duration_ms

        if timings.ttfa_duration_ms:
            self.ttfa_durations.append(timings.ttfa_duration_ms)

        for stage, duration_ms in timings.stage_durations.items():
            self.stage_totals[stage] = self.stage_totals.get(stage, 0) + duration_ms
            self.stage_counts[stage] = self.stage_counts.get(stage, 0) + 1

    def get_summary(self) -> Dict:
        """Get accumulated timing summary."""
        stage_averages = {
            stage: round(total / self.stage_counts[stage], 2) for stage, total in self.stage_totals.items()
        }

        ttfa_avg = round(sum(self.ttfa_durations) / len(self.ttfa_durations), 2) if self.ttfa_durations else None
        ttfa_p95 = (
            round(sorted(self.ttfa_durations)[int(len(self.ttfa_durations) * 0.95)], 2)
            if len(self.ttfa_durations) >= 20
            else None
        )

        return {
            "session_id": self.session_id,
            "request_count": self.request_count,
            "total_duration_ms": round(self.total_duration_ms, 2),
            "avg_duration_ms": (round(self.total_duration_ms / self.request_count, 2) if self.request_count else 0),
            "ttfa_avg_ms": ttfa_avg,
            "ttfa_p95_ms": ttfa_p95,
            "stage_averages_ms": stage_averages,
        }


def create_pipeline_timings(
    session_id: str,
    request_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> PipelineTimings:
    """
    Factory function to create a new PipelineTimings instance.

    Usage:
        timings = create_pipeline_timings(session_id="abc", request_id="req123")
    """
    import uuid

    return PipelineTimings(
        session_id=session_id,
        request_id=request_id or str(uuid.uuid4())[:8],
        user_id=user_id,
    )
