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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@voiceassist/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@voiceassist/types': path.resolve(__dirname, '../../packages/types/src'),
      '@voiceassist/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@voiceassist/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
});
