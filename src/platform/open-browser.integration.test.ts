// The real opener, run as Kiln runs it, against a stand-in xdg-open on the PATH.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "../test-support/engine-harness.js";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { openBrowser } from "./open-browser.js";

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

/** A stand-in xdg-open running `script`, alone on the PATH; `args` is where it may write. */
function opener(script: (args: string) => string) {
  sandbox = createSandbox();
  const args = join(sandbox.root, "args");
  writeFileSync(join(sandbox.root, "xdg-open"), `#!/bin/sh\n${script(args)}\n`, { mode: 0o755 });
  return { env: { ...sandbox.env, PATH: sandbox.root }, args };
}

// A shell-script stand-in for xdg-open; Windows opens through cmd's start, below.
describe.skipIf(process.platform === "win32")("opening the browser view", () => {
  const address = "http://127.0.0.1:4700/customer-returns";

  it("passes the address and resolves once the opener exits cleanly", async () => {
    const { env, args } = opener((file) => `printf '%s' "$*" > '${file}'`);
    expect(await openBrowser(address, env, "linux")).toBeUndefined();
    expect(readFileSync(args, "utf8")).toBe(address);
  });

  it("says why when the opener fails", async () => {
    const { env } = opener(() => "exit 3");
    expect(await openBrowser(address, env, "linux")).toMatch(/xdg-open exited with code 3$/);
  });

  it("doesn't wait on an opener that stays running, such as a browser started in the foreground", async () => {
    const { env, args } = opener((file) => `: > '${file}'; exec /bin/sleep 8`);
    const started = Date.now();
    expect(await openBrowser(address, env, "linux")).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(10_000);
    await waitFor(() => existsSync(args));
  });
});

// Windows opens through the real cmd.exe's start. A browser can't be stood in for there without
// a program of its own, so start is given a batch file in the address's place: start runs it in
// a window of its own, as it would hand a URL to the browser, and the file says it ran.
describe.runIf(process.platform === "win32")("opening the browser view on Windows", () => {
  it("hands the address to cmd's start and resolves once cmd exits", async () => {
    sandbox = createSandbox();
    const opened = join(sandbox.root, "opened");
    const page = join(sandbox.root, "page.cmd");
    writeFileSync(page, `@type nul > "${opened}"\r\n@exit\r\n`);
    expect(await openBrowser(page, sandbox.env, "win32")).toBeUndefined();
    await waitFor(() => existsSync(opened), 10_000);
  });

  it("says why when cmd can't be started", async () => {
    sandbox = createSandbox();
    const missing = join(sandbox.root, "missing-cmd.exe");
    expect(await openBrowser("http://127.0.0.1:4700/customer-returns", { ...sandbox.env, ComSpec: missing }, "win32")).toMatch(/ENOENT/);
  });
});
