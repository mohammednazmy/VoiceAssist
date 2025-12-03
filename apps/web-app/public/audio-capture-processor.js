/**
 * AudioWorklet Processor for Voice Capture
 *
 * Handles audio capture, resampling, and PCM16 conversion for the Realtime API.
 * This runs on the audio rendering thread for low-latency processing.
 *
 * Features:
 * - Resamples from native sample rate (e.g., 48kHz) to 24kHz
 * - Converts float32 samples to PCM16
 * - Batches output into fixed-size chunks
 * - Sends audio chunks to main thread via MessagePort
 *
 * Phase 11 Update:
 * - Increased default chunk size from 128 to 512 samples (5.3ms -> 21.3ms at 24kHz)
 * - Reduces WebSocket message overhead significantly
 * - Expected latency improvement: 20-50ms
 *
 * Phase 11.1 Update: Local Echo Detection
 * - Circular reference buffer for recent playback audio
 * - Correlation-based echo detection
 * - Immediate suppression when echo detected (skip sending)
 * - Posts echo_detected events for metrics
 *
 * Voice Mode Overhaul: Aggressive Latency Optimization
 * - Reduced default chunk size from 512 to 256 samples (21.3ms -> 10.7ms at 24kHz)
 * - Trades slightly higher CPU/network overhead for lower latency
 * - Expected latency improvement: 10-20ms
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Get configuration from options
    // Voice Mode Overhaul: Reduced chunk size from 512 to 256 for lower latency
    // 256 samples at 24kHz = 10.7ms chunks (aggressive latency optimization)
    const {
      resampleRatio = 2,
      targetChunkSize = 256,
      echoDetectionEnabled = true,
      echoBufferMs = 300, // 300ms of reference audio
      echoCorrelationThreshold = 0.55, // Correlation threshold for echo detection
      echoCorrelationWindow = 256, // Window size for correlation computation
    } = options.processorOptions || {};

    this.resampleRatio = resampleRatio;
    this.targetChunkSize = targetChunkSize;
    this.resampleBuffer = [];
    this.isActive = true;

    // Phase 11.1: Echo detection settings
    this.echoDetectionEnabled = echoDetectionEnabled;
    this.echoCorrelationThreshold = echoCorrelationThreshold;
    this.echoCorrelationWindow = echoCorrelationWindow;

    // Circular reference buffer for playback audio (stores float32 at 24kHz)
    // Buffer size = echoBufferMs * 24 samples per ms
    this.referenceBufferSize = Math.floor((echoBufferMs * 24000) / 1000);
    this.referenceBuffer = new Float32Array(this.referenceBufferSize);
    this.referenceWriteIndex = 0;
    this.referenceLevel = 0; // Running average of reference audio level

    // Echo detection stats
    this.echoDetectedCount = 0;
    this.lastEchoReportTime = 0;
    this.isPlayingBack = false;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isActive = false;
      } else if (event.data.type === "updateConfig") {
        if (event.data.resampleRatio) {
          this.resampleRatio = event.data.resampleRatio;
        }
        if (event.data.echoDetectionEnabled !== undefined) {
          this.echoDetectionEnabled = event.data.echoDetectionEnabled;
        }
        if (event.data.echoCorrelationThreshold !== undefined) {
          this.echoCorrelationThreshold = event.data.echoCorrelationThreshold;
        }
      } else if (event.data.type === "playbackAudio") {
        // Receive playback audio from main thread for echo reference
        this._addPlaybackReference(event.data.samples);
      } else if (event.data.type === "playbackState") {
        // Track whether audio is currently playing
        this.isPlayingBack = event.data.isPlaying;
      }
    };

    // Signal ready
    this.port.postMessage({ type: "ready" });
  }

  /**
   * Add playback audio to the reference buffer for echo detection.
   * Called from main thread when TTS audio is being played.
   * @param {Float32Array} samples - Playback audio samples (24kHz float32)
   */
  _addPlaybackReference(samples) {
    if (!samples || samples.length === 0) return;

    // Calculate level of incoming reference audio
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
      // Write to circular buffer
      this.referenceBuffer[this.referenceWriteIndex] = samples[i];
      this.referenceWriteIndex =
        (this.referenceWriteIndex + 1) % this.referenceBufferSize;
    }

    // Update running reference level (exponential moving average)
    const rms = Math.sqrt(sumSquares / samples.length);
    this.referenceLevel = this.referenceLevel * 0.8 + rms * 0.2;
  }

  /**
   * Compute normalized cross-correlation between input and reference buffer.
   * Uses a sliding window to find the best match.
   * @param {Float32Array} input - Input audio chunk
   * @returns {number} Maximum correlation coefficient (0-1)
   */
  _computeEchoCorrelation(input) {
    if (this.referenceLevel < 0.001) {
      // No significant reference audio, no echo possible
      return 0;
    }

    const windowSize = Math.min(
      this.echoCorrelationWindow,
      input.length,
      this.referenceBufferSize,
    );

    // Compute input statistics
    let inputSum = 0;
    let inputSumSq = 0;
    for (let i = 0; i < windowSize; i++) {
      inputSum += input[i];
      inputSumSq += input[i] * input[i];
    }
    const inputMean = inputSum / windowSize;
    const inputStd = Math.sqrt(inputSumSq / windowSize - inputMean * inputMean);

    if (inputStd < 0.001) {
      // Input is essentially silent, no echo
      return 0;
    }

    let maxCorrelation = 0;

    // Search through reference buffer with a lag of up to 150ms (3600 samples at 24kHz)
    const maxLag = Math.min(3600, this.referenceBufferSize - windowSize);
    const lagStep = 4; // Check every 4 samples for speed

    for (let lag = 0; lag < maxLag; lag += lagStep) {
      // Get reference window starting at (writeIndex - lag - windowSize)
      const refStart =
        (this.referenceWriteIndex -
          lag -
          windowSize +
          this.referenceBufferSize) %
        this.referenceBufferSize;

      // Compute reference statistics and cross-correlation
      let refSum = 0;
      let refSumSq = 0;
      let crossSum = 0;

      for (let i = 0; i < windowSize; i++) {
        const refIdx = (refStart + i) % this.referenceBufferSize;
        const refVal = this.referenceBuffer[refIdx];
        refSum += refVal;
        refSumSq += refVal * refVal;
        crossSum += (input[i] - inputMean) * refVal;
      }

      const refMean = refSum / windowSize;
      const refStd = Math.sqrt(refSumSq / windowSize - refMean * refMean);

      if (refStd > 0.001) {
        // Normalized correlation
        const correlation =
          (crossSum / windowSize - inputMean * refMean) / (inputStd * refStd);
        maxCorrelation = Math.max(maxCorrelation, Math.abs(correlation));
      }
    }

    return maxCorrelation;
  }

  process(inputs, _outputs, _parameters) {
    // Return false to stop if marked inactive
    if (!this.isActive) {
      return false;
    }

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputData = input[0]; // First channel

    // Add input samples to resample buffer
    for (let i = 0; i < inputData.length; i++) {
      this.resampleBuffer.push(inputData[i]);
    }

    // Output resampled chunks at target rate (24kHz)
    while (
      this.resampleBuffer.length >=
      this.resampleRatio * this.targetChunkSize
    ) {
      // First, create float32 resampled chunk for echo detection
      const float32Chunk = new Float32Array(this.targetChunkSize);
      const pcm16 = new Int16Array(this.targetChunkSize);

      for (let i = 0; i < this.targetChunkSize; i++) {
        const srcIndex = i * this.resampleRatio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(
          srcIndexFloor + 1,
          this.resampleBuffer.length - 1,
        );
        const frac = srcIndex - srcIndexFloor;

        // Linear interpolation for resampling
        const sample =
          this.resampleBuffer[srcIndexFloor] * (1 - frac) +
          this.resampleBuffer[srcIndexCeil] * frac;

        float32Chunk[i] = sample;

        // Convert float [-1, 1] to PCM16
        const s = Math.max(-1, Math.min(1, sample));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Remove used samples from buffer
      const samplesUsed = Math.floor(this.targetChunkSize * this.resampleRatio);
      this.resampleBuffer = this.resampleBuffer.slice(samplesUsed);

      // Calculate audio level (RMS) for monitoring
      let sumSquares = 0;
      for (let i = 0; i < pcm16.length; i++) {
        sumSquares += pcm16[i] * pcm16[i];
      }
      const rms = Math.sqrt(sumSquares / pcm16.length);
      const dbLevel = 20 * Math.log10(rms / 32768);

      // Phase 11.1: Echo detection
      let echoDetected = false;
      let echoCorrelation = 0;

      if (this.echoDetectionEnabled && this.isPlayingBack) {
        // Only check for echo when audio is actively playing
        echoCorrelation = this._computeEchoCorrelation(float32Chunk);

        if (echoCorrelation > this.echoCorrelationThreshold) {
          echoDetected = true;
          this.echoDetectedCount++;

          // Report echo detection periodically (every 500ms)
          const now = currentTime * 1000; // currentTime is in seconds
          if (now - this.lastEchoReportTime > 500) {
            this.port.postMessage({
              type: "echo_detected",
              correlation: echoCorrelation,
              count: this.echoDetectedCount,
              threshold: this.echoCorrelationThreshold,
            });
            this.lastEchoReportTime = now;
          }
        }
      }

      // Send PCM16 chunk to main thread (or skip if echo detected)
      if (echoDetected) {
        // Skip sending this chunk - it's likely speaker feedback
        this.port.postMessage({
          type: "audio_suppressed",
          reason: "echo",
          correlation: echoCorrelation,
          dbLevel: dbLevel,
        });
      } else {
        this.port.postMessage(
          {
            type: "audio",
            pcm16: pcm16.buffer,
            dbLevel: dbLevel,
            echoCorrelation: echoCorrelation, // Include for monitoring
          },
          [pcm16.buffer],
        ); // Transfer ownership for efficiency
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
