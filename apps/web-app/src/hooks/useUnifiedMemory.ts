/**
 * useUnifiedMemory Hook
 * Cross-modal conversation memory for Voice Mode v4.1
 *
 * Provides unified memory across voice and text interactions.
 * Reference: docs/voice/unified-memory.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./useLanguage";

// ============================================================================
// Types
// ============================================================================

export type ConversationMode = "voice" | "text";

export interface MemoryEntry {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode: ConversationMode;
  language: string;
  timestamp: Date;
  sources?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
  metadata?: {
    latencyMs?: number;
    degradations?: string[];
    phiDetected?: boolean;
  };
}

export interface MemoryEvent {
  type: "mode_switch" | "language_switch" | "topic_change";
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface MemorySettings {
  enabled: boolean;
  retentionDays: number;
  crossSession: boolean;
  saveVoiceTranscripts: boolean;
  saveRagContext: boolean;
  anonymizePhi: boolean;
}

export interface UseUnifiedMemoryReturn {
  // State
  messages: MemoryEntry[];
  mode: ConversationMode;
  isLoading: boolean;

  // Actions
  addMessage: (
    entry: Omit<MemoryEntry, "id" | "timestamp">,
  ) => Promise<MemoryEntry>;
  switchMode: (newMode: ConversationMode) => Promise<void>;
  clearMemory: (scope?: "session" | "day" | "all") => Promise<void>;

  // Context
  getContext: (maxMessages?: number) => MemoryEntry[];
  getCurrentLanguage: () => string;
  getLanguageHistory: () => Array<{ from: string; to: string }>;

  // Settings
  settings: MemorySettings;
  updateSettings: (settings: Partial<MemorySettings>) => void;
}

// ============================================================================
// Local Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  SESSION_ID: "voiceassist_session_id",
  MESSAGES: "voiceassist_messages",
  EVENTS: "voiceassist_events",
  SETTINGS: "voiceassist_memory_settings",
  MODE: "voiceassist_mode",
};

// ============================================================================
// Utilities
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
  }
  return sessionId;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useUnifiedMemory(): UseUnifiedMemoryReturn {
  const { currentLanguage } = useLanguage();
  const _sessionId = useRef(getSessionId());

  // State
  const [messages, setMessages] = useState<MemoryEntry[]>([]);
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [mode, setMode] = useState<ConversationMode>("text");
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<MemorySettings>({
    enabled: true,
    retentionDays: 30,
    crossSession: true,
    saveVoiceTranscripts: true,
    saveRagContext: true,
    anonymizePhi: true,
  });

  // Load from storage on mount
  useEffect(() => {
    try {
      // Load messages
      const storedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages) as MemoryEntry[];
        // Convert timestamps back to Date objects
        const restored = parsed.map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(restored.slice(-50)); // Keep last 50 messages
      }

      // Load events
      const storedEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (storedEvents) {
        const parsed = JSON.parse(storedEvents) as MemoryEvent[];
        const restored = parsed.map((e) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
        setEvents(restored);
      }

      // Load mode
      const storedMode = localStorage.getItem(STORAGE_KEYS.MODE);
      if (storedMode === "voice" || storedMode === "text") {
        setMode(storedMode);
      }

      // Load settings
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (storedSettings) {
        setSettings({ ...settings, ...JSON.parse(storedSettings) });
      }
    } catch (error) {
      console.error("Failed to load memory from storage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Persist messages to storage
  useEffect(() => {
    if (!isLoading && settings.enabled) {
      try {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      } catch (error) {
        console.error("Failed to persist messages:", error);
      }
    }
  }, [messages, isLoading, settings.enabled]);

  // Persist events to storage
  useEffect(() => {
    if (!isLoading && settings.enabled) {
      try {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      } catch (error) {
        console.error("Failed to persist events:", error);
      }
    }
  }, [events, isLoading, settings.enabled]);

  // Persist mode to storage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.MODE, mode);
    }
  }, [mode, isLoading]);

  /**
   * Add a message to memory
   */
  const addMessage = useCallback(
    async (
      entry: Omit<MemoryEntry, "id" | "timestamp">,
    ): Promise<MemoryEntry> => {
      const newEntry: MemoryEntry = {
        ...entry,
        id: generateId(),
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, newEntry];
        // Keep last 50 messages
        return updated.slice(-50);
      });

      // Check for language switch
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.language !== entry.language) {
        const event: MemoryEvent = {
          type: "language_switch",
          timestamp: new Date(),
          data: {
            fromLanguage: lastMessage.language,
            toLanguage: entry.language,
            trigger: "auto_detected",
          },
        };
        setEvents((prev) => [...prev, event]);
      }

      return newEntry;
    },
    [messages],
  );

  /**
   * Switch between voice and text mode
   */
  const switchMode = useCallback(
    async (newMode: ConversationMode): Promise<void> => {
      if (newMode === mode) return;

      const event: MemoryEvent = {
        type: "mode_switch",
        timestamp: new Date(),
        data: {
          fromMode: mode,
          toMode: newMode,
        },
      };

      setEvents((prev) => [...prev, event]);
      setMode(newMode);
    },
    [mode],
  );

  /**
   * Clear memory
   */
  const clearMemory = useCallback(
    async (scope: "session" | "day" | "all" = "session"): Promise<void> => {
      if (scope === "all") {
        setMessages([]);
        setEvents([]);
        localStorage.removeItem(STORAGE_KEYS.MESSAGES);
        localStorage.removeItem(STORAGE_KEYS.EVENTS);
      } else if (scope === "day") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setMessages((prev) => prev.filter((m) => m.timestamp < today));
        setEvents((prev) => prev.filter((e) => e.timestamp < today));
      } else {
        // session - clear current session only
        setMessages([]);
        setEvents([]);
      }
    },
    [],
  );

  /**
   * Get context for LLM
   */
  const getContext = useCallback(
    (maxMessages: number = 10): MemoryEntry[] => {
      return messages.slice(-maxMessages);
    },
    [messages],
  );

  /**
   * Get current conversation language
   */
  const getCurrentLanguage = useCallback((): string => {
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.language || currentLanguage || "en";
  }, [messages, currentLanguage]);

  /**
   * Get language switch history
   */
  const getLanguageHistory = useCallback((): Array<{
    from: string;
    to: string;
  }> => {
    return events
      .filter((e) => e.type === "language_switch")
      .map((e) => ({
        from: e.data.fromLanguage as string,
        to: e.data.toLanguage as string,
      }));
  }, [events]);

  /**
   * Update settings
   */
  const updateSettings = useCallback(
    (newSettings: Partial<MemorySettings>): void => {
      setSettings((prev) => {
        const updated = { ...prev, ...newSettings };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
        return updated;
      });
    },
    [],
  );

  return {
    // State
    messages,
    mode,
    isLoading,

    // Actions
    addMessage,
    switchMode,
    clearMemory,

    // Context
    getContext,
    getCurrentLanguage,
    getLanguageHistory,

    // Settings
    settings,
    updateSettings,
  };
}

export default useUnifiedMemory;
