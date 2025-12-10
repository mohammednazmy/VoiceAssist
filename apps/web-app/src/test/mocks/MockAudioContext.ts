/**
 * MockAudioContext for Voice Feature Testing
 *
 * Comprehensive AudioContext mock with:
 * - AudioContext lifecycle (running, suspended, closed)
 * - AudioWorklet support
 * - GainNode, MediaStreamAudioSourceNode mocks
 * - AudioBuffer and AudioBufferSourceNode mocks
 * - Timing utilities (currentTime, baseLatency)
 *
 * Phase: Voice Feature Hardening
 */

import { vi } from "vitest";

// ============================================================================
// Types
// ============================================================================

export interface MockAudioContextOptions {
  /** Initial state (default: "running") */
  state?: AudioContextState;
  /** Sample rate (default: 48000) */
  sampleRate?: number;
  /** Base latency (default: 0.01) */
  baseLatency?: number;
  /** Output latency (default: 0.02) */
  outputLatency?: number;
}

// ============================================================================
// Mock AudioWorkletNode
// ============================================================================

export class MockAudioWorkletNode {
  port: MessagePort;
  parameters: Map<string, AudioParam> = new Map();
  numberOfInputs: number = 1;
  numberOfOutputs: number = 1;
  channelCount: number = 1;
  channelCountMode: ChannelCountMode = "explicit";
  channelInterpretation: ChannelInterpretation = "speakers";
  context: MockAudioContext;

  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _connected: boolean = false;

  onprocessorerror: ((event: Event) => void) | null = null;

  connect = vi.fn((destination: AudioNode | AudioParam): AudioNode | void => {
    this._connected = true;
    if (destination instanceof AudioNode) {
      return destination;
    }
  });

  disconnect = vi.fn(() => {
    this._connected = false;
  });

  constructor(
    context: MockAudioContext,
    name: string,
    _options?: AudioWorkletNodeOptions,
  ) {
    this.context = context;

    // Create a mock MessageChannel for port communication
    const channel = new MessageChannel();
    this.port = channel.port1;

    // Add common AudioWorklet parameters
    if (name === "audio-processor" || name === "voice-processor") {
      this.parameters.set(
        "gain",
        MockAudioContext.createMockAudioParam(1, 0, 1),
      );
    }
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
    if (event.type === "processorerror" && this.onprocessorerror) {
      this.onprocessorerror(event);
    }
    return !event.defaultPrevented;
  }

  /**
   * Simulate sending a message from the worklet processor
   */
  simulateMessage(data: unknown): void {
    const event = new MessageEvent("message", { data });
    this.port.dispatchEvent(event);
  }

  isConnected(): boolean {
    return this._connected;
  }
}

// ============================================================================
// Mock AudioBufferSourceNode
// ============================================================================

export class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop: boolean = false;
  loopStart: number = 0;
  loopEnd: number = 0;
  playbackRate: AudioParam;
  detune: AudioParam;

  context: MockAudioContext;
  numberOfInputs: number = 0;
  numberOfOutputs: number = 1;
  channelCount: number = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";

  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _playing: boolean = false;
  private _startTime: number = 0;

  onended: ((event: Event) => void) | null = null;

  start = vi.fn((when?: number, offset?: number, duration?: number) => {
    this._playing = true;
    this._startTime = when ?? this.context.currentTime;

    // Simulate playback end
    if (this.buffer && duration !== undefined) {
      setTimeout(() => {
        this._playing = false;
        const event = new Event("ended");
        this.dispatchEvent(event);
      }, duration * 1000);
    } else if (this.buffer) {
      setTimeout(
        () => {
          if (!this.loop) {
            this._playing = false;
            const event = new Event("ended");
            this.dispatchEvent(event);
          }
        },
        (this.buffer.duration - (offset ?? 0)) * 1000,
      );
    }
  });

  stop = vi.fn(() => {
    this._playing = false;
    const event = new Event("ended");
    this.dispatchEvent(event);
  });

  connect = vi.fn((destination: AudioNode | AudioParam): AudioNode | void => {
    if (destination instanceof AudioNode) {
      return destination;
    }
  });

  disconnect = vi.fn();

  constructor(context: MockAudioContext) {
    this.context = context;
    this.playbackRate = MockAudioContext.createMockAudioParam(1, 0.25, 4);
    this.detune = MockAudioContext.createMockAudioParam(0, -1200, 1200);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
    if (event.type === "ended" && this.onended) {
      this.onended(event);
    }
    return !event.defaultPrevented;
  }

  isPlaying(): boolean {
    return this._playing;
  }
}

