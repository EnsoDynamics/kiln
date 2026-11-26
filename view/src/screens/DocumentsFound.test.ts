// Documents found rendered to HTML from the mockup's sample data (docs/design/mockups/
// kiln-screen-documents-found.html): its copy, structure and the classes that carry its colors.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundRepositoriesSnapshot, documentsFoundSnapshot, findRepositoriesSnapshot } from "../../../src/test-support/sample-snapshots.js";
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
    // One line says models are chosen for each phase; no Agent, Model or Effort for the PRD (Kiln Phase Model Tiers AC-KEEP-01).
    expect(page).not.toMatch(/id="agent"|id="model"|aria-pressed=/);
    const words = text(page);
    // The delivery panel's model lines: per phase with the Model defaults link, the Audits choice, and the fallback (AC-DEFAULT-02, AC-OTHER-01, AC-FALLBACK-01).
    expect(words).toContain("Models Chosen for each phase 4 not rated. Change any phase in the phase plan. Model defaults Audits Claude Code · Opus 5.5 · high Change The preflight and the pull request session use it too. If usage is nearly out Wait for the limit No fallback is switched on. Set one up in Model defaults . alex@acme-shop.dev · Max plan Used: 5-hour 13% · weekly 22% · Fable 0%");
    expect(words).not.toContain("Effort");
    // Model defaults' table appears only on its own page, never here (AC-DEFAULT-02).
    expect(page).not.toMatch(/data-row=/);
    expect(words).not.toMatch(/First choice|Fallback Codex|Restore Kiln’s defaults|Restore Kiln's defaults/);
    expect(words).toContain("Keep this computer awake while a session works or Kiln waits Stops idle sleep only. Closing a laptop’s lid can still put it to sleep; Kiln picks up where it left off afterwards.");
    expect(words).toContain("Pushes After every phase Ends at One PR, ready for review. Kiln won’t merge.");
  });

  it("shows what Kiln may and may not do, next to Start (AC-START-08)", () => {
    expect(text(html())).toContain(
      "Starting lets Kiln Commit and push to feature/customer-returns Open one pull request into develop once every phase closes Merge the delivery’s pull requests only when you press Merge with Claude Code on the finished page Push this PRD’s documents to develop only when you press Continue on the finished page Never deploy or touch other branches Start Confirm refinement to start.",
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
    expect(page).toMatch(/<button type="button" class="start[^"]*"[^>]* disabled/);
  });

  it("shows each field message under its field in amber, and git's error under Start", () => {
    const snapshot = documentsFoundSnapshot({
      settings: {
        fieldErrors: { worktreePath: "That folder already exists and isn’t empty. Choose a new one.", baseBranch: "develop isn’t on origin." },
        models: { tiers: { demanding: 0, standard: 0, mechanical: 0, notRated: 4 }, problem: "Opus 5.5 can’t run unattended on this account; it needs auto mode.", fallback: { enabled: false, threshold: 95 }, audits: documentsFoundSnapshot().settings.models.audits, revision: "missing" },
        keepAwakeError: "Can’t keep this computer awake: systemd-inhibit isn’t available.",
      },
      documents: { startError: "Couldn’t set up the worktree: fatal: could not create directory" },
    });
    snapshot.agents[0]!.modelListError = "Couldn’t load Claude Code’s models: timed out";
    const page = html(snapshot);
    for (const message of [
      "That folder already exists and isn’t empty. Choose a new one.",
      "develop isn’t on origin.",
      "Opus 5.5 can’t run unattended on this account; it needs auto mode.",
      "Couldn’t load Claude Code’s models: timed out",
      "Can’t keep this computer awake: systemd-inhibit isn’t available.",
    ]) {
      expect(page).toMatch(new RegExp(`<span class="message[^"]*">${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`));
    }
  });

  it("draws a failed setup as Can't start beside the button (run restart AC-FROM-06)", () => {
    const page = html(documentsFoundSnapshot({ documents: { startError: "Couldn’t set up the worktree: fatal: could not create directory" } }));
    expect(page).toMatch(/<div class="cant-start[^"]*" role="alert"><strong[^>]*>Can’t start<\/strong><span[^>]*>Couldn’t set up the worktree: fatal: could not create directory<\/span><\/div>/);
    expect(page).not.toContain('class="paused');
  });

  it("names a failed start check in Can't start beside the unavailable button, not as a grey note (run restart AC-FROM-06)", () => {
    const failed = "The checkout ~/acme-shop has uncommitted changes in 1 file: notes.txt";
    const page = html(documentsFoundSnapshot({ documents: { checksFailed: true, checks: [{ name: "Every phase cites its criteria", passed: true }, { name: failed, passed: false, text: failed }] } }));
    expect(text(page)).toContain(`Can’t start ${failed}. Fix that, then reload this page.`);
    expect(page).toMatch(/<div class="cant-start[^"]*" role="alert"><strong[^>]*>Can’t start<\/strong>/);
    expect(page).toMatch(/<button type="button" class="start[^"]*"[^>]* disabled[^>]*>Start<\/button>/);
    expect(text(page)).not.toContain("Fix what failed, then reload.");
  });

  it("draws no Can't start box while nothing needs fixing", () => {
    expect(html()).not.toContain('class="cant-start');
    expect(text(html())).toContain("Confirm refinement to start.");
  });

  it("shows the not-signed-in line in place of the account and usage", () => {
    const snapshot = documentsFoundSnapshot();
    snapshot.agents[0]!.account = { startedAt: "", updatedAt: "", limits: [], error: "Not signed in to Claude Code. Run `claude auth login`." };
    const page = html(snapshot);
    const words = text(page);
    expect(words).toContain("Set one up in Model defaults . Not signed in to Claude Code. Run claude auth login . Listed models");
    // The command is drawn as code, not with its backticks (UI-010 item 7).
    expect(page).toMatch(/Run <span class="code-inline">claude auth login<\/span>\./);
  });
});

