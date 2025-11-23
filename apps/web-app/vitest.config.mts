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
    // Prevent tests from hanging
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Fix ESM import issues with react-syntax-highlighter
    deps: {
      inline: [
        'react-syntax-highlighter',
        'refractor',
        'remark-gfm',
        'remark-math',
        'rehype-katex',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@voiceassist/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@voiceassist/types': path.resolve(__dirname, '../../packages/types/src'),
      '@voiceassist/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@voiceassist/utils': path.resolve(__dirname, '../../packages/utils/src'),
      'react-syntax-highlighter': path.resolve(__dirname, './src/__mocks__/react-syntax-highlighter.tsx'),
    },
  },
});
