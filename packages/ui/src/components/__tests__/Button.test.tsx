/**
 * Button Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../test/test-utils";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  describe("Rendering", () => {
    it("renders with default props", () => {
      render(<Button>Click me</Button>);
      expect(
        screen.getByRole("button", { name: "Click me" }),
      ).toBeInTheDocument();
    });

    it("renders all variants correctly", () => {
      const variants = [
        "primary",
        "secondary",
        "outline",
        "ghost",
        "danger",
        "success",
        "link",
      ] as const;

      variants.forEach((variant) => {
        const { rerender } = render(
          <Button variant={variant}>{variant}</Button>,
        );
        expect(screen.getByRole("button")).toBeInTheDocument();
        rerender(<></>);
      });
    });

    it("renders all sizes correctly", () => {
      const sizes = ["sm", "md", "lg"] as const;

      sizes.forEach((size) => {
        const { rerender } = render(<Button size={size}>{size}</Button>);
        expect(screen.getByRole("button")).toBeInTheDocument();
        rerender(<></>);
      });
    });

    it("renders with icons", () => {
      const { rerender } = render(
        <Button iconLeft={<span data-testid="icon-left">→</span>}>
          With Left Icon
        </Button>,
      );
      expect(screen.getByTestId("icon-left")).toBeInTheDocument();

      rerender(
        <Button iconRight={<span data-testid="icon-right">←</span>}>
          With Right Icon
        </Button>,
      );
      expect(screen.getByTestId("icon-right")).toBeInTheDocument();

      rerender(
        <Button
          iconLeft={<span data-testid="icon-left">→</span>}
          iconRight={<span data-testid="icon-right">←</span>}
        >
          With Both Icons
        </Button>,
      );
      expect(screen.getByTestId("icon-left")).toBeInTheDocument();
      expect(screen.getByTestId("icon-right")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("shows loading spinner when loading prop is true", () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("displays loadingText when provided", () => {
      render(
        <Button loading loadingText="Please wait...">
          Submit
        </Button>,
      );
      expect(screen.getByText("Please wait...")).toBeInTheDocument();
    });

    it("displays children text when loadingText is not provided", () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });

    it("is disabled when loading", async () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Submit
        </Button>,
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();

      const user = userEvent.setup();
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("has aria-busy attribute when loading", () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("Disabled State", () => {
    it("is disabled when disabled prop is true", () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not trigger onClick when disabled", async () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Disabled
        </Button>,
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Interactions", () => {
    it("triggers onClick when clicked", async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click me</Button>);

      const user = userEvent.setup();
      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("supports keyboard interaction (Enter)", async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Press me</Button>);

      const button = screen.getByRole("button");
      button.focus();

      const user = userEvent.setup();
      await user.keyboard("{Enter}");
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("supports keyboard interaction (Space)", async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Press me</Button>);

      const button = screen.getByRole("button");
      button.focus();

      const user = userEvent.setup();
      await user.keyboard(" ");
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Button Types", () => {
    it('renders as submit button when type="submit"', () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });

    it('renders as reset button when type="reset"', () => {
      render(<Button type="reset">Reset</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "reset");
    });

    it("renders as button by default", () => {
      render(<Button>Default</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });
  });

  describe("Accessibility", () => {
    it("is keyboard focusable", () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole("button");
      button.focus();
      expect(button).toHaveFocus();
    });

    it("has correct aria-label when provided", () => {
      render(<Button aria-label="Custom label">Icon Only</Button>);
      expect(screen.getByRole("button")).toHaveAccessibleName("Custom label");
    });

    it("has aria-busy=false when not loading", () => {
      render(<Button>Not Loading</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
    });
  });

  describe("FullWidth Prop", () => {
    it("applies full width class when fullWidth is true", () => {
      render(<Button fullWidth>Full Width</Button>);
      expect(screen.getByRole("button")).toHaveClass("w-full");
    });

    it("does not apply full width class by default", () => {
      render(<Button>Not Full Width</Button>);
      expect(screen.getByRole("button")).not.toHaveClass("w-full");
    });
  });

  describe("Custom className", () => {
    it("merges custom className with default classes", () => {
      render(<Button className="custom-class">Custom</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
      // Should still have default button classes
      expect(button.className).toContain("inline-flex");
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref correctly", () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement>;
      render(<Button ref={ref as any}>With Ref</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
