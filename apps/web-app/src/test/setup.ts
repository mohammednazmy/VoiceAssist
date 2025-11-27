/**
 * Vitest Setup
 * Global test configuration and setup
 */

import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Some CI terminals report a column width of 0, which breaks Vitest's dot
// reporter when it tries to render progress rows. Ensure a sane default so the
// reporter can't compute Infinity rows and throw during test runs.
if (process.stdout && process.stdout.columns === 0) {
  process.stdout.columns = 80;
}
if (process.stderr && process.stderr.columns === 0) {
  process.stderr.columns = 80;
}

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

// Mock the PWA virtual module used by usePWA to avoid Vite-specific imports
// during Vitest runs.
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

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

// Mock window.location for BrowserRouter
delete (window as any).location;
window.location = {
  href: "http://localhost:3000/",
  origin: "http://localhost:3000",
  protocol: "http:",
  host: "localhost:3000",
  hostname: "localhost",
  port: "3000",
  pathname: "/",
  search: "",
  hash: "",
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
} as any;

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

// Mock IndexedDB for offline voice capture tests
// jsdom doesn't support IndexedDB, so we provide a minimal mock
const mockIDBRequest = () => ({
  result: null,
  error: null,
  source: null,
  transaction: null,
  readyState: "done" as const,
  onerror: null,
  onsuccess: null,
  onupgradeneeded: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

const mockIDBObjectStore = () => ({
  add: vi.fn(() => mockIDBRequest()),
  put: vi.fn(() => mockIDBRequest()),
  get: vi.fn(() => mockIDBRequest()),
  delete: vi.fn(() => mockIDBRequest()),
  clear: vi.fn(() => mockIDBRequest()),
  getAll: vi.fn(() => {
    const request = mockIDBRequest();
    (request as any).result = [];
    setTimeout(() => {
      if (request.onsuccess) (request as any).onsuccess({ target: request });
    }, 0);
    return request;
  }),
  openCursor: vi.fn(() => mockIDBRequest()),
  createIndex: vi.fn(),
  index: vi.fn(),
  count: vi.fn(() => mockIDBRequest()),
  name: "",
  keyPath: null,
  indexNames: { length: 0, contains: () => false, item: () => null },
  transaction: null,
  autoIncrement: false,
});

const mockIDBTransaction = () => ({
  objectStore: vi.fn(() => mockIDBObjectStore()),
  abort: vi.fn(),
  commit: vi.fn(),
  db: null as any,
  error: null,
  mode: "readwrite" as const,
  objectStoreNames: { length: 0, contains: () => false, item: () => null },
  oncomplete: null,
  onerror: null,
  onabort: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  durability: "default" as const,
});

const mockIDBDatabase = () => ({
  name: "voice-recordings",
  version: 1,
  objectStoreNames: {
    length: 1,
    contains: () => true,
    item: () => "recordings",
  },
  createObjectStore: vi.fn(() => mockIDBObjectStore()),
  deleteObjectStore: vi.fn(),
  transaction: vi.fn(() => mockIDBTransaction()),
  close: vi.fn(),
  onabort: null,
  onclose: null,
  onerror: null,
  onversionchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

(global as any).indexedDB = {
  open: vi.fn((_name: string) => {
    const request = mockIDBRequest();
    setTimeout(() => {
      (request as any).result = mockIDBDatabase();
      if (request.onsuccess) (request as any).onsuccess({ target: request });
    }, 0);
    return request;
  }),
  deleteDatabase: vi.fn(() => mockIDBRequest()),
  databases: vi.fn(() => Promise.resolve([])),
  cmp: vi.fn(),
};

// Mock navigator.mediaDevices for voice mode tests
Object.defineProperty(global.navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
      stop: vi.fn(),
    }),
    enumerateDevices: vi.fn().mockResolvedValue([
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Default Microphone",
        groupId: "",
      },
      {
        deviceId: "default",
        kind: "audiooutput",
        label: "Default Speaker",
        groupId: "",
      },
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  },
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
