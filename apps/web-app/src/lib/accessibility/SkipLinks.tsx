/**
 * Skip Links - Phase 12: Accessibility & Compliance
 *
 * Provides keyboard-accessible skip navigation links for screen reader users.
 * Allows users to skip repetitive navigation and jump to main content.
 */

import React from "react";

export interface SkipLink {
  id: string;
  label: string;
}

const DEFAULT_SKIP_LINKS: SkipLink[] = [
  { id: "main-content", label: "Skip to main content" },
  { id: "main-navigation", label: "Skip to navigation" },
  { id: "search", label: "Skip to search" },
];

interface SkipLinksProps {
  links?: SkipLink[];
  className?: string;
}

export function SkipLinks({
  links = DEFAULT_SKIP_LINKS,
  className = "",
}: SkipLinksProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav aria-label="Skip navigation" className={`skip-links ${className}`}>
      <ul className="list-none m-0 p-0">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={`#${link.id}`}
              onClick={(e) => handleClick(e, link.id)}
              className="
                sr-only focus:not-sr-only
                focus:fixed focus:top-4 focus:left-4 focus:z-[9999]
                focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white
                focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2
                focus:ring-offset-2 focus:ring-primary-500
                transition-all duration-200
              "
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Landmark component for skip link targets
interface SkipLinkTargetProps {
  id: string;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function SkipLinkTarget({
  id,
  children,
  as: Component = "main",
  className = "",
}: SkipLinkTargetProps) {
  return React.createElement(
    Component,
    {
      id,
      tabIndex: -1,
      className: `outline-none ${className}`,
    },
    children,
  );
}

export default SkipLinks;
