// The build this view is part of (AC-LOOK-05), as Vite embedded it. Undefined when nothing
// embedded one, as in a unit test, which counts as Kiln run from source.

import type { BuildInfo } from "../../../src/build-label.js";

export const build: BuildInfo | undefined = typeof __KILN_BUILD__ === "undefined" ? undefined : __KILN_BUILD__ ?? undefined;
