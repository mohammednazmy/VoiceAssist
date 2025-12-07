/**
 * Silero VAD Web Worker
 *
 * Performs ONNX inference for voice activity detection in a separate thread
 * to avoid blocking the main UI thread.
 *
 * Phase 1: Neural VAD Integration
 */

import * as ort from "onnxruntime-web";
import type {
  VADWorkerMessage,
  VADWorkerResponse,
  VADProcessResult,
} from "./types";

// ============================================================================
// Worker State
// ============================================================================

let session: ort.InferenceSession | null = null;
let state: Float32Array;
let sr: BigInt64Array;
let isInitialized = false;

// Silero VAD model state dimensions
const STATE_SIZE = 2 * 1 * 128; // 2 tensors, 1 batch, 128 hidden
const SAMPLE_RATE = 16000n;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the ONNX session with the Silero VAD model
 */
async function initializeModel(modelPath: string): Promise<void> {
  try {
    // Configure ONNX Runtime for web
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    // Create inference session
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    // Initialize model state (h and c tensors for LSTM)
    state = new Float32Array(STATE_SIZE).fill(0);
    sr = new BigInt64Array([SAMPLE_RATE]);

    isInitialized = true;

    const response: VADWorkerResponse = { type: "ready" };
    self.postMessage(response);

    console.warn("[VADWorker] Initialized with model:", modelPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const response: VADWorkerResponse = { type: "error", message };
    self.postMessage(response);
  }
}

// ============================================================================
// Inference
// ============================================================================

/**
 * Run VAD inference on an audio chunk
 */
async function processAudio(
  audioData: Float32Array,
  timestamp: number,
): Promise<void> {
  if (!session || !isInitialized) {
    const response: VADWorkerResponse = {
      type: "error",
      message: "Model not initialized",
    };
    self.postMessage(response);
    return;
  }

  try {
    const startTime = performance.now();

    // Prepare input tensors
    // Input shape: [1, window_size] - batch size 1, window_size samples
    const inputTensor = new ort.Tensor("float32", audioData, [
      1,
      audioData.length,
    ]);

    // State tensors: [2, 1, 128] - 2 (h, c), 1 batch, 128 hidden units
    const stateTensor = new ort.Tensor("float32", state, [2, 1, 128]);

    // Sample rate tensor: scalar int64
    const srTensor = new ort.Tensor("int64", sr, []);

    // Run inference
    const feeds = {
      input: inputTensor,
      state: stateTensor,
      sr: srTensor,
    };

    const results = await session.run(feeds);

    // Extract output
    const output = results.output.data as Float32Array;
    const probability = output[0];

    // Update state for next call (RNN state continuity)
    const newState = results.stateN.data as Float32Array;
    state.set(newState);

    const processingTime = performance.now() - startTime;

    // Send result back to main thread
    const result: VADProcessResult = {
      probability,
      isSpeech: false, // Will be determined by main thread based on threshold
      timestamp,
      processingTime,
    };

    const response: VADWorkerResponse = { type: "result", data: result };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inference error";
    const response: VADWorkerResponse = { type: "error", message };
    self.postMessage(response);
  }
}

/**
 * Reset the model state (for new audio session)
 */
function resetState(): void {
  if (state) {
    state.fill(0);
  }
}

/**
 * Destroy the session and free resources
 */
async function destroySession(): Promise<void> {
  if (session) {
    // ONNX Runtime Web sessions are automatically garbage collected
    session = null;
  }

  isInitialized = false;

  const response: VADWorkerResponse = { type: "destroyed" };
  self.postMessage(response);
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle messages from the main thread
 */
self.onmessage = async (event: MessageEvent<VADWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init":
      await initializeModel(message.modelPath);
      break;

    case "process":
      await processAudio(message.audioData, message.timestamp);
      break;

    case "reset":
      resetState();
      break;

    case "destroy":
      await destroySession();
      break;

    default:
      console.warn("[VADWorker] Unknown message type:", message);
  }
};

// ============================================================================
// Error Handler
// ============================================================================

self.onerror = (error) => {
  console.error("[VADWorker] Uncaught error:", error);
  const response: VADWorkerResponse = {
    type: "error",
    message: error.message || "Uncaught worker error",
  };
  self.postMessage(response);
};
