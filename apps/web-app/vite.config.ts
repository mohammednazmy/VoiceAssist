import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "VoiceAssist",
        short_name: "VoiceAssist",
        description: "Voice-first AI assistant for conversations and knowledge",
        theme_color: "#3b82f6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192x192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
        categories: ["productivity", "utilities"],
        shortcuts: [
          {
            name: "Voice Mode",
            url: "/voice",
            description: "Start voice conversation",
          },
          {
            name: "New Chat",
            url: "/chat",
            description: "Start a new chat",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    port: 5173,
    host: "0.0.0.0", // Allow external connections
    allowedHosts: ["dev.asimo.io"], // Allow dev.asimo.io domain
    hmr: {
      clientPort: 443, // Use HTTPS port for HMR through Apache proxy
      protocol: "wss", // Use secure WebSocket
    },
  },
  resolve: {
    alias: {
      "@voiceassist/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@voiceassist/types": path.resolve(__dirname, "../../packages/types/src"),
      "@voiceassist/api-client": path.resolve(
        __dirname,
        "../../packages/api-client/src",
      ),
      "@voiceassist/utils": path.resolve(__dirname, "../../packages/utils/src"),
      "@voiceassist/design-tokens": path.resolve(
        __dirname,
        "../../packages/design-tokens/src",
      ),
      // Dedupe React to prevent multiple instances
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
});
