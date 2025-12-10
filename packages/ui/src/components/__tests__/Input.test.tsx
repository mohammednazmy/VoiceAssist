/**
 * Input Component Tests
 */

import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../test/test-utils";
import userEvent from "@testing-library/user-event";
import { Input } from "../Input";

describe("Input", () => {
  describe("Rendering", () => {
    it("renders with default props", () => {
      render(<Input />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders with placeholder", () => {
      render(<Input placeholder="Enter text" />);
      expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
    });

    it("renders all sizes correctly", () => {
      const sizes = ["sm", "md", "lg"] as const;

      sizes.forEach((size) => {
        const { rerender } = render(
          <Input inputSize={size} placeholder={size} />,
        );
        expect(screen.getByPlaceholderText(size)).toBeInTheDocument();
        rerender(<></>);
      });
    });

    it("renders with label", () => {
      render(<Input label="Email Address" />);
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    });

    it("renders required indicator when required", () => {
      render(<Input label="Name" required />);
      expect(screen.getByText("*")).toBeInTheDocument();
    });
  });

  describe("Helper Text", () => {
    it("displays helper text when provided", () => {
      render(<Input helperText="This is helpful" />);
      expect(screen.getByText("This is helpful")).toBeInTheDocument();
    });

    it("associates helper text with input using aria-describedby", () => {
      render(<Input helperText="Helper" id="test-input" />);
      const input = screen.getByRole("textbox");
      const helperTextId = input.getAttribute("aria-describedby");
      expect(helperTextId).toBe("test-input-helper");
      expect(document.getElementById(helperTextId!)).toHaveTextContent(
        "Helper",
      );
    });
  });

  describe("Error State", () => {
    it("shows error message when error is true", () => {
      render(<Input error errorMessage="This field is required" />);
      expect(screen.getByText("This field is required")).toBeInTheDocument();
    });

    it("applies error variant styling when error is true", () => {
      render(<Input error errorMessage="Error" />);
      const input = screen.getByRole("textbox");
      expect(input.className).toContain("border-error");
    });

    it("associates error message with input using aria-describedby", () => {
      render(<Input error errorMessage="Error message" id="error-input" />);
      const input = screen.getByRole("textbox");
      const errorMessageId = input.getAttribute("aria-describedby");
      expect(errorMessageId).toBe("error-input-error");
      expect(document.getElementById(errorMessageId!)).toHaveTextContent(
        "Error message",
      );
    });

    it("sets aria-invalid to true when error is true", () => {
      render(<Input error />);
      expect(screen.getByRole("textbox")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    it("shows error message instead of helper text when both provided", () => {
      render(<Input error errorMessage="Error" helperText="Helper" />);
      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.queryByText("Helper")).not.toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("renders left icon", () => {
      render(<Input iconLeft={<span data-testid="icon-left">📧</span>} />);
      expect(screen.getByTestId("icon-left")).toBeInTheDocument();
    });

    it("renders right icon", () => {
      render(<Input iconRight={<span data-testid="icon-right">👁️</span>} />);
      expect(screen.getByTestId("icon-right")).toBeInTheDocument();
    });

    it("renders both left and right icons", () => {
      render(
        <Input
          iconLeft={<span data-testid="icon-left">📧</span>}
          iconRight={<span data-testid="icon-right">👁️</span>}
        />,
      );
      expect(screen.getByTestId("icon-left")).toBeInTheDocument();
      expect(screen.getByTestId("icon-right")).toBeInTheDocument();
    });
  });

  describe("Input Types", () => {
    it('renders as password input when type="password"', () => {
      const { container } = render(<Input type="password" />);
      const input = container.querySelector('input[type="password"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "password");
    });

    it('renders as email input when type="email"', () => {
      render(<Input type="email" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
    });

    it('renders as number input when type="number"', () => {
      render(<Input type="number" />);
      expect(screen.getByRole("spinbutton")).toHaveAttribute("type", "number");
    });
  });

  describe("Interactions", () => {
    it("calls onChange when value changes", async () => {
      const onChange = vi.fn();
      render(<Input onChange={onChange} />);

      const user = userEvent.setup();
      const input = screen.getByRole("textbox");
      await user.type(input, "test");

      expect(onChange).toHaveBeenCalled();
      expect(input).toHaveValue("test");
    });

    it("calls onFocus when focused", async () => {
      const onFocus = vi.fn();
      render(<Input onFocus={onFocus} />);

      const input = screen.getByRole("textbox");
      input.focus();

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it("calls onBlur when blurred", async () => {
      const onBlur = vi.fn();
      render(<Input onBlur={onBlur} />);

      const input = screen.getByRole("textbox");
      input.focus();
      input.blur();

      expect(onBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled State", () => {
    it("is disabled when disabled prop is true", () => {
      render(<Input disabled />);
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("does not accept input when disabled", async () => {
      render(<Input disabled />);

      const user = userEvent.setup();
      const input = screen.getByRole("textbox");
      await user.type(input, "test");

      expect(input).toHaveValue("");
    });
  });

  describe("Full Width", () => {
    it("applies full width when fullWidth is true", () => {
      render(<Input fullWidth />);
      const container = screen
        .getByRole("textbox")
        .closest("div")?.parentElement;
      expect(container).toHaveClass("w-full");
    });
  });

  describe("Accessibility", () => {
    it("generates unique ID when id is not provided", () => {
      const { unmount } = render(<Input label="First" />);
      const firstId = screen.getByRole("textbox").id;
      expect(firstId).toBeTruthy();
      unmount();

      render(<Input label="Second" />);
      const secondId = screen.getByRole("textbox").id;
      expect(secondId).toBeTruthy();
      expect(firstId).not.toBe(secondId);
    });

    it("uses provided ID", () => {
      render(<Input id="custom-id" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("id", "custom-id");
    });

    it("associates label with input via htmlFor", () => {
      render(<Input label="Username" id="username" />);
      const label = screen.getByText("Username");
      const input = screen.getByRole("textbox");
      expect(label).toHaveAttribute("for", "username");
      expect(input).toHaveAttribute("id", "username");
    });

    it("sets aria-required when required", () => {
      render(<Input required />);
      expect(screen.getByRole("textbox")).toHaveAttribute(
        "aria-required",
        "true",
      );
    });

    it("is keyboard focusable", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      input.focus();
      expect(input).toHaveFocus();
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref correctly", () => {
      const ref = { current: null } as React.RefObject<HTMLInputElement>;
      render(<Input ref={ref as any} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe("Value Control", () => {
    it("works as controlled component", async () => {
      const TestComponent = () => {
        const [value, setValue] = React.useState("");
        return (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="controlled-input"
          />
        );
      };

      const { container } = render(<TestComponent />);
      const input = container.querySelector(
        '[data-testid="controlled-input"]',
      ) as HTMLInputElement;

      const user = userEvent.setup();
      await user.type(input, "controlled");

      expect(input).toHaveValue("controlled");
    });

    it("works as uncontrolled component with defaultValue", () => {
      render(<Input defaultValue="default value" />);
      expect(screen.getByRole("textbox")).toHaveValue("default value");
    });
  });
});
