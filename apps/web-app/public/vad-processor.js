/**
 * VAD AudioWorklet Processor
 *
 * Runs in the audio rendering thread for real-time audio processing.
 * Collects audio samples and sends them to the main thread for VAD inference.
 *
 * Phase 1: Neural VAD Integration
 */

class VADProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Configuration from options
    this.windowSize = options.processorOptions?.windowSize || 512;
    this.sampleRate = options.processorOptions?.sampleRate || 16000;

    // Audio buffer
    this.buffer = new Float32Array(this.windowSize);
    this.bufferIndex = 0;

    // State
    this.isActive = true;

    // Listen for control messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isActive = false;
      } else if (event.data.type === "start") {
        this.isActive = true;
      } else if (event.data.type === "updateConfig") {
        this.windowSize = event.data.windowSize || this.windowSize;
      }
    };
  }

  /**
   * Process audio samples
   * Called for each audio block (typically 128 samples at a time)
   */
  process(inputs, outputs, parameters) {
    if (!this.isActive) {
      return true; // Keep processor alive but don't process
    }

    const input = inputs[0];
    if (!input || !input[0]) {
      return true; // No input, keep alive
    }

    const inputChannel = input[0];

    // Accumulate samples into buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex] = inputChannel[i];
      this.bufferIndex++;

      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.windowSize) {
        // Create a copy to send
        const audioData = this.buffer.slice(0);

        // Send to main thread
        this.port.postMessage({
          audioData: audioData,
          timestamp: currentTime * 1000, // Convert to milliseconds
        });

        // Reset buffer
        this.bufferIndex = 0;
      }
    }

    return true; // Keep the processor alive
  }
}

// Register the processor
registerProcessor("vad-processor", VADProcessor);
