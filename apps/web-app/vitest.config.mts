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
    // Use forks pool to get isolated memory for each worker, preventing OOM
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
        // Increase memory limit for workers (default is too low)
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    // Limit concurrent tests to prevent memory exhaustion
    maxConcurrency: 5,
    // Isolate test files for better memory cleanup between files
    fileParallelism: true,
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
