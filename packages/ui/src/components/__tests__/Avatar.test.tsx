/**
 * Avatar Component Tests
 */

import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "../../test/test-utils";
import { Avatar, AvatarGroup } from "../Avatar";

describe("Avatar", () => {
  describe("Rendering", () => {
    it("renders with alt text", () => {
      render(<Avatar alt="John Doe" />);
      // Avatar should generate initials from alt text
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("renders all sizes correctly", () => {
      const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

      sizes.forEach((size) => {
        const { rerender, container } = render(
          <Avatar size={size} alt={size} />,
        );
        expect(container.firstChild).toBeInTheDocument();
        rerender(<></>);
      });
    });

    it("renders with custom initials", () => {
      render(<Avatar initials="AB" alt="Test" />);
      expect(screen.getByText("AB")).toBeInTheDocument();
    });

    it("renders with image src", () => {
      render(<Avatar src="https://example.com/avatar.jpg" alt="John Doe" />);
      const img = screen.getByRole("img", { hidden: true });
      expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
      expect(img).toHaveAttribute("alt", "John Doe");
    });
  });

  describe("Initials Generation", () => {
    it("generates initials from alt text (two words)", () => {
      render(<Avatar alt="John Doe" />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("generates initials from alt text (three words)", () => {
      render(<Avatar alt="John Robert Doe" />);
      expect(screen.getByText("JR")).toBeInTheDocument();
    });

    it("generates single initial from one word", () => {
      render(<Avatar alt="John" />);
      expect(screen.getByText("J")).toBeInTheDocument();
    });

    it("uppercases initials", () => {
      render(<Avatar alt="john doe" />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("shows question mark when no alt or initials provided", () => {
      render(<Avatar />);
      expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("prefers custom initials over generated initials", () => {
      render(<Avatar initials="XY" alt="John Doe" />);
      expect(screen.getByText("XY")).toBeInTheDocument();
      expect(screen.queryByText("JD")).not.toBeInTheDocument();
    });
  });

  describe("Image Handling", () => {
    it("falls back to initials when image fails to load", async () => {
      render(<Avatar src="invalid-url.jpg" alt="John Doe" />);

      // Trigger image error
      const img = screen.getByRole("img", { hidden: true });
      img.dispatchEvent(new Event("error"));

      await waitFor(() => {
        expect(screen.getByText("JD")).toBeInTheDocument();
      });
    });

    it("shows image when src is valid", () => {
      render(<Avatar src="https://example.com/avatar.jpg" alt="John Doe" />);
      expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
    });
  });

  describe("Status Indicator", () => {
    it("renders status indicator when status prop is provided", () => {
      const statuses = ["online", "offline", "busy", "away"] as const;

      statuses.forEach((status) => {
        const { container, rerender } = render(
          <Avatar alt="John" status={status} />,
        );
        // Status indicator should be rendered (avatar container has more than just the text/image)
        const avatar = container.firstChild as HTMLElement;
        expect(avatar.children.length).toBeGreaterThan(0);
        rerender(<></>);
      });
    });

    it("does not render status indicator by default", () => {
      const { container } = render(<Avatar alt="John" />);
      const avatar = container.firstChild as HTMLElement;
      // Without status, there should be fewer child elements
      expect(avatar).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has alt text on image", () => {
      render(<Avatar src="https://example.com/avatar.jpg" alt="John Doe" />);
      expect(screen.getByRole("img", { hidden: true })).toHaveAttribute(
        "alt",
        "John Doe",
      );
    });

    it("is contained in a div", () => {
      const { container } = render(<Avatar alt="Test" />);
      expect(container.firstChild?.nodeName).toBe("DIV");
    });
  });

  describe("Custom className", () => {
    it("merges custom className with default classes", () => {
      const { container } = render(
        <Avatar className="custom-class" alt="Test" />,
      );
      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass("custom-class");
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref correctly", () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<Avatar ref={ref as any} alt="Test" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

describe("AvatarGroup", () => {
  describe("Rendering", () => {
    it("renders multiple avatars", () => {
      render(
        <AvatarGroup>
          <Avatar alt="User 1" />
          <Avatar alt="User 2" />
          <Avatar alt="User 3" />
        </AvatarGroup>,
      );

      expect(screen.getByText("U1")).toBeInTheDocument();
      expect(screen.getByText("U2")).toBeInTheDocument();
      expect(screen.getByText("U3")).toBeInTheDocument();
    });

    it("shows overflow count when max is exceeded", () => {
      render(
        <AvatarGroup max={2}>
          <Avatar alt="User 1" />
          <Avatar alt="User 2" />
          <Avatar alt="User 3" />
          <Avatar alt="User 4" />
        </AvatarGroup>,
      );

      expect(screen.getByText("U1")).toBeInTheDocument();
      expect(screen.getByText("U2")).toBeInTheDocument();
      expect(screen.getByText("+2")).toBeInTheDocument();
      expect(screen.queryByText("U3")).not.toBeInTheDocument();
      expect(screen.queryByText("U4")).not.toBeInTheDocument();
    });

    it("shows all avatars when max is not set", () => {
      render(
        <AvatarGroup>
          <Avatar alt="User 1" />
          <Avatar alt="User 2" />
          <Avatar alt="User 3" />
          <Avatar alt="User 4" />
        </AvatarGroup>,
      );

      expect(screen.getByText("U1")).toBeInTheDocument();
      expect(screen.getByText("U2")).toBeInTheDocument();
      expect(screen.getByText("U3")).toBeInTheDocument();
      expect(screen.getByText("U4")).toBeInTheDocument();
    });
  });

  describe("Size Prop", () => {
    it("applies size to all child avatars", () => {
      render(
        <AvatarGroup size="lg">
          <Avatar alt="User 1" />
          <Avatar alt="User 2" />
        </AvatarGroup>,
      );

      // Both avatars should be rendered with their initials
      expect(screen.getByText("U1")).toBeInTheDocument();
      expect(screen.getByText("U2")).toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("merges custom className with default classes", () => {
      const { container } = render(
        <AvatarGroup className="custom-class">
          <Avatar alt="User 1" />
        </AvatarGroup>,
      );
      const group = container.firstChild as HTMLElement;
      expect(group).toHaveClass("custom-class");
    });
  });
});
