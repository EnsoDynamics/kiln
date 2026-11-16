// What the build recorded about itself in dist/build-info.json, for `kiln --version`
// (AC-HELP-03): a release build, made by the release workflow, or a development build with when
// it was made and its commit. scripts/write-build-info.mjs writes the file during `npm run build`,
// before the view's build embeds it; build-label.ts formats it.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildDetails, type BuildInfo } from "./build-label.js";

export type { BuildInfo } from "./build-label.js";

/** The build's own record; undefined when Kiln runs from source, which no build has stamped. */
export function readBuildInfo(file: URL): BuildInfo | undefined {
  if (!existsSync(file)) return undefined;
  let info: { kind?: unknown; builtAt?: unknown; commit?: unknown; modified?: unknown };
  try {
    info = JSON.parse(readFileSync(file, "utf8")) as typeof info;
  } catch (error) {
    throw new Error(`${fileURLToPath(file)} isn't valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (info?.kind === "release") return { kind: "release" };
  if (info?.kind === "development" && typeof info.builtAt === "string" && !Number.isNaN(Date.parse(info.builtAt))
    && (info.commit === undefined || typeof info.commit === "string" && /^[0-9a-f]{4,40}$/.test(info.commit))
    && (info.modified === undefined || typeof info.modified === "boolean")) {
    return { kind: "development", builtAt: info.builtAt, ...(info.commit === undefined ? {} : { commit: info.commit }), ...(info.modified ? { modified: true } : {}) };
  }
  throw new Error(`${fileURLToPath(file)} names neither a release nor a development build with its build time.`);
}

/**
 * The line `kiln --version` prints, with the build time in the reader's locale and time zone.
 *
 *   versionLine("1.0.0", { kind: "release" })                                                              // "1.0.0"
 *   versionLine("1.0.0", { kind: "development", builtAt: "2026-11-05T13:14:00Z", commit: "c363f8f" })     // "1.0.0 · dev c363f8f · built Nov 5, 8:14 AM EST" in New York
 *   versionLine("1.0.0", undefined)                                                                        // "1.0.0 · dev", from source
 */
export function versionLine(version: string, info: BuildInfo | undefined, now = new Date(), format: { locale?: string; timeZone?: string } = {}): string {
  return `${version}${buildDetails(info, now, format)}`;
}
