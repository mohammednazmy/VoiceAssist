/**
 * useTransportSession Hook
 *
 * Provides voice session management using the TransportManager abstraction.
 * This hook wraps the TransportManager and provides integration with:
 * - AECMonitor for echo cancellation feedback
 * - AdaptiveBitrateController for network-aware audio encoding
 * - Feature flag checks for gradual rollout
 *
 * Phase: WebSocket Advanced Features
 *
 * When enabled via feature flags, this hook can be used as a drop-in
 * replacement for direct WebSocket management in useThinkerTalkerSession.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceLog } from "../logger";
import {
  TransportManager,
  createTransportManager,
  createWebSocketTransport,
  createWebRTCTransport,
  type TransportManagerConfig,
  type TransportState,
  type TransportQuality,
  type TransportManagerEvent,
  BINARY_FRAME_TYPE,
} from "./transports";
import {
  AECMonitor,
  createAECMonitor,
  type AECMetrics,
  type AECState,
} from "./AECMonitor";
import {
  AdaptiveBitrateController,
  createAdaptiveBitrateController,
  type AudioQualityProfile,
  type AudioQualityLevel,
  type QualityChangeEvent,
  resampleAudio,
  floatToPcm16,
} from "./AdaptiveBitrateController";

// ============================================================================
// Types
// ============================================================================

/**
 * Transport session configuration
 */
export interface TransportSessionConfig {
  /** WebSocket URL */
  wsUrl: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Enable WebRTC fallback */
  enableWebRTC?: boolean;
  /** Prefer WebRTC over WebSocket */
  preferWebRTC?: boolean;
  /** Enable adaptive bitrate */
  enableAdaptiveBitrate?: boolean;
  /** Enable AEC feedback */
  enableAECFeedback?: boolean;
  /** Enable barge-in gating based on AEC */
  enableAECBargeGate?: boolean;
  /** ICE servers for WebRTC (if enabled) */
  iceServers?: RTCIceServer[];
}

/**
 * Transport session state
 */
export interface TransportSessionState {
  /** Current transport state */
  transportState: TransportState;
  /** Current transport type */
  transportType: "websocket" | "webrtc" | null;
  /** Whether connected and ready */
  isReady: boolean;
  /** Current transport quality */
  quality: TransportQuality | null;
  /** Current bitrate profile */
  bitrateProfile: AudioQualityProfile | null;
  /** Current quality level */
  qualityLevel: AudioQualityLevel;
  /** AEC state */
  aecState: AECState;
  /** AEC metrics */
  aecMetrics: AECMetrics | null;
  /** Whether barge-in is allowed based on AEC */
  bargeInAllowed: boolean;
}

/**
 * Transport session callbacks
 */
