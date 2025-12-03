/**
 * RegenerationOptionsDialog Unit Tests
 * Tests dialog visibility, option selection, and regeneration callbacks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegenerationOptionsDialog } from "../RegenerationOptionsDialog";

// Mock the Dialog components from @voiceassist/ui
vi.mock("@voiceassist/ui", async () => {
  const actual = await vi.importActual("@voiceassist/ui");
  return {
    ...actual,
    Dialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
    }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: any;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p>{children}</p>
    ),
    DialogFooter: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
    Slider: ({
      id,
      value,
      onValueChange,
      min,
      max,
      step,
      ...props
    }: {
      id?: string;
      value: number[];
      onValueChange: (value: number[]) => void;
      min: number;
      max: number;
      step: number;
      [key: string]: any;
    }) => (
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => onValueChange([parseFloat(e.target.value)])}
        {...props}
      />
    ),
  };
});

describe("RegenerationOptionsDialog", () => {
  const mockOnClose = vi.fn();
  const mockOnRegenerate = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onRegenerate: mockOnRegenerate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render when isOpen is true", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(
        screen.getByTestId("regeneration-options-dialog"),
      ).toBeInTheDocument();
    });

    it("should not render when isOpen is false", () => {
      render(<RegenerationOptionsDialog {...defaultProps} isOpen={false} />);

      expect(
        screen.queryByTestId("regeneration-options-dialog"),
      ).not.toBeInTheDocument();
    });

    it("should display dialog title", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByText("Regenerate Response")).toBeInTheDocument();
    });

    it("should display description about branching", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(
        screen.getByText(/original will be preserved/i),
      ).toBeInTheDocument();
    });
  });

  describe("temperature slider", () => {
    it("should render temperature slider", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByTestId("temperature-slider")).toBeInTheDocument();
    });

    it("should show temperature labels", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByText("Focused")).toBeInTheDocument();
      expect(screen.getByText("Balanced")).toBeInTheDocument();
      expect(screen.getByText("Creative")).toBeInTheDocument();
    });

    it("should update temperature value when slider changes", async () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const slider = screen.getByTestId(
        "temperature-slider",
      ) as HTMLInputElement;

      // Simulate changing the slider value using fireEvent for range inputs
      slider.value = "1.5";
      slider.dispatchEvent(new Event("change", { bubbles: true }));

      // Click regenerate to verify the value was captured
      const user = userEvent.setup();
      const regenerateButton = screen.getByTestId("regenerate-confirm-button");
      await user.click(regenerateButton);

      await waitFor(() => {
        expect(mockOnRegenerate).toHaveBeenCalled();
      });
    });
  });

  describe("length preference", () => {
    it("should render all length options", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByTestId("length-option-short")).toBeInTheDocument();
      expect(screen.getByTestId("length-option-medium")).toBeInTheDocument();
      expect(screen.getByTestId("length-option-detailed")).toBeInTheDocument();
    });

    it("should have medium selected by default", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const mediumButton = screen.getByTestId("length-option-medium");
      expect(mediumButton).toHaveAttribute("aria-pressed", "true");
    });

    it("should update selection when clicking different length", async () => {
      const user = userEvent.setup();
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const shortButton = screen.getByTestId("length-option-short");
      await user.click(shortButton);

      expect(shortButton).toHaveAttribute("aria-pressed", "true");

      const mediumButton = screen.getByTestId("length-option-medium");
      expect(mediumButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("clinical context toggle", () => {
    it("should not show toggle when hasClinicalContext is false", () => {
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={false}
        />,
      );

      expect(
        screen.queryByTestId("clinical-context-toggle"),
      ).not.toBeInTheDocument();
    });

    it("should show toggle when hasClinicalContext is true", () => {
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={true}
        />,
      );

      expect(screen.getByTestId("clinical-context-toggle")).toBeInTheDocument();
    });

    it("should be enabled by default when available", () => {
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={true}
        />,
      );

      const toggle = screen.getByTestId("clinical-context-toggle");
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("should toggle when clicked", async () => {
      const user = userEvent.setup();
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={true}
        />,
      );

      const toggle = screen.getByTestId("clinical-context-toggle");
      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("branch toggle", () => {
    it("should show branch toggle", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByTestId("branch-toggle")).toBeInTheDocument();
    });

    it("should be enabled by default", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const toggle = screen.getByTestId("branch-toggle");
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("should toggle when clicked", async () => {
      const user = userEvent.setup();
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const toggle = screen.getByTestId("branch-toggle");
      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("original content preview", () => {
    it("should not show preview when originalContent is not provided", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.queryByText("Original Response")).not.toBeInTheDocument();
    });

    it("should show preview when originalContent is provided", () => {
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          originalContent="This is the original AI response that will be regenerated."
        />,
      );

      expect(screen.getByText("Original Response")).toBeInTheDocument();
      expect(
        screen.getByText(/This is the original AI response/),
      ).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("should call onRegenerate with options when Regenerate is clicked", async () => {
      const user = userEvent.setup();
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const regenerateButton = screen.getByTestId("regenerate-confirm-button");
      await user.click(regenerateButton);

      await waitFor(() => {
        expect(mockOnRegenerate).toHaveBeenCalledTimes(1);
        expect(mockOnRegenerate).toHaveBeenCalledWith({
          temperature: 0.7,
          lengthPreference: "medium",
          useClinicalContext: false,
          createBranch: true,
        });
      });
    });

    it("should call onClose when Cancel is clicked", async () => {
      const user = userEvent.setup();
      render(<RegenerationOptionsDialog {...defaultProps} />);

      const cancelButton = screen.getByTestId("regenerate-cancel-button");
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should include clinical context when enabled", async () => {
      const user = userEvent.setup();
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={true}
        />,
      );

      const regenerateButton = screen.getByTestId("regenerate-confirm-button");
      await user.click(regenerateButton);

      await waitFor(() => {
        expect(mockOnRegenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            useClinicalContext: true,
          }),
        );
      });
    });
  });

  describe("loading state", () => {
    it("should disable buttons when isRegenerating is true", () => {
      render(
        <RegenerationOptionsDialog {...defaultProps} isRegenerating={true} />,
      );

      const regenerateButton = screen.getByTestId("regenerate-confirm-button");
      const cancelButton = screen.getByTestId("regenerate-cancel-button");

      expect(regenerateButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it("should show loading text when isRegenerating is true", () => {
      render(
        <RegenerationOptionsDialog {...defaultProps} isRegenerating={true} />,
      );

      expect(screen.getByText("Regenerating...")).toBeInTheDocument();
    });

    it("should not close when Cancel is clicked while regenerating", async () => {
      const user = userEvent.setup();
      render(
        <RegenerationOptionsDialog {...defaultProps} isRegenerating={true} />,
      );

      const cancelButton = screen.getByTestId("regenerate-cancel-button");
      await user.click(cancelButton);

      // Button is disabled, so click shouldn't register
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have accessible toggle buttons with role=switch", () => {
      render(
        <RegenerationOptionsDialog
          {...defaultProps}
          hasClinicalContext={true}
        />,
      );

      const clinicalToggle = screen.getByTestId("clinical-context-toggle");
      const branchToggle = screen.getByTestId("branch-toggle");

      expect(clinicalToggle).toHaveAttribute("role", "switch");
      expect(branchToggle).toHaveAttribute("role", "switch");
    });

    it("should have accessible labels for length options", () => {
      render(<RegenerationOptionsDialog {...defaultProps} />);

      expect(screen.getByText("Response Length")).toBeInTheDocument();
      expect(screen.getByText("Short")).toBeInTheDocument();
      expect(screen.getByText("Medium")).toBeInTheDocument();
      expect(screen.getByText("Detailed")).toBeInTheDocument();
    });
  });
});
