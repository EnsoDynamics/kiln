// AC-LIVE-02: break only the browser transport while the actual controller and its
// scripted provider subprocess remain alive. This does not qualify a provider runtime.
import { createServer, request, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness, waitFor } from "../test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer } from "./local-server.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

// A local network fault fixture, not a replacement controller or browser API.
async function transportProxy(upstream: URL) {
  const streams = new Set<ServerResponse>();
  let broken = false;
  const mutations: string[] = [];
  const server = createServer((incoming, outgoing) => {
    const events = incoming.url?.startsWith("/api/events");
    if (events && broken) { outgoing.writeHead(503).end(); return; }
    if (incoming.method !== "GET") mutations.push(`${incoming.method} ${incoming.url}`);
    const forwarded = request(new URL(incoming.url!, upstream), {
      method: incoming.method,
      headers: { ...incoming.headers, host: upstream.host, ...(incoming.headers.origin ? { origin: upstream.origin } : {}) },
    }, response => {
      outgoing.writeHead(response.statusCode!, response.headers);
      if (events) streams.add(outgoing);
      response.pipe(outgoing);
    });
    forwarded.on("error", () => { outgoing.destroy(); });
    outgoing.on("close", () => { streams.delete(outgoing); forwarded.destroy(); });
    incoming.pipe(forwarded);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing proxy port");
  return {
    address: `http://127.0.0.1:${address.port}${upstream.pathname}`,
    mutations,
    disconnect() { broken = true; for (const stream of streams) stream.destroy(); },
    reconnect() { broken = false; },
    async close() {
      for (const stream of streams) stream.destroy();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

it.skipIf(process.platform !== "darwin").each([1200, 390])("retains last-known state, output and draft through transport loss while the attempt lives at %i", async width => {
  const h = await createHarness({ sessions: [] });
  let controller: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  let proxy: Awaited<ReturnType<typeof transportProxy>> | undefined;
  let page: Awaited<ReturnType<HeadlessChrome["open"]>> | undefined;
  const release = join(h.sandbox.root, "release");
  try {
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Operation still running" }, { touch: ready }, { waitForFile: release }, { result: "Unfinished work retained" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(ready));
    const run = h.engine.latestSession("1")!.runs.at(-1)!;
    let port = 44120;
    while (!await isPortFree(port)) port++;
    controller = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    proxy = await transportProxy(new URL(controller.address));
    page = await chrome.open(`${proxy.address}/phase/1`, { width, height: 1000 });
    await page.waitFor(`document.querySelector('#live-message')`);
    const draft = "  keep this exact draft\n";
    await page.evaluate(`document.querySelector('#live-message').value=${JSON.stringify(draft)}; document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}))`);
    proxy.disconnect();
    await page.waitFor(`document.body.innerText.includes('Connection to Kiln lost')`, 20000);
    let text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("Last-known state, observed at");
    expect(text).toContain("Work may still be running.");
    expect(text).toContain("reconnect before acting or opening the conversation in your terminal");
    expect(text).toContain("Operation still running");
    expect(text).not.toMatch(/Kiln isn’t running|Nothing is being worked on|Interrupted|terminal running Kiln was closed|kiln run docs/);
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(true);
    expect(h.engine.liveTarget()?.attemptId).toBe(run.live!.attemptId);
    expect(await page.evaluate(`document.querySelector('#live-message').value`)).toBe(draft);
    const buttons = `Array.from(document.querySelectorAll('button')).filter(b=>['Send message','Pause & take over','Pause after this phase'].includes(b.textContent.trim()))`;
    expect(await page.evaluate(`${buttons}.length`)).toBe(3);
    expect(await page.evaluate(`${buttons}.every(b=>b.disabled)`)).toBe(true);
    expect(proxy.mutations).toEqual([]);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-live-connection-detail-${width}.png`, await page.screenshot());
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='All phases').click()`);
    await page.waitFor(`document.body.innerText.includes('Last known: phase 1')`);
    text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("Last known: Implementing");
    expect(text).not.toMatch(/Interrupted|Kiln isn’t running|Nothing is being worked on|terminal running Kiln was closed/);
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(true);
    writeFileSync(`/tmp/kiln-live-connection-overview-${width}.png`, await page.screenshot());
    proxy.reconnect();
    await page.waitFor(`document.body.innerText.includes('Connected to Kiln')`, 20000);
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Control live session').click()`);
    await page.waitFor(`document.querySelector('#live-message')?.value===${JSON.stringify(draft)}`);
    expect(await page.evaluate("document.body.innerText")).not.toContain("Connection to Kiln lost");
    expect(await page.evaluate(`${buttons}.every(b=>!b.disabled)`)).toBe(true);
    expect(proxy.mutations).toEqual([]);
    expect(h.claudeCalls()).toHaveLength(1);
  } finally {
    await page?.close();
    await proxy?.close();
    await controller?.close();
    writeFileSync(release, "finish naturally");
    await h.engine.settled();
    await h.cleanup();
  }
});
