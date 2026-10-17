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

// A shell-script stand-in for xdg-open; Windows opens through cmd's start, which isn't stood in for.
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
