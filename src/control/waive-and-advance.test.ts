// Waivers AC-WAIVE-05/06/08 at the journal and command-line boundary: `waive-and-advance` input
// validation, admission refusals, advancing outcomes, receipts carrying the waiver and changes, and
// the CLI's argv handling. A stand-in controller host drives the real durable journal on disk.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandJournal, NO_CHECK_RUN, validateInstruction, validBy, type ControlHost, type ControlView, type Receipt } from "./commands.js";
import { exitFor } from "./result.js";
import { parseCommand } from "./help.js";
import { waiveInputs } from "./client.js";
import type { MarkCompleteOffer } from "../engine/waivers.js";

const RUN = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const OTHER_RUN = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const offered: MarkCompleteOffer = {
  offered: true, label: "Mark Phase 3 complete", heading: "Phase 3 is done, and Kiln’s check is wrong?", continueInOrder: false, checkRunId: RUN,
  items: [{ check: "Required development delivery verified", kind: "development_requirement", subject: "phase3-dev-fixes-4/dev-health-reports-merge", text: "/deployed_sha does not match its declared target/artifact.", against: "phase3-dev-fixes-4:eae98b13" }],
  failingChecks: 1, nextActivity: { kind: "phase", key: "4", title: "Reporting views" }, resultingLabel: "Complete · 1 check waived",
  sentence: ["Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to the next step. Phase 3 will show as “Complete · 1 check waived”."], noReport: false,
};

let base: string | undefined;
afterEach(() => { if (base) rmSync(base, { recursive: true, force: true }); base = undefined; });

type Answer = Awaited<ReturnType<ControlHost["apply"]>>;
/** A controller stand-in: one stop, its offer, and an apply the test settles. */
function harness(options: { offer?: MarkCompleteOffer; answer?: Answer | (() => Promise<Answer>); withOffer?: boolean } = {}) {
  base = mkdtempSync(join(tmpdir(), "kiln-waive-"));
  const directory = join(base, "state", "prd"); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const state = { offer: options.offer ?? offered, token: "exec-1:token-a", target: JSON.stringify({ execution: "exec-1", key: "3", stop: "2026-11-01T23:00:00Z" }), applied: [] as { action: string; inputs: Record<string, unknown> }[] };
  const controls = () => (["check-again", "verify-and-advance", "waive-and-advance", "reply"] as const).map(name => ({ name, available: name === "reply" ? false : name !== "waive-and-advance" || state.offer.offered, reason: name === "reply" ? "Resume isn’t offered here." : name === "waive-and-advance" && !state.offer.offered ? state.offer.reason : null }));
  const host: ControlHost = {
    execution: () => "exec-1",
    view: (): ControlView => ({ token: state.token, target: state.target, controls: controls() as ControlView["controls"] }),
    runState: () => "needs_you",
    apply: async (action, inputs) => {
      state.applied.push({ action, inputs });
      const answer = options.answer;
      return typeof answer === "function" ? answer() : answer ?? { ok: true, outcome: "marked_complete", waiver_id: "w-1" };
    },
    reconcile: () => undefined,
    changed: () => {},
    ...(options.withOffer === false ? {} : { markCompleteOffer: () => state.offer }),
  };
  const journal = new CommandJournal(directory, "/work/shop/docs/prds/orders", host);
  const instruction = (id: string, inputs: Record<string, unknown> = {}, action = "waive-and-advance") => ({ command_id: id, execution_id: "exec-1", status_token: state.token, action, inputs: action === "waive-and-advance" ? { check_run_id: RUN, via: "command_line", ...inputs } : inputs });
  const submit = async (id: string, inputs: Record<string, unknown> = {}, action = "waive-and-advance") => {
    const answer = journal.submit(instruction(id, inputs, action), "caller", true);
    await journal.settled();
    return { answer, receipt: journal.lookup(id).operation as Receipt & { action: string } };
  };
  return { journal, state, submit, instruction };
}

describe("waive-and-advance inputs", () => {
  const valid = { command_id: "w-1", execution_id: "e", status_token: "e:t", action: "waive-and-advance", inputs: { check_run_id: RUN, via: "command_line" } };
  it("accepts the check run, source, optional by and the verify-and-advance inputs, all part of the canonical input", () => {
    const parsed = validateInstruction({ ...valid, inputs: { ...valid.inputs, by: "grokbot", without_sending_reply: true, reviewed_receipt_ids: ["r-1"] } });
    expect(parsed.inputs).toEqual({ by: "grokbot", check_run_id: RUN, reviewed_receipt_ids: ["r-1"], via: "command_line", without_sending_reply: true });
    expect(validateInstruction({ ...valid, inputs: { ...valid.inputs, via: "browser" } }).inputs.via).toBe("browser");
  });
  it.each([
    ["no check run", { via: "command_line" }],
    ["a check run that is not a uuid", { check_run_id: "run-1", via: "command_line" }],
    ["no source", { check_run_id: RUN }],
    ["an unknown source", { check_run_id: RUN, via: "phone" }],
    ["a --by name over 64 characters", { check_run_id: RUN, via: "browser", by: "x".repeat(65) }],
    ["an empty --by name", { check_run_id: RUN, via: "browser", by: "" }],
    ["a --by name with a control character", { check_run_id: RUN, via: "browser", by: "bot\nname" }],
    ["a blank --by name", { check_run_id: RUN, via: "browser", by: "   " }],
    ["a non-boolean acknowledgement", { check_run_id: RUN, via: "browser", without_sending_reply: "yes" }],
    ["an input the action does not take", { check_run_id: RUN, via: "browser", reason: "it works" }],
  ])("refuses %s as invalid_input", (_, inputs) => {
    expect(() => validateInstruction({ ...valid, inputs })).toThrow(expect.objectContaining({ code: "invalid_input", exit: 2 }));
  });
  it("counts --by in characters, not bytes, and keeps it verbatim", () => {
    expect(validBy("é".repeat(64))).toBe(true);
    expect(validBy(" grok bot ")).toBe(true);
    expect(validBy("🤖".repeat(65))).toBe(false);
  });
});

