// A real Chrome, headless, driven over the DevTools protocol, for the tests that render the
// browser view in a real browser (technical design, Testing Approach, "The view"). Chrome is on
// every CI runner; set CHROME_PATH to use another build.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES: Record<string, string[]> = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"],
};

export function chromePath(): string {
  const configured = process.env.CHROME_PATH;
  if (configured) return configured;
  const found = (CANDIDATES[process.platform] ?? []).find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`No Chrome found for the browser tests; looked in ${(CANDIDATES[process.platform] ?? []).join(", ")}. Set CHROME_PATH.`);
  return found;
}

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string }; sessionId?: string };

export interface BrowserPage {
  /** Evaluates an expression in the page and returns its value. */
  evaluate<T>(expression: string): Promise<T>;
  /** Waits until the expression is truthy, or fails after `timeoutMs`. */
  waitFor(expression: string, timeoutMs?: number): Promise<void>;
  /** A full-page PNG. */
  screenshot(): Promise<Buffer>;
  /** Messages Chrome logged: console errors and Content Security Policy violations included. */
  readonly problems: string[];
  close(): Promise<void>;
}

export interface HeadlessChrome {
  /**
   * Opens a page. `clock` pins the page's clock to that time (milliseconds since the epoch), so
   * relative times read as drawn; `timeZone` sets the page's time zone.
   */
  open(url: string, options?: { width?: number; height?: number; clock?: number; timeZone?: string }): Promise<BrowserPage>;
  close(): Promise<void>;
}

/**
 *   const chrome = await launchChrome();
 *   const page = await chrome.open("http://127.0.0.1:41250/customer-returns");
 *   await page.waitFor(`document.querySelector("h1")`);
 *   await chrome.close();
 */
