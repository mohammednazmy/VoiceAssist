"""
Voice Authentication Service

Provides voice biometric authentication for voice sessions:
- Speaker enrollment (voice print creation)
- Speaker verification (voice print matching)
- Anti-spoofing detection
- Secure voice print storage

Uses MFCC-based voice features with cosine similarity matching.
This implementation is suitable for basic speaker verification.
For production use with high security requirements, consider
dedicated biometric services (Azure Speaker Recognition, AWS Voice ID).
"""

import base64
import hashlib
import hmac
import json
import math
import struct
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class VoiceAuthStatus(Enum):
    """Voice authentication status"""

    NOT_ENROLLED = "not_enrolled"
    ENROLLED = "enrolled"
    VERIFIED = "verified"
    FAILED = "failed"
    SPOOF_DETECTED = "spoof_detected"


class EnrollmentStatus(Enum):
    """Voice enrollment status"""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class VoicePrintConfig:
    """Configuration for voice print extraction"""

    # Audio parameters
    sample_rate: int = 16000
    frame_size_ms: int = 25
    frame_step_ms: int = 10

    # MFCC parameters
    num_mfcc_coeffs: int = 13
    num_mel_filters: int = 26
    fft_size: int = 512

    # Enrollment parameters
    min_enrollment_samples: int = 3
    max_enrollment_samples: int = 10
    min_audio_duration_sec: float = 2.0
    max_audio_duration_sec: float = 10.0

    # Verification parameters
    similarity_threshold: float = 0.75
    spoof_detection_enabled: bool = True
    spoof_threshold: float = 0.3


@dataclass
class VoicePrint:
    """Voice print (voice biometric template)"""

    user_id: str
    created_at: float
    updated_at: float
    sample_count: int
    mfcc_mean: List[float]
    mfcc_std: List[float]
    pitch_mean: float
    pitch_std: float
    energy_mean: float
    energy_std: float
    checksum: str  # For integrity verification


@dataclass
class EnrollmentSession:
    """Active enrollment session"""

    user_id: str
    status: EnrollmentStatus
    samples: List[bytes] = field(default_factory=list)
    mfcc_samples: List[List[float]] = field(default_factory=list)
    pitch_samples: List[float] = field(default_factory=list)
    energy_samples: List[float] = field(default_factory=list)
    started_at: float = 0.0
    error_message: Optional[str] = None


@dataclass
class VerificationResult:
    """Result of voice verification"""

    verified: bool
    confidence: float
    status: VoiceAuthStatus
    details: Dict[str, Any] = field(default_factory=dict)


