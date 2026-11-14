// Whether npm has a newer release of Kiln than the one running (Kiln Newer Version Notice PRD,
// AC-NEWER-01, AC-NEWER-02, AC-NEWER-04). Asked once per `kiln` process; the browser view's
// top bar shows the answer when it arrives.
//
//   await newerKilnVersion("1.1.6", { kind: "release" })                          // "1.2.0" when npm's latest is 1.2.0
//   await newerKilnVersion("1.1.6", { kind: "development", builtAt: "…" })        // undefined, without asking npm
//   await newerKilnVersion("1.3.0", { kind: "release" })                          // undefined: npm's 1.2.0 is older

import type { BuildInfo } from "./build-info.js";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 3_000;
const PLAIN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * npm's latest version when it is strictly newer than `running`, else undefined. Only a release
 * build asks. The notice is optional, so an unreachable, slow or unreadable registry answers
 * undefined rather than an error.
 */
export async function newerKilnVersion(running: string, build: BuildInfo | undefined, options: { registry?: string; timeoutMs?: number } = {}): Promise<string | undefined> {
  if (build?.kind !== "release") return undefined;
  try {
    const response = await fetch(`${options.registry ?? REGISTRY}/@ensodynamics/kiln/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    if (response.status !== 200) return undefined;
    const latest = ((await response.json()) as { version?: unknown })?.version;
    return typeof latest === "string" && isNewer(latest, running) ? latest : undefined;
  } catch {
    return undefined;
  }
}

/** Whether plain `major.minor.patch` `candidate` is greater than `current`; false for anything else. */
function isNewer(candidate: string, current: string): boolean {
  const a = PLAIN.exec(candidate);
  const b = PLAIN.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i]);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
