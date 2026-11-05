// What the build recorded about itself in dist/build-info.json, for `kiln --version`
// (AC-HELP-03): a release build, made by the release workflow, or a development build and when
// it was made. scripts/write-build-info.mjs writes the file at the end of `npm run build`.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type BuildInfo = { kind: "release" } | { kind: "development"; builtAt: string };

/** The build's own record; undefined when Kiln runs from source, which no build has stamped. */
export function readBuildInfo(file: URL): BuildInfo | undefined {
  if (!existsSync(file)) return undefined;
  let info: { kind?: unknown; builtAt?: unknown };
  try {
    info = JSON.parse(readFileSync(file, "utf8")) as typeof info;
  } catch (error) {
    throw new Error(`${fileURLToPath(file)} isn't valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (info?.kind === "release") return { kind: "release" };
  if (info?.kind === "development" && typeof info.builtAt === "string" && !Number.isNaN(Date.parse(info.builtAt))) return { kind: "development", builtAt: info.builtAt };
  throw new Error(`${fileURLToPath(file)} names neither a release nor a development build with its build time.`);
}

/**
 * The line `kiln --version` prints, with the build time in the reader's locale and time zone.
 *
 *   versionLine("1.0.0", { kind: "release" })                                       // "1.0.0"
 *   versionLine("1.0.0", { kind: "development", builtAt: "2026-11-05T13:14:00Z" })   // "1.0.0 (dev build, Nov 5, 8:14 AM)" in New York
 *   versionLine("1.0.0", undefined)                                                 // "1.0.0 (dev build)", from source
 */
export function versionLine(version: string, info: BuildInfo | undefined, now = new Date(), format: { locale?: string; timeZone?: string } = {}): string {
  if (info?.kind === "release") return version;
  if (!info) return `${version} (dev build)`;
  const builtAt = new Date(info.builtAt);
  const year = (date: Date) => new Intl.DateTimeFormat(format.locale, { year: "numeric", timeZone: format.timeZone }).format(date);
  const built = new Intl.DateTimeFormat(format.locale, {
    month: "short",
    day: "numeric",
    ...(year(builtAt) === year(now) ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZone: format.timeZone,
  }).format(builtAt);
  // ICU separates the time from AM/PM with a narrow no-break space; a terminal line keeps plain spaces.
  return `${version} (dev build, ${built.replace(/[\u202f\u00a0]/g, " ")})`;
}
