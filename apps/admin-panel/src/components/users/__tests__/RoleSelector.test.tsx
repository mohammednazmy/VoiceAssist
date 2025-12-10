/**
 * Tests for RoleSelector component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleSelector } from "../RoleSelector";

describe("RoleSelector", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders all three role options", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Viewer")).toBeInTheDocument();
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("renders role descriptions", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      expect(
        screen.getByText("Standard access to the application"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Read-only access to admin panel"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Full system access and management"),
      ).toBeInTheDocument();
    });

    it("renders radio inputs for each role", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(3);
    });

    it("shows user role as selected when value is user", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toBeChecked(); // User is first
    });

    it("shows viewer role as selected when value is viewer", () => {
      render(<RoleSelector value="viewer" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      expect(radios[1]).toBeChecked(); // Viewer is second
    });

    it("shows admin role as selected when value is admin", () => {
      render(<RoleSelector value="admin" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      expect(radios[2]).toBeChecked(); // Admin is third
    });
  });

  describe("interactions", () => {
    it("calls onChange when user role is selected", async () => {
      render(<RoleSelector value="admin" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      await userEvent.click(radios[0]); // User is first

      expect(mockOnChange).toHaveBeenCalledWith("user");
    });

    it("calls onChange when viewer role is selected", async () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      await userEvent.click(radios[1]); // Viewer is second

      expect(mockOnChange).toHaveBeenCalledWith("viewer");
    });

    it("calls onChange when admin role is selected", async () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      const radios = screen.getAllByRole("radio");
      await userEvent.click(radios[2]); // Admin is third

      expect(mockOnChange).toHaveBeenCalledWith("admin");
    });

    it("calls onChange when clicking on the label", async () => {
      render(<RoleSelector value="user" onChange={mockOnChange} />);

      // Click on the Admin label text
      await userEvent.click(screen.getByText("Admin"));

      expect(mockOnChange).toHaveBeenCalledWith("admin");
    });
  });

  describe("disabled state", () => {
    it("disables all radio inputs when disabled prop is true", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} disabled />);

      const radios = screen.getAllByRole("radio");
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it("does not call onChange when disabled", async () => {
      render(<RoleSelector value="user" onChange={mockOnChange} disabled />);

      // Get the admin radio by its container label with the Admin text
      const adminLabel = screen.getByText("Admin").closest("label");
      await userEvent.click(adminLabel!);

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("applies opacity styling when disabled", () => {
      render(<RoleSelector value="user" onChange={mockOnChange} disabled />);

      // Check that disabled styling is applied (opacity-50)
      const labels = screen
        .getAllByRole("radio")
        .map((r) => r.closest("label"));
      labels.forEach((label) => {
        expect(label).toHaveClass("opacity-50");
      });
    });
  });

  describe("selected state styling", () => {
    it("applies selected styling to the current role", () => {
      render(<RoleSelector value="admin" onChange={mockOnChange} />);

      const adminLabel = screen.getByText("Admin").closest("label");
      expect(adminLabel).toHaveClass("border-indigo-500");
      expect(adminLabel).toHaveClass("bg-indigo-500/10");
    });

    it("applies unselected styling to other roles", () => {
      render(<RoleSelector value="admin" onChange={mockOnChange} />);

      const userLabel = screen.getByText("User").closest("label");
      expect(userLabel).toHaveClass("border-slate-700");
      expect(userLabel).not.toHaveClass("border-indigo-500");
    });
  });
});