// ============================================================================
// Mock GainNode
// ============================================================================

export class MockGainNode {
  gain: AudioParam;
  context: MockAudioContext;
  numberOfInputs: number = 1;
  numberOfOutputs: number = 1;
  channelCount: number = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";

  private _connected: boolean = false;

  connect = vi.fn((destination: AudioNode | AudioParam): AudioNode | void => {
    this._connected = true;
    if (destination instanceof AudioNode) {
      return destination;
    }
  });

  disconnect = vi.fn(() => {
    this._connected = false;
  });

  constructor(context: MockAudioContext) {
    this.context = context;
    this.gain = MockAudioContext.createMockAudioParam(
      1,
      0,
      3.4028234663852886e38,
    );
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();

  isConnected(): boolean {
    return this._connected;
  }
}

// ============================================================================
// Mock MediaStreamAudioSourceNode
// ============================================================================

export class MockMediaStreamAudioSourceNode {
  mediaStream: MediaStream;
  context: MockAudioContext;
  numberOfInputs: number = 0;
  numberOfOutputs: number = 1;
  channelCount: number = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";

  private _connected: boolean = false;

  connect = vi.fn((destination: AudioNode | AudioParam): AudioNode | void => {
    this._connected = true;
    if (destination instanceof AudioNode) {
      return destination;
    }
  });

  disconnect = vi.fn(() => {
    this._connected = false;
  });

  constructor(
    context: MockAudioContext,
    options: { mediaStream: MediaStream },
  ) {
    this.context = context;
    this.mediaStream = options.mediaStream;
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();

  isConnected(): boolean {
    return this._connected;
  }
}

// ============================================================================
// Mock AudioWorklet
// ============================================================================

export class MockAudioWorklet {
  addModule = vi.fn().mockResolvedValue(undefined);
}

// ============================================================================
// Mock AudioContext
// ============================================================================

export class MockAudioContext {
  // AudioContext properties
  state: AudioContextState;
  sampleRate: number;
  baseLatency: number;
  outputLatency: number;
  currentTime: number = 0;
  destination: AudioDestinationNode;
  audioWorklet: MockAudioWorklet;

  // Event handlers
  onstatechange: ((event: Event) => void) | null = null;

  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _createdNodes: Array<
    | MockAudioWorkletNode
    | MockAudioBufferSourceNode
    | MockGainNode
    | MockMediaStreamAudioSourceNode
  > = [];
  private _timeInterval: ReturnType<typeof setInterval> | null = null;
  private _options: MockAudioContextOptions;

