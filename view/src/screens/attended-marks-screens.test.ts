// The Attended and Early merge marks on the screens (Kiln Build Preflight PRD, Phase 2; mockup
// states 1, 3, 4 and 6): the Needs you there marker on Documents found and the run's phase plan,
// the planned-as-needing-you card on every Needs you layout, and the warning beneath Allow early
// merges. Reading the lines and carrying them into the snapshot is proved in
// attended-marks.integration.test.ts; pointing, focusing and pressing in a real browser in
// attended-marks-browser.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, handBackSnapshot, needsYouMessageSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const config = { base: "/customer-returns/", token: "t", page: "documents" } as never;
const ATTENDED = "Create the return-label template in the carrier's desktop console, which has no API.";

const documentsFound = (snapshot: Snapshot) => strip(render(DocumentsFound, { props: { snapshot, config, connected: true } }).body);
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const handBack = (snapshot: Snapshot) => strip(render(PhaseHandoff, { props: { snapshot, now: RUNNING_NOW, page: { key: "2b", draft: "", choice: false, unsent: false } } }).body);
/** The `<li>` that holds `marker`, from Documents found's plan list. */
const itemWith = (html: string, marker: string) => {
  const at = html.indexOf(marker);
  return html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
};

function documentsWith(change: (phases: NonNullable<NonNullable<Snapshot["documents"]>["plan"]>["phases"]) => void, overrides: Parameters<typeof documentsFoundSnapshot>[0] = {}): Snapshot {
  const snapshot = documentsFoundSnapshot(overrides);
  change(snapshot.documents!.plan!.phases);
  return snapshot;
}

describe("the Needs you there marker (AC-ATTEND-01, mockup states 1 and 3)", () => {
  it("sits beside a marked phase's name on Documents found, closed or not, and carries the Attended text and where it came from", () => {
    const html = documentsFound(documentsWith(phases => {
      phases[0]!.attended = ATTENDED;
      phases[0]!.closed = true;
      phases[2]!.attended = "Approve the card processor's sandbox webhook in its dashboard.";
    }));
    const intake = itemWith(html, ">Return intake<");
    expect(intake).toContain("Needs you there</button>");
    expect(text(intake)).toContain(`Return intake Needs you there ${ATTENDED} From the phase document's Attended line closed`);
    const card = itemWith(html, ">Card refunds<");
    expect(text(card)).toContain("Card refunds Needs you there Approve the card processor's sandbox webhook in its dashboard.");
    // The text is a tooltip described by the marker, so pointing, focus and a press all reach it.
    const describedBy = intake.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeDefined();
    expect(intake).toContain(`id="${describedBy}" role="tooltip"`);
    expect(intake).toContain('aria-expanded="false"');
  });

  it("is absent from a phase whose document has no Attended line, and an empty line still marks the phase", () => {
    const html = documentsFound(documentsWith(phases => { phases[4]!.attended = ""; }));
    expect(itemWith(html, ">Return intake<")).not.toContain("Needs you there");
    expect(itemWith(html, ">Returns dashboard<")).toContain("Needs you there</button>");
    expect(html.match(/Needs you there<\/button>/g)).toHaveLength(1);
  });

  it("also sits beside a marked split phase's name and the phase Kiln starts at", () => {
    const start = { from: "existing" as const, bringUpToDate: true, previewId: "p", branches: [], repositories: [], closedCount: 1, startAt: { id: "2b", title: "Store credit" } };
    const html = documentsFound(documentsWith(phases => { phases[1]!.attended = "Approve refunds in the processor's console."; phases[3]!.attended = ATTENDED; }, { documents: { start } }));
    const split = html.slice(html.indexOf('<li class="split'), html.indexOf("<ol", html.indexOf('<li class="split')));
    expect(text(split)).toContain("Refund routing Needs you there Approve refunds in the processor's console.");
    const here = itemWith(html, ">Store credit<");
    expect(here).toContain("Kiln starts here");
    expect(text(here)).toContain(`Store credit Needs you there ${ATTENDED}`);
  });

  it("sits beside a marked phase's name on the run's phase plan, done or not yet started", () => {
    const snapshot = runningSnapshot();
    snapshot.phases = snapshot.phases.map(row => row.id === "1" || row.id === "3" ? { ...row, attended: ATTENDED } : row);
    snapshot.activities = snapshot.phases;
    const html = running(snapshot);
    const row = (id: string) => html.slice(html.indexOf(`data-phase="${id}"`), html.indexOf("</li>", html.indexOf(`data-phase="${id}"`)));
    expect(snapshot.phases.find(one => one.id === "1")!.state).toBe("done");
    expect(snapshot.phases.find(one => one.id === "3")!.state).toBe("planned");
    for (const id of ["1", "3"]) {
      expect(row(id)).toContain("Needs you there</button>");
      expect(text(row(id))).toContain(ATTENDED);
    }
    expect(row("2a")).not.toContain("Needs you there");
  });
});

