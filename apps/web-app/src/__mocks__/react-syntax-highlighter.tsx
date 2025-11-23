/**
 * Mock for react-syntax-highlighter
 * Simplifies syntax highlighting in tests
 */

import { ReactElement } from "react";

interface SyntaxHighlighterProps {
  children: string;
  language?: string;
  style?: unknown;
  PreTag?: string | React.ComponentType;
  [key: string]: unknown;
}

// Mock Prism syntax highlighter
export const Prism = ({
  children,
  language,
}: SyntaxHighlighterProps): ReactElement => {
  return (
    <pre data-testid="syntax-highlighter" data-language={language}>
      <code>{children}</code>
    </pre>
  );
};

// Mock Light syntax highlighter
export const Light = Prism;

// Default export
export default Prism;

// Mock styles export
export const vscDarkPlus = {};
