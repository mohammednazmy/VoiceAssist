/**
 * Tests for RoleBadge component
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleBadge } from "../RoleBadge";

describe("RoleBadge", () => {
  describe("rendering", () => {
    it("renders Admin label for admin role", () => {
      render(<RoleBadge role="admin" />);
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("renders Viewer label for viewer role", () => {
      render(<RoleBadge role="viewer" />);
      expect(screen.getByText("Viewer")).toBeInTheDocument();
    });

    it("renders User label for user role", () => {
      render(<RoleBadge role="user" />);
      expect(screen.getByText("User")).toBeInTheDocument();
    });
  });

  describe("admin styling", () => {
    it("applies purple background for admin", () => {
      render(<RoleBadge role="admin" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("bg-purple-900/50");
    });

    it("applies purple text color for admin", () => {
      render(<RoleBadge role="admin" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("text-purple-400");
    });
  });

  describe("viewer styling", () => {
    it("applies blue background for viewer", () => {
      render(<RoleBadge role="viewer" />);
      const badge = screen.getByText("Viewer");
      expect(badge).toHaveClass("bg-blue-900/50");
    });

    it("applies blue text color for viewer", () => {
      render(<RoleBadge role="viewer" />);
      const badge = screen.getByText("Viewer");
      expect(badge).toHaveClass("text-blue-400");
    });
  });

  describe("user styling", () => {
    it("applies slate background for user", () => {
      render(<RoleBadge role="user" />);
      const badge = screen.getByText("User");
      expect(badge).toHaveClass("bg-slate-800");
    });

    it("applies slate text color for user", () => {
      render(<RoleBadge role="user" />);
      const badge = screen.getByText("User");
      expect(badge).toHaveClass("text-slate-400");
    });
  });

  describe("size variants", () => {
    it("applies small size classes by default", () => {
      render(<RoleBadge role="admin" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("px-2");
      expect(badge).toHaveClass("py-0.5");
      expect(badge).toHaveClass("text-xs");
    });

    it("applies small size classes when size is sm", () => {
      render(<RoleBadge role="admin" size="sm" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("px-2");
      expect(badge).toHaveClass("py-0.5");
      expect(badge).toHaveClass("text-xs");
    });

    it("applies medium size classes when size is md", () => {
      render(<RoleBadge role="admin" size="md" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("px-3");
      expect(badge).toHaveClass("py-1");
      expect(badge).toHaveClass("text-sm");
    });
  });

  describe("common styling", () => {
    it("applies rounded-full class", () => {
      render(<RoleBadge role="admin" />);
      const badge = screen.getByText("Admin");
      expect(badge).toHaveClass("rounded-full");
    });

    it("applies font-medium class", () => {
      render(<RoleBadge role="viewer" />);
      const badge = screen.getByText("Viewer");
      expect(badge).toHaveClass("font-medium");
    });

    it("applies inline-flex class", () => {
      render(<RoleBadge role="user" />);
      const badge = screen.getByText("User");
      expect(badge).toHaveClass("inline-flex");
    });
  });

  describe("fallback behavior", () => {
    it("falls back to user styling for unknown role", () => {
      // @ts-expect-error Testing invalid role
      render(<RoleBadge role="unknown" />);
      // Should use user styling
      const badge = screen.getByText("User");
      expect(badge).toHaveClass("bg-slate-800");
      expect(badge).toHaveClass("text-slate-400");
    });
  });
});
