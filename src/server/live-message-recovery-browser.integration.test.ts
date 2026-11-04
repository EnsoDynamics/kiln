// Real engine/restarted journal, local Git, authenticated HTTP and built Chrome.
// Saved late provider evidence is injected; this does not requalify the provider.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness, waitFor } from "../test-support/engine-harness.js";
import { sessionFiles } from "../session/claude-session.js";
import { appendJsonLine } from "../state/state-files.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { boundPort } from "../test-support/os-ports.js";
import { startLocalServer } from "./local-server.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
it.skipIf(process.platform !== "darwin").each([1200, 390])("retains exact uncertain text and required review after late evidence/restart at %i", async width => {
  const h = await createHarness({ sessions: [] });
  let server: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  let page: Awaited<ReturnType<HeadlessChrome["open"]>> | undefined;
  try {
    h.env.KILN_STANDIN_VERSION = "2.1.311"; mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { liveMessages: 1, uncorrelated: true, exitAfter: true }] }] }));
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready));
    await waitFor(() => h.engine.liveView()?.input?.available === true);
    const target = h.engine.liveTarget()!; const text = "  inspect the exact instruction\nwith trailing spaces  ";
    let port = 0;
    const serve = () => startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    server = await serve(); port = boundPort(server.address);
    const response = await fetch(new URL("/api/live/message", server.address), { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: "late-browser", target, text }) });
    expect(response.status, await response.text()).toBe(202);
    await h.engine.commands.settled(); await h.engine.settled();
    const message = h.engine.commands.all().find(r => r.command_id === "late-browser")!;
    expect(message.message?.delivery).toBe("uncertain");
    const at = new Date().toISOString();
    appendJsonLine(sessionFiles(h.stateDirectory, h.engine.latestSession("1")!).events, { at, event: { type: "result", session_id: target.providerSessionId, user_message_uuids: [message.message!.uuid] } });
    message.message!.resultAt = at; h.engine.commands.checkpoint(message);
    await server.close(); server = undefined;
    h.engine = h.reopenFromDisk(); await h.engine.prepare(); await h.engine.reconcileTakeover();
    server = await serve();
    page = await chrome.open(server.address, { width, height: 1100 });
    const button = (text: string) => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
    const review = button("I reviewed this message in the conversation");
    await page.waitFor(`${review}`);
    expect(await page.evaluate(`document.querySelector('.messages pre').textContent`)).toBe(text);
    const body = await page.evaluate<string>("document.body.innerText");
    expect(body).toContain("Delivery uncertain"); expect(body).toContain("View session output"); expect(body).not.toContain("Received by Claude");
    expect(await page.evaluate(`${button("Have Kiln resume Phase 1")}.disabled`)).toBe(true);
    expect(await page.evaluate(`${button("Check Phase 1 again")}.disabled`)).toBe(true);
    await page.evaluate(`${review}.click()`); await page.waitFor(`document.body.innerText.includes('Review acknowledged')`);
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
    await page.waitFor(`!${button("Check Phase 1 again")}.disabled`);
    await page.evaluate(`${button("Check Phase 1 again")}.click()`);
    await page.waitFor(`!${button("Check Phase 1 again")}.disabled`);
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    expect(h.engine.commands.all().find(r => r.command_id === "late-browser")?.message).toMatchObject({ text, delivery: "uncertain", reviewedAt: expect.any(String), resultAt: at });
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    expect(page.problems).toEqual([]);
  } finally { await page?.close(); await server?.close(); await h.cleanup(); }
});
