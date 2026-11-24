// The usage fallback's launch decision (Kiln Phase Model Tiers AC-FALLBACK-02, technical design
// "The launch decision"): which windows count, when an account reads at or above the threshold,
// which limit is recorded, and when a launch goes to the fallback. Pure rules over readings.

import { describe, expect, it } from "vitest";
import type { AgentAccount } from "../agents/metadata.js";
import { countedFor, decideLaunch, readUsage, type DecisionChoice, type UsageSide } from "./launch-decision.js";

const FABLE: DecisionChoice = { agentId: "claude_code", model: "fable", modelName: "Fable 5.2", effort: "high" };
const ASTRA: DecisionChoice = { agentId: "codex", model: "gpt-6.2-astra", modelName: "GPT-6.2-Astra", effort: "high" };

type Window = Partial<AgentAccount["limits"][number]>;
const window = (label: string, percent: number | undefined, extra: Window = {}): AgentAccount["limits"][number] => ({ kind: label, label, shortLabel: label, nearLimit: false, ...(percent === undefined ? {} : { percent }), ...extra });
const claude = (limits: AgentAccount["limits"], extra: Partial<AgentAccount> = {}): AgentAccount => ({ agentId: "claude_code", email: "alex@acme-shop.dev", plan: "Max plan", startedAt: "2026-11-24T10:00:00Z", updatedAt: "2026-11-24T10:00:01Z", limits, ...extra });
const codex = (limits: AgentAccount["limits"], extra: Partial<AgentAccount> = {}): AgentAccount => ({ agentId: "codex", accountId: "acct", email: "alex@acme-shop.dev", plan: "pro", startedAt: "2026-11-24T10:00:00Z", updatedAt: "2026-11-24T10:00:01Z", codexUsage: { state: "allowed", reason: "allowed" }, limits, ...extra });
const side = (choice: DecisionChoice, account: AgentAccount | undefined, extra: Partial<UsageSide> = {}): UsageSide => ({ agentId: choice.agentId, model: choice.model, account, ...extra });
const decide = (first: AgentAccount | undefined, fallback: AgentAccount | undefined, extra: { fallbackProblem?: string; firstSide?: Partial<UsageSide>; fallbackSide?: Partial<UsageSide> } = {}) =>
  decideLaunch({ threshold: 95, first: FABLE, fallback: ASTRA, firstUsage: side(FABLE, first, extra.firstSide), fallbackUsage: side(ASTRA, fallback, extra.fallbackSide), fallbackProblem: extra.fallbackProblem });

describe("counted limits (AC-FALLBACK-02's definition)", () => {
  it("counts every window except one scoped to another model", () => {
    expect(countedFor(window("Weekly", 1), "claude-fable-5-2")).toBe(true);
    expect(countedFor(window("Weekly · Opus", 1, { scope: { by: "model", name: "Opus" } }), "claude-fable-5-2")).toBe(false);
    expect(countedFor(window("Weekly · Fable", 1, { scope: { by: "model", name: "Fable" } }), "claude-fable-5-2")).toBe(true);
    // A surface-scoped window isn't another model's.
    expect(countedFor(window("Weekly · Claude Code", 1, { scope: { by: "surface", name: "Claude Code" } }), "claude-fable-5-2")).toBe(true);
  });

  it("scopes a Codex bucket by its normalModelSlug, or its limitName against the listed models, never its limitId", () => {
    const models = [{ value: "gpt-6.2-astra", displayName: "GPT-6.2-Astra" }, { value: "gpt-6.2-sol", displayName: "GPT-6.2-Sol" }];
    expect(countedFor(window("sol", 1, { modelSlug: "gpt-6.2-sol" }), "gpt-6.2-astra", models)).toBe(false);
    expect(countedFor(window("astra", 1, { modelSlug: "GPT-6.2-Astra" }), "gpt-6.2-astra", models)).toBe(true);
    expect(countedFor(window("named", 1, { limitName: "gpt-6.2-sol" }), "gpt-6.2-astra", models)).toBe(false);
    expect(countedFor(window("named", 1, { limitName: "gpt-6.2-sol".toUpperCase() }), "gpt-6.2-sol", models)).toBe(true);
    // The legacy single bucket, a name matching no listed model, and a bare limitId all count.
    expect(countedFor(window("codex", 1, { id: "codex:primary", limitName: "codex" }), "gpt-6.2-astra", models)).toBe(true);
    expect(countedFor(window("other", 1, { limitName: "Another allowance" }), "gpt-6.2-astra", models)).toBe(true);
    expect(countedFor(window("gpt-6.2-sol", 1, { id: "gpt-6.2-sol:primary", kind: "gpt-6.2-sol:primary" }), "gpt-6.2-astra", models)).toBe(true);
  });
});

