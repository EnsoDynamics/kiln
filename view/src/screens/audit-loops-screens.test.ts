// The audit loop displays rendered to HTML (docs/changes/kiln-deliver-when-audit-loops-run-out/
// mockups/kiln-deliver-when-audit-loops-run-out.html): the two limits on Documents found and in the
// run's settings (AC-CHOICE-01, AC-CHOICE-02), no loop stop page and a stored 1.3.0 loop stop's
// one line (AC-STOP-04), and the status line's position and the audit rows' loop labels (AC-STOP-05).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { auditLoopsView, closingAuditsSnapshot, documentsFoundSnapshot, runningSnapshot, RUNNING_NOW, storedLoopStopSnapshot } from "../../../src/test-support/sample-snapshots.js";
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
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]!));
const header = (html: string) => text(html.match(/<div class="state[^"]*">[\s\S]*?<\/div>/)?.[0] ?? "");
const fieldset = (html: string) => html.match(/<fieldset class="loops[\s\S]*?<\/fieldset>/)?.[0] ?? "";

describe("the Audit loops settings are two limits (AC-CHOICE-01)", () => {
  it("shows Max delivery audit loops and Max test audit loops at 4 before Start, with mockup screen 1's help and nothing else", () => {
    const section = fieldset(documentsFound(documentsFoundSnapshot()));
    const words = text(section);
    expect(section).toMatch(/<input id="loops-deliveryLimit" type="number" min="1"[^>]*value="4"/);
    expect(section).toMatch(/<input id="loops-testLimit" type="number" min="1"[^>]*value="4"/);
    expect(section.match(/<input/g)).toHaveLength(2);
    expect(words).toContain("Max delivery audit loops The delivery audit checks that every acceptance criterion is built, and Kiln builds the phases it adds. Each run of the audit is one loop. After the phases from loop 4 are built, Kiln goes on to the test audit.");
    expect(words).toContain("Max test audit loops The test audit checks that the tests would notice if a criterion broke, and Kiln builds or fixes what it finds. Each run of the audit is one loop. After the work from loop 4 is done, Kiln opens the pull request, after a delivery audit if one is left.");
    expect(words).toContain("Both can be changed while Kiln runs, from the page or the command line.");
    // The third setting Kiln 1.3.0 released, and its acceptance sentence, are gone.
    expect(section).not.toContain('type="radio"');
    expect(words).not.toContain("After the last test audit loop");
    expect(words).not.toMatch(/\baccept\b|Weak rows/i);
  });

  it("words the help from the numbers shown", () => {
    const snapshot = documentsFoundSnapshot();
    snapshot.auditLoops = auditLoopsView({ settings: { deliveryLimit: 2, testLimit: 6 } });
    const words = text(fieldset(documentsFound(snapshot)));
    expect(words).toContain("After the phases from loop 2 are built");
    expect(words).toContain("After the work from loop 6 is done");
  });
});

describe("a limit changed during a run (AC-CHOICE-02)", () => {
  it("is in the run's settings, changeable, with each field's minimum at the snapshot's floor", () => {
    const snapshot = runningSnapshot();
    snapshot.auditLoops = auditLoopsView({ settings: { deliveryLimit: 4, testLimit: 3 }, delivery: { used: 2, limit: 4, closed: false, floor: 2 }, test: { used: 0, limit: 3, closed: false, floor: 1 } });
    const section = fieldset(running(snapshot));
    expect(section).toMatch(/<input id="loops-deliveryLimit" type="number" min="2"[^>]*value="4"/);
    expect(section).toMatch(/<input id="loops-testLimit" type="number" min="1"[^>]*value="3"/);
    expect(section).not.toMatch(/<input id="loops-deliveryLimit"[^>]*disabled/);
    expect(text(section)).toContain("A change applies from Kiln’s next decision whether to run that audit.");
    expect(text(section)).not.toContain("continuation");
    expect(section).not.toContain('type="radio"');
  });

  it("says a change applies to a continuation once the pull request session has started", () => {
    const snapshot = runningSnapshot();
    snapshot.auditLoops = auditLoopsView({ frozen: { at: "2026-10-17T15:40:00Z" } });
    const words = text(fieldset(running(snapshot)));
    expect(words).toContain("The pull request session has started, so a change applies only to a continuation of this run.");
    expect(words).not.toContain("next decision");
  });
});

describe("there is no loop stop (AC-STOP-04)", () => {
  const page = needsYou(storedLoopStopSnapshot());
  const words = text(page);

  it("shows a loop_limit stop saved by Kiln 1.3.0 with its one line and Check again only", () => {
    expect(words).toContain("Kiln no longer stops at a loop limit. Check again to go on.");
    expect(buttons(page)).toEqual(["Check again"]);
  });

  it("offers no Allow, Accept, Reply, Mark complete or loop settings", () => {
    for (const gone of ["Allow", "Accept what is left", "more loops", "Mark ", "Audit loop left", "Max delivery audit loops"]) expect(words).not.toContain(gone);
    expect(page).not.toContain("<textarea");
    expect(page).not.toContain("<input");
  });
});

describe("the status line names the loop (AC-STOP-05)", () => {
  it("names a running audit's loop", () => {
    expect(header(running(closingAuditsSnapshot({ id: "audit-da2", position: { audit: "delivery", loop: 2, limit: 4 } })))).toContain("Delivery audit loop 2 of 4");
  });

  it("names a phase an audit added as any phase, with no loop", () => {
    const words = header(running(closingAuditsSnapshot()));
    expect(words).toContain("Implementing phase 10");
    expect(words).not.toContain("loop");
  });

  it("names a session of test fixes by the latest test loop", () => {
    expect(header(running(closingAuditsSnapshot({ id: "audit-ta1-2", position: { audit: "test", loop: 2, limit: 4, fixing: true } })))).toContain("Fixing tests from test audit loop 2 of 4");
  });

  it("keeps the latest loop at a Needs you stop", () => {
    const words = header(needsYou(storedLoopStopSnapshot()));
    expect(words).toContain("Needs you Test audit loop 4 of 4");
  });

  it("never marks a last loop", () => {
    for (const page of [running(closingAuditsSnapshot({ id: "audit-da4", position: { audit: "delivery", loop: 4, limit: 4 } })), needsYou(storedLoopStopSnapshot())]) expect(text(page)).not.toMatch(/last loop/i);
  });
});

describe("each audit row carries its loop label (AC-STOP-05)", () => {
  const page = running(closingAuditsSnapshot());
  const row = (id: string) => text(page.match(new RegExp(`<li[^>]*data-phase="${id}"[^>]*>[\\s\\S]*?</li>`))?.[0] ?? "");

  it("titles each audit for what it does with Loop N of 4 beneath, a session of test fixes by the loop it works from, and phase rows with none (Kiln After Delivery AC-AUDIT-01)", () => {
    expect([1, 2, 3, 4].map(n => row(`audit-da${n}`))).toEqual([1, 2, 3, 4].map(n => expect.stringContaining(`Delivery audit Loop ${n} of 4`)));
    expect(row("audit-ta1")).toContain("Test audit Loop 1 of 4");
    expect(row("audit-ta1-2")).toContain("Fixing tests From test audit loop 1 · session 1");
    for (const id of ["9", "10", "11"]) expect(row(id)).not.toMatch(/loop/i);
    expect(text(page)).not.toMatch(/Round|Continuation/);
    expect(text(page)).not.toMatch(/last loop|carried|your words/i);
  });

  it("names the loop on the audit's own page", () => {
    expect(text(detail(closingAuditsSnapshot(), "audit-da3"))).toContain("Loop 3 of 4");
  });
});
