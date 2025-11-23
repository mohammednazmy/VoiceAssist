/**
 * MessageActionMenu Unit Tests
 * Tests action menu visibility, role-based actions, and callbacks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageActionMenu } from "../MessageActionMenu";

describe("MessageActionMenu", () => {
  const mockOnEdit = vi.fn();
  const mockOnRegenerate = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnCopy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("menu button rendering", () => {
    it("should render menu button", () => {
      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const button = screen.getByRole("button", { name: /message actions/i });
      expect(button).toBeInTheDocument();
    });

    it("should show three dots icon", () => {
      const { container } = render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("role-based action visibility", () => {
    it("should show edit option for user messages only", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText(/edit/i)).toBeInTheDocument();
    });

    it("should not show edit option for assistant messages", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.queryByText(/^edit$/i)).not.toBeInTheDocument();
    });

    it("should show regenerate option for assistant messages only", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText(/regenerate/i)).toBeInTheDocument();
    });

    it("should not show regenerate option for user messages", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.queryByText(/regenerate/i)).not.toBeInTheDocument();
    });

    it("should not render for system messages", () => {
      render(<MessageActionMenu messageId="msg-1" role="system" />);

      // System messages should not show action menu at all
      const menuButton = screen.queryByRole("button", {
        name: /message actions/i,
      });
      expect(menuButton).not.toBeInTheDocument();
    });
  });

  describe("action callbacks", () => {
    it("should call onEdit when edit is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const editButton = screen.getByText(/edit/i);
      await user.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledTimes(1);
    });

    it("should call onRegenerate when regenerate is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const regenerateButton = screen.getByText(/regenerate/i);
      await user.click(regenerateButton);

      expect(mockOnRegenerate).toHaveBeenCalledTimes(1);
    });

    it("should call onDelete when delete is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const deleteButton = screen.getByText(/delete/i);
      await user.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it("should call onCopy when copy is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onCopy={mockOnCopy}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const copyButton = screen.getByText(/copy/i);
      await user.click(copyButton);

      expect(mockOnCopy).toHaveBeenCalledTimes(1);
    });
  });

  describe("menu open/close behavior", () => {
    it("should close menu after action is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Menu should be open
      expect(screen.getByText(/edit/i)).toBeInTheDocument();

      // Click edit
      await user.click(screen.getByText(/edit/i));

      // Menu should close
      await waitFor(() => {
        expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
      });
    });

    it("should close menu when clicking outside", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <MessageActionMenu
            messageId="msg-1"
            role="user"
            onEdit={mockOnEdit}
          />
          <div data-testid="outside">Outside element</div>
        </div>,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Menu should be open
      expect(screen.getByText(/edit/i)).toBeInTheDocument();

      // Click outside
      await user.click(screen.getByTestId("outside"));

      // Menu should close
      await waitFor(() => {
        expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const button = screen.getByRole("button", { name: /message actions/i });
      expect(button).toHaveAttribute("aria-label", "Message actions");
    });

    it("should be keyboard accessible", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });

      // Focus and press Enter to open menu
      menuButton.focus();
      await user.keyboard("{Enter}");

      expect(screen.getByText(/edit/i)).toBeInTheDocument();
    });
  });
});
