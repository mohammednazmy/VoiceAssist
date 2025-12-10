/**
 * Tests for AuditDrawer component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuditDrawer } from "../AuditDrawer";
import { fetchAPI } from "../../../lib/api";

// Mock fetchAPI
vi.mock("../../../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

const mockDocument = {
  id: "doc-1",
  name: "Medical Guidelines 2024",
  type: "pdf",
  version: "1.0",
  indexed: true,
};

const mockAuditEvents = [
  {
    id: "evt-1",
    action: "indexed",
    actor: "system/kb-indexer",
    timestamp: "2024-01-15T12:00:00Z",
    notes: "Initial ingestion completed.",
  },
  {
    id: "evt-2",
    action: "uploaded",
    actor: "admin@example.com",
    timestamp: "2024-01-15T11:00:00Z",
    notes: "Uploaded Medical Guidelines 2024",
  },
];

describe("AuditDrawer", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockAuditEvents);
  });

  describe("visibility", () => {
    it("renders nothing when closed", () => {
      const { container } = render(
        <AuditDrawer open={false} document={mockDocument} onClose={onClose} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when no document provided", () => {
      const { container } = render(
        <AuditDrawer open={true} document={null} onClose={onClose} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders drawer when open with document", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      expect(screen.getByText("Audit Trail")).toBeInTheDocument();
    });
  });

  describe("drawer content", () => {
    it("displays document name", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      expect(screen.getByText("Medical Guidelines 2024")).toBeInTheDocument();
    });

    it("shows loading state while fetching", () => {
      vi.mocked(fetchAPI).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      expect(screen.getByText("Loading audit events…")).toBeInTheDocument();
    });

    it("displays audit events after loading", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(screen.getByText("indexed")).toBeInTheDocument();
        expect(screen.getByText("uploaded")).toBeInTheDocument();
      });
    });

    it("displays event notes", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Initial ingestion completed."),
        ).toBeInTheDocument();
      });
    });

    it("displays event actors", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Actor: system/kb-indexer"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Actor: admin@example.com"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("close button", () => {
    it("renders close button", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      expect(screen.getByLabelText("Close audit drawer")).toBeInTheDocument();
    });

    it("calls onClose when close button clicked", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      fireEvent.click(screen.getByLabelText("Close audit drawer"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("API calls", () => {
    it("fetches audit events with document id", async () => {
      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/kb/documents/doc-1/audit",
        );
      });
    });

    it("does not fetch when closed", () => {
      render(
        <AuditDrawer open={false} document={mockDocument} onClose={onClose} />,
      );

      expect(fetchAPI).not.toHaveBeenCalled();
    });

    it("does not fetch when no document", () => {
      render(<AuditDrawer open={true} document={null} onClose={onClose} />);

      expect(fetchAPI).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("shows fallback events on API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Audit trail service unavailable/),
        ).toBeInTheDocument();
      });
    });

    it("shows fallback demo events on error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        // Should show fallback events with document name
        expect(
          screen.getByText(/Uploaded Medical Guidelines 2024/),
        ).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("shows empty message when no events", async () => {
      vi.mocked(fetchAPI).mockResolvedValue([]);

      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("No audit events recorded yet."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("event display", () => {
    it("displays 'No additional details' when notes missing", async () => {
      vi.mocked(fetchAPI).mockResolvedValue([
        {
          id: "evt-1",
          action: "created",
          actor: "admin@example.com",
          timestamp: "2024-01-15T12:00:00Z",
          // no notes
        },
      ]);

      render(
        <AuditDrawer open={true} document={mockDocument} onClose={onClose} />,
      );

      await waitFor(() => {
        expect(screen.getByText("No additional details")).toBeInTheDocument();
      });
    });
  });
});
