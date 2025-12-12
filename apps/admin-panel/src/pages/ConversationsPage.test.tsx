/**
 * Tests for ConversationsPage - List, view, export, filter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ConversationsPage } from "./ConversationsPage";
import { MemoryRouter } from "react-router-dom";

// Mock hooks and api
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { fetchAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const mockConversations = [
  {
    id: "conv-1",
    user_id: "user-123",
    user_email: "user1@example.com",
    title: "Medical consultation",
    message_count: 15,
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T12:00:00Z",
    model: "gpt-4",
    branch_count: 2,
    folder_name: null,
  },
  {
    id: "conv-2",
    user_id: "user-456",
    user_email: "user2@example.com",
    title: "Follow-up questions",
    message_count: 8,
    created_at: "2024-01-14T08:00:00Z",
    updated_at: "2024-01-14T09:00:00Z",
    model: "gpt-3.5-turbo",
    branch_count: 1,
    folder_name: null,
  },
];

const mockConversationsResponse = {
  conversations: mockConversations,
  total: 2,
  limit: 25,
  offset: 0,
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

describe("ConversationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockConversationsResponse);
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <ConversationsPage />
      </MemoryRouter>,
    );
  };

  describe("rendering", () => {
    it("should render page title", async () => {
      renderPage();

      expect(screen.getByText("Conversations")).toBeInTheDocument();
      expect(
        screen.getByText("Browse and manage all user conversations"),
      ).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });
    });

    it("should render refresh button", async () => {
      renderPage();

      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });
    });

    it("should render search input", async () => {
      renderPage();

      expect(
        screen.getByPlaceholderText(/search by title/i),
      ).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });
    });

    it("should render user ID filter input", async () => {
      renderPage();

      expect(
        screen.getByPlaceholderText(/filter by user id/i),
      ).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });
    });

    it("should render table headers", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Title")).toBeInTheDocument();
        expect(screen.getByText("User")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
        expect(screen.getByText("Branches")).toBeInTheDocument();
        expect(screen.getByText("Model")).toBeInTheDocument();
        expect(screen.getByText("Updated")).toBeInTheDocument();
        expect(screen.getByText("Actions")).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("should show loading skeleton while fetching", () => {
      vi.mocked(fetchAPI).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      renderPage();

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("data loading", () => {
    it("should fetch conversations on mount", async () => {
      renderPage();

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/conversations?offset=0&limit=25",
        );
      });
    });

    it("should display conversations in table", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
        expect(screen.getByText("Follow-up questions")).toBeInTheDocument();
      });
    });

    it("should display user emails", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("user1@example.com")).toBeInTheDocument();
        expect(screen.getByText("user2@example.com")).toBeInTheDocument();
      });
    });

    it("should display message counts", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("15")).toBeInTheDocument();
        expect(screen.getByText("8")).toBeInTheDocument();
      });
    });

    it("should display total count", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Total conversations: 2")).toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("should show error message on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(
        new Error("Failed to load conversations"),
      );

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load conversations"),
        ).toBeInTheDocument();
      });
    });

    it("should show retry button on error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Network error"));

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /retry/i }),
        ).toBeInTheDocument();
      });
    });

    it("should refetch when retry is clicked", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Network error"));
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockConversationsResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /retry/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("search and filtering", () => {
    it("should filter by title when search term is entered", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by title/i);
      fireEvent.change(searchInput, { target: { value: "test query" } });

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("title_search=test%20query"),
        );
      });
    });

    it("should filter by user ID when user filter is entered", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      const userInput = screen.getByPlaceholderText(/filter by user id/i);
      fireEvent.change(userInput, { target: { value: "user-123" } });

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("user_id=user-123"),
        );
      });
    });

    it("should reset to page 0 when search changes", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by title/i);
      fireEvent.change(searchInput, { target: { value: "test" } });

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("offset=0"),
        );
      });
    });
  });

  describe("refresh functionality", () => {
    it("should refetch conversations when refresh is clicked", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      vi.clearAllMocks();
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });
    });
  });

  describe("view detail functionality", () => {
    it("should navigate to detail page when View is clicked", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      const viewButtons = screen.getAllByRole("button", { name: /view/i });
      fireEvent.click(viewButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-1");
    });
  });

  describe("export functionality", () => {
    it("should export conversation when Export is clicked", async () => {
      const mockExportResponse = {
        export: { content: { messages: [] }, format: "json" },
      };

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockConversationsResponse)
        .mockResolvedValueOnce(mockExportResponse);

      // Mock URL.createObjectURL and link.click
      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:test");
      const mockRevokeObjectURL = vi.fn();
      globalThis.URL.createObjectURL = mockCreateObjectURL;
      globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockLink = { href: "", download: "", click: vi.fn() };
      const originalCreateElement = document.createElement;
      const createElementSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation(
          (tagName: string, options?: ElementCreationOptions) => {
            if (tagName.toLowerCase() === "a") {
              return mockLink as unknown as HTMLElement;
            }
            return originalCreateElement.call(document, tagName, options);
          },
        );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      const exportButtons = screen.getAllByRole("button", { name: /export/i });
      fireEvent.click(exportButtons[0]);

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/conversations/conv-1/export",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ format: "json" }),
          }),
        );
      });

      createElementSpy.mockRestore();
    });
  });

  describe("row selection and preview", () => {
    it("should show preview panel when row is clicked", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      // Click on the row (the title cell)
      fireEvent.click(screen.getByText("Medical consultation"));

      await waitFor(() => {
        expect(screen.getByText(/Preview:/)).toBeInTheDocument();
      });
    });

    it("should close preview panel when close is clicked", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Medical consultation"));

      await waitFor(() => {
        expect(screen.getByText(/Preview:/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /close/i }));

      await waitFor(() => {
        expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument();
      });
    });

    it("should display conversation details in preview", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Medical consultation")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Medical consultation"));

      await waitFor(() => {
        // Preview shows user email
        expect(screen.getAllByText("user1@example.com").length).toBeGreaterThan(
          0,
        );
        // Preview has View Full Details button
        expect(
          screen.getByRole("button", { name: /view full details/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("pagination", () => {
    it("should show pagination when total exceeds page size", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        ...mockConversationsResponse,
        total: 50,
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /previous/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /next/i }),
        ).toBeInTheDocument();
      });
    });

    it("should disable previous button on first page", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        ...mockConversationsResponse,
        total: 50,
      });

      renderPage();

      await waitFor(() => {
        const prevButton = screen.getByRole("button", { name: /previous/i });
        expect(prevButton).toBeDisabled();
      });
    });

    it("should fetch next page when Next is clicked", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        ...mockConversationsResponse,
        total: 50,
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /next/i }),
        ).toBeInTheDocument();
      });

      vi.clearAllMocks();
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringContaining("offset=25"),
        );
      });
    });

    it("should show page info", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        ...mockConversationsResponse,
        total: 50,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
        expect(screen.getByText(/Showing 1 to 25 of 50/)).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("should show empty message when no conversations", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({
        conversations: [],
        total: 0,
        limit: 25,
        offset: 0,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("No conversations found.")).toBeInTheDocument();
      });
    });
  });
});
