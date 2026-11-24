// Full selection workflow: real engine, local API, persistent state, real browser and
// metadata pipes. The fixture protocol is paired with a recorded live metadata run.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { readPrdRecord } from "../state/records.js";
import { CODEX_CHOICE, runPrdOn, writeModelDefaults } from "../test-support/model-choices.js";
import { buildSnapshot } from "./snapshot.js";
import { Engine } from "./engine.js";
let h: Harness; let server: LocalServer | undefined; let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); chrome = undefined; await server?.close(); server = undefined; await h?.cleanup(); });
async function setup() {
  h = await createHarness({ sessions: [] }); const fixture = installCodexMetadataFixture(h.sandbox);
  const record = h.engine.record; const paths = h.engine.paths; h.engine.close();
  h.engine = new Engine({ paths, record, tools: { ...h.tools, codex: fixture.executable }, env: fixture.env, stateDirectory: h.stateDirectory });
  await h.engine.agents.refresh();
  return fixture;
}
describe("agent selection before work", () => {
  it("reloads Claude models after an account change without replacing an invalid saved choice", async () => {
    h = await createHarness({ sessions: [] });
    const modelsPath = join(h.sandbox.root, "account-models.json");
    const accountPath = join(h.sandbox.root, "new-account.json");
    const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8")) as { models: { value: string }[] };
    writeFileSync(modelsPath, JSON.stringify({ models: recorded.models.filter(m => m.value === "sonnet") }));
    writeFileSync(accountPath, JSON.stringify({ loggedIn: true, email: "new-account@example.com", subscriptionType: "team" }));
    h.env.KILN_STANDIN_MODELS = modelsPath; h.env.KILN_STANDIN_ACCOUNT = accountPath;
    await h.engine.claude!.refreshAccount();
    await waitFor(() => !h.engine.agents.state.pending && h.engine.agents.state.account?.email === "new-account@example.com");
    expect(h.engine.agents.state.models?.map(m => m.value)).toEqual(["sonnet"]);
    expect(h.engine.record.settings.modelChoices).toEqual({ phases: {} });
    expect(h.engine.selectionError).toMatch(/opus/i);
    expect(h.claudeCalls()).toEqual([]);
  });
  it("lets a person repair a retired model in the browser before the next conversation", async () => {
    const first = landingSession();
    h = await createHarness({ sessions: [{ actions: [{ sleepFor: 1000 }, ...first.actions] }, { actions: [{ result: "The repaired selection started this conversation." }] }] });
    const modelsPath = join(h.sandbox.root, "current-models.json");
    const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8")) as { models: { value: string }[] };
    writeFileSync(modelsPath, JSON.stringify(recorded));
    h.env.KILN_STANDIN_MODELS = modelsPath;
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await waitFor(() => h.claudeCalls().length === 1);
    writeFileSync(modelsPath, JSON.stringify({ models: recorded.models.filter(m => m.value !== "opus") }));
    await h.engine.settled();
    const stopped = buildSnapshot(h.engine);
    expect(stopped.needsYou).toMatchObject({ phaseId: "2b", kind: "selection", resumeOffered: false });
    expect(stopped.needsYou).not.toHaveProperty("sessionId");
    expect(h.claudeCalls()).toHaveLength(1);
    server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    chrome = await launchChrome(); const page = await chrome.open(server.address, { width: 360 });
    await page.waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Refresh agent information')`);
    const text = await page.evaluate<string>(`document.body.textContent`);
    expect(text).toContain("No new session has started");
    expect(text).toContain("claude auth login");
    expect(text).not.toContain("Fix the phase plan");
    expect(text).not.toContain("Pick it up yourself");
    // The stop names where to change the choice; the person changes the row's Model default
    // (Kiln Phase Model Tiers AC-PICK-06), which replaced the stop's own model editor.
    expect(text).toContain("Model defaults");
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "medium" } } });
    await waitFor(() => h.engine.notStartedChoice("2b").model === "sonnet");
    await page.evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh agent information')).click()`);
    await waitFor(() => !h.engine.agents.state.pending);
    // Refresh now includes the independent billing reading; wait for the real control to unlock.
    await page.waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Check again' && !b.disabled)`);
    await page.evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Check again')).click()`);
    await waitFor(() => h.claudeCalls().length === 2);
    await h.engine.settled();
    expect(h.claudeCalls()[1]!.args).toContain("sonnet");
    expect(h.engine.latestSession("2b")?.model).toBe("sonnet");
    expect(await page.evaluate<boolean>(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
    expect(page.problems).toEqual([]); await page.close();
  });
  // The PRD-wide agent, model and effort choice, its stale-editor refusals and the effort
  // notice are gone (Kiln Phase Model Tiers AC-KEEP-01, replacing Codex support AC-AGENT-01/02,
  // AC-MODEL-02/03); what remains is an invalid choice refusing Start and PRDs staying apart.
  it("refuses Start for a Codex choice the account doesn't offer, and keeps a second PRD independent", async () => {
    const fixture = await setup();
    await runPrdOn(h.engine);
    expect(h.engine.agents.state.agentId).toBe("codex");
    expect(h.engine.selectionError).toBeUndefined();
    // AC-AGENT-03 now permits integrated Codex work. Invalid choices still allocate no session.
    await runPrdOn(h.engine, { agentId: "codex", model: "retired-sol", effort: "low" });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409, reason: expect.stringContaining("retired-sol") });
    expect(h.engine.record.startedAt).toBeUndefined(); expect(h.claudeCalls()).toEqual([]);
    expect(readPrdRecord(h.stateDirectory)!.settings).not.toHaveProperty("model");
    const other = await h.engineFor("another-prd"); expect(other.agentOf("1")).toBe("claude_code"); expect(other.record.settings.modelChoices.kept).toBeUndefined(); other.close();
    expect(fixture.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
  });
  it("excludes late provider reads and preserves invalid saved settings through metadata failure", async () => {
    const fixture = await setup(); fixture.set({ delayMs: 150 });
    await runPrdOn(h.engine, CODEX_CHOICE, false); const oldRead = h.engine.agents.refresh();
    await runPrdOn(h.engine, { agentId: "claude_code", model: "opus", effort: "medium" }); await oldRead;
    expect(buildSnapshot(h.engine).account?.email).toBe("alex@acme-shop.dev");
    expect(buildSnapshot(h.engine).models?.some(m => m.value.startsWith("gpt"))).toBe(false);
    fixture.set({}); await runPrdOn(h.engine);
    await runPrdOn(h.engine, { agentId: "codex", model: "retired-sol", effort: "ultra" }); expect(h.engine.selectionError).toContain("retired-sol");
    fixture.set({ modelsError: true }); await h.engine.agents.refresh();
    expect(buildSnapshot(h.engine).models).toBeUndefined();
    expect(h.engine.record.settings.modelChoices.kept).toEqual({ agentId: "codex", model: "retired-sol", effort: "ultra" });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409 });
    expect(h.claudeCalls()).toEqual([]);
  });
  it("never carries former or contradictory account allowances into a new Codex reading", async () => {
    const fixture = await setup(); await runPrdOn(h.engine);
    expect(h.engine.agents.state.account?.limits[0]?.percent).toBe(82);
    fixture.set({ accountId: "new-account", email: "new-account@example.test", usageError: true }); await h.engine.agents.refresh();
    expect(h.engine.agents.state.account).toMatchObject({ email: "new-account@example.test", routingAccountId: "new-account", limits: [], limitsError: expect.stringContaining("unknown") });
    expect(h.engine.agents.state.account?.stale).toBeUndefined();
    expect(h.engine.selectionError).toBeUndefined(); // Missing usage alone never blocks metadata readiness.
    fixture.set({}); await h.engine.agents.refresh();
    fixture.set({ routingAccountId: "different-context" }); await h.engine.agents.refresh();
    expect(h.engine.agents.state.account).toMatchObject({ routingAccountId: "different-context", limits: [], limitsError: expect.stringContaining("changed") });
    expect(h.engine.agents.state.account?.accountId).toBeUndefined(); // Uncorroborated usage identity is not current authentication.
    expect(h.engine.agents.state.account?.stale).toBeUndefined();
    expect(h.engine.selectionError).toBeUndefined();
    expect(fixture.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
  });
  // The agent, model and effort chooser is gone (Kiln Phase Model Tiers AC-KEEP-01, replacing
  // Codex support AC-VIEW-01/04); the Codex account warnings it sat beside remain.
  it("renders Codex account warnings and a stale usage reading in a real browser", async () => {
    const fixture = await setup();
    await runPrdOn(h.engine);
    server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    chrome = await launchChrome(); const page = await chrome.open(server.address, { timeZone: "America/New_York" });
    await page.waitFor(`document.body.textContent.includes('fixture@example.test')`);
    const successfulAt = h.engine.agents.state.account!.limitsObservedAt!;
    const identityAt = h.engine.agents.state.account!.updatedAt;
    const successfulText = await page.evaluate<string>(`document.body.textContent`);
    expect(successfulText).toContain("fixture@example.test"); expect(successfulText).toContain("pro");
    expect(successfulText).toContain("codex · primary"); expect(successfulText).toContain("codex · secondary");
    expect(successfulText).toContain("Another allowance [other] · primary");
    expect(successfulText).toContain("4%"); expect(successfulText).toContain("Close to the limit. Sign in to another account before starting.");
    expect(await page.evaluate<string>(`document.querySelector('.account').textContent`)).toContain("10/26/2026, 3:33:20 AM");
    expect(await page.evaluate<string>(`document.body.textContent`)).toContain("82%");
    expect(await page.evaluate<string>(`document.body.textContent`)).toContain("Unknown");
    expect(await page.evaluate<string>(`document.body.textContent`)).toContain("codex login");
    expect(await page.evaluate<boolean>(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Start' && b.disabled)`)).toBe(true);
    expect(h.engine.record.startedAt).toBeUndefined();
    expect(h.claudeCalls()).toEqual([]);

    fixture.set({ usageError: true }); await h.engine.agents.refresh();
    await page.waitFor(`document.body.textContent.includes('Stale usage reading')`);
    expect(await page.evaluate<string>(`document.body.textContent`)).toContain("82%");
    expect(h.engine.agents.state.account!.limitsObservedAt).toBe(successfulAt);
    expect(Date.parse(h.engine.agents.state.account!.updatedAt)).toBeGreaterThan(Date.parse(identityAt));
    expect(h.engine.agents.state.account!.stale).toBeUndefined();
    const retainedTimestamp = await page.evaluate<string>(`new Date(${JSON.stringify(successfulAt)}).toLocaleString()`);
    expect(await page.evaluate<string>(`document.body.textContent`)).toContain(`Stale usage reading · last successful usage update ${retainedTimestamp}`);
    if (process.env.KILN_SCREENSHOTS) writeFileSync(`${process.env.KILN_SCREENSHOTS}/codex-agent-selection.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
    await page.close();
    const narrow = await chrome.open(server.address, { width: 360, timeZone: "America/New_York" });
    await narrow.waitFor(`document.body.textContent.includes('Stale usage reading')`);
    expect(await narrow.evaluate<boolean>(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
    if (process.env.KILN_SCREENSHOTS) writeFileSync(`${process.env.KILN_SCREENSHOTS}/codex-agent-selection-narrow.png`, await narrow.screenshot());
    expect(narrow.problems).toEqual([]); await narrow.close();
  });
});
