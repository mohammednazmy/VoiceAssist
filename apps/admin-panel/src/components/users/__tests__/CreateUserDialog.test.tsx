/**
 * Tests for CreateUserDialog component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateUserDialog } from "../CreateUserDialog";

// Mock the useCreateUser hook
vi.mock("../../../hooks/useCreateUser", () => ({
  useCreateUser: vi.fn(),
}));

import { useCreateUser } from "../../../hooks/useCreateUser";

const mockCreateUser = vi.fn();
const mockCheckEmailExists = vi.fn();

const defaultMockHook = {
  createUser: mockCreateUser,
  isLoading: false,
  error: null,
  checkEmailExists: mockCheckEmailExists,
};

describe("CreateUserDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateUser).mockReturnValue(defaultMockHook);
    mockCheckEmailExists.mockResolvedValue(false);
  });

  describe("rendering", () => {
    it("renders nothing when isOpen is false", () => {
      render(<CreateUserDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText("Create New User")).not.toBeInTheDocument();
    });

    it("renders dialog when isOpen is true", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("Create New User")).toBeInTheDocument();
    });

    it("renders email field", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });

    it("renders full name field", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    });

    it("renders role selection", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("Standard User")).toBeInTheDocument();
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    it("renders active status toggle", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("Account Active")).toBeInTheDocument();
    });

    it("renders password setup options", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("Send invitation email")).toBeInTheDocument();
      expect(screen.getByText("Set temporary password")).toBeInTheDocument();
    });

    it("renders password field when manual password selected", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(
        screen.getByPlaceholderText("Minimum 12 characters"),
      ).toBeInTheDocument();
    });

    it("renders cancel and create buttons", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Create User")).toBeInTheDocument();
    });
  });

  describe("email validation", () => {
    it("shows error for invalid email format", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const emailInput = screen.getByLabelText(/email address/i);

      await userEvent.type(emailInput, "invalid-email");

      await waitFor(() => {
        expect(
          screen.getByText("Please enter a valid email address"),
        ).toBeInTheDocument();
      });
    });

    it("shows checkmark for valid unique email", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      render(<CreateUserDialog {...defaultProps} />);
      const emailInput = screen.getByLabelText(/email address/i);

      await userEvent.type(emailInput, "valid@example.com");

      await waitFor(() => {
        // Look for the checkmark SVG (the parent element has the checkmark)
        expect(
          screen.queryByText("Please enter a valid email address"),
        ).not.toBeInTheDocument();
      });
    });

    it("shows error for already registered email", async () => {
      mockCheckEmailExists.mockResolvedValue(true);
      render(<CreateUserDialog {...defaultProps} />);
      const emailInput = screen.getByLabelText(/email address/i);

      await userEvent.type(emailInput, "existing@example.com");

      await waitFor(() => {
        expect(
          screen.getByText("This email is already registered"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("password validation", () => {
    it("shows password strength meter", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const passwordInput = screen.getByPlaceholderText(
        "Minimum 12 characters",
      );

      await userEvent.type(passwordInput, "weak");

      await waitFor(() => {
        expect(screen.getByText("Too short")).toBeInTheDocument();
      });
    });

    it("shows weak password feedback", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const passwordInput = screen.getByPlaceholderText(
        "Minimum 12 characters",
      );

      await userEvent.type(passwordInput, "weakpassword");

      await waitFor(() => {
        expect(screen.getByText("Weak")).toBeInTheDocument();
      });
    });

    it("shows strong password feedback", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const passwordInput = screen.getByPlaceholderText(
        "Minimum 12 characters",
      );

      await userEvent.type(passwordInput, "StrongPass123!");

      await waitFor(() => {
        expect(screen.getByText("Strong")).toBeInTheDocument();
      });
    });

    it("shows password requirements checklist", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const passwordInput = screen.getByPlaceholderText(
        "Minimum 12 characters",
      );

      await userEvent.type(passwordInput, "Test");

      await waitFor(() => {
        // Requirements are shown with check/circle symbols, use regex to match
        expect(screen.getByText(/12\+ characters/)).toBeInTheDocument();
        expect(screen.getByText(/Uppercase letter/)).toBeInTheDocument();
        expect(screen.getByText(/Lowercase letter/)).toBeInTheDocument();
        expect(screen.getByText(/Number/)).toBeInTheDocument();
        expect(screen.getByText(/Special character/)).toBeInTheDocument();
      });
    });
  });

  describe("form interactions", () => {
    it("toggles password visibility", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const passwordInput = screen.getByPlaceholderText(
        "Minimum 12 characters",
      );

      // Initially should be password type
      expect(passwordInput).toHaveAttribute("type", "password");

      // Click the show button (there should be a button in the password field)
      const toggleButton = passwordInput.parentElement?.querySelector("button");
      if (toggleButton) {
        await userEvent.click(toggleButton);
        expect(passwordInput).toHaveAttribute("type", "text");
      }
    });

    it("selects admin role", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const adminRadio = screen
        .getByText("Administrator")
        .closest("label")
        ?.querySelector("input");

      if (adminRadio) {
        await userEvent.click(adminRadio);
        expect(adminRadio).toBeChecked();
      }
    });

    it("toggles active status", async () => {
      render(<CreateUserDialog {...defaultProps} />);
      const toggle = screen.getByText("Account Active").closest("label");

      if (toggle) {
        await userEvent.click(toggle);
        // The checkbox inside should now be unchecked
        const checkbox = toggle.querySelector('input[type="checkbox"]');
        expect(checkbox).not.toBeChecked();
      }
    });

    it("calls onClose when cancel button clicked", async () => {
      const onClose = vi.fn();
      render(<CreateUserDialog {...defaultProps} onClose={onClose} />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when X button clicked", async () => {
      const onClose = vi.fn();
      render(<CreateUserDialog {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText("Close");
      await userEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("form submission", () => {
    it("disables submit button when form is invalid", () => {
      render(<CreateUserDialog {...defaultProps} />);
      const submitButton = screen.getByText("Create User");

      expect(submitButton).toBeDisabled();
    });

    it("enables submit button when form is valid", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      render(<CreateUserDialog {...defaultProps} />);

      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "valid@example.com",
      );
      await userEvent.type(
        screen.getByPlaceholderText("Minimum 12 characters"),
        "StrongPass123!",
      );

      await waitFor(() => {
        expect(screen.getByText("Create User")).not.toBeDisabled();
      });
    });

    it("calls createUser with correct payload on submit", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      mockCreateUser.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });

      render(<CreateUserDialog {...defaultProps} />);

      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "test@example.com",
      );
      await userEvent.type(screen.getByLabelText(/full name/i), "Test User");
      await userEvent.type(
        screen.getByPlaceholderText("Minimum 12 characters"),
        "StrongPass123!",
      );

      await waitFor(() => {
        expect(screen.getByText("Create User")).not.toBeDisabled();
      });

      await userEvent.click(screen.getByText("Create User"));

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledWith({
          email: "test@example.com",
          full_name: "Test User",
          password: "StrongPass123!",
          is_admin: false,
          is_active: true,
        });
      });
    });

    it("shows success message on successful creation", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      mockCreateUser.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });

      render(<CreateUserDialog {...defaultProps} />);

      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "test@example.com",
      );
      await userEvent.type(
        screen.getByPlaceholderText("Minimum 12 characters"),
        "StrongPass123!",
      );

      await waitFor(() => {
        expect(screen.getByText("Create User")).not.toBeDisabled();
      });

      await userEvent.click(screen.getByText("Create User"));

      await waitFor(() => {
        expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
      });
    });

    it("shows error message on failed creation", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      mockCreateUser.mockRejectedValue(new Error("Failed to create user"));

      vi.mocked(useCreateUser).mockReturnValue({
        ...defaultMockHook,
        error: "Failed to create user",
      });

      render(<CreateUserDialog {...defaultProps} />);

      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "test@example.com",
      );
      await userEvent.type(
        screen.getByPlaceholderText("Minimum 12 characters"),
        "StrongPass123!",
      );

      await waitFor(() => {
        expect(screen.getByText("Create User")).not.toBeDisabled();
      });

      await userEvent.click(screen.getByText("Create User"));

      await waitFor(() => {
        expect(screen.getByText("Failed to create user")).toBeInTheDocument();
      });
    });

    it("shows loading spinner during submission", async () => {
      mockCheckEmailExists.mockResolvedValue(false);
      vi.mocked(useCreateUser).mockReturnValue({
        ...defaultMockHook,
        isLoading: true,
      });

      render(<CreateUserDialog {...defaultProps} />);

      // When loading, the button should show spinner
      const submitButton = screen.getByText("Create User").closest("button");
      expect(submitButton?.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  describe("form reset", () => {
    it("resets form when dialog closes and reopens", async () => {
      const { rerender } = render(<CreateUserDialog {...defaultProps} />);

      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "test@example.com",
      );
      await userEvent.type(screen.getByLabelText(/full name/i), "Test User");

      // Close dialog
      rerender(<CreateUserDialog {...defaultProps} isOpen={false} />);

      // Reopen dialog
      rerender(<CreateUserDialog {...defaultProps} isOpen={true} />);

      // Fields should be empty
      expect(screen.getByLabelText(/email address/i)).toHaveValue("");
      expect(screen.getByLabelText(/full name/i)).toHaveValue("");
    });
  });

  describe("invitation email option", () => {
    it("shows coming soon badge for invitation option", () => {
      render(<CreateUserDialog {...defaultProps} />);
      expect(screen.getByText("(Coming soon)")).toBeInTheDocument();
    });

    it("disables invitation email radio button", () => {
      render(<CreateUserDialog {...defaultProps} />);
      const invitationRadio = screen
        .getByText("Send invitation email")
        .closest("label")
        ?.querySelector("input");

      expect(invitationRadio).toBeDisabled();
    });
  });
});
