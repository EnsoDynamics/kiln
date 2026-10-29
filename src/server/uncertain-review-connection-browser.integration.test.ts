// AC-MSG-05: an actual lost browser transport cannot acknowledge or release uncertainty.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness, waitFor } from "../test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer } from "./local-server.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

it.skipIf(process.platform !== "darwin").each([1200, 390])("retains exact uncertain review and requires reconnect before hand-back at %i", async width => {
  const h = await createHarness({ sessions: [] });
  let server: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  let page: Awaited<ReturnType<HeadlessChrome["open"]>> | undefined;
  try {
    h.env.KILN_STANDIN_VERSION = "2.1.311"; mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { liveMessages: 1, uncorrelated: true, exitAfter: true }] }] }));
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready)); await waitFor(() => h.engine.liveView()?.input?.available === true);
    const target = h.engine.liveTarget()!; const text = "  inspect this uncertain instruction\nexactly  ";
    let port = 44970; while (!await isPortFree(port)) port++;
    const serve = () => startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    server = await serve();
    const response = await fetch(new URL("/api/live/message", server.address), { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: "disconnected-review", target, text }) });
    expect(response.status).toBe(202); await h.engine.commands.settled(); await h.engine.settled(); await h.engine.reconcileTakeover();
    const receipt = () => h.engine.commands.all().find(r => r.command_id === "disconnected-review")!;
    expect(receipt().message?.delivery).toBe("uncertain");
    page = await chrome.open(server.address, { width, height: 1100 });
    const button = (text: string) => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
    const review = button("I reviewed this message in the conversation");
    await page.waitFor(`${review}`);
    await server.close(); server = undefined;
    await page.waitFor(`document.body.innerText.includes('Disconnected from Kiln')`, 20000);
    const disconnected = await page.evaluate<string>("document.body.innerText");
    expect(disconnected).toContain("Last-known state, observed at");
    expect(disconnected).toContain("reconnect before acting or opening the conversation in your terminal");
    // The overview deliberately replaces recovery with dated reconnect guidance;
    // unavailable actions may be absent rather than rendered as disabled buttons.
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>/reviewed this message|Resume Phase 1|Verify Phase 1|Copy resume/.test(b.textContent)&&!b.disabled)`)).toBe(false);
    expect(receipt().message?.reviewedAt).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
    server = await serve(); await page.waitFor(`document.body.innerText.includes('Connected to Kiln')`, 20000);
    await page.waitFor(`!${review}.disabled`);
    expect(await page.evaluate(`document.querySelector('.messages pre').textContent`)).toBe(text);
    expect(receipt().message).toMatchObject({ text, delivery: "uncertain" }); expect(receipt().message?.reviewedAt).toBeUndefined();
    expect(await page.evaluate(`${button("Resume Phase 1 in Kiln")}.disabled`)).toBe(true);
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  } finally { await page?.close(); await server?.close(); await h.cleanup(); }
});
