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
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Get configuration from options
    const { resampleRatio = 2, targetChunkSize = 128 } =
      options.processorOptions || {};

    this.resampleRatio = resampleRatio;
    this.targetChunkSize = targetChunkSize;
    this.resampleBuffer = [];
    this.isActive = true;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isActive = false;
      } else if (event.data.type === "updateConfig") {
        if (event.data.resampleRatio) {
          this.resampleRatio = event.data.resampleRatio;
        }
      }
    };

    // Signal ready
    this.port.postMessage({ type: "ready" });
  }

  process(inputs, outputs, parameters) {
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

      // Send PCM16 chunk to main thread
      this.port.postMessage(
        {
          type: "audio",
          pcm16: pcm16.buffer,
          dbLevel: dbLevel,
        },
        [pcm16.buffer],
      ); // Transfer ownership for efficiency
    }

    return true; // Keep processor alive
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
