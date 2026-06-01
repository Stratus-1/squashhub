import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  process.env.COMMIT_SHA ||
  process.env.BUILD_ID ||
  "dev";

export default defineConfig(() => ({
  define: {
    __GB_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Use injectManifest? No — generateSW is simpler. Use existing manifest.webmanifest.
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: null, // we register manually with iframe/preview guard
      // Use the manifest file we ship in /public — don't let the plugin overwrite it.
      manifest: false,
      // Disable in dev/preview to avoid stale-cache nightmares inside Lovable iframe.
      devOptions: { enabled: false },
      includeAssets: [
        "favicon.png",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-512x512-maskable.png",
        "manifest.webmanifest",
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Never cache OAuth, auth-callbacks, supabase fn endpoints, sw files.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/auth\/callback/,
          /^\/auth/,
          /^\/reset-password/,
          /^\/booking-response/,
          /^\/api\//,
          /^\/functions\//,
          /\/sw\.js$/,
          /\/service-worker\.js$/,
          /\/manifest\.webmanifest$/,
        ],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // 5MB max per asset
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // HTML navigations: NetworkFirst so deploys land quickly.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Google fonts CSS
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-static",
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images
            urlPattern: ({ request }) => request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Supabase REST/auth/storage — never cache, but allow offline fallback to fail gracefully.
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
}));
