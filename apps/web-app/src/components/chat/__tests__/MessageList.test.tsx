/**
 * MessageList Unit Tests
 * Tests virtualized message rendering, auto-scroll, and typing indicators
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { Message } from "@voiceassist/types";

// Mock react-virtuoso
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent, components }: any) => (
    <div data-testid="virtuoso-list">
      {data.map((item: any, index: number) => (
        <div key={item.id}>{itemContent(index, item)}</div>
      ))}
      {components?.Footer && (
        <div data-testid="virtuoso-footer">{components.Footer()}</div>
      )}
    </div>
  ),
}));

describe("MessageList", () => {
  const mockMessages: Message[] = [
    {
      id: "msg-1",
      role: "user",
      content: "Hello, assistant!",
      timestamp: Date.now() - 2000,
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Hello! How can I help you today?",
      timestamp: Date.now() - 1000,
    },
    {
      id: "msg-3",
      role: "user",
      content: "Tell me about treatment protocols.",
      timestamp: Date.now(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty state", () => {
    it("should render empty state when no messages", () => {
      render(<MessageList messages={[]} />);

      expect(screen.getByText("Start a Conversation")).toBeInTheDocument();
      expect(
        screen.getByText(/Ask me anything about medical information/i),
      ).toBeInTheDocument();
    });

    it("should show chat icon in empty state", () => {
      const { container } = render(<MessageList messages={[]} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
      expect(icon?.parentElement).toHaveClass("bg-primary-100");
    });

    it("should not render virtuoso when empty", () => {
      const { container } = render(<MessageList messages={[]} />);

      expect(
        container.querySelector('[data-testid="virtuoso-list"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("message rendering", () => {
    it("should render all messages in virtuoso", () => {
      render(<MessageList messages={mockMessages} />);

      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
      expect(
        screen.getByText("Hello! How can I help you today?"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Tell me about treatment protocols."),
      ).toBeInTheDocument();
    });

    it("should render messages with MessageBubble component", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      // MessageBubble creates specific structure
      const messageBubbles = container.querySelectorAll("[data-message-id]");
      expect(messageBubbles.length).toBe(mockMessages.length);
    });

    it("should pass correct props to MessageBubble", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      // First message should be user message (right-aligned)
      const firstMessage = container.querySelector('[data-message-id="msg-1"]');
      expect(firstMessage?.querySelector(".justify-end")).toBeInTheDocument();

      // Second message should be assistant message (left-aligned)
      const secondMessage = container.querySelector(
        '[data-message-id="msg-2"]',
      );
      expect(
        secondMessage?.querySelector(".justify-start"),
      ).toBeInTheDocument();
    });

    it("should handle single message", () => {
      render(<MessageList messages={[mockMessages[0]]} />);

      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
      expect(
        screen.queryByText("Start a Conversation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("typing indicator", () => {
    it("should show typing indicator in footer when isTyping is true", () => {
      const { container } = render(
        <MessageList messages={mockMessages} isTyping={true} />,
      );

      const footer = container.querySelector('[data-testid="virtuoso-footer"]');
      expect(footer).toBeInTheDocument();

      // Check for animated dots
      const dots = footer?.querySelectorAll(".animate-bounce");
      expect(dots?.length).toBe(3);
    });

    it("should not show typing indicator when isTyping is false", () => {
      const { container } = render(
        <MessageList messages={mockMessages} isTyping={false} />,
      );

      const footer = container.querySelector('[data-testid="virtuoso-footer"]');
      expect(footer?.querySelectorAll(".animate-bounce").length).toBe(0);
    });

    it("should not show typing indicator when isTyping is undefined", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      const footer = container.querySelector('[data-testid="virtuoso-footer"]');
      expect(footer?.querySelectorAll(".animate-bounce").length).toBe(0);
    });

    it("should not show footer typing indicator when streaming a message", () => {
      const { container } = render(
        <MessageList
          messages={mockMessages}
          isTyping={true}
          streamingMessageId="msg-2"
        />,
      );

      const footer = container.querySelector('[data-testid="virtuoso-footer"]');
      expect(footer?.querySelectorAll(".animate-bounce").length).toBe(0);
    });

    it("should apply staggered animation delays to dots", () => {
      const { container } = render(
        <MessageList messages={mockMessages} isTyping={true} />,
      );

      const dots = container.querySelectorAll(".animate-bounce");
      expect(dots[0]).not.toHaveStyle({ animationDelay: "0.1s" });
      expect(dots[1]).toHaveStyle({ animationDelay: "0.1s" });
      expect(dots[2]).toHaveStyle({ animationDelay: "0.2s" });
    });
  });

  describe("streaming state", () => {
    it("should pass isStreaming to correct message bubble", () => {
      const { container } = render(
        <MessageList
          messages={mockMessages}
          isTyping={true}
          streamingMessageId="msg-2"
        />,
      );

      // The assistant message should have streaming indicator
      const streamingMessage = container.querySelector(
        '[data-message-id="msg-2"]',
      );
      const dots = streamingMessage?.querySelectorAll(".animate-bounce");
      expect(dots && dots.length > 0).toBe(true);

      // Other messages should not have streaming indicator
      const otherMessage = container.querySelector('[data-message-id="msg-1"]');
      const otherDots = otherMessage?.querySelectorAll(".animate-bounce");
      expect(otherDots?.length).toBe(0);
    });

    it("should not show streaming when streamingMessageId does not match", () => {
      const { container } = render(
        <MessageList
          messages={mockMessages}
          isTyping={true}
          streamingMessageId="non-existent"
        />,
      );

      // No message should show streaming indicator
      mockMessages.forEach((msg) => {
        const message = container.querySelector(
          `[data-message-id="${msg.id}"]`,
        );
        const dots = message?.querySelectorAll(".animate-bounce");
        expect(dots?.length).toBe(0);
      });
    });

    it("should handle streaming when isTyping is false", () => {
      const { container } = render(
        <MessageList
          messages={mockMessages}
          isTyping={false}
          streamingMessageId="msg-2"
        />,
      );

      // Should not show streaming indicator when isTyping is false
      const message = container.querySelector('[data-message-id="msg-2"]');
      const dots = message?.querySelectorAll(".animate-bounce");
      expect(dots?.length).toBe(0);
    });
  });

  describe("long message lists", () => {
    it("should render large number of messages efficiently", () => {
      const manyMessages: Message[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        timestamp: Date.now() - (100 - i) * 1000,
      }));

      const { container } = render(<MessageList messages={manyMessages} />);

      // Virtuoso should handle all messages
      expect(
        container.querySelector('[data-testid="virtuoso-list"]'),
      ).toBeInTheDocument();

      // All messages should be in the DOM (in our mock)
      expect(screen.getByText("Message 0")).toBeInTheDocument();
      expect(screen.getByText("Message 99")).toBeInTheDocument();
    });

    it("should pass correct data to virtuoso", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      const virtuosoList = container.querySelector(
        '[data-testid="virtuoso-list"]',
      );
      expect(virtuosoList).toBeInTheDocument();

      // All messages should be rendered
      const messageBubbles = container.querySelectorAll("[data-message-id]");
      expect(messageBubbles.length).toBe(mockMessages.length);
    });
  });

  describe("accessibility", () => {
    it("should render semantic HTML structure", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      // Virtuoso container should exist
      expect(
        container.querySelector('[data-testid="virtuoso-list"]'),
      ).toBeInTheDocument();
    });

    it("should have descriptive empty state", () => {
      render(<MessageList messages={[]} />);

      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveTextContent("Start a Conversation");
    });

    it("should maintain message order for screen readers", () => {
      const { container } = render(<MessageList messages={mockMessages} />);

      const messageBubbles = container.querySelectorAll("[data-message-id]");
      expect(messageBubbles[0]).toHaveAttribute("data-message-id", "msg-1");
      expect(messageBubbles[1]).toHaveAttribute("data-message-id", "msg-2");
      expect(messageBubbles[2]).toHaveAttribute("data-message-id", "msg-3");
    });
  });

  describe("edge cases", () => {
    it("should handle messages with missing optional fields", () => {
      const minimalMessage: Message = {
        id: "msg-minimal",
        role: "user",
        content: "Minimal message",
        timestamp: Date.now(),
      };

      render(<MessageList messages={[minimalMessage]} />);

      expect(screen.getByText("Minimal message")).toBeInTheDocument();
    });

    it("should handle messages with citations", () => {
      const messageWithCitation: Message = {
        id: "msg-cite",
        role: "assistant",
        content: "Based on research...",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-123",
            snippet: "Treatment protocols require...",
          },
        ],
      };

      render(<MessageList messages={[messageWithCitation]} />);

      expect(screen.getByText("Based on research...")).toBeInTheDocument();
      expect(screen.getByText("1 Source")).toBeInTheDocument();
    });

    it("should handle switching from empty to populated", () => {
      const { rerender } = render(<MessageList messages={[]} />);

      expect(screen.getByText("Start a Conversation")).toBeInTheDocument();

      rerender(<MessageList messages={mockMessages} />);

      expect(
        screen.queryByText("Start a Conversation"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
    });

    it("should handle adding messages dynamically", () => {
      const { rerender } = render(<MessageList messages={[mockMessages[0]]} />);

      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
      expect(
        screen.queryByText("Hello! How can I help you today?"),
      ).not.toBeInTheDocument();

      rerender(<MessageList messages={mockMessages} />);

      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
      expect(
        screen.getByText("Hello! How can I help you today?"),
      ).toBeInTheDocument();
    });
  });
});