export interface TransportSessionCallbacks {
  /** Called when a JSON message is received */
  onMessage?: (message: Record<string, unknown>) => void;
  /** Called when binary audio is received */
  onAudioReceived?: (data: ArrayBuffer, sequence: number) => void;
  /** Called when transport state changes */
  onStateChange?: (state: TransportState) => void;
  /** Called when transport type changes (fallback) */
  onTransportSwitch?: (newType: "websocket" | "webrtc", reason: string) => void;
  /** Called when quality level changes */
  onQualityChange?: (
    level: AudioQualityLevel,
    profile: AudioQualityProfile,
  ) => void;
  /** Called when AEC state changes */
  onAECStateChange?: (state: AECState, metrics: AECMetrics) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Hook options
 */
export interface UseTransportSessionOptions {
  config: TransportSessionConfig;
  callbacks?: TransportSessionCallbacks;
  autoConnect?: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * useTransportSession Hook
 *
 * Manages voice transport with support for:
 * - WebSocket and WebRTC transports
 * - Adaptive bitrate based on network quality
 * - AEC monitoring and feedback
 *
 * @example
 * ```tsx
 * const {
 *   state,
 *   connect,
 *   disconnect,
 *   send,
 *   sendAudio,
 * } = useTransportSession({
 *   config: {
 *     wsUrl: "wss://api.example.com/voice",
 *     sessionId: "sess-123",
 *     userId: "user-456",
 *     enableWebRTC: true,
 *     enableAdaptiveBitrate: true,
 *     enableAECFeedback: true,
 *   },
 *   callbacks: {
 *     onMessage: (msg) => console.log("Message:", msg),
 *     onAudioReceived: (data) => playAudio(data),
 *   },
 * });
 * ```
 */
export function useTransportSession(options: UseTransportSessionOptions) {
  const { config, callbacks, autoConnect = false } = options;

  // State
  const [state, setState] = useState<TransportSessionState>({
    transportState: "disconnected",
    transportType: null,
    isReady: false,
    quality: null,
    bitrateProfile: null,
    qualityLevel: "high",
    aecState: "idle",
    aecMetrics: null,
    bargeInAllowed: true,
  });

  // Refs
  const transportManagerRef = useRef<TransportManager | null>(null);
  const aecMonitorRef = useRef<AECMonitor | null>(null);
  const bitrateControllerRef = useRef<AdaptiveBitrateController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);
  const audioSequenceRef = useRef(0);
  const isConnectingRef = useRef(false);

  /**
   * Initialize the transport manager
   */
  const initializeTransportManager = useCallback(() => {
    // Determine strategy based on config
    let strategy: "websocket-only" | "webrtc-prefer" | "adaptive" =
      "websocket-only";
    if (config.enableWebRTC) {
      strategy = config.preferWebRTC ? "webrtc-prefer" : "adaptive";
    }

    const managerConfig: TransportManagerConfig = {
      strategy,
      websocket: {
        wsUrl: config.wsUrl,
        sessionId: config.sessionId,
        userId: config.userId,
        conversationId: config.conversationId,
        connectionTimeoutMs: 10000,
        heartbeatIntervalMs: 15000,
        heartbeatTimeoutMs: 5000,
        maxReconnectAttempts: 5,
        reconnectDelayMs: 300,
        features: ["binary_audio", "message_batching"],
        protocolVersion: "2.0",
        binaryProtocol: true,
        messageBatching: true,
      },
      webrtc: config.enableWebRTC
        ? {
            wsUrl: config.wsUrl,
            sessionId: config.sessionId,
            userId: config.userId,
            conversationId: config.conversationId,
            connectionTimeoutMs: 10000,
            heartbeatIntervalMs: 15000,
            heartbeatTimeoutMs: 5000,
            maxReconnectAttempts: 3,
            reconnectDelayMs: 500,
            features: ["binary_audio"],
            iceServers: config.iceServers || [
              { urls: "stun:stun.l.google.com:19302" },
            ],
            dataChannelLabel: "voice",
            dataChannelOrdered: true,
          }
        : undefined,
      autoFallback: config.enableWebRTC ?? false,
      qualitySwitchThreshold: 50,
    };

    const manager = createTransportManager(managerConfig);

    // Register transport factories
    manager.registerWebSocketFactory((transportConfig) =>
      createWebSocketTransport({
        ...transportConfig,
        protocolVersion: "2.0",
        binaryProtocol: true,
        messageBatching: true,
      }),
    );

    if (config.enableWebRTC) {
      manager.registerWebRTCFactory((transportConfig) =>
        createWebRTCTransport({
          ...transportConfig,
          iceServers: config.iceServers || [
            { urls: "stun:stun.l.google.com:19302" },
          ],
          dataChannelLabel: "voice",
          dataChannelOrdered: true,
        }),
      );
    }

    return manager;
  }, [config]);