describe("Documents found across repositories (multi-repo AC-REPO-03, AC-SPACE-01, AC-PRS-04)", () => {
  const sessionsAdd = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";

  it("names each phase's repositories, and the checks that name the PRD's repository", () => {
    const words = text(html(documentsFoundRepositoriesSnapshot()));
    expect(words).toContain("2 Refund routing split into 2a and 2b returns-api 2a Card refunds returns-api 2b Store credit returns-api · storefront 3 Returns dashboard storefront");
    expect(words).toContain("Every phase cites its criteria Dependencies point backward Repositories found on this computer Working tree of product is clean");
  });

  it("asks for the workspace folder, one feature branch, and a base for each repository, the PRD's marked", () => {
    const page = html(documentsFoundRepositoriesSnapshot());
    expect(page).toMatch(/<input id="workspace"[^>]*value="~\/devel\/acme\/\.worktrees\/customer-returns\/"/);
    expect(page).not.toMatch(/id="worktree"/);
    expect(page).toMatch(/<select id="base-product"[^>]*>[\s\S]*?<option value="main"[^>]*>main<\/option><\/select>/);
    expect(page).toMatch(/<select id="base-returns-api"[^>]*>[\s\S]*?<option value="develop"[^>]*>develop<\/option><option value="main"[^>]*>main<\/option><\/select>/);
    const words = text(page);
    expect(words).toContain("Feature branch Used in every repository. Repositories Branch from, and PR into product PRD’s repository acme/product · ~/devel/acme/product main returns-api acme/returns-api · ~/devel/acme/returns-api develop main storefront acme/storefront · ~/devel/acme/storefront develop main");
    expect(words).toContain(`${sessionsAdd} Sessions follow each repository’s CLAUDE.md, but not its .claude/settings.json or hooks.`);
    expect(words).toContain("Ends at One PR in each repository that changed, ready for review. Kiln won’t merge.");
    expect(words).toContain(
      "Starting lets Kiln In each repository, commit and push to feature/customer-returns In each repository, open one pull request into its base branch once every phase closes Merge the delivery’s pull requests only when you press Merge with Claude Code on the finished page In the PRD’s repository, push this PRD’s documents to main only when you press Continue on the finished page Never deploy or touch other branches",
    );
  });

  it("shows each repository's base message under its row, and the workspace folder's under its field", () => {
    const snapshot = documentsFoundRepositoriesSnapshot();
    snapshot.settings.fieldErrors = { workspaceFolder: "That folder is inside a checkout of returns-api. Choose one outside it." };
    snapshot.repositories[2] = { ...snapshot.repositories[2]!, fieldErrors: { baseBranch: "Couldn’t reach origin: timed out" } };
    const page = html(snapshot);
    expect(page).toMatch(/<input id="workspace"[^>]*\/?>\s*<span class="message[^"]*">That folder is inside a checkout of returns-api\. Choose one outside it\.<\/span>/);
    expect(page).toMatch(/<select id="base-storefront"[\s\S]*?<\/select>(?:\s*<!---->)*\s*<\/div>\s*<span class="message row-message[^"]*">Couldn’t reach origin: timed out<\/span>/);
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
    expect(words).toContain(`Branch from, and PR into develop main ${sessionsAdd} Models`);
    expect(words).not.toContain("CLAUDE.md");
    expect(words).not.toContain("Workspace folder");
  });
});

