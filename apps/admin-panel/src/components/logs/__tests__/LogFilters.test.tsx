/**
 * Tests for LogFilters component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LogFilters, LogFiltersState } from "../LogFilters";

describe("LogFilters", () => {
  const defaultValue: LogFiltersState = {
    timeframe: "1h",
    search: "",
    level: "all",
    service: "",
  };

  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("timeframe buttons", () => {
    it("renders all timeframe options", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "6h" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "12h" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "24h" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    });

    it("highlights active timeframe", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const activeButton = screen.getByRole("button", { name: "1h" });
      expect(activeButton).toHaveClass("bg-blue-600");
    });

    it("calls onChange when timeframe clicked", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button", { name: "6h" }));

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        timeframe: "6h",
      });
    });

    it("updates active state when value changes", () => {
      const { rerender } = render(
        <LogFilters value={defaultValue} onChange={onChange} />,
      );

      rerender(
        <LogFilters
          value={{ ...defaultValue, timeframe: "24h" }}
          onChange={onChange}
        />,
      );

      const activeButton = screen.getByRole("button", { name: "24h" });
      expect(activeButton).toHaveClass("bg-blue-600");
    });
  });

  describe("level dropdown", () => {
    it("renders level select", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("has all level options", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Debug" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Info" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Warn" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Error" })).toBeInTheDocument();
    });

    it("shows current level as selected", () => {
      render(
        <LogFilters
          value={{ ...defaultValue, level: "error" }}
          onChange={onChange}
        />,
      );

      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("error");
    });

    it("calls onChange when level changed", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "warn" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        level: "warn",
      });
    });
  });

  describe("service input", () => {
    it("renders service input with placeholder", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const input = screen.getByPlaceholderText("Service (e.g. api, worker)");
      expect(input).toBeInTheDocument();
    });

    it("shows current service value", () => {
      render(
        <LogFilters
          value={{ ...defaultValue, service: "api" }}
          onChange={onChange}
        />,
      );

      const input = screen.getByPlaceholderText("Service (e.g. api, worker)");
      expect(input).toHaveValue("api");
    });

    it("calls onChange when service changed", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const input = screen.getByPlaceholderText("Service (e.g. api, worker)");
      fireEvent.change(input, { target: { value: "worker" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        service: "worker",
      });
    });
  });

  describe("search input", () => {
    it("renders search input with placeholder", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const input = screen.getByPlaceholderText("Search logs");
      expect(input).toBeInTheDocument();
    });

    it("shows current search value", () => {
      render(
        <LogFilters
          value={{ ...defaultValue, search: "error message" }}
          onChange={onChange}
        />,
      );

      const input = screen.getByPlaceholderText("Search logs");
      expect(input).toHaveValue("error message");
    });

    it("calls onChange when search changed", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const input = screen.getByPlaceholderText("Search logs");
      fireEvent.change(input, { target: { value: "test query" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultValue,
        search: "test query",
      });
    });

    it("has search input type", () => {
      render(<LogFilters value={defaultValue} onChange={onChange} />);

      const input = screen.getByPlaceholderText("Search logs");
      expect(input).toHaveAttribute("type", "search");
    });
  });

  describe("combined interactions", () => {
    it("preserves other values when one field changes", () => {
      const currentValue: LogFiltersState = {
        timeframe: "6h",
        search: "test",
        level: "error",
        service: "api",
      };

      render(<LogFilters value={currentValue} onChange={onChange} />);

      // Change just the timeframe
      fireEvent.click(screen.getByRole("button", { name: "24h" }));

      expect(onChange).toHaveBeenCalledWith({
        ...currentValue,
        timeframe: "24h",
      });
    });
  });
});
