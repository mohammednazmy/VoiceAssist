/**
 * Tests for PlaybackSpeedControl component
 *
 * Tests the playback speed adjustment control with multiple variants.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  PlaybackSpeedControl,
  type PlaybackSpeed,
} from "../PlaybackSpeedControl";

// ============================================================================
// Test Helpers
// ============================================================================

function renderControl(props = {}) {
  const defaultProps = {
    speed: 1 as PlaybackSpeed,
    onSpeedChange: vi.fn(),
    ...props,
  };
  return render(<PlaybackSpeedControl {...defaultProps} />);
}

// ============================================================================
// Test Suites
// ============================================================================

describe("PlaybackSpeedControl", () => {
  describe("Buttons Variant (default)", () => {
    it("should render all speed option buttons", () => {
      renderControl({ variant: "buttons" });

      expect(screen.getByText("0.5x")).toBeInTheDocument();
      expect(screen.getByText("0.75x")).toBeInTheDocument();
      expect(screen.getByText("1x")).toBeInTheDocument();
      expect(screen.getByText("1.25x")).toBeInTheDocument();
      expect(screen.getByText("1.5x")).toBeInTheDocument();
      expect(screen.getByText("2x")).toBeInTheDocument();
    });

    it("should show 'Speed:' label", () => {
      renderControl({ variant: "buttons" });

      expect(screen.getByText("Speed:")).toBeInTheDocument();
    });

    it("should highlight currently selected speed", () => {
      renderControl({ speed: 1.5, variant: "buttons" });

      const selectedButton = screen.getByText("1.5x");
      expect(selectedButton).toHaveClass("bg-primary-500");
      expect(selectedButton).toHaveClass("text-white");
    });

    it("should not highlight unselected speeds", () => {
      renderControl({ speed: 1, variant: "buttons" });

      const unselectedButton = screen.getByText("0.5x");
      expect(unselectedButton).toHaveClass("bg-neutral-100");
      expect(unselectedButton).not.toHaveClass("bg-primary-500");
    });

    it("should call onSpeedChange when button is clicked", () => {
      const onSpeedChange = vi.fn();
      renderControl({ onSpeedChange, variant: "buttons" });

      fireEvent.click(screen.getByText("1.5x"));

      expect(onSpeedChange).toHaveBeenCalledWith(1.5);
    });

    it("should disable all buttons when disabled", () => {
      renderControl({ disabled: true, variant: "buttons" });

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it("should apply disabled styling", () => {
      renderControl({ disabled: true, variant: "buttons" });

      const button = screen.getByText("1x");
      expect(button).toHaveClass("disabled:opacity-50");
    });
  });

  describe("Dropdown Variant", () => {
    it("should render dropdown trigger button", () => {
      renderControl({ variant: "dropdown" });

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should display current speed on trigger", () => {
      renderControl({ speed: 1.25, variant: "dropdown" });

      expect(screen.getByText("1.25x")).toBeInTheDocument();
    });

    it("should have aria-haspopup attribute", () => {
      renderControl({ variant: "dropdown" });

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-haspopup",
        "listbox",
      );
    });

    it("should open dropdown on click", () => {
      renderControl({ variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));

      // All options should now be visible
      expect(screen.getByText("0.5x")).toBeInTheDocument();
      expect(screen.getByText("0.75x")).toBeInTheDocument();
      expect(screen.getByText("1.5x")).toBeInTheDocument();
      expect(screen.getByText("2x")).toBeInTheDocument();
    });

    it("should update aria-expanded when open", () => {
      renderControl({ variant: "dropdown" });

      const trigger = screen.getByRole("button");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("should show (Normal) label for 1x speed in dropdown", () => {
      renderControl({ variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));

      expect(screen.getByText("(Normal)")).toBeInTheDocument();
    });

    it("should call onSpeedChange when option is clicked", () => {
      const onSpeedChange = vi.fn();
      renderControl({ onSpeedChange, variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("2x"));

      expect(onSpeedChange).toHaveBeenCalledWith(2);
    });

    it("should close dropdown after selection", () => {
      renderControl({ variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("0.5x"));

      // Dropdown should close, so only one "1x" should remain (trigger shows selected)
      expect(screen.getAllByText(/x$/)).toHaveLength(1);
    });

    it("should close dropdown when clicking outside", () => {
      renderControl({ variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));

      // Click the backdrop
      const backdrop = document.querySelector(".fixed.inset-0");
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);

      // Dropdown should be closed
      expect(screen.queryByText("(Normal)")).not.toBeInTheDocument();
    });

    it("should highlight selected option in dropdown", () => {
      renderControl({ speed: 1.5, variant: "dropdown" });

      fireEvent.click(screen.getByRole("button"));

      const selectedOption = screen.getAllByText("1.5x")[1]; // Second one is in dropdown
      expect(selectedOption.closest("button")).toHaveClass("bg-primary-50");
    });

    it("should disable dropdown when disabled", () => {
      renderControl({ disabled: true, variant: "dropdown" });

      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("Slider Variant", () => {
    it("should render slider input", () => {
      renderControl({ variant: "slider" });

      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("should display label and current speed", () => {
      renderControl({ speed: 1.25, variant: "slider" });

      expect(screen.getByText("Playback Speed")).toBeInTheDocument();
      expect(screen.getByText("1.25x")).toBeInTheDocument();
    });

    it("should have correct slider attributes", () => {
      renderControl({ variant: "slider" });

      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", "5"); // 6 options, 0-indexed
      expect(slider).toHaveAttribute("step", "1");
    });

    it("should have associated label", () => {
      renderControl({ variant: "slider" });

      expect(screen.getByLabelText("Playback Speed")).toBeInTheDocument();
    });

    it("should show range labels", () => {
      renderControl({ variant: "slider" });

      expect(screen.getByText("0.5x")).toBeInTheDocument();
      expect(screen.getByText("2x")).toBeInTheDocument();
    });

    it("should set slider value based on current speed", () => {
      renderControl({ speed: 1.5, variant: "slider" });

      const slider = screen.getByRole("slider") as HTMLInputElement;
      // 1.5 is at index 4 in [0.5, 0.75, 1, 1.25, 1.5, 2]
      expect(slider.value).toBe("4");
    });

    it("should call onSpeedChange when slider changes", () => {
      const onSpeedChange = vi.fn();
      renderControl({ onSpeedChange, variant: "slider" });

      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "3" } });

      // Index 3 = 1.25x
      expect(onSpeedChange).toHaveBeenCalledWith(1.25);
    });

    it("should disable slider when disabled", () => {
      renderControl({ disabled: true, variant: "slider" });

      expect(screen.getByRole("slider")).toBeDisabled();
    });
  });

  describe("Custom Class Name", () => {
    it("should apply custom className to buttons variant", () => {
      const { container } = renderControl({
        variant: "buttons",
        className: "custom-class",
      });

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("should apply custom className to dropdown variant", () => {
      const { container } = renderControl({
        variant: "dropdown",
        className: "custom-class",
      });

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("should apply custom className to slider variant", () => {
      const { container } = renderControl({
        variant: "slider",
        className: "custom-class",
      });

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Speed Values", () => {
    it.each([0.5, 0.75, 1, 1.25, 1.5, 2] as PlaybackSpeed[])(
      "should handle speed %s correctly",
      (speed) => {
        const onSpeedChange = vi.fn();
        renderControl({ speed, onSpeedChange, variant: "buttons" });

        const label = speed === 1 ? "1x" : `${speed}x`;
        const button = screen.getByText(label);
        expect(button).toHaveClass("bg-primary-500");
      },
    );
  });
});
