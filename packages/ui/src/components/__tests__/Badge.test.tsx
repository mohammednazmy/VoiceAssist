/**
 * Badge Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import { Badge } from '../Badge';

describe('Badge', () => {
  describe('Rendering', () => {
    it('renders with children text', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders all variants correctly', () => {
      const variants = ['default', 'primary', 'secondary', 'success', 'warning', 'error'] as const;

      variants.forEach((variant) => {
        const { rerender } = render(<Badge variant={variant}>{variant}</Badge>);
        expect(screen.getByText(variant)).toBeInTheDocument();
        rerender(<></>);
      });
    });

    it('renders all sizes correctly', () => {
      const sizes = ['sm', 'md'] as const;

      sizes.forEach((size) => {
        const { rerender } = render(<Badge size={size}>{size}</Badge>);
        expect(screen.getByText(size)).toBeInTheDocument();
        rerender(<></>);
      });
    });
  });

  describe('Dot Indicator', () => {
    it('shows dot when dot prop is true', () => {
      render(<Badge dot>With Dot</Badge>);
      const badge = screen.getByText('With Dot');
      // Check if dot span exists (has specific styling)
      const dot = badge.querySelector('span');
      expect(dot).toBeInTheDocument();
    });

    it('does not show dot by default', () => {
      render(<Badge>Without Dot</Badge>);
      const badge = screen.getByText('Without Dot');
      const dot = badge.querySelector('span');
      expect(dot).not.toBeInTheDocument();
    });
  });

  describe('Count Display', () => {
    it('displays count when provided', () => {
      render(<Badge count={5}>Notifications</Badge>);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('displays 99+ when count exceeds 99', () => {
      render(<Badge count={150}>Messages</Badge>);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('does not display count when 0', () => {
      render(<Badge count={0}>Empty</Badge>);
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('displays count=0 when showZero is true', () => {
      render(<Badge count={0} showZero>Empty</Badge>);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('merges custom className with default classes', () => {
      render(<Badge className="custom-class">Custom</Badge>);
      const badge = screen.getByText('Custom');
      expect(badge).toHaveClass('custom-class');
      expect(badge.className).toContain('inline-flex');
    });
  });

  describe('Accessibility', () => {
    it('renders as span element', () => {
      const { container } = render(<Badge>Badge</Badge>);
      const badge = container.firstChild;
      expect(badge?.nodeName).toBe('SPAN');
    });

    it('includes children in accessible name', () => {
      render(<Badge>Important</Badge>);
      expect(screen.getByText('Important')).toBeInTheDocument();
    });
  });

  describe('Variant Styling', () => {
    it('applies correct variant classes', () => {
      const { rerender } = render(<Badge variant="success">Success</Badge>);
      let badge = screen.getByText('Success');
      expect(badge.className).toContain('success');

      rerender(<Badge variant="error">Error</Badge>);
      badge = screen.getByText('Error');
      expect(badge.className).toContain('error');
    });
  });

  describe('Ref Forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLSpanElement>;
      render(<Badge ref={ref as any}>With Ref</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });
});
