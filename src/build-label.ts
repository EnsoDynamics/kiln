// What a build says about itself after its version, for `kiln --version` and the browser view's
// top bar (Kiln Public Release Readiness AC-HELP-03; Kiln v1 AC-LOOK-05). No Node imports, so the
// view uses it too, in the browser's time zone; build-info.ts reads the record from disk.

/** A release build, or a development build with when it was made and, from a Git checkout, its commit. */
export type BuildInfo = { kind: "release" } | { kind: "development"; builtAt: string; commit?: string; modified?: boolean };

/**
 * The text after the version: nothing for a release build, the commit and build time for a
 * development build, with the reader's short time zone name.
 *
 *   buildDetails({ kind: "release" })                                                                  // ""
 *   buildDetails({ kind: "development", builtAt: "2026-11-14T17:55:00Z", commit: "c363f8f" })          // " · dev c363f8f · built Nov 14, 12:55 PM EST" in New York
 *   buildDetails({ kind: "development", builtAt: "…", commit: "c363f8f", modified: true })             // " · dev c363f8f (modified) · built …"
 *   buildDetails({ kind: "development", builtAt: "…" })                                                // " · dev · built …", outside a Git checkout
 *   buildDetails(undefined)                                                                            // " · dev", run from source
 */
export function buildDetails(info: BuildInfo | undefined, now = new Date(), format: { locale?: string; timeZone?: string } = {}): string {
  if (info?.kind === "release") return "";
  if (!info) return " · dev";
  const builtAt = new Date(info.builtAt);
  const year = (date: Date) => new Intl.DateTimeFormat(format.locale, { year: "numeric", timeZone: format.timeZone }).format(date);
  const built = new Intl.DateTimeFormat(format.locale, {
    month: "short",
    day: "numeric",
    ...(year(builtAt) === year(now) ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: format.timeZone,
  }).format(builtAt);
  const commit = info.commit ? ` ${info.commit}${info.modified ? " (modified)" : ""}` : "";
  // ICU separates the time from AM/PM with a narrow no-break space; a terminal line keeps plain spaces.
  return ` · dev${commit} · built ${built.replace(/[\u202f\u00a0]/g, " ")}`;
}
