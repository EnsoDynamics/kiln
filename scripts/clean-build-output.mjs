// Removes dist/ before a build, so a package packed on a developer's machine holds exactly what
// a clean CI build would (AC-PKG-03). A Node step rather than `rm`, because Windows CI packs too.

import { rmSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
