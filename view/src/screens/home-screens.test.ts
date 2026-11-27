// The home screen as the page shows it (Kiln Requirements Stages AC-HOME-01 to 06, 09, 11, 12;
// mockups 1, 2 and 3), and the screen before Start for a PRD started by hand (AC-BEGIN-04,
// AC-BEGIN-08; mockup 15). The lists themselves are proved in src/home/home.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { HomeList } from "../../../src/home/home.js";
import type { HomeItem } from "../../../src/home/scan.js";
import type { RequirementsView, Snapshot } from "../../../src/engine/snapshot.js";
import { runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import Home from "./Home.svelte";
import Requirements from "./Requirements.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
const item = (title: string, change: Partial<HomeItem> = {}): HomeItem => ({ id: `acme-shop:${title}`, repository: "acme-shop", checkout: "/x/acme-shop", title, path: `docs/prds/${title}`, where: `docs/prds/${title}/`, line: "", alsoChanges: [], ...change });
const list = (change: Partial<HomeList> = {}): HomeList => ({
  scope: { kind: "repository", name: "acme-shop", sharedBranch: "develop", repositories: ["acme-shop"], nothingFound: [] },
  plan: { status: "read" },
  underWay: [
    item("Purchase approvals", { state: "waiting_for_you", waitsForYou: true, line: "Requirements. The early stakeholder review has been ready since 12:47 PM." }),
    item("Customer returns", { state: "working", line: "Build. 2 of 5 phases done.", alsoChanges: ["acme-admin"] }),
    item("Wholesale invoices", { state: "unreadable", line: "Build. 2 of 3 phases done. Kiln couldn't read its state. Its Kiln is at http://127.0.0.1:4321/wholesale-invoices." }),
    item("Return labels", { state: "not_running", startedByHand: true, branch: "prd/return-labels", line: "Started by hand, on the branch prd/return-labels, not merged yet. PRD written, no technical design yet." }),
  ],
  ready: [
    item("Gift card balance lookup", { kind: "brief", where: "source-material/gift-card-balance/gift-card-balance-brief.md" }),
    item("Loyalty program: Redemption", { kind: "planned_prd", line: "Its build waits for Points earning.", buildWaitsFor: ["Points earning"] }),
  ],
  notReady: [item("Email digest", { line: "A brief not yet committed on develop. Commit it there and it moves up." })],
  folded: [item("Saved addresses", { startedByHand: true, line: "PRD written, no technical design yet. Last changed 18 Nov." })],
  ...change,
});
const page = (shown: HomeList) => text(render(Home, { props: { config: { token: "t", base: "/home" }, initial: shown } }).body);

it("lists what is under way first with each Kiln's state, then what is ready and not ready, the quieter PRDs folded, and how to bring material in", () => {
  const shown = page(list());
  expect(shown).toContain("Repository acme-shop · Shared branch develop What are we building?");
  expect(shown.indexOf("Under way")).toBeLessThan(shown.indexOf("Ready to start"));
  expect(shown).toContain("Purchase approvals docs/prds/Purchase approvals/ Requirements. The early stakeholder review has been ready since 12:47 PM. Waiting for you Open");
  expect(shown).toContain("Customer returns docs/prds/Customer returns/ Build. 2 of 5 phases done. Also changes acme-admin. Working Open");
  expect(shown).toContain("Kiln couldn't read its state. Its Kiln is at http://127.0.0.1:4321/wholesale-invoices. State not read Open");
  expect(shown).toContain("not merged yet. PRD written, no technical design yet. Not running Review and continue");
  expect(shown).toContain("Gift card balance lookup Brief source-material/gift-card-balance/gift-card-balance-brief.md Review and start");
  expect(shown).toContain("Loyalty program: Redemption Planned PRD docs/prds/Loyalty program: Redemption/ Its build waits for Points earning. Review and start");
  expect(shown).toMatch(/Not ready yet One step from ready to start Email digest docs\/prds\/Email digest\/ A brief not yet committed on develop. Commit it there and it moves up. 1 PRDs/);
  expect(shown).toContain("1 PRDs with requirements but no phase plan Kiln can't tell from the files whether these were built by hand or left unfinished. Newest change first.");
  expect(shown).toContain("Not listed? Bring your source material in");
  expect(shown).toContain("Other folders in source-material/, such as a stakeholder's feedback, are not listed.");
  expect(shown).toContain("Use the Enso Method. I have source material for something new to build in this repository. Help me bring it into source-material/ the way the method describes, commit it on develop, and stop there. Kiln will take it from the PRD on. Copy prompt");
  expect(shown).toContain("Already know the folder? kiln run source-material/<name> opens it directly.");
});

it("across a folder of repositories, names each line's repository, filters by repository, and names those with nothing found (AC-HOME-09)", () => {
  const shown = page(list({
    scope: { kind: "folder", name: "acme", repositories: ["acme-admin", "acme-docs", "acme-infra", "acme-shop"], nothingFound: ["acme-docs", "acme-infra"] },
    underWay: [item("Supplier contacts", { repository: "acme-admin", state: "working" })],
  }));
  expect(shown).toContain("Folder acme/ · 4 repositories directly inside it");
  expect(shown).toContain("This folder is not a repository, so Kiln looked in each repository inside it.");
  expect(shown).toContain("All repositories 5 acme-admin 1 acme-shop 4 Nothing found in acme-docs or acme-infra");
  expect(shown).toContain("Supplier contacts acme-admin · docs/prds/Supplier contacts/");
  expect(shown).toContain("commit it on the shared branch, and stop there.");
  expect(shown).toContain("Open Claude Code or Codex in the repository this work belongs to.");
});

it("with nothing found, leads with bringing source material in and what each kind becomes (AC-HOME-11)", () => {
  const shown = page(list({ underWay: [], ready: [], notReady: [], folded: [] }));
  expect(shown).toContain("Kiln found no source material and no PRDs in this repository yet. It starts from source material, so that comes first.");
  expect(shown).toContain("Start here Bring your source material in");
  expect(shown).toContain("A brief What you want and why");
  expect(shown).toContain("Raw material Meeting transcripts");
  expect(shown).toContain("Something bigger More than one PRD's worth.");
  expect(shown).toContain("Already have a PRD somewhere else? kiln run <PRD folder> opens it at the stage it reached.");
  expect(shown).not.toContain("Under way");
});

it("before Start, a PRD started by hand shows where it stands, the branch holding it selected under Start from, and the Next stage first (AC-BEGIN-04, AC-BEGIN-08)", () => {
  const base = runningSnapshot();
  const requirements: RequirementsView = {
    origin: { kind: "prd", path: "docs/changes/return-labels", title: "Return labels", files: ["docs/changes/return-labels/return-labels-prd.md"], commit: "b83d1f6".padEnd(40, "0"), committedAt: "2026-11-27T14:05:00Z" },
    standsAt: "PRD written, no technical design yet",
    start: { from: "existing", branches: [{ name: "prd/return-labels", available: true }, { name: "feature/returns-spike", available: true }], previewId: "p", holds: "prd/return-labels" },
    plan: { status: "none", agent: "Claude Code", canReadAgain: true },
    rows: [{ key: "kiln:next", title: "Next stage", state: "next" }, { key: "build", title: "Build", state: "planned" }],
    feedback: [],
  };
  const snapshot: Snapshot = { ...base, feature: { ...base.feature, state: "not_started" }, requirements, settings: { ...base.settings, featureBranch: "prd/return-labels" } };
  const shown = text(render(Requirements, { props: { snapshot, config: { token: "t", base: "/return-labels" }, connected: true } }).body);
  expect(shown).toContain("Started by hand · PRD written, no technical design yet. Kiln continues from there, with the early review once the PRD is refined.");
  expect(shown).toContain("PRD return-labels-prd.md · committed b83d1f6 on prd/return-labels, not merged yet.");
  expect(shown).toContain("Start from");
  expect(shown).toContain("The branch that holds this PRD's documents and hasn't merged. Every stage and phase lands on it");
  expect(shown).toContain("The first session finds where the PRD stands and runs its next stage.");
  expect(shown).toContain("Continues from where the PRD stands, on prd/return-labels. Stops at the early review, and at the final review before the build.");
});
