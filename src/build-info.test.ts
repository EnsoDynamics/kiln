// AC-HELP-03: `kiln --version` prints the version alone for the release's build, and says when
// any other build was made, in the reader's local time.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { readBuildInfo, versionLine } from "./build-info.js";

const newYork = { locale: "en-US", timeZone: "America/New_York" };

describe("versionLine", () => {
  it("prints a release build's version alone", () => {
    expect(versionLine("1.0.0", { kind: "release" }, new Date("2026-11-05T13:14:00Z"), newYork)).toBe("1.0.0");
  });

  it("follows a development build's version with its build time in local time, without this year's year", () => {
    expect(versionLine("1.0.0", { kind: "development", builtAt: "2026-11-05T13:14:00Z" }, new Date("2026-11-06T09:00:00Z"), newYork)).toBe("1.0.0 (dev build, Nov 5, 8:14 AM)");
    expect(versionLine("1.0.0", { kind: "development", builtAt: "2026-11-05T13:14:00Z" }, new Date("2026-11-06T09:00:00Z"), { locale: "en-US", timeZone: "Europe/London" })).toBe("1.0.0 (dev build, Nov 5, 1:14 PM)");
  });

  it("gives the year when the build is from another year in the reader's time zone", () => {
    // 03:00 UTC on New Year's Day is still the previous evening, and year, in New York.
    expect(versionLine("1.0.0", { kind: "development", builtAt: "2026-01-01T03:00:00Z" }, new Date("2026-01-01T15:00:00Z"), newYork)).toBe("1.0.0 (dev build, Dec 31, 2025, 10:00 PM)");
    expect(versionLine("1.0.0", { kind: "development", builtAt: "2026-01-01T03:00:00Z" }, new Date("2026-01-01T15:00:00Z"), { locale: "en-US", timeZone: "UTC" })).toBe("1.0.0 (dev build, Jan 1, 3:00 AM)");
  });

  it("says dev build without a time when no build stamped it", () => {
    expect(versionLine("1.0.0", undefined)).toBe("1.0.0 (dev build)");
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
  });

  it("finds no build info when the file is absent", () => {
    expect(readBuildInfo(file("absent.json"))).toBeUndefined();
  });

  it("names the file when it isn't valid JSON", () => {
    expect(() => readBuildInfo(file("truncated.json", '{"kind":'))).toThrow(/truncated\.json isn't valid JSON/);
  });

  it("refuses a file that names neither kind or lacks a usable build time", () => {
    for (const [name, text] of [["unknown.json", '{"kind":"nightly"}'], ["no-time.json", '{"kind":"development"}'], ["bad-time.json", '{"kind":"development","builtAt":"soon"}']] as const) {
      expect(() => readBuildInfo(file(name, text)), name).toThrow(/names neither a release nor a development build/);
    }
  });
});
