/**
 * MessageBubble Unit Tests
 * Tests message rendering, markdown, citations, and streaming states
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";
import type { Message } from "@voiceassist/types";

describe("MessageBubble", () => {
  const baseMessage: Message = {
    id: "msg-1",
    role: "user",
    content: "Hello, world!",
    timestamp: Date.now(),
  };

  describe("role variants", () => {
    it("should render user message with correct styling", () => {
      const { container } = render(<MessageBubble message={baseMessage} />);

      const bubble = container.querySelector('[data-message-id="msg-1"]');
      expect(bubble).toBeInTheDocument();

      // User messages are right-aligned with primary background
      const messageContent = bubble?.querySelector(".bg-primary-500");
      expect(messageContent).toBeInTheDocument();
    });

    it("should render assistant message with correct styling", () => {
      const assistantMessage: Message = {
        ...baseMessage,
        role: "assistant",
      };

      const { container } = render(
        <MessageBubble message={assistantMessage} />,
      );

      // Assistant messages have white background with border
      const messageContent = container.querySelector(".bg-white.border");
      expect(messageContent).toBeInTheDocument();
    });

    it("should render system message with correct styling", () => {
      const systemMessage: Message = {
        ...baseMessage,
        role: "system",
      };

      const { container } = render(<MessageBubble message={systemMessage} />);

      // System messages have neutral background
      const messageContent = container.querySelector(".bg-neutral-100");
      expect(messageContent).toBeInTheDocument();
    });
  });

  describe("content rendering", () => {
    it("should render plain text content", () => {
      render(<MessageBubble message={baseMessage} />);
      expect(screen.getByText("Hello, world!")).toBeInTheDocument();
    });

    it("should render markdown bold text", () => {
      const message: Message = {
        ...baseMessage,
        content: "This is **bold** text",
      };

      const { container } = render(<MessageBubble message={message} />);
      const bold = container.querySelector("strong");
      expect(bold).toBeInTheDocument();
      expect(bold?.textContent).toBe("bold");
    });

    it("should render markdown italic text", () => {
      const message: Message = {
        ...baseMessage,
        content: "This is *italic* text",
      };

      const { container } = render(<MessageBubble message={message} />);
      const italic = container.querySelector("em");
      expect(italic).toBeInTheDocument();
      expect(italic?.textContent).toBe("italic");
    });

    it("should render markdown links", () => {
      const message: Message = {
        ...baseMessage,
        content: "[Click here](https://example.com)",
      };

      render(<MessageBubble message={message} />);
      const link = screen.getByRole("link", { name: /click here/i });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should render inline code", () => {
      const message: Message = {
        ...baseMessage,
        content: "Use `console.log()` for debugging",
      };

      const { container } = render(<MessageBubble message={message} />);
      const code = container.querySelector("code");
      expect(code).toBeInTheDocument();
      expect(code?.textContent).toBe("console.log()");
    });

    it("should render code blocks with syntax highlighting", () => {
      const message: Message = {
        ...baseMessage,
        role: "assistant",
        content: "```javascript\nconst x = 42;\n```",
      };

      const { container } = render(<MessageBubble message={message} />);
      // SyntaxHighlighter renders code blocks
      const codeBlock = container.querySelector("code");
      expect(codeBlock).toBeInTheDocument();
    });

    it("should render lists", () => {
      const message: Message = {
        ...baseMessage,
        content: "- Item 1\n- Item 2\n- Item 3",
      };

      const { container } = render(<MessageBubble message={message} />);
      const list = container.querySelector("ul");
      expect(list).toBeInTheDocument();

      const items = container.querySelectorAll("li");
      expect(items).toHaveLength(3);
    });

    it("should render blockquotes", () => {
      const message: Message = {
        ...baseMessage,
        content: "> This is a quote",
      };

      const { container } = render(<MessageBubble message={message} />);
      const blockquote = container.querySelector("blockquote");
      expect(blockquote).toBeInTheDocument();
    });
  });

  describe("streaming state", () => {
    it("should show streaming indicator when isStreaming is true", () => {
      const { container } = render(
        <MessageBubble message={baseMessage} isStreaming={true} />,
      );

      // Look for animated dots
      const dots = container.querySelectorAll(".animate-bounce");
      expect(dots.length).toBeGreaterThan(0);
    });

    it("should not show streaming indicator when isStreaming is false", () => {
      const { container } = render(
        <MessageBubble message={baseMessage} isStreaming={false} />,
      );

      const dots = container.querySelectorAll(".animate-bounce");
      expect(dots).toHaveLength(0);
    });

    it("should not show streaming indicator by default", () => {
      const { container } = render(<MessageBubble message={baseMessage} />);

      const dots = container.querySelectorAll(".animate-bounce");
      expect(dots).toHaveLength(0);
    });
  });

  describe("citations", () => {
    it("should render citations when present", () => {
      const message: Message = {
        ...baseMessage,
        role: "assistant",
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-123",
            snippet: "Relevant excerpt from the document",
            page: 42,
          },
        ],
      };

      render(<MessageBubble message={message} />);

      // CitationDisplay should show "1 Source"
      expect(screen.getByText("1 Source")).toBeInTheDocument();
    });

    it("should not render citations section when empty", () => {
      render(<MessageBubble message={baseMessage} />);

      expect(screen.queryByText(/source/i)).not.toBeInTheDocument();
    });

    it("should render multiple citations", () => {
      const message: Message = {
        ...baseMessage,
        role: "assistant",
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-123",
          },
          {
            id: "cite-2",
            source: "url",
            reference: "https://example.com",
          },
        ],
      };

      render(<MessageBubble message={message} />);

      expect(screen.getByText("2 Sources")).toBeInTheDocument();
    });
  });

  describe("timestamp", () => {
    it("should display formatted timestamp", () => {
      const now = new Date("2024-01-15T14:30:00").getTime();
      const message: Message = {
        ...baseMessage,
        timestamp: now,
      };

      render(<MessageBubble message={message} />);

      // Should show time in HH:MM format
      expect(screen.getByText(/2:30/i)).toBeInTheDocument();
    });
  });
});
