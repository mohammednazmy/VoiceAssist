/**
 * MessageBubble Editing Flow Tests
 * Tests inline editing UI, save/cancel, and keyboard shortcuts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "../MessageBubble";
import type { Message } from "@voiceassist/types";

// Mock useToastContext since MessageBubble uses it for copy feedback
vi.mock("../../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock the Dialog components from @voiceassist/ui for RegenerationOptionsDialog
vi.mock("@voiceassist/ui", async () => {
  const actual = await vi.importActual("@voiceassist/ui");
  return {
    ...actual,
    Dialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
    }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
    DialogFooter: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
    Slider: ({
      id,
      value,
      onValueChange,
      min,
      max,
      step,
      ...props
    }: {
      id?: string;
      value: number[];
      onValueChange: (value: number[]) => void;
      min: number;
      max: number;
      step: number;
      [key: string]: unknown;
    }) => (
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => onValueChange([parseFloat(e.target.value)])}
        {...props}
      />
    ),
  };
});

describe("MessageBubble - Editing Flow", () => {
  const mockOnEditSave = vi.fn();
  const mockOnRegenerate = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnEditSave.mockResolvedValue(undefined);
    mockOnRegenerate.mockResolvedValue(undefined);
    mockOnDelete.mockResolvedValue(undefined);
  });

  describe("edit mode entry", () => {
    it("should show edit button on hover for user messages", async () => {
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Hello, world!",
        timestamp: Date.now(),
      };

      const { container } = render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Action menu should be visible (group hover triggers it)
      const messageContainer = container.querySelector(
        '[data-message-id="msg-1"]',
      );
      expect(messageContainer).toBeInTheDocument();

      // Menu button should exist
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      expect(menuButton).toBeInTheDocument();
    });

    it("should enter edit mode when edit is clicked", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Open action menu
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Click edit
      const editButton = screen.getByText(/edit/i);
      await user.click(editButton);

      // Should show textarea with original content
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("Original message");

      // Should show save and cancel buttons
      expect(screen.getByText(/save/i)).toBeInTheDocument();
      expect(screen.getByText(/cancel/i)).toBeInTheDocument();
    });
  });

  describe("editing actions", () => {
    it("should save edited message when save is clicked", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited message");

      // Save
      const saveButton = screen.getByText(/save/i);
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnEditSave).toHaveBeenCalledWith("msg-1", "Edited message");
      });
    });

    it("should cancel edit when cancel is clicked", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited message");

      // Cancel
      const cancelButton = screen.getByText(/cancel/i);
      await user.click(cancelButton);

      // Should exit edit mode
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      });

      // Should not have called save
      expect(mockOnEditSave).not.toHaveBeenCalled();

      // Original message should still be displayed
      expect(screen.getByText("Original message")).toBeInTheDocument();
    });

    it("should restore original content on cancel", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Completely different text");

      // Cancel
      await user.click(screen.getByText(/cancel/i));

      // Original message should be displayed
      expect(screen.getByText("Original message")).toBeInTheDocument();
      expect(
        screen.queryByText("Completely different text"),
      ).not.toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts", () => {
    it("should save on Ctrl+Enter keyboard shortcut", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited with keyboard");

      // Ctrl+Enter to save
      await user.keyboard("{Control>}{Enter}{/Control}");

      await waitFor(() => {
        expect(mockOnEditSave).toHaveBeenCalledWith(
          "msg-1",
          "Edited with keyboard",
        );
      });
    });

    it("should save on Cmd+Enter keyboard shortcut (macOS)", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited with keyboard");

      // Cmd+Enter to save
      await user.keyboard("{Meta>}{Enter}{/Meta}");

      await waitFor(() => {
        expect(mockOnEditSave).toHaveBeenCalledWith(
          "msg-1",
          "Edited with keyboard",
        );
      });
    });

    it("should cancel on Escape keyboard shortcut", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      // Edit content
      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited message");

      // Escape to cancel
      await user.keyboard("{Escape}");

      // Should exit edit mode
      await waitFor(() => {
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      });

      expect(mockOnEditSave).not.toHaveBeenCalled();
    });
  });

  describe("save button state", () => {
    it("should disable save button during async save operation", async () => {
      const user = userEvent.setup();
      let resolveSave: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
      mockOnEditSave.mockReturnValue(savePromise);

      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Original message",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble message={userMessage} onEditSave={mockOnEditSave} />,
      );

      // Enter edit mode and edit
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      await user.click(screen.getByText(/edit/i));

      const textarea = screen.getByRole("textbox");
      await user.clear(textarea);
      await user.type(textarea, "Edited message");

      // Click save
      const saveButton = screen.getByText(/save/i);
      await user.click(saveButton);

      // Save button should be disabled while saving
      await waitFor(() => {
        expect(saveButton).toBeDisabled();
      });

      // Resolve the save
      resolveSave!();

      // Save button should be enabled again after save completes
      await waitFor(() => {
        expect(screen.queryByText(/save/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("regeneration flow", () => {
    it("should open options dialog when regenerate is clicked", async () => {
      const user = userEvent.setup();
      const assistantMessage: Message = {
        id: "msg-assistant",
        role: "assistant",
        content: "Assistant response",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={mockOnRegenerate}
        />,
      );

      // Open action menu
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Click regenerate - should open dialog
      const regenerateButton = screen.getByText(/regenerate/i);
      await user.click(regenerateButton);

      // Dialog should be visible
      await waitFor(() => {
        expect(
          screen.getByTestId("regeneration-options-dialog"),
        ).toBeInTheDocument();
      });

      // onRegenerate should NOT be called yet (dialog is open)
      expect(mockOnRegenerate).not.toHaveBeenCalled();
    });

    it("should call onRegenerate with options when dialog is confirmed", async () => {
      const user = userEvent.setup();
      const assistantMessage: Message = {
        id: "msg-assistant",
        role: "assistant",
        content: "Assistant response",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble
          message={assistantMessage}
          onRegenerate={mockOnRegenerate}
        />,
      );

      // Open action menu and click regenerate
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);
      const regenerateButton = screen.getByText(/regenerate/i);
      await user.click(regenerateButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(
          screen.getByTestId("regeneration-options-dialog"),
        ).toBeInTheDocument();
      });

      // Click confirm in the dialog
      const confirmButton = screen.getByTestId("regenerate-confirm-button");
      await user.click(confirmButton);

      // Now onRegenerate should be called with options
      await waitFor(() => {
        expect(mockOnRegenerate).toHaveBeenCalledWith(
          "msg-assistant",
          expect.objectContaining({
            temperature: expect.any(Number),
            lengthPreference: expect.any(String),
            useClinicalContext: expect.any(Boolean),
            createBranch: expect.any(Boolean),
          }),
        );
      });
    });
  });

  describe("delete flow", () => {
    it("should open confirmation dialog when delete is clicked", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Message to delete",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble
          message={userMessage}
          onEditSave={mockOnEditSave}
          onDelete={mockOnDelete}
        />,
      );

      // Open action menu
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Click delete - opens confirmation dialog
      const deleteButton = screen.getByTestId("action-delete");
      await user.click(deleteButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByTestId("delete-confirmation-dialog"),
        ).toBeInTheDocument();
      });
    });

    it("should call onDelete when confirm is clicked in dialog", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Message to delete",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble
          message={userMessage}
          onEditSave={mockOnEditSave}
          onDelete={mockOnDelete}
        />,
      );

      // Open action menu
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Click delete - opens confirmation dialog
      const deleteButton = screen.getByTestId("action-delete");
      await user.click(deleteButton);

      // Click confirm in dialog
      const confirmButton = screen.getByTestId("delete-confirm-button");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith("msg-1");
      });
    });

    it("should not call onDelete when cancel is clicked in dialog", async () => {
      const user = userEvent.setup();
      const userMessage: Message = {
        id: "msg-1",
        role: "user",
        content: "Message to delete",
        timestamp: Date.now(),
      };

      render(
        <MessageBubble
          message={userMessage}
          onEditSave={mockOnEditSave}
          onDelete={mockOnDelete}
        />,
      );

      // Open action menu
      const menuButton = screen.getByRole("button", {
        name: /message actions/i,
      });
      await user.click(menuButton);

      // Click delete - opens confirmation dialog
      const deleteButton = screen.getByTestId("action-delete");
      await user.click(deleteButton);

      // Click cancel in dialog
      const cancelButton = screen.getByTestId("delete-cancel-button");
      await user.click(cancelButton);

      expect(mockOnDelete).not.toHaveBeenCalled();

      // Dialog should be closed
      await waitFor(() => {
        expect(
          screen.queryByTestId("delete-confirmation-dialog"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
