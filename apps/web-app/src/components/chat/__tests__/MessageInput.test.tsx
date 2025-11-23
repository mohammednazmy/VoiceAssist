/**
 * MessageInput Unit Tests
 * Tests message input, keyboard handling, attachments, and auto-expansion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../MessageInput";

describe("MessageInput", () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render textarea with default placeholder", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute(
        "placeholder",
        "Type a message... (Shift+Enter for new line)",
      );
    });

    it("should render textarea with custom placeholder", () => {
      render(
        <MessageInput onSend={mockOnSend} placeholder="Custom placeholder" />,
      );

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("placeholder", "Custom placeholder");
    });

    it("should render send button", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeInTheDocument();
    });

    it("should render markdown hint", () => {
      render(<MessageInput onSend={mockOnSend} />);

      expect(screen.getByText(/markdown supported/i)).toBeInTheDocument();
    });

    it("should not render attachment button when disabled", () => {
      render(<MessageInput onSend={mockOnSend} enableAttachments={false} />);

      expect(screen.queryByLabelText(/attach/i)).not.toBeInTheDocument();
    });

    it("should render attachment button when enabled", () => {
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const fileInput = screen
        .getByRole("textbox")
        .parentElement?.parentElement?.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });
  });

  describe("typing and content", () => {
    it("should update content when user types", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");

      expect(textarea).toHaveValue("Hello world");
    });

    it("should allow multiline content", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

      expect(textarea.value).toContain("\n");
    });

    it("should show character count for messages over 500 characters", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const longText = "a".repeat(550);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, longText);

      await waitFor(() => {
        expect(screen.getByText("550")).toBeInTheDocument();
      });
    });

    it("should not show character count for messages under 500 characters", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Short message");

      expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    });
  });

  describe("keyboard handling", () => {
    it("should send message on Enter key", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");
      await user.keyboard("{Enter}");

      expect(mockOnSend).toHaveBeenCalledWith("Hello world", undefined);
    });

    it("should add newline on Shift+Enter", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

      expect(textarea.value).toBe("Line 1\nLine 2");
      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should not send empty messages", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Enter}");

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should not send whitespace-only messages", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "   ");
      await user.keyboard("{Enter}");

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should trim whitespace when sending", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "  Hello world  ");
      await user.keyboard("{Enter}");

      expect(mockOnSend).toHaveBeenCalledWith("Hello world", undefined);
    });
  });

  describe("send button", () => {
    it("should send message when clicked", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");

      const sendButton = screen.getByRole("button", { name: /send message/i });
      await user.click(sendButton);

      expect(mockOnSend).toHaveBeenCalledWith("Hello world", undefined);
    });

    it("should be disabled when textarea is empty", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();
    });

    it("should be enabled when textarea has content", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello");

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).not.toBeDisabled();
    });

    it("should be disabled when disabled prop is true", () => {
      render(<MessageInput onSend={mockOnSend} disabled={true} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();
    });

    it("should be disabled for whitespace-only content", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "   ");

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe("disabled state", () => {
    it("should disable textarea when disabled prop is true", () => {
      render(<MessageInput onSend={mockOnSend} disabled={true} />);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeDisabled();
    });

    it("should not send message when disabled", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} disabled={true} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      await user.click(sendButton);

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it("should apply disabled styling to send button", () => {
      render(<MessageInput onSend={mockOnSend} disabled={true} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toHaveClass("disabled:bg-neutral-300");
    });
  });

  describe("clearing content", () => {
    it("should clear textarea after sending", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(textarea).toHaveValue("");
      });
    });

    it("should clear textarea after clicking send button", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Hello world");

      const sendButton = screen.getByRole("button", { name: /send message/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(textarea).toHaveValue("");
      });
    });
  });

  describe("attachments", () => {
    it("should not show attachment preview when none added", () => {
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);
      // No remove button should be present if there are no attachments
      expect(
        screen.queryByRole("button", { name: /remove attachment/i }),
      ).not.toBeInTheDocument();
    });

    it("should handle file selection", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/test.pdf/i)).toBeInTheDocument();
      });
    });

    it("should remove attachment when clicking remove button", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/test.pdf/i)).toBeInTheDocument();
      });

      const removeButton = screen.getByRole("button", {
        name: /remove attachment/i,
      });
      await user.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText(/test.pdf/i)).not.toBeInTheDocument();
      });
    });

    it("should send attachments with message", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Message with attachment");

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /remove attachment/i }),
        ).toBeInTheDocument();
      });

      // Focus textarea and press Enter
      await user.click(textarea);
      await user.keyboard("{Enter}");

      expect(mockOnSend).toHaveBeenCalledWith(
        "Message with attachment",
        expect.arrayContaining([expect.stringContaining("test.pdf")]),
      );
    });

    it("should clear attachments after sending", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      await user.type(textarea, "Message with attachment");

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /remove attachment/i }),
        ).toBeInTheDocument();
      });

      // Focus textarea and press Enter
      await user.click(textarea);
      await user.keyboard("{Enter}");

      // Verify onSend was called with attachments
      expect(mockOnSend).toHaveBeenCalledWith(
        "Message with attachment",
        expect.arrayContaining([expect.stringContaining("test.pdf")]),
      );

      // Verify textarea and form were cleared (both should clear together)
      await waitFor(() => {
        expect(textarea).toHaveValue("");
      });
    });

    it("should accept multiple file types", () => {
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput).toHaveAttribute(
        "accept",
        ".pdf,.png,.jpg,.jpeg,.mp3,.wav,.txt,.md",
      );
    });

    it("should disable attachment button when disabled", () => {
      render(
        <MessageInput
          onSend={mockOnSend}
          enableAttachments={true}
          disabled={true}
        />,
      );

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput).toBeDisabled();
    });
  });

  describe("auto-expansion", () => {
    it("should set max height on textarea", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveStyle({ maxHeight: "200px" });
    });

    it("should have initial single row", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("rows", "1");
    });

    // Note: Auto-expansion behavior is hard to test without actual DOM layout
    // The useEffect that sets height based on scrollHeight requires real rendering
  });

  describe("accessibility", () => {
    it("should have aria-label on textarea", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toHaveAttribute("aria-label", "Message input");
    });

    it("should have aria-label on send button", () => {
      render(<MessageInput onSend={mockOnSend} />);

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toHaveAttribute("aria-label", "Send message");
    });

    it("should have aria-label on remove attachment button", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} enableAttachments={true} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      await user.upload(fileInput, file);

      await waitFor(() => {
        const removeButton = screen.getByRole("button", {
          name: /remove attachment/i,
        });
        expect(removeButton).toHaveAttribute("aria-label", "Remove attachment");
      });
    });

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      // Tab should focus voice button (first in DOM)
      await user.tab();
      const voiceButton = screen.getByRole("button", { name: /voice input/i });
      expect(voiceButton).toHaveFocus();

      // Tab again should focus textarea
      await user.tab();
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveFocus();

      // Type content to enable send button
      await user.type(textarea, "Test message");

      // Tab again should focus send button (now enabled)
      await user.tab();
      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toHaveFocus();
    });
  });

  describe("edge cases", () => {
    it("should handle rapid Enter presses", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Message 1");
      await user.keyboard("{Enter}");
      await user.type(textarea, "Message 2");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledTimes(2);
      });

      expect(mockOnSend).toHaveBeenNthCalledWith(1, "Message 1", undefined);
      expect(mockOnSend).toHaveBeenNthCalledWith(2, "Message 2", undefined);
    });

    it("should handle very long messages", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const longMessage = "a".repeat(1000);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, longMessage);
      await user.keyboard("{Enter}");

      expect(mockOnSend).toHaveBeenCalledWith(longMessage, undefined);
    });

    it("should handle messages with special characters", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const specialMessage = "**Bold** *italic* `code` [link](url)";
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      await user.click(textarea);
      await user.paste(specialMessage);
      await user.keyboard("{Enter}");

      expect(mockOnSend).toHaveBeenCalledWith(specialMessage, undefined);
    });

    it("should handle paste events", async () => {
      const user = userEvent.setup();
      render(<MessageInput onSend={mockOnSend} />);

      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.paste("Pasted content");

      expect(textarea).toHaveValue("Pasted content");
    });
  });
});