  /**
   * Initialize AEC monitor
   */
  const initializeAECMonitor = useCallback(() => {
    if (!config.enableAECFeedback) return null;

    const monitor = createAECMonitor({
      enabled: true,
      reportIntervalMs: 500,
      echoThresholdDb: -45,
      convergenceWindowSize: 10,
      convergenceVarianceThreshold: 3,
      debug: false,
    });

    return monitor;
  }, [config.enableAECFeedback]);

  /**
   * Initialize adaptive bitrate controller
   */
  const initializeBitrateController = useCallback(() => {
    if (!config.enableAdaptiveBitrate) return null;

    const controller = createAdaptiveBitrateController({
      enabled: true,
      aggressive: false,
      hysteresisCount: 3,
    });

    return controller;
  }, [config.enableAdaptiveBitrate]);

  /**
   * Set up event handlers
   */
  const setupEventHandlers = useCallback(
    (manager: TransportManager) => {
      // Handle state changes
      manager.on("stateChange", (event: TransportManagerEvent) => {
        const data = event.data as { state?: TransportState } | undefined;
        const newState = data?.state ?? "disconnected";
        setState((prev) => ({
          ...prev,
          transportState: newState,
          isReady: newState === "ready" || newState === "connected",
        }));
        callbacks?.onStateChange?.(newState);
      });

      // Handle connection
      manager.on("connected", (event: TransportManagerEvent) => {
        setState((prev) => ({
          ...prev,
          transportState: "connected",
          transportType: event.transport,
          isReady: true,
        }));
        voiceLog.debug(`[TransportSession] Connected via ${event.transport}`);
      });

      // Handle disconnection
      manager.on("disconnected", () => {
        setState((prev) => ({
          ...prev,
          transportState: "disconnected",
          isReady: false,
        }));
      });

      // Handle messages
      manager.on("message", (event: TransportManagerEvent) => {
        const message = event.data as Record<string, unknown>;
        callbacks?.onMessage?.(message);
      });

      // Handle binary audio
      manager.on("binary", (event: TransportManagerEvent) => {
        const { data, sequence } = event.data as {
          data: ArrayBuffer;
          sequence: number;
        };
        callbacks?.onAudioReceived?.(data, sequence);
      });

      // Handle transport switch
      manager.on("transportSwitch", (event: TransportManagerEvent) => {
        const previousType = event.previousTransport;
        const newType = event.transport;
        const reason = event.reason || "unknown";

        setState((prev) => ({
          ...prev,
          transportType: newType,
        }));

        voiceLog.info(
          `[TransportSession] Transport switched: ${previousType} -> ${newType} (${reason})`,
        );
        callbacks?.onTransportSwitch?.(newType, reason);
      });

      // Handle quality changes
      manager.on("qualityChange", (event: TransportManagerEvent) => {
        const quality = event.data as TransportQuality;
        setState((prev) => ({
          ...prev,
          quality,
        }));
        // The bitrate controller subscribes to network monitor automatically
        // via its start() method, so we don't need to update it manually here
      });

      // Handle errors
      manager.on("error", (event: TransportManagerEvent) => {
        if (event.error) {
          callbacks?.onError?.(event.error);
        }
      });
    },
    [callbacks],
  );

  /**
   * Set up AEC monitor handlers
   */
  const setupAECHandlers = useCallback(
    (monitor: AECMonitor) => {
      monitor.onAll((event) => {
        const metrics = event.metrics;

        setState((prev) => ({
          ...prev,
          aecState: metrics.aecState,
          aecMetrics: metrics,
          bargeInAllowed: config.enableAECBargeGate
            ? monitor.shouldAllowBargeIn()
            : true,
        }));

        if (event.type === "convergenceChange") {
          callbacks?.onAECStateChange?.(metrics.aecState, metrics);
        }
      });
    },
    [config.enableAECBargeGate, callbacks],
  );

