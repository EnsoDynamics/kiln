// The audit loop displays rendered to HTML (docs/changes/kiln-audit-loop-limits/mockups/
// kiln-audit-loop-limits.html): the Audit loops section on Documents found and in the run's
// settings (AC-LOOP-01, AC-LOOP-05, AC-LOOP-06, AC-EFFORT-01), the loop stop pages (AC-STOP-01,
// AC-STOP-02) and the activity rows' loop labels (AC-SHOW-01, AC-TEST-03).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { deliveryLoopStopSnapshot, documentsFoundSnapshot, runningSnapshot, RUNNING_NOW, testLoopStopSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import Running from "./Running.svelte";

const config = { token: "t", base: "/customer-returns" };
const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const documentsFound = (snapshot: Snapshot) => strip(render(DocumentsFound, { props: { snapshot, config, connected: true } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
const detail = (snapshot: Snapshot, phaseId: string) => strip(render(PhaseDetail, { props: { snapshot, phaseId, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</button>`))?.[0];

describe("the Audit loops settings (AC-LOOP-01, AC-LOOP-05, AC-LOOP-06, AC-EFFORT-01)", () => {
  it("shows the three settings at their defaults before Start, each with help from the numbers shown", () => {
    const page = documentsFound(documentsFoundSnapshot());
    const words = text(page);
    expect(page).toMatch(/<input id="loops-deliveryLimit" type="number"[^>]*value="3"/);
    expect(page).toMatch(/<input id="loops-testLimit" type="number"[^>]*value="3"/);
    expect(page).toMatch(/<input type="radio" name="after-last-test" value="deliver_unless_serious"[^>]*checked/);
    expect(page).not.toMatch(/value="stop_and_ask"[^>]*checked/);
    expect(words).toContain("Audit loops After the planned phases close, the audits can send Kiln back to finish or to prove acceptance criteria.");
    expect(words).toContain("Delivery audit loops, at most Kiln builds what the audits find unfinished up to 3 times.");
    expect(words).toContain("Test audit loops, at most After the test audit, Kiln runs up to 3 sessions of test fixes, each one a loop, and tells the 3rd it is the last.");
    // The default's sentence sits beside the choice that gives it (AC-LOOP-06).
    expect(words).toContain("After the last test audit loop Deliver, unless something serious is left You say: “I accept the remaining Weak rows after the last test audit loop.”");
    expect(words).toContain("Always stop and ask me You accept nothing in advance.");
    expect(words).toContain("These can be changed while Kiln runs, from the page or the command line, like keep-awake.");
    expect(words).toContain("Claude Code now starts at Medium. Codex still starts at High.");
  });

  it("words the help from the draft's numbers and choice", () => {
    const snapshot = documentsFoundSnapshot();
    snapshot.auditLoops = { settings: { deliveryLimit: 5, testLimit: 2, afterLastTest: "stop_and_ask" }, delivery: { used: 0, limit: 5 }, test: { used: 0, limit: 2 } };
    const page = documentsFound(snapshot);
    expect(text(page)).toContain("up to 5 times");
    expect(text(page)).toContain("If a 6th audit still finds something");
    expect(text(page)).toContain("tells the 2nd it is the last");
    expect(page).toMatch(/value="stop_and_ask"[^>]*checked/);
  });

  it("are in the run's settings, changeable while Kiln runs (AC-LOOP-05)", () => {
    const snapshot = runningSnapshot();
    snapshot.auditLoops = { settings: { deliveryLimit: 4, testLimit: 3, afterLastTest: "deliver_unless_serious" }, delivery: { used: 1, limit: 4 }, test: { used: 0, limit: 3 } };
    const page = running(snapshot);
    expect(page).toMatch(/<input id="loops-deliveryLimit" type="number"[^>]*value="4"/);
    expect(page).not.toMatch(/<input id="loops-deliveryLimit"[^>]*disabled/);
    expect(text(page)).toContain("Kiln builds what the audits find unfinished up to 4 times. If an audit finds more after that, Kiln stops at Needs you.");
    expect(text(page)).toContain("Up to 3 sessions of test fixes after the test audit. The 3rd is told it is the last.");
  });
});

describe("a delivery audit loop stop that holds (mockup screen 2; AC-STOP-01, AC-STOP-02)", () => {
  const page = needsYou(deliveryLoopStopSnapshot());
  const words = text(page);

  it("shows the heading, the loops and what the latest audit found", () => {
    expect(words).toContain("Delivery audit loops used: 3 of 3");
    expect(words).toContain("The loops Loop 1 of 3 · Phase 6 built 1h 52m Loop 2 of 3 · Phase 7 built 1h 14m Last loop · Phase 8 built 48m Delivery audit · added Phase 9 41m");
    expect(words).toContain("What the latest delivery audit found “AC-REFUND-04 is still incomplete");
    expect(words).toContain("Nothing listed for you.");
  });

  it("offers Allow 2 more loops, Reply, Check again and the terminal command, and no Accept", () => {
    expect(page).toMatch(/<input type="number"[^>]*value="2"/);
    expect(button(page, "Allow 2 more loops")).toBeDefined();
    expect(button(page, "Accept what is left and deliver")).toBeUndefined();
    expect(button(page, "Send reply to the audit")).toBeDefined();
    expect(button(page, "Check again")).toBeDefined();
    expect(words).toContain("Open the delivery audit’s session in a terminal cd ~/devel/acme-shop-kiln/customer-returns claude --resume 4b1e9c2a-73f0-4d5e-9a61-0c8d2f7e5b13");
  });

  it("gives the Audit loop left row and Mark complete's refusal reason, with no disabled Mark complete", () => {
    expect(words).toContain("Why Kiln stopped Audit loop left No No delivery audit loop is left: 3 of 3 used.");
    expect(words).toContain("Kiln is holding because no delivery audit loop is left, not because a check failed.");
    expect(page).not.toContain("Mark ");
    expect(words).toContain("If you have raised the limit in the settings, the next loop starts. If not, Kiln stays here.");
  });

  it("shows the loop settings beside it, so the limit can be raised from the page (AC-LOOP-05, AC-STOP-02)", () => {
    expect(words).toContain("Delivery audit loops, at most");
    expect(words).toContain("After the last test audit loop");
  });
});

describe("a test audit loop stop for listed items (mockup screen 3; AC-STOP-01, AC-STOP-02)", () => {
  const page = needsYou(testLoopStopSnapshot());
  const words = text(page);

  it("shows the person's choice, the summary and each item as the audit wrote it", () => {
    expect(words).toContain("Test audit loops used: 3 of 3 Your setting is Deliver, unless something serious is left. The last test audit listed 3 items for you to decide, so Kiln stopped.");
    expect(words).toContain("What the latest test audit found “Fixed 6 Weak rows.");
    expect(words).toContain("Listed for you AC-REFUND-04 · High risk, still Weak: no test checks that a damaged item is refunded nothing. Decide whether to accept it.");
    expect(words).toContain("AC-RETURNS-03 · High risk, still Weak: day 30 and day 31 are never tested.");
  });

  it("offers Allow and Accept with its sentence, and no Reply, no disabled Mark complete and no Audit loop left row", () => {
    expect(button(page, "Allow 2 more loops")).toBeDefined();
    expect(button(page, "Accept what is left and deliver")).toBeDefined();
    expect(words).toContain("You say: “I accept the remaining Weak rows, and AC-REFUND-04, AC-APPROVAL-01 and AC-RETURNS-03.” One more session records it and fixes nothing.");
    expect(button(page, "Send reply to the audit")).toBeUndefined();
    expect(page).not.toContain("<textarea");
    expect(page).not.toContain("Mark ");
    expect(words).not.toContain("Audit loop left");
    expect(words).toContain("Leave these undecided. Kiln runs the delivery audit, then one more test audit that doesn’t count as a loop.");
    expect(words).toContain("Open the last test audit’s session in a terminal");
  });
});

describe("activity rows say which loop they are (AC-SHOW-01, AC-TEST-03)", () => {
  it("labels loop 2 of 3 and last loop, and says which sentence a row carried", () => {
    const snapshot = testLoopStopSnapshot();
    const page = running({ ...snapshot, feature: { ...snapshot.feature, state: "implementing" }, needsYou: undefined });
    const row = (id: string) => page.match(new RegExp(`<li[^>]*data-phase="${id}"[^>]*>[\\s\\S]*?</li>`))?.[0] ?? "";
    expect(text(row("audit-ta1"))).not.toContain("loop");
    expect(text(row("audit-ta2"))).toContain("loop 1 of 3");
    expect(text(row("audit-ta3"))).toContain("loop 2 of 3");
    expect(text(row("audit-ta4"))).toContain("last loop");
    expect(text(row("audit-ta4"))).toContain("ran under your setting Deliver, unless something serious is left");
  });

  it("lists each loop with its start, duration and what it did, and quotes the carried sentence with its source", () => {
    const words = text(detail(testLoopStopSnapshot(), "audit-ta4"));
    expect(words).toContain("Last loop Last loop · 4:10 PM · 3h 2m · Needs you · fixed 6 Weak rows");
    expect(words).toContain("Carried, as your words: “I accept the remaining Weak rows after the last test audit loop.” chosen on Documents found at 2026-10-17 13:12 UTC");
  });
});
