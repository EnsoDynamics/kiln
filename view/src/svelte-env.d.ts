/// <reference types="svelte" />
/// <reference types="vite/client" />

/** The build's record from dist/build-info.json, embedded by view/vite.config.ts; null when no build has written one. */
declare const __KILN_BUILD__: import("../../src/build-label.js").BuildInfo | null;
