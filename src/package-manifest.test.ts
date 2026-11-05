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

  // AC-HELP-03: every build ends by recording its kind; only KILN_RELEASE_BUILD=true makes a
  // release build, and the release archive can't be packed from a development build.
  it("stamps each build as a release or a timed development build, and packs a candidate only from a release build", () => {
    expect(manifest.scripts.build).toMatch(/ && node scripts\/write-build-info\.mjs$/);
    const root = mkdtempSync(join(tmpdir(), "kiln-build-info-"));
    try {
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "dist"));
      copyFileSync(fileURLToPath(new URL("../scripts/write-build-info.mjs", import.meta.url)), join(root, "scripts", "write-build-info.mjs"));
      const build = (release?: string) => {
        const env: NodeJS.ProcessEnv = { ...process.env };
        if (release === undefined) delete env.KILN_RELEASE_BUILD;
        else env.KILN_RELEASE_BUILD = release;
        const result = spawnSync(process.execPath, [join(root, "scripts", "write-build-info.mjs")], { encoding: "utf8", env });
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(readFileSync(join(root, "dist", "build-info.json"), "utf8")) as { kind: string; builtAt?: string };
      };
      expect(build("true")).toEqual({ kind: "release" });
      for (const release of [undefined, "false"]) {
        const before = Date.now();
        const info = build(release);
        expect(info.kind, String(release)).toBe("development");
        expect(Date.parse(info.builtAt!)).toBeGreaterThanOrEqual(before - 1000);
        expect(Date.parse(info.builtAt!)).toBeLessThanOrEqual(Date.now());
      }
      // dist/ now holds a development build: packing it as a release candidate is refused before npm runs.
      for (const file of ["package.json", "package-lock.json"]) copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(root, file));
      const pack = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/pack-release.mjs", import.meta.url)), join(root, "out")], { cwd: root, encoding: "utf8", env: { ...process.env, KILN_RELEASE_BUILD: "true" } });
      expect(pack.status).not.toBe(0);
      expect(pack.stderr).toContain("dist/ holds a development build");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
