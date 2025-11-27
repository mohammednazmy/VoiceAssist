/**
 * Focus Trap - Phase 12: Accessibility & Compliance
 *
 * Traps keyboard focus within a component (for modals, dialogs, dropdowns).
 * Ensures users cannot tab outside the component.
 */

import React, { useRef, useEffect, useCallback } from "react";

// Focusable element selectors
const FOCUSABLE_SELECTORS = [
  "a[href]:not([disabled])",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
  '[contenteditable="true"]',
].join(", ");

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  returnFocusOnDeactivate?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
  finalFocus?: React.RefObject<HTMLElement>;
  onEscape?: () => void;
  className?: string;
}

export function FocusTrap({
  children,
  active = true,
  returnFocusOnDeactivate = true,
  initialFocus,
  finalFocus,
  onEscape,
  className = "",
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Get all focusable elements within container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
    ).filter((el) => el.offsetParent !== null); // Filter out hidden elements
  }, []);

  // Handle tab key navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      // Handle Escape key
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      // Only handle Tab key
      if (e.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab: go to previous
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: go to next
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [active, getFocusableElements, onEscape],
  );

  // Set initial focus when trap activates
  useEffect(() => {
    if (!active) return;

    // Store currently focused element
    previousActiveElement.current = document.activeElement;

    // Focus initial element or first focusable element
    const focusTarget = initialFocus?.current || getFocusableElements()[0];
    if (focusTarget) {
      // Delay to ensure DOM is ready
      requestAnimationFrame(() => {
        focusTarget.focus();
      });
    }

    // Cleanup: return focus to previous element
    return () => {
      if (returnFocusOnDeactivate) {
        const returnTarget =
          finalFocus?.current || previousActiveElement.current;
        if (returnTarget instanceof HTMLElement) {
          requestAnimationFrame(() => {
            returnTarget.focus();
          });
        }
      }
    };
  }, [
    active,
    returnFocusOnDeactivate,
    initialFocus,
    finalFocus,
    getFocusableElements,
  ]);

  // Add keydown listener
  useEffect(() => {
    if (!active) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, handleKeyDown]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

// Hook version for more flexible usage
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    active?: boolean;
    returnFocusOnDeactivate?: boolean;
    onEscape?: () => void;
  } = {},
) {
  const { active = true, returnFocusOnDeactivate = true, onEscape } = options;

  const previousActiveElement = useRef<Element | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
    ).filter((el) => el.offsetParent !== null);
  }, [containerRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [active, getFocusableElements, onEscape],
  );

  useEffect(() => {
    if (!active) return;

    previousActiveElement.current = document.activeElement;

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      requestAnimationFrame(() => {
        focusableElements[0].focus();
      });
    }

    return () => {
      if (
        returnFocusOnDeactivate &&
        previousActiveElement.current instanceof HTMLElement
      ) {
        requestAnimationFrame(() => {
          (previousActiveElement.current as HTMLElement).focus();
        });
      }
    };
  }, [active, returnFocusOnDeactivate, getFocusableElements]);

  useEffect(() => {
    if (!active) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, handleKeyDown]);

  return {
    getFocusableElements,
  };
}

export default FocusTrap;
