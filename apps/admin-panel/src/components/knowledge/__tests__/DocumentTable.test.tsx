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
    version: "2.1",
    sizeMb: 0.5,
    indexed: false,
  },
  {
    id: "doc-3",
    name: "Drug Interactions Database",
    type: "pdf",
    status: "reindexing",
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
    version: "1.0",
    sizeMb: 2.0,
    indexed: false,
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
      expect(screen.getByText("Version")).toBeInTheDocument();
      expect(screen.getByText("Size")).toBeInTheDocument();
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

      expect(screen.getByText("Medical Guidelines 2024")).toBeInTheDocument();
      expect(screen.getByText("Clinical Notes Template")).toBeInTheDocument();
      expect(
        screen.getByText("Drug Interactions Database"),
      ).toBeInTheDocument();
      expect(screen.getByText("Failed Import Document")).toBeInTheDocument();
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

      expect(
        screen.getByText(/No documents found. Upload a PDF/),
      ).toBeInTheDocument();
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

      expect(screen.getByText("Indexed")).toBeInTheDocument();
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

      expect(screen.getByText("Pending")).toBeInTheDocument();
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

      expect(screen.getByText("Reindexing…")).toBeInTheDocument();
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

      expect(screen.getByText("Failed")).toBeInTheDocument();
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

      expect(screen.getByText("pdf")).toBeInTheDocument();
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

      expect(screen.getByText("1.0")).toBeInTheDocument();
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

      expect(screen.getByText("5.5 MB")).toBeInTheDocument();
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

      // Should have multiple dashes for missing fields
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
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

      // Select all + individual checkboxes
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBe(mockDocuments.length + 1);
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

      const checkbox = screen.getByLabelText("Select Medical Guidelines 2024");
      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();
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

      // Initially no bulk buttons
      expect(screen.queryByText(/Delete selected/)).not.toBeInTheDocument();

      // Select a document
      const checkbox = screen.getByLabelText("Select Medical Guidelines 2024");
      fireEvent.click(checkbox);

      // Now bulk buttons should appear
      expect(screen.getByText(/Delete selected/)).toBeInTheDocument();
      expect(screen.getByText("Reindex selected")).toBeInTheDocument();
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

      // Select two documents
      fireEvent.click(screen.getByLabelText("Select Medical Guidelines 2024"));
      fireEvent.click(screen.getByLabelText("Select Clinical Notes Template"));

      expect(screen.getByText("Delete selected (2)")).toBeInTheDocument();
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

      fireEvent.click(screen.getByLabelText("Select Medical Guidelines 2024"));
      fireEvent.click(screen.getByLabelText("Select Clinical Notes Template"));
      fireEvent.click(screen.getByText(/Delete selected/));

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

      fireEvent.click(screen.getByLabelText("Select Medical Guidelines 2024"));
      fireEvent.click(screen.getByText("Reindex selected"));

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

      fireEvent.click(screen.getByLabelText("Select Medical Guidelines 2024"));
      fireEvent.click(screen.getByText(/Delete selected/));

      // Bulk buttons should be hidden after action
      expect(screen.queryByText(/Delete selected/)).not.toBeInTheDocument();
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

      fireEvent.click(screen.getByText("Audit"));

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

      fireEvent.click(screen.getByText("Reindex"));

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

      fireEvent.click(screen.getByText("Delete"));

      expect(onDelete).toHaveBeenCalledWith(["doc-1"]);
    });
  });
});
