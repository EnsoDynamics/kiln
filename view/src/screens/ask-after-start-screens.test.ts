// The Needs you stops that ask where a repository is (find repositories anywhere AC-SEE-05;
// docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html,
// state 8): the stop before a phase, with one question, several, or one beside a failure fact,
// and a session's request on any other stop, below the card for how its session ended. Making
// and answering the questions is proved in kiln-run-ask-after-start.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { handBackSnapshot, needsYouMessageSnapshot, pausedHoldSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import NeedsYou from "./NeedsYou.svelte";
import PausedHold from "./PausedHold.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);

const INVENTORY = { kind: "where" as const, repository: "acme-labs/inventory", label: "inventory", searchedFrom: "~/code/acme", checkouts: [], found: 0, phaseFile: "phase-4-restock-check-in.md" };
const FACT = "phase-4-restock-check-in.md names acme-labs/inventory, and Kiln couldn’t find a checkout of it";

/** The stop before phase 4, as mockup state 8 draws it, with the questions and facts given. */
function planStop(locate: NonNullable<NonNullable<Snapshot["needsYou"]>["locate"]>, facts: string[]): Snapshot {
  const base = needsYouMessageSnapshot();
  return {
    ...base,
    feature: { ...base.feature, currentPhaseId: "4", stoppedAt: "2026-10-17T15:05:00Z" },
    needsYou: {
      phaseId: "4", kind: "plan", stoppedAt: "2026-10-17T15:05:00Z", checkedAt: "2026-10-17T15:05:00Z", resumeOffered: false,
      checks: [{ name: "Phase plan reads", passed: false, facts }],
      freshSessionPrompt: "", freshSessionCommand: "", locate,
    },
  };
}

describe("the stop before a phase that names a repository Kiln can't place (mockup state 8)", () => {
  it("asks with Documents found's question and words, and says the phase starts once it is answered", () => {
    const page = needsYou(planStop([INVENTORY], [FACT]));
    const words = text(page);
    expect(words).toContain("Phase 4 hasn’t started. Phase 4 names acme-labs/inventory, and Kiln couldn’t add it to the workspace.");
    expect(words).toContain("Kiln couldn’t find a checkout of acme-labs/inventory. It searched outward from ~/code/acme/, never above your home folder. Where is it on this computer? Use this folder Kiln remembers this on this computer only. Nothing is written to any repository.");
    expect(words).toContain("Kiln then adds it to the workspace and starts phase 4. Or clone it where the search reaches, and press Check again.");
    expect(words).toContain(`Why Kiln stopped Phase plan reads Not yet ${FACT}`);
    expect(words).toContain("Check again Searches again. Checked 11:05 AM.");
    // Nothing ran, so there is no session to pick up.
    expect(words).not.toContain("Pick it up yourself");
  });

  it("repeats the question once per repository, and says the phase starts once nothing else holds the stop", () => {
    const ledger = { ...INVENTORY, repository: "acme-labs/ledger", label: "ledger" };
    const words = text(needsYou(planStop([INVENTORY, ledger], [FACT, FACT.replace("inventory", "ledger")])));
    expect(words).toContain("Phase 4 names repositories Kiln couldn’t add to the workspace.");
    expect(words.match(/Where is it on this computer\?/g)).toHaveLength(2);
    expect(words).toContain("Kiln couldn’t find a checkout of acme-labs/ledger.");
    expect(words).toContain("Or clone them where the search reaches, and press Check again. Phase 4 starts once nothing else holds this stop.");
    expect(words).not.toContain("Kiln then adds it");
  });

  it("says \"it\" when one question sits beside a failure fact", () => {
    const words = text(needsYou(planStop([INVENTORY], [FACT, "storefront: That branch already exists in storefront."])));
    expect(words).toContain("Or clone it where the search reaches, and press Check again. Phase 4 starts once nothing else holds this stop.");
  });
});

