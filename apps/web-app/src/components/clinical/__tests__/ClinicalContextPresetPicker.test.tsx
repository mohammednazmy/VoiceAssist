/**
 * ClinicalContextPresetPicker Unit Tests
 * Tests preset selection, compact mode, section expansion, and CRUD operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ClinicalContextPresetPicker,
  BUILTIN_PRESETS,
  type ClinicalContextPreset,
} from "../ClinicalContextPresetPicker";

describe("ClinicalContextPresetPicker", () => {
  const mockOnSelect = vi.fn();
  const mockOnSaveAsPreset = vi.fn();
  const mockOnDeletePreset = vi.fn();
  const mockOnEditPreset = vi.fn();

  const customPresets: ClinicalContextPreset[] = [
    {
      id: "custom-1",
      name: "My Custom Preset",
      description: "A custom patient profile",
      category: "custom",
      context: {
        chiefComplaint: "Follow-up visit",
        problems: ["Hypertension"],
        medications: ["Amlodipine 5mg daily"],
      },
      createdAt: "2024-01-15T10:00:00Z",
    },
    {
      id: "custom-2",
      name: "Second Custom",
      description: "Another custom profile",
      category: "custom",
      context: {
        chiefComplaint: "Annual checkup",
        problems: ["Diabetes"],
        medications: ["Metformin 500mg"],
      },
    },
  ];

  const defaultProps = {
    onSelect: mockOnSelect,
    onSaveAsPreset: mockOnSaveAsPreset,
    onDeletePreset: mockOnDeletePreset,
    onEditPreset: mockOnEditPreset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render the preset picker", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      expect(screen.getByTestId("preset-picker")).toBeInTheDocument();
    });

    it("should render built-in presets section toggle", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      expect(screen.getByTestId("builtin-presets-toggle")).toBeInTheDocument();
      expect(screen.getByText("Medical Specialties")).toBeInTheDocument();
    });

    it("should render custom presets section toggle", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      expect(screen.getByTestId("custom-presets-toggle")).toBeInTheDocument();
      expect(screen.getByText(/Custom Presets/)).toBeInTheDocument();
    });

    it("should show custom preset count in toggle", () => {
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      expect(screen.getByText("Custom Presets (2)")).toBeInTheDocument();
    });

    it("should render save as preset button when showSaveOption is true", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      expect(screen.getByTestId("save-as-preset")).toBeInTheDocument();
      expect(
        screen.getByText("Save Current Context as Preset"),
      ).toBeInTheDocument();
    });

    it("should not render save as preset button when showSaveOption is false", () => {
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          showSaveOption={false}
        />,
      );

      expect(screen.queryByTestId("save-as-preset")).not.toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("should render compact mode when compact prop is true", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} compact={true} />);

      expect(screen.getByTestId("preset-picker-compact")).toBeInTheDocument();
      expect(screen.queryByTestId("preset-picker")).not.toBeInTheDocument();
    });

    it("should render select dropdown in compact mode", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} compact={true} />);

      expect(screen.getByTestId("preset-select")).toBeInTheDocument();
    });

    it("should display all built-in presets in dropdown", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} compact={true} />);

      const select = screen.getByTestId("preset-select");
      BUILTIN_PRESETS.forEach((preset) => {
        expect(within(select).getByText(preset.name)).toBeInTheDocument();
      });
    });

    it("should display custom presets in dropdown when provided", () => {
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          compact={true}
          customPresets={customPresets}
        />,
      );

      const select = screen.getByTestId("preset-select");
      expect(within(select).getByText("My Custom Preset")).toBeInTheDocument();
      expect(within(select).getByText("Second Custom")).toBeInTheDocument();
    });

    it("should call onSelect when preset is selected in compact mode", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} compact={true} />);

      const select = screen.getByTestId("preset-select");
      await user.selectOptions(select, "cardiac-default");

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "cardiac-default" }),
      );
    });

    it("should show selected preset in compact mode", () => {
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          compact={true}
          selectedPresetId="diabetic-default"
        />,
      );

      const select = screen.getByTestId("preset-select") as HTMLSelectElement;
      expect(select.value).toBe("diabetic-default");
    });

    it("should be disabled when disabled prop is true in compact mode", () => {
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          compact={true}
          disabled={true}
        />,
      );

      const select = screen.getByTestId("preset-select");
      expect(select).toBeDisabled();
    });
  });

  describe("section expansion", () => {
    it("should expand built-in section when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      const toggle = screen.getByTestId("builtin-presets-toggle");
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("should show built-in presets when section is expanded", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      await user.click(screen.getByTestId("builtin-presets-toggle"));

      BUILTIN_PRESETS.forEach((preset) => {
        expect(screen.getByTestId(`preset-${preset.id}`)).toBeInTheDocument();
      });
    });

    it("should collapse built-in section when toggle is clicked again", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      const toggle = screen.getByTestId("builtin-presets-toggle");

      // Expand
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      // Collapse
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("should expand custom section when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      const toggle = screen.getByTestId("custom-presets-toggle");
      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("should show custom presets when section is expanded", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(screen.getByTestId("preset-custom-1")).toBeInTheDocument();
      expect(screen.getByTestId("preset-custom-2")).toBeInTheDocument();
    });

    it("should show empty state when no custom presets", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(screen.getByText(/No custom presets yet/)).toBeInTheDocument();
    });

    it("should close one section when another is opened", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      // Open built-in
      await user.click(screen.getByTestId("builtin-presets-toggle"));
      expect(screen.getByTestId("builtin-presets-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      // Open custom - built-in should close
      await user.click(screen.getByTestId("custom-presets-toggle"));
      expect(screen.getByTestId("custom-presets-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByTestId("builtin-presets-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });

  describe("preset selection", () => {
    it("should call onSelect when built-in preset is clicked", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      await user.click(screen.getByTestId("builtin-presets-toggle"));
      await user.click(screen.getByTestId("preset-cardiac-default"));

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cardiac-default",
          name: "Cardiac Patient",
        }),
      );
    });

    it("should call onSelect when custom preset is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));
      await user.click(screen.getByTestId("preset-custom-1"));

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "custom-1",
          name: "My Custom Preset",
        }),
      );
    });

    it("should show selected preset as pressed", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          selectedPresetId="cardiac-default"
        />,
      );

      await user.click(screen.getByTestId("builtin-presets-toggle"));

      const selectedPreset = screen.getByTestId("preset-cardiac-default");
      expect(selectedPreset).toHaveAttribute("aria-pressed", "true");

      const unselectedPreset = screen.getByTestId("preset-diabetic-default");
      expect(unselectedPreset).toHaveAttribute("aria-pressed", "false");
    });

    it("should not call onSelect when disabled", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} disabled={true} />);

      await user.click(screen.getByTestId("builtin-presets-toggle"));
      await user.click(screen.getByTestId("preset-cardiac-default"));

      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe("built-in presets content", () => {
    it("should include all 4 medical specialty presets", () => {
      expect(BUILTIN_PRESETS).toHaveLength(4);
      expect(BUILTIN_PRESETS.map((p) => p.id)).toEqual([
        "cardiac-default",
        "diabetic-default",
        "respiratory-default",
        "neurological-default",
      ]);
    });

    it("should have cardiac preset with correct context", () => {
      const cardiac = BUILTIN_PRESETS.find((p) => p.id === "cardiac-default");
      expect(cardiac).toBeDefined();
      expect(cardiac?.context.problems).toContain("Hypertension");
      expect(cardiac?.context.medications).toContain("Aspirin 81mg daily");
    });

    it("should have diabetic preset with blood glucose in vitals", () => {
      const diabetic = BUILTIN_PRESETS.find((p) => p.id === "diabetic-default");
      expect(diabetic).toBeDefined();
      expect(diabetic?.context.vitals?.bloodGlucose).toBe(145);
    });

    it("should have respiratory preset with allergies", () => {
      const respiratory = BUILTIN_PRESETS.find(
        (p) => p.id === "respiratory-default",
      );
      expect(respiratory).toBeDefined();
      expect(respiratory?.context.allergies).toContain("Penicillin - rash");
    });

    it("should have neurological preset with Parkinson's medications", () => {
      const neuro = BUILTIN_PRESETS.find(
        (p) => p.id === "neurological-default",
      );
      expect(neuro).toBeDefined();
      expect(neuro?.context.medications).toContain(
        "Carbidopa/Levodopa 25/100mg three times daily",
      );
    });
  });

  describe("custom preset actions", () => {
    it("should call onSaveAsPreset when save button is clicked", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      await user.click(screen.getByTestId("save-as-preset"));

      expect(mockOnSaveAsPreset).toHaveBeenCalledTimes(1);
    });

    it("should show edit button for custom presets", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(screen.getByTestId("edit-preset-custom-1")).toBeInTheDocument();
    });

    it("should call onEditPreset when edit button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));
      await user.click(screen.getByTestId("edit-preset-custom-1"));

      expect(mockOnEditPreset).toHaveBeenCalledTimes(1);
      expect(mockOnEditPreset).toHaveBeenCalledWith(
        expect.objectContaining({ id: "custom-1" }),
      );
    });

    it("should show delete button for custom presets", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(screen.getByTestId("delete-preset-custom-1")).toBeInTheDocument();
    });

    it("should call onDeletePreset when delete button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));
      await user.click(screen.getByTestId("delete-preset-custom-1"));

      expect(mockOnDeletePreset).toHaveBeenCalledTimes(1);
      expect(mockOnDeletePreset).toHaveBeenCalledWith("custom-1");
    });

    it("should not show edit button when onEditPreset is not provided", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          onSelect={mockOnSelect}
          onDeletePreset={mockOnDeletePreset}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(
        screen.queryByTestId("edit-preset-custom-1"),
      ).not.toBeInTheDocument();
    });

    it("should not show delete button when onDeletePreset is not provided", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          onSelect={mockOnSelect}
          onEditPreset={mockOnEditPreset}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      expect(
        screen.queryByTestId("delete-preset-custom-1"),
      ).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper aria-expanded on section toggles", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} />);

      expect(screen.getByTestId("builtin-presets-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.getByTestId("custom-presets-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("should have proper aria-pressed on preset buttons", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          selectedPresetId="cardiac-default"
        />,
      );

      await user.click(screen.getByTestId("builtin-presets-toggle"));

      const cardiac = screen.getByTestId("preset-cardiac-default");
      expect(cardiac).toHaveAttribute("aria-pressed", "true");
    });

    it("should have accessible labels on edit buttons", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      const editButton = screen.getByTestId("edit-preset-custom-1");
      expect(editButton).toHaveAttribute("aria-label", "Edit My Custom Preset");
    });

    it("should have accessible labels on delete buttons", async () => {
      const user = userEvent.setup();
      render(
        <ClinicalContextPresetPicker
          {...defaultProps}
          customPresets={customPresets}
        />,
      );

      await user.click(screen.getByTestId("custom-presets-toggle"));

      const deleteButton = screen.getByTestId("delete-preset-custom-1");
      expect(deleteButton).toHaveAttribute(
        "aria-label",
        "Delete My Custom Preset",
      );
    });

    it("should have label in compact mode", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} compact={true} />);

      expect(screen.getByText("Clinical Preset")).toBeInTheDocument();
    });
  });

  describe("disabled state", () => {
    it("should disable save button when disabled", () => {
      render(<ClinicalContextPresetPicker {...defaultProps} disabled={true} />);

      expect(screen.getByTestId("save-as-preset")).toBeDisabled();
    });

    it("should disable preset buttons when disabled", async () => {
      const user = userEvent.setup();
      render(<ClinicalContextPresetPicker {...defaultProps} disabled={true} />);

      await user.click(screen.getByTestId("builtin-presets-toggle"));

      const preset = screen.getByTestId("preset-cardiac-default");
      expect(preset).toBeDisabled();
    });
  });
});
