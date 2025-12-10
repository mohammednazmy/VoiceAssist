/**
 * CitationDisplay Unit Tests
 * Tests citation rendering, expansion, and source types
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitationDisplay } from "../CitationDisplay";
import type { Citation } from "@voiceassist/types";

// Mock useToastContext since CitationDisplay uses it for copy feedback
vi.mock("../../../contexts/ToastContext", () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

describe("CitationDisplay", () => {
  const kbCitation: Citation = {
    id: "cite-1",
    source: "kb",
    reference: "doc-medical-guidelines-2024",
    snippet:
      "Treatment protocols for acute conditions require immediate assessment.",
    page: 42,
    metadata: {
      author: "Dr. Smith",
      year: "2024",
    },
  };

  const urlCitation: Citation = {
    id: "cite-2",
    source: "url",
    reference: "https://example.com/article",
    snippet: "External research findings on treatment efficacy.",
  };

  describe("rendering", () => {
    it("should render nothing when citations array is empty", () => {
      const { container } = render(<CitationDisplay citations={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("should show source count for single citation", () => {
      render(<CitationDisplay citations={[kbCitation]} />);
      expect(screen.getByText("1 Source")).toBeInTheDocument();
    });

    it("should show source count for multiple citations", () => {
      render(<CitationDisplay citations={[kbCitation, urlCitation]} />);
      expect(screen.getByText("2 Sources")).toBeInTheDocument();
    });
  });

  describe("source type badges", () => {
    it("should show KB badge for knowledge base citations", () => {
      render(<CitationDisplay citations={[kbCitation]} />);

      const citationButton = screen.getByRole("button", { expanded: false });
      // The badge is in a span with specific styling (uppercase, rounded-full)
      const badges = within(citationButton).getAllByText(/knowledge base/i);
      // At least one should be the badge (smaller, uppercase styling)
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(badges[0]).toBeInTheDocument();
    });

    it("should show external link badge for URL citations", () => {
      render(<CitationDisplay citations={[urlCitation]} />);

      const citationButton = screen.getByRole("button", { expanded: false });
      // The badge and label both contain "External Link"
      const badges = within(citationButton).getAllByText(/external link/i);
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(badges[0]).toBeInTheDocument();
    });

    it("should show page number when present", () => {
      render(<CitationDisplay citations={[kbCitation]} />);
      expect(screen.getByText(/page 42/i)).toBeInTheDocument();
    });

    it("should not show page number when absent", () => {
      render(<CitationDisplay citations={[urlCitation]} />);
      expect(screen.queryByText(/page/i)).not.toBeInTheDocument();
    });
  });

  describe("expand/collapse behavior", () => {
    it("should start collapsed", () => {
      render(<CitationDisplay citations={[kbCitation]} />);

      // Snippet should not be visible initially
      expect(
        screen.queryByText(/treatment protocols/i),
      ).not.toBeInTheDocument();
    });

    it("should expand when clicked", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      const button = screen.getByRole("button", { expanded: false });
      await user.click(button);

      // Now snippet should be visible
      expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();
    });

    it("should collapse when clicked again", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      // Get the citation button (has aria-controls and aria-expanded)
      const button = screen.getByRole("button", { expanded: false });

      // Expand
      await user.click(button);
      expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();

      // Collapse - now button should be expanded
      const expandedButton = screen.getByRole("button", { expanded: true });
      await user.click(expandedButton);
      expect(
        screen.queryByText(/treatment protocols/i),
      ).not.toBeInTheDocument();
    });

    it("should toggle chevron icon on expand/collapse", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      // Get the citation expand/collapse button (has aria-expanded attribute)
      const button = screen.getByRole("button", { expanded: false });

      // Find the chevron icon within the citation button
      const buttonElement = button as HTMLElement;
      const chevron = buttonElement.querySelector("svg:last-child");

      // Initially not rotated
      expect(chevron).not.toHaveClass("rotate-180");

      // Click to expand
      await user.click(button);
      const expandedButton = screen.getByRole("button", { expanded: true });
      const expandedChevron = expandedButton.querySelector("svg:last-child");
      expect(expandedChevron).toHaveClass("rotate-180");

      // Click to collapse
      await user.click(expandedButton);
      const collapsedButton = screen.getByRole("button", { expanded: false });
      const collapsedChevron = collapsedButton.querySelector("svg:last-child");
      expect(collapsedChevron).not.toHaveClass("rotate-180");
    });
  });

  describe("expanded content", () => {
    it("should show snippet when expanded", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      // Click the citation expand button
      const button = screen.getByRole("button", { expanded: false });
      await user.click(button);

      expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();
    });

    it("should show reference when expanded", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      const button = screen.getByRole("button", { expanded: false });
      await user.click(button);

      expect(
        screen.getByText("doc-medical-guidelines-2024"),
      ).toBeInTheDocument();
    });

    it("should show metadata when present", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      const button = screen.getByRole("button", { expanded: false });
      await user.click(button);

      expect(screen.getByText("Dr. Smith")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });

    it("should show external link button for URL citations", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[urlCitation]} />);

      await user.click(screen.getByRole("button", { expanded: false }));

      const link = screen.getByRole("link", { name: /open source/i });
      expect(link).toHaveAttribute("href", "https://example.com/article");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should not show external link button for KB citations", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      const button = screen.getByRole("button", { expanded: false });
      await user.click(button);

      expect(
        screen.queryByRole("link", { name: /open source/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("multiple citations", () => {
    it("should render each citation independently", () => {
      const { container } = render(
        <CitationDisplay citations={[kbCitation, urlCitation]} />,
      );

      const buttons = container.querySelectorAll("button[aria-expanded]");
      expect(buttons).toHaveLength(2);
    });

    it("should expand citations independently", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation, urlCitation]} />);

      const buttons = screen.getAllByRole("button", { expanded: false });

      // Expand first citation
      await user.click(buttons[0]);
      expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();
      expect(screen.queryByText(/external research/i)).not.toBeInTheDocument();

      // Expand second citation
      await user.click(buttons[1]);
      expect(screen.getByText(/external research/i)).toBeInTheDocument();
      expect(screen.getByText(/treatment protocols/i)).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(<CitationDisplay citations={[kbCitation]} />);

      // Get the citation expand/collapse button (has aria-expanded)
      const button = screen.getByRole("button", { expanded: false });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-controls");
    });

    it("should update aria-expanded on toggle", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation]} />);

      // Get initial button state
      const button = screen.getByRole("button", { expanded: false });
      expect(button).toHaveAttribute("aria-expanded", "false");

      // Expand
      await user.click(button);
      const expandedButton = screen.getByRole("button", { expanded: true });
      expect(expandedButton).toHaveAttribute("aria-expanded", "true");

      // Collapse
      await user.click(expandedButton);
      const collapsedButton = screen.getByRole("button", { expanded: false });
      expect(collapsedButton).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("source filters", () => {
    it("should filter citations by selected source", async () => {
      const user = userEvent.setup();
      render(<CitationDisplay citations={[kbCitation, urlCitation]} />);

      // Find the filter group and click the External Link filter pill within it
      const filterGroup = screen.getByRole("group", {
        name: /filter citations by source/i,
      });
      const externalFilter = within(filterGroup).getByRole("button", {
        name: /external link/i,
      });
      await user.click(externalFilter);

      // The filter buttons have aria-pressed, citation buttons have aria-expanded
      const citationButtons = screen.getAllByRole("button", {
        expanded: false,
      });
      expect(citationButtons).toHaveLength(1);
      // The remaining citation should be "External Link" type
      const kbMatches = within(citationButtons[0]).queryAllByText(
        /knowledge base/i,
      );
      expect(kbMatches).toHaveLength(0);
      const externalMatches = within(citationButtons[0]).getAllByText(
        /external link/i,
      );
      expect(externalMatches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
