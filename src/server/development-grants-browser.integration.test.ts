/** Real browser -> authenticated API -> private files and real product/API/web Git workspaces. */
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../engine/engine.js";
import { documentsFound } from "../engine/snapshot.js";
import { readPlanAt } from "../engine/plan-reading.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { join } from "node:path";
let h: Harness | undefined; let engine: Engine | undefined; let chrome: HeadlessChrome | undefined; let server: LocalServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); engine?.close(); await h?.cleanup(); chrome = undefined; server = undefined; engine = undefined; h = undefined; });
const clickLabel = (text: string) => `[...document.querySelectorAll('label')].find(e => e.textContent.trim() === ${JSON.stringify(text)}).querySelector('input').click()`;
describe("remembered targets and grant browser controls", () => {
  it("explicitly saves/reuses separate API/web targets without granting the documents-only product repository, then grants a new exact environment", async () => {
    h = await createHarness({ sessions: [{ actions: [] }], files: { "customer-returns-prd.md": "# PRD: Customer returns\n\n## Acceptance Criteria\n- [ ] **AC-RET-01 — Deliver API/web.** Verify development.\n", "technical-design.md": "# Technical Design\n\nAPI/web are separate from the documents-only product repository.\n", "phase-1-deliver.md": "# Phase 1: Deliver\n\n**Repositories:** returns-api, returns-web\n\n## Acceptance criteria covered\nAC-RET-01\n" } });
    const named = ["returns-api", "returns-web"].map(name => { const origin = createGithubOrigin(h!.sandbox, "acme", name); const mainCheckoutPath = createRepository(h!.sandbox, name, origin.url); git(h!.sandbox, mainCheckoutPath, "push", "origin", "develop"); return { name, mainCheckoutPath, github: `acme/${name}` }; });
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    h.engine.close();
    engine = new Engine({ paths: h.engine.paths, record: h.engine.record, stateDirectory: h.stateDirectory, tools: h.tools, env: h.env, prdTree: git(h.sandbox, h.repository, "rev-parse", `HEAD:${h.engine.paths.prdDirectoryFromRoot}`).trim(), namedRepositories: named, originRetryMs: 0, sleepReader: { next: () => Promise.resolve([]) } });
    await engine.agents.refresh();
    const plan = readPlanAt(h.repository, engine.paths.prdDirectoryFromRoot); if (!plan.ok) throw new Error(plan.problem);
    const documents = documentsFound(join(h.repository, engine.paths.prdDirectoryFromRoot), "customer-returns", plan.plan, { designFile: "technical-design.md", phaseDocCount: 1, repositories: named }, "acme-shop");
    for (let port = 41800; port < 41850; port++) if (await isPortFree(port)) { server = await startLocalServer({ engine, documents, port, folderName: "customer-returns", featureName: "Customer returns", token: engine.record.token }); break; }
    if (!server) throw new Error("No browser proof port");
    chrome = await launchChrome(); let page = await chrome.open(server.address);
    await page.waitFor(`document.body.innerText.includes('Allow development deployments')`);
    await waitFor(() => engine!.baseCheck === 'ok');
    await page.waitFor(`document.querySelector('#base-returns-api')?.value === 'develop' && document.querySelector('#base-returns-web')?.value === 'develop'`);
    expect(engine.record.settings.developmentDeployments?.enabled).toBe(false);
    await page.evaluate(clickLabel("Allow development deployments"));
    await page.waitFor(`document.querySelectorAll('.delivery fieldset').length === 3 && [...document.querySelectorAll('.delivery fieldset')].every(e => !e.disabled)`);
    for (const name of ["returns-api", "returns-web"]) {
      await page.evaluate(`(() => { const row = [...document.querySelectorAll('.delivery fieldset')].find(e => e.querySelector('legend').textContent.startsWith('${name}')); row.querySelector('input[type=checkbox]').click(); })()`);
      await page.waitFor(`document.querySelector('input[aria-label="${name} development environment"]')`);
      await page.evaluate(`(() => { const input = document.querySelector('input[aria-label="${name} development environment"]'); input.value = '${name}-dev'; input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
      await page.waitFor(`document.querySelector('input[aria-label="${name} development environment"]').value === '${name}-dev' && !document.querySelector('input[aria-label="${name} development environment"]').matches(':disabled')`);
      await page.evaluate(`document.querySelector('input[aria-label="${name} development environment"]').closest('fieldset').querySelectorAll('input[type=checkbox]')[1].click()`);
      await waitFor(() => engine!.record.settings.developmentDeployments!.targets.some(one => one.target.environment === `${name}-dev`)).catch(async error => { throw new Error(`${name}: ${error.message}: ${JSON.stringify(engine!.record.settings.developmentDeployments)} ${await page.evaluate("document.body.innerText")}`); });
      await page.waitFor(`document.querySelector('input[aria-label="${name} development environment"]').closest('fieldset').querySelectorAll('input[type=checkbox]')[1].checked && !document.querySelector('input[aria-label="${name} development environment"]').closest('fieldset').disabled`);
    }
    await page.evaluate(clickLabel("Save these targets with this requirements repository"));
    await waitFor(() => engine!.savedDevelopmentTargets?.revision === 1).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(engine!.record.settings.developmentDeployments)} ${await page.evaluate("document.body.innerText")}`); });
    expect(engine.savedDevelopmentTargets?.targets.map(one => one.repository)).toEqual(["github.com/acme/returns-api", "github.com/acme/returns-web"]);
    // Simulate the same group's next unstarted PRD choices: saved preference alone grants nothing.
    await engine.changeSettings({ developmentDeployments: { enabled: false, targets: [] } });
    await page.close(); page = await chrome.open(server.address);
    await page.waitFor(`document.body.innerText.includes('Use these saved targets for this PRD')`);
    expect(engine.record.developmentAuthorization?.enabled).toBe(false);
    // A manually typed draft must not hide the exact saved environment being accepted.
    await page.evaluate(clickLabel("Allow development deployments"));
    await page.waitFor(`document.querySelectorAll('.delivery fieldset').length === 3 && [...document.querySelectorAll('.delivery fieldset')].every(e => !e.disabled)`);
    await page.evaluate(`(() => { const row=[...document.querySelectorAll('.delivery fieldset')].find(e => e.querySelector('legend').textContent.startsWith('returns-api')); row.querySelector('input[type=checkbox]').click(); })()`);
    await page.waitFor(`document.querySelector('input[aria-label="returns-api development environment"]')`);
    await page.evaluate(`(() => { const input=document.querySelector('input[aria-label="returns-api development environment"]'); input.value='different-manual-draft'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await page.evaluate(clickLabel("Use these saved targets for this PRD"));
    await waitFor(() => engine!.record.settings.developmentDeployments?.targets.length === 2);
    await page.waitFor(`document.body.innerText.includes('Selected targets below were explicitly reused') && document.querySelector('input[aria-label="returns-api development environment"]').value === 'returns-api-dev'`);
    await page.evaluate(`document.querySelector('#refined').click()`);
    await page.waitFor(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start')?.disabled === false`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start').click()`);
    await engine.settled(); await page.waitFor(`document.querySelector('input[aria-label="returns-api grant environment"]')`, 20_000);
    expect(engine.record.developmentAuthorization?.grants.map(one => one.target.repository)).toEqual(["github.com/acme/returns-api", "github.com/acme/returns-web"]);
    expect(engine.record.developmentAuthorization?.grants.some(one => one.target.repository.includes("acme-shop"))).toBe(false);
    const calls = h.claudeCalls().length;
    await page.evaluate(`(() => { const input=document.querySelector('input[aria-label="returns-api grant environment"]'); input.value='api-second-dev'; input.dispatchEvent(new Event('input',{bubbles:true})); input.closest('fieldset').querySelector('input[type=checkbox]').click(); })()`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Authorize returns-api development target').click()`);
    await waitFor(() => engine!.record.developmentAuthorization!.grants.length === 3);
    expect(h.claudeCalls()).toHaveLength(calls); expect(engine.record.phases["1"]?.stop).toBeDefined();
    expect(engine.savedDevelopmentTargets).toBeUndefined();
    await page.waitFor(`document.body.innerText.includes('Copy recovery prompt') && document.querySelector('.pick pre.prompt')?.textContent.includes('api-second-dev')`);
    const handoff = await page.evaluate<string>(`document.querySelector('.pick pre.prompt').textContent`);
    expect(handoff).toContain("replaces earlier blanket restrictions");
    expect(handoff).toContain("phase-1-deliver.md");
    expect(handoff).toContain("Never bypass protections");
    expect(page.problems).toEqual([]);
  });
});
