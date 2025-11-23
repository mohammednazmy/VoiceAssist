/**
 * Vitest Setup
 * Global test configuration and setup
 */

import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Workaround for jsdom/webidl-conversions issue
// See: https://github.com/jsdom/jsdom/issues/3363
if (typeof globalThis.WeakRef === "undefined") {
  (globalThis as any).WeakRef = class WeakRef {
    private target: any;
    constructor(target: any) {
      this.target = target;
    }
    deref() {
      return this.target;
    }
  };
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
vi.stubEnv("VITE_API_URL", "http://localhost:8000");

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.location.href
delete (window as any).location;
window.location = { href: "" } as any;

// Mock React Router hooks
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null }),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Mock WebSocket for useChatSession tests
(global as any).WebSocket = class MockWebSocket {
  onopen?: () => void;
  onmessage?: (event: any) => void;
  onerror?: (err: any) => void;
  onclose?: () => void;
  send = vi.fn();
  close = vi.fn(function (this: any) {
    if (this.onclose) this.onclose();
  });

  constructor(public url: string) {
    // Simulate connection open asynchronously
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
};
