/**
 * Voice Mode Navigation Integration Tests
 * Tests the flow from HomePage Voice Mode card to ChatPage with voice UI active
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "../../pages/HomePage";
import { ChatPage } from "../../pages/ChatPage";

// Mock hooks and contexts
const mockNavigate = vi.fn();
const mockApiClient = {
  createConversation: vi.fn().mockResolvedValue({
    id: "test-conversation-id",
    title: "New Conversation",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  getConversation: vi.fn().mockResolvedValue({
    id: "test-conversation-id",
    title: "Test Conversation",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  getMessages: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    limit: 50,
    total: 0,
  }),
  createRealtimeSession: vi.fn().mockResolvedValue({
    url: "wss://test.example.com",
    model: "gpt-4o-realtime-preview",
    api_key: "test-key",
    session_id: "test-session-id",
    expires_at: Date.now() / 1000 + 3600,
    conversation_id: "test-conversation-id",
    voice_config: {
      voice: "alloy",
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: {
        model: "whisper-1",
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
    },
  }),
};

const mockUser = {
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  role: "user" as const,
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    apiClient: mockApiClient,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("../../hooks/useChatSession", () => ({
  useChatSession: () => ({
    messages: [],
    connectionStatus: "connected",
    isTyping: false,
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    regenerateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

vi.mock("../../hooks/useBranching", () => ({
  useBranching: () => ({
    createBranch: vi.fn(),
  }),
}));

vi.mock("../../hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: () => ({}),
}));

vi.mock("../../hooks/useClinicalContext", () => ({
  useClinicalContext: () => ({
    context: {},
    isLoading: false,
    saveContext: vi.fn(),
  }),
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("../../hooks/useTemplates", () => ({
  useTemplates: () => ({
    createFromConversation: vi.fn(),
  }),
}));

vi.mock("../../components/accessibility/LiveRegion", () => ({
  useAnnouncer: () => ({
    announce: vi.fn(),
    LiveRegion: () => null,
  }),
}));

// Mock MediaDevices for voice components
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
  writable: true,
});

// Mock AudioContext
class MockAudioContext {
  sampleRate = 24000;
  destination = {};
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createScriptProcessor() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    };
  }
  close() {
    return Promise.resolve();
  }
}
(
  globalThis as unknown as { AudioContext: typeof AudioContext }
).AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Mock WebSocket
class MockWebSocket {
  readyState = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {}

  send() {}
  close() {}
}
(
  globalThis as unknown as { WebSocket: typeof WebSocket }
).WebSocket = MockWebSocket as unknown as typeof WebSocket;

describe("Voice Mode Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should navigate to /chat?mode=voice when Voice Mode card is clicked", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Find and click the Voice Mode card
    const voiceModeCard = screen.getByTestId("voice-mode-card");
    expect(voiceModeCard).toBeInTheDocument();

    await user.click(voiceModeCard);

    // Verify navigation was called with correct path
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/chat?mode=voice");
    });
  });

  it("should auto-open voice panel when navigating to /chat?mode=voice", async () => {
    render(
      <MemoryRouter initialEntries={["/chat/test-conversation-id?mode=voice"]}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Voice mode panel should be visible
    await waitFor(
      () => {
        const voicePanel = screen.queryByTestId("voice-mode-panel");
        expect(voicePanel).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("should show realtime voice mode button in MessageInput", async () => {
    render(
      <MemoryRouter initialEntries={["/chat/test-conversation-id?mode=voice"]}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Realtime voice mode button should be visible
    await waitFor(() => {
      const voiceButton = screen.queryByTestId("realtime-voice-mode-button");
      expect(voiceButton).toBeInTheDocument();
    });
  });

  it("should work with direct URL navigation to /chat?mode=voice", async () => {
    // Simulate direct navigation via URL bar
    render(
      <MemoryRouter initialEntries={["/chat?mode=voice"]}>
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // ChatPage will auto-create a conversation and redirect
    await waitFor(() => {
      expect(mockApiClient.createConversation).toHaveBeenCalled();
    });
  });
});
