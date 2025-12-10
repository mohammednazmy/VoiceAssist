/**
 * AEC AudioWorklet Processor
 *
 * Real-time echo cancellation using NLMS adaptive filtering.
 * Runs in the AudioWorklet thread for minimal latency.
 *
 * Phase 4: Advanced Audio Processing
 */

// ============================================================================
// NLMS Adaptive Filter (AudioWorklet version)
// ============================================================================

class NLMSFilter {
  constructor(filterLength, stepSize = 0.5) {
    this.filterLength = filterLength;
    this.stepSize = stepSize;
    this.epsilon = 1e-8;
    this.coefficients = new Float32Array(filterLength);
    this.inputBuffer = new Float32Array(filterLength);
    this.bufferIndex = 0;
    this.inputPower = 0;
    this.powerAlpha = 0.95;
  }

  /**
   * Filter the reference signal to estimate echo
   */
  filter(input) {
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      this.inputBuffer[this.bufferIndex] = input[i];

      let y = 0;
      for (let j = 0; j < this.filterLength; j++) {
        const bufIdx =
          (this.bufferIndex - j + this.filterLength) % this.filterLength;
        y += this.coefficients[j] * this.inputBuffer[bufIdx];
      }
      output[i] = y;

      this.bufferIndex = (this.bufferIndex + 1) % this.filterLength;
    }

    return output;
  }

  /**
   * Update coefficients using NLMS algorithm
   */
  update(reference, error) {
    // Update running power estimate
    for (let i = 0; i < reference.length; i++) {
      this.inputPower =
        this.powerAlpha * this.inputPower +
        (1 - this.powerAlpha) * reference[i] * reference[i];
    }

    // Normalized step size
    const normalizedStep =
      this.stepSize / (this.inputPower * this.filterLength + this.epsilon);

    // Update coefficients
    for (let i = 0; i < error.length; i++) {
      const e = error[i];
      for (let j = 0; j < this.filterLength; j++) {
        const refIdx =
          (this.bufferIndex - i - j + this.filterLength * 2) %
          this.filterLength;
        this.coefficients[j] += normalizedStep * e * this.inputBuffer[refIdx];
      }
    }
  }

  /**
   * Process microphone signal to remove echo
   */
  process(micSignal, speakerSignal) {
    const estimatedEcho = this.filter(speakerSignal);
    const output = new Float32Array(micSignal.length);

    for (let i = 0; i < micSignal.length; i++) {
      output[i] = micSignal[i] - estimatedEcho[i];
    }

    this.update(speakerSignal, output);
    return output;
  }

  reset() {
    this.coefficients.fill(0);
    this.inputBuffer.fill(0);
    this.bufferIndex = 0;
    this.inputPower = 0;
  }
}

// ============================================================================
// Speaker Reference Buffer
// ============================================================================

class SpeakerReferenceBuffer {
  constructor(maxSizeSeconds, sampleRate) {
    this.maxSize = Math.floor(maxSizeSeconds * sampleRate);
    this.buffer = new Float32Array(this.maxSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesInBuffer = 0;
  }

  write(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.maxSize;

      if (this.samplesInBuffer >= this.maxSize) {
        this.readIndex = (this.readIndex + 1) % this.maxSize;
      } else {
        this.samplesInBuffer++;
      }
    }
  }

  read(length) {
    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      if (this.samplesInBuffer > 0) {
        output[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.maxSize;
        this.samplesInBuffer--;
      } else {
        output[i] = 0;
      }
    }

    return output;
  }

  getLevel() {
    return this.samplesInBuffer / this.maxSize;
  }

  reset() {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesInBuffer = 0;
  }
}

// ============================================================================
// AEC Processor
// ============================================================================

class AECProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Configuration from processor options
    const opts = options?.processorOptions || {};
    this.filterLength = opts.filterLength || 512;
    this.stepSize = opts.stepSize || 0.5;
    this.sampleRate = opts.sampleRate || 16000;

    // Initialize components
    this.nlmsFilter = new NLMSFilter(this.filterLength, this.stepSize);
    this.speakerRef = new SpeakerReferenceBuffer(0.5, this.sampleRate);

    // State
    this.enabled = true;
    this.isProcessing = false;
    this.framesProcessed = 0;

    // Performance tracking
    this.avgProcessingTime = 0;

    // Statistics
    this.stats = {
      erle: 0,
      doubleTalk: false,
      inputPower: 0,
      outputPower: 0,
    };

    // Handle messages from main thread
    this.port.onmessage = (event) => this.handleMessage(event.data);

    // Send ready message
    this.port.postMessage({ type: "initialized" });
  }

  /**
   * Handle messages from main thread
   */
  handleMessage(message) {
    switch (message.type) {
      case "speaker_audio":
        // Receive speaker audio for reference
        this.speakerRef.write(message.samples);
        break;

      case "update_config":
        // Update configuration
        if (message.config) {
          if (message.config.enabled !== undefined) {
            this.enabled = message.config.enabled;
          }
          if (message.config.filterConfig) {
            const fc = message.config.filterConfig;
            if (fc.stepSize) {
              this.nlmsFilter.stepSize = fc.stepSize;
            }
          }
        }
        break;

      case "reset":
        this.nlmsFilter.reset();
        this.speakerRef.reset();
        this.framesProcessed = 0;
        break;

      case "get_state":
        this.port.postMessage({
          type: "state",
          state: {
            isActive: this.enabled,
            erle: this.stats.erle,
            doubleTalkDetected: this.stats.doubleTalk,
            framesProcessed: this.framesProcessed,
            avgProcessingTime: this.avgProcessingTime,
          },
        });
        break;
    }
  }

  /**
   * Calculate power of signal
   */
  calculatePower(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return sum / samples.length;
  }

  /**
   * Process audio frames
   */
  process(inputs, outputs) {
    // inputs[0] = microphone, inputs[1] = speaker reference (if connected)
    const micInput = inputs[0]?.[0];
    const speakerInput = inputs[1]?.[0];
    const output = outputs[0]?.[0];

    if (!micInput || !output) {
      return true; // Keep processor alive
    }

    // If speaker reference comes through input, add to buffer
    if (speakerInput && speakerInput.length > 0) {
      this.speakerRef.write(speakerInput);
    }

    if (!this.enabled) {
      // Pass through without processing
      output.set(micInput);
      return true;
    }

    const startTime = currentTime;

    // Get speaker reference
    const speakerRef = this.speakerRef.read(micInput.length);

    // Check if we have speaker audio to cancel
    const speakerLevel = this.speakerRef.getLevel();
    if (speakerLevel < 0.01) {
      // No speaker audio, pass through
      output.set(micInput);
      this.framesProcessed++;
      return true;
    }

    // Calculate input power for ERLE
    this.stats.inputPower = this.calculatePower(micInput);

    // Process through NLMS filter
    const processed = this.nlmsFilter.process(micInput, speakerRef);

    // Calculate output power
    this.stats.outputPower = this.calculatePower(processed);

    // Calculate ERLE (Echo Return Loss Enhancement)
    if (this.stats.inputPower > 0.0001) {
      const erle =
        10 *
        Math.log10(this.stats.inputPower / (this.stats.outputPower + 1e-10));
      this.stats.erle = 0.9 * this.stats.erle + 0.1 * erle;
    }

    // Simple double-talk detection based on error energy
    const errorEnergy = this.stats.outputPower;
    const refEnergy = this.calculatePower(speakerRef);
    this.stats.doubleTalk = errorEnergy > refEnergy * 0.5;

    // Copy processed audio to output
    output.set(processed);

    // Track processing time
    const processingTime = (currentTime - startTime) * 1000;
    this.avgProcessingTime =
      0.99 * this.avgProcessingTime + 0.01 * processingTime;

    this.framesProcessed++;

    // Periodically send state updates (every 100 frames)
    if (this.framesProcessed % 100 === 0) {
      this.port.postMessage({
        type: "state",
        state: {
          isActive: this.enabled,
          erle: this.stats.erle,
          doubleTalkDetected: this.stats.doubleTalk,
          framesProcessed: this.framesProcessed,
          avgProcessingTime: this.avgProcessingTime,
        },
      });
    }

    return true; // Keep processor alive
  }
}

// Register the processor
registerProcessor("aec-processor", AECProcessor);