describe("waive-and-advance in the journal", () => {
  it("records a marked_complete outcome as advanced, with the waiver it saved, and replays it for the same command id", async () => {
    const { submit, state, journal, instruction } = harness();
    const { answer, receipt } = await submit("grok-7c21", { by: "grokbot" });
    expect(answer.ok).toBe(true);
    expect(state.applied).toEqual([{ action: "waive-and-advance", inputs: { by: "grokbot", check_run_id: RUN, via: "command_line" } }]);
    expect(receipt).toMatchObject({ action: "waive-and-advance", state: "completed", outcome: "marked_complete", waiver_id: "w-1", effects: { plan: "advanced" } });
    const replay = journal.submit(instruction("grok-7c21", { by: "grokbot" }), "caller", true);
    expect((replay.operation as Receipt).id).toBe(receipt.id);
    expect(state.applied).toHaveLength(1);
    expect(() => journal.submit(instruction("grok-7c21", { by: "someone-else" }), "caller", true)).toThrow(/different inputs/);
  });

  it.each(["checks_passed", "continued"])("treats %s as advancing", async (outcome) => {
    const { submit } = harness({ answer: { ok: true, outcome } });
    expect((await submit("w")).receipt.effects.plan).toBe("advanced");
  });

  it("keeps a check_results_changed rerun unadvanced and lists each changed item on the receipt", async () => {
    const changes = [{ check: "Pushed", subject: "example-app", change: "newly_failing" as const, after: "4c1a9e0 isn't on origin yet" }];
    const { submit } = harness({ answer: { ok: true, outcome: "check_results_changed", changes } });
    const { receipt } = await submit("w");
    expect(receipt).toMatchObject({ state: "completed", outcome: "check_results_changed", changes, effects: { plan: "not_advanced" } });
    expect(receipt.waiver_id).toBeUndefined();
  });

  it("refuses where Mark complete is not offered, with the offer's reason, as a durable exit-3 receipt", async () => {
    const { submit, state } = harness({ offer: { offered: false, reason: "No check has run since Phase 3 stopped." } });
    const { answer, receipt } = await submit("early", { check_run_id: NO_CHECK_RUN });
    expect(answer.errors[0]).toMatchObject({ code: "mark_complete_not_offered", message: "No check has run since Phase 3 stopped." });
    expect(exitFor(answer)).toBe(3);
    expect(receipt).toMatchObject({ state: "refused", outcome: "mark_complete_not_offered" });
    expect(state.applied).toEqual([]);
  });

  it("refuses a check run other than the offered one, and a stale status token, before acting", async () => {
    const { submit, state, journal, instruction } = harness();
    const stale = await submit("older-run", { check_run_id: OTHER_RUN });
    expect(stale.answer.errors[0]?.code).toBe("stale_check_run"); expect(exitFor(stale.answer)).toBe(3);
    const old = instruction("old-token"); state.token = "exec-1:token-b";
    expect(journal.submit(old, "caller", true).errors[0]?.code).toBe("stale_status_token");
    expect(state.applied).toEqual([]);
  });

  it("is busy while another instruction, including a rerun in flight, owns control", async () => {
    let release!: (answer: Answer) => void;
    const { journal, instruction, state } = harness({ answer: () => new Promise<Answer>(resolve => { release = resolve; }) });
    const first = journal.submit(instruction("first"), "caller", true);
    expect(first.ok).toBe(true);
    for (const [id, action] of [["second-waiver", "waive-and-advance"], ["recheck", "check-again"], ["verify", "verify-and-advance"]] as const) {
      const refused = journal.submit(instruction(id, {}, action), "caller", true);
      expect(refused.errors[0]?.code, action).toBe("busy");
    }
    release({ ok: true, outcome: "marked_complete", waiver_id: "w-1" }); await journal.settled();
    expect(state.applied).toHaveLength(1);
  });

  it("reports a rerun that could not finish as check_unavailable (exit 4) on a retry, and as a successful read on command-status", async () => {
    const { submit, journal, instruction } = harness({ answer: { ok: false, code: "check_unavailable", reason: "The worktree is missing." } });
    const { receipt } = await submit("unavailable");
    expect(receipt).toMatchObject({ state: "failed", outcome: "check_unavailable", effects: { plan: "not_advanced" } });
    const retry = journal.submit(instruction("unavailable"), "caller", true);
    expect(retry.errors[0]?.code).toBe("check_unavailable"); expect(exitFor(retry)).toBe(4);
    expect(journal.lookup("unavailable").ok).toBe(true);
  });

  it("refuses Mark complete with a preserved unsent reply unless it is acknowledged", async () => {
    const { journal, state, instruction } = harness();
    // A reply kept unsent at this stop, as Resume at an already-complete phase leaves it.
    const reply = journal.submit({ command_id: "kept", execution_id: "exec-1", status_token: state.token, action: "reply", inputs: { message: "Keep going" } }, "caller", true);
    expect(reply.errors[0]?.code).toBe("control_unavailable");
    const saved = journal.all().find(r => r.command_id === "kept")!;
    Object.assign(saved, { state: "completed", outcome: "phase_already_complete", target: state.target });
    expect(journal.submit(instruction("no-ack"), "caller", true).errors[0]?.code).toBe("unsent_reply_acknowledgement_required");
    const acknowledged = journal.submit(instruction("ack", { without_sending_reply: true }), "caller", true);
    expect(acknowledged.ok).toBe(true); await journal.settled();
    expect(saved.acknowledged_by).toBe((journal.lookup("ack").operation as Receipt).id);
  });

  it("gives a failed recheck its stop's Mark complete preview, repeating the command with --confirm and the new token", async () => {
    const { submit, state, journal } = harness({ answer: { ok: true, outcome: "completion_checks_failed" } });
    state.offer = { offered: false, reason: "No check has run since Phase 3 stopped." };
    await submit("recheck", {}, "check-again");
    state.offer = offered; state.token = "exec-1:token-after-recheck";
    const read = journal.lookup("recheck");
    expect(read.mark_complete).toMatchObject({ offered: true, check_run_id: RUN, resulting_label: "Complete · 1 check waived", next_activity: { kind: "phase", key: "4" },
      next_argv: ["kiln", "waive-and-advance", "/work/shop/docs/prds/orders", "--confirm", "--only-if-status-matches", "exec-1:token-after-recheck", "--command-id", "<new-command-id>"] });
    state.target = JSON.stringify({ execution: "exec-1", key: "4", stop: null });
    expect(journal.lookup("recheck").mark_complete).toMatchObject({ offered: false, reason: expect.stringContaining("changed") });
  });

  it("refuses as mark_complete_not_offered when the controller offers no predicate and the control is unavailable", async () => {
    const { submit } = harness({ withOffer: false, offer: { offered: false, reason: "Nothing is waiting at Needs you." } });
    expect((await submit("no-offer")).answer.errors[0]).toMatchObject({ code: "mark_complete_not_offered", message: "Nothing is waiting at Needs you." });
  });
});

