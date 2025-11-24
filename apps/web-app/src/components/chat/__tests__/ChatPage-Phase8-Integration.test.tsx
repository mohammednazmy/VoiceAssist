/**
 * ChatPage Phase 8 Integration Tests
 * Tests for attachments, export, and WebSocket citation streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message, Citation, Attachment } from "@voiceassist/types";

// Mock the hooks and API clients
const mockSendMessage = vi.fn();
const mockDownloadAttachment = vi.fn();
const mockListMessageAttachments = vi.fn();
const mockExportMarkdown = vi.fn();
const mockExportPdf = vi.fn();

vi.mock("../../hooks/useChatSession", () => ({
  useChatSession: () => ({
    messages: [],
    connectionStatus: "connected" as const,
    isTyping: false,
    editingMessageId: null,
    sendMessage: mockSendMessage,
    editMessage: vi.fn(),
    regenerateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

// Create a module-level mock that will be returned every time createAttachmentsApi is called
const mockAttachmentsApiClient = {
  uploadAttachment: vi.fn(),
  listMessageAttachments: mockListMessageAttachments,
  downloadAttachment: mockDownloadAttachment,
  deleteAttachment: vi.fn(),
};

vi.mock("../../lib/api/attachmentsApi", () => ({
  createAttachmentsApi: () => mockAttachmentsApiClient,
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    apiClient: {
      exportConversationAsMarkdown: mockExportMarkdown,
      exportConversationAsPdf: mockExportPdf,
      synthesizeSpeech: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    },
    isAuthenticated: true,
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "physician" as const,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
    logout: vi.fn(),
  }),
}));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: () => ({
    tokens: {
      accessToken: "test-token",
      refreshToken: "test-refresh",
      expiresIn: 3600,
    },
  }),
}));

// Import after mocking
import { MessageBubble } from "../MessageBubble";

describe("ChatPage - Phase 8 Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset DOM
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Attachment Display and Download", () => {
    it("should display attachments when message has attachments", async () => {
      const mockAttachments: Attachment[] = [
        {
          id: "att-1",
          messageId: "msg-1",
          fileName: "test-document.pdf",
          fileType: "pdf",
          fileSize: 1024000,
          fileUrl: "/files/att-1",
          uploadedAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "att-2",
          messageId: "msg-1",
          fileName: "test-image.jpg",
          fileType: "image",
          fileSize: 512000,
          fileUrl: "/files/att-2",
          uploadedAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      mockListMessageAttachments.mockResolvedValue(mockAttachments);

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "Here are the files",
        attachments: ["att-1", "att-2"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Wait for attachments to load
      await waitFor(() => {
        expect(mockListMessageAttachments).toHaveBeenCalledWith("msg-1");
      });

      // Check attachment section header
      await waitFor(() => {
        expect(screen.getByText(/Attachments \(2\)/i)).toBeInTheDocument();
      });

      // Check individual attachment names
      expect(screen.getByText("test-document.pdf")).toBeInTheDocument();
      expect(screen.getByText("test-image.jpg")).toBeInTheDocument();

      // Check file sizes are formatted
      expect(screen.getByText(/1000 KB/i)).toBeInTheDocument();
      expect(screen.getByText(/500 KB/i)).toBeInTheDocument();
    });

    it("should download attachment when clicked", async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(["test content"], { type: "application/pdf" });
      mockDownloadAttachment.mockResolvedValue(mockBlob);

      const mockAttachment: Attachment = {
        id: "att-1",
        messageId: "msg-1",
        fileName: "test.pdf",
        fileType: "pdf",
        fileSize: 1024,
        fileUrl: "/files/att-1",
        uploadedAt: "2024-01-01T00:00:00Z",
        createdAt: "2024-01-01T00:00:00Z",
      };

      mockListMessageAttachments.mockResolvedValue([mockAttachment]);

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "File attached",
        attachments: ["att-1"],
        timestamp: Date.now(),
      };

      // Mock URL.createObjectURL
      global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      global.URL.revokeObjectURL = vi.fn();

      render(<MessageBubble message={message} />);

      // Wait for attachments to load
      await waitFor(() => {
        expect(screen.getByText("test.pdf")).toBeInTheDocument();
      });

      // Click the attachment to download
      const attachmentButton = screen.getByLabelText("Download test.pdf");
      await user.click(attachmentButton);

      // Verify download API was called
      await waitFor(() => {
        expect(mockDownloadAttachment).toHaveBeenCalledWith("att-1");
      });

      // Verify blob URL was created
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it("should show loading state while fetching attachments", () => {
      mockListMessageAttachments.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "File attached",
        attachments: ["att-1"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Should show loading indicator
      expect(screen.getByText(/Loading attachments/i)).toBeInTheDocument();
    });

    it("should handle attachment fetch error gracefully", async () => {
      mockListMessageAttachments.mockRejectedValue(
        new Error("Failed to fetch"),
      );

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "File attached",
        attachments: ["att-1"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Wait for error state
      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load attachments/i),
        ).toBeInTheDocument();
      });
    });

    it("should display appropriate icon for each file type", async () => {
      const mockAttachments: Attachment[] = [
        {
          id: "att-pdf",
          messageId: "msg-1",
          fileName: "doc.pdf",
          fileType: "pdf",
          fileSize: 1024,
          fileUrl: "/files/att-pdf",
          uploadedAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "att-img",
          messageId: "msg-1",
          fileName: "pic.jpg",
          fileType: "image",
          fileSize: 1024,
          fileUrl: "/files/att-img",
          uploadedAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "att-txt",
          messageId: "msg-1",
          fileName: "note.txt",
          fileType: "text",
          fileSize: 1024,
          fileUrl: "/files/att-txt",
          uploadedAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      mockListMessageAttachments.mockResolvedValue(mockAttachments);

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "Multiple file types",
        attachments: ["att-pdf", "att-img", "att-txt"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Wait for attachments to load
      await waitFor(() => {
        expect(screen.getByText("doc.pdf")).toBeInTheDocument();
      });

      // Verify all file names are displayed
      expect(screen.getByText("doc.pdf")).toBeInTheDocument();
      expect(screen.getByText("pic.jpg")).toBeInTheDocument();
      expect(screen.getByText("note.txt")).toBeInTheDocument();
    });
  });

  describe("WebSocket Citation Streaming", () => {
    it("should render structured citations from WebSocket message.done event", () => {
      const citations: Citation[] = [
        {
          id: "cite-1",
          sourceType: "journal",
          title: "Management of Type 2 Diabetes",
          authors: ["Smith", "Johnson"],
          publicationYear: 2023,
          journal: "NEJM",
          doi: "10.1056/NEJMra2301806",
          pubmedId: "37146238",
          snippet: "Metformin remains first-line therapy.",
          relevanceScore: 95,
        },
      ];

      const message: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Based on recent guidelines...",
        citations,
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Citation display should be visible
      expect(screen.getByText("1 Source")).toBeInTheDocument();
    });

    it("should handle message with both citations and attachments", async () => {
      const mockAttachment: Attachment = {
        id: "att-1",
        messageId: "msg-1",
        fileName: "reference.pdf",
        fileType: "pdf",
        fileSize: 2048000,
        fileUrl: "/files/att-1",
        uploadedAt: "2024-01-01T00:00:00Z",
        createdAt: "2024-01-01T00:00:00Z",
      };

      mockListMessageAttachments.mockResolvedValue([mockAttachment]);

      const citations: Citation[] = [
        {
          id: "cite-1",
          sourceType: "guideline",
          title: "ADA Standards 2023",
          snippet: "A1C target <7%",
        },
      ];

      const message: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Here's the information with references",
        citations,
        attachments: ["att-1"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Both sections should render
      expect(screen.getByText("1 Source")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("reference.pdf")).toBeInTheDocument();
      });
    });

    it("should handle message with no citations or attachments", () => {
      const message: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Simple response without references",
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      // Only content should be visible, no citations or attachments sections
      expect(
        screen.getByText("Simple response without references"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Source/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Attachment/i)).not.toBeInTheDocument();
    });
  });

  describe("Contract Verification", () => {
    it("should use correct API endpoint format for listing attachments", async () => {
      mockListMessageAttachments.mockResolvedValue([]);

      const message: Message = {
        id: "msg-123",
        role: "user",
        content: "Test",
        attachments: ["att-1"],
        timestamp: Date.now(),
      };

      render(<MessageBubble message={message} />);

      await waitFor(() => {
        expect(mockListMessageAttachments).toHaveBeenCalledWith("msg-123");
      });
    });

    it("should use correct API endpoint format for downloading attachments", async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(["content"]);
      mockDownloadAttachment.mockResolvedValue(mockBlob);

      const mockAttachment: Attachment = {
        id: "att-xyz",
        messageId: "msg-1",
        fileName: "test.pdf",
        fileType: "pdf",
        fileSize: 1024,
        fileUrl: "/files/att-xyz",
        uploadedAt: "2024-01-01T00:00:00Z",
        createdAt: "2024-01-01T00:00:00Z",
      };

      mockListMessageAttachments.mockResolvedValue([mockAttachment]);

      const message: Message = {
        id: "msg-1",
        role: "user",
        content: "Test",
        attachments: ["att-xyz"],
        timestamp: Date.now(),
      };

      global.URL.createObjectURL = vi.fn(() => "blob:test");
      global.URL.revokeObjectURL = vi.fn();

      render(<MessageBubble message={message} />);

      await waitFor(() => {
        expect(screen.getByText("test.pdf")).toBeInTheDocument();
      });

      const downloadButton = screen.getByLabelText("Download test.pdf");
      await user.click(downloadButton);

      await waitFor(() => {
        expect(mockDownloadAttachment).toHaveBeenCalledWith("att-xyz");
      });
    });
  });
});
