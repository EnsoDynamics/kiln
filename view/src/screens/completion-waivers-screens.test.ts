// The completion waivers displays rendered to HTML (docs/changes/kiln-completion-waivers/mockups/
// kiln-completion-waivers.html): the hand-back page's resume and check sections (AC-NEXT-01/02),
// Mark complete on both Needs you pages (AC-WAIVE-02 to 04, AC-WAIVE-06), and Waived in place of
// Passed wherever a completed activity shows (AC-WAIVE-10, AC-WAIVE-12).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import type { ItemChange } from "../../../src/engine/waivers.js";
import type { DeliveryCheckpoint } from "../../../src/state/development-delivery.js";
import {
  completeWaivedSnapshot,
  finalDeliveryNeedsYouSnapshot,
  handBackSnapshot,
  markCompleteOfferSample,
  noReportAuditSnapshot,
  RUNNING_NOW,
  waivedPhaseSnapshot,
} from "../../../src/test-support/sample-snapshots.js";
import type { PhaseRecoveryPage } from "../lib/phase-recovery-page.js";
import Complete from "./Complete.svelte";
import NeedsYou from "./NeedsYou.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const page = (extra: Partial<PhaseRecoveryPage> = {}): PhaseRecoveryPage => ({ key: "2b", draft: "", choice: false, unsent: false, ...extra });
const handBack = (snapshot: Snapshot, recovery = page()) => strip(render(PhaseHandoff, { props: { snapshot, now: RUNNING_NOW, page: recovery } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const detail = (snapshot: Snapshot, phaseId: string) => strip(render(PhaseDetail, { props: { snapshot, phaseId, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
/** The button whose words are exactly `label`, with its attributes. */
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</button>`))?.[0];
const order = (words: string, ...parts: string[]) => {
  const at = parts.map(part => words.indexOf(part));
  expect(at.every(index => index >= 0), `${parts.join(" < ")} in ${words}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("the hand-back page keeps resuming and checking apart (AC-NEXT-01/02)", () => {
  it("puts Have Kiln resume in the terminal card and the checks, as Kiln stopped, below the two cards", () => {
    const html = handBack(handBackSnapshot());
    const words = text(html);
    order(words, "Talk it through in your terminal", "For a back-and-forth with Claude Code. The full conversation comes with you.", "Changed the plan?", "Got it back on track? Exit Claude Code, then: Have Kiln resume Phase 2b", "Kiln picks up the same conversation, including your terminal discussion, and finishes Phase 2b.", "Is Phase 2b already done?");
    expect(words).toContain("Checked when Kiln stopped, 11:52:00 AM · 3 of 4 passed");
    expect(words).toContain("If you finished it yourself, or think Kiln got it wrong, check again. If every check passes, Kiln closes out Phase 2b and moves to the next step. Nothing is committed or pushed for you.");
    order(words, "Is Phase 2b already done?", "Required development delivery verified Not yet", "api-checkpoint / verify: /deployed_sha does not match", "Check Phase 2b again");
    expect(words).not.toContain("Back from your terminal?");
    expect(words).not.toContain("Verify Phase 2b & advance");
    expect(words).not.toContain("Resume Phase 2b in Kiln");
    expect(words).not.toContain("Open the conversation in your terminal");
    // Mark complete shows below the checks but waits for a recheck (AC-WAIVE-02).
    order(words, "Check Phase 2b again", "Phase 2b is done, and Kiln’s check is wrong?", "Mark Phase 2b complete", "Check again first. If a check still fails, this button becomes available.");
    expect(button(html, "Mark Phase 2b complete")).toContain("disabled");
    expect(words).not.toContain("Mark it complete. Kiln skips");
    expect(words).not.toContain("still has");
  });

  it("keeps the fresh-session title and the resume-unavailable note when the conversation can't be resumed", () => {
    const words = text(handBack(handBackSnapshot({ resumeOffered: false, rechecked: true })));
    expect(words).toContain("Start a fresh session in your terminal");
    expect(words).toContain("Resume is unavailable. Use the terminal recovery instructions to finish Phase 2b, then check it again below.");
    expect(words).not.toContain("Have Kiln resume");
    expect(words).not.toContain("Got it back on track?");
    // After a failed recheck it counts what fails, without pointing at a resume that isn't offered.
    expect(words).toContain("Phase 2b still has 1 failing check.");
    expect(words).not.toContain("have Kiln resume it above");
  });

  it("after a failed recheck, says how many checks fail, points to resuming, and offers Mark complete below the checks (AC-WAIVE-02/03)", () => {
    const words = text(handBack(handBackSnapshot({ rechecked: true })));
    expect(words).toContain("Checked again 11:56:05 AM · 3 of 4 passed");
    order(words, "Check Phase 2b again", "Phase 2b still has 1 failing check. If the work isn’t finished, have Kiln resume it above.", "Phase 2b is done, and Kiln’s check is wrong?",
      "Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to the next step. Phase 2b will show as “Complete · 1 check waived”.", "Mark Phase 2b complete");
  });

  it("never says Checked again after a recheck that could not finish, keeping the earlier rows' time", () => {
    const snapshot = handBackSnapshot({ rechecked: true });
    snapshot.needsYou!.checkedAt = "2026-10-17T15:52:00Z";
    snapshot.needsYou!.checkRun = { id: "run-2b-unfinished", at: "2026-10-17T15:56:05Z", origin: "recheck", finished: false };
    snapshot.needsYou!.markComplete = { offered: false, reason: "The last check could not finish." };
    const words = text(handBack(snapshot));
    expect(words).not.toContain("Checked again");
    expect(words).toContain("Checked 11:52:00 AM · 3 of 4 passed");
    expect(words).not.toContain("still has");
  });

  it("writes an audit's name in lower case mid-sentence, as the mockup does: Check delivery audit again", () => {
    const snapshot = handBackSnapshot({ rechecked: true });
    snapshot.liveControl = { ...(snapshot.liveControl ?? {}), label: "Delivery audit" } as NonNullable<Snapshot["liveControl"]>;
    const html = handBack(snapshot);
    const words = text(html);
    expect(button(html, "Check delivery audit again")).toBeDefined();
    expect(button(html, "Have Kiln resume delivery audit")).toBeDefined();
    order(words, "Is delivery audit already done?", "Kiln closes out delivery audit and moves to the next step.", "Delivery audit still has 1 failing check.");
    expect(words).not.toMatch(/Check Delivery audit again|resume Delivery audit/);
  });

  it("adds the missing-work paragraph when a failing item is unpushed work", () => {
    const words = text(handBack(handBackSnapshot({ rechecked: true, mixed: true })));
    expect(words).toContain("Checked again 11:56:05 AM · 1 of 4 passed");
    expect(words).toContain("Phase 2b still has 3 failing checks.");
    order(words, "Kiln skips the 3 failing checks above, records them as waived", "acme-shop has work that is not committed and pushed. Work that is not committed and pushed will be missing from the final pull request. To push it instead, have Kiln resume Phase 2b.", "Mark Phase 2b complete");
  });

  it("hides Mark complete while Kiln is checking, and disables Check again", () => {
    const html = handBack(handBackSnapshot({ rechecked: true, checking: true }));
    expect(text(html)).not.toContain("Mark Phase 2b complete");
    expect(button(html, "Check Phase 2b again")).toContain("disabled");
  });

  it("reads Checking… on the pressed button while its rerun runs, with resume, reply and Check again disabled (AC-WAIVE-06)", () => {
    const offer = markCompleteOfferSample();
    const html = handBack(handBackSnapshot({ rechecked: true, checking: true }), page({ pending: "mark", markOffer: offer }));
    expect(button(html, "Checking…")).toContain("disabled");
    expect(button(html, "Check Phase 2b again")).toContain("disabled");
    expect(button(html, "Have Kiln resume Phase 2b")).toContain("disabled");
    expect(button(html, "Send reply &amp; resume Phase 2b")).toContain("disabled");
  });

  it("highlights the changed item and offers Mark complete again at once on the new run (AC-WAIVE-04)", () => {
    const snapshot = handBackSnapshot({ rechecked: true });
    const delivery = snapshot.needsYou!.checks.at(-1)!;
    const added = "api-checkpoint / deploy: Deployment has no independently observed historical successful status.";
    delivery.facts.push(added);
    delivery.items!.push({ kind: "development_requirement", subject: "api-checkpoint/deploy", text: added, against: "api-checkpoint@abcdef123456" });
    const changes: ItemChange[] = [{ check: delivery.name, subject: "api-checkpoint/deploy", change: "newly_failing", after: added }];
    const words = text(handBack(snapshot, page({ markChanges: changes })));
    expect(words).toContain(`New ${added}`);
    expect(words).not.toContain("New api-checkpoint / verify");
    order(words, "Mark Phase 2b complete", "The results changed since your last check. Nothing was marked complete. A new item, marked New above, is failing under Required development delivery verified. Review it, then choose again.");
    expect(words).not.toContain("still has");
  });

  it("shows an error by the button", () => {
    const words = text(handBack(handBackSnapshot({ rechecked: true }), page({ markError: "The checks could not finish: origin is unreachable." })));
    order(words, "Mark Phase 2b complete", "The checks could not finish: origin is unreachable.");
  });

  it("submits nothing while disconnected", () => {
    const html = handBack(handBackSnapshot({ rechecked: true }));
    expect(button(html, "Mark Phase 2b complete")).toContain("disabled");
  });
});

describe("Mark complete on the standard Needs you page (AC-WAIVE-02)", () => {
  it("sits below Check again in the side panel, with a carried waiver's tag inside the failing check", () => {
    const html = needsYou(finalDeliveryNeedsYouSnapshot());
    const words = text(html);
    order(words, "Development delivery and remaining review Not yet", "Waived api-checkpoint / verify · waived at Phase 2b, 10/17/2026, 11:58 AM · browser · alex", "acme-shop: unresolved — no complete source-work delivery provenance.",
      "Check again", "Final delivery is done, and Kiln’s check is wrong?", "Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to Complete. Final delivery will show as “Complete · 1 check waived”.", "Mark final delivery complete");
    expect(button(html, "Mark final delivery complete")).not.toContain("disabled");
  });

  it("reads Checked again with the recheck's time, as the mockup does, and plain Checked before any recheck", () => {
    expect(text(needsYou(finalDeliveryNeedsYouSnapshot()))).toContain("Check again Checked again 12:41 PM.");
    const first = finalDeliveryNeedsYouSnapshot();
    first.needsYou!.checkRun = { id: "run-pr-stop", at: "2026-10-17T16:41:00Z", origin: "stop", finished: true };
    const words = text(needsYou(first));
    expect(words).toContain("Check again Checked 12:41 PM.");
    expect(words).not.toContain("Checked again");
  });

  it("shows Mark complete unusable before a recheck, saying to check again first", () => {
    const snapshot = finalDeliveryNeedsYouSnapshot();
    snapshot.needsYou!.markComplete = { offered: false, reason: "No check has run since final delivery stopped.", awaitingRecheck: { label: "Mark final delivery complete", heading: "Final delivery is done, and Kiln’s check is wrong?" } };
    const html = needsYou(snapshot);
    order(text(html), "Check again", "Final delivery is done, and Kiln’s check is wrong?", "Mark final delivery complete", "Check again first.");
    expect(button(html, "Mark final delivery complete")).toContain("disabled");
    expect(text(html)).not.toContain("Mark it complete. Kiln skips");
  });

  it("shows no Mark complete when nothing is left to waive", () => {
    const snapshot = finalDeliveryNeedsYouSnapshot();
    snapshot.needsYou!.markComplete = { offered: false, reason: "Every check passed. Check again advances without a waiver." };
    expect(text(needsYou(snapshot))).not.toContain("Mark final delivery complete");
  });

  it("says first that the audit left no report", () => {
    const snapshot = finalDeliveryNeedsYouSnapshot();
    snapshot.needsYou!.markComplete = { ...markCompleteOfferSample(), heading: "Delivery audit is done, and Kiln’s check is wrong?", label: "Mark delivery audit complete", noReport: true,
      sentence: ["No audit report. Kiln couldn’t read a report from this audit, so it can’t tell what the audit found.", "Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, counts the audit as passed and moves on to the test audit. Delivery audit will show as “Complete · 1 check waived” with a warning: no audit report."] };
    order(text(needsYou(snapshot)), "Delivery audit is done, and Kiln’s check is wrong?", "! No audit report Kiln couldn’t read a report from this audit, so it can’t tell what the audit found.", "counts the audit as passed and moves on to the test audit", "Mark delivery audit complete");
  });
});

describe("a waived check reads Waived, never Passed (AC-WAIVE-10)", () => {
  it("marks the completed phase Complete · 1 check waived in the progress row", () => {
    const words = text(running(waivedPhaseSnapshot()));
    expect(words).toContain("Store credit phase-2b-store-credit.md");
    expect(words).toMatch(/phase-2b-store-credit\.md [^]*?Complete · 1 check waived/);
  });

  it("shows the waived completion's checks, counts and waiver record in the phase detail", () => {
    const words = text(detail(waivedPhaseSnapshot(), "2b"));
    expect(words).toContain("Complete · 1 check waived");
    expect(words).toContain("3 passed · 1 waived. The waived check was not verified by Kiln.");
    order(words, "Phase doc closed Passed", "Pushed Passed", "Required development delivery verified", "Waived api-checkpoint / verify · waived at Phase 2b", "Waived Source Browser · alex",
      "When 10/17/2026, 11:58:22 AM", "Waived api-checkpoint / verify — /deployed_sha does not match its declared target/artifact.", "Checked against api-checkpoint · merge abcdef12 · check at", "Covers only this item as checked.");
    // Mockup state 6: the subject once, never the raw fingerprint.
    expect(words).not.toContain("— api-checkpoint / verify:");
    expect(words).not.toContain("api-checkpoint@");
    expect(words).not.toContain("Required development delivery verified Passed");
  });

  /** The waived phase with one delivery checkpoint whose merge result is `resultSha`. */
  const withCheckpoint = (resultSha: string) => {
    const snapshot = waivedPhaseSnapshot();
    const checkpoint = { id: "api-checkpoint", target: { repository: "github.com/acme/returns-api", baseBranch: "develop", environment: "returns-api-dev" }, headSha: "1".repeat(40), merge: { number: 212, url: "https://github.com/acme/returns-api/pull/212", resultSha }, operations: [], evidence: [{ requirementId: "verify", revision: "2".repeat(40), environment: "returns-api-dev", observedAt: "2026-10-17T15:40:00Z", status: "unresolved", rawDigest: "b".repeat(64) }], requirements: [{ id: "verify", purpose: "verification" }] } as unknown as DeliveryCheckpoint;
    snapshot.developmentDelivery = { executionId: "display-execution", phaseId: "3", revision: 3, authorization: { revision: 1, enabled: true, grants: [] }, assessments: [], checkpoints: [checkpoint], splits: [], repositoryResults: [] } as unknown as NonNullable<Snapshot["developmentDelivery"]>;
    return snapshot;
  };

  it("names the checkpoint's repository, environment and merge under Checked against, as mockup state 6 does", () => {
    const words = text(detail(withCheckpoint("abcdef123456"), "2b"));
    expect(words).toContain("Checked against returns-api · returns-api-dev · merge abcdef12 · check at");
  });

  it("lists the delivery panel's waived verification with its time", () => {
    const words = text(running(withCheckpoint("abcdef123456")));
    expect(words).toContain("verification ( verify ): waived · 10/17/2026, 11:58 AM");
    expect(words).not.toContain("verification: unresolved");
  });

  it("drops the waived mark once a new merge ends the waiver, showing the live failing evidence again (AC-WAIVE-09)", () => {
    const words = text(running(withCheckpoint("fedcba654321")));
    expect(words).not.toContain("waived · 10/17/2026");
    expect(words).toContain("verification: unresolved · returns-api-dev");
  });

  it("marks final delivery and the waived phase on the Complete screen", () => {
    const words = text(strip(render(Complete, { props: { snapshot: completeWaivedSnapshot(), connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body));
    expect(words).toMatch(/Store credit phase-2b-store-credit\.md [^]*?Complete · 1 check waived/);
    expect(words).toMatch(/Final pull request pull request session [^]*?Complete · 1 check waived/);
  });

  it("puts the no-report warning beside a waived audit's label and explains it in its detail (AC-WAIVE-12)", () => {
    const snapshot = noReportAuditSnapshot();
    expect(text(running(snapshot))).toMatch(/Delivery audit Round 1 [^]*?Complete · 1 check waived ! no audit report/);
    const words = text(detail(snapshot, "audit-da1"));
    expect(words).toContain("Complete · 1 check waived ! no audit report");
    expect(words).toContain("! No audit report Kiln couldn’t tell what this audit found. It counted the audit as passed and moved on to the test audit.");
    expect(words).toContain("0 passed · 1 waived. The waived check was not verified by Kiln.");
    expect(words).toContain("Audit result recorded Waived");
    expect(words).not.toContain("Checked against");
  });
});
