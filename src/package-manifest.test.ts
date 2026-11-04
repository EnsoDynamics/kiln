// What the published package's manifest promises: one command (AC-CLI-02), and nothing that
// runs at install time, so installing Kiln sets up no background or system service (AC-KEEP-01).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { bin: unknown; scripts: Record<string, string>; dependencies: Record<string, string>; [field: string]: unknown };

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

  // AC-PKG-01: the npm package page links home and to issues, and names the license holder.
  it("lists Kiln's homepage, issue page, author and search keywords", () => {
    expect(manifest.homepage).toBe("https://ensomethod.org/kiln/");
    expect(manifest.bugs).toEqual({ url: "https://github.com/EnsoDynamics/kiln/issues" });
    expect(manifest.author).toEqual({ name: "Enso Dynamics", email: "doug@ensodynamics.com" });
    expect(readFileSync(new URL("../LICENSE", import.meta.url), "utf8")).toContain("Copyright (c) 2026 Enso Dynamics");
    expect(manifest.keywords).toEqual(expect.arrayContaining(["claude-code", "codex", "ai-agents", "enso-method"]));
  });

  // AC-PKG-02: the production build emits no source maps (development type-checking keeps them).
  it("builds without source maps", () => {
    const build = JSON.parse(readFileSync(new URL("../tsconfig.build.json", import.meta.url), "utf8")) as { compilerOptions?: { sourceMap?: boolean } };
    expect(build.compilerOptions?.sourceMap).toBe(false);
    expect(readFileSync(new URL("../view/vite.config.ts", import.meta.url), "utf8")).toMatch(/\bsourcemap: false\b/);
  });

  // AC-PKG-03: every build starts by removing dist/, so nothing from an earlier build is packed.
  it("removes earlier build output before building", () => {
    expect(manifest.scripts.build).toMatch(/^node scripts\/clean-build-output\.mjs && /);
    const root = mkdtempSync(join(tmpdir(), "kiln-clean-build-"));
    try {
      mkdirSync(join(root, "scripts"));
      copyFileSync(fileURLToPath(new URL("../scripts/clean-build-output.mjs", import.meta.url)), join(root, "scripts", "clean-build-output.mjs"));
      mkdirSync(join(root, "dist", "retired"), { recursive: true });
      writeFileSync(join(root, "dist", "retired", "old-module.js"), "export {};\n");
      writeFileSync(join(root, "keep.txt"), "kept\n");
      const result = spawnSync(process.execPath, [join(root, "scripts", "clean-build-output.mjs")], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(join(root, "dist"))).toBe(false);
      expect(existsSync(join(root, "keep.txt"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
