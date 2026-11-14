// Documents found rendered to HTML from the mockup's sample data (docs/design/mockups/
// kiln-screen-documents-found.html): its copy, structure and the classes that carry its colors.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundRepositoriesSnapshot, documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";

const config = { token: "t", base: "/customer-returns" };
/** The rendered markup, without Svelte's hydration comments. */
const html = (snapshot = documentsFoundSnapshot(), connected = true) => render(DocumentsFound, { props: { snapshot, config, connected } }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("Documents found", () => {
  it("labels the repository and the PRD folder above the feature name, the page's one h1 (AC-LOOK-02, AC-LOOK-05)", () => {
    const page = html();
    expect(text(page)).toContain("Repository acme-shop PRD folder docs/prds/customer-returns/ Customer returns Not started Review what Kiln found and how it will deliver, then start.");
    expect(page.match(/<h1/g)).toHaveLength(1);
  });

  it("shows what Kiln found beside the PRD, and the checks as passed (AC-START-04)", () => {
    const words = text(html());
    for (const line of [
      "PRD customer-returns-prd.md 14 acceptance criteria, AC-RET-01 to AC-RET-14",
      "Technical design technical-design.md Cites all 14 criteria",
      "Assumptions assumptions.md 11 assumptions, 2 not yet confirmed. They’re green lights; nothing waits on them.",
      "Phase plan 6 phase docs 5 phases to implement, in this order",
      "1 Return intake 2 Refund routing split into 2a and 2b 2a Card refunds 2b Store credit 3 Returns dashboard 4 Restock check-in",
      "Every phase cites its criteria Dependencies point backward Working tree is clean",
    ]) {
      expect(words).toContain(line);
    }
  });

  it("keeps each phase's number in its circle and its title word for word, marking a closed one in green (AC-LOOK-03, UI-010 item 12)", () => {
    const base = documentsFoundSnapshot();
    const plan = { ...base.documents!.plan!, closedCount: 1, phases: base.documents!.plan!.phases.map((phase) => (phase.id === "1" ? { ...phase, closed: true } : phase)) };
    const page = html(documentsFoundSnapshot({ documents: { plan } }));
    expect(page).toMatch(/<span class="circle mono[^"]*">1<\/span><span class="title[^"]*">Return intake<\/span><span class="closed[^"]*">closed<\/span>/);
    expect(page).toMatch(/<span class="circle dashed mono[^"]*">2<\/span>/);
    expect(text(page)).toContain("4 phases to implement, in this order · 1 already closed");
  });

  it("shows the settings, the account and the fixed delivery facts (AC-START-06)", () => {
    const page = html();
    expect(page).toMatch(/<input id="worktree"[^>]*value="~\/devel\/acme-shop-kiln\/customer-returns"/);
    expect(page).toMatch(/<input id="branch"[^>]*value="feature\/customer-returns"/);
    expect(page).toMatch(/<option value="develop"[^>]*>develop<\/option><option value="main"[^>]*>main<\/option>/);
    expect(page).toMatch(/<option value="opus"[^>]*>Opus 5\.5<\/option><option value="fable"[^>]*>Fable 5\.1<\/option><option value="sonnet"[^>]*>Sonnet 5\.5<\/option>/);
    const words = text(page);
    expect(words).toContain("Agent Claude Code Codex alex@acme-shop.dev · Max plan Used: 5-hour 13% · weekly 22% · Fable 0%");
    expect(words).toContain("Effort Low Medium High Extra high Max");
    expect(page).toMatch(/aria-pressed="true"[^>]*>High</);
    expect(words).toContain("Keep this computer awake while a session works or Kiln waits Stops idle sleep only. Closing a laptop’s lid can still put it to sleep; Kiln picks up where it left off afterwards.");
    expect(words).toContain("Pushes After every phase Ends at One PR, ready for review. Kiln won’t merge.");
  });

  it("shows what Kiln may and may not do, next to Start (AC-START-08)", () => {
    expect(text(html())).toContain(
      "Starting lets Kiln Commit and push to feature/customer-returns Open one pull request into develop once every phase closes Never merge, deploy, or touch other branches Start Confirm refinement to start.",
    );
  });

  it("names the branches the person chose in what Kiln may do", () => {
    const words = text(html(documentsFoundSnapshot({ settings: { featureBranch: "feature/returns-v2", baseBranch: "main" } })));
    expect(words).toContain("Commit and push to feature/returns-v2 Open one pull request into main once every phase closes");
  });

  it("says Kiln can't tell the documents were refined, and asks the person to confirm (AC-START-05)", () => {
    const page = html();
    expect(text(page)).toContain("Kiln can’t tell from the files whether these documents went through requirements refinement; that workflow deletes its working file when it finishes. These documents have been through requirements refinement");
    expect(page).toMatch(/<input id="refined" type="checkbox"/);
    expect(page).toMatch(/<button type="button" class="start[^"]*" disabled/);
  });

  it("shows each field message under its field in amber, and git's error under Start", () => {
    const page = html(
      documentsFoundSnapshot({
        settings: {
          fieldErrors: { worktreePath: "That folder already exists and isn’t empty. Choose a new one.", baseBranch: "develop isn’t on origin.", model: "Opus 5.5 can’t run unattended on this account; it needs auto mode." },
          modelListError: "Couldn’t load Claude Code’s models: timed out",
          keepAwakeError: "Can’t keep this computer awake: systemd-inhibit isn’t available.",
        },
        documents: { startError: "Couldn’t set up the worktree: fatal: could not create directory" },
      }),
    );
    for (const message of [
      "That folder already exists and isn’t empty. Choose a new one.",
      "develop isn’t on origin.",
      "Opus 5.5 can’t run unattended on this account; it needs auto mode.",
      "Couldn’t load Claude Code’s models: timed out",
      "Can’t keep this computer awake: systemd-inhibit isn’t available.",
      "Couldn’t set up the worktree: fatal: could not create directory",
    ]) {
      expect(page).toMatch(new RegExp(`<span class="message[^"]*">${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`));
    }
  });

  it("shows no effort controls for a model that takes none", () => {
    const page = html(documentsFoundSnapshot({ settings: { model: { value: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" }, effortLevels: [] } }));
    expect(page.match(/aria-pressed="true"/g)).toBeNull();
    expect(page.match(/<button type="button" aria-pressed=/g)).toBeNull();
    expect(text(page)).toContain("This model takes no effort setting.");
  });

  it("shows the not-signed-in line in place of the account and usage", () => {
    const page = html(documentsFoundSnapshot({ account: { startedAt: "", updatedAt: "", limits: [], error: "Not signed in to Claude Code. Run `claude auth login`." } }));
    const words = text(page);
    expect(words).toContain("Agent Claude Code Codex Not signed in to Claude Code. Run claude auth login . Model");
    // The command is drawn as code, not with its backticks (UI-010 item 7).
    expect(page).toMatch(/Run <span class="code-inline">claude auth login<\/span>\./);
  });
});

describe("Documents found across repositories (multi-repo AC-REPO-03, AC-SPACE-01, AC-PRS-04)", () => {
  const sessionsAdd = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";

  it("names each phase's repositories, and the checks that name the PRD's repository", () => {
    const words = text(html(documentsFoundRepositoriesSnapshot()));
    expect(words).toContain("2 Refund routing split into 2a and 2b returns-api 2a Card refunds returns-api 2b Store credit returns-api · storefront 3 Returns dashboard storefront");
    expect(words).toContain("Every phase cites its criteria Dependencies point backward Named repositories found beside product Working tree of product is clean");
  });

  it("asks for the workspace folder, one feature branch, and a base for each repository, the PRD's marked", () => {
    const page = html(documentsFoundRepositoriesSnapshot());
    expect(page).toMatch(/<input id="workspace"[^>]*value="~\/devel\/acme\/\.worktrees\/customer-returns\/"/);
    expect(page).not.toMatch(/id="worktree"/);
    expect(page).toMatch(/<select id="base-product"[^>]*>[\s\S]*?<option value="main"[^>]*>main<\/option><\/select>/);
    expect(page).toMatch(/<select id="base-returns-api"[^>]*>[\s\S]*?<option value="develop"[^>]*>develop<\/option><option value="main"[^>]*>main<\/option><\/select>/);
    const words = text(page);
    expect(words).toContain("Feature branch Used in every repository. Repositories Branch from, and PR into product PRD’s repository main returns-api develop main storefront develop main");
    expect(words).toContain(`${sessionsAdd} Sessions follow each repository’s CLAUDE.md, but not its .claude/settings.json or hooks.`);
    expect(words).toContain("Ends at One PR in each repository that changed, ready for review. Kiln won’t merge.");
    expect(words).toContain(
      "Starting lets Kiln In each repository, commit and push to feature/customer-returns In each repository, open one pull request into its base branch once every phase closes Never merge, deploy, or touch other branches",
    );
  });

  it("shows each repository's base message under its row, and the workspace folder's under its field", () => {
    const snapshot = documentsFoundRepositoriesSnapshot();
    snapshot.settings.fieldErrors = { workspaceFolder: "That folder is inside a checkout of returns-api. Choose one outside it." };
    snapshot.repositories[2] = { ...snapshot.repositories[2]!, fieldErrors: { baseBranch: "Couldn’t reach origin: timed out" } };
    const page = html(snapshot);
    expect(page).toMatch(/<input id="workspace"[^>]*\/?>\s*<span class="message[^"]*">That folder is inside a checkout of returns-api\. Choose one outside it\.<\/span>/);
    expect(page).toMatch(/<select id="base-storefront"[\s\S]*?<\/select>\s*<span class="message row-message[^"]*">Couldn’t reach origin: timed out<\/span>/);
  });

  it("shows what a partly failed Start set up as fixed, and leaves a repository not yet set up editable", () => {
    const snapshot = documentsFoundRepositoriesSnapshot();
    snapshot.settings.fixed = { workspaceFolder: true, featureBranch: true, worktreePath: true };
    snapshot.repositories = snapshot.repositories.map((row) => (row.name === "storefront" ? row : { ...row, fixed: true }));
    const page = html(snapshot);
    for (const id of ["workspace", "branch", "base-product", "base-returns-api"]) expect(page).toMatch(new RegExp(`id="${id}"[^>]* disabled`));
    expect(page).not.toMatch(/id="base-storefront"[^>]* disabled/);
  });

  it("adds the sessions-can-add line to a one-repository PRD, without the CLAUDE.md line (multi-repo AC-SPACE-03)", () => {
    const words = text(html());
    expect(words).toContain(`Branch from, and PR into develop main ${sessionsAdd} Agent`);
    expect(words).not.toContain("CLAUDE.md");
    expect(words).not.toContain("Workspace folder");
  });
});
