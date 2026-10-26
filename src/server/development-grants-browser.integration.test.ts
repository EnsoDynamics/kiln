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
  it("explicitly saves/reuses separate API/web targets without granting the documents-only product repository, requires selection after branch edits, then grants another branch without an environment", async () => {
    h = await createHarness({ sessions: [{ actions: [] }], files: { "customer-returns-prd.md": "# PRD: Customer returns\n\n## Acceptance Criteria\n- [ ] **AC-RET-01 — Deliver API/web.** Verify development.\n", "technical-design.md": "# Technical Design\n\nAPI/web are separate from the documents-only product repository.\n", "phase-1-deliver.md": "# Phase 1: Deliver\n\n**Repositories:** returns-api, returns-web\n\n## Acceptance criteria covered\nAC-RET-01\n" } });
    const named = ["returns-api", "returns-web"].map(name => { const origin = createGithubOrigin(h!.sandbox, "acme", name); const mainCheckoutPath = createRepository(h!.sandbox, name, origin.url); git(h!.sandbox, mainCheckoutPath, "push", "origin", "develop"); git(h!.sandbox, mainCheckoutPath, "push", "origin", "develop:preview"); return { name, mainCheckoutPath, github: `acme/${name}` }; });
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    h.engine.close();
    engine = new Engine({ paths: h.engine.paths, record: h.engine.record, stateDirectory: h.stateDirectory, tools: h.tools, env: h.env, prdTree: git(h.sandbox, h.repository, "rev-parse", `HEAD:${h.engine.paths.prdDirectoryFromRoot}`).trim(), namedRepositories: named, originRetryMs: 0, sleepReader: { next: () => Promise.resolve([]) } });
    await engine.agents.refresh();
    const plan = readPlanAt(h.repository, engine.paths.prdDirectoryFromRoot); if (!plan.ok) throw new Error(plan.problem);
    const documents = documentsFound(join(h.repository, engine.paths.prdDirectoryFromRoot), "customer-returns", plan.plan, { designFile: "technical-design.md", phaseDocCount: 1, repositories: named }, "acme-shop");
    for (let port = 41800; port < 41850; port++) if (await isPortFree(port)) { server = await startLocalServer({ engine, documents, port, folderName: "customer-returns", featureName: "Customer returns", token: engine.record.token }); break; }
    if (!server) throw new Error("No browser proof port");
    chrome = await launchChrome(); let page = await chrome.open(server.address);
    await page.waitFor(`document.body.innerText.includes('Allow early merges')`);
    expect(await page.evaluate(`document.querySelector('.delivery input[type=text]') === null && !document.querySelector('.delivery').innerText.includes('non-production')`)).toBe(true);
    await page.evaluate(clickLabel("Allow early merges"));
    await page.waitFor(`document.querySelectorAll('.merge-target input').length === 3`);
    for (const name of ["returns-api", "returns-web"]) {
      await page.evaluate(`(() => { const input=document.querySelector('#base-${name}'); input.value='develop'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      await page.waitFor(`[...document.querySelectorAll('.merge-target label')].some(e => e.textContent.trim() === 'Allow merging into ${name} / develop')`);
    }
    const labels = await page.evaluate<string[]>(`[...document.querySelectorAll('.merge-target label')].map(e => e.textContent.trim())`);
    expect(labels, JSON.stringify(labels)).toContain("Allow merging into returns-api / develop");
    for (const name of ["returns-api", "returns-web"]) {
      await page.evaluate(clickLabel(`Allow merging into ${name} / develop`));
      await waitFor(() => engine!.record.settings.developmentDeployments!.targets.some(one => one.target.repository.endsWith(name)));
      await page.waitFor(`[...document.querySelectorAll('.merge-target input')].every(e => !e.disabled)`);
    }
    expect(engine.record.settings.developmentDeployments!.targets).toEqual(["returns-api", "returns-web"].map(name => ({ target: { repository: `github.com/acme/${name}`, baseBranch: "develop" } })));
    // A configured base edit cannot carry approval onto the new branch.
    await page.evaluate(`(() => { const input=document.querySelector('#base-returns-api'); input.value='preview'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await page.waitFor(`document.querySelector('#base-returns-api').value === 'preview' && [...document.querySelectorAll('label')].some(e => e.textContent.trim() === 'Allow merging into returns-api / preview')`);
    expect(await page.evaluate(`[...document.querySelectorAll('label')].find(e => e.textContent.trim() === 'Allow merging into returns-api / preview').querySelector('input').checked`)).toBe(false);
    expect((await engine.start({ refinementConfirmed: true })).ok).toBe(false);
    expect(engine.record.startedAt).toBeUndefined();
    await page.evaluate(clickLabel("Allow merging into returns-api / preview"));
    await waitFor(() => engine!.record.settings.developmentDeployments!.targets.some(one => one.target.baseBranch === "preview"));
    await page.waitFor(`[...document.querySelectorAll('.merge-target input')].every(e => !e.disabled)`);
    await page.evaluate(clickLabel("Save these targets with this requirements repository"));
    await waitFor(() => engine!.savedDevelopmentTargets?.revision === 1);
    const targets = structuredClone(engine.savedDevelopmentTargets!.targets);
    expect(targets).toEqual([{ repository: "github.com/acme/returns-web", baseBranch: "develop" }, { repository: "github.com/acme/returns-api", baseBranch: "preview" }]);
    await engine.changeSettings({ developmentDeployments: { enabled: false, targets: [] } });
    await page.close(); page = await chrome.open(server.address);
    await page.waitFor(`document.body.innerText.includes('Use these saved targets for this PRD')`);
    expect(engine.record.developmentAuthorization?.enabled).toBe(false);
    const savedDisclosure = await page.evaluate<string>(`document.querySelector('.delivery').innerText`);
    expect(savedDisclosure).toContain(`Saved-target storage group: github.com/acme/acme-shop · ${h.repository}`);
    expect(savedDisclosure).toContain("github.com/acme/returns-api · preview");
    await page.evaluate(clickLabel("Use these saved targets for this PRD"));
    await waitFor(() => engine!.record.settings.developmentDeployments?.targets.length === 2);
    await page.waitFor(`document.body.innerText.includes('Selected branches below were explicitly reused')`);
    await page.evaluate(`if (!document.querySelector('#refined').checked) document.querySelector('#refined').click()`);
    await page.waitFor(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start')?.disabled === false`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start').click()`);
    await engine.settled();
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for acme-shop"] button')`, 20_000);
    expect(engine.record.developmentAuthorization?.grants.map(one => one.target)).toEqual(targets);
    expect(await page.evaluate(`document.querySelector('article[aria-label="Early merges for returns-api"]').innerText`)).toContain("Authorized for this run");
    const calls = h.claudeCalls().length;
    await page.evaluate(`document.querySelector('article[aria-label="Early merges for acme-shop"] button').click()`);
    await waitFor(() => engine!.record.developmentAuthorization!.grants.length === 3);
    expect(engine.record.developmentAuthorization?.grants.at(-1)?.target).toEqual({ repository: "github.com/acme/acme-shop", baseBranch: "develop" });
    expect(h.claudeCalls()).toHaveLength(calls); expect(engine.record.phases["1"]?.stop).toBeDefined();
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for acme-shop"]').innerText.includes('Authorized for this run')`);
    expect(await page.evaluate(`document.querySelector('.delivery input[type=text]') === null && !document.querySelector('.delivery').innerText.includes('non-production')`)).toBe(true);
    const handoff = await page.evaluate<string>(`document.querySelector('.handoff details pre').textContent`);
    expect(handoff).toContain("replaces earlier blanket restrictions");
    expect(handoff).toContain("repository and baseBranch");
    expect(handoff).toContain("Never bypass protections");
    expect(page.problems).toEqual([]);
  });
});
