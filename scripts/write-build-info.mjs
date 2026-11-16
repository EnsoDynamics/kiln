// Records in dist/build-info.json what kind of build this is, for `kiln --version` and the view's
// top bar (AC-HELP-03, AC-LOOK-05). Only CI's release candidate build sets KILN_RELEASE_BUILD=true.
// Every other build, such as `npm pack` or `npm link` from a checkout, is a development build
// stamped with when it was made and, from a Git checkout, the commit and whether the checkout had
// uncommitted changes. It runs before the view's Vite build, which embeds the same record.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

/**
 * Kiln's own checkout's short commit and whether it has uncommitted changes, or nothing when
 * Kiln's folder holds no Git checkout. Inside one, a Git error fails the build rather than
 * quietly dropping the commit, and a folder unpacked inside another repository is never read as it.
 */
function checkout() {
  const root = new URL("..", import.meta.url);
  if (!existsSync(new URL(".git", root))) return {};
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return { commit: git("rev-parse", "--short", "HEAD"), modified: git("status", "--porcelain") !== "" };
}

const info = process.env.KILN_RELEASE_BUILD === "true" ? { kind: "release" } : { kind: "development", builtAt: new Date().toISOString(), ...checkout() };
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/build-info.json", import.meta.url), `${JSON.stringify(info)}\n`);
