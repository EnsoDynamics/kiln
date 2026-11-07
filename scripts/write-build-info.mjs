// Records in dist/build-info.json what kind of build this is, for `kiln --version` (AC-HELP-03).
// Only CI's release candidate build sets KILN_RELEASE_BUILD=true. Every other build, such as
// `npm pack` or `npm link` from a checkout, is a development build stamped with when it was made.

import { writeFileSync } from 'node:fs';

const info = process.env.KILN_RELEASE_BUILD === 'true' ? { kind: 'release' } : { kind: 'development', builtAt: new Date().toISOString() };
writeFileSync(new URL('../dist/build-info.json', import.meta.url), `${JSON.stringify(info)}\n`);
