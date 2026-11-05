// Builds Kiln's browser view into dist/view, served by the local server (technical design,
// "Workload Type and Starting Point"). Everything it loads, fonts included, is bundled, so
// nothing the view loads leaves the machine (PRD AC-INSTALL-02).

import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/",
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL("../dist/view", import.meta.url)),
    emptyOutDir: true,
    // The published package ships no source maps (AC-PKG-02).
    sourcemap: false,
    // Fonts and the marks stay files: the Content Security Policy allows only Kiln's own origin.
    assetsInlineLimit: 0,
  },
});
