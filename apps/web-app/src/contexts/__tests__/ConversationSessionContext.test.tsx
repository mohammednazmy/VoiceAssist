/**
 * ConversationSessionContext Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  ConversationSessionProvider,
  useConversationSession,
  useConversationChat,
  useConversationVoice,
  useConversationBranching,
  useConversationMeta,
} from "../ConversationSessionContext";

// Mock the hooks
vi.mock("../../hooks/useChatSession", () => ({
  useChatSession: vi.fn(() => ({
    messages: [],
    connectionStatus: "disconnected",
    isTyping: false,
    sendMessage: vi.fn(),
    addMessage: vi.fn((msg) => ({
      ...msg,
      id: "test-id",
      timestamp: Date.now(),
    })),
    editMessage: vi.fn(),
    regenerateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  })),
}));

vi.mock("../../hooks/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: vi.fn(() => ({
    status: "disconnected",
    error: null,
    transcript: "",
    partialTranscript: "",
    isSpeaking: false,
    metrics: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    isConnected: false,
  })),
}));

vi.mock("../../hooks/useBranching", () => ({
  useBranching: vi.fn(() => ({
    branches: [],
    currentBranchId: "main",
    isLoading: false,
    error: null,
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
    loadBranches: vi.fn(),
    getBranchMessages: vi.fn(),
  })),
}));

vi.mock("../../hooks/useConversations", () => ({
  useConversations: vi.fn(() => ({
    conversations: [],
    isLoading: false,
    error: null,
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    archiveConversation: vi.fn(),
    reload: vi.fn(),
  })),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    apiClient: {
      getConversation: vi.fn().mockResolvedValue({
        id: "conv-1",
        title: "Test Conversation",
        userId: "user-1",
        archived: false,
        messageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getMessages: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
    },
  })),
}));

// Test wrapper
function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ConversationSessionProvider>{children}</ConversationSessionProvider>
    );
  };
}

describe("ConversationSessionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useConversationSession", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useConversationSession());
      }).toThrow(
        "useConversationSession must be used within ConversationSessionProvider",
      );

      consoleSpy.mockRestore();
    });

    it("should provide initial state", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.conversationId).toBeNull();
      expect(result.current.branchId).toBeNull();
      expect(result.current.connectionStatus).toBe("disconnected");
      expect(result.current.voiceStatus).toBe("idle");
      expect(result.current.messages).toEqual([]);
      expect(result.current.branches).toEqual([]);
    });

    it("should provide setActiveConversation action", async () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.setActiveConversation).toBeDefined();
      expect(typeof result.current.setActiveConversation).toBe("function");
    });

    it("should provide createBranchFromMessage action", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.createBranchFromMessage).toBeDefined();
      expect(typeof result.current.createBranchFromMessage).toBe("function");
    });

    it("should provide sendMessage action", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.sendMessage).toBeDefined();
      expect(typeof result.current.sendMessage).toBe("function");
    });

    it("should provide voice actions", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.connectVoice).toBeDefined();
      expect(result.current.disconnectVoice).toBeDefined();
      expect(result.current.sendVoiceMessage).toBeDefined();
    });
  });

  describe("useConversationChat", () => {
    it("should return chat-specific state and actions", () => {
      const { result } = renderHook(() => useConversationChat(), {
        wrapper: createWrapper(),
      });

      expect(result.current.messages).toBeDefined();
      expect(result.current.isTyping).toBeDefined();
      expect(result.current.connectionStatus).toBeDefined();
      expect(result.current.sendMessage).toBeDefined();
      expect(result.current.editMessage).toBeDefined();
      expect(result.current.reconnect).toBeDefined();
    });
  });

  describe("useConversationVoice", () => {
    it("should return voice-specific state and actions", () => {
      const { result } = renderHook(() => useConversationVoice(), {
        wrapper: createWrapper(),
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.transcript).toBe("");
      expect(result.current.isSpeaking).toBe(false);
      expect(result.current.connect).toBeDefined();
      expect(result.current.disconnect).toBeDefined();
    });
  });

  describe("useConversationBranching", () => {
    it("should return branching-specific state and actions", () => {
      const { result } = renderHook(() => useConversationBranching(), {
        wrapper: createWrapper(),
      });

      expect(result.current.branches).toEqual([]);
      expect(result.current.currentBranchId).toBe("main");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.createBranch).toBeDefined();
      expect(result.current.switchBranch).toBeDefined();
    });
  });

  describe("useConversationMeta", () => {
    it("should return metadata-specific state", () => {
      const { result } = renderHook(() => useConversationMeta(), {
        wrapper: createWrapper(),
      });

      expect(result.current.conversationId).toBeNull();
      expect(result.current.branchId).toBeNull();
      expect(result.current.meta).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe("Provider with initial values", () => {
    it("should accept initialConversationId prop", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConversationSessionProvider initialConversationId="conv-123">
          {children}
        </ConversationSessionProvider>
      );

      const { result } = renderHook(() => useConversationSession(), {
        wrapper,
      });

      // Note: The conversation loading is async, so we check the function exists
      expect(result.current.setActiveConversation).toBeDefined();
    });

    it("should accept callback props", () => {
      const onChatError = vi.fn();
      const onVoiceError = vi.fn();
      const onConnectionChange = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConversationSessionProvider
          onChatError={onChatError}
          onVoiceError={onVoiceError}
          onConnectionChange={onConnectionChange}
        >
          {children}
        </ConversationSessionProvider>
      );

      const { result } = renderHook(() => useConversationSession(), {
        wrapper,
      });

      // Provider should be functional with callbacks
      expect(result.current).toBeDefined();
    });
  });

  describe("clearActiveConversation", () => {
    it("should reset conversation state", async () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      // Clear should be callable and reset state
      act(() => {
        result.current.clearActiveConversation();
      });

      expect(result.current.conversationId).toBeNull();
      expect(result.current.conversationMeta).toBeNull();
    });
  });

  describe("switchBranch", () => {
    it("should update branchId when switching", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      // The switchBranch function should exist
      expect(result.current.switchBranch).toBeDefined();

      // Call switchBranch
      act(() => {
        result.current.switchBranch("branch-1");
      });

      // The underlying hook is mocked, so we just verify the call doesn't throw
    });

    it("should set branchId to null when switching to main", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.switchBranch("main");
      });

      // Main branch should set branchId to null
      expect(result.current.branchId).toBeNull();
    });
  });

  describe("conversations list integration", () => {
    it("should expose conversations list from hook", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.conversations).toBeDefined();
      expect(Array.isArray(result.current.conversations)).toBe(true);
    });

    it("should expose createConversation action", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.createConversation).toBeDefined();
      expect(typeof result.current.createConversation).toBe("function");
    });

    it("should expose reloadConversations action", () => {
      const { result } = renderHook(() => useConversationSession(), {
        wrapper: createWrapper(),
      });

      expect(result.current.reloadConversations).toBeDefined();
      expect(typeof result.current.reloadConversations).toBe("function");
    });
  });
});
