// Real server, engine, Git, metadata process pipes and Chrome; no paid inference.
import { writeFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { documentsFoundSnapshot, runningSnapshot } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { prdTreeAtHead } from "../engine/worktree-setup.js";
import { Engine } from "../engine/engine.js";
import { codexBillingSummary } from "../billing/codex.js";
let h: Harness; let chrome: HeadlessChrome | undefined; let server: LocalServer | undefined;
afterEach(async () => { await chrome?.close(); chrome = undefined; await server?.close(); server = undefined; await h?.cleanup(); });
const panel = `document.querySelector('[aria-label="Codex billing"]')`;
it("shows neutral optional credits, preserves all usage rows, rejects API/provider access, and switches agents without identity leaks", async () => {
  h = await createHarness({ sessions: [] }); const f = installCodexMetadataFixture(h.sandbox);
  const record = h.engine.record; const paths = h.engine.paths; h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths, record, tools: { ...h.tools, codex: f.executable }, env: f.env, stateDirectory: h.stateDirectory });
  await h.engine.changeSettings({ agentId: "codex" }); await h.engine.agents.refresh();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 41971, folderName: "customer-returns", featureName: "Customer returns", token: record.token });
  chrome = await launchChrome();
  for (const width of [360, 1280]) {
    const page = await chrome.open(server.address, { width });
    try {
      await page.waitFor(`${panel}?.innerText.includes('ChatGPT account')`);
      await page.evaluate(`document.querySelector('#refined').click()`);
      await page.waitFor(`!document.querySelector('button.start').disabled`);
      expect(await page.evaluate(`${panel}.querySelector('.billing-title').nextElementSibling.textContent`)).toBe("fixture@example.test");
      const text = await page.evaluate<string>(`${panel}.textContent`);
      expect(text).toContain("Billing follows your ChatGPT account settings."); expect(text).toContain("Plan: pro");
      expect(text).not.toMatch(/unlimited|disabled|warning|Available workspace credits/);
      expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
      expect(await page.evaluate(`${panel}.classList.contains('held')`)).toBe(false);
      expect(await page.evaluate(`${panel}.querySelector('a').href`)).toBe("https://chatgpt.com/codex/settings/usage");
      expect(await page.evaluate(`document.querySelector('button.start').disabled`)).toBe(false);
      const windows = h.engine.agents.state.account!.limits.map(row => row.label);
      for (const label of windows) expect(await page.evaluate(`document.body.innerText`)).toContain(label);
      const usage = { accountId: "fixture-account", ordinaryUsageAllowed: false, rateLimitsByLimitId: { a: { credits: { balance: "50", hasCredits: true, unlimited: true, privateField: "credit-secret-canary" }, primary: { usedPercent: 12, windowDurationMins: 1440 } }, b: { credits: { hasCredits: false, unlimited: false }, secondary: { usedPercent: 45 } } } };
      f.set({ usage }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}.innerText.includes('credits [a]: 50')`);
      expect(await page.evaluate(`${panel}.textContent`)).toContain("credits [b]: None reported");
      expect(await page.evaluate(`${panel}.textContent`)).not.toMatch(/unlimited|auto-reload|enabled/);
      expect(await page.evaluate(`${panel}.querySelectorAll('[role=meter],input').length`)).toBe(0);
      const safeResponse = await fetch(new URL("/api/snapshot", server.address), { headers: { "X-Kiln-Token": record.token } });
      expect(await safeResponse.text()).not.toContain("credit-secret-canary");
      expect(JSON.stringify(h.engine.record)).not.toContain("credit-secret-canary");
      expect(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
      writeFileSync(`/tmp/kiln-codex-billing-${width}.png`, await page.screenshot());
      f.set({ accounts: [{ account: { type: "chatgpt" } }] }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}.textContent.includes('Account identity unavailable') && ${panel}.textContent.includes('Plan unavailable')`);
      expect(await page.evaluate(`document.querySelector('button.start').disabled`)).toBe(false);
      f.set({ apiKey: true }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}.innerText.includes('codex login')`);
      expect(await page.evaluate(`document.querySelector('button.start').disabled`)).toBe(true);
      expect(await page.evaluate(`${panel}.querySelector('input')`)).toBeNull();
      f.set({ provider: "other" }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}.innerText.includes('OpenAI provider')`);
      expect(await page.evaluate(`document.querySelector('button.start').disabled`)).toBe(true);
      f.set({ configError: true }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}.textContent.includes('Could not inspect Codex provider and hooks')`);
      expect(await page.evaluate(`document.querySelector('button.start').disabled`)).toBe(true);
      const origin = new URL(server.address).origin;
      const denied = await fetch(`${origin}/api/billing/approval`, { method: "POST", headers: { "X-Kiln-Token": record.token, origin, "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) });
      expect(denied.status).toBe(400); expect(await denied.text()).toContain("Codex has no API billing approval");
      await h.engine.changeSettings({ agentId: "claude_code" }); await h.engine.agents.refresh(); await h.engine.refreshBilling();
      await page.waitFor(`document.querySelector('[aria-label="Claude billing"]')`);
      expect(await page.evaluate(`document.body.innerText`)).not.toContain("fixture@example.test");
      f.set({}); await h.engine.changeSettings({ agentId: "codex" }); await h.engine.agents.refresh();
      await page.waitFor(`${panel}?.innerText.includes('fixture@example.test')`);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); }
  }
  expect(f.calls().every(c => !/^(turn|thread)\//.test(c.method))).toBe(true); expect(h.claudeCalls()).toEqual([]);
});

it("keeps launched identity/credits separate from the next account and freezes them on disconnect", async () => {
  const snapshot = runningSnapshot(); snapshot.settings.agentId = "codex"; snapshot.settings.agent = "Codex";
  snapshot.settings.model = { value: "gpt-6.1-sol", displayName: "GPT-6.1-Sol" };
  for (const phase of snapshot.phases) if (phase.details) Object.assign(phase.details, { agentId: "codex", agent: "Codex", model: "GPT-6.1-Sol" });
  Object.assign(snapshot.current!, { agentId: "codex", agent: "Codex", model: "GPT-6.1-Sol", effort: "high" });
  const at = new Date().toISOString();
  snapshot.account = { agentId: "codex", startedAt: at, updatedAt: at, email: "next@example.test", accountId: "next-workspace", plan: "pro", limits: [
    { id: "codex:primary", kind: "codex:primary", label: "Daily inference · primary", shortLabel: "Daily inference · primary", durationMinutes: 1440, percent: 31, nearLimit: false },
    { id: "other:secondary", kind: "other:secondary", label: "Other allowance · secondary", shortLabel: "Other allowance · secondary", percent: 12, nearLimit: false },
  ] };
  const lastLaunch = codexBillingSummary({ startedAt: at, updatedAt: at, limits: [], email: "launch@example.test", plan: "business", accountId: "launch-workspace", credits: [{ scope: "workspace", bucketId: "codex", accountId: "launch-workspace", observedAt: at, balance: "50" }] });
  const next = { ...lastLaunch }; delete next.credits;
  snapshot.billing = { executionId: "fixture", selectionGeneration: 1, pending: false, canLaunch: true, lastLaunch, next: { ...next, email: "next@example.test", accountId: "next-workspace", readingId: "", canApprove: false, canClear: false } };
  chrome = await launchChrome();
  for (const width of [360, 1280]) {
    const fixture = await serveViewFixture({ port: 41972, folder: "customer-returns", snapshot });
    const page = await chrome.open(fixture.address, { width });
    try {
      await page.waitFor(`${panel}?.innerText.includes('launch@example.test')`);
      const text = await page.evaluate<string>(`${panel}.textContent`);
      for (const expected of ["Billing used to launch this session", "launch@example.test", "credits [codex]: 50", "Billing for the next run", "next@example.test"]) expect(text).toContain(expected);
      expect(await page.evaluate(`${panel}.querySelectorAll('input').length`)).toBe(0);
      const rendered = await page.evaluate<string>(`document.body.textContent`);
      expect(rendered).toContain("Daily inference · primary"); expect(rendered).toContain("Other allowance · secondary");
      expect(rendered).not.toMatch(/Fable|Opus/);
      writeFileSync(`/tmp/kiln-codex-billing-running-${width}.png`, await page.screenshot());
      const creditOnly = structuredClone(snapshot);
      creditOnly.billing!.next = { ...lastLaunch, credits: [{ ...lastLaunch.credits![0]!, balance: "75" }], readingId: "", canApprove: false, canClear: false };
      creditOnly.account!.email = "launch@example.test"; creditOnly.account!.accountId = "launch-workspace";
      fixture.send("snapshot", creditOnly);
      await page.waitFor(`${panel}.textContent.includes('credits [codex]: 75')`);
      expect(await page.evaluate(`${panel}.textContent`)).toContain("credits [codex]: 50");
      expect(await page.evaluate(`${panel}.textContent`)).toContain("Billing for the next run");
      fixture.send("snapshot", snapshot);
      await page.waitFor(`${panel}.textContent.includes('next@example.test') && !${panel}.textContent.includes('credits [codex]: 75')`);
      await page.evaluate(`document.fonts.ready.then(() => true)`);
      await fixture.close(); await page.waitFor(`${panel}.textContent.includes('Last known billing for this session')`);
      expect(await page.evaluate(`${panel}.textContent`)).toContain("Last known workspace credits [codex]: 50");
      writeFileSync(`/tmp/kiln-codex-billing-disconnected-${width}.png`, await page.screenshot());
      expect(await page.evaluate(`${panel}.querySelectorAll('button,input').length`)).toBe(0);
      expect(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    } finally { await page.close(); await fixture.close(); }
  }
});
