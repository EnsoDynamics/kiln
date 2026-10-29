// Real Chrome transport/process teardown; the launcher records only its owned PID.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { chromePath, launchChrome, type HeadlessChrome } from "./headless-chrome.js";
import { posixShellPath } from "./git-repositories.js";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";

async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser teardown did not settle.")), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}

it.skipIf(process.platform === "win32")("rejects pending page work and closes after its real browser exits from a signal", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-browser-exit-"));
  const executable = chromePath();
  const previous = process.env.CHROME_PATH;
  const pidFile = join(root, "browser.pid");
  const launcher = join(root, "chrome.sh");
  writeFileSync(launcher, `#!/bin/sh\nprintf '%s' "$$" > ${posixShellPath(pidFile)}\nexec ${posixShellPath(executable)} "$@"\n`);
  chmodSync(launcher, 0o755);
  process.env.CHROME_PATH = launcher;
  let browser: HeadlessChrome | undefined;
  let pid: number | undefined;
  let identity: string | undefined;
  try {
    browser = await launchChrome();
    pid = Number(readFileSync(pidFile, "utf8"));
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
    identity = await processStartTime(pid);
    expect(identity).toBeDefined();
    const page = await browser.open("about:blank");
    const pending = page.evaluate("globalThis.browserExitProof = true; new Promise(() => {})")
      .then(() => "unexpected success", error => (error as Error).message);
    await page.waitFor("globalThis.browserExitProof === true");
    process.kill(pid, "SIGTERM");
    expect(await bounded(pending, 5000)).toMatch(/Chrome.*closed/);
    await bounded(browser.close(), 5000);
    expect(await isProcessLive(pid, identity)).toBe(false);
    // Repeated cleanup must also settle after an already observed signal exit.
    await bounded(browser.close(), 5000);
  } finally {
    if (pid && identity && await isProcessLive(pid, identity)) process.kill(pid, "SIGKILL");
    // Bound failure cleanup too, so the red check cannot poison following tests.
    await bounded(browser?.close() ?? Promise.resolve(), 2000).catch(() => undefined);
    if (previous === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
}, 45_000);
