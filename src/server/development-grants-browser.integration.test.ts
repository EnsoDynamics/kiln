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
describe("current PRD targets and grant browser controls", () => {
  it("uses one checkbox for all listed branches, tracks base edits, and separately approves a repository added after Start", async () => {
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
    expect(await engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target: { repository: "github.com/acme/acme-shop", baseBranch: "develop" } }] } })).toMatchObject({ ok: true });
    await page.waitFor(`document.body.innerText.includes('keeps its earlier branch permissions')`);
    expect(await page.evaluate(`document.querySelectorAll('.merge-target').length`)).toBe(1);
    await page.evaluate(clickLabel("Allow early merges"));
    await waitFor(() => engine!.record.settings.developmentDeployments?.enabled === false);
    await page.waitFor(`document.querySelectorAll('.merge-target').length === 0`);
    await page.evaluate(clickLabel("Allow early merges"));
    await page.waitFor(`document.querySelectorAll('.merge-target h4').length === 3`);
    expect(await page.evaluate(`document.querySelectorAll('.delivery input[type=checkbox]').length`)).toBe(1);
    expect(await page.evaluate(`document.querySelectorAll('.merge-target input').length`)).toBe(0);
    for (const name of ["returns-api", "returns-web"]) {
      await page.evaluate(`(() => { const input=document.querySelector('#base-${name}'); input.value='develop'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      await page.waitFor(`[...document.querySelectorAll('.merge-target h4')].some(e => e.textContent.trim() === 'May merge into ${name} / develop')`);
    }
    await page.evaluate(`(() => { const input=document.querySelector('#base-returns-api'); input.value='preview'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await page.waitFor(`[...document.querySelectorAll('.merge-target h4')].some(e => e.textContent.trim() === 'May merge into returns-api / preview')`);
    expect(engine.record.settings.developmentDeployments).toEqual({ enabled: true, targets: [] });
    await page.evaluate(clickLabel("Allow early merges"));
    await waitFor(() => engine!.record.settings.developmentDeployments?.enabled === false);
    await page.waitFor(`document.querySelectorAll('.merge-target').length === 0`);
    await page.evaluate(clickLabel("Allow early merges"));
    await waitFor(() => engine!.record.settings.developmentDeployments?.enabled === true);
    await page.close(); page = await chrome.open(server.address);
    await page.waitFor(`document.body.innerText.includes('All repository branches listed below are covered')`);
    expect(engine.record.developmentAuthorization?.enabled).toBe(false);
    const disclosure = await page.evaluate<string>(`document.querySelector('.delivery').innerText`);
    expect(disclosure).not.toMatch(/Remember these|Use these saved|Choices are saved locally/);
    const targets = [{ repository: "github.com/acme/acme-shop", baseBranch: "develop" }, { repository: "github.com/acme/returns-api", baseBranch: "preview" }, { repository: "github.com/acme/returns-web", baseBranch: "develop" }];
    for (const retired of ["rememberForPrdRepository", "useSavedTargetsForThisPrd", "preferenceRevision"]) {
      const response = await fetch(new URL("/api/settings", server.address), { method: "POST", headers: { "Content-Type": "application/json", "X-Kiln-Token": engine.record.token, Origin: new URL(server.address).origin }, body: JSON.stringify({ developmentDeployments: { enabled: true, targets: engine.record.settings.developmentDeployments!.targets, [retired]: retired === "preferenceRevision" ? 1 : true } }) });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Unknown development-deployment setting");
    }
    // Compare actual rendered controls with Keep awake, so the original native-size/colour mismatch fails.
    expect(await page.evaluate(`[...document.querySelectorAll('.delivery input[type=checkbox]')].every(input => ['width', 'height', 'marginTop', 'marginLeft', 'accentColor'].every(property => getComputedStyle(input)[property] === getComputedStyle(document.querySelector('#awake'))[property]))`)).toBe(true);
    await page.evaluate(`if (!document.querySelector('#refined').checked) document.querySelector('#refined').click()`);
    await page.waitFor(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start')?.disabled === false`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Start').click()`);
    await engine.settled();
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for acme-shop"]').innerText.includes('Authorized for this run')`, 20_000);
    expect(engine.record.developmentAuthorization?.grants.map(one => one.target)).toEqual(targets);
    expect(engine.record.settings.developmentDeployments?.targets.map(one => one.target)).toEqual(targets);
    expect(await page.evaluate(`document.querySelectorAll('.merge-target button').length`)).toBe(0);
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-late");
    const checkout = createRepository(h.sandbox, "returns-late", origin.url);
    git(h.sandbox, checkout, "push", "origin", "develop");
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    expect(await engine.addRepository("returns-late")).toMatchObject({ ok: true, added: true });
    expect(engine.record.developmentAuthorization?.grants.map(one => one.target)).toEqual(targets);
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for returns-late"] button')`);
    const calls = h.claudeCalls().length;
    await page.evaluate(`document.querySelector('article[aria-label="Early merges for returns-late"] button').click()`);
    await waitFor(() => engine!.record.developmentAuthorization!.grants.length === 4);
    expect(engine.record.developmentAuthorization?.grants.at(-1)?.target).toEqual({ repository: "github.com/acme/returns-late", baseBranch: "develop" });
    expect(h.claudeCalls()).toHaveLength(calls); expect(engine.record.phases["1"]?.stop).toBeDefined();
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for returns-late"]').innerText.includes('Authorized for this run')`);
    expect(await page.evaluate(`document.querySelector('.delivery input[type=text]') === null && !document.querySelector('.delivery').innerText.includes('non-production')`)).toBe(true);
    const handoff = await page.evaluate<string>(`document.querySelector('.handoff details pre').textContent`);
    expect(handoff).toContain("replaces earlier blanket restrictions");
    expect(handoff).toContain("repository and baseBranch");
    expect(handoff).toContain("Never bypass protections");
    // Changed permissions retain fresh-session setup without adding a paste step to Resume.
    expect(await page.evaluate(`document.querySelector('.handoff details').parentElement.querySelectorAll('pre').length`)).toBe(2);
    expect(await page.evaluate(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Copy recovery prompt')`)).toBe(false);
    expect(page.problems).toEqual([]);
  });
});
