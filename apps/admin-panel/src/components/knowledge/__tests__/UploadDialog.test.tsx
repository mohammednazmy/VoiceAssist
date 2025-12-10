/**
 * Tests for UploadDialog component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadDialog } from "../UploadDialog";

describe("UploadDialog", () => {
  const onClose = vi.fn();
  const onUpload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onUpload.mockResolvedValue(undefined);
  });

  describe("visibility", () => {
    it("renders nothing when closed", () => {
      const { container } = render(
        <UploadDialog open={false} onClose={onClose} onUpload={onUpload} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders dialog when open", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      expect(screen.getByText("Upload documents")).toBeInTheDocument();
    });
  });

  describe("dialog content", () => {
    it("shows file size limit", () => {
      render(
        <UploadDialog
          open={true}
          onClose={onClose}
          onUpload={onUpload}
          maxSizeMb={25}
        />,
      );

      expect(screen.getByText(/up to 25MB/)).toBeInTheDocument();
    });

    it("shows accepted file types", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      expect(screen.getByText(/Accepted: pdf, plain/)).toBeInTheDocument();
    });

    it("shows custom file types", () => {
      render(
        <UploadDialog
          open={true}
          onClose={onClose}
          onUpload={onUpload}
          acceptedTypes={["application/pdf", "text/markdown"]}
        />,
      );

      expect(screen.getByText(/Accepted: pdf, markdown/)).toBeInTheDocument();
    });

    it("renders drop zone", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      expect(
        screen.getByText("Drop files or click to select"),
      ).toBeInTheDocument();
    });
  });

  describe("buttons", () => {
    it("renders cancel button", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders upload button disabled initially", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const uploadBtn = screen.getByRole("button", { name: "Start upload" });
      expect(uploadBtn).toBeDisabled();
    });

    it("calls onClose when cancel clicked", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when close button clicked", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      fireEvent.click(screen.getByLabelText("Close upload dialog"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("file selection", () => {
    const createFile = (name: string, size: number, type: string) => {
      const file = new File(["x".repeat(size)], name, { type });
      Object.defineProperty(file, "size", { value: size });
      return file;
    };

    it("shows selected file in list", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024 * 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });

    it("shows file size", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024 * 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    });

    it("enables upload button when valid file selected", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024 * 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      const uploadBtn = screen.getByRole("button", { name: "Start upload" });
      expect(uploadBtn).not.toBeDisabled();
    });
  });

  describe("file validation", () => {
    const createFile = (name: string, size: number, type: string) => {
      const file = new File(["x".repeat(size)], name, { type });
      Object.defineProperty(file, "size", { value: size });
      return file;
    };

    it("shows error for file exceeding size limit", () => {
      render(
        <UploadDialog
          open={true}
          onClose={onClose}
          onUpload={onUpload}
          maxSizeMb={1}
        />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("large.pdf", 2 * 1024 * 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      expect(screen.getByText("File exceeds 1MB limit")).toBeInTheDocument();
    });

    it("shows error for unsupported file type", () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("image.png", 1024, "image/png");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      expect(screen.getByText(/Unsupported type/)).toBeInTheDocument();
    });

    it("disables upload button when file has error", () => {
      render(
        <UploadDialog
          open={true}
          onClose={onClose}
          onUpload={onUpload}
          maxSizeMb={1}
        />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("large.pdf", 2 * 1024 * 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      const uploadBtn = screen.getByRole("button", { name: "Start upload" });
      expect(uploadBtn).toBeDisabled();
    });
  });

  describe("upload process", () => {
    const createFile = (name: string, size: number, type: string) => {
      const file = new File(["x".repeat(size)], name, { type });
      Object.defineProperty(file, "size", { value: size });
      return file;
    };

    it("calls onUpload with file when submitted", async () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      fireEvent.click(screen.getByRole("button", { name: "Start upload" }));

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalled();
      });
    });

    it("shows uploading state during upload", async () => {
      // Make upload take some time
      onUpload.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      fireEvent.click(screen.getByRole("button", { name: "Start upload" }));

      expect(screen.getByText("Uploading…")).toBeInTheDocument();
    });

    it("closes dialog on successful upload", async () => {
      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      fireEvent.click(screen.getByRole("button", { name: "Start upload" }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("shows error message on upload failure", async () => {
      onUpload.mockRejectedValue(new Error("Upload failed"));

      render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = createFile("test.pdf", 1024, "application/pdf");

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      fireEvent.click(screen.getByRole("button", { name: "Start upload" }));

      await waitFor(() => {
        expect(screen.getByText("Upload failed")).toBeInTheDocument();
      });
    });
  });

  describe("state reset", () => {
    it("clears files when dialog closes and reopens", () => {
      const { rerender } = render(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["content"], "test.pdf", {
        type: "application/pdf",
      });

      Object.defineProperty(input, "files", {
        value: [file],
      });
      fireEvent.change(input);

      expect(screen.getByText("test.pdf")).toBeInTheDocument();

      // Close dialog
      rerender(
        <UploadDialog open={false} onClose={onClose} onUpload={onUpload} />,
      );

      // Reopen dialog
      rerender(
        <UploadDialog open={true} onClose={onClose} onUpload={onUpload} />,
      );

      // File list should be empty
      expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
    });
  });
});
