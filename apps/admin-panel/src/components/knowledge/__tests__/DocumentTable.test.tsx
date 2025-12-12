/**
 * Tests for DocumentTable component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentTable, DocumentRow } from "../DocumentTable";

const mockDocuments: DocumentRow[] = [
  {
    id: "doc-1",
    name: "Medical Guidelines 2024",
    type: "pdf",
    status: "indexed",
    indexingStatus: "indexed",
    version: "1.0",
    sizeMb: 5.5,
    indexed: true,
    lastIndexedAt: "2024-01-15T12:00:00Z",
  },
  {
    id: "doc-2",
    name: "Clinical Notes Template",
    type: "txt",
    status: "pending",
    indexingStatus: "processing",
    version: "2.1",
    sizeMb: 0.5,
    indexed: false,
  },
  {
    id: "doc-3",
    name: "Drug Interactions Database",
    type: "pdf",
    status: "reindexing",
    indexingStatus: "processing",
    version: "3.0",
    sizeMb: 15.2,
    indexed: true,
    lastIndexedAt: "2024-01-10T08:00:00Z",
  },
  {
    id: "doc-4",
    name: "Failed Import Document",
    type: "pdf",
    status: "failed",
    indexingStatus: "failed",
    version: "1.0",
    sizeMb: 2.0,
    indexed: false,
  },
  {
    id: "doc-5",
    name: "Enhanced Processing Document",
    type: "pdf",
    status: "indexed",
    indexingStatus: "indexed",
    version: "1.0",
    sizeMb: 10.0,
    indexed: true,
    hasEnhancedStructure: true,
    processingStage: "analyzing",
    processingProgress: 42,
    phiRisk: "high",
  },
];

describe("DocumentTable", () => {
  const onDelete = vi.fn();
  const onReindex = vi.fn();
  const onOpenAudit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders table header", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Pages")).toBeInTheDocument();
      expect(screen.getByText("Structure")).toBeInTheDocument();
      expect(screen.getByText("Chunks")).toBeInTheDocument();
      expect(screen.getByText("Visibility")).toBeInTheDocument();
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("renders all documents", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Documents are rendered in both mobile and desktop views
      expect(
        screen.getAllByText("Medical Guidelines 2024").length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText("Clinical Notes Template").length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText("Drug Interactions Database").length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText("Failed Import Document").length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("renders loading state", () => {
      render(
        <DocumentTable
          documents={[]}
          loading={true}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getByText("Loading documents…")).toBeInTheDocument();
    });

    it("renders empty state when no documents", () => {
      render(
        <DocumentTable
          documents={[]}
          loading={false}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Empty state appears in both mobile and desktop views
      expect(
        screen.getAllByText(/No documents found. Upload a PDF/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("sorts documents by name", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const rows = screen.getAllByRole("row");
      // First row is header, documents start at row 1
      // Sorted: Clinical Notes, Drug Interactions, Failed Import, Medical Guidelines
      expect(rows[1]).toHaveTextContent("Clinical Notes Template");
      expect(rows[2]).toHaveTextContent("Drug Interactions Database");
    });
  });

  describe("status badges", () => {
    it("renders indexed status badge", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Status badges appear in both mobile and desktop views
      expect(screen.getAllByText("Indexed").length).toBeGreaterThanOrEqual(1);
    });

    it("renders pending status badge", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[1]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
    });

    it("renders reindexing status badge", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[2]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getAllByText("Reindexing…").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("renders failed status badge", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[3]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getAllByText("Failed").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("document details", () => {
    it("displays document type", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Type appears in both mobile and desktop views
      expect(screen.getAllByText("pdf").length).toBeGreaterThanOrEqual(1);
    });

    it("displays document version", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Version appears in desktop table; mobile shows "Version: 1.0"
      expect(screen.getAllByText(/1\.0/).length).toBeGreaterThanOrEqual(1);
    });

    it("displays document size", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Size appears in both views
      expect(screen.getAllByText(/5\.5 MB/).length).toBeGreaterThanOrEqual(1);
    });

    it("displays dash when version is missing", () => {
      const docWithoutVersion = { ...mockDocuments[0], version: undefined };
      render(
        <DocumentTable
          documents={[docWithoutVersion]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Should have dashes for missing fields in both views
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("shows enhanced processing status when available", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[4]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Mobile metadata line
      expect(
        screen.getByText(/Enhanced:\s*Analyzing… 42%/),
      ).toBeInTheDocument();

      // PHI badge should also be visible
      expect(screen.getAllByText(/PHI: High/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("selection", () => {
    it("renders checkboxes for each document", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Both mobile cards and desktop table have checkboxes
      // Mobile: 4 docs, Desktop: 1 select-all + 4 docs = 9 total
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBeGreaterThanOrEqual(
        mockDocuments.length + 1,
      );
    });

    it("selects individual document when checkbox clicked", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Get all checkboxes for this document (mobile + desktop)
      const checkboxes = screen.getAllByLabelText(
        "Select Medical Guidelines 2024",
      );
      fireEvent.click(checkboxes[0]);

      // All checkboxes for this document should be checked (shared state)
      checkboxes.forEach((cb) => {
        expect(cb).toBeChecked();
      });
    });

    it("selects all documents when select all clicked", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const selectAll = screen.getByLabelText("Select all documents");
      fireEvent.click(selectAll);

      const checkboxes = screen.getAllByRole("checkbox");
      checkboxes.forEach((cb) => {
        expect(cb).toBeChecked();
      });
    });

    it("deselects all when select all clicked again", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const selectAll = screen.getByLabelText("Select all documents");
      fireEvent.click(selectAll); // Select all
      fireEvent.click(selectAll); // Deselect all

      const checkboxes = screen.getAllByRole("checkbox");
      checkboxes.forEach((cb) => {
        expect(cb).not.toBeChecked();
      });
    });

    it("shows bulk action buttons when documents selected", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Initially no bulk delete button with count
      expect(screen.queryByText(/Delete \(/)).not.toBeInTheDocument();

      // Select a document (use first checkbox for this doc)
      const checkboxes = screen.getAllByLabelText(
        "Select Medical Guidelines 2024",
      );
      fireEvent.click(checkboxes[0]);

      // Now bulk buttons should appear - Delete with count and Reindex
      expect(screen.getByText(/Delete \(/)).toBeInTheDocument();
      // Multiple "Reindex" buttons exist (bulk + per-row), just verify at least one exists
      expect(screen.getAllByText("Reindex").length).toBeGreaterThanOrEqual(1);
    });

    it("shows correct count in delete button", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Select two documents (use first checkbox for each)
      fireEvent.click(
        screen.getAllByLabelText("Select Medical Guidelines 2024")[0],
      );
      fireEvent.click(
        screen.getAllByLabelText("Select Clinical Notes Template")[0],
      );

      expect(screen.getByText("Delete (2)")).toBeInTheDocument();
    });
  });

  describe("bulk actions", () => {
    it("calls onDelete with selected document ids", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      fireEvent.click(
        screen.getAllByLabelText("Select Medical Guidelines 2024")[0],
      );
      fireEvent.click(
        screen.getAllByLabelText("Select Clinical Notes Template")[0],
      );
      fireEvent.click(screen.getByText(/Delete \(/));

      expect(onDelete).toHaveBeenCalledWith(["doc-1", "doc-2"]);
    });

    it("calls onReindex with selected document ids", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      fireEvent.click(
        screen.getAllByLabelText("Select Medical Guidelines 2024")[0],
      );
      // Click the bulk Reindex button (header) - it's the one in the header section
      const reindexButtons = screen.getAllByText("Reindex");
      // The first "Reindex" button after selection is the bulk action button
      fireEvent.click(reindexButtons[0]);

      expect(onReindex).toHaveBeenCalledWith(["doc-1"]);
    });

    it("clears selection after bulk delete", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      fireEvent.click(
        screen.getAllByLabelText("Select Medical Guidelines 2024")[0],
      );
      fireEvent.click(screen.getByText(/Delete \(/));

      // Bulk buttons should be hidden after action
      expect(screen.queryByText(/Delete \(/)).not.toBeInTheDocument();
    });
  });

  describe("search and filtering", () => {
    it("renders search input", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getByPlaceholderText("Search documents...")).toBeInTheDocument();
    });

    it("renders filters button", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      expect(screen.getByText("Filters")).toBeInTheDocument();
    });

    it("filters documents by search term", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search documents...");
      fireEvent.change(searchInput, { target: { value: "Medical" } });

      // Medical Guidelines should be visible
      expect(screen.getAllByText("Medical Guidelines 2024").length).toBeGreaterThanOrEqual(1);
      // Clinical Notes should not be visible
      expect(screen.queryAllByText("Clinical Notes Template")).toHaveLength(0);
    });

    it("shows document count after filtering", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search documents...");
      fireEvent.change(searchInput, { target: { value: "Medical" } });

      // Shows "1 of 5 documents" (one of five total docs matches filter)
      expect(screen.getByText(/1 of 5 documents/)).toBeInTheDocument();
    });

    it("shows clear button when filters are active", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search documents...");
      fireEvent.change(searchInput, { target: { value: "test" } });

      expect(screen.getByText("Clear")).toBeInTheDocument();
    });

    it("clears filters when clear button clicked", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search documents...");
      fireEvent.change(searchInput, { target: { value: "test" } });
      fireEvent.click(screen.getByText("Clear"));

      // Search input should be cleared
      expect(searchInput).toHaveValue("");
      // All documents should be visible again (5 of 5)
      expect(screen.getByText(/5 of 5 documents/)).toBeInTheDocument();
    });

    it("shows no results message when search returns empty", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search documents...");
      fireEvent.change(searchInput, { target: { value: "nonexistent document xyz" } });

      expect(screen.getAllByText(/No documents match your filters/).length).toBeGreaterThanOrEqual(1);
    });

    it("toggles filter panel visibility", () => {
      render(
        <DocumentTable
          documents={mockDocuments}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Filter dropdowns should not be visible initially
      expect(screen.queryByLabelText(/Status:/)).not.toBeInTheDocument();

      // Click filters button
      fireEvent.click(screen.getByText("Filters"));

      // Now filter dropdowns should be visible
      expect(screen.getByText("Status:")).toBeInTheDocument();
      expect(screen.getByText("Type:")).toBeInTheDocument();
      expect(screen.getByText("Visibility:")).toBeInTheDocument();
    });
  });

  describe("individual actions", () => {
    it("calls onOpenAudit when Audit button clicked", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Click first Audit button (mobile or desktop)
      fireEvent.click(screen.getAllByText("Audit")[0]);

      expect(onOpenAudit).toHaveBeenCalledWith(mockDocuments[0]);
    });

    it("calls onReindex when individual Reindex button clicked", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Click first Reindex button (mobile or desktop)
      fireEvent.click(screen.getAllByText("Reindex")[0]);

      expect(onReindex).toHaveBeenCalledWith(["doc-1"]);
    });

    it("calls onDelete when individual Delete button clicked", () => {
      render(
        <DocumentTable
          documents={[mockDocuments[0]]}
          onDelete={onDelete}
          onReindex={onReindex}
          onOpenAudit={onOpenAudit}
        />,
      );

      // Click first Delete button (mobile or desktop)
      fireEvent.click(screen.getAllByText("Delete")[0]);

      expect(onDelete).toHaveBeenCalledWith(["doc-1"]);
    });
  });
});
