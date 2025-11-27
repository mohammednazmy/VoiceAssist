/**
 * Voice Activity Detection (VAD) Utility
 * Detects when a user is speaking using audio analysis
 *
 * Uses a simple energy-based approach:
 * 1. Analyze audio frequency data from microphone
 * 2. Calculate RMS (Root Mean Square) energy
 * 3. Compare against threshold to detect speech
 */

export interface VADConfig {
  /** Minimum RMS energy level to consider as speech (0-1) */
  energyThreshold: number;
  /** Minimum duration of speech to trigger detection (ms) */
  minSpeechDuration: number;
  /** Maximum silence duration before stopping (ms) */
  maxSilenceDuration: number;
  /** Sample rate for audio analysis (Hz) */
  sampleRate: number;
  /** FFT size for frequency analysis */
  fftSize: number;
}

export const DEFAULT_VAD_CONFIG: VADConfig = {
  energyThreshold: 0.02, // 2% of max energy
  minSpeechDuration: 300, // 300ms
  maxSilenceDuration: 1500, // 1.5s
  sampleRate: 16000, // 16kHz (Whisper's native rate)
  fftSize: 2048,
};

export interface VADState {
  isSpeaking: boolean;
  energy: number;
  speechStartTime: number | null;
  lastSpeechTime: number | null;
}

export class VoiceActivityDetector {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private config: VADConfig;
  private state: VADState;
  private rafId: number | null = null;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;
  private onEnergyChange?: (energy: number) => void;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.fftSize;
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    this.state = {
      isSpeaking: false,
      energy: 0,
      speechStartTime: null,
      lastSpeechTime: null,
    };
  }

  /**
   * Connect VAD to an audio stream
   */
  async connect(stream: MediaStream): Promise<void> {
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    this.startDetection();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
  }

  /**
   * Set event handlers
   */
  on(
    event: "speechStart" | "speechEnd" | "energyChange",
    handler: (data?: any) => void,
  ): void {
    switch (event) {
      case "speechStart":
        this.onSpeechStart = handler;
        break;
      case "speechEnd":
        this.onSpeechEnd = handler;
        break;
      case "energyChange":
        this.onEnergyChange = handler;
        break;
    }
  }

  /**
   * Get current VAD state
   */
  getState(): VADState {
    return { ...this.state };
  }

  /**
   * Update VAD configuration
   */
  updateConfig(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start detection loop
   */
  private startDetection(): void {
    const detect = () => {
      // Get frequency data
      this.analyser.getByteFrequencyData(this.dataArray);

      // Calculate RMS energy
      const energy = this.calculateEnergy(this.dataArray);
      this.state.energy = energy;

      // Notify energy change
      this.onEnergyChange?.(energy);

      const now = Date.now();
      const isSpeech = energy > this.config.energyThreshold;

      if (isSpeech) {
        // Speech detected
        this.state.lastSpeechTime = now;

        if (!this.state.isSpeaking) {
          // Check if speech duration exceeds minimum
          if (this.state.speechStartTime === null) {
            this.state.speechStartTime = now;
          } else if (
            now - this.state.speechStartTime >=
            this.config.minSpeechDuration
          ) {
            // Trigger speech start
            this.state.isSpeaking = true;
            this.onSpeechStart?.();
          }
        }
      } else {
        // Silence detected
        if (this.state.isSpeaking && this.state.lastSpeechTime !== null) {
          // Check if silence duration exceeds maximum
          if (
            now - this.state.lastSpeechTime >=
            this.config.maxSilenceDuration
          ) {
            // Trigger speech end
            this.state.isSpeaking = false;
            this.state.speechStartTime = null;
            this.onSpeechEnd?.();
          }
        } else if (!this.state.isSpeaking) {
          // Reset speech start time if not enough speech detected
          this.state.speechStartTime = null;
        }
      }

      // Continue detection loop
      this.rafId = requestAnimationFrame(detect);
    };

    detect();
  }

  /**
   * Calculate RMS energy from frequency data
   * Returns value between 0 and 1
   */
  private calculateEnergy(dataArray: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] / 255; // Normalize to 0-1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return rms;
  }
}

/**
 * Test microphone access and permissions
 */
export async function testMicrophoneAccess(): Promise<{
  hasPermission: boolean;
  errorMessage?: string;
  devices?: MediaDeviceInfo[];
}> {
  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Get list of audio input devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(
      (device) => device.kind === "audioinput",
    );

    // Stop the test stream
    stream.getTracks().forEach((track) => track.stop());

    return {
      hasPermission: true,
      devices: audioInputs,
    };
  } catch (error: any) {
    let errorMessage = "Unknown microphone error";

    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      errorMessage =
        "Microphone permission denied. Please allow microphone access in your browser settings.";
    } else if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      errorMessage =
        "No microphone found. Please connect a microphone and try again.";
    } else if (
      error.name === "NotReadableError" ||
      error.name === "TrackStartError"
    ) {
      errorMessage = "Microphone is already in use by another application.";
    } else if (error.name === "OverconstrainedError") {
      errorMessage = "Microphone constraints could not be satisfied.";
    } else if (error.name === "SecurityError") {
      errorMessage =
        "Microphone access blocked due to security restrictions (HTTPS required).";
    }

    return {
      hasPermission: false,
      errorMessage,
    };
  }
}

/**
 * Check if getUserMedia is supported
 */
export function isGetUserMediaSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Get browser-specific constraints for optimal voice recording
 */
export function getOptimalAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000, // Whisper's native sample rate
    channelCount: 1, // Mono
  };
}
