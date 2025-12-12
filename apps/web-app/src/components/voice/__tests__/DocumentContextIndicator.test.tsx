/**
 * Tests for DocumentContextIndicator component
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DocumentContextIndicator,
  DocumentNavigationHints,
} from "../DocumentContextIndicator";
import type { VoiceDocumentSession } from "@voiceassist/api-client";

const mockSession: VoiceDocumentSession = {
  session_id: "session-1",
  document_id: "doc-1",
  document_title: "Harrison's Internal Medicine",
  total_pages: 500,
  has_toc: true,
  has_figures: true,
  current_page: 42,
  current_section_id: "sec-5",
  current_section_title: "Chapter 5: Cardiovascular Diseases",
  is_active: true,
  conversation_id: "conv-1",
};

describe("DocumentContextIndicator", () => {
  describe("rendering", () => {
    it("should not render when session is null", () => {
      const { container } = render(
        <DocumentContextIndicator session={null} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should render loading state", () => {
      render(<DocumentContextIndicator session={null} isLoading={true} />);
      expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("should render document title", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(
        screen.getByText("Harrison's Internal Medicine")
      ).toBeInTheDocument();
    });

    it("should render page progress", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(screen.getByText(/Page 42/)).toBeInTheDocument();
      expect(screen.getByText(/\/ 500/)).toBeInTheDocument();
    });

    it("should render current section", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(
        screen.getByText("Chapter 5: Cardiovascular Diseases")
      ).toBeInTheDocument();
    });

    it("should render TOC badge when has_toc is true", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(screen.getByText("TOC")).toBeInTheDocument();
    });

    it("should render Figures badge when has_figures is true", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(screen.getByText("Figures")).toBeInTheDocument();
    });

    it("should not render badges when features are false", () => {
      const sessionWithoutFeatures = {
        ...mockSession,
        has_toc: false,
        has_figures: false,
      };
      render(<DocumentContextIndicator session={sessionWithoutFeatures} />);
      expect(screen.queryByText("TOC")).not.toBeInTheDocument();
      expect(screen.queryByText("Figures")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have aria-label with document info", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(
        screen.getByRole("status", {
          name: /Reading Harrison's Internal Medicine, page 42 of 500/,
        })
      ).toBeInTheDocument();
    });
  });

  describe("end session button", () => {
    it("should render close button when onEndSession is provided", () => {
      const onEndSession = vi.fn();
      render(
        <DocumentContextIndicator
          session={mockSession}
          onEndSession={onEndSession}
        />
      );
      expect(
        screen.getByRole("button", { name: /end document session/i })
      ).toBeInTheDocument();
    });

    it("should not render close button when onEndSession is not provided", () => {
      render(<DocumentContextIndicator session={mockSession} />);
      expect(
        screen.queryByRole("button", { name: /end document session/i })
      ).not.toBeInTheDocument();
    });

    it("should call onEndSession when close button is clicked", () => {
      const onEndSession = vi.fn();
      render(
        <DocumentContextIndicator
          session={mockSession}
          onEndSession={onEndSession}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /end document session/i })
      );
      expect(onEndSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("size variants", () => {
    it("should render smaller text in sm size", () => {
      const { container } = render(
        <DocumentContextIndicator session={mockSession} size="sm" />
      );
      expect(container.firstChild).toHaveClass("text-xs");
    });

    it("should render larger text in md size", () => {
      const { container } = render(
        <DocumentContextIndicator session={mockSession} size="md" />
      );
      expect(container.firstChild).toHaveClass("text-sm");
    });
  });
});

describe("DocumentNavigationHints", () => {
  describe("rendering", () => {
    it("should not render when visible is false", () => {
      const { container } = render(
        <DocumentNavigationHints visible={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should render Voice Commands header", () => {
      render(<DocumentNavigationHints />);
      expect(screen.getByText("Voice Commands")).toBeInTheDocument();
    });

    it("should show next page hint", () => {
      render(<DocumentNavigationHints currentPage={1} totalPages={100} />);
      expect(screen.getByText(/"Next page"/)).toBeInTheDocument();
    });

    it("should show previous page hint when not on first page", () => {
      render(<DocumentNavigationHints currentPage={5} totalPages={100} />);
      expect(screen.getByText(/"Previous page"/)).toBeInTheDocument();
    });

    it("should not show previous page hint on first page", () => {
      render(<DocumentNavigationHints currentPage={1} totalPages={100} />);
      expect(screen.queryByText(/"Previous page"/)).not.toBeInTheDocument();
    });

    it("should not show next page hint on last page", () => {
      render(<DocumentNavigationHints currentPage={100} totalPages={100} />);
      expect(screen.queryByText(/"Next page"/)).not.toBeInTheDocument();
    });

    it("should show TOC hint when hasToc is true", () => {
      render(<DocumentNavigationHints hasToc={true} />);
      expect(screen.getByText(/"Table of contents"/)).toBeInTheDocument();
    });

    it("should show figure hint when hasFigures is true", () => {
      render(<DocumentNavigationHints hasFigures={true} />);
      expect(screen.getByText(/"Describe the figure"/)).toBeInTheDocument();
    });

    it("should always show read page hint", () => {
      render(<DocumentNavigationHints />);
      expect(screen.getByText(/"Read page \[number\]"/)).toBeInTheDocument();
    });
  });
});
