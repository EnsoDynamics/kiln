// The PRD's settings on Documents found against a real engine and repository: the model list
// and the effort it allows (AC-START-06, UI-011), the auto-mode message that holds Start, and
// the base check a connecting view runs (Worktree and Branch Setup).

import { afterEach, describe, expect, it } from "vitest";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import type { ModelEntry } from "../account/model-list.js";
import { readPrdRecord } from "../state/records.js";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const model = (overrides: Partial<ModelEntry>): ModelEntry => ({
  value: "opus",
  resolvedModel: "claude-opus-5-5",
  displayName: "Opus 5.5",
  description: "",
  supportsEffort: true,
  supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
  supportsAutoMode: true,
  ...overrides,
});

/** The model list as the engine sees it, arriving when the test says (Startup order). */
class ModelList implements ClaudeInfoSource {
  account = undefined;
  models: ModelEntry[] | undefined;
  modelListError: string | undefined;
  private readonly listeners = new Set<() => void>();
  arrive(models: ModelEntry[]) {
    this.models = models;
    for (const listener of this.listeners) listener();
  }
  refreshAccount() {
    return Promise.resolve();
  }
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

describe("the model and effort before Start", () => {
  it("moves a saved effort the model doesn't take to one it does, when the list loads and when the model changes", async () => {
    const list = new ModelList();
    harness = await createHarness({ sessions: [], engineOptions: { claude: list } });
    const { engine } = harness;
    await engine.changeSettings({ effort: "max" });
    // Until the list loads, all five levels are open and the saved model is named as saved.
    expect(buildSnapshot(engine).settings).toMatchObject({ model: { value: "opus", displayName: "opus" }, effortLevels: null, effort: "max" });

    list.arrive([model({ supportedEffortLevels: ["low", "medium", "high"] }), model({ value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1", supportedEffortLevels: ["high", "max"] })]);
    expect(buildSnapshot(engine).settings).toMatchObject({ model: { value: "opus", displayName: "Opus 5.5" }, effortLevels: ["low", "medium", "high"], effort: "high" });
    expect(readPrdRecord(harness.stateDirectory)?.settings.effort ?? engine.record.settings.effort).toBe("high");

    await engine.changeSettings({ model: "fable" });
    expect(buildSnapshot(engine).settings).toMatchObject({ effortLevels: ["high", "max"], effort: "high" });
    // An effort the chosen model doesn't take is refused.
    expect(await engine.changeSettings({ effort: "low" })).toMatchObject({ ok: false, status: 400 });
    expect(await engine.changeSettings({ effort: "max" })).toEqual({ ok: true });
  });

  it("passes no --effort for a model that takes none, and records the model's name from its ID", async () => {
    const list = new ModelList();
    harness = await createHarness({ sessions: [landingSession()], engineOptions: { claude: list } });
    const { engine } = harness;
    list.arrive([model({}), model({ value: "haiku", resolvedModel: "claude-haiku-5-5", displayName: "Haiku 5.5", supportsEffort: false, supportedEffortLevels: [] })]);
    await engine.changeSettings({ model: "haiku" });
    expect(buildSnapshot(engine).settings.effortLevels).toEqual([]);
    expect(await engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await engine.settled();
    const args = harness.claudeCalls()[0]!.args;
    expect(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2)).toEqual(["--model", "haiku"]);
    expect(args).not.toContain("--effort");
    const session = engine.latestSession("1")!;
    expect(session.effort).toBeUndefined();
    expect(session.modelDisplayName).toBe("Haiku 5.5");
  });

  it("holds Start with Model's message when the chosen model can't run in auto mode", async () => {
    const list = new ModelList();
    harness = await createHarness({ sessions: [landingSession()], engineOptions: { claude: list } });
    const { engine } = harness;
    list.arrive([model({}), model({ value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", supportsAutoMode: false })]);
    await engine.changeSettings({ model: "haiku" });
    const message = "Haiku 4.5 can’t run unattended on this account; it needs auto mode.";
    expect(buildSnapshot(engine).settings.fieldErrors).toEqual({ model: message });
    expect(await engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409, reason: message });
    expect(engine.record.startedAt).toBeUndefined();
    await engine.changeSettings({ model: "opus" });
    expect(await engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await engine.settled();
  });

  it("keeps the saved model with no message, and every level open, when the list doesn't offer it", async () => {
    const list = new ModelList();
    harness = await createHarness({ sessions: [], engineOptions: { claude: list } });
    list.arrive([model({ value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1" })]);
    const settings = buildSnapshot(harness.engine).settings;
    expect(settings).toMatchObject({ model: { value: "opus", displayName: "opus" }, effortLevels: null, fieldErrors: {} });
  });
});

describe("the base check when a view connects", () => {
  it("lists origin's branches as the base field's choices, develop then origin's default then the rest", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    git(h.sandbox, h.repository, "branch", "main");
    git(h.sandbox, h.repository, "branch", "release");
    git(h.sandbox, h.repository, "push", "-q", "origin", "main", "release");
    git(h.sandbox, h.origin, "symbolic-ref", "HEAD", "refs/heads/main");
    h.engine.checkBase();
    expect(buildSnapshot(h.engine).settings.baseCheck).toBe("checking");
    await waitFor(() => buildSnapshot(h.engine).settings.baseCheck !== "checking");
    expect(buildSnapshot(h.engine).settings).toMatchObject({ baseBranches: ["develop", "main", "release"], baseCheck: "ok", fieldErrors: {} });

    // A base the person picks that holds other PRD documents fails the check, naming the branch.
    await h.engine.changeSettings({ baseBranch: "release" });
    expect(buildSnapshot(h.engine).settings).toMatchObject({ baseCheck: "ok" });
    git(h.sandbox, h.repository, "checkout", "-q", "release");
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/assumptions.md");
    git(h.sandbox, h.repository, "commit", "-q", "-m", "drop assumptions");
    git(h.sandbox, h.repository, "push", "-q", "origin", "release");
    git(h.sandbox, h.repository, "checkout", "-q", "develop");
    h.engine.checkBase();
    await waitFor(() => buildSnapshot(h.engine).settings.baseCheck === "error");
    expect(buildSnapshot(h.engine).settings.fieldErrors.baseBranch).toBe("release on origin has different PRD documents from this checkout. Push them to release first; every session starts from there.");
  });

  it("chooses the default base once origin can be read, when the record was made without one", async () => {
    harness = await createHarness({ sessions: [] });
    const { engine } = harness;
    engine.record.settings.baseBranch = "";
    expect(buildSnapshot(engine).settings.baseBranch).toBe("");
    engine.checkBase();
    await waitFor(() => engine.baseCheck === "ok");
    expect(engine.record.settings.baseBranch).toBe("develop");
  });

  it("shows origin's error under the base field when it can't be reached", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    git(h.sandbox, h.repository, "remote", "set-url", "origin", `${h.sandbox.root}/missing.git`);
    h.engine.checkBase();
    await waitFor(() => h.engine.baseCheck === "error");
    const settings = buildSnapshot(h.engine).settings;
    expect(settings.fieldErrors.baseBranch).toMatch(/^Couldn’t reach origin: /);
    // The list holds only the current base setting.
    expect(settings.baseBranches).toEqual(["develop"]);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409 });
  });

  it("isn't run while Start's setup is running, and not at all once Start was pressed", async () => {
    harness = await createHarness({ sessions: [landingSession()] });
    const { engine } = harness;
    const started = engine.start({ refinementConfirmed: true });
    engine.checkBase();
    expect(await started).toEqual({ ok: true });
    await engine.settled();
    const runs = harness.kilnGitCalls().length;
    engine.checkBase();
    expect(engine.baseCheck).not.toBe("checking");
    expect(harness.kilnGitCalls()).toHaveLength(runs);
    expect(buildSnapshot(engine).settings.baseBranches).toBeUndefined();
  });
});

describe("a stop before the first phase", () => {
  it("says nothing was started during Start's base check, before anything is recorded", async () => {
    harness = await createHarness({ sessions: [] });
    const { engine } = harness;
    engine.settingUp = true;
    expect(await engine.stop("sigint")).toEqual({ text: "Kiln stopped.", grey: "Nothing was started." });
  });

  it("names the first phase to implement once Start is recorded and setup is under way", async () => {
    harness = await createHarness({ sessions: [] });
    const { engine } = harness;
    engine.record.startedAt = "2026-10-17T13:00:00Z";
    engine.record.plan = [
      { id: "1", title: "Return intake", file: "phase-1-return-intake.md", closed: true, repositories: [] },
      { id: "2b", title: "Store credit", file: "phase-2b-store-credit.md", closed: false, repositories: [] },
    ];
    expect(await engine.stop("sigint")).toEqual({ text: "Kiln stopped before phase 2b started.", grey: "kiln run picks it back up." });
  });
});
