// What the published package's manifest promises: one command (AC-CLI-02), and nothing that
// runs at install time, so installing Kiln sets up no background or system service (AC-KEEP-01).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { bin: unknown; scripts: Record<string, string>; dependencies: Record<string, string> };

describe("the package manifest", () => {
  it("installs one command, kiln", () => {
    expect(manifest.bin).toEqual({ kiln: "dist/cli.js" });
  });

  // AC-AGENT-01: Kiln's own dependencies keep ordinary compatible ranges (up to the next major),
  // so no feature requires one exact installed version of them.
  it("gives every runtime dependency a compatible range, never one exact version", () => {
    expect(Object.keys(manifest.dependencies).length).toBeGreaterThan(0);
    for (const [name, range] of Object.entries(manifest.dependencies)) expect(range, name).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it("runs nothing when the package is installed", () => {
    for (const hook of ["preinstall", "install", "postinstall", "preuninstall", "uninstall", "postuninstall", "prepare"]) {
      expect(manifest.scripts[hook], hook).toBeUndefined();
    }
  });
});
