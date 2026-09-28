import { defineConfig } from "vite";

// Local only (ADR 0004): the dev server listens on 127.0.0.1, and /api is
// forwarded to the core, which also listens on 127.0.0.1 only.
const coreProxy = { "/api": "http://127.0.0.1:4800" };

// biome-ignore lint/style/noDefaultExport: Vite only discovers its configuration through a default export.
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: coreProxy,
  },
  preview: {
    host: "127.0.0.1",
    proxy: coreProxy,
  },
  build: {
    // Babylon.js alone is above Vite's 500 kB default; the viewer is a local tool.
    chunkSizeWarningLimit: 4000,
  },
});
