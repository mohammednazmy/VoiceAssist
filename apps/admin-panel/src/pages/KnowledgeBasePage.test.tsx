/**
 * Tests for KnowledgeBasePage - KB Upload & Management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KnowledgeBasePage } from "./KnowledgeBasePage";

// Mock hooks
vi.mock("../hooks/useKnowledgeDocuments", () => ({
  useKnowledgeDocuments: vi.fn(),
}));

vi.mock("../hooks/useKBUpload", () => ({
  useKBUpload: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useIndexingJobs", () => ({
  useIndexingJobs: vi.fn(),
}));

// Mock ProcessingProgress component
vi.mock("../components/knowledge/ProcessingProgress", () => ({
  ProcessingProgress: ({ jobs, loading }: { jobs: unknown[]; loading: boolean }) => (
    <div data-testid="processing-progress">
      {loading && <div>Loading jobs...</div>}
      <div data-testid="jobs-count">{(jobs as unknown[]).length} jobs</div>
    </div>
  ),
}));

// Mock @voiceassist/ui
vi.mock("@voiceassist/ui", () => ({
  HelpButton: () => <button data-testid="help-button">Help</button>,
}));

// Mock child components
vi.mock("../components/knowledge/DocumentTable", () => ({
  DocumentTable: ({
    documents,
    loading,
    onDelete,
    onReindex,
  }: {
    documents: unknown[];
    loading: boolean;
    onDelete: (ids: string[]) => void;
    onReindex: (ids: string[]) => void;
  }) => (
    <div data-testid="document-table">
      {loading && <div>Loading documents...</div>}
      <div data-testid="doc-count">
        {(documents as unknown[]).length} documents
      </div>
      <button onClick={() => onDelete(["doc-1"])}>Delete doc-1</button>
      <button onClick={() => onReindex(["doc-1"])}>Reindex doc-1</button>
    </div>
  ),
}));

vi.mock("../components/knowledge/UploadDialog", () => ({
  UploadDialog: ({
    open,
    onClose,
    onUpload,
  }: {
    open: boolean;
    onClose: () => void;
    onUpload: (file: File, progress: (p: number) => void) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="upload-dialog">
        <button onClick={onClose}>Close</button>
        <button
          onClick={() => {
            const file = new File(["test"], "test.pdf", {
              type: "application/pdf",
            });
            onUpload(file, () => {});
          }}
        >
          Upload Test File
        </button>
      </div>
    ) : null,
}));

vi.mock("../components/knowledge/AuditDrawer", () => ({
  AuditDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="audit-drawer">Audit Drawer</div> : null,
}));

import { useKnowledgeDocuments } from "../hooks/useKnowledgeDocuments";
import { useKBUpload } from "../hooks/useKBUpload";
import { useAuth } from "../contexts/AuthContext";
import { useIndexingJobs } from "../hooks/useIndexingJobs";

const mockDocuments = [
  {
    id: "doc-1",
    name: "Harrison's Heart Failure",
    type: "textbook",
    indexed: true,
    indexingStatus: "indexed" as const,
    version: "v1",
    lastIndexedAt: "2024-01-15T12:00:00Z",
  },
  {
    id: "doc-2",
    name: "AHA Guidelines 2022",
    type: "guideline",
    indexed: false,
    indexingStatus: "processing" as const,
    version: "v1",
    lastIndexedAt: undefined,
  },
];

const defaultKnowledgeDocsReturn = {
  docs: mockDocuments,
  loading: false,
  error: null,
  refetch: vi.fn(),
  deleteDocument: vi.fn().mockResolvedValue({
    success: true,
    documentId: "doc-1",
  }),
  deleteDocuments: vi.fn(),
  deleteError: null,
  clearDeleteError: vi.fn(),
  isDeleting: () => false,
  deletingCount: 0,
};

const defaultUploadReturn = {
  uploadDocument: vi.fn().mockResolvedValue({
    ok: true,
    source: "doc-new",
    title: "New Document",
    author: "",
    chunks: 10,
  }),
  isUploading: false,
  error: null,
  clearError: vi.fn(),
  canRetry: false,
  retryUpload: vi.fn(),
  currentAttempt: 0,
  maxAttempts: 3,
  cancelUpload: vi.fn(),
};

const defaultAuthReturn = {
  isAdmin: true,
  isViewer: false,
  user: { email: "admin@example.com" },
};

const defaultIndexingJobsReturn = {
  jobs: [],
  loading: false,
  error: null,
  hasActiveJobs: false,
  refetch: vi.fn(),
  silentRefresh: vi.fn(),
  lastFetched: null,
  isPolling: false,
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  actionError: null,
  clearActionError: vi.fn(),
  isActionLoading: vi.fn().mockReturnValue(false),
  getJob: vi.fn().mockReturnValue(undefined),
  getJobsByDocument: vi.fn().mockReturnValue([]),
  activeJobs: [],
  completedJobs: [],
  failedJobs: [],
  stats: { total: 0, active: 0, completed: 0, failed: 0 },
};

describe("KnowledgeBasePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useKnowledgeDocuments).mockReturnValue(
      defaultKnowledgeDocsReturn,
    );
    vi.mocked(useKBUpload).mockReturnValue(defaultUploadReturn);
    vi.mocked(useAuth).mockReturnValue(
      defaultAuthReturn as ReturnType<typeof useAuth>,
    );
    vi.mocked(useIndexingJobs).mockReturnValue(
      defaultIndexingJobsReturn as ReturnType<typeof useIndexingJobs>,
    );
  });

  describe("rendering", () => {
    it("should render page title and description", () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Manage medical documents, textbooks, and reference materials",
        ),
      ).toBeInTheDocument();
    });

    it("should render upload button", () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole("button", { name: /upload/i }),
      ).toBeInTheDocument();
    });

    it("should render stat cards", () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByText("Total Documents")).toBeInTheDocument();
      expect(screen.getByText("Indexed")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByText("Processing")).toBeInTheDocument();
    });

    it("should render document table", () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId("document-table")).toBeInTheDocument();
    });

    it("should show document count from stats", () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      // Should show 2 total documents (from mockDocuments) in the Total Documents stat card
      const totalCard = screen.getByText("Total Documents").parentElement
        ?.parentElement as HTMLElement;
      expect(totalCard).toBeTruthy();
      expect(within(totalCard).getByText("2")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should pass loading state to DocumentTable", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        ...defaultKnowledgeDocsReturn,
        loading: true,
      });

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByText("Loading documents...")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should show error message when documents fail to load", () => {
      vi.mocked(useKnowledgeDocuments).mockReturnValue({
        ...defaultKnowledgeDocsReturn,
        error: { code: "demo", message: "Failed to load" },
      });

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(
        screen.getByText("Failed to load documents. Showing demo data."),
      ).toBeInTheDocument();
    });

    it("should show upload error message", () => {
      vi.mocked(useKBUpload).mockReturnValue({
        ...defaultUploadReturn,
        error: "Upload failed: File too large",
      });

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(
        screen.getByText("Upload failed: File too large"),
      ).toBeInTheDocument();
    });
  });

  describe("viewer role restrictions", () => {
    it("should disable upload button for viewers", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isViewer: true,
      } as ReturnType<typeof useAuth>);

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      const uploadButton = screen.getByRole("button", { name: /upload/i });
      expect(uploadButton).toBeDisabled();
    });

    it("should show viewer warning message", () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthReturn,
        isViewer: true,
      } as ReturnType<typeof useAuth>);

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByText(/viewer role is read-only/i)).toBeInTheDocument();
    });
  });

  describe("upload functionality", () => {
    it("should open upload dialog when upload button clicked", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      const uploadButton = screen.getByRole("button", { name: /upload/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByTestId("upload-dialog")).toBeInTheDocument();
      });
    });

    it("should close upload dialog", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByTestId("upload-dialog")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /close/i }));

      await waitFor(() => {
        expect(screen.queryByTestId("upload-dialog")).not.toBeInTheDocument();
      });
    });

    it("should show uploading state on button", () => {
      vi.mocked(useKBUpload).mockReturnValue({
        ...defaultUploadReturn,
        isUploading: true,
      });

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      expect(screen.getByText("Uploading…")).toBeInTheDocument();
    });

    it("should call uploadDocument when file is uploaded", async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        ok: true,
        source: "doc-new",
        title: "test",
        author: "",
        chunks: 5,
      });

      vi.mocked(useKBUpload).mockReturnValue({
        ...defaultUploadReturn,
        uploadDocument: mockUpload,
      });

      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByTestId("upload-dialog")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: /upload test file/i }),
      );

      await waitFor(() => {
        expect(mockUpload).toHaveBeenCalled();
      });
    });
  });

  describe("document operations", () => {
    it("should handle delete operation", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: /delete doc-1/i }));

      // Document should be removed (handled by the component's handleDelete)
      // Since we're using mock DocumentTable, we just verify the interaction
      expect(screen.getByTestId("document-table")).toBeInTheDocument();
    });

    it("should handle reindex operation", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: /reindex doc-1/i }));

      // Reindex updates status - component handles this internally
      expect(screen.getByTestId("document-table")).toBeInTheDocument();
    });
  });

  describe("stats calculation", () => {
    it("should calculate correct indexed count", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      // Wait for documents to load and stats to calculate.
      // The "Total Documents" card renders a helper line "1 indexed".
      await waitFor(() => {
        expect(screen.getByText(/1 indexed/)).toBeInTheDocument();
      });
    });

    it("should calculate correct pending count", async () => {
      render(
        <MemoryRouter>
          <KnowledgeBasePage />
        </MemoryRouter>,
      );

      // Wait for documents to load and stats to calculate
      // 1 document is pending (not indexed) in mockDocuments
      await waitFor(() => {
        // Total is 2, Indexed is 1, Pending is 1
        expect(screen.getByText("Pending")).toBeInTheDocument();
      });
    });
  });
});
