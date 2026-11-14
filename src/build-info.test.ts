// AC-HELP-03: `kiln --version` prints the version alone for the release's build, and says which
// commit any other build was made from and when, in the reader's local time with its zone.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { readBuildInfo, versionLine } from "./build-info.js";

const newYork = { locale: "en-US", timeZone: "America/New_York" };

describe("versionLine", () => {
  const dev = { kind: "development" as const, builtAt: "2026-11-05T13:14:00Z", commit: "c363f8f" };

  it("prints a release build's version alone", () => {
    expect(versionLine("1.0.0", { kind: "release" }, new Date("2026-11-05T13:14:00Z"), newYork)).toBe("1.0.0");
  });

  it("follows a development build's version with its commit and build time in local time, with the zone's short name and without this year's year", () => {
    expect(versionLine("1.0.0", dev, new Date("2026-11-06T09:00:00Z"), newYork)).toBe("1.0.0 · dev c363f8f · built Nov 5, 8:14 AM EST");
    expect(versionLine("1.0.0", dev, new Date("2026-11-06T09:00:00Z"), { locale: "en-US", timeZone: "Europe/London" })).toBe("1.0.0 · dev c363f8f · built Nov 5, 1:14 PM GMT");
    expect(versionLine("1.0.0", dev, new Date("2026-11-06T09:00:00Z"), { locale: "en-US", timeZone: "UTC" })).toBe("1.0.0 · dev c363f8f · built Nov 5, 1:14 PM UTC");
    expect(versionLine("1.0.0", { ...dev, builtAt: "2026-07-05T13:14:00Z" }, new Date("2026-11-06T09:00:00Z"), newYork)).toBe("1.0.0 · dev c363f8f · built Jul 5, 9:14 AM EDT");
  });

  it("marks a build made from a checkout with uncommitted changes, and leaves the commit out outside a Git checkout", () => {
    expect(versionLine("1.0.0", { ...dev, modified: true }, new Date("2026-11-06T09:00:00Z"), newYork)).toBe("1.0.0 · dev c363f8f (modified) · built Nov 5, 8:14 AM EST");
    expect(versionLine("1.0.0", { kind: "development", builtAt: dev.builtAt }, new Date("2026-11-06T09:00:00Z"), newYork)).toBe("1.0.0 · dev · built Nov 5, 8:14 AM EST");
  });

  it("gives the year when the build is from another year in the reader's time zone", () => {
    // 03:00 UTC on New Year's Day is still the previous evening, and year, in New York.
    expect(versionLine("1.0.0", { ...dev, builtAt: "2026-01-01T03:00:00Z" }, new Date("2026-01-01T15:00:00Z"), newYork)).toBe("1.0.0 · dev c363f8f · built Dec 31, 2025, 10:00 PM EST");
    expect(versionLine("1.0.0", { ...dev, builtAt: "2026-01-01T03:00:00Z" }, new Date("2026-01-01T15:00:00Z"), { locale: "en-US", timeZone: "UTC" })).toBe("1.0.0 · dev c363f8f · built Jan 1, 3:00 AM UTC");
  });

  it("says dev without a commit or time when no build stamped it", () => {
    expect(versionLine("1.0.0", undefined)).toBe("1.0.0 · dev");
  });
});

describe("readBuildInfo", () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-build-info-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const file = (name: string, text?: string) => {
    const path = join(root, name);
    if (text !== undefined) writeFileSync(path, text);
    return pathToFileURL(path);
  };

  it("reads a release build and a development build with its time", () => {
    expect(readBuildInfo(file("release.json", '{"kind":"release"}\n'))).toEqual({ kind: "release" });
    expect(readBuildInfo(file("development.json", '{"kind":"development","builtAt":"2026-11-05T13:14:00.000Z"}\n'))).toEqual({ kind: "development", builtAt: "2026-11-05T13:14:00.000Z" });
    expect(readBuildInfo(file("commit.json", '{"kind":"development","builtAt":"2026-11-05T13:14:00.000Z","commit":"c363f8f","modified":false}\n'))).toEqual({ kind: "development", builtAt: "2026-11-05T13:14:00.000Z", commit: "c363f8f" });
    expect(readBuildInfo(file("modified.json", '{"kind":"development","builtAt":"2026-11-05T13:14:00.000Z","commit":"c363f8f","modified":true}\n'))).toEqual({ kind: "development", builtAt: "2026-11-05T13:14:00.000Z", commit: "c363f8f", modified: true });
  });

  it("finds no build info when the file is absent", () => {
    expect(readBuildInfo(file("absent.json"))).toBeUndefined();
  });

  it("names the file when it isn't valid JSON", () => {
    expect(() => readBuildInfo(file("truncated.json", '{"kind":'))).toThrow(/truncated\.json isn't valid JSON/);
  });

  it("refuses a file that names neither kind or lacks a usable build time", () => {
    for (const [name, text] of [["unknown.json", '{"kind":"nightly"}'], ["no-time.json", '{"kind":"development"}'], ["bad-time.json", '{"kind":"development","builtAt":"soon"}'], ["bad-commit.json", '{"kind":"development","builtAt":"2026-11-05T13:14:00Z","commit":"HEAD; rm"}'], ["bad-modified.json", '{"kind":"development","builtAt":"2026-11-05T13:14:00Z","commit":"c363f8f","modified":"yes"}']] as const) {
      expect(() => readBuildInfo(file(name, text)), name).toThrow(/names neither a release nor a development build/);
    }
  });
});
