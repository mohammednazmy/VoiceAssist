/**
 * Tests for BranchPreview component
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BranchPreview } from "../BranchPreview";
import type { Message } from "@voiceassist/types";

// Mock messages for testing
const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "What is the treatment for hypertension?",
    timestamp: new Date().toISOString(),
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content:
      "Hypertension treatment typically involves lifestyle modifications and medications. First-line medications include ACE inhibitors, ARBs, calcium channel blockers, and thiazide diuretics.",
    timestamp: new Date().toISOString(),
  },
  {
    id: "msg-3",
    conversationId: "conv-1",
    role: "user",
    content: "What about ACE inhibitors specifically?",
    timestamp: new Date().toISOString(),
  },
  {
    id: "msg-4",
    conversationId: "conv-1",
    role: "assistant",
    content:
      "ACE inhibitors work by blocking the angiotensin-converting enzyme, which reduces blood pressure.",
    timestamp: new Date().toISOString(),
  },
];

describe("BranchPreview", () => {
  describe("rendering", () => {
    it("should render the branch preview dialog", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(
        screen.getByText("Create Branch from This Message?"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("branch-preview")).toBeInTheDocument();
    });

    it("should show the correct message count", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Message 2 is the second message, so it shows "message 2 of 4"
      expect(screen.getByText(/message 2 of 4/i)).toBeInTheDocument();
    });

    it("should show a preview of the parent message content", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Should show part of the assistant message
      expect(screen.getByText(/Hypertension treatment/i)).toBeInTheDocument();
    });

    it("should truncate long message content", () => {
      const longMessage: Message = {
        id: "long-msg",
        conversationId: "conv-1",
        role: "assistant",
        content:
          "This is a very long message that should be truncated. ".repeat(10),
        timestamp: new Date().toISOString(),
      };

      render(
        <BranchPreview
          messages={[longMessage]}
          parentMessageId="long-msg"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Should show ellipsis for truncated content
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    });

    it("should show info about remaining messages after branch point", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // 2 messages after the branch point (msg-3 and msg-4)
      expect(
        screen.getByText(/2 messages after this point/i),
      ).toBeInTheDocument();
    });

    it("should show the role of the parent message", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-1"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // User message
      expect(screen.getByText("You:")).toBeInTheDocument();
    });

    it("should show Assistant label for assistant messages", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText("Assistant:")).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("should call onConfirm when Create Branch button is clicked", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      const confirmButton = screen.getByTestId("branch-preview-confirm");
      fireEvent.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("should call onCancel when Cancel button is clicked", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      const cancelButton = screen.getByTestId("branch-preview-cancel");
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("creating state", () => {
    it("should show Creating... text when isCreating is true", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });

    it("should show spinner when isCreating is true", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // The spinner is rendered with animate-spin class
      const confirmButton = screen.getByTestId("branch-preview-confirm");
      const spinner = confirmButton.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("should disable buttons when isCreating is true", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByTestId("branch-preview-confirm")).toBeDisabled();
      expect(screen.getByTestId("branch-preview-cancel")).toBeDisabled();
    });
  });

  describe("edge cases", () => {
    it("should handle last message in the list", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-4"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Should show message 4 of 4
      expect(screen.getByText(/message 4 of 4/i)).toBeInTheDocument();
      // Should not show "messages after this point" text since there are none
      expect(
        screen.queryByText(/messages after this point/i),
      ).not.toBeInTheDocument();
    });

    it("should handle first message in the list", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-1"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Should show message 1 of 4
      expect(screen.getByText(/message 1 of 4/i)).toBeInTheDocument();
      // Should show 3 messages after this point
      expect(
        screen.getByText(/3 messages after this point/i),
      ).toBeInTheDocument();
    });

    it("should handle unknown message ID gracefully", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="unknown-id"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Should show "Unknown message" for missing message
      expect(screen.getByText(/Unknown message/i)).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(
        <BranchPreview
          messages={mockMessages}
          parentMessageId="msg-2"
          isCreating={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const dialog = screen.getByTestId("branch-preview");
      expect(dialog).toHaveAttribute("role", "dialog");
      expect(dialog).toHaveAttribute("aria-labelledby", "branch-preview-title");
      expect(dialog).toHaveAttribute(
        "aria-describedby",
        "branch-preview-description",
      );
    });
  });
});
