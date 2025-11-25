/**
 * Custom Testing Utilities
 * Provides wrapped render functions with all necessary context providers
 */

import { ReactElement, ReactNode } from "react";
import {
  render,
  RenderOptions,
  renderHook,
  RenderHookOptions,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "../contexts/ToastContext";

// ============================================================================
// Types
// ============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  initialEntries?: string[];
  withToast?: boolean;
  route?: string;
}

interface CustomRenderHookOptions<Props>
  extends Omit<RenderHookOptions<Props>, "wrapper"> {
  initialEntries?: string[];
  withToast?: boolean;
}

// ============================================================================
// Provider Wrapper Components
// ============================================================================

/**
 * AllProviders wraps components with all common providers
 * Used by renderWithProviders for integration tests
 */
function AllProviders({
  children,
  initialEntries = ["/"],
  withToast = true,
}: {
  children: ReactNode;
  initialEntries?: string[];
  withToast?: boolean;
}) {
  const content = (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );

  if (withToast) {
    return <ToastProvider>{content}</ToastProvider>;
  }

  return content;
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Custom render function that wraps components with MemoryRouter only
 * Use for simple component tests that don't need ToastProvider
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
 * Custom render function that wraps components with ALL providers
 * Use for integration tests that need full context (ToastProvider, Router, etc.)
 *
 * @example
 * // Basic usage
 * renderWithProviders(<ChatPage />);
 *
 * // With custom route
 * renderWithProviders(<ChatPage />, { initialEntries: ['/chat/123'] });
 *
 * // Without toast (for isolated component tests)
 * renderWithProviders(<MessageList />, { withToast: false });
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ["/"],
    withToast = true,
    route,
    ...options
  }: CustomRenderOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AllProviders initialEntries={initialEntries} withToast={withToast}>
        {route ? (
          <Routes>
            <Route path={route} element={children} />
          </Routes>
        ) : (
          children
        )}
      </AllProviders>
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

/**
 * Custom renderHook function that wraps hooks with ALL providers
 * Use for hooks that depend on ToastProvider or other contexts
 */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  {
    initialEntries = ["/"],
    withToast = true,
    ...options
  }: CustomRenderHookOptions<Props> = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AllProviders initialEntries={initialEntries} withToast={withToast}>
        {children}
      </AllProviders>
    );
  }

  return renderHook(hook, { wrapper: Wrapper, ...options });
}

// ============================================================================
// Mock WebSocket Helper
// ============================================================================

/**
 * Creates a controllable mock WebSocket for testing
 *
 * @example
 * const { ws, simulateMessage, simulateOpen, simulateClose } = createMockWebSocket();
 * global.WebSocket = vi.fn(() => ws);
 *
 * // Later in test
 * simulateOpen();
 * simulateMessage({ type: 'message.done', message: {...} });
 */
export function createMockWebSocket() {
  let onopen: ((event: Event) => void) | null = null;
  let onclose: ((event: CloseEvent) => void) | null = null;
  let onerror: ((event: Event) => void) | null = null;
  let onmessage: ((event: MessageEvent) => void) | null = null;
  let readyState = 0; // CONNECTING

  const sentMessages: string[] = [];

  const ws = {
    get onopen() {
      return onopen;
    },
    set onopen(fn: ((event: Event) => void) | null) {
      onopen = fn;
    },
    get onclose() {
      return onclose;
    },
    set onclose(fn: ((event: CloseEvent) => void) | null) {
      onclose = fn;
    },
    get onerror() {
      return onerror;
    },
    set onerror(fn: ((event: Event) => void) | null) {
      onerror = fn;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn: ((event: MessageEvent) => void) | null) {
      onmessage = fn;
    },
    get readyState() {
      return readyState;
    },
    send: (data: string) => {
      sentMessages.push(data);
    },
    close: () => {
      readyState = 3; // CLOSED
      onclose?.(
        new CloseEvent("close", { code: 1000, reason: "Normal closure" }),
      );
    },
    url: "",
  };

  return {
    ws,
    sentMessages,
    getSentMessages: () => sentMessages.map((m) => JSON.parse(m)),
    simulateOpen: () => {
      readyState = 1; // OPEN
      onopen?.(new Event("open"));
    },
    simulateClose: (code = 1000, reason = "Normal closure") => {
      readyState = 3; // CLOSED
      onclose?.(new CloseEvent("close", { code, reason }));
    },
    simulateError: () => {
      onerror?.(new Event("error"));
    },
    simulateMessage: (data: object) => {
      onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    },
  };
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export everything from @testing-library/react
export * from "@testing-library/react";

// Override render and renderHook exports with router-wrapped versions
export { renderWithRouter as render, renderHookWithRouter as renderHook };
