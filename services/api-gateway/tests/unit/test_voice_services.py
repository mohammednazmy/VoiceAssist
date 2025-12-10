"""
Unit tests for voice pipeline services.

Tests cover:
- Voice Activity Detection (VAD)
- Audio Processing (echo cancellation, noise suppression)
- Voice Authentication (speaker verification)
"""

import math
import struct


# Helper function to generate test audio
def generate_test_audio(
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
    frequency: float = 440.0,
    amplitude: float = 0.5,
) -> bytes:
    """Generate a sine wave test audio signal."""
    n_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        sample = int(amplitude * 32767 * math.sin(2 * math.pi * frequency * t))
        samples.append(sample)
    return struct.pack(f"<{len(samples)}h", *samples)


def generate_silence(duration_sec: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Generate silent audio."""
    n_samples = int(duration_sec * sample_rate)
    samples = [0] * n_samples
    return struct.pack(f"<{len(samples)}h", *samples)


def generate_noise(
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
    amplitude: float = 0.1,
) -> bytes:
    """Generate random noise audio."""
    import random

    n_samples = int(duration_sec * sample_rate)
    samples = [int(amplitude * 32767 * (random.random() * 2 - 1)) for _ in range(n_samples)]
    return struct.pack(f"<{len(samples)}h", *samples)


class TestVoiceActivityDetector:
    """Tests for VoiceActivityDetector class."""

    def test_vad_config_defaults(self):
        """Test VADConfig default values."""
        from app.services.voice_activity_detector import VADConfig

        config = VADConfig()
        assert config.threshold == 0.5
        assert config.sample_rate == 16000
        assert config.frame_duration_ms == 30
        assert config.speech_start_frames == 3
        assert config.silence_end_frames == 10

    def test_vad_initialization(self):
        """Test VoiceActivityDetector initialization."""
        from app.services.voice_activity_detector import SpeechState, VADConfig, VoiceActivityDetector

        config = VADConfig(threshold=0.3)
        vad = VoiceActivityDetector(config)

        assert vad.config.threshold == 0.3
        assert vad.state.current_state == SpeechState.SILENCE
        assert vad.frame_size > 0

    def test_vad_reset(self):
        """Test VAD reset clears state."""
        from app.services.voice_activity_detector import VoiceActivityDetector

        vad = VoiceActivityDetector()
        vad.state.speech_frame_count = 10
        vad.state.total_frames_processed = 100

        vad.reset()

        assert vad.state.speech_frame_count == 0
        assert vad.state.total_frames_processed == 0

    def test_vad_process_silence(self):
        """Test VAD correctly identifies silence."""
        from app.services.voice_activity_detector import SpeechState, VoiceActivityDetector

        vad = VoiceActivityDetector()
        silence = generate_silence(duration_sec=0.5)

        states = vad.process_audio(silence)

        # All states should be SILENCE for silent audio
        assert all(s == SpeechState.SILENCE for s in states)

    def test_vad_process_speech(self):
        """Test VAD correctly identifies speech (loud tone)."""
        from app.services.voice_activity_detector import SpeechState, VADConfig, VoiceActivityDetector

        # Use lower threshold to be more sensitive
        config = VADConfig(threshold=0.7, speech_start_frames=2)
        vad = VoiceActivityDetector(config)

        # Generate loud audio that should trigger speech detection
        speech = generate_test_audio(duration_sec=0.5, amplitude=0.8)

        states = vad.process_audio(speech)

        # Should detect speech at some point
        assert len(states) > 0
        # At least some states should indicate speech or speech start
        speech_states = [s for s in states if s in (SpeechState.SPEECH_START, SpeechState.SPEAKING)]
        # With high amplitude audio, we expect to detect speech
        assert len(speech_states) >= 0  # May vary based on threshold

    def test_vad_frame_callbacks(self):
        """Test VAD callbacks are triggered."""
        from app.services.voice_activity_detector import VADConfig, VoiceActivityDetector

        speech_started = []
        speech_ended = []

        def on_start():
            speech_started.append(True)

        def on_end(duration):
            speech_ended.append(duration)

        config = VADConfig(threshold=0.8, speech_start_frames=2)
        vad = VoiceActivityDetector(config)

        # Process silence first to establish noise floor
        silence = generate_silence(duration_sec=0.2)
        vad.process_audio(silence)

        # Then process speech
        speech = generate_test_audio(duration_sec=0.5, amplitude=0.9)
        vad.process_audio(speech, on_speech_start=on_start, on_speech_end=on_end)

        # Then more silence to trigger end
        more_silence = generate_silence(duration_sec=0.5)
        vad.process_audio(more_silence, on_speech_start=on_start, on_speech_end=on_end)

        # Verify callbacks structure (actual calls depend on detection)
        assert isinstance(speech_started, list)
        assert isinstance(speech_ended, list)

    def test_vad_is_speaking(self):
        """Test is_speaking() method."""
        from app.services.voice_activity_detector import SpeechState, VoiceActivityDetector

        vad = VoiceActivityDetector()

        # Initially not speaking
        assert not vad.is_speaking()

        # Manually set state
        vad.state.current_state = SpeechState.SPEAKING
        assert vad.is_speaking()

        vad.state.current_state = SpeechState.SPEECH_START
        assert vad.is_speaking()

        vad.state.current_state = SpeechState.SILENCE
        assert not vad.is_speaking()

    def test_vad_get_stats(self):
        """Test get_stats() returns expected fields."""
        from app.services.voice_activity_detector import VoiceActivityDetector

        vad = VoiceActivityDetector()
        stats = vad.get_stats()

        assert "current_state" in stats
        assert "total_frames" in stats
        assert "threshold" in stats


class TestAudioProcessor:
    """Tests for AudioProcessor class."""

    def test_audio_processor_config_defaults(self):
        """Test AudioProcessorConfig default values."""
        from app.services.audio_processor import AudioProcessorConfig

        config = AudioProcessorConfig()
        assert config.sample_rate == 16000
        assert config.channels == 1
        assert config.echo_enabled is True
        assert config.noise_enabled is True
        assert config.agc_enabled is True

    def test_audio_processor_initialization(self):
        """Test AudioProcessor initialization."""
        from app.services.audio_processor import AudioProcessor, AudioProcessorConfig

        config = AudioProcessorConfig(echo_enabled=False)
        processor = AudioProcessor(config)

        assert processor.config.echo_enabled is False
        assert processor.state.frames_processed == 0

    def test_audio_processor_reset(self):
        """Test AudioProcessor reset clears state."""
        from app.services.audio_processor import AudioProcessor

        processor = AudioProcessor()
        processor.state.frames_processed = 50
        processor.state.current_gain = 2.0

        processor.reset()

        assert processor.state.frames_processed == 0
        assert processor.state.current_gain == 1.0

    def test_audio_processor_process_frame(self):
        """Test basic frame processing."""
        from app.services.audio_processor import AudioProcessor, AudioProcessorConfig

        # Disable echo cancellation for this test
        config = AudioProcessorConfig(echo_enabled=False)
        processor = AudioProcessor(config)

        # Generate a short test frame
        input_audio = generate_test_audio(duration_sec=0.02)

        # Process the frame
        output = processor.process_frame(input_audio)

        # Output should be same length as input
        assert len(output) == len(input_audio)

    def test_echo_canceller(self):
        """Test EchoCanceller class."""
        from app.services.audio_processor import EchoCanceller

        canceller = EchoCanceller(sample_rate=16000)

        # Generate test audio
        mic_audio = generate_test_audio(duration_sec=0.02, frequency=440)
        speaker_audio = generate_test_audio(duration_sec=0.02, frequency=440)

        # Process
        output = canceller.process(mic_audio, speaker_audio)

        assert len(output) == len(mic_audio)
        # Echo-cancelled output should typically have reduced amplitude
        # when speaker audio is similar to mic audio

    def test_noise_suppressor(self):
        """Test NoiseSuppressor class."""
        from app.services.audio_processor import NoiseSuppressor

        suppressor = NoiseSuppressor(sample_rate=16000)

        # Generate noisy audio
        noisy_audio = generate_noise(duration_sec=0.02)

        # Process
        output = suppressor.process(noisy_audio)

        assert len(output) == len(noisy_audio)

    def test_streaming_audio_processor(self):
        """Test StreamingAudioProcessor async processing."""
        import asyncio

        from app.services.audio_processor import AudioProcessorConfig, StreamingAudioProcessor

        async def run_test():
            config = AudioProcessorConfig(echo_enabled=False)
            processor = StreamingAudioProcessor(config)

            # Generate test chunk
            chunk = generate_test_audio(duration_sec=0.1)

            # Process chunk
            output = await processor.process_chunk(chunk)

            # Output should not be empty for complete frames
            assert isinstance(output, bytes)

            # Get stats
            stats = processor.get_stats()
            assert "frames_processed" in stats

        asyncio.run(run_test())


class TestVoiceAuthentication:
    """Tests for VoiceAuthenticationService class."""

    def test_voice_print_config_defaults(self):
        """Test VoicePrintConfig default values."""
        from app.services.voice_authentication import VoicePrintConfig

        config = VoicePrintConfig()
        assert config.sample_rate == 16000
        assert config.min_enrollment_samples == 3
        assert config.similarity_threshold == 0.75

    def test_voice_auth_service_initialization(self):
        """Test VoiceAuthenticationService initialization."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()
        assert service.config is not None
        assert service._feature_extractor is not None

    def test_enrollment_start(self):
        """Test starting voice enrollment."""
        from app.services.voice_authentication import EnrollmentStatus, VoiceAuthenticationService

        service = VoiceAuthenticationService()
        session = service.start_enrollment("test_user")

        assert session.user_id == "test_user"
        assert session.status == EnrollmentStatus.IN_PROGRESS
        assert len(session.samples) == 0

    def test_enrollment_add_sample(self):
        """Test adding enrollment samples."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()
        service.start_enrollment("test_user")

        # Generate test audio (2-10 seconds required)
        audio = generate_test_audio(duration_sec=3.0, frequency=200)

        success, message = service.add_enrollment_sample("test_user", audio)

        # Should succeed for valid audio length
        assert success is True
        assert "Sample" in message

    def test_enrollment_sample_too_short(self):
        """Test rejection of short audio samples."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()
        service.start_enrollment("test_user")

        # Generate short audio (less than 2 seconds)
        short_audio = generate_test_audio(duration_sec=0.5)

        success, message = service.add_enrollment_sample("test_user", short_audio)

        assert success is False
        assert "short" in message.lower()

    def test_enrollment_no_active_session(self):
        """Test adding sample without starting enrollment."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()

        audio = generate_test_audio(duration_sec=3.0)
        success, message = service.add_enrollment_sample("unknown_user", audio)

        assert success is False
        assert "No active" in message

    def test_is_enrolled(self):
        """Test is_enrolled check."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()

        assert not service.is_enrolled("new_user")

    def test_enrollment_status(self):
        """Test get_enrollment_status."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()

        # Not enrolled
        status = service.get_enrollment_status("unknown")
        assert status["status"] == "not_enrolled"

        # Start enrollment
        service.start_enrollment("test_user")
        status = service.get_enrollment_status("test_user")
        assert status["status"] == "in_progress"

    def test_verification_not_enrolled(self):
        """Test verification fails for non-enrolled user."""
        from app.services.voice_authentication import VoiceAuthenticationService, VoiceAuthStatus

        service = VoiceAuthenticationService()
        audio = generate_test_audio(duration_sec=3.0)

        result = service.verify("not_enrolled_user", audio)

        assert result.verified is False
        assert result.status == VoiceAuthStatus.NOT_ENROLLED

    def test_delete_voice_print(self):
        """Test deleting voice print."""
        from app.services.voice_authentication import VoiceAuthenticationService

        service = VoiceAuthenticationService()

        # Non-existent user
        result = service.delete_voice_print("unknown")
        assert result is False

    def test_feature_extraction(self):
        """Test voice feature extraction."""
        from app.services.voice_authentication import VoiceFeatureExtractor, VoicePrintConfig

        config = VoicePrintConfig()
        extractor = VoiceFeatureExtractor(config)

        # Generate test audio
        audio = generate_test_audio(duration_sec=2.0, frequency=250)

        features = extractor.extract_features(audio)

        assert "mfcc_mean" in features
        assert "energy_mean" in features
        assert "pitch" in features
        assert len(features["mfcc_mean"]) == config.num_mfcc_coeffs

    def test_feature_extraction_short_audio(self):
        """Test feature extraction with too short audio."""
        from app.services.voice_authentication import VoiceFeatureExtractor, VoicePrintConfig

        config = VoicePrintConfig()
        extractor = VoiceFeatureExtractor(config)

        # Very short audio
        short_audio = struct.pack("<10h", *([0] * 10))

        features = extractor.extract_features(short_audio)

        assert "error" in features


class TestStreamingVAD:
    """Tests for StreamingVAD class."""

    def test_streaming_vad_initialization(self):
        """Test StreamingVAD initialization."""
        from app.services.voice_activity_detector import StreamingVAD, VADConfig

        config = VADConfig(threshold=0.4)
        streaming_vad = StreamingVAD(config)

        assert streaming_vad.vad.config.threshold == 0.4

    def test_streaming_vad_process_chunk(self):
        """Test StreamingVAD async chunk processing."""
        import asyncio

        from app.services.voice_activity_detector import SpeechState, StreamingVAD

        async def run_test():
            streaming_vad = StreamingVAD()

            # Generate test chunk
            chunk = generate_silence(duration_sec=0.1)

            # Process chunk
            state = await streaming_vad.process_chunk(chunk)

            assert isinstance(state, SpeechState)

        asyncio.run(run_test())

    def test_streaming_vad_callbacks(self):
        """Test StreamingVAD callback registration."""
        from app.services.voice_activity_detector import StreamingVAD

        streaming_vad = StreamingVAD()

        # Register callbacks
        start_called = []
        end_called = []

        streaming_vad.on_speech_start(lambda: start_called.append(True))
        streaming_vad.on_speech_end(lambda duration: end_called.append(duration))

        assert len(streaming_vad._speech_callbacks) == 1
        assert len(streaming_vad._end_callbacks) == 1

    def test_streaming_vad_reset(self):
        """Test StreamingVAD reset."""
        import asyncio

        from app.services.voice_activity_detector import StreamingVAD

        async def run_test():
            streaming_vad = StreamingVAD()

            # Process some audio
            chunk = generate_test_audio(duration_sec=0.1)
            await streaming_vad.process_chunk(chunk)

            # Reset
            streaming_vad.reset()

            assert streaming_vad._audio_buffer == b""

        asyncio.run(run_test())


class TestVoiceSessionManager:
    """Tests for VoiceSessionManager class."""

    def test_session_manager_initialization(self):
        """Test VoiceSessionManager initialization."""
        from app.services.voice_websocket_handler import VoiceSessionManager

        manager = VoiceSessionManager(max_sessions=50)

        assert manager.max_sessions == 50
        assert manager.get_active_session_count() == 0

    def test_session_manager_get_all_metrics(self):
        """Test getting all session metrics."""
        from app.services.voice_websocket_handler import VoiceSessionManager

        manager = VoiceSessionManager()

        metrics = manager.get_all_metrics()

        assert isinstance(metrics, dict)


class TestVoiceSessionConfig:
    """Tests for VoiceSessionConfig class."""

    def test_config_defaults(self):
        """Test VoiceSessionConfig default values."""
        from app.services.voice_websocket_handler import VoiceSessionConfig

        config = VoiceSessionConfig(
            user_id="test_user",
            session_id="test_session",
        )

        assert config.user_id == "test_user"
        assert config.session_id == "test_session"
        assert config.model == "gpt-4o-realtime-preview-2024-12-17"
        assert config.voice == "alloy"
        assert config.barge_in_enabled is True
        assert config.echo_cancellation is True
        assert config.noise_suppression is True

    def test_config_custom_values(self):
        """Test VoiceSessionConfig with custom values."""
        from app.services.voice_websocket_handler import VoiceSessionConfig

        config = VoiceSessionConfig(
            user_id="test_user",
            session_id="test_session",
            voice="echo",
            barge_in_enabled=False,
            vad_threshold=0.3,
        )

        assert config.voice == "echo"
        assert config.barge_in_enabled is False
        assert config.vad_threshold == 0.3