describe("Documents found finding repositories anywhere (docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html, states 1 to 4)", () => {
  const words = (state: 1 | 2 | 3 | 4) => text(html(findRepositoriesSnapshot(state)));

  it("state 1: each row shows its address path and the folder its checkout is in, and the check reads Repositories found on this computer (AC-SEE-01)", () => {
    const page = words(1);
    expect(page).toContain("Review what Kiln found and how it will deliver, then start.");
    expect(page).toContain("Dependencies point backward Repositories found on this computer Working tree of product is clean");
    expect(page).toContain("product PRD’s repository acme/product · ~/code/acme/product main returns-api acme/returns-api · ~/code/acme/returns-api develop main storefront acme-labs/storefront · ~/code/acme-labs/storefront develop main");
    expect(page).not.toContain("You told Kiln where this is");
    expect(page).toContain("Confirm refinement to start.");
  });

  it("state 2: the row asks where the repository is, with the field and its button, and Start says why it waits (AC-ASK-01, AC-ASK-03)", () => {
    const page = html(findRepositoriesSnapshot(2));
    const shown = text(page);
    expect(shown).toContain("Tell Kiln where one repository is, then review and start.");
    expect(shown).toContain("Dependencies point backward 1 repository to locate Working tree of product is clean");
    expect(shown).toContain("storefront acme-labs/storefront — Kiln couldn’t find a checkout of acme-labs/storefront . It searched outward from ~/code/acme/ , never above your home folder. Where is it on this computer? Use this folder Kiln remembers this on this computer only. Nothing is written to any repository.");
    expect(shown).toContain("Tell Kiln where acme-labs/storefront is to start.");
    // The note under Start is drawn amber while a row asks (AC-SEE-04).
    expect(page).toMatch(/<span class="[^"]*\basks\b[^"]*">Tell Kiln where acme-labs\/storefront is to start\.<\/span>/);
    expect(page).toMatch(/<span class="locate[^"]*"><svg[^>]*stroke="var\(--amber\)"/);
    expect(page).toMatch(/<select id="base-storefront"[^>]*disabled/);
  });

  it("state 2's field message and a checkout Kiln can't deliver to, listed and not pickable (AC-ASK-03, AC-FIND-03)", () => {
    const snapshot = findRepositoriesSnapshot(2);
    snapshot.repositories[2] = { ...snapshot.repositories[2]!, question: { ...snapshot.repositories[2]!.question!, fieldError: "That folder isn’t a Git checkout.", checkouts: [{ folder: "~/code/mirrors/storefront", remote: "git@git.example.com:acme-labs/storefront.git", pickable: false }], found: 1 } };
    const page = html(snapshot);
    expect(text(page)).toContain("Kiln couldn’t find a checkout of acme-labs/storefront that it can deliver to. It searched outward from ~/code/acme/ , never above your home folder. ~/code/mirrors/storefront git@git.example.com:acme-labs/storefront.git Not on GitHub. Kiln delivers only to GitHub. Where is it on this computer?");
    expect(page).toMatch(/<span class="message[^"]*">That folder isn’t a Git checkout\.<\/span>/);
    expect(page).toMatch(/<div class="option unpickable[^"]*">/);
  });

  it("two rows asking at once: each asks its own question, one searched only as far as a folder, and Start waits on both (AC-ASK-01)", () => {
    const snapshot = findRepositoriesSnapshot(2);
    const ledger = { ...snapshot.repositories[2]!, name: "ledger", label: "ledger", addressPath: "acme-labs/ledger", question: { kind: "where" as const, repository: "acme-labs/ledger", label: "ledger", searchedFrom: "~/code/acme", searchedTo: "~/code", checkouts: [], found: 0 } };
    snapshot.repositories.push(ledger);
    snapshot.settings = { ...snapshot.settings, startBlockedBy: "Tell Kiln where 2 repositories are to start." };
    snapshot.documents = { ...snapshot.documents!, checks: snapshot.documents!.checks.map((check) => (check.locate ? { ...check, name: "2 repositories to locate" } : check)) };
    const page = html(snapshot);
    const shown = text(page);
    expect(shown).toContain("Tell Kiln where two repositories are, then review and start.");
    expect(shown).toContain("Dependencies point backward 2 repositories to locate Working tree of product is clean");
    expect(shown).toContain("storefront acme-labs/storefront — Kiln couldn’t find a checkout of acme-labs/storefront . It searched outward from ~/code/acme/ , never above your home folder. Where is it on this computer?");
    expect(shown).toContain("ledger acme-labs/ledger — Kiln couldn’t find a checkout of acme-labs/ledger . It searched outward from ~/code/acme/ , as far as ~/code/ . Where is it on this computer?");
    expect(page).toMatch(/<span class="[^"]*\basks\b[^"]*">Tell Kiln where 2 repositories are to start\.<\/span>/);
    expect(page.match(/>Use this folder</g)).toHaveLength(2);
  });

  it("state 3: the row asks which checkout to use, lists both with their remote addresses, and picks neither (AC-ASK-02)", () => {
    const page = html(findRepositoriesSnapshot(3));
    const shown = text(page);
    expect(shown).toContain("Tell Kiln which checkout to use, then review and start.");
    expect(shown).toContain("Kiln found two checkouts of acme-labs/storefront . Which should it use? ~/code/acme-labs/storefront git@github.com:acme-labs/storefront.git ~/code/archive/storefront git@github.com:acme-labs/storefront.git Another folder Kiln remembers this on this computer only. Nothing is written to any repository. Use this checkout");
    expect(shown).toContain("Tell Kiln which checkout of acme-labs/storefront to use to start.");
    expect(page).toMatch(/<span class="[^"]*\basks\b[^"]*">Tell Kiln which checkout of acme-labs\/storefront to use to start\.<\/span>/);
    expect(page.match(/type="radio" name="checkout-acme-labs\/storefront"/g)).toHaveLength(3);
    expect(page).not.toMatch(/type="radio"[^>]*checked/);
    expect(page).toMatch(/<button type="button" class="use[^"]*" disabled[^>]*>Use this checkout<\/button>/);
  });

  it("state 3 with a checkout Kiln can't deliver to: listed with its remote address, said why, and given no radio (AC-FIND-03)", () => {
    const snapshot = findRepositoriesSnapshot(3);
    const question = snapshot.repositories[2]!.question!;
    snapshot.repositories[2] = { ...snapshot.repositories[2]!, question: { ...question, found: 3, checkouts: [...question.checkouts, { folder: "~/code/mirrors/storefront", remote: "git@git.example.com:acme-labs/storefront.git", pickable: false }] } };
    const page = html(snapshot);
    expect(text(page)).toContain("~/code/archive/storefront git@github.com:acme-labs/storefront.git ~/code/mirrors/storefront git@git.example.com:acme-labs/storefront.git Not on GitHub. Kiln delivers only to GitHub. Another folder");
    // The two on GitHub and Another folder; none for the mirror.
    expect(page.match(/type="radio" name="checkout-acme-labs\/storefront"/g)).toHaveLength(3);
    expect(page).not.toMatch(/type="radio"[^>]*value="~\/code\/mirrors\/storefront"/);
    expect(page.match(/<div class="option unpickable[^"]*">/g)).toHaveLength(1);
  });

  it("state 4: the row shows the folder the person gave, says so, and offers Change (AC-ASK-05)", () => {
    const page = html(findRepositoriesSnapshot(4));
    const shown = text(page);
    expect(shown).toContain("storefront You told Kiln where this is · Change acme-labs/storefront · /Volumes/work/storefront develop");
    expect(shown).toContain("Repositories found on this computer");
    expect(page).toMatch(/<button type="button" class="change[^"]*"[^>]*>Change<\/button>/);
  });

  it("state 4 on a page a reset built with a failing check: Change waits until a reload finds it passing (AC-ASK-01)", () => {
    const snapshot = findRepositoriesSnapshot(4);
    snapshot.documents = { ...snapshot.documents!, checksFailed: true };
    expect(html(snapshot)).toMatch(/<button type="button" class="change[^"]*" disabled[^>]*>Change<\/button>/);
  });
});

describe("two repositories with one short name (find repositories anywhere AC-FOLDER-02)", () => {
  it("shows each by its label, never Kiln's whole-path name for it, on the rows and the plan", () => {
    const snapshot = findRepositoriesSnapshot(1);
    snapshot.repositories = snapshot.repositories.map((row) => (row.name === "storefront" ? { ...row, name: "acme-labs+storefront", label: "acme-labs/storefront" } : row));
    snapshot.documents = { ...snapshot.documents!, plan: { ...snapshot.documents!.plan!, phases: snapshot.documents!.plan!.phases.map((phase) => ({ ...phase, repositories: phase.repositories.map((name) => (name === "storefront" ? "acme-labs/storefront" : name)) })) } };
    const page = html(snapshot);
    const shown = text(page);
    expect(shown).toContain("acme-labs/storefront acme-labs/storefront · ~/code/acme-labs/storefront");
    expect(shown).toContain("3 Returns dashboard acme-labs/storefront");
    expect(shown).not.toContain("acme-labs+storefront");
    // The base is still chosen under Kiln's name for it.
    expect(page).toMatch(/<select id="base-acme-labs\+storefront"/);
  });
});
