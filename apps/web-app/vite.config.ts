import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React - shared across all pages
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Voice processing - only needed in voice mode
          "vendor-voice": ["idb"],
          // i18n - loaded with main app
          "vendor-i18n": [
            "i18next",
            "react-i18next",
            "i18next-browser-languagedetector",
          ],
          // Zustand state management
          "vendor-state": ["zustand"],
          // Markdown rendering - only needed in chat
          "vendor-markdown": [
            "react-markdown",
            "remark-gfm",
            "remark-math",
            "rehype-katex",
            "katex",
          ],
          // Data fetching
          "vendor-query": ["@tanstack/react-query", "axios"],
          // Icons
          "vendor-icons": ["lucide-react"],
        },
      },
    },
    // Increase warning limit to 600KB
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    VitePWA({
      // Use autoUpdate to immediately activate new service workers
      // This prevents stale SW issues by ensuring users always get the latest version
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "favicon.svg"],
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
          // PNG icons for broad compatibility (including iOS)
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-256x256.png",
            sizes: "256x256",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          // Maskable icons for Android adaptive icons
          {
            src: "/icons/icon-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          // SVG icon for modern browsers
          {
            src: "/icons/icon-512x512.svg",
            sizes: "any",
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
        // Immediately claim clients and skip waiting
        // This ensures new SW takes over immediately on update
        skipWaiting: true,
        clientsClaim: true,
        // Clean up outdated caches from previous versions
        cleanupOutdatedCaches: true,
        // Add a unique identifier to help track versions
        additionalManifestEntries: [],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Navigation fallback for SPA
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
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
        enabled: false, // Disabled to prevent stale dev SW issues in production
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
      // App-local imports
      "@": path.resolve(__dirname, "./src"),
      // Package aliases
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
