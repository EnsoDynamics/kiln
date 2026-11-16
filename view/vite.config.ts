// Builds Kiln's browser view into dist/view, served by the local server (technical design,
// "Workload Type and Starting Point"). Everything it loads, fonts included, is bundled, so
// nothing the view loads leaves the machine (PRD AC-INSTALL-02).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// The build's own record, written just before this build, so the top bar names the build it is
// part of (AC-LOOK-05). With no record yet the view counts as run from source; `vite dev` embeds
// whatever record the last build left.
const buildInfoFile = new URL("../dist/build-info.json", import.meta.url);
const buildInfo = existsSync(buildInfoFile) ? JSON.parse(readFileSync(buildInfoFile, "utf8")) : null;

export default defineConfig({
  define: { __KILN_BUILD__: JSON.stringify(buildInfo) },
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