  /**
   * Set up bitrate controller handlers
   */
  const setupBitrateHandlers = useCallback(
    (controller: AdaptiveBitrateController) => {
      controller.onQualityChange((event: QualityChangeEvent) => {
        setState((prev) => ({
          ...prev,
          qualityLevel: event.newLevel,
          bitrateProfile: event.newProfile,
        }));

        callbacks?.onQualityChange?.(event.newLevel, event.newProfile);

        voiceLog.info(
          `[TransportSession] Quality changed: ${event.previousLevel} -> ${event.newLevel} (${event.reason})`,
        );
      });
    },
    [callbacks],
  );

  /**
   * Connect to the voice server
   */
  const connect = useCallback(async () => {
    if (isConnectingRef.current || state.isReady) {
      voiceLog.warn("[TransportSession] Already connecting or connected");
      return;
    }

    isConnectingRef.current = true;

    try {
      // Initialize components
      const manager = initializeTransportManager();
      transportManagerRef.current = manager;

      const aecMonitor = initializeAECMonitor();
      aecMonitorRef.current = aecMonitor;

      const bitrateController = initializeBitrateController();
      bitrateControllerRef.current = bitrateController;

      // Set up event handlers
      setupEventHandlers(manager);

      if (aecMonitor) {
        setupAECHandlers(aecMonitor);
      }

      if (bitrateController) {
        setupBitrateHandlers(bitrateController);
        bitrateController.start();
      }

      // Connect transport
      await manager.connect();

      voiceLog.debug("[TransportSession] Connected successfully");
    } catch (error) {
      voiceLog.error("[TransportSession] Connection failed:", error);
      callbacks?.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      isConnectingRef.current = false;
    }
  }, [
    state.isReady,
    initializeTransportManager,
    initializeAECMonitor,
    initializeBitrateController,
    setupEventHandlers,
    setupAECHandlers,
    setupBitrateHandlers,
    callbacks,
  ]);

