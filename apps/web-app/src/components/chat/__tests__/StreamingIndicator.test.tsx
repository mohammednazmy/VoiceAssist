/**
 * StreamingIndicator Component Tests
 * Tests for the animated streaming/typing indicator
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamingIndicator } from "../StreamingIndicator";

describe("StreamingIndicator", () => {
  it("should render without crashing", () => {
    const { container } = render(<StreamingIndicator />);
    expect(container).toBeInTheDocument();
  });

  it("should display default message", () => {
    render(<StreamingIndicator />);
    expect(screen.getByText("AI is thinking...")).toBeInTheDocument();
  });

  it("should display custom message", () => {
    render(<StreamingIndicator message="Processing your request..." />);
    expect(screen.getByText("Processing your request...")).toBeInTheDocument();
  });

  it("should have proper accessibility attributes", () => {
    render(<StreamingIndicator />);
    const indicator = screen.getByRole("status");
    expect(indicator).toHaveAttribute("aria-live", "polite");
    expect(indicator).toHaveAttribute(
      "aria-label",
      "AI is generating a response",
    );
  });

  it("should render three animated dots", () => {
    const { container } = render(<StreamingIndicator />);
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("should apply custom className", () => {
    const { container } = render(
      <StreamingIndicator className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("should have different animation delays for dots", () => {
    const { container } = render(<StreamingIndicator />);
    const dots = container.querySelectorAll(".animate-bounce");

    expect(dots[0]).toHaveStyle({ animationDelay: "0ms" });
    expect(dots[1]).toHaveStyle({ animationDelay: "200ms" });
    expect(dots[2]).toHaveStyle({ animationDelay: "400ms" });
  });

  it("should have aria-hidden on decorative dots", () => {
    const { container } = render(<StreamingIndicator />);
    const dots = container.querySelectorAll(".animate-bounce");

    dots.forEach((dot) => {
      expect(dot).toHaveAttribute("aria-hidden", "true");
    });
  });
});
