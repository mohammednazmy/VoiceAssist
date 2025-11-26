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
    // Use threads pool which is more memory efficient for these tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run all tests in single thread to prevent OOM
        isolate: false, // Disable isolation to reduce memory overhead
      },
    },
    // Limit concurrent tests to prevent memory exhaustion
    maxConcurrency: 3,
    // Run test files sequentially for more predictable memory usage
    fileParallelism: false,
    // Fix ESM import issues (react-syntax-highlighter is mocked via alias)
    deps: {
      inline: [
        'refractor',
        'remark-gfm',
        'remark-math',
        'rehype-katex',
      ],
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