describe("kiln waive-and-advance argv", () => {
  const path = ["waive-and-advance", "/work/shop/docs/prds/orders"];
  const guard = ["--only-if-status-matches", "e:t", "--command-id", "id-1"];
  it("parses both forms with the bot-control safety flags", () => {
    expect(parseCommand([...path, ...guard]).flags).toMatchObject({ "only-if-status-matches": "e:t", "command-id": "id-1" });
    const confirmed = parseCommand([...path, "--confirm", "--by", "grokbot", "--without-sending-reply", "--message-reviewed", "r-1", "--message-reviewed", "r-2", ...guard, "--json"]);
    expect(confirmed.flags).toMatchObject({ confirm: true, by: "grokbot", "without-sending-reply": true, "message-reviewed": ["r-1", "r-2"], json: true });
    expect(waiveInputs(confirmed.flags)).toEqual({ confirm: true, by: "grokbot", without_sending_reply: true });
    expect(waiveInputs(parseCommand([...path, ...guard]).flags)).toEqual({ confirm: false });
  });
  it.each([
    ["no status token or command id", [...path]],
    ["--by without a value", [...path, "--confirm", "--by", ...guard]],
    ["a duplicate --confirm", [...path, "--confirm", "--confirm", ...guard]],
    ["a --reason flag", [...path, "--confirm", "--reason", "works", ...guard]],
  ])("refuses %s", (_, args) => {
    expect(() => parseCommand(args)).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });
  it("refuses --by without --confirm, and a --by name outside 1 to 64 printable characters", () => {
    expect(() => waiveInputs(parseCommand([...path, "--by", "grokbot", ...guard]).flags)).toThrow(expect.objectContaining({ code: "invalid_input", message: expect.stringContaining("--confirm") }));
    expect(() => waiveInputs(parseCommand([...path, "--confirm", "--by", "x".repeat(65), ...guard]).flags)).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });
});
