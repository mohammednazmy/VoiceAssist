/**
 * MessageActionMenu Unit Tests
 * Tests action menu visibility, role-based actions, callbacks, loading states, and keyboard shortcuts
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
  const mockOnBranch = vi.fn();

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

    it("should close menu when pressing Escape", async () => {
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

      // Press Escape to close
      await user.keyboard("{Escape}");

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

  describe("branch action", () => {
    it("should show branch option when onBranch is provided", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onBranch={mockOnBranch}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText(/branch conversation/i)).toBeInTheDocument();
    });

    it("should call onBranch when branch is clicked", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onBranch={mockOnBranch}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const branchButton = screen.getByText(/branch conversation/i);
      await user.click(branchButton);

      expect(mockOnBranch).toHaveBeenCalledTimes(1);
    });

    it("should show branch for both user and assistant messages", async () => {
      const user = userEvent.setup();

      // Test for assistant
      render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
          onBranch={mockOnBranch}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText(/branch conversation/i)).toBeInTheDocument();
    });
  });

  describe("loading states", () => {
    it("should disable actions when isDeleting is true", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          isDeleting={true}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const editItem = screen.getByTestId("action-edit");
      // Radix uses data-disabled="" (empty string) when disabled
      expect(editItem).toHaveAttribute("data-disabled");
    });

    it("should disable actions when isRegenerating is true", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
          onDelete={mockOnDelete}
          isRegenerating={true}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const regenerateItem = screen.getByTestId("action-regenerate");
      // Radix uses data-disabled="" (empty string) when disabled
      expect(regenerateItem).toHaveAttribute("data-disabled");
    });

    it("should disable actions when isBranching is true", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onBranch={mockOnBranch}
          isBranching={true}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      const branchItem = screen.getByTestId("action-branch");
      // Radix uses data-disabled="" (empty string) when disabled
      expect(branchItem).toHaveAttribute("data-disabled");
    });

    it("should show spinner icon when action is in progress", async () => {
      const user = userEvent.setup();

      const { container } = render(
        <MessageActionMenu
          messageId="msg-1"
          role="assistant"
          onRegenerate={mockOnRegenerate}
          isRegenerating={true}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Check for spinner animation class
      const regenerateItem = screen.getByTestId("action-regenerate");
      const spinner = regenerateItem.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts display", () => {
    it("should display keyboard shortcut for copy action", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onCopy={mockOnCopy} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Check for keyboard shortcut display
      expect(screen.getByText("⌘C")).toBeInTheDocument();
    });

    it("should display keyboard shortcut for edit action", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText("E")).toBeInTheDocument();
    });

    it("should display keyboard shortcut for regenerate action", async () => {
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

      expect(screen.getByText("R")).toBeInTheDocument();
    });

    it("should display keyboard shortcut for delete action", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onDelete={mockOnDelete}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText("Del")).toBeInTheDocument();
    });

    it("should display keyboard shortcut for branch action", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onBranch={mockOnBranch}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByText("B")).toBeInTheDocument();
    });
  });

  describe("data-testid attributes", () => {
    it("should have data-testid on menu trigger", () => {
      render(
        <MessageActionMenu messageId="msg-1" role="user" onEdit={mockOnEdit} />,
      );

      expect(
        screen.getByTestId("message-action-menu-trigger"),
      ).toBeInTheDocument();
    });

    it("should have data-testid on action items", async () => {
      const user = userEvent.setup();

      render(
        <MessageActionMenu
          messageId="msg-1"
          role="user"
          onEdit={mockOnEdit}
          onCopy={mockOnCopy}
          onDelete={mockOnDelete}
          onBranch={mockOnBranch}
        />,
      );

      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      expect(screen.getByTestId("action-copy")).toBeInTheDocument();
      expect(screen.getByTestId("action-edit")).toBeInTheDocument();
      expect(screen.getByTestId("action-delete")).toBeInTheDocument();
      expect(screen.getByTestId("action-branch")).toBeInTheDocument();
    });
  });
});