describe("the planned-as-needing-you card (AC-ATTEND-03, mockup state 4)", () => {
  it("is the first card of the main column on the standard Needs you page, above how the session ended", () => {
    const snapshot = needsYouMessageSnapshot();
    snapshot.needsYou!.attended = ATTENDED;
    const html = needsYou(snapshot);
    const words = text(html);
    expect(words).toContain(`This phase was planned as needing you ${ATTENDED}`);
    const card = html.indexOf('aria-label="Planned as needing you"');
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(html.indexOf("card ended"));
    expect(html.slice(html.indexOf("column-wide"), html.lastIndexOf("<section", card))).not.toContain("<section");
  });

  it("comes first on the stopped-phase page that offers Start again, above its headline", () => {
    const snapshot = needsYouMessageSnapshot();
    Object.assign(snapshot.needsYou!, { attended: ATTENDED, case: "could_not_start", startAgain: { available: true } });
    const html = needsYou(snapshot);
    const card = html.indexOf('aria-label="Planned as needing you"');
    expect(card).toBeGreaterThan(html.indexOf('class="restart'));
    expect(card).toBeLessThan(html.indexOf('class="headline'));
  });

  it("comes first on the hand-back page, above its headline", () => {
    const snapshot = handBackSnapshot();
    snapshot.needsYou!.attended = ATTENDED;
    const html = handBack(snapshot);
    expect(text(html)).toContain(`This phase was planned as needing you ${ATTENDED}`);
    expect(html.indexOf('aria-label="Planned as needing you"')).toBeLessThan(html.indexOf("Phase 2b needs your input."));
    expect(html.indexOf('aria-label="Planned as needing you"')).toBeLessThan(html.indexOf('aria-label="Stopped session"'));
  });

  it("is absent for a phase whose document has no Attended line", () => {
    expect(needsYou(needsYouMessageSnapshot())).not.toContain("planned as needing you");
    expect(handBack(handBackSnapshot())).not.toContain("planned as needing you");
  });
});

describe("the warning beneath Allow early merges (AC-ATTEND-05, mockup state 6)", () => {
  const withEarly = (enabled: boolean, change: Parameters<typeof documentsWith>[0], documents: Partial<NonNullable<Snapshot["documents"]>> = {}) => {
    const snapshot = documentsWith(change, { documents });
    snapshot.settings.developmentDeployments = { enabled, targets: [] };
    return documentsFound(snapshot);
  };
  const warning = (html: string) => {
    const at = html.indexOf('<div class="early-stop');
    return at === -1 ? undefined : html.slice(at, html.indexOf("</div>", at));
  };

  it("names the phase and its branch, directly beneath the checkbox, while the box is off", () => {
    const html = withEarly(false, phases => { phases[4]!.earlyMerge = "develop, for AC-RET-09"; });
    expect(text(warning(html)!)).toBe("⚠ The run will stop at Phase 3. It merges into develop early. Tick Allow early merges to keep it going.");
    const checkbox = html.indexOf("<span>Allow early merges</span></label>");
    expect(checkbox).toBeGreaterThan(-1);
    expect(html.indexOf('class="early-stop')).toBeGreaterThan(checkbox);
    expect(html.slice(checkbox, html.indexOf('class="early-stop'))).not.toContain("<p");
  });

  it("names the phase without a branch when its Early merge line has no text", () => {
    expect(text(warning(withEarly(false, phases => { phases[4]!.earlyMerge = ""; }))!)).toBe("⚠ The run will stop at Phase 3. It merges early. Tick Allow early merges to keep it going.");
  });

  it("names each such phase when several merge early", () => {
    const html = withEarly(false, phases => { phases[2]!.earlyMerge = "develop, for AC-RET-04"; phases[5]!.earlyMerge = "main"; });
    expect(text(warning(html)!)).toBe("⚠ The run will stop at Phase 2a and Phase 4. Phase 2a merges into develop early. Phase 4 merges into main early. Tick Allow early merges to keep it going.");
  });

  it("is absent when the box is ticked, when the only such phase is closed or before the start point, and when no phase has the line", () => {
    expect(warning(withEarly(true, phases => { phases[4]!.earlyMerge = "develop"; }))).toBeUndefined();
    expect(warning(withEarly(false, phases => { phases[4]!.earlyMerge = "develop"; phases[4]!.closed = true; }))).toBeUndefined();
    expect(warning(withEarly(false, () => {}))).toBeUndefined();
    const start = { from: "existing" as const, bringUpToDate: true, previewId: "p", branches: [], repositories: [], closedCount: 0, startAt: { id: "3", title: "Returns dashboard" } };
    expect(warning(withEarly(false, phases => { phases[0]!.earlyMerge = "develop"; }, { start }))).toBeUndefined();
    expect(text(warning(withEarly(false, phases => { phases[4]!.earlyMerge = "develop"; }, { start }))!)).toContain("The run will stop at Phase 3.");
  });
});
