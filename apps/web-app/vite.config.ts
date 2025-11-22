
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@voiceassist/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@voiceassist/types': path.resolve(__dirname, '../../packages/types/src'),
      '@voiceassist/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@voiceassist/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@voiceassist/design-tokens': path.resolve(__dirname, '../../packages/design-tokens/src'),
    },
  },
});
