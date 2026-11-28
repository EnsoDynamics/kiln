// Kiln Planned Test Fix Batches rendered to HTML (docs/changes/kiln-planned-test-fix-batches/
// mockups/kiln-planned-test-fix-batches.html): each batch a test audit planned is a row, named as
// AC-BATCH-03's table says, with the planned Preflight row above the first that has not started;
// the Paused screen names a batch at Next by its sentence form (AC-BATCH-03); the status line and
// every rendered loop say the limit is a maximum (AC-MAX-01).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { auditLoopsView, pausedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import Paused from "./Paused.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
const paused = (snapshot: Snapshot) => strip(render(Paused, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const header = (html: string) => text(html.match(/<div class="state[^"]*">[\s\S]*?<\/div>/)?.[0] ?? "");
const row = (html: string, id: string) => text(html.match(new RegExp(`<li data-phase="${id}"[\\s\\S]*?</li>`))?.[0] ?? "");

const done = { state: "done" as const, finishedByPerson: false };
const audits = (batch2: PhaseView["state"]): PhaseView[] => [
  { id: "audit-ta1", activityId: "ta1", kind: "test_audit", title: "Test audit", file: "Loop 1 · max 4 · found 31 test gaps and planned them as 2 batches", round: 1, continuationIndex: 1, ...done, loops: [{ kind: "test", number: 1, limit: 4 }] },
  { id: "audit-ta1-2", activityId: "ta1-2", kind: "test_audit", title: "Fixing tests", file: "Batch 1 of 2 from test audit loop 1 · 17 gaps", round: 1, continuationIndex: 2, fixing: { loop: 1, session: 1, batch: { number: 1, of: 2, gaps: 17 } }, ...(batch2 === "planned" ? { state: "implementing" as const, finishedByPerson: false } : done) },
  { id: "audit-batch-ta1-2", kind: "test_audit", title: "Fixing tests", file: "Batch 2 of 2 from test audit loop 1 · 14 gaps", fixing: { loop: 1, session: 2, batch: { number: 2, of: 2, gaps: 14 } }, state: batch2, plannedActivity: true, finishedByPerson: false },
];

/** Mockup state 2: the first batch running, the second still to come. */
function batchRunning(): Snapshot {
  const snapshot = runningSnapshot();
  snapshot.activities = [...snapshot.phases.map(phase => ({ ...phase, ...done })), ...audits("planned")];
  snapshot.current = { ...snapshot.current!, phaseId: "audit-ta1-2" };
  snapshot.feature = { ...snapshot.feature, currentPhaseId: "audit-ta1-2" };
  snapshot.auditLoops = auditLoopsView({ test: { used: 1, limit: 4, closed: false, floor: 1 }, position: { audit: "test", loop: 1, limit: 4, fixing: true, batch: { number: 1, of: 2 } } });
  return snapshot;
}

describe("each planned batch is a row (AC-BATCH-01, AC-BATCH-02, AC-BATCH-03)", () => {
  it("draws the audit's found-and-planned line, the running batch and the one still to come as mockup state 2 does", () => {
    const html = running(batchRunning());
    expect(row(html, "audit-ta1")).toMatch(/^TA Test audit Loop 1 · max 4 · found 31 test gaps and planned them as 2 batches/);
    expect(row(html, "audit-ta1-2")).toMatch(/^FT Fixing tests Batch 1 of 2 from test audit loop 1 · 17 gaps/);
    expect(row(html, "audit-batch-ta1-2")).toMatch(/^FT Fixing tests Batch 2 of 2 from test audit loop 1 · 14 gaps .*Planned$/);
    // A batch that has not started has no link of its own.
    expect(html.match(/<li data-phase="audit-batch-ta1-2"[\s\S]*?<\/li>/)![0]).not.toContain("<a ");
  });

  it("puts a planned Preflight row that would sit last above the first batch not started", () => {
    const snapshot = batchRunning();
    snapshot.preflight = { planned: { before: "end" } };
    const ids = [...running(snapshot).matchAll(/<li data-phase="([^"]+)"/g)].map(match => match[1]);
    expect(ids.slice(-2)).toEqual(["preflight-planned", "audit-batch-ta1-2"]);
  });

  it("names the batch on the status line and every loop with its maximum (AC-MAX-01)", () => {
    const html = running(batchRunning());
    expect(header(html)).toContain("Fixing tests · batch 1 of 2 from test audit loop 1");
    expect(text(html)).not.toMatch(/loop \d+ of \d+/i);
  });
});

describe("a batch at Next on the Paused screen (AC-BATCH-03)", () => {
  it("heads the screen with its sentence form, and starts it by its name", () => {
    const snapshot = pausedSnapshot();
    snapshot.activities = [...snapshot.phases.map(phase => ({ ...phase, ...done })), ...audits("next")];
    const words = text(paused(snapshot));
    expect(words).toContain("Next: fixing tests, batch 2 of 2 from test audit loop 1");
    expect(words).toContain("Start fixing tests");
    expect(words).not.toContain("Next: fixing tests, Fixing tests");
  });
});
