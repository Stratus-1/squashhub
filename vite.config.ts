import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { clubManifestsPlugin } from "./vite-plugin-club-manifests";

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  process.env.COMMIT_SHA ||
  process.env.BUILD_ID ||
  "dev";
const isWindows = process.platform === "win32";

export default defineConfig(() => ({
  define: {
    __GB_BUILD_ID__: JSON.stringify(buildId),
    __GB_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
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
    ...(!isWindows ? [mcpPlugin()] : []),
    clubManifestsPlugin(),
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
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Only split *leaf* libraries (no React context/singleton sharing) out
        // of the main chunk. Splitting react/radix/supabase created circular
        // chunk init ordering and a blank white screen in production.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (
            id.includes("jspdf") ||
            id.includes("xlsx") ||
            id.includes("html2canvas") ||
            id.includes("qrcode") ||
            id.includes("canvg")
          )
            return "vendor-docs";
          return undefined;
        },
      },

    },
  },
}));

