/**
 * CitationSidebar Phase 8 Tests
 * Tests for citation aggregation, search/filter, and empty states with structured citations
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitationSidebar } from "../CitationSidebar";
import type { Message } from "@voiceassist/types";
import type { Citation } from "../../../types";

// Mock useToastContext since CitationDisplay uses it for copy feedback
vi.mock("../../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

describe("CitationSidebar - Phase 8", () => {
  // Phase 8: Messages with structured citations
  const textbookCitation: Citation = {
    id: "cite-textbook-1",
    sourceType: "textbook",
    source: "kb",
    title: "Harrison's Principles of Internal Medicine",
    authors: ["Kasper", "Fauci", "Hauser", "Longo"],
    publicationYear: 2018,
    doi: "10.1036/9781259644047",
    snippet:
      "Diabetes mellitus is characterized by hyperglycemia resulting from defects in insulin secretion.",
    relevanceScore: 95,
    page: 2399,
  };

  const journalCitation: Citation = {
    id: "cite-journal-1",
    sourceType: "journal",
    source: "pubmed",
    title: "Management of Type 2 Diabetes in 2023",
    authors: ["Smith", "Johnson", "Williams"],
    publicationYear: 2023,
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMra2301806",
    pubmedId: "37146238",
    snippet:
      "Metformin remains first-line therapy for most patients with type 2 diabetes.",
    relevanceScore: 92,
  };

  const guidelineCitation: Citation = {
    id: "cite-guideline-1",
    sourceType: "guideline",
    source: "kb",
    title: "ADA Standards of Medical Care in Diabetes—2023",
    authors: ["American Diabetes Association"],
    publicationYear: 2023,
    doi: "10.2337/dc23-S001",
    snippet:
      "A1C target of <7% is recommended for most nonpregnant adults with diabetes.",
    relevanceScore: 98,
  };

  const messagesWithCitations: Message[] = [
    {
      id: "msg-1",
      role: "assistant",
      content: "Diabetes is a chronic metabolic disorder...",
      timestamp: 1700000000000,
      citations: [textbookCitation],
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Current treatment guidelines recommend...",
      timestamp: 1700000060000,
      citations: [journalCitation, guidelineCitation],
    },
  ];

  const messagesWithMetadataCitations: Message[] = [
    {
      id: "msg-3",
      role: "assistant",
      content: "Based on the latest research...",
      timestamp: 1700000120000,
      metadata: {
        citations: [textbookCitation],
      },
    },
  ];

  const messagesWithNoCitations: Message[] = [
    {
      id: "msg-4",
      role: "user",
      content: "What is diabetes?",
      timestamp: 1700000000000,
    },
    {
      id: "msg-5",
      role: "assistant",
      content: "Let me look that up for you...",
      timestamp: 1700000005000,
    },
  ];

  describe("Phase 8: Citation aggregation", () => {
    it("should aggregate citations from multiple messages", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // Should show count of all citations
      expect(screen.getByText("3 of 3")).toBeInTheDocument();

      // Should display all citation titles
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/ADA Standards of Medical Care/i),
      ).toBeInTheDocument();
    });

    it("should deduplicate citations with same id", () => {
      const messagesWithDuplicates: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "First mention...",
          timestamp: 1700000000000,
          citations: [textbookCitation],
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Second mention...",
          timestamp: 1700000060000,
          citations: [textbookCitation], // Same citation
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithDuplicates}
        />,
      );

      // Should only show 1 citation
      expect(screen.getByText("1 of 1")).toBeInTheDocument();
    });

    it("should handle citations in metadata.citations", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithMetadataCitations}
        />,
      );

      expect(screen.getByText("1 of 1")).toBeInTheDocument();
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
    });

    it("should aggregate citations from both top-level and metadata", () => {
      const mixedMessages: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Response 1",
          timestamp: 1700000000000,
          citations: [textbookCitation],
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Response 2",
          timestamp: 1700000060000,
          metadata: {
            citations: [journalCitation],
          },
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={mixedMessages}
        />,
      );

      expect(screen.getByText("2 of 2")).toBeInTheDocument();
    });
  });

  describe("Phase 8: Empty state handling", () => {
    it("should display empty state when no citations exist", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithNoCitations}
        />,
      );

      expect(screen.getByText("No citations yet")).toBeInTheDocument();
      expect(
        screen.getByText("Citations will appear here as you chat"),
      ).toBeInTheDocument();
    });

    it("should not display search bar when no citations", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithNoCitations}
        />,
      );

      expect(
        screen.queryByPlaceholderText("Search citations..."),
      ).not.toBeInTheDocument();
    });

    it("should not display count when no citations", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithNoCitations}
        />,
      );

      expect(screen.queryByText(/of/)).not.toBeInTheDocument();
    });

    it("should handle empty messages array", () => {
      render(<CitationSidebar isOpen={true} onClose={vi.fn()} messages={[]} />);

      expect(screen.getByText("No citations yet")).toBeInTheDocument();
    });

    it("should handle messages with empty citations arrays", () => {
      const messagesWithEmptyArrays: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Response without citations",
          timestamp: 1700000000000,
          citations: [],
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithEmptyArrays}
        />,
      );

      expect(screen.getByText("No citations yet")).toBeInTheDocument();
    });
  });

  describe("Phase 8: Search and filter functionality", () => {
    it("should display search bar when citations exist", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(
        screen.getByPlaceholderText("Search citations..."),
      ).toBeInTheDocument();
    });

    it("should filter citations by title", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Harrison");

      // Should show filtered count
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Should show matching citation
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();

      // Should not show non-matching citations
      expect(
        screen.queryByText(/Management of Type 2 Diabetes/i),
      ).not.toBeInTheDocument();
    });

    it("should filter citations by authors", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Smith");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
    });

    it("should filter citations by snippet", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Metformin");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
    });

    it("should filter citations by DOI", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "10.1036");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
    });

    it("should filter citations by PubMed ID", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "37146238");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
    });

    it("should be case-insensitive", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "DIABETES");

      // Should match all citations mentioning diabetes
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
    });

    it("should show 'no results' state when search yields no matches", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "nonexistent term xyz");

      expect(screen.getByText("0 of 3")).toBeInTheDocument();
      expect(screen.getByText("No citations found")).toBeInTheDocument();
      expect(
        screen.getByText("Try adjusting your search query"),
      ).toBeInTheDocument();
    });

    it("should clear search when clear button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Harrison");

      // Should be filtered
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Click clear button
      const clearButton = screen.getByLabelText("Clear search");
      await user.click(clearButton);

      // Should show all citations again
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
      expect(searchInput).toHaveValue("");
    });

    it("should update results as user types", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");

      // Type partial search
      await user.type(searchInput, "Harr");
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Complete the search
      await user.type(searchInput, "ison");
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Clear and type different search
      await user.clear(searchInput);
      await user.type(searchInput, "ADA");
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      expect(screen.getByText(/ADA Standards/i)).toBeInTheDocument();
    });
  });

  describe("Phase 8: Visibility and interaction", () => {
    it("should not render when isOpen is false", () => {
      const { container } = render(
        <CitationSidebar
          isOpen={false}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("should call onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <CitationSidebar
          isOpen={true}
          onClose={handleClose}
          messages={messagesWithCitations}
        />,
      );

      const closeButton = screen.getByLabelText("Close citation sidebar");
      await user.click(closeButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when backdrop is clicked", async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <CitationSidebar
          isOpen={true}
          onClose={handleClose}
          messages={messagesWithCitations}
        />,
      );

      // Find backdrop (has bg-black/50 class)
      const backdrop = document.querySelector(".bg-black\\/50");
      expect(backdrop).toBeInTheDocument();

      if (backdrop) {
        await user.click(backdrop as Element);
        expect(handleClose).toHaveBeenCalledTimes(1);
      }
    });

    it("should have proper ARIA attributes", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // Sidebar should have complementary role
      const sidebar = screen.getByRole("complementary", { name: "Citations" });
      expect(sidebar).toBeInTheDocument();

      // Close button should have proper label
      const closeButton = screen.getByLabelText("Close citation sidebar");
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe("Phase 8: Edge cases and robustness", () => {
    it("should handle citations with missing optional fields", () => {
      const minimalCitation: Citation = {
        id: "cite-minimal",
        title: "Minimal Citation",
      };

      const messagesWithMinimal: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Response",
          timestamp: 1700000000000,
          citations: [minimalCitation],
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithMinimal}
        />,
      );

      expect(screen.getByText("1 of 1")).toBeInTheDocument();
      expect(screen.getByText("Minimal Citation")).toBeInTheDocument();
    });

    it("should handle citations with null/undefined fields in search", async () => {
      const citationWithNulls: Citation = {
        id: "cite-nulls",
        title: "Citation With Nulls",
        authors: undefined,
        doi: null as any,
        snippet: undefined,
      };

      const messagesWithNulls: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Response",
          timestamp: 1700000000000,
          citations: [citationWithNulls],
        },
      ];

      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithNulls}
        />,
      );

      // Should not crash when searching
      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Nulls");

      expect(screen.getByText("1 of 1")).toBeInTheDocument();
      expect(screen.getByText("Citation With Nulls")).toBeInTheDocument();
    });

    it("should handle very long citation lists", () => {
      const manyCitations: Citation[] = Array.from({ length: 50 }, (_, i) => ({
        id: `cite-${i}`,
        title: `Citation ${i}`,
        authors: [`Author ${i}`],
        sourceType: "journal",
        snippet: `This is citation number ${i}`,
      }));

      const messagesWithMany: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Response with many citations",
          timestamp: 1700000000000,
          citations: manyCitations,
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithMany}
        />,
      );

      expect(screen.getByText("50 of 50")).toBeInTheDocument();
    });

    it("should maintain search state when sidebar is kept open", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Harrison");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Rerender with same props
      rerender(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // Search should still be active
      expect(searchInput).toHaveValue("Harrison");
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });

    it("should reset search when new messages arrive", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "Harrison");

      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Add new message with different citation
      const updatedMessages: Message[] = [
        ...messagesWithCitations,
        {
          id: "msg-new",
          role: "assistant",
          content: "New response",
          timestamp: 1700000120000,
          citations: [
            {
              id: "cite-new",
              title: "New Citation",
              sourceType: "note",
            },
          ],
        },
      ];

      rerender(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={updatedMessages}
        />,
      );

      // Search is still "Harrison" but now "1 of 4" because we have 4 total
      expect(screen.getByText("1 of 4")).toBeInTheDocument();
    });
  });

  describe("Phase 8: Footer information", () => {
    it("should display footer info about citations", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(
        screen.getByText(
          "Citations are automatically collected from AI responses and provide sources for medical information.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Phase 3C: Type filters", () => {
    it("should display type filter pills", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(screen.getByTestId("type-filter-all")).toBeInTheDocument();
      expect(screen.getByTestId("type-filter-kb")).toBeInTheDocument();
      expect(screen.getByTestId("type-filter-pubmed")).toBeInTheDocument();
      expect(screen.getByTestId("type-filter-guideline")).toBeInTheDocument();
    });

    it("should filter by Knowledge Base type", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      await user.click(screen.getByTestId("type-filter-kb"));

      // textbookCitation has source: "kb"
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
      // journalCitation has source: "pubmed" - should be hidden
      expect(
        screen.queryByText(/Management of Type 2 Diabetes/i),
      ).not.toBeInTheDocument();
    });

    it("should filter by PubMed type", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      await user.click(screen.getByTestId("type-filter-pubmed"));

      // journalCitation has source: "pubmed"
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
      // textbookCitation has source: "kb" - should be hidden
      expect(
        screen.queryByText(/Harrison's Principles/i),
      ).not.toBeInTheDocument();
    });

    it("should filter by Guideline type", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      await user.click(screen.getByTestId("type-filter-guideline"));

      // guidelineCitation has sourceType: "guideline"
      expect(screen.getByText(/ADA Standards/i)).toBeInTheDocument();
      // Other citations should be hidden
      expect(
        screen.queryByText(/Harrison's Principles/i),
      ).not.toBeInTheDocument();
    });

    it("should show all citations when All filter is selected", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // First filter to kb (only textbookCitation has source: "kb" without guideline sourceType)
      await user.click(screen.getByTestId("type-filter-kb"));
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Then back to all
      await user.click(screen.getByTestId("type-filter-all"));
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
    });

    it("should indicate active filter with aria-pressed", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const kbFilter = screen.getByTestId("type-filter-kb");
      expect(kbFilter).toHaveAttribute("aria-pressed", "false");

      await user.click(kbFilter);
      expect(kbFilter).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("Phase 3C: Message filters", () => {
    it("should display message filter dropdown when multiple messages have citations", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(screen.getByTestId("message-filter-select")).toBeInTheDocument();
      expect(screen.getByText("Filter by message")).toBeInTheDocument();
    });

    it("should not display message filter when only one message has citations", () => {
      const singleMessage: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "Only message",
          timestamp: 1700000000000,
          citations: [textbookCitation, journalCitation],
        },
      ];

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={singleMessage}
        />,
      );

      expect(
        screen.queryByTestId("message-filter-select"),
      ).not.toBeInTheDocument();
    });

    it("should filter citations by selected message", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const select = screen.getByTestId("message-filter-select");

      // Select first message (has only textbookCitation)
      await user.selectOptions(select, "msg-1");

      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/Management of Type 2 Diabetes/i),
      ).not.toBeInTheDocument();
    });

    it("should show all citations when All messages is selected", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      const select = screen.getByTestId("message-filter-select");

      // First filter to msg-1
      await user.selectOptions(select, "msg-1");
      expect(screen.getByText("1 of 3")).toBeInTheDocument();

      // Then back to all
      await user.selectOptions(select, "all");
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
    });
  });

  describe("Phase 3C: Jump to message", () => {
    it("should display jump-to button when onJumpToMessage is provided", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
          onJumpToMessage={vi.fn()}
        />,
      );

      // Should have jump buttons for each citation
      const jumpButtons = screen.getAllByText(/Jump to message/i);
      expect(jumpButtons.length).toBe(3);
    });

    it("should not display jump-to button when onJumpToMessage is not provided", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      expect(screen.queryByText(/Jump to message/i)).not.toBeInTheDocument();
    });

    it("should call onJumpToMessage with correct message ID when clicked", async () => {
      const user = userEvent.setup();
      const handleJump = vi.fn();

      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
          onJumpToMessage={handleJump}
        />,
      );

      // Click the first jump button
      const jumpButtons = screen.getAllByText(/Jump to message/i);
      await user.click(jumpButtons[0]);

      expect(handleJump).toHaveBeenCalledWith("msg-1");
    });

    it("should show correct message index in jump button", () => {
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
          onJumpToMessage={vi.fn()}
        />,
      );

      // First citation is from msg-1 (index 1)
      expect(screen.getByText("Jump to message #1")).toBeInTheDocument();
      // Second and third citations are from msg-2 (index 2)
      expect(screen.getAllByText("Jump to message #2")).toHaveLength(2);
    });
  });

  describe("Phase 3C: Combined filters", () => {
    it("should combine type filter with search query", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // Filter to guideline type (guidelineCitation has sourceType: "guideline")
      await user.click(screen.getByTestId("type-filter-guideline"));

      // Then search within guideline
      const searchInput = screen.getByPlaceholderText("Search citations...");
      await user.type(searchInput, "ADA");

      // guidelineCitation matches both guideline type AND "ADA" search
      expect(screen.getByText(/ADA Standards/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/Harrison's Principles/i),
      ).not.toBeInTheDocument();
    });

    it("should combine message filter with type filter", async () => {
      const user = userEvent.setup();
      render(
        <CitationSidebar
          isOpen={true}
          onClose={vi.fn()}
          messages={messagesWithCitations}
        />,
      );

      // Filter to msg-2 (has journalCitation and guidelineCitation)
      const select = screen.getByTestId("message-filter-select");
      await user.selectOptions(select, "msg-2");

      // Filter to pubmed type (journalCitation has source: "pubmed")
      await user.click(screen.getByTestId("type-filter-pubmed"));

      // Only journalCitation should show (from msg-2, pubmed type)
      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/ADA Standards/i)).not.toBeInTheDocument();
    });
  });
});
