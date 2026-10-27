// AC-RUN-07: the committed review galleries retain every required billing presentation.
import { afterEach, expect, it } from "vitest";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";

let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); chrome = undefined; });

it("keeps all Claude billing mockup states and their approval choices reachable", async () => {
  chrome = await launchChrome();
  const page = await chrome.open(new URL("../../docs/changes/kiln-billing-safeguards/mockups/kiln-billing-safeguards-mockups.html", import.meta.url).href);
  const states = [
    ["subscription", "Claude subscription"], ["overflow", "Claude subscription"],
    ["api", "Anthropic API"], ["provider", "Configured provider"], ["approved", "Anthropic API"],
    ["unknown", "Claude Code settings"], ["checking", "Checking Claude settings…"],
    ["changed", "Anthropic API"], ["running", "Claude subscription"],
    ["signedout", "Sign in to Claude Code"], ["running-api", "Anthropic API"], ["disconnected", "Anthropic API"],
  ] as const;
  for (const [state, title] of states) {
    await page.evaluate(`location.hash = ${JSON.stringify(state)}`);
    await page.waitFor(`document.body.dataset.state === ${JSON.stringify(state)}`);
    expect(await page.evaluate(`document.querySelector('.scenarios [data-state="${state}"]').getAttribute('aria-current')`)).toBe("true");
    expect(await page.evaluate(`document.querySelector('#billing-title').textContent`)).toBe(title);
    if (state === "api" || state === "provider") {
      expect(await page.evaluate(`document.querySelector('#approval').checked`)).toBe(false);
      expect(await page.evaluate(`document.querySelector('#approval-choice').hidden`)).toBe(false);
      expect(await page.evaluate(`document.querySelector('#approval-label').textContent`)).toBe(state === "api" ? "Use API billing for this PRD" : "Use the configured provider for this PRD");
    }
    if (state === "overflow") expect(await page.evaluate(`document.querySelector('#overflow').hidden`)).toBe(false);
    if (["subscription", "overflow", "unknown"].includes(state)) expect(await page.evaluate(`document.querySelector('#action').disabled`)).toBe(false);
    if (state === "disconnected") expect(await page.evaluate(`document.querySelector('#action').disabled && document.querySelector('#approval').disabled`)).toBe(true);
  }
  expect(page.problems).toEqual([]);
});

it("keeps all Codex billing mockup states without an API approval control", async () => {
  chrome = await launchChrome();
  const page = await chrome.open(new URL("../../docs/changes/kiln-billing-safeguards/mockups/kiln-codex-billing-mockups.html", import.meta.url).href);
  for (const state of ["ready", "credits", "api", "provider", "running", "disconnected"]) {
    await page.evaluate(`location.hash = ${JSON.stringify(state)}`);
    await page.waitFor(`document.body.dataset.state === ${JSON.stringify(state)}`);
    expect(await page.evaluate(`document.querySelector('.scenarios [data-state="${state}"]').getAttribute('aria-current')`)).toBe("true");
    expect(await page.evaluate(`document.querySelectorAll('#billing input[type=checkbox]').length`)).toBe(0);
    expect(await page.evaluate(`document.querySelector('#action').disabled`)).toBe(["api", "provider", "disconnected"].includes(state));
    if (state === "credits") expect(await page.evaluate(`document.querySelector('#credit-balance').textContent`)).toBe("Available workspace credits: 50");
    if (state === "disconnected") expect(await page.evaluate(`document.querySelector('#billing-label').textContent`)).toBe("Last known billing for this session");
  }
  expect(page.problems).toEqual([]);
});
