// Each agent the run can use, on the screens (Kiln Phase Model Tiers AC-AGENTS-01 to 04, AC-PICK-07;
// mockups 1, 3 and 5): readiness, account and billing for each needed agent, Start held only by an
// agent an activity needs, the in-use account marked, and a stop that launches on the row's choice.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { BillingView } from "../../../src/billing/authority.js";
import type { AgentView, Snapshot } from "../../../src/engine/snapshot.js";
import { claudeAgent, documentsFoundSnapshot, needsYouMessageSnapshot, RUNNING_NOW, runningSnapshot, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { joinAnd, startState } from "../lib/documents-found.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import Running from "./Running.svelte";
import Waiting from "./Waiting.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const documentsFound = (snapshot: Snapshot) => strip(render(DocumentsFound, { props: { snapshot, config: { token: "t", base: "" }, connected: true, now: RUNNING_NOW } }).body);
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const waitingScreen = (snapshot: Snapshot) => strip(render(Waiting, { props: { snapshot, now: RUNNING_NOW } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);

const CLAUDE_BILLING: BillingView = {
  executionId: "e",
  pending: false,
  next: { agentId: "claude_code", route: "subscription", sources: [], email: "alex@acme-shop.dev", observedAt: "2026-10-17T13:15:00Z", diagnostics: [], approved: false, readingId: "r", canApprove: false, canClear: false },
  canLaunch: true,
};
const CODEX_BILLING: BillingView = {
  executionId: "e",
  pending: false,
  next: { agentId: "codex", route: "subscription", sources: [], email: "sam@acme-shop.dev", plan: "Pro", observedAt: "2026-10-17T13:15:00Z", diagnostics: [], approved: false, readingId: "", canApprove: false, canClear: false },
  canLaunch: true,
};

function codexAgent(change: Partial<AgentView> = {}): AgentView {
  return {
    agentId: "codex", agent: "Codex", installed: true, pending: false, neededBy: { activities: ["3"], fallbackOnly: false },
    account: { agentId: "codex", email: "sam@acme-shop.dev", plan: "Pro", startedAt: "2026-10-17T15:45:00Z", updatedAt: "2026-10-17T15:45:00Z", limitsObservedAt: "2026-10-17T15:45:00Z", limits: [{ kind: "weekly_all", label: "Weekly", shortLabel: "weekly", percent: 30, nearLimit: false }] },
    billing: CODEX_BILLING,
    ...change,
  };
}

/** Documents found with Claude Code and Codex both needed, each with its account and billing. */
function twoAgents(claude: Partial<AgentView> = {}, codex: Partial<AgentView> = {}): Snapshot {
  const snapshot = documentsFoundSnapshot();
  snapshot.agents = [claudeAgent(snapshot.agents[0]!.account, { billing: CLAUDE_BILLING, ...claude }), codexAgent(codex)];
  return snapshot;
}

describe("Documents found with two agents (AC-AGENTS-01, AC-AGENTS-02)", () => {
  it("shows each needed agent's account and billing summary, Claude's with its recheck and Codex's as a summary", () => {
    const page = documentsFound(twoAgents());
    const words = text(page);
    // Claude Code is in use, so its account is marked; Codex's account panel carries its own mark (AC-AGENTS-03).
    expect(words).toContain("Claude Code · in use now alex@acme-shop.dev · Max plan");
    expect(words).toContain("Codex sam@acme-shop.dev · Pro");
    expect(words).not.toContain("Codex · in use now");
    expect(words).toContain("Codex account sam@acme-shop.dev");
    expect(page).toContain('aria-label="Claude billing"');
    expect(page).toContain('aria-label="Codex billing"');
    expect(words).toContain("Billing follows your Claude account settings.");
    expect(words).toContain("Billing follows your ChatGPT account settings.");
    expect(words).toContain("Codex account");
  });

  it("holds Start with the reason when an agent an activity needs isn't ready", () => {
    const reason = "Codex isn't ready: Run codex login in a terminal. Needed by phase 3.";
    const snapshot = twoAgents({}, { readinessErrors: ["Run codex login in a terminal."] });
    snapshot.settings.models.problem = reason;
    expect(startState(snapshot, true, true)).toEqual({ enabled: false, note: reason });
    const page = documentsFound(snapshot);
    expect(text(page)).toContain(reason);
    expect(text(page)).toContain("Run codex login in a terminal.");
  });

  it("holds Start while any needed agent is still being read, and while Claude's billing can't launch for an activity", () => {
    expect(startState(twoAgents({}, { pending: true }), true, true)).toEqual({ enabled: false, note: "Checking Codex information…" });
    const held = twoAgents({ billing: { ...CLAUDE_BILLING, canLaunch: false, next: { ...CLAUDE_BILLING.next!, readinessError: "Approve API billing first." } } });
    // The reason names the agent, what to do and the activities that need it (AC-AGENTS-02 with AC-AGENTS-01's table).
    expect(startState(held, true, true)).toEqual({ enabled: false, note: `Claude Code isn't ready: Approve API billing first. Needed by ${joinAnd(held.agents[0]!.neededBy.activities)}.` });
    expect(held.agents[0]!.neededBy.activities.length).toBeGreaterThan(0);
    const unapproved = twoAgents({ billing: { ...CLAUDE_BILLING, canLaunch: false } });
    // With no billing message, an agent readiness problem is the reason, as Start's refusal gives it.
    const outdated = twoAgents({ billing: { ...CLAUDE_BILLING, canLaunch: false, next: { ...CLAUDE_BILLING.next!, readinessError: undefined } }, readinessErrors: ["Claude Code 2.0 is older than the 2.1 Kiln needs."] });
    expect(startState(outdated, true, true).note).toBe(`Claude Code isn't ready: Claude Code 2.0 is older than the 2.1 Kiln needs. Needed by ${joinAnd(outdated.agents[0]!.neededBy.activities)}.`);
    expect(startState(unapproved, true, true).note).toBe(`Claude Code isn't ready: its billing setup isn't approved. Review and approve it, or change its source and recheck. Needed by ${joinAnd(unapproved.agents[0]!.neededBy.activities)}.`);
  });

  it("marks a Claude Code limit at or above the fallback's threshold before Start (AC-AGENTS-03)", () => {
    const snapshot = twoAgents();
    const account = snapshot.agents[0]!.account!;
    snapshot.agents[0]!.account = { ...account, limits: account.limits.map((limit, index) => index === 0 ? { ...limit, overThreshold: true as const } : limit) };
    snapshot.settings.models.fallback = { enabled: true, threshold: 10 };
    expect(text(documentsFound(snapshot))).toMatch(/Used: 5-hour \d+% \(above your 10% threshold\)/);
    snapshot.settings.models.fallback = { enabled: false, threshold: 10 };
    expect(text(documentsFound(snapshot))).not.toContain("above your");
  });

  it("keeps Start available with the fallback's warning when only a fallback's agent isn't ready", () => {
    const snapshot = twoAgents({}, { neededBy: { activities: [], fallbackOnly: true }, readinessErrors: ["Codex isn't signed in."], billing: { ...CODEX_BILLING, canLaunch: false } });
    snapshot.settings.models.fallback = { enabled: true, threshold: 95, warning: { agent: "Codex", agentId: "codex", problem: "Codex isn't signed in.", remedy: "Fix it in a terminal, then press Refresh agent information." } };
    expect(startState(snapshot, true, true)).toEqual({ enabled: true });
    const words = text(documentsFound(snapshot));
    expect(words).toContain("The fallback’s agent, Codex, isn’t ready Codex isn't signed in. Fix it in a terminal, then press Refresh agent information. Until then, this run waits at a usage limit as if the fallback were off.");
  });

  it("keeps Start available when Claude Code, needed only by a fallback, has billing that can't launch", () => {
    const snapshot = twoAgents({ neededBy: { activities: [], fallbackOnly: true }, billing: { ...CLAUDE_BILLING, canLaunch: false } }, { inUse: true });
    expect(startState(snapshot, true, true)).toEqual({ enabled: true });
  });
});

describe("the account panel (AC-AGENTS-03)", () => {
  it("shows the in-use agent's account first, marked, then the other needed agent's", () => {
    const snapshot = runningSnapshot();
    snapshot.agents = [claudeAgent(snapshot.agents[0]!.account), codexAgent()];
    const words = text(running(snapshot));
    expect(words).toMatch(/Claude account · in use now alex@acme-shop\.dev[^]*Codex account sam@acme-shop\.dev/);
    expect(words).not.toContain("Codex account · in use now");
  });

  it("marks a limit above the fallback's threshold", () => {
    const snapshot = runningSnapshot();
    const account = snapshot.agents[0]!.account!;
    snapshot.agents = [claudeAgent(undefined, { account: { ...account, inUse: true, limits: [{ ...account.limits[1]!, percent: 97, overThreshold: true }] } }), codexAgent()];
    snapshot.settings.models.fallback = { enabled: true, threshold: 95 };
    expect(text(running(snapshot))).toContain("above your 95% threshold");
  });

  it("marks nothing with one agent, as today", () => {
    expect(text(running(runningSnapshot()))).not.toContain("in use now");
  });
});

describe("a stop on an activity that hasn't started (AC-AGENTS-04, AC-PICK-07)", () => {
  it("offers a fresh session on the row's current choice, Codex, and no reopen card, though the session ran on Claude Code", () => {
    const snapshot = needsYouMessageSnapshot();
    const stop = snapshot.needsYou!;
    stop.agent = "Claude Code";
    stop.agentId = "claude_code";
    stop.resumeOffered = false;
    delete stop.resumeCommand;
    stop.freshSessionCommand = "cd ~/devel/acme-shop-kiln/customer-returns\ncodex";
    snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6-astra", modelName: "GPT-6-Astra", effort: "high" } } } : row);
    snapshot.agents = [claudeAgent(snapshot.agents[0]!.account, { inUse: undefined }), codexAgent({ inUse: true, neededBy: { activities: ["2b"], fallbackOnly: false } })];
    const words = text(needsYou(snapshot));
    expect(words).toContain("Start a fresh Codex session in the worktree");
    expect(words).not.toContain("Open the same");
    expect(words).toContain("Last message from Claude Code");
  });

  it("says the reply goes to a new session on the current choice when the activity hasn't started (AC-PICK-07)", () => {
    const snapshot = needsYouMessageSnapshot();
    snapshot.needsYou!.resumeOffered = true;
    snapshot.needsYou!.newSession = true;
    snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6-astra", modelName: "GPT-6-Astra", effort: "high" } } } : row);
    snapshot.agents = [claudeAgent(snapshot.agents[0]!.account, { inUse: undefined }), codexAgent({ inUse: true, neededBy: { activities: ["2b"], fallbackOnly: false } })];
    const words = text(needsYou(snapshot));
    expect(words).toContain("Your reply goes to a new Codex session");
    expect(words).not.toContain("Your reply goes to the same");
  });

  it("labels the current card by the activity's own agent, Codex, while Claude Code is also listed (AC-AGENTS-04)", () => {
    const snapshot = runningSnapshot();
    snapshot.current = { ...snapshot.current!, agent: "Codex", agentId: "codex", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high" } };
    snapshot.agents = [claudeAgent(snapshot.agents[0]!.account, { inUse: undefined }), codexAgent({ inUse: true })];
    const words = text(running(snapshot));
    expect(words).toContain("Codex · GPT-6.2-Sol");
    expect(words).not.toMatch(/Claude Code · GPT/);
  });

  it("words a wait on an activity that hasn't started, moved to Codex, by Codex and a new session (AC-PICK-07, AC-AGENTS-04)", () => {
    const snapshot = waitingSnapshot();
    snapshot.waiting = { ...snapshot.waiting!, newSession: true, agent: "Claude Code", agentId: "claude_code" };
    snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high" } } } : row);
    snapshot.agents = [claudeAgent(snapshot.agents[0]!.account, { inUse: undefined }), codexAgent({ inUse: true, neededBy: { activities: ["2b"], fallbackOnly: false } })];
    const words = text(waitingScreen(snapshot));
    expect(words).toContain("Sign in to another Codex account");
    expect(words).toContain("starts a new Codex session");
    expect(words).toContain("when fresh provider permission allows an attempt");
    expect(words).not.toContain("picks up the same session");
  });
});