  /**
   * Disconnect from the voice server
   */
  const disconnect = useCallback(async () => {
    voiceLog.debug("[TransportSession] Disconnecting...");

    // Stop bitrate controller
    if (bitrateControllerRef.current) {
      bitrateControllerRef.current.stop();
      bitrateControllerRef.current = null;
    }

    // Stop AEC monitor
    if (aecMonitorRef.current) {
      aecMonitorRef.current.dispose();
      aecMonitorRef.current = null;
    }

    // Disconnect transport
    if (transportManagerRef.current) {
      await transportManagerRef.current.disconnect();
      transportManagerRef.current.dispose();
      transportManagerRef.current = null;
    }

    // Clean up audio
    if (inputStreamRef.current) {
      inputStreamRef.current.getTracks().forEach((track) => track.stop());
      inputStreamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset state
    setState({
      transportState: "disconnected",
      transportType: null,
      isReady: false,
      quality: null,
      bitrateProfile: null,
      qualityLevel: "high",
      aecState: "idle",
      aecMetrics: null,
      bargeInAllowed: true,
    });

    audioSequenceRef.current = 0;
  }, []);

  /**
   * Send a JSON message
   */
  const send = useCallback(async (message: Record<string, unknown>) => {
    if (!transportManagerRef.current) {
      throw new Error("Transport not connected");
    }

    await transportManagerRef.current.send(message);
  }, []);

  /**
   * Send audio data
   *
   * If adaptive bitrate is enabled, audio will be processed according
   * to the current quality profile. For now, this handles sample rate
   * conversion. Opus encoding would require Web Codecs API or a library
   * like opus-recorder.
   */
  const sendAudio = useCallback(async (audioData: ArrayBuffer) => {
    if (!transportManagerRef.current) {
      throw new Error("Transport not connected");
    }

    const sequence = audioSequenceRef.current++;

    // Process audio based on current quality profile if adaptive bitrate is enabled
    let processedData = audioData;
    if (bitrateControllerRef.current) {
      const profile = bitrateControllerRef.current.currentProfile;

      // If profile requires different sample rate, resample
      // Note: Input is assumed to be 16kHz Float32 audio
      if (profile.sampleRate !== 16000) {
        const inputFloat = new Float32Array(audioData);
        const resampled = resampleAudio(inputFloat, 16000, profile.sampleRate);
        const pcm16 = floatToPcm16(resampled);
        processedData = pcm16.buffer as ArrayBuffer;
      }

      // For Opus encoding, we would use Web Codecs API here
      // For now, we send PCM16 data regardless of profile codec
      // since the backend can handle transcoding if needed
    }

    await transportManagerRef.current.sendBinary(
      processedData,
      BINARY_FRAME_TYPE.AUDIO_INPUT,
      sequence,
    );
  }, []);

  /**
   * Initialize microphone for AEC monitoring
   */
  const initializeMicrophone = useCallback(async (stream: MediaStream) => {
    inputStreamRef.current = stream;

    if (aecMonitorRef.current) {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await aecMonitorRef.current.initialize(stream, audioContext);
      aecMonitorRef.current.start((metrics) => {
        // Metrics are reported via the AEC event handlers
        voiceLog.debug(
          `[TransportSession] AEC metrics: state=${metrics.aecState}, residual=${metrics.residualEchoDb.toFixed(1)}dB`,
        );
      });
    }
  }, []);

  /**
   * Notify AEC monitor that TTS output started
   */
  const notifyOutputStarted = useCallback(() => {
    aecMonitorRef.current?.notifyOutputStarted();
  }, []);

  /**
   * Notify AEC monitor that TTS output stopped
   */
  const notifyOutputStopped = useCallback(() => {
    aecMonitorRef.current?.notifyOutputStopped();
  }, []);

  /**
   * Get VAD sensitivity multiplier based on AEC state
   */
  const getVADSensitivityMultiplier = useCallback(() => {
    return aecMonitorRef.current?.getVADSensitivityMultiplier() ?? 1.0;
  }, []);

  /**
   * Force transport switch (for testing/debugging)
   */
  const forceTransportSwitch = useCallback(async (reason: string) => {
    if (!transportManagerRef.current) {
      throw new Error("Transport not connected");
    }

    const success = await transportManagerRef.current.switchToFallback(reason);
    if (!success) {
      voiceLog.warn("[TransportSession] Force switch failed");
    }
    return success;
  }, []);

  /**
   * Get current transport quality
   */
  const getQuality = useCallback(() => {
    return transportManagerRef.current?.getQuality() ?? null;
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    // State
    state,

    // Connection
    connect,
    disconnect,

    // Messaging
    send,
    sendAudio,

    // Microphone/AEC
    initializeMicrophone,
    notifyOutputStarted,
    notifyOutputStopped,
    getVADSensitivityMultiplier,

    // Quality/Transport
    getQuality,
    forceTransportSwitch,

    // Direct access to refs (for advanced use)
    transportManager: transportManagerRef.current,
    aecMonitor: aecMonitorRef.current,
    bitrateController: bitrateControllerRef.current,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create transport session options with feature flag defaults
 */
export function createTransportSessionConfig(
  wsUrl: string,
  sessionId: string,
  userId: string,
  featureFlags: {
    enableWebRTC?: boolean;
    preferWebRTC?: boolean;
    enableAdaptiveBitrate?: boolean;
    enableAECFeedback?: boolean;
    enableAECBargeGate?: boolean;
  } = {},
): TransportSessionConfig {
  return {
    wsUrl,
    sessionId,
    userId,
    enableWebRTC: featureFlags.enableWebRTC ?? false,
    preferWebRTC: featureFlags.preferWebRTC ?? false,
    enableAdaptiveBitrate: featureFlags.enableAdaptiveBitrate ?? false,
    enableAECFeedback: featureFlags.enableAECFeedback ?? false,
    enableAECBargeGate: featureFlags.enableAECBargeGate ?? false,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };
}

export default useTransportSession;
