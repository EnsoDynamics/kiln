// Real browser -> loopback token-protected API -> execution state; no model request until Start.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFound } from "../engine/snapshot.js";
import { readPlanAt } from "../engine/plan-reading.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
let h: Harness | undefined; let chrome: HeadlessChrome | undefined; let server: LocalServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });
async function open(width = 1280) {
  const plan = readPlanAt(h!.repository, h!.engine.paths.prdDirectoryFromRoot); if (!plan.ok) throw new Error(plan.problem);
  const documents = documentsFound(join(h!.repository, h!.engine.paths.prdDirectoryFromRoot), "customer-returns", plan.plan, { designFile: "technical-design.md", phaseDocCount: 5, repositories: [] }, "acme-shop");
  for (let port = 41920; port < 41970; port++) if (await isPortFree(port)) { server = await startLocalServer({ engine: h!.engine, documents, port, folderName: "customer-returns", featureName: "Customer returns", token: h!.engine.record.token }); break; }
  if (!server) throw new Error("No local billing proof port");
  chrome = await launchChrome(); const page = await chrome.open(server.address, { width });
  await page.waitFor(`document.querySelector('[aria-label="Claude billing"]')`); return page;
}
const panel = `document.querySelector('[aria-label="Claude billing"]')`;
const clickChoice = `${panel}.querySelector('input[type=checkbox]').click()`;
const recheck = `[...${panel}.querySelectorAll('button')].find(b => b.textContent.includes('Recheck billing'))`;
describe("Claude billing browser controls", () => {
  it("shows subscription email, attributed overflow and existing usage; handles API choice, stale click, clear and disconnect", async () => {
    h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.307";
    const usage = join(h.sandbox.root, "usage.jsonl");
    const base = readFileSync(new URL("../../test/fixtures/proof-gate-1/usage-report-idle.jsonl", import.meta.url), "utf8");
    const lines = base.trim().split("\n").map(line => { const e = JSON.parse(line); if (e.usage_report?.rate_limits) e.usage_report.rate_limits.extra_usage = { is_enabled: true }; return JSON.stringify(e); });
    writeFileSync(usage, lines.join("\n")); h.env.KILN_STANDIN_USAGE = usage;
    await h.engine.agents.refresh(); await h.engine.refreshBilling();
    const page = await open(1280);
    await page.waitFor(`${panel}.innerText.includes('Claude subscription')`);
    expect(await page.evaluate(`${panel}.querySelector('.billing-title').nextElementSibling.textContent`)).toBe("alex@acme-shop.dev");
    expect(await page.evaluate(`${panel}.innerText`)).toContain("Paid usage is enabled in your Claude account.");
    expect(await page.evaluate(`${panel}.querySelectorAll('[role=meter]').length`)).toBe(0);
    expect(await page.evaluate(`document.body.innerText.includes('Fable')`)).toBe(true);
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    h.env.ANTHROPIC_API_KEY = "private-browser-canary"; await h.engine.refreshBilling();
    await page.waitFor(`${panel}.querySelector('input') && !${panel}.querySelector('input').checked`);
    expect(await page.evaluate(`${panel}.innerText`)).toContain("ANTHROPIC_API_KEY");
    // Change behind the displayed reading; the click must conflict, stay unticked and start nothing.
    h.env.ANTHROPIC_API_KEY = "replacement-browser-canary";
    await page.evaluate(clickChoice); await page.waitFor(`${panel}.innerText.includes('Billing changed')`);
    expect(h.engine.record.billing!.approval).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(0);
    await page.waitFor(`!${panel}.querySelector('input').checked`);
    await page.evaluate(clickChoice); await waitFor(() => !!h!.engine.record.billing!.approval);
    await page.waitFor(`${panel}.querySelector('input').checked`); expect(h.claudeCalls()).toHaveLength(0);
    await page.evaluate(clickChoice); await waitFor(() => !h!.engine.record.billing!.approval); await page.waitFor(`!${panel}.querySelector('input').checked`);
    expect(await page.evaluate(`document.body.innerText`)).not.toContain("private-browser-canary");
    // Resize via a second actual browser page to prove the narrow layout too.
    const narrow = await chrome!.open(server!.address, { width: 360 }); await narrow.waitFor(`${panel}.querySelector('input')`);
    expect(await narrow.evaluate(`${panel}.scrollWidth <= ${panel}.clientWidth`)).toBe(true);
    writeFileSync("/tmp/kiln-billing-api-360.png", await narrow.screenshot());
    writeFileSync("/tmp/kiln-billing-api-1280.png", await page.screenshot());
    await server!.close(); server = undefined;
    await narrow.waitFor(`${panel}.innerText.includes('last known')`);
    expect(await narrow.evaluate(`${panel}.querySelectorAll('input,button').length`)).toBe(0);
    expect(await page.evaluate(`document.querySelector('#refined').disabled`)).toBe(true);
  });
  it("keeps unavailable optional billing neutral and recheck separate from approval, with bounded API validation", async () => {
    h = await createHarness({ sessions: [] }); await h.engine.refreshBilling(); const page = await open();
    await page.waitFor(`${panel}.innerText.includes('Claude Code settings')`);
    expect(await page.evaluate(`${panel}.classList.contains('held')`)).toBe(false);
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    await page.evaluate(`${recheck}.click()`); await page.waitFor(`!${recheck}.disabled`); expect(h.claudeCalls()).toHaveLength(0);
    const origin = new URL(server!.address).origin;
    const post = (body: unknown, token = h!.engine.record.token) => fetch(`${origin}/api/billing/approval`, { method: "POST", headers: { "X-Kiln-Token": token, origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ approved: true }, "wrong")).status).toBe(403);
    expect((await post({ approved: true, extra: "x" })).status).toBe(400);
    expect((await post({ padding: "x".repeat(5000) })).status).toBe(400);
    expect(h.claudeCalls()).toHaveLength(0); expect(page.problems).toEqual([]);
    const release = join(h.sandbox.root, "release-billing-version"); h.env.KILN_STANDIN_VERSION_WAIT = release;
    const checking = h.engine.refreshBilling(); await page.waitFor(`${panel}.textContent.includes('Checking Claude settings…')`);
    writeFileSync(release, ""); await checking; delete h.env.KILN_STANDIN_VERSION_WAIT;
    const account = join(h.sandbox.root, "signed-out-account.json"); writeFileSync(account, JSON.stringify({ loggedIn: false })); h.env.KILN_STANDIN_ACCOUNT = account;
    await h.engine.agents.refresh(); await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('claude auth login')`);
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull(); expect(h.engine.billing.view.canLaunch).toBe(false);
    writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "alex@acme-shop.dev" }));
    // Real metadata transport failure: raw helper stderr must not enter snapshots or HTTP errors.
    const failureFile = join(h.sandbox.root, "private-helper-failure.json");
    writeFileSync(failureFile, JSON.stringify({ fail: "metadata-secret-canary" })); h.env.KILN_STANDIN_MODELS = failureFile;
    await h.engine.agents.refresh(); await h.engine.refreshBilling();
    const response = await fetch(`${origin}/api/snapshot`, { headers: { "X-Kiln-Token": h.engine.record.token } });
    const safe = await response.text();
    expect(safe).not.toContain("metadata-secret-canary"); expect(safe).toContain("Could not inspect enabled Claude Code skills"); expect(safe).toContain("Couldn’t load Claude Code’s models");
    expect(JSON.stringify(h.engine.record)).not.toContain("metadata-secret-canary");
    expect(h.claudeCalls()).toHaveLength(0);
  });
  it("labels active launch history separately from a different next route and never offers approval during a running session", async () => {
    h = await createHarness({ sessions: [{ actions: [{ waitForFile: "release-session" }, { result: "Stopped" }] }], engineOptions: { stopWaitMs: 50, killGraceMs: 50 } });
    h.env.KILN_STANDIN_VERSION = "2.1.307"; await h.engine.refreshBilling();
    const page = await open(); await waitFor(() => h!.engine.baseCheck === "ok"); expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await waitFor(() => h!.engine.current?.processRunning === true && h!.claudeCalls().length === 1);
    await page.waitFor(`${panel}.textContent.includes('Billing used to launch this session')`);
    const usage = join(h.sandbox.root, "next-overflow.jsonl");
    const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-1/usage-report-idle.jsonl", import.meta.url), "utf8");
    writeFileSync(usage, recorded.trim().split("\n").map(line => { const event = JSON.parse(line); if (event.usage_report?.rate_limits) event.usage_report.rate_limits.extra_usage = { is_enabled: true }; return JSON.stringify(event); }).join("\n"));
    h.env.KILN_STANDIN_USAGE = usage; await h.engine.agents.refresh(); await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('Billing for the next run') && ${panel}.textContent.includes('Paid usage is enabled')`);
    expect(h.engine.record.billing!.lastLaunch!.overflow?.enabled).toBe(false);
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    h.env.ANTHROPIC_BASE_URL = "https://next-route.example.test"; await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('Configured provider')`);
    const text = await page.evaluate<string>(`${panel}.innerText`);
    expect(text).toContain("Claude subscription"); expect(text).toContain("Configured provider");
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    writeFileSync("/tmp/kiln-billing-running-1280.png", await page.screenshot());
    await server!.close(); server = undefined; await page.waitFor(`${panel}.textContent.includes('Last known billing for this session')`);
    expect(await page.evaluate(`${panel}.querySelectorAll('input,button').length`)).toBe(0);
    await h.engine.stop("sigint");
  });
  it("renders a post-setup billing hold at Needs you, keeps local checks available and requires an explicit continuation after approval", async () => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Saved conversation." }] }] }); await h.engine.refreshBilling();
    const page = await open(360); await waitFor(() => h!.engine.baseCheck === "ok");
    const off = h.engine.onChange(() => { if (h!.engine.record.setupCompletedAt) h!.env.ANTHROPIC_API_KEY = "held-browser-canary"; });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled(); off();
    await page.waitFor(`document.body.textContent.includes('The next AI launch is held for review') && ${panel}.querySelector('input')`);
    expect(h.claudeCalls()).toHaveLength(0);
    expect(await page.evaluate(`document.body.textContent`)).not.toContain("Pick it up yourself");
    expect(await page.evaluate(`document.querySelector('main h1').getBoundingClientRect().top < ${panel}.getBoundingClientRect().top`)).toBe(true);
    expect(await page.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Check again' && !b.disabled)`)).toBe(true);
    writeFileSync("/tmp/kiln-billing-held-360.png", await page.screenshot());
    await page.evaluate(clickChoice); await waitFor(() => !!h!.engine.record.billing!.approval); await page.waitFor(`${panel}.querySelector('input').checked`);
    expect(h.claudeCalls()).toHaveLength(0);
    await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Check again').click()`);
    await waitFor(() => h!.claudeCalls().length === 1); await h.engine.settled();
    expect(h.engine.latestSession("1")!.runs[0]!.billing).toMatchObject({ route: "metered", approved: true });
  });

});
