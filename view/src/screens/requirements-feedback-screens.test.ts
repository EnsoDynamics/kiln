// Feedback at any time, as the screens show it (Kiln Requirements Stages AC-NOTE-01, AC-TALK-02,
// AC-TALK-04, AC-EARLY-03, AC-EARLY-05, AC-FINAL-02): the draft note marked as waiting for
// nothing, each message's state, the commit on the plan row, Stop here again only at the early
// review, and the early review setting fixed once the refinement finished. The engine side is
// proved in src/requirements/feedback.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { RequirementsView, Snapshot } from "../../../src/engine/snapshot.js";
import { runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import RequirementsFeedback from "../components/RequirementsFeedback.svelte";
import PhasePlan from "../components/PhasePlan.svelte";
import SettingsPanel from "../components/SettingsPanel.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
const requirements = (change: Partial<RequirementsView> = {}): RequirementsView => ({
  origin: { kind: "brief", path: "source-material/count-boxes", title: "Count boxes", files: ["source-material/count-boxes/count-boxes-brief.md"], commit: "a".repeat(40), committedAt: "2026-11-27T13:00:00Z" },
  rows: [{ key: "autonomous-prd-refinement#1", title: "Refine the PRD", state: "done", pushedSha: "7c2e4f1aaaaaaaa", feedback: [{ sentAt: "2026-11-27T14:40:00Z", appliedAt: "2026-11-27T14:52:00Z", commit: "5c7d2e0bbbbbbbb" }] }],
  feedback: [
    { id: "m-1", text: "Store staff look up counts too.", at: "2026-11-27T14:40:00Z", state: "applied", appliedAt: "2026-11-27T14:52:00Z", appliedCommit: "5c7d2e0bbbbbbbb" },
    { id: "m-2", text: "Boxes can be empty.", at: "2026-11-27T14:41:00Z", state: "read", readAt: "2026-11-27T14:43:00Z" },
    { id: "m-3", text: "Show the date.", at: "2026-11-27T14:42:00Z", state: "sent" },
    { id: "m-4", text: "Count crates.", at: "2026-11-27T14:44:00Z", state: "waiting" },
  ],
  ...change,
});
const withRequirements = (view: RequirementsView, settings: Partial<Snapshot["settings"]> = {}): Snapshot => { const base = runningSnapshot(); return { ...base, requirements: view, settings: { ...base.settings, ...settings } }; };
const feedbackBox = (snapshot: Snapshot) => text(render(RequirementsFeedback, { props: { snapshot, connected: true } }).body);
const review = (kind: "early" | "final") => ({ kind, file: "docs/prds/count-boxes/count-boxes-stakeholder-review.html", readySince: "2026-11-27T15:00:00Z", openAssumptions: 2, freshSessionCommand: "claude" });

it("shows the draft's key statements as waiting for nothing, and each message as waiting, sent, read or applied", () => {
  const page = feedbackBox(withRequirements(requirements({ draftNote: { statements: ["A volunteer records each box's count."], leftOut: ["Accounts"] }, feedbackTo: "running_session" })));
  expect(page).toContain("From the PRD draft · Nothing is waiting on this");
  expect(page).toContain("A volunteer records each box's count.");
  expect(page).toContain("Not included Accounts");
  expect(page).toContain("Worked in at 9:52 AM, in 5c7d2e0");
  expect(page).toContain("Read by the session at 9:43 AM");
  expect(page).toContain("Sent to the session, not yet confirmed read");
  expect(page).toContain("Waiting: a fresh session applies it before the next stage");
  expect(page).toContain("The session running now reads it at its next opportunity.");
  expect(page).not.toContain("Stop here again");
  // A report with no draft shows no note.
  expect(feedbackBox(withRequirements(requirements()))).not.toContain("From the PRD draft");
});

it("offers Stop here again at the early review only, with what the feedback changed", () => {
  const early = feedbackBox(withRequirements(requirements({ review: { ...review("early"), refreshedAt: "2026-11-27T15:52:00Z", whatChanged: { items: ["Counts are whole boxes."], commit: "5c7d2e0bbbbbbbb" } } })));
  expect(early).toContain("Stop here again once my feedback is in.");
  expect(early).toContain("What changed · as the feedback session reported it · pushed 5c7d2e0");
  expect(early).toContain("Counts are whole boxes.");
  expect(early).toContain("Send feedback");
  const final = feedbackBox(withRequirements(requirements({ review: review("final") })));
  expect(final).toContain("Send feedback");
  expect(final).toContain("the design and the phase plan");
  expect(final).not.toContain("Stop here again");
});

it("lists applied feedback with its commit on the plan row, and fixes the early review setting once refined", () => {
  const plan = text(render(PhasePlan, { props: { snapshot: withRequirements(requirements()), connected: true, now: Date.parse("2026-11-27T16:00:00Z") } }).body);
  expect(plan).toContain("Feedback sent at 9:40 AM. Worked in and pushed at 9:52 AM, in 5c7d2e0.");
  const fixed = render(SettingsPanel, { props: { snapshot: withRequirements(requirements(), { waitAtEarlyReview: { value: true, canChange: false } }), connected: true } }).body;
  expect(text(fixed)).toContain("Wait for me at the early review");
  const toggle = (markup: string) => markup.match(/<input[^>]*aria-label="Wait for me at the early review"[^>]*>/)![0];
  expect(toggle(fixed)).toMatch(/\sdisabled/);
  const open = render(SettingsPanel, { props: { snapshot: withRequirements(requirements(), { waitAtEarlyReview: { value: true, canChange: true } }), connected: true } }).body;
  expect(toggle(open)).not.toMatch(/\sdisabled/);
});
