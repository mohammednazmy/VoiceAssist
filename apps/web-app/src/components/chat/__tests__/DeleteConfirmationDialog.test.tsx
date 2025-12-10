/**
 * DeleteConfirmationDialog Unit Tests
 * Tests dialog visibility, content preview, actions, and loading states
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";

describe("DeleteConfirmationDialog", () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  const defaultProps = {
    isOpen: true,
    messageContent: "This is a test message content",
    messageRole: "user" as const,
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render when isOpen is true", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(
        screen.getByTestId("delete-confirmation-dialog"),
      ).toBeInTheDocument();
    });

    it("should not render when isOpen is false", () => {
      render(<DeleteConfirmationDialog {...defaultProps} isOpen={false} />);

      expect(
        screen.queryByTestId("delete-confirmation-dialog"),
      ).not.toBeInTheDocument();
    });

    it("should display dialog title", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByText("Delete message?")).toBeInTheDocument();
    });

    it("should display warning description", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(
        screen.getByText(/this action cannot be undone/i),
      ).toBeInTheDocument();
    });
  });

  describe("message preview", () => {
    it("should display message content preview", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(
        screen.getByText("This is a test message content"),
      ).toBeInTheDocument();
    });

    it("should truncate long messages", () => {
      const longMessage = "A".repeat(200);
      render(
        <DeleteConfirmationDialog
          {...defaultProps}
          messageContent={longMessage}
        />,
      );

      // Should truncate at 150 chars and add "..."
      expect(screen.getByText(/A{150}\.\.\./)).toBeInTheDocument();
    });

    it("should show correct label for user messages", () => {
      render(<DeleteConfirmationDialog {...defaultProps} messageRole="user" />);

      expect(screen.getByText("Your message")).toBeInTheDocument();
    });

    it("should show correct label for assistant messages", () => {
      render(
        <DeleteConfirmationDialog {...defaultProps} messageRole="assistant" />,
      );

      expect(screen.getByText("Assistant message")).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("should call onConfirm when Delete button is clicked", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} />);

      await user.click(screen.getByTestId("delete-confirm-button"));

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it("should call onCancel when Cancel button is clicked", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} />);

      await user.click(screen.getByTestId("delete-cancel-button"));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it("should call onCancel when Escape key is pressed", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} />);

      await user.keyboard("{Escape}");

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it("should call onCancel when clicking backdrop", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} />);

      // Click the backdrop (the outer div)
      const backdrop = screen.getByTestId("delete-confirmation-dialog");
      await user.click(backdrop);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("loading state", () => {
    it("should disable buttons when isDeleting is true", () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      expect(screen.getByTestId("delete-confirm-button")).toBeDisabled();
      expect(screen.getByTestId("delete-cancel-button")).toBeDisabled();
    });

    it("should show spinner when isDeleting is true", () => {
      const { container } = render(
        <DeleteConfirmationDialog {...defaultProps} isDeleting={true} />,
      );

      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("should show 'Deleting...' text when isDeleting is true", () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      expect(screen.getByText("Deleting...")).toBeInTheDocument();
    });

    it("should show 'Delete' text when not deleting", () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={false} />);

      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("should not call onCancel when Escape is pressed while deleting", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      await user.keyboard("{Escape}");

      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it("should not close on backdrop click while deleting", async () => {
      const user = userEvent.setup();

      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      const backdrop = screen.getByTestId("delete-confirmation-dialog");
      await user.click(backdrop);

      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "delete-dialog-title");
      expect(dialog).toHaveAttribute(
        "aria-describedby",
        "delete-dialog-description",
      );
    });

    it("should have accessible title", () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(
        screen.getByRole("heading", { name: /delete message/i }),
      ).toBeInTheDocument();
    });
  });
});
