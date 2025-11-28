/**
 * Tests for KnowledgeBase component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnowledgeBase } from "../KnowledgeBase";
import { useKnowledgeDocuments } from "../../hooks/useKnowledgeDocuments";
import { useIndexingJobs } from "../../hooks/useIndexingJobs";

// Mock the hooks
vi.mock("../../hooks/useKnowledgeDocuments", () => ({
  useKnowledgeDocuments: vi.fn(),
}));

vi.mock("../../hooks/useIndexingJobs", () => ({
  useIndexingJobs: vi.fn(),
}));

const mockDocs = [
  {
    id: "doc-1",
    name: "Medical Guidelines 2024",
    type: "pdf",
    version: "1.0",
    indexed: true,
  },
  {
    id: "doc-2",
    name: "Clinical Notes Template",
    type: "txt",
    version: "2.1",
    indexed: false,
  },
];

const mockJobs = [
  {
    id: "job-1",
    documentId: "doc-2",
    state: "processing",
  },
  {
    id: "job-2",
    documentId: "doc-3",
    state: "queued",
  },
];

describe("KnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders section heading", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: mockDocs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: mockJobs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
    });

    it("renders description text", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(
        screen.getByText(/Textbooks, journals, guidelines, and notes indexed/),
      ).toBeInTheDocument();
    });

    it("renders upload button", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("+ Upload document")).toBeInTheDocument();
    });
  });

  describe("documents section", () => {
    it("renders documents table header", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: mockDocs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Version")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("renders document rows", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: mockDocs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("Medical Guidelines 2024")).toBeInTheDocument();
      expect(screen.getByText("Clinical Notes Template")).toBeInTheDocument();
    });

    it("renders indexed status badge", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [mockDocs[0]], // Only indexed doc
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("indexed")).toBeInTheDocument();
    });

    it("renders pending status badge", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [mockDocs[1]], // Only pending doc
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("pending")).toBeInTheDocument();
    });

    it("shows loading indicator when loading documents", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: true,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      // Check for loading text in documents section
      const loadingTexts = screen.getAllByText("Loading…");
      expect(loadingTexts.length).toBeGreaterThan(0);
    });

    it("shows empty message when no documents", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(
        screen.getByText(/No documents yet. Upload a PDF/),
      ).toBeInTheDocument();
    });
  });

  describe("indexing jobs section", () => {
    it("renders indexing jobs header", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: mockJobs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("Indexing Jobs")).toBeInTheDocument();
    });

    it("renders indexing job entries", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: mockJobs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("doc-2")).toBeInTheDocument();
      expect(screen.getByText("doc-3")).toBeInTheDocument();
    });

    it("renders job states", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: mockJobs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("processing")).toBeInTheDocument();
      expect(screen.getByText("queued")).toBeInTheDocument();
    });

    it("renders job IDs", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: mockJobs,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText("Job job-1")).toBeInTheDocument();
      expect(screen.getByText("Job job-2")).toBeInTheDocument();
    });

    it("shows loading indicator when loading jobs", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      const loadingTexts = screen.getAllByText("Loading…");
      expect(loadingTexts.length).toBeGreaterThan(0);
    });

    it("shows empty message when no jobs", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(screen.getByText(/No indexing jobs yet/)).toBeInTheDocument();
    });
  });

  describe("layout", () => {
    it("renders as a section element with id", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = render(<KnowledgeBase />);

      const section = container.querySelector("section#kb");
      expect(section).toBeInTheDocument();
    });

    it("renders two-column grid layout", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = render(<KnowledgeBase />);

      const grid = container.querySelector(".grid");
      expect(grid).toBeInTheDocument();
    });
  });

  describe("hook integration", () => {
    it("calls useKnowledgeDocuments hook", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(useKnowledgeDocuments).toHaveBeenCalled();
    });

    it("calls useIndexingJobs hook", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        docs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(useIndexingJobs).mockReturnValue({
        jobs: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<KnowledgeBase />);

      expect(useIndexingJobs).toHaveBeenCalled();
    });
  });
});