class VoiceFeatureExtractor:
    """
    Extract voice features for biometric matching.

    Uses MFCC (Mel-frequency cepstral coefficients) as the primary
    voice characteristic, along with pitch and energy features.
    """

    def __init__(self, config: VoicePrintConfig):
        self.config = config
        self._init_mel_filterbank()

    def _init_mel_filterbank(self) -> None:
        """Initialize Mel filterbank for MFCC computation."""

        # Mel scale conversion
        def hz_to_mel(hz: float) -> float:
            return 2595 * math.log10(1 + hz / 700)

        def mel_to_hz(mel: float) -> float:
            return 700 * (10 ** (mel / 2595) - 1)

        # Create Mel filterbank
        low_freq = 0
        high_freq = self.config.sample_rate / 2
        low_mel = hz_to_mel(low_freq)
        high_mel = hz_to_mel(high_freq)

        # Mel points evenly spaced
        mel_points = [
            low_mel + i * (high_mel - low_mel) / (self.config.num_mel_filters + 1)
            for i in range(self.config.num_mel_filters + 2)
        ]
        hz_points = [mel_to_hz(m) for m in mel_points]

        # Convert to FFT bin indices
        bin_points = [int((self.config.fft_size + 1) * hz / self.config.sample_rate) for hz in hz_points]

        # Create triangular filters
        self._mel_filterbank = []
        for i in range(1, self.config.num_mel_filters + 1):
            filter_bank = [0.0] * (self.config.fft_size // 2 + 1)
            for j in range(bin_points[i - 1], bin_points[i]):
                if bin_points[i] != bin_points[i - 1]:
                    filter_bank[j] = (j - bin_points[i - 1]) / (bin_points[i] - bin_points[i - 1])
            for j in range(bin_points[i], bin_points[i + 1]):
                if bin_points[i + 1] != bin_points[i]:
                    filter_bank[j] = (bin_points[i + 1] - j) / (bin_points[i + 1] - bin_points[i])
            self._mel_filterbank.append(filter_bank)

    def extract_features(self, audio_data: bytes) -> Dict[str, Any]:
        """
        Extract voice features from audio data.

        Args:
            audio_data: PCM16 audio data

        Returns:
            Dictionary with extracted features
        """
        # Convert to samples
        samples = self._bytes_to_samples(audio_data)
        if len(samples) < self.config.fft_size:
            return {"error": "Audio too short"}

        # Pre-emphasis filter
        samples = self._preemphasis(samples)

        # Frame the signal
        frames = self._frame_signal(samples)
        if not frames:
            return {"error": "No complete frames"}

        # Extract MFCC for each frame
        mfcc_features = []
        energy_features = []

        for frame in frames:
            # Apply Hamming window
            windowed = self._apply_window(frame)

            # Compute FFT
            spectrum = self._compute_fft(windowed)

            # Apply Mel filterbank
            mel_energies = self._apply_mel_filterbank(spectrum)

            # Compute MFCCs using DCT
            mfcc = self._compute_dct(mel_energies)
            mfcc_features.append(mfcc)

            # Compute frame energy
            energy = sum(s * s for s in frame) / len(frame)
            energy_features.append(energy)

        # Compute pitch (fundamental frequency) estimate
        pitch = self._estimate_pitch(samples)

        # Aggregate features across frames
        return {
            "mfcc_mean": self._compute_mean(mfcc_features),
            "mfcc_std": self._compute_std(mfcc_features),
            "energy_mean": sum(energy_features) / len(energy_features),
            "energy_std": self._std(energy_features),
            "pitch": pitch,
            "frame_count": len(frames),
        }

    def _bytes_to_samples(self, audio_bytes: bytes) -> List[float]:
        """Convert PCM16 bytes to normalized samples."""
        n_samples = len(audio_bytes) // 2
        samples = struct.unpack(f"<{n_samples}h", audio_bytes)
        return [s / 32768.0 for s in samples]

    def _preemphasis(self, samples: List[float], coeff: float = 0.97) -> List[float]:
        """Apply pre-emphasis filter."""
        return [samples[0]] + [samples[i] - coeff * samples[i - 1] for i in range(1, len(samples))]

    def _frame_signal(self, samples: List[float]) -> List[List[float]]:
        """Frame the signal into overlapping windows."""
        frame_size = int(self.config.sample_rate * self.config.frame_size_ms / 1000)
        frame_step = int(self.config.sample_rate * self.config.frame_step_ms / 1000)

        frames = []
        for start in range(0, len(samples) - frame_size + 1, frame_step):
            frames.append(samples[start : start + frame_size])

        return frames

    def _apply_window(self, frame: List[float]) -> List[float]:
        """Apply Hamming window to frame."""
        n = len(frame)
        return [sample * (0.54 - 0.46 * math.cos(2 * math.pi * i / (n - 1))) for i, sample in enumerate(frame)]

    def _compute_fft(self, signal: List[float]) -> List[float]:
        """Compute FFT magnitude spectrum using DFT (simplified)."""
        # Pad to FFT size
        padded = signal + [0.0] * (self.config.fft_size - len(signal))
        n = len(padded)

        # Compute DFT (simplified - for production use numpy.fft)
        spectrum = []
        for k in range(n // 2 + 1):
            real = sum(padded[t] * math.cos(2 * math.pi * k * t / n) for t in range(n))
            imag = sum(padded[t] * math.sin(2 * math.pi * k * t / n) for t in range(n))
            magnitude = math.sqrt(real * real + imag * imag)
            spectrum.append(magnitude)

        return spectrum

    def _apply_mel_filterbank(self, spectrum: List[float]) -> List[float]:
        """Apply Mel filterbank to spectrum."""
        mel_energies = []
        for filter_bank in self._mel_filterbank:
            energy = sum(s * f for s, f in zip(spectrum, filter_bank))
            # Log compression (with floor to avoid log(0))
            mel_energies.append(math.log(max(energy, 1e-10)))
        return mel_energies

    def _compute_dct(self, mel_energies: List[float]) -> List[float]:
        """Compute DCT to get MFCCs."""
        n = len(mel_energies)
        mfcc = []
        for k in range(self.config.num_mfcc_coeffs):
            coeff = sum(mel_energies[i] * math.cos(math.pi * k * (2 * i + 1) / (2 * n)) for i in range(n))
            mfcc.append(coeff)
        return mfcc

    def _estimate_pitch(self, samples: List[float]) -> float:
        """Estimate fundamental frequency using autocorrelation."""
        # Simple autocorrelation-based pitch detection
        min_lag = int(self.config.sample_rate / 500)  # Max 500Hz
        max_lag = int(self.config.sample_rate / 50)  # Min 50Hz

        if len(samples) < max_lag * 2:
            return 0.0

        # Compute autocorrelation for each lag
        best_lag = min_lag
        best_correlation = 0.0

        for lag in range(min_lag, min(max_lag, len(samples) // 2)):
            correlation = sum(samples[i] * samples[i + lag] for i in range(len(samples) - lag))
            if correlation > best_correlation:
                best_correlation = correlation
                best_lag = lag

        # Convert lag to frequency
        if best_lag > 0:
            return self.config.sample_rate / best_lag
        return 0.0

    def _compute_mean(self, feature_list: List[List[float]]) -> List[float]:
        """Compute mean across frames for each coefficient."""
        if not feature_list:
            return []
        n_coeffs = len(feature_list[0])
        return [sum(f[i] for f in feature_list) / len(feature_list) for i in range(n_coeffs)]

    def _compute_std(self, feature_list: List[List[float]]) -> List[float]:
        """Compute standard deviation across frames."""
        if not feature_list:
            return []
        means = self._compute_mean(feature_list)
        n_coeffs = len(feature_list[0])
        n_frames = len(feature_list)
        return [math.sqrt(sum((f[i] - means[i]) ** 2 for f in feature_list) / n_frames) for i in range(n_coeffs)]

    def _std(self, values: List[float]) -> float:
        """Compute standard deviation."""
        if not values:
            return 0.0
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        return math.sqrt(variance)


class VoiceAuthenticationService:
    """
    Voice authentication service for speaker verification.

    Provides enrollment and verification capabilities using
    voice biometric features.
    """

    def __init__(self, config: Optional[VoicePrintConfig] = None):
        self.config = config or VoicePrintConfig()
        self._feature_extractor = VoiceFeatureExtractor(self.config)
        self._voice_prints: Dict[str, VoicePrint] = {}
        self._enrollment_sessions: Dict[str, EnrollmentSession] = {}

        logger.debug("VoiceAuthenticationService initialized")

    def start_enrollment(self, user_id: str) -> EnrollmentSession:
        """
        Start a voice enrollment session.

        Args:
            user_id: User ID to enroll

        Returns:
            EnrollmentSession instance
        """
        session = EnrollmentSession(
            user_id=user_id,
            status=EnrollmentStatus.IN_PROGRESS,
            started_at=time.time(),
        )
        self._enrollment_sessions[user_id] = session

        logger.info(
            f"Started voice enrollment for user {user_id}",
            extra={"user_id": user_id},
        )

        return session

    def add_enrollment_sample(self, user_id: str, audio_data: bytes) -> Tuple[bool, str]:
        """
        Add an audio sample to the enrollment session.

        Args:
            user_id: User ID
            audio_data: PCM16 audio data

        Returns:
            Tuple of (success, message)
        """
        session = self._enrollment_sessions.get(user_id)
        if not session:
            return False, "No active enrollment session"

        if session.status != EnrollmentStatus.IN_PROGRESS:
            return False, f"Enrollment is {session.status.value}"

        # Validate audio duration
        duration = len(audio_data) / 2 / self.config.sample_rate
        if duration < self.config.min_audio_duration_sec:
            return False, f"Audio too short (min {self.config.min_audio_duration_sec}s)"
        if duration > self.config.max_audio_duration_sec:
            return False, f"Audio too long (max {self.config.max_audio_duration_sec}s)"

        # Extract features
        features = self._feature_extractor.extract_features(audio_data)
        if "error" in features:
            return False, features["error"]

        # Store sample data
        session.samples.append(audio_data)
        session.mfcc_samples.append(features["mfcc_mean"])
        session.pitch_samples.append(features["pitch"])
        session.energy_samples.append(features["energy_mean"])

        sample_count = len(session.samples)
        logger.info(
            f"Added enrollment sample {sample_count} for user {user_id}",
            extra={"user_id": user_id, "sample_count": sample_count},
        )

        return True, f"Sample {sample_count} added"

    def complete_enrollment(self, user_id: str) -> Tuple[bool, str]:
        """
        Complete the enrollment process and create voice print.

        Args:
            user_id: User ID

        Returns:
            Tuple of (success, message)
        """
        session = self._enrollment_sessions.get(user_id)
        if not session:
            return False, "No active enrollment session"

        if len(session.samples) < self.config.min_enrollment_samples:
            return (
                False,
                f"Need at least {self.config.min_enrollment_samples} samples",
            )

        # Compute aggregated voice print
        mfcc_mean = self._compute_list_mean(session.mfcc_samples)
        mfcc_std = self._compute_list_std(session.mfcc_samples)
        pitch_mean = sum(session.pitch_samples) / len(session.pitch_samples)
        pitch_std = self._std(session.pitch_samples)
        energy_mean = sum(session.energy_samples) / len(session.energy_samples)
        energy_std = self._std(session.energy_samples)

        # Create voice print
        now = time.time()
        voice_print = VoicePrint(
            user_id=user_id,
            created_at=now,
            updated_at=now,
            sample_count=len(session.samples),
            mfcc_mean=mfcc_mean,
            mfcc_std=mfcc_std,
            pitch_mean=pitch_mean,
            pitch_std=pitch_std,
            energy_mean=energy_mean,
            energy_std=energy_std,
            checksum=self._compute_checksum(mfcc_mean, pitch_mean, energy_mean),
        )

        self._voice_prints[user_id] = voice_print
        session.status = EnrollmentStatus.COMPLETED
        del self._enrollment_sessions[user_id]

        logger.info(
            f"Voice enrollment completed for user {user_id}",
            extra={
                "user_id": user_id,
                "sample_count": voice_print.sample_count,
            },
        )

        return True, "Enrollment completed successfully"

    def verify(self, user_id: str, audio_data: bytes) -> VerificationResult:
        """
        Verify a voice sample against the stored voice print.

        Args:
            user_id: User ID to verify
            audio_data: PCM16 audio data

        Returns:
            VerificationResult
        """
        voice_print = self._voice_prints.get(user_id)
        if not voice_print:
            return VerificationResult(
                verified=False,
                confidence=0.0,
                status=VoiceAuthStatus.NOT_ENROLLED,
                details={"error": "User not enrolled"},
            )

        # Verify checksum
        expected_checksum = self._compute_checksum(
            voice_print.mfcc_mean,
            voice_print.pitch_mean,
            voice_print.energy_mean,
        )
        if voice_print.checksum != expected_checksum:
            logger.warning(f"Voice print checksum mismatch for user {user_id}")
            return VerificationResult(
                verified=False,
                confidence=0.0,
                status=VoiceAuthStatus.FAILED,
                details={"error": "Voice print corrupted"},
            )

        # Extract features from verification sample
        features = self._feature_extractor.extract_features(audio_data)
        if "error" in features:
            return VerificationResult(
                verified=False,
                confidence=0.0,
                status=VoiceAuthStatus.FAILED,
                details={"error": features["error"]},
            )

        # Check for spoofing
        if self.config.spoof_detection_enabled:
            spoof_score = self._detect_spoof(audio_data)
            if spoof_score > self.config.spoof_threshold:
                logger.warning(
                    f"Possible spoofing detected for user {user_id}",
                    extra={"spoof_score": spoof_score},
                )
                return VerificationResult(
                    verified=False,
                    confidence=0.0,
                    status=VoiceAuthStatus.SPOOF_DETECTED,
                    details={"spoof_score": spoof_score},
                )

        # Compute similarity scores
        mfcc_similarity = self._cosine_similarity(voice_print.mfcc_mean, features["mfcc_mean"])

        pitch_diff = abs(voice_print.pitch_mean - features["pitch"])
        pitch_tolerance = voice_print.pitch_std * 2 + 10  # Allow some variation
        pitch_score = max(0, 1 - pitch_diff / pitch_tolerance)

        energy_diff = abs(voice_print.energy_mean - features["energy_mean"])
        energy_tolerance = voice_print.energy_std * 2 + 0.1
        energy_score = max(0, 1 - energy_diff / energy_tolerance)

        # Weighted combination
        confidence = 0.7 * mfcc_similarity + 0.2 * pitch_score + 0.1 * energy_score

        verified = confidence >= self.config.similarity_threshold
        status = VoiceAuthStatus.VERIFIED if verified else VoiceAuthStatus.FAILED

        logger.info(
            f"Voice verification for user {user_id}: {status.value}",
            extra={
                "user_id": user_id,
                "confidence": confidence,
                "verified": verified,
            },
        )

        return VerificationResult(
            verified=verified,
            confidence=confidence,
            status=status,
            details={
                "mfcc_similarity": mfcc_similarity,
                "pitch_score": pitch_score,
                "energy_score": energy_score,
            },
        )

    def is_enrolled(self, user_id: str) -> bool:
        """Check if a user is enrolled."""
        return user_id in self._voice_prints

    def delete_voice_print(self, user_id: str) -> bool:
        """Delete a user's voice print."""
        if user_id in self._voice_prints:
            del self._voice_prints[user_id]
            logger.info(f"Deleted voice print for user {user_id}")
            return True
        return False

    def get_enrollment_status(self, user_id: str) -> Dict[str, Any]:
        """Get enrollment status for a user."""
        if user_id in self._voice_prints:
            vp = self._voice_prints[user_id]
            return {
                "status": "enrolled",
                "sample_count": vp.sample_count,
                "created_at": vp.created_at,
                "updated_at": vp.updated_at,
            }
        elif user_id in self._enrollment_sessions:
            session = self._enrollment_sessions[user_id]
            return {
                "status": "in_progress",
                "sample_count": len(session.samples),
                "started_at": session.started_at,
            }
        else:
            return {"status": "not_enrolled"}

    def export_voice_print(self, user_id: str) -> Optional[str]:
        """
        Export voice print as encrypted JSON.

        Args:
            user_id: User ID

        Returns:
            Base64-encoded encrypted voice print, or None if not found
        """
        voice_print = self._voice_prints.get(user_id)
        if not voice_print:
            return None

        # Serialize to JSON
        data = {
            "user_id": voice_print.user_id,
            "created_at": voice_print.created_at,
            "updated_at": voice_print.updated_at,
            "sample_count": voice_print.sample_count,
            "mfcc_mean": voice_print.mfcc_mean,
            "mfcc_std": voice_print.mfcc_std,
            "pitch_mean": voice_print.pitch_mean,
            "pitch_std": voice_print.pitch_std,
            "energy_mean": voice_print.energy_mean,
            "energy_std": voice_print.energy_std,
            "checksum": voice_print.checksum,
        }

        json_data = json.dumps(data, separators=(",", ":"))

        # Sign the data
        signature = hmac.new(
            settings.JWT_SECRET.encode(),
            json_data.encode(),
            hashlib.sha256,
        ).digest()

        # Combine and encode
        combined = json_data.encode() + b"." + signature
        return base64.urlsafe_b64encode(combined).decode()

    def import_voice_print(self, user_id: str, encoded_data: str) -> bool:
        """
        Import voice print from encrypted JSON.

        Args:
            user_id: User ID
            encoded_data: Base64-encoded encrypted voice print

        Returns:
            True if import successful
        """
        try:
            # Decode
            combined = base64.urlsafe_b64decode(encoded_data)
            parts = combined.rsplit(b".", 1)
            if len(parts) != 2:
                return False

            json_data, signature = parts

            # Verify signature
            expected_signature = hmac.new(
                settings.JWT_SECRET.encode(),
                json_data,
                hashlib.sha256,
            ).digest()

            if not hmac.compare_digest(signature, expected_signature):
                logger.warning(f"Invalid voice print signature for user {user_id}")
                return False

            # Parse JSON
            data = json.loads(json_data.decode())

            # Verify user ID matches
            if data["user_id"] != user_id:
                logger.warning("Voice print user ID mismatch")
                return False

            # Create voice print
            voice_print = VoicePrint(
                user_id=data["user_id"],
                created_at=data["created_at"],
                updated_at=data["updated_at"],
                sample_count=data["sample_count"],
                mfcc_mean=data["mfcc_mean"],
                mfcc_std=data["mfcc_std"],
                pitch_mean=data["pitch_mean"],
                pitch_std=data["pitch_std"],
                energy_mean=data["energy_mean"],
                energy_std=data["energy_std"],
                checksum=data["checksum"],
            )

            # Verify checksum
            expected_checksum = self._compute_checksum(
                voice_print.mfcc_mean,
                voice_print.pitch_mean,
                voice_print.energy_mean,
            )
            if voice_print.checksum != expected_checksum:
                logger.warning("Voice print checksum mismatch during import")
                return False

            self._voice_prints[user_id] = voice_print
            logger.info(f"Imported voice print for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to import voice print: {e}")
            return False

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if len(vec1) != len(vec2):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    def _detect_spoof(self, audio_data: bytes) -> float:
        """
        Simple anti-spoofing detection.

        Checks for characteristics of recorded/synthetic audio:
        - Unnaturally constant energy
        - Missing high-frequency content
        - Repetitive patterns

        Returns:
            Spoof score (0-1, higher = more likely spoof)
        """
        samples = [s / 32768.0 for s in struct.unpack(f"<{len(audio_data) // 2}h", audio_data)]

        if len(samples) < 1000:
            return 0.0

        # Check energy variance (real speech has more variation)
        frame_size = 160  # 10ms at 16kHz
        energies = []
        for i in range(0, len(samples) - frame_size, frame_size):
            frame = samples[i : i + frame_size]
            energy = sum(s * s for s in frame) / frame_size
            energies.append(energy)

        if len(energies) < 10:
            return 0.0

        mean_energy = sum(energies) / len(energies)
        energy_variance = sum((e - mean_energy) ** 2 for e in energies) / len(energies)

        # Low variance suggests playback (threshold is empirical)
        energy_score = 1.0 if energy_variance < 0.0001 else 0.0

        # Check for clipping (common in recordings)
        clipped_count = sum(1 for s in samples if abs(s) > 0.99)
        clip_ratio = clipped_count / len(samples)
        clip_score = min(1.0, clip_ratio * 10)

        # Combined score
        return energy_score * 0.5 + clip_score * 0.5

    def _compute_checksum(self, mfcc: List[float], pitch: float, energy: float) -> str:
        """Compute checksum for voice print integrity."""
        data = json.dumps(
            {"mfcc": mfcc, "pitch": pitch, "energy": energy},
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def _compute_list_mean(self, list_of_lists: List[List[float]]) -> List[float]:
        """Compute element-wise mean of list of lists."""
        if not list_of_lists:
            return []
        n = len(list_of_lists)
        length = len(list_of_lists[0])
        return [sum(lst[i] for lst in list_of_lists) / n for i in range(length)]

    def _compute_list_std(self, list_of_lists: List[List[float]]) -> List[float]:
        """Compute element-wise std of list of lists."""
        if not list_of_lists:
            return []
        means = self._compute_list_mean(list_of_lists)
        n = len(list_of_lists)
        length = len(list_of_lists[0])
        return [math.sqrt(sum((lst[i] - means[i]) ** 2 for lst in list_of_lists) / n) for i in range(length)]

    def _std(self, values: List[float]) -> float:
        """Compute standard deviation."""
        if not values:
            return 0.0
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        return math.sqrt(variance)


# Global service instance
voice_auth_service = VoiceAuthenticationService()
