import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Improve test stability and exit behavior
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    // Use forks pool which handles memory better with process isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Use separate forks per file for memory isolation
        isolate: true, // Enable isolation to clean memory between test files
      },
    },
    // Limit concurrent tests to prevent memory exhaustion
    maxConcurrency: 3,
    // Run test files sequentially for more predictable memory usage
    fileParallelism: false,
    // Include all test patterns
    include: ['src/**/*.test.{ts,tsx}'],
    // Exclude memory-heavy tests that cause OOM (tests importing heavy page components)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Integration tests import heavy page components causing OOM
      // TODO: These should be run separately with higher memory or in CI
      '**/integration/**',
    ],
    // Fix ESM import issues (react-syntax-highlighter is mocked via alias)
    server: {
      deps: {
        inline: [
          'refractor',
          'remark-gfm',
          'remark-math',
          'rehype-katex',
        ],
      },
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@voiceassist/ui', replacement: path.resolve(__dirname, '../../packages/ui/src') },
      { find: '@voiceassist/types', replacement: path.resolve(__dirname, '../../packages/types/src') },
      { find: '@voiceassist/api-client', replacement: path.resolve(__dirname, '../../packages/api-client/src') },
      { find: '@voiceassist/utils', replacement: path.resolve(__dirname, '../../packages/utils/src') },
      // Mock react-syntax-highlighter and all its sub-imports
      { find: /^react-syntax-highlighter(.*)$/, replacement: path.resolve(__dirname, './src/__mocks__/react-syntax-highlighter.tsx') },
    ],
  },
});
