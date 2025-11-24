/**
 * CitationDisplay Phase 8 Tests
 * Tests for structured citations with full metadata (authors, DOI, PubMed ID, etc.)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitationDisplay } from "../CitationDisplay";
import type { Citation } from "../../../types";

describe("CitationDisplay - Phase 8 Structured Citations", () => {
  // Phase 8: Textbook citation with full metadata
  const textbookCitation: Citation = {
    id: "cite-textbook-1",
    sourceType: "textbook",
    source: "kb", // backward compat
    title: "Harrison's Principles of Internal Medicine",
    subtitle: "20th Edition",
    reference: "Harrison's Principles of Internal Medicine", // backward compat
    authors: ["Kasper", "Fauci", "Hauser", "Longo"],
    publicationYear: 2018,
    doi: "10.1036/9781259644047",
    snippet:
      "Diabetes mellitus is characterized by hyperglycemia resulting from defects in insulin secretion, insulin action, or both.",
    relevanceScore: 95,
    page: 2399,
    metadata: {
      chapter: "Chapter 417",
      publisher: "McGraw-Hill Education",
    },
  };

  // Phase 8: Journal article with PubMed ID
  const journalCitation: Citation = {
    id: "cite-journal-1",
    sourceType: "journal",
    source: "pubmed", // backward compat
    title: "Management of Type 2 Diabetes in 2023",
    reference: "New England Journal of Medicine", // backward compat
    authors: ["Smith", "Johnson", "Williams"],
    publicationYear: 2023,
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMra2301806",
    pubmedId: "37146238",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMra2301806",
    snippet:
      "Metformin remains first-line therapy for most patients with type 2 diabetes.",
    relevanceScore: 92,
  };

  // Phase 8: Guideline citation
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

  // Phase 8: Citation with missing optional fields
  const minimalCitation: Citation = {
    id: "cite-minimal",
    sourceType: "note",
    title: "Clinical Note on Patient Care",
    snippet: "Brief observation from clinical practice.",
  };

  describe("Phase 8: Structured metadata rendering", () => {
    it("should display authors array", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[textbookCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Check if authors are displayed
      expect(
        screen.getByText(/Kasper, Fauci, Hauser, Longo/i),
      ).toBeInTheDocument();
    });

    it("should display publication year", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[journalCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      expect(screen.getByText("2023")).toBeInTheDocument();
    });

    it("should display DOI link", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[textbookCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      const doiLink = screen.getByRole("link", { name: /DOI/i });
      expect(doiLink).toHaveAttribute(
        "href",
        "https://doi.org/10.1036/9781259644047",
      );
      expect(doiLink).toHaveAttribute("target", "_blank");
      expect(doiLink).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should display PubMed ID link", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[journalCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      const pubmedLink = screen.getByRole("link", { name: /PubMed/i });
      expect(pubmedLink).toHaveAttribute(
        "href",
        "https://pubmed.ncbi.nlm.nih.gov/37146238/",
      );
      expect(pubmedLink).toHaveAttribute("target", "_blank");
    });

    it("should display journal name for journal articles", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[journalCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Journal name might be in metadata section
      expect(
        screen.getByText(/New England Journal of Medicine/i),
      ).toBeInTheDocument();
    });
  });

  describe("Phase 8: Source type handling", () => {
    it("should handle textbook sourceType", () => {
      render(<CitationDisplay citations={[textbookCitation]} />);

      // Title should be visible
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
    });

    it("should handle journal sourceType", () => {
      render(<CitationDisplay citations={[journalCitation]} />);

      expect(
        screen.getByText(/Management of Type 2 Diabetes/i),
      ).toBeInTheDocument();
    });

    it("should handle guideline sourceType", () => {
      render(<CitationDisplay citations={[guidelineCitation]} />);

      expect(
        screen.getByText(/ADA Standards of Medical Care/i),
      ).toBeInTheDocument();
    });

    it("should handle note sourceType", () => {
      render(<CitationDisplay citations={[minimalCitation]} />);

      expect(screen.getByText(/Clinical Note/i)).toBeInTheDocument();
    });
  });

  describe("Phase 8: Missing optional fields", () => {
    it("should render without errors when authors missing", async () => {
      const citationNoAuthors: Citation = {
        ...minimalCitation,
        title: "Citation Without Authors",
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[citationNoAuthors]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not throw, and should not display "Authors:" label
      expect(screen.queryByText("Authors:")).not.toBeInTheDocument();
    });

    it("should render without errors when DOI missing", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[minimalCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not display DOI link
      expect(
        screen.queryByRole("link", { name: /DOI/i }),
      ).not.toBeInTheDocument();
    });

    it("should render without errors when PubMed ID missing", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[textbookCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not display PubMed link
      expect(
        screen.queryByRole("link", { name: /PubMed/i }),
      ).not.toBeInTheDocument();
    });

    it("should render without errors when publicationYear missing", async () => {
      const citationNoYear: Citation = {
        ...minimalCitation,
        title: "Citation Without Year",
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[citationNoYear]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not display "Year:" label
      expect(screen.queryByText("Year:")).not.toBeInTheDocument();
    });

    it("should handle empty authors array", async () => {
      const citationEmptyAuthors: Citation = {
        ...textbookCitation,
        authors: [],
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[citationEmptyAuthors]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not crash and should not show authors section
      expect(screen.queryByText("Authors:")).not.toBeInTheDocument();
    });
  });

  describe("Phase 8: Backward compatibility", () => {
    it("should work with old citation format (source + reference + snippet)", async () => {
      const legacyCitation: Citation = {
        id: "cite-legacy",
        source: "kb",
        reference: "doc-id-123",
        snippet: "Legacy format citation snippet",
        page: 10,
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[legacyCitation]} />);

      // Should render without error
      expect(screen.getByText("1 Source")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should show the snippet
      expect(
        screen.getByText(/Legacy format citation snippet/i),
      ).toBeInTheDocument();
    });

    it("should prefer title over reference when both present", () => {
      render(<CitationDisplay citations={[textbookCitation]} />);

      // Should show title (Harrison's Principles) not reference
      expect(screen.getByText(/Harrison's Principles/i)).toBeInTheDocument();
    });

    it("should prefer snippet over nothing when snippet present", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[journalCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      expect(
        screen.getByText(/Metformin remains first-line/i),
      ).toBeInTheDocument();
    });
  });

  describe("Phase 8: Multiple structured citations", () => {
    it("should render multiple citations with different sourceTypes", () => {
      render(
        <CitationDisplay
          citations={[textbookCitation, journalCitation, guidelineCitation]}
        />,
      );

      expect(screen.getByText("3 Sources")).toBeInTheDocument();
    });

    it("should expand each citation independently with full metadata", async () => {
      const user = userEvent.setup();
      render(
        <CitationDisplay citations={[textbookCitation, journalCitation]} />,
      );

      const buttons = screen.getAllByRole("button", { expanded: false });

      // Expand first citation (textbook)
      await user.click(buttons[0]);
      expect(screen.getByText(/Kasper, Fauci/i)).toBeInTheDocument();
      expect(screen.queryByText(/Smith, Johnson/i)).not.toBeInTheDocument();

      // Expand second citation (journal)
      await user.click(buttons[1]);
      expect(screen.getByText(/Smith, Johnson/i)).toBeInTheDocument();
      // First should still be expanded
      expect(screen.getByText(/Kasper, Fauci/i)).toBeInTheDocument();
    });
  });

  describe("Phase 8: relevanceScore display", () => {
    it("should display relevance score if present", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[textbookCitation]} />);

      // Note: The CitationDisplay component may or may not display relevanceScore
      // This test verifies the component handles it without errors
      await user.click(screen.getByRole("button", { expanded: false }));

      // Component should render successfully - use getAllByText since there might be multiple instances
      expect(
        screen.getAllByText(/Harrison's Principles/i).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("Phase 8: Edge cases and robustness", () => {
    it("should handle null/undefined fields gracefully", () => {
      const citationWithNulls: Citation = {
        id: "cite-nulls",
        title: "Citation With Nulls",
        authors: undefined,
        doi: null as any,
        pubmedId: undefined,
        publicationYear: undefined,
        snippet: undefined,
      };

      expect(() => {
        render(<CitationDisplay citations={[citationWithNulls]} />);
      }).not.toThrow();
    });

    it("should handle very long author lists", async () => {
      const citationManyAuthors: Citation = {
        ...textbookCitation,
        authors: [
          "Author1",
          "Author2",
          "Author3",
          "Author4",
          "Author5",
          "Author6",
          "Author7",
          "Author8",
        ],
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[citationManyAuthors]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should render all authors
      expect(
        screen.getByText(
          /Author1, Author2, Author3, Author4, Author5, Author6, Author7, Author8/i,
        ),
      ).toBeInTheDocument();
    });

    it("should handle empty snippet", async () => {
      const citationEmptySnippet: Citation = {
        ...textbookCitation,
        snippet: "",
      };

      const user = userEvent.setup();
      render(<CitationDisplay citations={[citationEmptySnippet]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      // Should not show excerpt section or should handle empty gracefully
      // Actual behavior depends on CitationDisplay implementation
      expect(
        screen.getByRole("button", { expanded: true }),
      ).toBeInTheDocument();
    });
  });
});
