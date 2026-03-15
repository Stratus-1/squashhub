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
      strategies: "injectManifest",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "SquashHub",
        short_name: "SquashHub",
        description: "The all-in-one platform for squash clubs",
        theme_color: "#1e3a5f",
        background_color: "#f5f6f8",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,jpg,webmanifest}"],
      },
    }),
  ].filter(Boolean),
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
