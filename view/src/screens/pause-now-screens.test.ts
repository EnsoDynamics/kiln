// Pause now's screens rendered to HTML (Kiln Pause Now AC-PAUSE-01 to 06; mockup
// docs/changes/kiln-pause-now/mockups/kiln-pause-now.html, frames 1, 2, 2b and 3): the pause
// panel's two choices and its pausing rows, Cancel, the Pausing and Paused headers, the phase
// plan row, the session page, and the paused page's card, columns and precedence.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { ALREADY_PAUSED, BACKGROUND_NOTE, LID_SENTENCE } from "../../../src/live/pause-now.js";
import { pausedHoldSnapshot, pausingSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import type { PhaseRecoveryPage } from "../lib/phase-recovery-page.js";
import { headerState } from "../lib/progress.js";
import PausedHold from "./PausedHold.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const page = (extra: Partial<PhaseRecoveryPage> = {}): PhaseRecoveryPage => ({ key: "2b", draft: "", choice: false, unsent: false, ...extra });
const running = (snapshot: Snapshot, connected = true) => strip(render(Running, { props: { snapshot, connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const detail = (snapshot: Snapshot, connected = true) => strip(render(PhaseDetail, { props: { snapshot, phaseId: "2b", connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const held = (snapshot: Snapshot, recovery = page()) => strip(render(PausedHold, { props: { snapshot, now: RUNNING_NOW, page: recovery } }).body);
/** The button whose words are exactly `label`, with its attributes. */
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</button>`))?.[0];
const order = (words: string, ...parts: string[]) => {
  const at = parts.map(part => words.indexOf(part));
  expect(at.every(index => index >= 0), `${parts.join(" < ")} in ${words}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};
const NO_CHECKS = ["Check phase 2b again", "Check Phase 2b again", "Mark Phase 2b complete", "Why Kiln stopped", "Completion checks", "Is Phase 2b already done?"];

/** Running with the live control idle: Pause now offered. */
function idle(change: (snapshot: Snapshot) => void = () => {}): Snapshot {
  const snapshot = pausingSnapshot();
  delete snapshot.liveControl!.pauseNow;
  delete snapshot.liveControl!.takeover;
  Object.assign(snapshot.liveControl!, { available: true, reason: "" });
  change(snapshot);
  return snapshot;
}

describe("the pause panel offers Now and After (AC-PAUSE-01)", () => {
  it("heads it Pause, Now first, naming the next leaf for a phase with a leaf after it", () => {
    const words = text(running(idle()));
    order(words, "Pause Now Stops after the command it is running , usually within seconds. Phase 2b stays open. Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command. Pause now",
      "After phase 2b Lets the phase finish. Kiln commits, pushes and runs the completion checks, then waits before starting phase 3. Pause after phase 2b");
    for (const gone of ["When should Kiln pause?", "Take over this session", "Pause & take over", "Wait before opening Claude"]) expect(words).not.toContain(gone);
  });

  it("says the next activity for the last open leaf", () => {
    const words = text(running(idle(snapshot => {
      snapshot.phases = snapshot.phases.map(row => row.id === "3" || row.id === "4" ? { ...row, state: "done" } : row);
    })));
    expect(words).toContain("then waits before starting the next activity. Pause after phase 2b");
  });

  it("names an audit and says the next activity after it", () => {
    const snapshot = idle(one => {
      const audit: PhaseView = { id: "audit-da2", activityId: "da2", kind: "delivery_audit", title: "Delivery audit", file: "Round 2", round: 2, continuationIndex: 1, state: "implementing", finishedByPerson: false };
      one.activities = [...one.phases.map(row => row.id === "2b" ? { ...row, state: "done" as const } : row), audit];
      one.current = { ...one.current!, phaseId: "audit-da2" };
      one.feature.currentPhaseId = "audit-da2";
      one.liveControl!.target = { ...one.liveControl!.target, activityKey: "audit-da2" };
      one.liveControl!.label = "Delivery audit · Round 2";
    });
    const words = text(running(snapshot));
    // An audit is named with its round (AC-PAUSE-01).
    expect(words).toContain("Delivery audit · round 2 stays open.");
    expect(words).toContain("After delivery audit · round 2 Lets the audit finish. Kiln commits, pushes and runs the completion checks, then waits before starting the next activity. Pause after delivery audit · round 2");
  });

  it("names an audit's round from its row when there is no live target, as for a Codex audit", () => {
    const snapshot = idle(one => {
      const audit: PhaseView = { id: "audit-da2", activityId: "da2", kind: "delivery_audit", title: "Delivery audit", file: "Round 2", round: 2, continuationIndex: 1, state: "implementing", finishedByPerson: false };
      one.activities = [...one.phases.map(row => row.id === "2b" ? { ...row, state: "done" as const } : row), audit];
      one.current = { ...one.current!, phaseId: "audit-da2" };
      one.feature.currentPhaseId = "audit-da2";
      delete one.liveControl;
    });
    const words = text(running(snapshot));
    expect(words).toContain("Delivery audit · round 2 stays open.");
    expect(words).toContain("After delivery audit · round 2 Lets the audit finish.");
    expect(words).toContain("Pause after delivery audit · round 2");
  });

  it("names the leaf a split phase is working on, not the launched phase", () => {
    const words = text(running(idle(snapshot => { snapshot.liveControl!.target = { ...snapshot.liveControl!.target, activityKey: "2" }; })));
    expect(words).toContain("Phase 2b stays open.");
    expect(words).toContain("Pause after phase 2b");
    expect(words).not.toContain("phase 2 ");
    const pending = text(running(idle(snapshot => { snapshot.liveControl!.target = { ...snapshot.liveControl!.target, activityKey: "2" }; snapshot.liveControl!.label = "Phase 2"; snapshot.pause = { pending: true, active: false }; })));
    expect(pending).toContain("Will pause after Phase 2b finishes.");
  });

  it("keeps today's unavailable reason and the message-submission guard", () => {
    const html = running(idle(snapshot => Object.assign(snapshot.liveControl!, { available: false, reason: "Pause now is unavailable for Codex sessions." })));
    expect(button(html, "Pause now")).toMatch(/disabled/);
    expect(text(html)).toContain("Pause now Pause now is unavailable for Codex sessions.");
    const submitting = running(idle(snapshot => { snapshot.liveControl!.messages = [{ delivery: "submitting" } as NonNullable<NonNullable<Snapshot["liveControl"]>["messages"]>[number]]; }));
    expect(button(submitting, "Pause now")).toMatch(/disabled/);
    expect(text(submitting)).toContain("Wait for this message submission’s outcome before pausing.");
  });
});

describe("the pausing state says what it is waiting for (AC-PAUSE-03)", () => {
  it("shows the running command, the lid sentence, the waiting line and Cancel, with no Pause after (frame 2)", () => {
    const html = running(pausingSnapshot({ waitingSeconds: 40 }));
    const words = text(html);
    expect(words).toContain(`Pause Pausing — finishing the command it is running. Running now ● Bash(npm test -- src/refunds) Kiln starts no more work after it. ${LID_SENTENCE} Waiting 40 seconds since the last observed activity. Cancel pause and keep going`);
    expect(button(html, "Cancel pause and keep going")).not.toMatch(/disabled/);
    for (const gone of ["Pause after phase 2b", "Stops after the command", "There is no automatic cancellation deadline", "Wait before opening Claude", "claude --resume"]) expect(words).not.toContain(gone);
  });

  it("shows no waiting line before 30 seconds", () => {
    expect(text(running(pausingSnapshot({ waitingSeconds: 20 })))).not.toContain("Waiting 20 seconds");
  });

  it("says Kiln stops Claude before its next command when nothing runs and the stop hasn't happened", () => {
    expect(text(running(pausingSnapshot({ running: [] })))).toContain(`Pausing — Claude isn't running a command; Kiln stops it before its next one. ${LID_SENTENCE}`);
  });

  it("says Claude has stopped, with no Cancel, after the stop (frame 2b, left)", () => {
    const words = text(running(pausingSnapshot({ running: [], stopped: true, cancel: { available: false, reason: ALREADY_PAUSED } })));
    expect(words).toContain(`Pausing — Claude has stopped; Kiln is checking nothing is still running. ${LID_SENTENCE}`);
    expect(words).not.toContain("Cancel pause and keep going");
  });

  it("lists each background process on its own line with no lid sentence (frame 2b, right)", () => {
    const words = text(running(pausingSnapshot({ running: [], stopped: true, background: [{ command: "npm run dev", pid: 48213 }, { pid: 51002 }], cancel: { available: false } })));
    expect(words).toContain(`Pausing — waiting for a process Claude started to end: npm run dev (process 48213) process 51002 ${BACKGROUND_NOTE}`);
    expect(words).not.toContain(LID_SENTENCE);
  });

  it("shows an obstacle's reason as a warning in place of the row, with no lid sentence", () => {
    const html = running(pausingSnapshot({ obstacle: { code: "control_unavailable", reason: "Kiln can't confirm the safe stop for this Claude Code version." }, waitingSeconds: 45 }));
    expect(html).toMatch(/<p class="warning[^"]*">Kiln can't confirm the safe stop for this Claude Code version\.<\/p>/);
    expect(text(html)).toContain("Pausing Kiln can't confirm the safe stop for this Claude Code version. Waiting 45 seconds since the last observed activity.");
    expect(text(html)).not.toContain(LID_SENTENCE);
  });

  it("keeps a pending end-of-phase pause visible below, with its own cancel", () => {
    const snapshot = pausingSnapshot();
    snapshot.pause = { pending: true, active: false };
    const words = text(running(snapshot));
    order(words, "Cancel pause and keep going", "Will pause after Phase 2b finishes. Cancel end-of-phase pause");
    expect(words).not.toContain("Pause after phase 2b");
  });
});

describe("Cancel until the stop (AC-PAUSE-04)", () => {
  it("is disabled with its reason when the engine withholds it before the stop", () => {
    const html = running(pausingSnapshot({ cancel: { available: false, reason: "Wait for the pending live instruction to settle." } }));
    expect(button(html, "Cancel pause and keep going")).toMatch(/disabled/);
    expect(text(html)).toContain("Cancel pause and keep going Wait for the pending live instruction to settle.");
  });

  it("is disabled while disconnected, with the usual reason", () => {
    const html = detail(pausingSnapshot(), false);
    expect(button(html, "Cancel pause and keep going")).toMatch(/disabled/);
    expect(text(html)).toContain("Reconnect before acting. Last-known state.");
  });
});

describe("the header and phase plan row (AC-PAUSE-03, AC-PAUSE-05)", () => {
  const now = new Date(RUNNING_NOW);

  it("reads Pausing {activity} with the arc, last known while disconnected, and Paused in {activity} once paused", () => {
    expect(headerState(pausingSnapshot(), true, now)).toMatchObject({ kind: "pausing", label: "Pausing phase 2b", facts: ["2 of 5 phases done"] });
    expect(headerState(pausingSnapshot({}, { exited: true }), true, now)).toMatchObject({ kind: "pausing", label: "Pausing phase 2b" });
    expect(headerState(pausingSnapshot(), false, now)).toMatchObject({ kind: "interrupted", label: "Last known: Pausing phase 2b", facts: ["2 of 5 phases done"] });
    expect(headerState(pausedHoldSnapshot(), true, now)).toMatchObject({ kind: "paused", label: "Paused in phase 2b", facts: ["2 of 5 phases done", "Paused 11:46 AM", "1 min ago"] });
    const pausing = running(pausingSnapshot());
    expect(pausing).toMatch(/<span class="pill amber-outline[^"]* large"><svg[^>]*class="[^"]*spin[^"]*"[\s\S]*?<\/svg>Pausing phase 2b<\/span>/);
    expect(text(pausing)).toContain("Pausing phase 2b 2 of 5 phases done");
    expect(running(pausingSnapshot(), false)).toMatch(/<span class="pill amber-outline[^"]* large">Last known: Pausing phase 2b<\/span>/);
  });

  it("names an audit as its running header does", () => {
    const snapshot = pausingSnapshot({ activityKey: "audit-da2" });
    snapshot.activities = [...snapshot.phases, { id: "audit-da2", activityId: "da2", kind: "delivery_audit", title: "Delivery audit", file: "Round 2", round: 2, state: "implementing", finishedByPerson: false }];
    expect(headerState(snapshot, true, new Date(RUNNING_NOW)).label).toBe("Pausing delivery audit");
  });

  it("keeps the running pill while pausing, never Needs you, and marks the row Paused once paused (frame 3)", () => {
    const pausingRow = text(running(pausingSnapshot({}, { exited: true }), true));
    expect(pausingRow).toContain("2b Store credit phase-2b-store-credit.md 49m Implementing");
    expect(pausingRow).not.toContain("Needs you Phase plan");
    expect(running(pausingSnapshot({}, { exited: true }), true)).not.toMatch(/>Needs you</);
    // The paused page itself, which is what a connected browser shows once paused, carries the plan.
    const html = held(pausedHoldSnapshot());
    expect(html).toMatch(/<li data-phase="2b"[^>]*>(?:(?!<\/li>)[\s\S])*?<span class="circle mono next[^"]*">2b<\/span>(?:(?!<\/li>)[\s\S])*?<span class="pill strong-outline[^"]*">Paused<\/span>/);
    expect(html).not.toMatch(/>Needs you</);
  });
});

describe("the session page while pausing and once paused", () => {
  it("shows Pausing with the arc, All phases, the running circle and the pausing panel after Claude has exited", () => {
    const html = detail(pausingSnapshot({ running: [], stopped: true, cancel: { available: false } }, { exited: true }));
    expect(html).toMatch(/<span class="pill amber-outline[^"]*"><svg[^>]*class="[^"]*spin[^"]*"[\s\S]*?<\/svg>Pausing<\/span>/);
    expect(html).toMatch(/<span class="circle mono implementing[^"]*">2b<\/span>/);
    expect(text(html)).toContain("All phases");
    expect(text(html)).toContain("Pausing — Claude has stopped; Kiln is checking nothing is still running.");
    expect(html).not.toMatch(/>Needs you</);
    expect(detail(pausingSnapshot(), false)).toMatch(/<span class="pill amber-outline[^"]*">Last known: Pausing<\/span>/);
  });

  it("shows the Pausing {activity} header beside the phases done, last known while disconnected", () => {
    const html = detail(pausingSnapshot());
    expect(html).toMatch(/<span class="pill amber-outline[^"]*"><svg[^>]*class="[^"]*spin[^"]*"[\s\S]*?<\/svg>Pausing phase 2b<\/span>/);
    order(text(html), "Customer returns Pausing phase 2b 2 of 5 phases done", "All phases", "2b Store credit Pausing Phase 2b of 5");
    const offline = detail(pausingSnapshot(), false);
    expect(offline).toMatch(/<span class="pill amber-outline[^"]*">Last known: Pausing phase 2b<\/span>/);
    expect(text(offline)).toContain("Last known: Pausing phase 2b 2 of 5 phases done");
    expect(text(detail(pausedHoldSnapshot()))).not.toContain("phases done");
  });

  it("shows the Pausing pill and panel on the leaf's page after a split, with the leaf in the header", () => {
    const snapshot = pausingSnapshot({ running: [], stopped: true, cancel: { available: false } }, { exited: true });
    snapshot.liveControl!.target = { ...snapshot.liveControl!.target, activityKey: "2" };
    const html = detail(snapshot);
    expect(text(html)).toContain("Pausing phase 2b 2 of 5 phases done");
    expect(html).toMatch(/<\/svg>Pausing<\/span>/);
    expect(text(html)).toContain("Pausing — Claude has stopped; Kiln is checking nothing is still running.");
  });

  it("shows the neutral Paused pill and circle, a Paused back link, and no pause panel once paused", () => {
    const html = detail(pausedHoldSnapshot());
    expect(html).toMatch(/<span class="pill strong-outline[^"]*"><svg[\s\S]*?<\/svg>Paused<\/span>/);
    expect(html).toMatch(/<span class="circle mono next[^"]*">2b<\/span>/);
    expect(text(html)).toMatch(/^Repository .*? Customer returns Paused 2b Store credit Paused Phase 2b of 5/);
    expect(text(html)).not.toContain("Cancel pause and keep going");
    expect(html).not.toMatch(/>Needs you</);
  });
});

describe("the paused page (AC-PAUSE-05, AC-PAUSE-06)", () => {
  it("shows the card, the quoted last words, and Resume and the terminal side by side, with no checks (frame 3)", () => {
    const html = held(pausedHoldSnapshot());
    const words = text(html);
    order(words,
      "Paused in phase 2b 2 of 5 phases done · Paused 11:46 AM · 1 min ago",
      "2b Paused partway · phase 2b of 5 Store credit",
      "Kiln stopped after npm test -- src/refunds finished. Nothing is running. Last thing Claude said: “Running the refund tests, then I’ll wire store credit into the receipt email.”",
      "Let Kiln carry on Picks up in the same conversation, where it stopped. Whenever you’re ready; nothing is waiting on you. Note for Claude (optional)",
      "Resume phase 2b",
      "Or take it over yourself Open the same conversation in your terminal. Kiln waits while you work.",
      "claude --resume 7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04 Copy",
      "When you’re done, exit Claude and press Resume . If you finished phase 2b there, Kiln sees that and offers to move on instead.",
      "Changed the plan? Ask Claude to record those decisions in the requirements before you exit. No special handoff phrase is needed.",
      "Session won’t open? Start a fresh one",
      "Full session output · 612 lines");
    expect(html).toMatch(/<span class="pill strong-outline[^"]* large"><svg[\s\S]*?<\/svg>Paused in phase 2b<\/span>/);
    for (const gone of [...NO_CHECKS, "Reply here and let Kiln finish", "Send reply & resume", "Have Kiln resume"]) expect(words).not.toContain(gone);
  });

  it("says Kiln stopped before Claude's next command with no last command, and the gateless sentence", () => {
    expect(text(held(pausedHoldSnapshot({ lastCommand: undefined, lastSaid: undefined })))).toContain("Kiln stopped before Claude's next command. Nothing is running. Let Kiln carry on");
    expect(text(held(pausedHoldSnapshot({ gateless: true })))).toContain("The session ended on its own. Nothing is running.");
  });

  it("shortens a long last message with an ellipsis", () => {
    const long = `${"Wiring the store credit ledger into the receipt email and the refund summary page ".repeat(4)}now.`;
    const words = text(held(pausedHoldSnapshot({ lastSaid: long })));
    expect(words).toMatch(/Last thing Claude said: “Wiring the store credit ledger[^”]{80,160}…”/);
  });

  it("names the leaf a split phase is working on in the header, plan row, eyebrow, Resume and hint", () => {
    const snapshot = pausedHoldSnapshot();
    snapshot.liveControl!.target = { ...snapshot.liveControl!.target, activityKey: "2" };
    snapshot.liveControl!.takeover!.target = snapshot.liveControl!.target;
    const html = held(snapshot);
    const words = text(html);
    order(words, "Paused in phase 2b", "Paused partway · phase 2b of 5", "Resume phase 2b", "If you finished phase 2b there");
    expect(html).toMatch(/<li data-phase="2b"[^>]*>(?:(?!<\/li>)[\s\S])*?<span class="pill strong-outline[^"]*">Paused<\/span>/);
    expect(words).not.toMatch(/phase 2 of|Resume phase 2 |finished phase 2 /);
  });

  it("names an audit's round in the eyebrow", () => {
    const snapshot = pausedHoldSnapshot({ activityKey: "audit-da2" });
    snapshot.activities = [...snapshot.phases, { id: "audit-da2", activityId: "da2", kind: "delivery_audit", title: "Delivery audit", file: "Round 2", round: 2, state: "needs_you", finishedByPerson: false }];
    const words = text(held(snapshot));
    expect(words).toContain("DA Paused partway · delivery audit · round 2 Delivery audit");
    expect(words).toContain("Resume delivery audit");
  });

  it("shows terminal_in_use as a neutral line in the terminal column, and other obstacles as a warning, Resume still offered", () => {
    const inUse = held(pausedHoldSnapshot({ obstacle: { code: "terminal_in_use", reason: "Claude Code is open on this conversation." } }));
    order(text(inUse), "Or take it over yourself", "claude --resume", "Claude is open on this conversation; exit it, then press Resume.");
    expect(inUse).not.toContain("Claude Code is open on this conversation.");
    expect(inUse).not.toMatch(/class="warning[^"]*"[^>]*>Claude is open/);
    const other = held(pausedHoldSnapshot({ obstacle: { code: "state_unavailable", reason: "Kiln couldn't read the session's state." } }));
    expect(other).toMatch(/<p class="warning[^"]*" role="status">Kiln couldn't read the session's state\.<\/p>/);
    expect(text(other)).toContain("Paused in phase 2b");
    expect(text(other)).toContain("Resume phase 2b");
  });

  it("shows Resume's refusal beside the button and keeps an unsent note", () => {
    const words = text(held(pausedHoldSnapshot(), page({ draft: "Use the new ledger.", unsent: true, feedback: "Exit Claude Code on this conversation first." })));
    expect(words).toContain("Your note has not been sent. Resume phase 2b Exit Claude Code on this conversation first.");
  });

  it("shows only the pausing panel while pausing: no command, no resume controls", () => {
    const words = text(held(pausingSnapshot({ running: [], stopped: true, cancel: { available: false } }, { exited: true })));
    expect(words).toContain("Pausing phase 2b 2 of 5 phases done Pause Pausing — Claude has stopped; Kiln is checking nothing is still running.");
    for (const gone of [...NO_CHECKS, "claude --resume", "Resume phase 2b", "Let Kiln carry on", "Wait before opening Claude"]) expect(words).not.toContain(gone);
  });

  it("puts uncertain messages to acknowledge first, in place of the card", () => {
    const snapshot = pausedHoldSnapshot();
    snapshot.liveControl!.reviewRequired = ["receipt-1"];
    const words = text(held(snapshot));
    expect(words).toContain("Review each uncertain message in the conversation before resuming phase 2b.");
    expect(words).not.toContain("Let Kiln carry on");
  });

  it("shows the carry-on and fresh-terminal cards under the Paused header when the conversation can't be reopened", () => {
    const snapshot = pausedHoldSnapshot({}, { history: { state: "unavailable", reason: "missing" } });
    Object.assign(snapshot.needsYou!, { reopen: { state: "unavailable", reason: "missing" }, carryOn: { available: true, endsHold: "takeover" } });
    const words = text(held(snapshot));
    order(words, "Paused in phase 2b", "Reply here and let Kiln carry on", "Starting it ends the pause.", "Start a fresh session in your terminal");
    for (const gone of ["Let Kiln carry on Picks up", "Needs you", "takeover"]) expect(words).not.toContain(gone);
  });

  it("keeps the planned-for-you card first while pausing and once paused", () => {
    for (const snapshot of [pausingSnapshot({}, { exited: true }), pausedHoldSnapshot()]) {
      snapshot.needsYou!.attended = "Doug signs the store-credit terms.";
      order(text(held(snapshot)), "This phase was planned as needing you Doug signs the store-credit terms.", snapshot.liveControl!.pauseNow!.phase === "paused" ? "Paused partway" : "Pause Pausing");
    }
  });

  it("shows a pending end-of-phase pause with its cancel below the card", () => {
    const snapshot = pausedHoldSnapshot();
    snapshot.pause = { pending: true, active: false };
    order(text(held(snapshot)), "Session won’t open?", "Will pause after Phase 2b finishes. Cancel end-of-phase pause", "Full session output");
  });

  it("names Pause now on the recovery page Resume's already-complete answer leads to", () => {
    const words = text(strip(render(PhaseHandoff, { props: { snapshot: pausedHoldSnapshot(), now: RUNNING_NOW, page: page({ choice: true }) } }).body));
    expect(words).toContain("Paused in Phase 2b.");
    expect(words).toContain("Phase 2b is already complete.");
    expect(words).not.toContain("terminal takeover");
  });
});