describe("a session's request on any other Needs you stop (AC-SEE-05)", () => {
  it("shows the drawn question below the card for how the session ended and above the ways to resolve the stop", () => {
    const base = needsYouMessageSnapshot();
    const snapshot: Snapshot = { ...base, needsYou: { ...base.needsYou!, locate: [{ ...INVENTORY, phaseFile: undefined } as never] } };
    const page = needsYou(snapshot);
    const words = text(page);
    expect(words).toContain("Kiln couldn’t find a checkout of acme-labs/inventory. It searched outward from ~/code/acme/, never above your home folder. Where is it on this computer? Use this folder Kiln remembers this on this computer only. Nothing is written to any repository. The session can ask for it again once the phase resumes.");
    expect(words).not.toContain("Kiln then adds it to the workspace");
    const ended = words.indexOf("Last message from");
    const question = words.indexOf("Kiln couldn’t find a checkout of acme-labs/inventory");
    const resolve = words.indexOf("Let Kiln carry on");
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(ended).toBeLessThan(question);
    expect(question).toBeLessThan(resolve);
  });
});

describe("a session's request on the hand-back page (technical design, \"Screens\")", () => {
  it("shows the question below the stopped session's card", () => {
    const base = handBackSnapshot();
    const snapshot: Snapshot = { ...base, needsYou: { ...base.needsYou!, locate: [{ ...INVENTORY, phaseFile: undefined } as never] } };
    const words = text(strip(render(PhaseHandoff, { props: { snapshot, now: RUNNING_NOW, page: { key: "2b", draft: "", choice: false, unsent: false } } }).body));
    expect(words).toContain("Kiln couldn’t find a checkout of acme-labs/inventory. It searched outward from ~/code/acme/, never above your home folder. Where is it on this computer? Use this folder Kiln remembers this on this computer only. Nothing is written to any repository. The session can ask for it again once the phase resumes.");
    expect(words.indexOf("Last message from")).toBeLessThan(words.indexOf("Kiln couldn’t find a checkout of acme-labs/inventory"));
  });
});

describe("a session's request on a held Pause now page (AC-SEE-05)", () => {
  const QUESTION = "Kiln couldn’t find a checkout of acme-labs/inventory";
  const held = (snapshot: Snapshot) => text(strip(render(PausedHold, { props: { snapshot, now: RUNNING_NOW, page: { key: "2b", draft: "", choice: false, unsent: false } } }).body));
  const asking = (snapshot: Snapshot) => { snapshot.needsYou!.locate = [{ ...INVENTORY, phaseFile: undefined } as never]; return snapshot; };

  it("shows the question below the paused facts and above the carry-on and take-over sections", () => {
    const words = held(asking(pausedHoldSnapshot()));
    expect(words.split(QUESTION)).toHaveLength(2);
    const at = ["Paused partway", "Last thing Claude said", QUESTION, "The session can ask for it again once the phase resumes.", "Let Kiln carry on", "Resume phase 2b", "Or take it over yourself"].map((part) => words.indexOf(part));
    expect(at.every((index) => index >= 0), words).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("shows it above the heading over the carry-on and fresh-terminal cards", () => {
    const snapshot = asking(pausedHoldSnapshot({}, { history: { state: "unavailable", reason: "missing" } }));
    Object.assign(snapshot.needsYou!, { reopen: { state: "unavailable", reason: "missing" }, carryOn: { available: true, endsHold: "takeover" } });
    const words = held(snapshot);
    expect(words.split(QUESTION)).toHaveLength(2);
    const at = [QUESTION, "How would you like to resolve this?", "Reply here and let Kiln carry on", "Start a fresh session in your terminal"].map((part) => words.indexOf(part));
    expect(at.every((index) => index >= 0), words).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps the paused card whole when no question is asked", () => {
    const words = held(pausedHoldSnapshot());
    expect(words).not.toContain(QUESTION);
    expect(words.indexOf("Last thing Claude said")).toBeLessThan(words.indexOf("Let Kiln carry on"));
  });
});
