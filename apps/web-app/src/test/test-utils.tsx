/**
 * Custom Testing Utilities
 * Provides wrapped render functions with Router context
 */

import { ReactElement } from "react";
import {
  render,
  RenderOptions,
  renderHook,
  RenderHookOptions,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  initialEntries?: string[];
}

interface CustomRenderHookOptions<Props>
  extends Omit<RenderHookOptions<Props>, "wrapper"> {
  initialEntries?: string[];
}

/**
 * Custom render function that wraps components with MemoryRouter
 * Use this instead of @testing-library/react's render
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: CustomRenderOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Custom renderHook function that wraps hooks with MemoryRouter
 * Use this instead of @testing-library/react's renderHook
 */
export function renderHookWithRouter<Result, Props>(
  hook: (props: Props) => Result,
  { initialEntries = ["/"], ...options }: CustomRenderHookOptions<Props> = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  }

  return renderHook(hook, { wrapper: Wrapper, ...options });
}

// Re-export everything from @testing-library/react
export * from "@testing-library/react";

// Override render and renderHook exports
export { renderWithRouter as render, renderHookWithRouter as renderHook };