export async function launchChrome(): Promise<HeadlessChrome> {
  const profile = mkdtempSync(join(tmpdir(), "kiln-chrome-"));
  const child: ChildProcess = spawn(chromePath(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb",
    // A page nobody looks at is otherwise treated as backgrounded: its timers and renderer are
    // throttled, which stalled pages and Browser.close on busy macOS runners.
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
    // Its own process group, so teardown can end the helpers (crash handler, GPU, network and
    // storage services) that outlive the browser and keep writing into its profile.
    detached: process.platform !== "win32",
  });
  // Retain the exit before any request: a signal exit leaves exitCode null, and
  // teardown may begin after the process's one exit event has already arrived.
  // Exit, not close: close also waits for every holder of the stderr pipe, and a
  // Chrome helper such as its crash handler can keep that open after Chrome ends.
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  const endpoint = await new Promise<string>((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(new Error(`Chrome didn't start: ${text}`)), 30_000);
    child.stderr!.on("data", (chunk: Buffer) => {
      text += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    child.once("exit", (code) => reject(new Error(`Chrome exited (${code}) before it listened: ${text}`)));
  });

  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Couldn't connect to Chrome's DevTools endpoint.")), { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const eventListeners = new Set<(message: Message) => void>();
  const disconnected = () => {
    for (const request of pending.values()) request.reject(new Error("Chrome DevTools connection closed."));
    pending.clear();
    eventListeners.clear();
  };
  socket.addEventListener("close", disconnected);
  socket.addEventListener("error", disconnected);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    if (message.id !== undefined) {
      const waiting = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiting?.reject(new Error(message.error.message));
      else waiting?.resolve(message.result ?? {});
    } else for (const listener of eventListeners) listener(message);
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) { reject(new Error("Chrome DevTools connection closed.")); return; }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return {
    async open(url, options = {}) {
      const width = options.width ?? 1280;
      const height = options.height ?? 900;
      const { targetId } = (await send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
      const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
      const problems: string[] = [];
      eventListeners.add((message) => {
        if (message.sessionId !== sessionId) return;
        if (message.method === "Log.entryAdded") {
          const entry = (message.params as { entry: { level: string; text: string; url?: string } }).entry;
          // The browser asks every page for a favicon, which Kiln doesn't serve.
          if (entry.url?.endsWith("/favicon.ico")) return;
          if (entry.level === "error" || entry.text.includes("Content Security Policy")) problems.push(entry.url ? `${entry.text} ${entry.url}` : entry.text);
        }
        if (message.method === "Runtime.exceptionThrown") problems.push(JSON.stringify((message.params as { exceptionDetails: unknown }).exceptionDetails));
        if (message.method === "Runtime.consoleAPICalled" && (message.params as { type: string }).type === "error") problems.push(JSON.stringify((message.params as { args: unknown }).args));
      });
      await send("Runtime.enable", {}, sessionId);
      await send("Log.enable", {}, sessionId);
      await send("Page.enable", {}, sessionId);
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      if (options.timeZone) await send("Emulation.setTimezoneOverride", { timezoneId: options.timeZone }, sessionId);
      if (options.clock !== undefined) {
        // Injected by DevTools, so the page's Content Security Policy doesn't apply to it.
        const source = `(() => { const Real = Date; const offset = ${options.clock} - Real.now();
          class Pinned extends Real { constructor(...args) { if (args.length === 0) super(Real.now() + offset); else super(...args); } static now() { return Real.now() + offset; } }
          globalThis.Date = Pinned; })();`;
        await send("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
      }
      await send("Page.navigate", { url }, sessionId);
      const evaluate = async <T>(expression: string): Promise<T> => {
        const answer = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)) as { result: { value: T }; exceptionDetails?: { text: string } };
        if (answer.exceptionDetails) throw new Error(`${expression}: ${JSON.stringify(answer.exceptionDetails)}`);
        return answer.result.value;
      };
      return {
        problems,
        evaluate,
        async waitFor(expression, timeoutMs = 10_000) {
          const until = Date.now() + timeoutMs;
          for (;;) {
            if (await evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return;
            if (Date.now() > until) throw new Error(`Timed out waiting for ${expression}; the page reads: ${await evaluate<string>("document.body.innerText").catch(() => "?")}`);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        },
        async screenshot() {
          const fullHeight = await evaluate<number>("Math.ceil(document.documentElement.scrollHeight)");
          // Capture beyond the viewport without resizing it: dvh layouts must keep their
          // real dimensions, and a screenshot must not change live-scroll behavior.
          const { data } = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(height, fullHeight), scale: 1 } }, sessionId)) as { data: string };
          return Buffer.from(data, "base64");
        },
        async close() {
          await send("Target.closeTarget", { targetId });
        },
      };
    },
    async close() {
      // Bounded so a Chrome that stops answering fails nothing but its own teardown.
      const within = (work: Promise<unknown>, ms: number) => new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), ms);
        void work.then(() => { clearTimeout(timer); resolve(true); });
      });
      await within(send("Browser.close").catch(() => undefined), 5_000);
      socket.close();
      if (!await within(exited, 10_000)) {
        process.stderr.write(`Chrome ${child.pid} didn't exit within 10 seconds of Browser.close; killing it.\n`);
        child.kill("SIGKILL");
        await exited;
      }
      if (process.platform !== "win32") {
        try { process.kill(-child.pid!, "SIGKILL"); }
        catch (error) { if (!["ESRCH", "EPERM"].includes((error as NodeJS.ErrnoException).code!)) throw error; }
        await waitForGroupExit(child.pid!);
      }
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}

/** Resolves once no process is left in the group, so nothing still writes into the profile. */
async function waitForGroupExit(group: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { process.kill(-group, 0); }
    catch (error) {
      // macOS answers EPERM for a group left with only unreaped exits, which write nothing.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH" || code === "EPERM") return;
      throw error;
    }
    if (Date.now() > deadline) throw new Error(`Chrome's process group ${group} was still running 10 seconds after it was killed.`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