  constructor(options: MockAudioContextOptions = {}) {
    this._options = options;
    this.state = options.state ?? "running";
    this.sampleRate = options.sampleRate ?? 48000;
    this.baseLatency = options.baseLatency ?? 0.01;
    this.outputLatency = options.outputLatency ?? 0.02;
    this.audioWorklet = new MockAudioWorklet();

    // Mock destination
    this.destination = {
      channelCount: 2,
      channelCountMode: "explicit" as ChannelCountMode,
      channelInterpretation: "speakers" as ChannelInterpretation,
      maxChannelCount: 2,
      numberOfInputs: 1,
      numberOfOutputs: 0,
      context: this as unknown as AudioContext,
      connect: vi.fn(),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as AudioDestinationNode;

    // Simulate time progression
    if (this.state === "running") {
      this._startTimeProgression();
    }
  }

  private _startTimeProgression(): void {
    if (this._timeInterval) return;
    const startTime = Date.now();
    this._timeInterval = setInterval(() => {
      if (this.state === "running") {
        this.currentTime = (Date.now() - startTime) / 1000;
      }
    }, 10);
  }

  private _stopTimeProgression(): void {
    if (this._timeInterval) {
      clearInterval(this._timeInterval);
      this._timeInterval = null;
    }
  }

  // Lifecycle methods
  resume = vi.fn(async () => {
    if (this.state !== "closed") {
      const prevState = this.state;
      this.state = "running";
      this._startTimeProgression();
      if (prevState !== "running") {
        this._dispatchStateChange();
      }
    }
  });

  suspend = vi.fn(async () => {
    if (this.state !== "closed") {
      this.state = "suspended";
      this._dispatchStateChange();
    }
  });

  close = vi.fn(async () => {
    this.state = "closed";
    this._stopTimeProgression();
    this._dispatchStateChange();
    // Clean up all created nodes
    this._createdNodes = [];
  });

  private _dispatchStateChange(): void {
    const event = new Event("statechange");
    if (this.onstatechange) {
      this.onstatechange(event);
    }
    const listeners = this._eventListeners.get("statechange");
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  // Node creation methods
  createGain(): MockGainNode {
    const node = new MockGainNode(this);
    this._createdNodes.push(node);
    return node;
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode(this);
    this._createdNodes.push(node);
    return node;
  }

  createMediaStreamSource(stream: MediaStream): MockMediaStreamAudioSourceNode {
    const node = new MockMediaStreamAudioSourceNode(this, {
      mediaStream: stream,
    });
    this._createdNodes.push(node);
    return node;
  }

  // Legacy ScriptProcessorNode (used by tests to avoid real AudioWorklet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createScriptProcessor(
    bufferSize = 0,
    numberOfInputChannels = 1,
    numberOfOutputChannels = 1,
  ): any {
    const inputBuffer = {
      numberOfChannels: numberOfInputChannels,
      getChannelData: vi.fn(() => new Float32Array(bufferSize || 1024).fill(0)),
    };

    const node: any = {
      context: this as unknown as AudioContext,
      bufferSize,
      numberOfInputs: numberOfInputChannels,
      numberOfOutputs: numberOfOutputChannels,
      inputBuffer,
      onaudioprocess: null,
      connect: vi.fn(() => node),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    this._createdNodes.push(node);
    return node;
  }

  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBuffer {
    const channelData = Array(numberOfChannels)
      .fill(null)
      .map(() => new Float32Array(length));

    return {
      sampleRate,
      length,
      duration: length / sampleRate,
      numberOfChannels,
      getChannelData: (channel: number) => channelData[channel],
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  }

  decodeAudioData = vi.fn(
    async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
      // Return a mock AudioBuffer based on the input size
      const estimatedSamples = Math.floor(arrayBuffer.byteLength / 2);
      return this.createBuffer(1, estimatedSamples, this.sampleRate);
    },
  );

  // AudioWorkletNode creation (needs audioWorklet.addModule first)
  createAudioWorkletNode(
    name: string,
    options?: AudioWorkletNodeOptions,
  ): MockAudioWorkletNode {
    const node = new MockAudioWorkletNode(this, name, options);
    this._createdNodes.push(node);
    return node;
  }

  // Event handling
  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
    return !event.defaultPrevented;
  }

  // ============================================================================
  // Test Helper Methods
  // ============================================================================

  /**
   * Get all created nodes for assertions
   */
  getCreatedNodes(): typeof this._createdNodes {
    return [...this._createdNodes];
  }

  /**
   * Get created nodes of a specific type
   */
  getCreatedNodesOfType<
    T extends
      | MockAudioWorkletNode
      | MockAudioBufferSourceNode
      | MockGainNode
      | MockMediaStreamAudioSourceNode,
  >(type: new (...args: unknown[]) => T): T[] {
    return this._createdNodes.filter((node): node is T => node instanceof type);
  }

  /**
   * Create a mock AudioParam
   */
  static createMockAudioParam(
    defaultValue: number,
    minValue: number,
    maxValue: number,
  ): AudioParam {
    let _value = defaultValue;
    return {
      value: _value,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "a-rate" as AutomationRate,
      setValueAtTime: vi.fn((value: number) => {
        _value = value;
        return {} as AudioParam;
      }),
      linearRampToValueAtTime: vi.fn(() => ({}) as AudioParam),
      exponentialRampToValueAtTime: vi.fn(() => ({}) as AudioParam),
      setTargetAtTime: vi.fn(() => ({}) as AudioParam),
      setValueCurveAtTime: vi.fn(() => ({}) as AudioParam),
      cancelScheduledValues: vi.fn(() => ({}) as AudioParam),
      cancelAndHoldAtTime: vi.fn(() => ({}) as AudioParam),
    } as unknown as AudioParam;
  }

  /**
   * Install MockAudioContext globally
   */
  static install(): void {
    (
      global as unknown as { AudioContext: typeof MockAudioContext }
    ).AudioContext = MockAudioContext;
    (
      global as unknown as { webkitAudioContext: typeof MockAudioContext }
    ).webkitAudioContext = MockAudioContext;
  }
}

export default MockAudioContext;
