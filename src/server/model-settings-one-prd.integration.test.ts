// A change saved for this PRD only, through the Model defaults page's route against real Git and
// real settings files (Kiln Model Modes AC-SAVE-04, AC-SAVE-05; technical design "HTTP" and
// "Storage"): the PRD takes its choices from its own copy, which reaches no other PRD and not the
// defaults, adds nothing to the repository, is still there when Kiln starts again, and is forgotten
// by a reset; and the route's refusals, which only the page sees.

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { discardResetState } from "../engine/reset.js";
import type { Engine } from "../engine/engine.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { modelDefaultsPath, prdSettingsPath } from "../models/model-defaults.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let harness: Harness | undefined;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await harness?.cleanup(); harness = undefined; });

/** Reads the PRD's plan into the engine, as Documents found does before Start. */
async function withPlan(h: Harness, engine: Engine, folder: string): Promise<Engine> {
  const read = readPlanAt(h.repository, `docs/prds/${folder}`);
  if (!read.ok) throw new Error(read.problem);
  engine.record.plan = recordedPlan(read.plan);
  engine.modelChoicesChanged();
  await engine.refreshAgents();
  return engine;
}

async function opened() {
  const h = harness = await createHarness({ sessions: [], extraFolders: ["gift-cards"] });
  await withPlan(h, h.engine, "customer-returns");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  const address = server.address;
  const headers = { "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json", Origin: new URL(address).origin };
  const post = async (body: unknown) => { const response = await fetch(new URL("/api/model-defaults", address), { method: "POST", headers, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() as Record<string, unknown> }; };
  const get = async () => { const response = await fetch(new URL("/api/model-defaults", address), { headers }); return { status: response.status, body: await response.json() as Record<string, unknown> }; };
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
  return { h, post, get, json, defaults: modelDefaultsPath(h.env), own: prdSettingsPath(h.stateDirectory) };
}

describe("a change saved for this PRD only (AC-SAVE-04)", () => {
  it("gives the PRD its own copy, which reaches no other PRD, adds nothing to the repository, outlasts a restart of Kiln and is forgotten by a reset", async () => {
    const { h, post, get, json, defaults, own } = await opened();
    const status = () => git(h.sandbox, h.repository, "status", "--porcelain", "--untracked-files=all");
    const clean = status();
    const sonnet = { agentId: "claude_code", family: "sonnet", effort: "low" };
    expect((await post({ save: { target: "every_prd", changes: { rows: { standard: { first: sonnet } } } } })).status).toBe(200);
    expect(await get()).toMatchObject({ status: 200, body: { source: "defaults", prd: "Customer returns", holdsSettings: true } });

    // Saved for this PRD only: the copy starts from what Model defaults holds, with the change.
    const saved = await post({ save: { target: "this_prd", changes: { fallback: { use: "everything" } } } });
    expect(saved).toMatchObject({ status: 200, body: { source: "prd", prd: "Customer returns", fallback: { use: "everything", enabled: true, threshold: 95 }, rows: { standard: { first: { familyName: "Sonnet", set: true }, fallback: { set: false } } } } });
    expect(json(own)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "everything" } });
    expect(json(defaults)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } } });
    // Its activities that haven't started take their choices and fallbacks from the copy, at once.
    expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "codex", ownSettings: true });
    // The copy is kept outside every repository.
    expect(status()).toBe(clean);

    // A change saved later for every PRD from another PRD's page doesn't reach it; that PRD and the defaults get it.
    const other = await withPlan(h, await h.engineFor("gift-cards"), "gift-cards");
    const second = await startLocalServer({ engine: other, port: 0, folderName: "gift-cards", featureName: "Gift cards", token: other.record.token });
    try {
      expect(other.notStartedChoice("3")).toMatchObject({ agentId: "claude_code", model: "sonnet", from: "model_defaults" });
      const response = await fetch(new URL("/api/model-defaults", second.address), { method: "POST", headers: { "X-Kiln-Token": other.record.token, "Content-Type": "application/json", Origin: new URL(second.address).origin }, body: JSON.stringify({ save: { target: "every_prd", changes: { rows: { standard: { first: { ...sonnet, effort: "high" } } } } } }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ source: "defaults", prd: "Gift cards" });
      expect(other.notStartedChoice("3")).toMatchObject({ model: "sonnet", effort: "high", from: "model_defaults" });
      expect(other.settingsInForce.source).toBe("defaults");
    } finally { await second.close(); other.close(); }
    expect(json(own)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "everything" } });

    // Kiln stopped and started again: the PRD still has its own settings.
    const again = await withPlan(h, h.reopen(), "customer-returns");
    expect(again.settingsInForce.source).toBe("prd");
    expect(again.notStartedChoice("3")).toMatchObject({ agentId: "codex", ownSettings: true });

    // A reset of Kiln for the PRD forgets them with the rest of its state, and the PRD follows the defaults again (SAVE-007).
    discardResetState(h.stateDirectory);
    expect(existsSync(own)).toBe(false);
    again.modelChoicesChanged();
    expect(again.settingsInForce.source).toBe("defaults");
    expect(again.notStartedChoice("3")).toMatchObject({ agentId: "claude_code", model: "sonnet", effort: "high", from: "model_defaults" });
  });

  it("returns to the defaults with useDefaults, and refuses what the page can't save, changing nothing", async () => {
    const { h, post, get, json, defaults, own } = await opened();
    expect((await post({ save: { target: "this_prd", changes: { mode: "one_model", oneModel: { agentId: "claude_code", family: "sonnet", effort: "low" } } } })).body).toMatchObject({ source: "prd", mode: "one_model" });
    expect(h.engine.notStartedChoice("3")).toMatchObject({ model: "sonnet", effort: "low", from: "one_model" });
    const before = readFileSync(own, "utf8");

    // Malformed bodies, the bodies the page sent before it saved on Save among them: 400.
    for (const body of [{}, { set: { row: "standard", first: { agentId: "claude_code", family: "opus", effort: "low" } } }, { restore: true }, { fallback: { enabled: true } }, { save: { target: "all", changes: { restore: true } } }, { save: { target: "this_prd", changes: {} } }, { save: { target: "this_prd", changes: { mode: "fastest" } } }, { save: { target: "this_prd", changes: { rows: { tiny: { first: { agentId: "codex", family: "sol" } } } } } }, { save: { target: "this_prd", changes: { rows: { standard: {} } } } }, { save: { target: "this_prd", changes: { fallback: { use: "always" } } } }, { save: { target: "this_prd", changes: { fallback: { enabled: true } } } }, { useDefaults: false }, { save: { target: "this_prd", changes: { restore: true } }, useDefaults: true }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    // A choice or value Kiln won't save: 422 with the reason.
    expect(await post({ save: { target: "this_prd", changes: { fallback: { threshold: 0 } } } })).toEqual({ status: 422, body: { ok: false, reason: "The threshold is a whole-number percent from 1 to 100." } });
    expect(await post({ save: { target: "this_prd", changes: { rows: { standard: { fallback: { agentId: "claude_code", family: "opus", effort: "high" } } } } } })).toMatchObject({ status: 422, body: { reason: expect.stringContaining("would both be on Claude Code") } });
    // A save for every PRD from this PRD's page names the file that refused, and writes neither.
    writeFileSync(defaults, JSON.stringify({ schemaVersion: 2, rows: { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "opus", effort: "high" } } } }));
    expect(await post({ save: { target: "every_prd", changes: { rows: { standard: { first: { agentId: "claude_code", family: "opus", effort: "low" } } } } } })).toMatchObject({ status: 422, body: { reason: expect.stringMatching(/^Model defaults: The Standard row's first choice and fallback would both be on Claude Code\./) } });
    expect(readFileSync(own, "utf8")).toBe(before);

    // A second write that fails after Model defaults was written is a failed save naming the file not written; saving again finishes it.
    const conflicting = readFileSync(defaults, "utf8");
    writeFileSync(defaults, JSON.stringify({ schemaVersion: 2 }));
    const change = { save: { target: "every_prd", changes: { fallback: { use: "threshold", threshold: 80 } } } };
    chmodSync(h.stateDirectory, 0o500);
    try {
      expect(await post(change)).toMatchObject({ status: 500, body: { ok: false, reason: expect.stringMatching(new RegExp(`^Model defaults were saved, but this PRD's own settings at ${own.replace(/[.]/g, "\\.")} were not: .* Save again to finish\\.$`)) } });
    } finally { chmodSync(h.stateDirectory, 0o700); }
    expect(json(defaults)).toEqual({ schemaVersion: 2, fallback: { use: "threshold", threshold: 80 } });
    expect(readFileSync(own, "utf8")).toBe(before);
    expect((await post(change)).status).toBe(200);
    expect(json(own)).toMatchObject({ mode: "one_model", fallback: { use: "threshold", threshold: 80 } });
    writeFileSync(own, before); writeFileSync(defaults, conflicting);

    // Own settings that can't be read: the read and every save answer 409 with the file and whether Use my defaults here is allowed.
    writeFileSync(own, "{ broken");
    const unread = { source: "prd", path: own, canRestore: true, reason: expect.stringContaining("isn't valid JSON") };
    expect(await get()).toMatchObject({ status: 409, body: unread });
    expect(await post({ save: { target: "this_prd", changes: { restore: true } } })).toMatchObject({ status: 409, body: unread });
    expect(readFileSync(own, "utf8")).toBe("{ broken");
    // Use my defaults here removes them at once, and the PRD follows the defaults again.
    expect(await post({ useDefaults: true })).toMatchObject({ status: 200, body: { source: "defaults", mode: "recommended" } });
    expect(existsSync(own)).toBe(false);
    expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "codex", from: "model_defaults" });
    expect(json(defaults)).toMatchObject({ rows: { standard: { first: { agentId: "codex" } } } });

    // Over Model defaults that can't be read, useDefaults still removes the PRD's own settings, then answers with their error.
    writeFileSync(own, JSON.stringify({ schemaVersion: 2 }));
    writeFileSync(defaults, "{ broken");
    expect(await get()).toMatchObject({ status: 200, body: { source: "prd", holdsSettings: true } });
    expect(await post({ useDefaults: true })).toMatchObject({ status: 409, body: { source: "defaults", path: defaults, canRestore: true } });
    expect(existsSync(own)).toBe(false);
    // Creating own settings copies Model defaults, so it is refused while they can't be read.
    expect(await post({ save: { target: "this_prd", changes: { fallback: { use: "everything" } } } })).toMatchObject({ status: 409, body: { source: "defaults" } });
    expect(existsSync(own)).toBe(false);
  });
});
