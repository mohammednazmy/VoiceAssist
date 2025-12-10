/**
 * AudioWorklet Processor for Thinker-Talker Voice Pipeline
 *
 * Handles audio capture and PCM16 conversion for the Thinker-Talker pipeline.
 * This runs on the audio rendering thread for low-latency processing.
 *
 * Features:
 * - Converts float32 samples to PCM16
 * - Batches output into configurable chunk sizes
 * - Calculates RMS for voice activity monitoring
 * - Sends audio chunks to main thread via MessagePort
 *
 * Note: This processor is designed for use with a 16kHz AudioContext,
 * so no resampling is needed (unlike audio-capture-processor.js which
 * resamples from 48kHz to 24kHz).
 */

class ThinkerTalkerAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Get configuration from options
    const {
      targetChunkSize = 2048, // Default buffer size matching ScriptProcessor
    } = options.processorOptions || {};

    this.targetChunkSize = targetChunkSize;
    this.sampleBuffer = [];
    this.isActive = true;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isActive = false;
      } else if (event.data.type === "updateConfig") {
        if (event.data.targetChunkSize) {
          this.targetChunkSize = event.data.targetChunkSize;
        }
      }
    };

    // Signal ready
    this.port.postMessage({ type: "ready" });
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

    // Add input samples to buffer
    for (let i = 0; i < inputData.length; i++) {
      this.sampleBuffer.push(inputData[i]);
    }

    // Output chunks when we have enough samples
    while (this.sampleBuffer.length >= this.targetChunkSize) {
      const pcm16 = new Int16Array(this.targetChunkSize);
      const float32 = new Float32Array(this.targetChunkSize);

      // Calculate RMS and convert to PCM16
      let sumSquares = 0;
      for (let i = 0; i < this.targetChunkSize; i++) {
        const sample = this.sampleBuffer[i];
        float32[i] = sample;
        sumSquares += sample * sample;

        // Convert float [-1, 1] to PCM16
        const s = Math.max(-1, Math.min(1, sample));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Remove used samples from buffer
      this.sampleBuffer = this.sampleBuffer.slice(this.targetChunkSize);

      // Calculate RMS level
      const rms = Math.sqrt(sumSquares / this.targetChunkSize);

      // Send audio chunk to main thread
      // Transfer ownership of both buffers for efficiency
      this.port.postMessage(
        {
          type: "audio",
          pcm16: pcm16.buffer,
          float32: float32.buffer,
          rms: rms,
        },
        [pcm16.buffer, float32.buffer]
      );
    }

    return true; // Keep processor alive
  }
}

registerProcessor("thinker-talker-audio-processor", ThinkerTalkerAudioProcessor);
