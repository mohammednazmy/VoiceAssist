/**
 * Vitest Setup for UI Components
 * Global test configuration and setup
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Workaround for jsdom/webidl-conversions issue
// See: https://github.com/jsdom/jsdom/issues/3363
if (typeof globalThis.WeakRef === 'undefined') {
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

// Mock window.matchMedia for theme and responsive components
Object.defineProperty(window, 'matchMedia', {
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

// Mock ResizeObserver for components that use it
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver for components that use it
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
