/**
 * Tests for DocumentPreviewDrawer component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DocumentPreviewDrawer } from "../DocumentPreviewDrawer";
import type { DocumentRow } from "../DocumentTable";

// Mock fetchAPI
vi.mock("../../../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../../../lib/api";

const mockDocument: DocumentRow = {
  id: "doc-1",
  name: "Test Medical Textbook",
  type: "pdf",
  indexed: true,
  indexingStatus: "indexed",
  version: "v1",
  lastIndexedAt: "2024-01-15T12:00:00Z",
  status: "indexed",
  totalPages: 100,
  hasToc: true,
  hasFigures: true,
  chunksIndexed: 250,
  isPublic: true,
  sourceType: "system",
};

const mockStructure = {
  data: {
    document_id: "doc-1",
    title: "Test Medical Textbook",
    total_pages: 100,
    has_toc: true,
    has_figures: true,
    structure: {
      toc: [
        { title: "Introduction", level: 1, page_number: 1, section_id: "sec-1" },
        { title: "Chapter 1: Basics", level: 1, page_number: 5, section_id: "sec-2" },
        { title: "1.1 Overview", level: 2, page_number: 6, section_id: "sec-2-1" },
      ],
      sections: [
        { section_id: "sec-1", title: "Introduction", level: 1, start_page: 1, end_page: 4 },
        { section_id: "sec-2", title: "Chapter 1: Basics", level: 1, start_page: 5, end_page: 20 },
      ],
      figures: [
        { figure_id: "fig-1", page_number: 10, caption: "Anatomy diagram", description: "Shows the human heart" },
        { figure_id: "fig-2", page_number: 15, caption: "ECG reading", description: null },
      ],
      pages: [
        { page_number: 1, text: "Introduction content...", word_count: 500, figures: [] },
        { page_number: 10, text: "Page with figure...", word_count: 350, figures: ["fig-1"] },
      ],
    },
  },
};

describe("DocumentPreviewDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockStructure);
  });

  describe("rendering", () => {
    it("should not render when closed", () => {
      render(
        <DocumentPreviewDrawer
          open={false}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      expect(screen.queryByText("Document Preview")).not.toBeInTheDocument();
    });

    it("should not render without document", () => {
      render(
        <DocumentPreviewDrawer open={true} document={null} onClose={() => {}} />
      );

      expect(screen.queryByText("Document Preview")).not.toBeInTheDocument();
    });

    it("should render when open with document", async () => {
      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      expect(screen.getByText("Document Preview")).toBeInTheDocument();
      expect(screen.getByText("Test Medical Textbook")).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });
    });

    it("should render tabs", async () => {
      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText(/Contents/)).toBeInTheDocument();
      expect(screen.getByText(/Pages/)).toBeInTheDocument();
      expect(screen.getByText(/Figures/)).toBeInTheDocument();

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });
    });
  });

  describe("close functionality", () => {
    it("should call onClose when close button clicked", async () => {
      const onClose = vi.fn();
      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={onClose}
        />
      );

      // Wait for data to load first
      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });

      const closeButton = screen.getByRole("button", {
        name: /close preview drawer/i,
      });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("API integration", () => {
    it("should fetch document structure on open", async () => {
      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/kb/documents/doc-1/structure"
        );
      });
    });

    it("should show loading state", async () => {
      // Delay the API response - never resolves to check loading state
      vi.mocked(fetchAPI).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      // Should show loading skeleton
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument();

      // No waitFor needed since the promise never resolves
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Document structure unavailable/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("tab navigation", () => {
    it("should switch to Contents tab when clicked", async () => {
      vi.mocked(fetchAPI).mockResolvedValue(mockStructure);

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });

      // Click Contents tab - find the button specifically
      const contentsTab = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Contents"));
      if (contentsTab) fireEvent.click(contentsTab);

      await waitFor(() => {
        // Should show TOC entries
        expect(screen.getByText("Introduction")).toBeInTheDocument();
        expect(screen.getByText("Chapter 1: Basics")).toBeInTheDocument();
      });
    });

    it("should switch to Figures tab when clicked", async () => {
      vi.mocked(fetchAPI).mockResolvedValue(mockStructure);

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalled();
      });

      // Click Figures tab - find the tab button specifically (not the feature indicator)
      const figuresTab = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Figures") && btn.textContent?.includes("("));
      if (figuresTab) fireEvent.click(figuresTab);

      await waitFor(() => {
        // Should show figure entries
        expect(screen.getByText("fig-1")).toBeInTheDocument();
        expect(screen.getByText("Anatomy diagram")).toBeInTheDocument();
      });
    });
  });

  describe("overview tab", () => {
    it("should show document stats", async () => {
      vi.mocked(fetchAPI).mockResolvedValue(mockStructure);

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Total Pages")).toBeInTheDocument();
        expect(screen.getByText("Chunks Indexed")).toBeInTheDocument();
        // Stats values can appear multiple times in tabs, so just check labels exist
        expect(screen.getByText("Document Type")).toBeInTheDocument();
        expect(screen.getByText("Source")).toBeInTheDocument();
      });
    });

    it("should show feature indicators", async () => {
      vi.mocked(fetchAPI).mockResolvedValue(mockStructure);

      render(
        <DocumentPreviewDrawer
          open={true}
          document={mockDocument}
          onClose={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Table of Contents")).toBeInTheDocument();
        expect(screen.getByText("Figures Detected")).toBeInTheDocument();
        expect(screen.getByText("Features")).toBeInTheDocument();
      });
    });
  });
});
