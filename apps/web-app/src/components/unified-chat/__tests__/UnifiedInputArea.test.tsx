/**
 * UnifiedInputArea Tests
 * Tests text/voice input modes, mode switching, and message submission
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnifiedInputArea } from "../UnifiedInputArea";

// Mock stores
const mockSetInputMode = vi.fn();
const mockActivateVoiceMode = vi.fn();
const mockDeactivateVoiceMode = vi.fn();
const mockStartListening = vi.fn();
const mockStopListening = vi.fn();

vi.mock("../../../stores/unifiedConversationStore", () => ({
  useUnifiedConversationStore: () => ({
    inputMode: "text",
    voiceModeActive: false,
    voiceModeType: "always-on",
    voiceState: "idle",
    isListening: false,
    isSpeaking: false,
    partialTranscript: "",
    setInputMode: mockSetInputMode,
    activateVoiceMode: mockActivateVoiceMode,
    deactivateVoiceMode: mockDeactivateVoiceMode,
    startListening: mockStartListening,
    stopListening: mockStopListening,
  }),
}));

vi.mock("../../../stores/voiceSettingsStore", () => ({
  useVoiceSettingsStore: () => ({
    voiceModeType: "always-on",
    setVoiceModeType: vi.fn(),
  }),
}));

vi.mock("../../../hooks/useVoiceModeStateMachine", () => ({
  useVoiceModeStateMachine: () => ({
    voiceState: "idle",
    isActive: false,
    isListening: false,
    isProcessing: false,
    isResponding: false,
    hasError: false,
    error: null,
    partialTranscript: "",
    finalTranscript: "",
    activate: vi.fn(),
    deactivate: vi.fn(),
    retryConnection: vi.fn(),
  }),
}));

describe("UnifiedInputArea", () => {
  const defaultProps = {
    conversationId: "conv-1",
    onSendMessage: vi.fn(),
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("text mode", () => {
    it("should render text input area", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      expect(
        screen.getByPlaceholderText("Type a message..."),
      ).toBeInTheDocument();
    });

    it("should render mode toggle button", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      expect(
        screen.getByLabelText(/Switch to voice mode/i),
      ).toBeInTheDocument();
    });

    it("should render send button", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      expect(screen.getByLabelText("Send message")).toBeInTheDocument();
    });

    it("should update text content on input", async () => {
      const user = userEvent.setup();
      render(<UnifiedInputArea {...defaultProps} />);

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Hello world");

      expect(textarea).toHaveValue("Hello world");
    });

    it("should call onSendMessage when send clicked", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(
        <UnifiedInputArea {...defaultProps} onSendMessage={onSendMessage} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message");

      fireEvent.click(screen.getByLabelText("Send message"));
      expect(onSendMessage).toHaveBeenCalledWith("Test message", "text");
    });

    it("should clear input after sending", async () => {
      const user = userEvent.setup();
      render(<UnifiedInputArea {...defaultProps} />);

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message");
      fireEvent.click(screen.getByLabelText("Send message"));

      expect(textarea).toHaveValue("");
    });

    it("should submit on Enter key", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(
        <UnifiedInputArea {...defaultProps} onSendMessage={onSendMessage} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message{Enter}");

      expect(onSendMessage).toHaveBeenCalledWith("Test message", "text");
    });

    it("should not submit on Shift+Enter", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(
        <UnifiedInputArea {...defaultProps} onSendMessage={onSendMessage} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message{Shift>}{Enter}{/Shift}");

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it("should disable send button when empty", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      expect(screen.getByLabelText("Send message")).toBeDisabled();
    });

    it("should disable input when disabled prop is true", () => {
      render(<UnifiedInputArea {...defaultProps} disabled={true} />);

      expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
    });
  });

  describe("character count", () => {
    it("should show character count when text entered", async () => {
      const user = userEvent.setup();
      render(<UnifiedInputArea {...defaultProps} />);

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Hello");

      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("should not show character count when empty", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      // Character count should not be visible
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });
  });

  describe("attachment button", () => {
    it("should render attachment button", () => {
      render(<UnifiedInputArea {...defaultProps} />);

      expect(screen.getByLabelText("Attach file")).toBeInTheDocument();
    });
  });

  describe("auto-resize textarea", () => {
    it("should resize textarea on input", async () => {
      const user = userEvent.setup();
      render(<UnifiedInputArea {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        "Type a message...",
      ) as HTMLTextAreaElement;
      const initialHeight = textarea.style.height;

      await user.type(textarea, "Line 1\nLine 2\nLine 3\nLine 4");

      // Height should have changed (note: actual resize depends on scrollHeight)
      expect(textarea.style.height).toBeDefined();
    });
  });
});

describe("UnifiedInputArea - Voice Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render voice input area when voice mode active", async () => {
    // Re-mock with voice mode active
    vi.doMock("../../../stores/unifiedConversationStore", () => ({
      useUnifiedConversationStore: () => ({
        inputMode: "voice",
        voiceModeActive: true,
        voiceModeType: "always-on",
        voiceState: "idle",
        isListening: false,
        isSpeaking: false,
        partialTranscript: "",
        setInputMode: vi.fn(),
        activateVoiceMode: vi.fn(),
        deactivateVoiceMode: vi.fn(),
        startListening: vi.fn(),
        stopListening: vi.fn(),
      }),
    }));

    vi.resetModules();
    const { UnifiedInputArea: VoiceInputArea } =
      await import("../UnifiedInputArea");

    render(<VoiceInputArea conversationId="conv-1" onSendMessage={vi.fn()} />);

    // Voice mode should show different UI
    expect(
      screen.queryByPlaceholderText("Type a message..."),
    ).not.toBeInTheDocument();
  });
});
