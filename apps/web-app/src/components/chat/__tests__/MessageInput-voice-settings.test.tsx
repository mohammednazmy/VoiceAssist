/**
 * MessageInput Voice Settings Integration Tests
 * Tests integration between MessageInput and voice settings store
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MessageInput } from "../MessageInput";
import { useVoiceSettingsStore } from "../../../stores/voiceSettingsStore";

// Mock the hooks and components that depend on browser APIs
vi.mock("../../../hooks/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: () => ({
    status: "disconnected",
    error: null,
    transcript: "",
    isSpeaking: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: false,
    isConnecting: false,
  }),
}));

vi.mock("../../../utils/waveform", () => ({
  WaveformVisualizer: class {
    constructor() {}
    disconnect() {}
  },
}));

describe("MessageInput Voice Settings Integration", () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    // Reset store to defaults
    useVoiceSettingsStore.setState({
      voice: "alloy",
      language: "en",
      vadSensitivity: 50,
      autoStartOnOpen: false,
      showStatusHints: true,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("auto-open via settings store", () => {
    it("should auto-open Voice Mode when autoStartOnOpen is true in store", async () => {
      // Enable auto-start in store
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);

      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          autoOpenRealtimeVoice={false}
        />,
      );

      // Voice Mode panel should be visible automatically
      await waitFor(() => {
        expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
      });
    });

    it("should not auto-open Voice Mode when autoStartOnOpen is false and autoOpenRealtimeVoice is false", async () => {
      // Ensure auto-start is disabled in store
      useVoiceSettingsStore.getState().setAutoStartOnOpen(false);

      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          autoOpenRealtimeVoice={false}
        />,
      );

      // Voice Mode panel should not be visible
      expect(screen.queryByTestId("voice-mode-panel")).not.toBeInTheDocument();
    });
  });

  describe("auto-open via prop", () => {
    it("should auto-open Voice Mode when autoOpenRealtimeVoice prop is true", async () => {
      // Store setting is false, but prop is true
      useVoiceSettingsStore.getState().setAutoStartOnOpen(false);

      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          autoOpenRealtimeVoice={true}
        />,
      );

      // Voice Mode panel should be visible due to prop
      await waitFor(() => {
        expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
      });
    });
  });

  describe("realtime voice disabled", () => {
    it("should not auto-open Voice Mode when enableRealtimeVoice is false even with autoStartOnOpen true", () => {
      // Enable auto-start in store
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);

      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={false}
          autoOpenRealtimeVoice={true}
        />,
      );

      // Voice Mode panel should not be visible because enableRealtimeVoice is false
      expect(screen.queryByTestId("voice-mode-panel")).not.toBeInTheDocument();
    });
  });

  describe("combined settings", () => {
    it("should open Voice Mode when both prop and store setting are true", async () => {
      // Both enabled
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);

      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          autoOpenRealtimeVoice={true}
        />,
      );

      // Voice Mode panel should be visible
      await waitFor(() => {
        expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
      });
    });

    it("should not show realtime voice button when enableRealtimeVoice is false", () => {
      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={false}
          enableVoiceInput={true}
        />,
      );

      // Realtime voice button should not be present
      expect(
        screen.queryByTestId("realtime-voice-mode-button"),
      ).not.toBeInTheDocument();
    });

    it("should show realtime voice button when enableRealtimeVoice is true", () => {
      render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          enableVoiceInput={true}
        />,
      );

      // Realtime voice button should be present
      expect(
        screen.getByTestId("realtime-voice-mode-button"),
      ).toBeInTheDocument();
    });
  });

  describe("store state changes", () => {
    it("should read autoStartOnOpen from store on mount", () => {
      // Set auto-start before render
      useVoiceSettingsStore.getState().setAutoStartOnOpen(true);

      const { rerender } = render(
        <MessageInput
          onSend={mockOnSend}
          enableRealtimeVoice={true}
          autoOpenRealtimeVoice={false}
        />,
      );

      // Panel should be visible because store had autoStartOnOpen=true
      expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
    });
  });
});

describe("VoiceModePanel settings integration", () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    useVoiceSettingsStore.setState({
      voice: "alloy",
      language: "en",
      vadSensitivity: 50,
      autoStartOnOpen: false,
      showStatusHints: true,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should display current voice and language in panel header", async () => {
    // Set custom voice and language
    useVoiceSettingsStore.getState().setVoice("nova");
    useVoiceSettingsStore.getState().setLanguage("es");

    render(
      <MessageInput
        onSend={mockOnSend}
        enableRealtimeVoice={true}
        autoOpenRealtimeVoice={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
    });

    // Check that voice/language are displayed
    expect(screen.getByText(/Nova/)).toBeInTheDocument();
    expect(screen.getByText(/Spanish/)).toBeInTheDocument();
  });

  it("should show settings button in Voice Mode panel", async () => {
    render(
      <MessageInput
        onSend={mockOnSend}
        enableRealtimeVoice={true}
        autoOpenRealtimeVoice={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
    });

    // Settings button should be present
    expect(screen.getByTestId("voice-settings-button")).toBeInTheDocument();
  });

  it("should show instructions when showStatusHints is true", async () => {
    useVoiceSettingsStore.getState().setShowStatusHints(true);

    render(
      <MessageInput
        onSend={mockOnSend}
        enableRealtimeVoice={true}
        autoOpenRealtimeVoice={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
    });

    // Instructions should be visible
    expect(screen.getByText(/How Voice Mode Works/)).toBeInTheDocument();
  });

  it("should hide instructions when showStatusHints is false", async () => {
    useVoiceSettingsStore.getState().setShowStatusHints(false);

    render(
      <MessageInput
        onSend={mockOnSend}
        enableRealtimeVoice={true}
        autoOpenRealtimeVoice={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("voice-mode-panel")).toBeInTheDocument();
    });

    // Instructions should not be visible
    expect(screen.queryByText(/How Voice Mode Works/)).not.toBeInTheDocument();
  });
});
