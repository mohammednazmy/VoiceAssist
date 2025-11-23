/**
 * App Smoke Test
 * Basic rendering test to verify the app initializes correctly
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

// TODO: Fix ESM import issue with react-syntax-highlighter (see KNOWN_ISSUES.md)
// Skipping this suite until the ESM compatibility issue is resolved
describe.skip("App Smoke Test", () => {
  it("should render without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it("should render the application shell", () => {
    render(<App />);
    // App should render the Router and basic structure
    const app =
      screen.getByRole("main", { name: /voiceassist/i }) ||
      document.querySelector('[role="main"]') ||
      document.body;
    expect(app).toBeInTheDocument();
  });

  it("should initialize without errors", () => {
    // This test verifies that all providers and context are set up correctly
    expect(() => render(<App />)).not.toThrow();
  });
});
