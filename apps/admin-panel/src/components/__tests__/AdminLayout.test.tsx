/**
 * AdminLayout Component Tests
 * Tests the main admin layout structure including sidebar navigation
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminLayout } from "../AdminLayout";

describe("AdminLayout", () => {
  describe("branding", () => {
    it("should render VoiceAssist Admin branding", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("VoiceAssist Admin")).toBeInTheDocument();
    });

    it("should display demo mode indicator", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText(/Control center · demo/)).toBeInTheDocument();
    });

    it("should show clinical disclaimer", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText(/Not for clinical use/)).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should render Dashboard link", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    it("should render Knowledge Base link", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
    });

    it("should render Tools & Integrations link", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("Tools & Integrations")).toBeInTheDocument();
    });

    it("should render Settings link", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("should have correct navigation link targets", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByText("Knowledge Base").closest("a")).toHaveAttribute(
        "href",
        "#kb",
      );
      expect(
        screen.getByText("Tools & Integrations").closest("a"),
      ).toHaveAttribute("href", "#tools");
      expect(screen.getByText("Settings").closest("a")).toHaveAttribute(
        "href",
        "#settings",
      );
    });
  });

  describe("children rendering", () => {
    it("should render children in main area", () => {
      render(
        <AdminLayout>
          <div data-testid="test-content">Test content</div>
        </AdminLayout>,
      );

      expect(screen.getByTestId("test-content")).toBeInTheDocument();
      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("should render multiple children", () => {
      render(
        <AdminLayout>
          <div>First child</div>
          <div>Second child</div>
        </AdminLayout>,
      );

      expect(screen.getByText("First child")).toBeInTheDocument();
      expect(screen.getByText("Second child")).toBeInTheDocument();
    });

    it("should render complex nested children", () => {
      render(
        <AdminLayout>
          <section>
            <header>Page Header</header>
            <article>
              <h1>Article Title</h1>
              <p>Article content</p>
            </article>
          </section>
        </AdminLayout>,
      );

      expect(screen.getByText("Page Header")).toBeInTheDocument();
      expect(screen.getByText("Article Title")).toBeInTheDocument();
      expect(screen.getByText("Article content")).toBeInTheDocument();
    });
  });

  describe("structure", () => {
    it("should have sidebar aside element", () => {
      const { container } = render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      const aside = container.querySelector("aside");
      expect(aside).toBeInTheDocument();
    });

    it("should have main element for content", () => {
      const { container } = render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      const main = container.querySelector("main");
      expect(main).toBeInTheDocument();
    });

    it("should have nav element for navigation", () => {
      const { container } = render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      const nav = container.querySelector("nav");
      expect(nav).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should use semantic HTML elements", () => {
      const { container } = render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      expect(container.querySelector("aside")).toBeInTheDocument();
      expect(container.querySelector("nav")).toBeInTheDocument();
      expect(container.querySelector("main")).toBeInTheDocument();
    });

    it("should have all navigation links as anchor elements", () => {
      render(
        <AdminLayout>
          <div>Test content</div>
        </AdminLayout>,
      );

      const navLinks = [
        "Dashboard",
        "Knowledge Base",
        "Tools & Integrations",
        "Settings",
      ];
      navLinks.forEach((linkText) => {
        const link = screen.getByText(linkText);
        expect(link.tagName.toLowerCase()).toBe("a");
      });
    });
  });
});
