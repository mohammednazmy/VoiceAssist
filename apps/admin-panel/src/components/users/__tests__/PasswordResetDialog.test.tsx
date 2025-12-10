/**
 * Tests for PasswordResetDialog component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordResetDialog } from "../PasswordResetDialog";

vi.mock("../../../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../../../lib/api";

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(),
};
Object.assign(navigator, { clipboard: mockClipboard });

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  full_name: "Test User",
};

describe("PasswordResetDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    user: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.writeText.mockResolvedValue(undefined);
  });

  describe("rendering", () => {
    it("renders nothing when isOpen is false", () => {
      render(<PasswordResetDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText("Reset Password")).not.toBeInTheDocument();
    });

    it("renders nothing when user is null", () => {
      render(<PasswordResetDialog {...defaultProps} user={null} />);
      expect(screen.queryByText("Reset Password")).not.toBeInTheDocument();
    });

    it("renders dialog when isOpen and user provided", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: "Reset Password" }),
      ).toBeInTheDocument();
    });

    it("displays user email", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("displays user full name when available", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    it("renders method selection", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(screen.getByText("Temporary Password")).toBeInTheDocument();
      expect(screen.getByText("Email Reset Link")).toBeInTheDocument();
    });

    it("renders reset password button", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /reset password/i }),
      ).toBeInTheDocument();
    });

    it("renders cancel button", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  describe("method selection", () => {
    it("selects temporary password by default", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      const tempRadio = screen.getByRole("radio", { name: /temporary/i });
      expect(tempRadio).toBeChecked();
    });

    it("can switch to email method", async () => {
      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("radio", { name: /email/i }));

      expect(screen.getByRole("radio", { name: /email/i })).toBeChecked();
    });

    it("shows notify user checkbox for temporary method", () => {
      render(<PasswordResetDialog {...defaultProps} />);
      expect(
        screen.getByText("Email temporary password to user"),
      ).toBeInTheDocument();
    });

    it("hides notify user checkbox for email method", async () => {
      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("radio", { name: /email/i }));

      expect(
        screen.queryByText("Email temporary password to user"),
      ).not.toBeInTheDocument();
    });

    it("allows toggling notify user checkbox", async () => {
      render(<PasswordResetDialog {...defaultProps} />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();

      await userEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });
  });

  describe("temporary password flow", () => {
    it("submits temporary password request", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/panel/users/user-123/reset-password",
          {
            method: "POST",
            body: JSON.stringify({
              method: "temporary",
              notify_user: true,
            }),
          },
        );
      });
    });

    it("displays temporary password after success", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Temporary Password Generated"),
        ).toBeInTheDocument();
        expect(screen.getByText("TempPass123!")).toBeInTheDocument();
      });
    });

    it("shows copy button for temporary password", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeInTheDocument();
      });
    });

    it("copies password to clipboard when copy clicked", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Copy"));

      expect(mockClipboard.writeText).toHaveBeenCalledWith("TempPass123!");
    });

    it("shows Copied! after copying", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Copy"));

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });

    it("shows email notification when email_sent is true", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(/password has been emailed/i),
        ).toBeInTheDocument();
      });
    });

    it("shows important warning about password visibility", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: false,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(/will only be shown once/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("email reset flow", () => {
    it("submits email reset request", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "email",
        email_sent: true,
        message: "Reset email sent",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("radio", { name: /email/i }));
      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          "/api/admin/panel/users/user-123/reset-password",
          {
            method: "POST",
            body: JSON.stringify({
              method: "email",
              notify_user: true,
            }),
          },
        );
      });
    });

    it("displays success message for email reset", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "email",
        email_sent: true,
        message: "Reset email sent",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("radio", { name: /email/i }));
      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Reset Email Sent")).toBeInTheDocument();
      });
    });

    it("displays failure message when email fails", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: false,
        method: "email",
        email_sent: false,
        message: "Failed to send email",
      });

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(screen.getByRole("radio", { name: /email/i }));
      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Failed to Send Email")).toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("displays error message on API failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Network error"));

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("displays generic error when error has no message", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce({});

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Failed to reset password"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("shows loading spinner during submission", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      expect(screen.getByText("Processing...")).toBeInTheDocument();
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();

      // Clean up
      resolvePromise!({
        success: true,
        method: "temporary",
        temporary_password: "Test",
      });
    });

    it("disables method selection while loading", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      render(<PasswordResetDialog {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      expect(screen.getByRole("radio", { name: /temporary/i })).toBeDisabled();
      expect(screen.getByRole("radio", { name: /email/i })).toBeDisabled();

      // Clean up
      resolvePromise!({
        success: true,
        method: "temporary",
        temporary_password: "Test",
      });
    });
  });

  describe("dialog close", () => {
    it("calls onClose when cancel clicked", async () => {
      const onClose = vi.fn();
      render(<PasswordResetDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when X button clicked", async () => {
      const onClose = vi.fn();
      render(<PasswordResetDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(screen.getByText("✕"));

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when backdrop clicked", async () => {
      const onClose = vi.fn();
      render(<PasswordResetDialog {...defaultProps} onClose={onClose} />);

      const backdrop = document.querySelector(
        ".absolute.inset-0.bg-black\\/60",
      );
      if (backdrop) {
        await userEvent.click(backdrop);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("calls onClose when Done button clicked (result step)", async () => {
      const onClose = vi.fn();
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      render(<PasswordResetDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Done")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Done"));

      expect(onClose).toHaveBeenCalled();
    });

    it("resets state when dialog closes", async () => {
      const onClose = vi.fn();
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        method: "temporary",
        temporary_password: "TempPass123!",
        email_sent: true,
        message: "Password reset successful",
      });

      const { rerender } = render(
        <PasswordResetDialog {...defaultProps} onClose={onClose} />,
      );

      // Go to result step
      await userEvent.click(
        screen.getByRole("button", { name: /reset password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Temporary Password Generated"),
        ).toBeInTheDocument();
      });

      // Close and reopen
      await userEvent.click(screen.getByText("Done"));
      rerender(
        <PasswordResetDialog
          {...defaultProps}
          onClose={onClose}
          isOpen={true}
        />,
      );

      // Should be back to select step
      expect(screen.getByText("Reset Method")).toBeInTheDocument();
    });
  });
});