describe("the decision's table (AC-FALLBACK-02)", () => {
  const under = codex([window("codex · primary", 20)]);

  it("launches on the first choice while every counted limit reads below the threshold, or its usage can't be read", () => {
    expect(decide(claude([window("Weekly", 94.9), window("5-hour window", 10)]), under)).toEqual({ on: "first" });
    expect(decide(undefined, under)).toEqual({ on: "first" });
    expect(decide(claude([], { error: "Not signed in to Claude Code." }), under)).toEqual({ on: "first" });
    expect(decide(claude([], { limitsError: "Usage could not be bound." }), under)).toEqual({ on: "first" });
    // A reading kept from an earlier read never decides: a stale 97% stays on the first choice.
    expect(decide(claude([window("Weekly", 97)], { stale: true }), under)).toEqual({ on: "first" });
    expect(decide(claude([window("Weekly", 97)], { limitsStale: true }), under)).toEqual({ on: "first" });
    // A window scoped to another model doesn't count, however high it reads.
    expect(decide(claude([window("Weekly · Opus", 100, { scope: { by: "model", name: "Opus" } }), window("Weekly", 30)]), under)).toEqual({ on: "first" });
  });

  it("launches on the fallback when a counted limit reads at or above the threshold and the fallback can take it, recording the limit", () => {
    const result = decide(claude([window("5-hour window", 40), window("Weekly", 97)]), under);
    expect(result).toEqual({ on: "fallback", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, first: FABLE } });
    // Exactly at the threshold counts.
    expect(decide(claude([window("Weekly", 95)]), under).on).toBe("fallback");
  });

  it("records one limit: the highest percent, on a tie the one that resets latest (unknown latest), then the first", () => {
    const limit = (limits: AgentAccount["limits"]) => decide(claude(limits), under).fallback?.limit.label;
    expect(limit([window("A", 96), window("B", 99), window("C", 97)])).toBe("B");
    expect(limit([window("A", 97, { resetsAt: "2026-11-25T00:00:00Z" }), window("B", 97, { resetsAt: "2026-11-27T00:00:00Z" })])).toBe("B");
    expect(limit([window("A", 97, { resetsAt: "2026-11-27T00:00:00Z" }), window("B", 97)])).toBe("B");
    expect(limit([window("A", 97), window("B", 97)])).toBe("A");
  });

  it("stays on the first choice, saying why, when the fallback's own limit, its unreadable usage or a launch check stops it", () => {
    const over = claude([window("Weekly", 97)]);
    expect(decide(over, codex([window("codex · primary", 96)]))).toEqual({ on: "first", fallback: { used: false, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, reason: "Codex's codex · primary read 96%, at or above the 95% threshold." } });
    expect(decide(over, codex([], { limitsError: "Codex did not report usage windows. Allowance is unknown." })).fallback?.reason).toBe("Codex's usage couldn't be read.");
    // The fallback reads only when every counted window reads a percent.
    expect(decide(over, codex([window("codex · primary", 10), window("codex · secondary", undefined)])).fallback?.reason).toBe("Codex's usage couldn't be read.");
    expect(decide(over, codex([], { codexUsage: { state: "blocked", reason: "blocked" }, limits: [window("codex · primary", 10)] })).fallback?.reason).toBe("Codex: ordinary usage blocked.");
    expect(decide(over, codex([window("codex · primary", 10)], { codexUsage: { state: "blocked", administrative: true, reason: "Codex reports an administrative block." } })).fallback?.reason).toBe("Codex reports an administrative block.");
    expect(decide(over, under, { fallbackProblem: "Codex isn't signed in." })).toMatchObject({ on: "first", fallback: { used: false, reason: "Codex isn't signed in." } });
  });

  it("treats Codex's usage block as a limit at or above the threshold, never an administrative block, for the first choice", () => {
    const firstCodex = (account: AgentAccount) => decideLaunch({ threshold: 95, first: ASTRA, fallback: FABLE, firstUsage: side(ASTRA, account), fallbackUsage: side(FABLE, claude([window("Weekly", 10)])) });
    expect(firstCodex(codex([window("codex · primary", 10)], { codexUsage: { state: "blocked", reason: "blocked" } }))).toEqual({ on: "fallback", fallback: { used: true, limit: { agentId: "codex", label: "ordinary usage blocked" }, threshold: 95, first: ASTRA } });
    expect(firstCodex(codex([window("codex · primary", 10)], { codexUsage: { state: "blocked", administrative: true, reason: "admin" } }))).toEqual({ on: "first" });
    // A window without a percent can't be read, and only that window: another one decides.
    expect(firstCodex(codex([window("codex · primary", undefined), window("codex · secondary", 97)])).on).toBe("fallback");
    expect(firstCodex(codex([window("codex · primary", undefined)])).on).toBe("first");
  });

  it("counts a used-up automatic attempt in a wait as blocked for usage, in both tests", () => {
    const firstCodex = decideLaunch({ threshold: 95, first: ASTRA, fallback: FABLE, firstUsage: side(ASTRA, codex([window("codex · primary", 10)]), { attemptUsed: true }), fallbackUsage: side(FABLE, claude([window("Weekly", 10)])) });
    expect(firstCodex).toMatchObject({ on: "fallback", fallback: { limit: { agentId: "codex", label: "one automatic attempt used" } } });
    expect(firstCodex.fallback?.limit.percent).toBeUndefined();
    expect(decide(claude([window("Weekly", 97)]), codex([window("codex · primary", 10)]), { fallbackSide: { attemptUsed: true } }).fallback?.reason).toBe("Codex: one automatic attempt used.");
  });

  it("reads a Claude Code account with no plan as having no counted limit", () => {
    const { plan: _plan, email: _email, ...rest } = claude([], { limitsUnavailable: "Claude Code didn't report this plan's usage limits." });
    void _plan; void _email;
    const noPlan: AgentAccount = rest;
    expect(readUsage(side(FABLE, noPlan), 95, "fallback")).toEqual({ readable: true });
    const firstCodex = decideLaunch({ threshold: 95, first: ASTRA, fallback: FABLE, firstUsage: side(ASTRA, codex([window("codex · primary", 99)])), fallbackUsage: side(FABLE, noPlan) });
    expect(firstCodex.on).toBe("fallback");
    // A plan account's reading with no windows can't be read.
    expect(readUsage(side(FABLE, claude([], { limitsError: "Claude Code didn't report this plan's usage limits." })), 95, "first")).toEqual({ readable: false });
  });
});
