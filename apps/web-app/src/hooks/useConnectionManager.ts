/**
 * Connection Manager Hook
 *
 * Manages the overall connection state for the unified chat/voice interface.
 * Coordinates between text chat WebSocket and voice mode WebSocket connections.
 *
 * Responsibilities:
 * - Track connection status for both channels
 * - Provide unified connection health indicator
 * - Handle reconnection logic
 * - Manage connection state transitions
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  useUnifiedConversationStore,
  type ConnectionState,
} from "../stores/unifiedConversationStore";
import { voiceLog } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export type ChannelType = "text" | "voice";

export type ChannelStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

export interface ChannelState {
  status: ChannelStatus;
  error: Error | null;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
}

export interface ConnectionHealth {
  overall: "healthy" | "degraded" | "unhealthy";
  text: ChannelStatus;
  voice: ChannelStatus;
  canSendText: boolean;
  canSendVoice: boolean;
}

export interface ConnectionManagerOptions {
  onTextConnectionChange?: (status: ChannelStatus) => void;
  onVoiceConnectionChange?: (status: ChannelStatus) => void;
  onHealthChange?: (health: ConnectionHealth) => void;
}

export interface ConnectionManagerReturn {
  // Channel states
  textChannel: ChannelState;
  voiceChannel: ChannelState;

  // Health
  health: ConnectionHealth;
  isHealthy: boolean;
  isDegraded: boolean;
  isUnhealthy: boolean;

  // Actions
  updateTextStatus: (status: ChannelStatus, error?: Error | null) => void;
  updateVoiceStatus: (status: ChannelStatus, error?: Error | null) => void;
  reconnectText: () => void;
  reconnectVoice: () => void;
  reconnectAll: () => void;
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ============================================================================
// Hook
// ============================================================================

export function useConnectionManager(
  options: ConnectionManagerOptions = {},
): ConnectionManagerReturn {
  const { onTextConnectionChange, onVoiceConnectionChange, onHealthChange } =
    options;

  // Store connection state
  const { setConnectionState } = useUnifiedConversationStore();

  // Local channel states
  const [textChannel, setTextChannel] = useState<ChannelState>({
    status: "disconnected",
    error: null,
    lastConnectedAt: null,
    reconnectAttempts: 0,
  });

  const [voiceChannel, setVoiceChannel] = useState<ChannelState>({
    status: "disconnected",
    error: null,
    lastConnectedAt: null,
    reconnectAttempts: 0,
  });

  // Calculate connection health
  const health = useMemo<ConnectionHealth>(() => {
    const textOk = textChannel.status === "connected";
    const voiceOk =
      voiceChannel.status === "connected" ||
      voiceChannel.status === "disconnected";
    const textConnecting =
      textChannel.status === "connecting" ||
      textChannel.status === "reconnecting";
    const voiceConnecting =
      voiceChannel.status === "connecting" ||
      voiceChannel.status === "reconnecting";

    let overall: ConnectionHealth["overall"];

    if (textOk && voiceOk) {
      overall = "healthy";
    } else if (
      textChannel.status === "error" &&
      voiceChannel.status === "error"
    ) {
      overall = "unhealthy";
    } else if (
      textChannel.status === "error" ||
      voiceChannel.status === "error"
    ) {
      overall = "degraded";
    } else if (textConnecting || voiceConnecting) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    return {
      overall,
      text: textChannel.status,
      voice: voiceChannel.status,
      canSendText: textChannel.status === "connected",
      canSendVoice: voiceChannel.status === "connected",
    };
  }, [textChannel.status, voiceChannel.status]);

  // Derived health states
  const isHealthy = health.overall === "healthy";
  const isDegraded = health.overall === "degraded";
  const isUnhealthy = health.overall === "unhealthy";

  // Update store connection state when health changes
  useEffect(() => {
    let state: ConnectionState;
    switch (health.overall) {
      case "healthy":
        state =
          textChannel.status === "connected" ? "connected" : "disconnected";
        break;
      case "degraded":
        state = "reconnecting";
        break;
      case "unhealthy":
        state = "error";
        break;
      default:
        state = "disconnected";
    }
    setConnectionState(state);
    onHealthChange?.(health);
  }, [health, textChannel.status, setConnectionState, onHealthChange]);

  // Update text channel status
  const updateTextStatus = useCallback(
    (status: ChannelStatus, error: Error | null = null) => {
      voiceLog.debug(`[ConnectionManager] Text channel: ${status}`);

      setTextChannel((prev) => ({
        ...prev,
        status,
        error: status === "error" ? error : null,
        lastConnectedAt:
          status === "connected" ? Date.now() : prev.lastConnectedAt,
        reconnectAttempts:
          status === "reconnecting"
            ? prev.reconnectAttempts + 1
            : status === "connected"
              ? 0
              : prev.reconnectAttempts,
      }));

      onTextConnectionChange?.(status);
    },
    [onTextConnectionChange],
  );

  // Update voice channel status
  const updateVoiceStatus = useCallback(
    (status: ChannelStatus, error: Error | null = null) => {
      voiceLog.debug(`[ConnectionManager] Voice channel: ${status}`);

      setVoiceChannel((prev) => ({
        ...prev,
        status,
        error: status === "error" ? error : null,
        lastConnectedAt:
          status === "connected" ? Date.now() : prev.lastConnectedAt,
        reconnectAttempts:
          status === "reconnecting"
            ? prev.reconnectAttempts + 1
            : status === "connected"
              ? 0
              : prev.reconnectAttempts,
      }));

      onVoiceConnectionChange?.(status);
    },
    [onVoiceConnectionChange],
  );

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback((attempts: number): number => {
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, attempts),
      MAX_RECONNECT_DELAY,
    );
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }, []);

  // Reconnect text channel
  const reconnectText = useCallback(() => {
    if (textChannel.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      voiceLog.error("[ConnectionManager] Max text reconnect attempts reached");
      updateTextStatus(
        "error",
        new Error("Max reconnection attempts exceeded"),
      );
      return;
    }

    const delay = getReconnectDelay(textChannel.reconnectAttempts);
    voiceLog.debug(
      `[ConnectionManager] Reconnecting text channel in ${delay}ms`,
    );
    updateTextStatus("reconnecting");

    // The actual reconnection is handled by useChatSession
    // This hook just tracks the state
  }, [textChannel.reconnectAttempts, getReconnectDelay, updateTextStatus]);

  // Reconnect voice channel
  const reconnectVoice = useCallback(() => {
    if (voiceChannel.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      voiceLog.error(
        "[ConnectionManager] Max voice reconnect attempts reached",
      );
      updateVoiceStatus(
        "error",
        new Error("Max reconnection attempts exceeded"),
      );
      return;
    }

    const delay = getReconnectDelay(voiceChannel.reconnectAttempts);
    voiceLog.debug(
      `[ConnectionManager] Reconnecting voice channel in ${delay}ms`,
    );
    updateVoiceStatus("reconnecting");

    // The actual reconnection is handled by useRealtimeVoiceSession
    // This hook just tracks the state
  }, [voiceChannel.reconnectAttempts, getReconnectDelay, updateVoiceStatus]);

  // Reconnect all channels
  const reconnectAll = useCallback(() => {
    voiceLog.debug("[ConnectionManager] Reconnecting all channels");

    if (
      textChannel.status === "error" ||
      textChannel.status === "disconnected"
    ) {
      reconnectText();
    }

    if (voiceChannel.status === "error") {
      reconnectVoice();
    }
  }, [textChannel.status, voiceChannel.status, reconnectText, reconnectVoice]);

  // Reset all connection state
  const reset = useCallback(() => {
    voiceLog.debug("[ConnectionManager] Resetting connection state");

    setTextChannel({
      status: "disconnected",
      error: null,
      lastConnectedAt: null,
      reconnectAttempts: 0,
    });

    setVoiceChannel({
      status: "disconnected",
      error: null,
      lastConnectedAt: null,
      reconnectAttempts: 0,
    });
  }, []);

  return {
    // Channel states
    textChannel,
    voiceChannel,

    // Health
    health,
    isHealthy,
    isDegraded,
    isUnhealthy,

    // Actions
    updateTextStatus,
    updateVoiceStatus,
    reconnectText,
    reconnectVoice,
    reconnectAll,
    reset,
  };
}

export default useConnectionManager;
