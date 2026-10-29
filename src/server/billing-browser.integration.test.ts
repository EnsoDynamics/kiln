// Real browser -> loopback token-protected API -> execution state; no model request until Start.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
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
  // AC-BILL-01/02/04/06: actual protected-server presentations, not renderer fixtures.
  it.each([
    { name: "direct API", env: { ANTHROPIC_API_KEY: "presentation-secret-canary" }, provider: "firstParty", title: "Anthropic API", choice: "Use API billing for this PRD", source: "ANTHROPIC_API_KEY", explanation: "Charged separately from Claude subscription usage. Anthropic billing settings apply." },
    { name: "named provider", env: { CLAUDE_CODE_USE_BEDROCK: "1" }, provider: "bedrock", title: "Amazon Bedrock", choice: "Use Amazon Bedrock billing for this PRD", source: "CLAUDE_CODE_USE_BEDROCK", explanation: "This provider may bill separately from your Claude subscription." },
    { name: "unnamed provider", env: { ANTHROPIC_BASE_URL: "https://gateway.example.test" }, provider: "firstParty", title: "Configured provider", choice: "Use the configured provider for this PRD", source: "ANTHROPIC_BASE_URL", explanation: "This provider may bill separately from your Claude subscription." },
  ])("identifies the $name, unticked choice and source remedy without dispatch", async example => {
    h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.307";
    Object.assign(h.env, example.env);
    const account = join(h.sandbox.root, "billing-presentation-account.json");
    writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: example.provider, email: "subscription@example.test" }));
    h.env.KILN_STANDIN_ACCOUNT = account;
    await h.engine.agents.refresh(); await h.engine.refreshBilling(); const page = await open();
    await page.waitFor(`${panel}.querySelector('input[type=checkbox]')`);
    expect(await page.evaluate(`${panel}.querySelector('.billing-title').textContent`)).toBe(example.title);
    expect(await page.evaluate(`${panel}.querySelector('label.choice').textContent.trim()`)).toBe(example.choice);
    expect(await page.evaluate(`${panel}.querySelector('input').checked`)).toBe(false);
    const text = await page.evaluate<string>(`${panel}.innerText`);
    expect(text).toContain(example.source); expect(text).toContain(example.explanation);
    expect(text).toContain("To use your subscription instead, change the detected source and recheck.");
    expect(text).toContain("For inherited environment overrides, restart Kiln from the corrected environment.");
    expect(text).toContain("Applies to this PRD execution, including restarts, while the billing context stays the same.");
    expect(text).toContain("API payer identity unavailable");
    expect(text).not.toContain("subscription@example.test"); expect(text).not.toContain("presentation-secret-canary");
    expect(h.engine.billing.view.canLaunch).toBe(false); expect(h.claudeCalls()).toHaveLength(0);
    await page.evaluate(`${recheck}.click()`); await page.waitFor(`!${recheck}.disabled`);
    expect(await page.evaluate(`${panel}.querySelector('input').checked`)).toBe(false);
    expect(h.claudeCalls()).toHaveLength(0); expect(page.problems).toEqual([]);
  });
  it("shows enabled overflow without usage meters, omits unknown/disabled notices, and records the attributed launch fact", async () => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Saved conversation." }] }] }); h.env.KILN_STANDIN_VERSION = "2.1.307";
    const usage = join(h.sandbox.root, "no-meters.jsonl"); h.env.KILN_STANDIN_USAGE = usage;
    const report = (enabled?: boolean) => writeFileSync(usage, JSON.stringify({ usage_report: { rate_limits: { limits: null, ...(enabled === undefined ? {} : { extra_usage: { is_enabled: enabled } }) } } }));
    report(true); await h.engine.agents.refresh(); await h.engine.refreshBilling(); const page = await open(360);
    await page.waitFor(`${panel}.innerText.includes('Paid usage is enabled')`);
    expect(await page.evaluate(`${panel}.querySelector('a[href="https://claude.ai/settings/usage"]') !== null`)).toBe(true);
    // AC-BILL-03: the full factual notice is amber, rather than an approval warning.
    expect(await page.evaluate(`${panel}.querySelector('.overflow').textContent`)).toContain("Paid usage is enabled in your Claude account. Your account's spending limits apply.");
    expect(await page.evaluate(`getComputedStyle(${panel}.querySelector('.overflow')).color`)).toBe("rgb(230, 180, 80)");
    expect(await page.evaluate(`${panel}.querySelectorAll('input,[role=meter]').length`)).toBe(0);
    expect(h.engine.billing.view.canLaunch).toBe(true); expect(h.engine.billing.view.next?.overflow?.enabled).toBe(true);
    writeFileSync("/tmp/kiln-billing-no-meters-360.png", await page.screenshot());
    for (const enabled of [false, undefined]) {
      report(enabled); await h.engine.agents.refresh(); await h.engine.refreshBilling();
      await page.waitFor(`!${panel}.innerText.includes('Paid usage is enabled')`);
      expect(h.engine.billing.view.canLaunch).toBe(true);
      expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    }
    report(true); await h.engine.agents.refresh(); await h.engine.refreshBilling();
    await waitFor(() => h!.engine.baseCheck === "ok");
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.latestSession("1")!.runs[0]!.billing).toMatchObject({ route: "subscription", approved: false, overflow: { enabled: true, observedAt: expect.any(String) } });
    expect(h.engine.record.billing!.approval).toBeUndefined();
  });

  it.each(["verify", "advance"] as const)("keeps both phase Resume controls unavailable before approval while %s remains independent", async mode => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Keep the unsent answer?" }] }] });
    h.env.KILN_STANDIN_VERSION = "2.1.307"; await h.engine.refreshBilling();
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    const original = h.engine.latestSession("1")!;
    h.env.ANTHROPIC_API_KEY = "manual-recovery-private-canary"; await h.engine.refreshBilling();
    h.engine.record.pause.requestedAt = new Date().toISOString(); // Existing pending pause is part of the displayed control token.
    const page = await open(mode === "verify" ? 360 : 1280);
    const button = (label: string) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
    const reply = button("Send reply & resume Phase 1"); const resume = button("Resume Phase 1 in Kiln"); const verify = button("Verify Phase 1 & advance");
    await page.waitFor(`document.querySelector('textarea')`);
    await page.evaluate(`(() => { const field = document.querySelector('textarea'); field.value = 'Preserve this unsent draft'; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.waitFor(`${reply}.disabled && ${resume}.disabled`);
    expect(await page.evaluate(`${verify}.disabled`)).toBe(false);
    await page.evaluate(`${reply}.click(); ${resume}.click()`); expect(h.claudeCalls()).toHaveLength(1);
    await page.evaluate(`${verify}.click()`); await page.waitFor(`document.body.textContent.includes('still unfinished')`);
    expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.engine.latestSession("1")!.sessionId).toBe(original.sessionId);
    expect(await page.evaluate(`document.querySelector('textarea').value`)).toBe("Preserve this unsent draft");
    writeFileSync(`/tmp/kiln-billing-resume-held-${mode === "verify" ? 360 : 1280}.png`, await page.screenshot());
    await page.evaluate(`${recheck}.click()`); await page.waitFor(`!${recheck}.disabled`);
    expect(await page.evaluate(`${resume}.disabled`)).toBe(true); expect(h.claudeCalls()).toHaveLength(1);
    await page.evaluate(clickChoice); await page.waitFor(`!${reply}.disabled && !${resume}.disabled`);
    expect(h.claudeCalls()).toHaveLength(1); // Approval itself never resumes or sends the draft.
    const phase = "docs/prds/customer-returns/phase-1-return-intake.md"; const file = join(h.engine.worktreePath, phase);
    writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-26\n"));
    git(h.sandbox, h.engine.worktreePath, "add", phase); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish billing recovery phase");
    git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
    if (mode === "advance") {
      await page.evaluate(`${resume}.click()`); await page.waitFor(`document.body.textContent.includes('Phase 1 is already complete.')`);
      expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
    }
    await page.evaluate(clickChoice); await page.waitFor(`!${panel}.querySelector('input').checked`);
    expect(h.engine.billing.view.canLaunch).toBe(false);
    const accept = mode === "verify" ? verify : button("Advance without sending reply");
    expect(await page.evaluate(`${accept}.disabled`)).toBe(false); await page.evaluate(`${accept}.click()`);
    await waitFor(() => !!h!.engine.record.phases["1"]!.doneAt).catch(async error => { throw new Error(`${error.message}: ${await page.evaluate("document.body.innerText")}`); }); await h.engine.settled();
    expect(h.engine.record.phases["1"]!.finishedByPerson).toBe(true); expect(h.engine.record.pause.activeSince).toBeDefined();
    expect(h.engine.record.billing!.approval).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  });
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
    expect(await page.evaluate(`${panel}.innerText`)).toContain("Billing follows your Claude account settings.");
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
    // Each page observes its own SSE disconnect; the narrow page cannot synchronize the wide page.
    await page.waitFor(`${panel}.innerText.includes('last known')`);
    expect(await page.evaluate(`document.querySelector('#refined').disabled`)).toBe(true);
  });
  it("keeps unavailable optional billing neutral and recheck separate from approval, with bounded API validation", async () => {
    h = await createHarness({ sessions: [] }); await h.engine.refreshBilling(); const page = await open();
    await page.waitFor(`${panel}.innerText.includes('Claude Code settings')`);
    expect(await page.evaluate(`${panel}.innerText`)).toContain("Billing follows your Claude Code settings.");
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
  it.each(["subscription", "settings"] as const)("labels active launch history on %s separately from a different next route and never offers approval during a running session", async route => {
    h = await createHarness({ sessions: [{ actions: [{ waitForFile: "release-session" }, { result: "Stopped" }] }], engineOptions: { stopWaitMs: 50, killGraceMs: 50 } });
    if (route === "subscription") h.env.KILN_STANDIN_VERSION = "2.1.307";
    await h.engine.refreshBilling();
    const page = await open(); await waitFor(() => h!.engine.baseCheck === "ok"); expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await waitFor(() => h!.engine.current?.processRunning === true && h!.claudeCalls().length === 1);
    await page.waitFor(`${panel}.textContent.includes('Billing used to launch this session')`);
    const usage = join(h.sandbox.root, "next-overflow.jsonl");
    const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-1/usage-report-idle.jsonl", import.meta.url), "utf8");
    writeFileSync(usage, recorded.trim().split("\n").map(line => { const event = JSON.parse(line); if (event.usage_report?.rate_limits) event.usage_report.rate_limits.extra_usage = { is_enabled: true }; return JSON.stringify(event); }).join("\n"));
    h.env.KILN_STANDIN_USAGE = usage; h.env.KILN_STANDIN_VERSION = "2.1.307";
    await h.engine.agents.refresh(); await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('Billing for the next run') && ${panel}.textContent.includes('Paid usage is enabled')`);
    const historicalTitle = route === "subscription" ? "Claude subscription" : "Claude Code settings";
    expect(await page.evaluate(`${panel}.querySelector('.billing-title').textContent`)).toBe(historicalTitle);
    expect(h.engine.record.billing!.lastLaunch!.overflow?.enabled).toBe(route === "subscription" ? false : undefined);
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    const launchBeforeChange = structuredClone(h.engine.record.billing!.lastLaunch);
    h.env.ANTHROPIC_BASE_URL = "https://next-route.example.test"; await h.engine.refreshBilling();
    // AC-RUN-04: a new route applies to the next launch; it does not interrupt this process.
    expect(h.engine.current?.processRunning).toBe(true);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.billing!.lastLaunch).toEqual(launchBeforeChange);
    await page.waitFor(`${panel}.textContent.includes('Configured provider')`);
    const text = await page.evaluate<string>(`${panel}.innerText`);
    expect(text).toContain(historicalTitle); expect(text).toContain("Configured provider");
    if (route === "settings") expect(text).toContain("Billing follows your Claude Code settings.");
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
    writeFileSync("/tmp/kiln-billing-running-1280.png", await page.screenshot());
    await server!.close(); server = undefined; await page.waitFor(`${panel}.textContent.includes('Last known billing for this session')`);
    expect(await page.evaluate(`${panel}.querySelector('.billing-title').textContent`)).toBe(historicalTitle);
    expect(await page.evaluate(`${panel}.querySelectorAll('input,button').length`)).toBe(0);
    await h.engine.stop("sigint");
  });
  it("shows neutral account and organization-only subscription identity at desktop and narrow widths without treating inactive endpoints as overrides", async () => {
    h = await createHarness({ sessions: [] });
    const account = join(h.sandbox.root, "identity-account.json"); h.env.KILN_STANDIN_ACCOUNT = account;
    const writeAccount = (email?: string) => writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", orgId: "reliable-org", ...(email ? { email } : {}) }));
    writeAccount("neutral@example.test"); await h.engine.agents.refresh(); await h.engine.refreshBilling();
    const page = await open();
    for (const width of [1280, 360]) {
      const current = width === 1280 ? page : await chrome!.open(server!.address, { width });
      await current.waitFor(`${panel}.textContent.includes('neutral@example.test')`);
      expect(await current.evaluate(`${panel}.innerText`)).toContain("Claude Code settings");
      expect(await current.evaluate(`${panel}.innerText`)).toContain("Organization: reliable-org");
      expect(await current.evaluate(`${panel}.classList.contains('held')`)).toBe(false);
      writeFileSync(`/tmp/kiln-billing-neutral-identity-${width}.png`, await current.screenshot());
    }
    h.env.KILN_STANDIN_VERSION = "2.1.307";
    h.env.AWS_ENDPOINT_URL = "https://unrelated-aws.example.test"; h.env.ANTHROPIC_VERTEX_BASE_URL = "https://inactive.example.test";
    writeAccount(); await h.engine.agents.refresh(); await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('Claude subscription') && !${panel}.textContent.includes('neutral@example.test')`);
    expect(await page.evaluate(`${panel}.querySelector('.billing-title').nextElementSibling.textContent`)).toBe("Account identity unavailable");
    expect(await page.evaluate(`${panel}.innerText`)).toContain("Organization: reliable-org");
    expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull(); expect(h.engine.billing.view.canLaunch).toBe(true);
    for (const width of [1280, 360]) {
      const current = width === 1280 ? page : await chrome!.open(server!.address, { width });
      await current.waitFor(`${panel}.textContent.includes('Organization: reliable-org')`);
      expect(await current.evaluate(`${panel}.scrollWidth <= ${panel}.clientWidth`)).toBe(true);
      writeFileSync(`/tmp/kiln-billing-org-identity-${width}.png`, await current.screenshot());
    }
    // A direct override remains actionable, with no subscription identity substituted for its payer.
    h.env.ANTHROPIC_BASE_URL = "https://direct.example.test"; await h.engine.refreshBilling();
    await page.waitFor(`${panel}.textContent.includes('API payer identity unavailable')`);
    expect(await page.evaluate(`${panel}.innerText`)).not.toContain("reliable-org");
    expect(await page.evaluate(`${panel}.querySelector('input').checked`)).toBe(false);
    expect(h.engine.billing.view.canLaunch).toBe(false); expect(h.claudeCalls()).toHaveLength(0); expect(page.problems).toEqual([]);
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
