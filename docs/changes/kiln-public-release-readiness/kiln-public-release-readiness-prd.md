# PRD: Kiln public release readiness

**Source:** Doug's request, 2026-11-03, after a readiness audit of `develop` at `1b8cc28` ahead of the first public npm release.
**Assumptions:** [kiln-public-release-readiness-assumptions.md](kiln-public-release-readiness-assumptions.md)

## Summary

Get Kiln ready to publish to npm and to make its repository public. Kiln must keep working as Claude Code and Codex release new versions, a person typing `kiln --help` must see a short guide rather than a bot reference, and the package and repository must look like a finished open source project. CI must be green on the release candidate, with the expensive macOS and Windows checks run once at the end. The release itself, merging to `main`, publishing and making the repository public, stays a separate step Doug approves.

## Business Context

Kiln works and has been used on real projects, but a readiness audit on 2026-11-03 found gaps between "works on Doug's Mac" and "ready for strangers to install".

The most serious is version pinning. Two features only turn on for one exact Claude Code version: billing details for Claude Code 2.1.307 with Agent SDK 0.3.310, and live messaging and takeover for Claude Code 2.1.311. Claude Code is already at 2.1.317 and updates itself automatically, so every new public user would silently lose both. Claude Code and Codex both ship new versions every few days. Kiln has to keep up with them on its own, or it breaks for everyone a week after each release.

The rest is what a public user meets in the first five minutes, or what the release itself needs:

- `kiln --help` lists 30 commands with `run` in seventeenth place, mixed in with helpers only agents call, and there is no `kiln --version`.
- The npm package has no homepage, issue link, keywords or author, and over a third of its 4.7 MB is source maps pointing at files it doesn't ship.
- The repository has no CONTRIBUTING, SECURITY or issue templates, and stale branches that would become public.
- The release guide describes how the bootstrap npm token was configured, including that it bypasses two-factor authentication and the name of the vault record it is stored in.
- The website and documentation disagree with the code about the Codex and Node versions Kiln needs.
- Develop CI fails on unrelated timing flakes more often than it passes. The full macOS and Windows candidate checks haven't run since 2026-10-25.

Doug decided on 2026-11-03 to keep the repository's git history as it is when it goes public. The history holds chat identifiers, quoted authorizations and the earlier text of the release guide, none of them secrets. Rewriting history can't fully remove them, because GitHub keeps pull request #1's commits reachable, and moving to a new repository would lose the history. Only the current files are cleaned.

## Terms

- **Agent:** the AI coding tool Kiln runs sessions with, Claude Code or Codex. **Agent tooling** is any program a person installs that Kiln needs in order to run an agent: the Claude Code and Codex command line programs, and PowerShell where Codex on Windows needs it.
- **Minimum version:** the oldest agent tooling version Kiln supports, stated in the README. Anything at or above it is supported.
- **Kiln's own dependencies:** the npm packages installed with Kiln, such as the Claude Agent SDK. npm installs them, not the person.
- **Release candidate:** the `develop` commit intended to become `main` for the release.
- **Candidate checks:** the full macOS verification with installation of the candidate package, plus Windows build and pack, which CI runs for changes headed to `main`.

## Acceptance Criteria

### Kiln keeps working as Claude Code and Codex update

Claude Code and Codex release often and update themselves. Kiln must work with whatever version a person has, as long as it meets a stated minimum, and must never switch a feature off just because the version is newer than the one Kiln was tested with. This is a standing rule for all of Kiln, not only for the features that break it today.

- [ ] **AC-AGENT-01 — Only minimum versions, never exact ones.** No Kiln feature, start check, billing check, live control, test tier or proof tool requires an exact agent tooling version, or refuses a version because it is newer than one Kiln was tested with. Each requirement is a minimum version, and every version above it is accepted. This applies to every Kiln feature added later. Kiln's own dependencies keep ordinary compatible ranges (up to the next major version), and no feature requires one exact installed version of them. A test may pin a dependency to replay a recorded contract, as long as it isn't the only proof that a feature works on newer versions.
- [ ] **AC-AGENT-07 — New fields are ignored, not fatal.** Kiln ignores fields, settings and events in agent output that it doesn't use. Only a missing or changed piece of information that a Kiln feature actually needs counts as an incompatibility (AC-AGENT-04).
- [ ] **AC-AGENT-02 — Billing details work on current Claude Code.** On every supported Claude Code version, with any Agent SDK version Kiln's package accepts, Kiln shows the same billing details it shows on 2.1.307 today: the confirmed subscription and account email, a detected override with its approval requirement, and the paid overflow notice. Kiln confirms a subscription only from settings and credential information it recognises. Anything it doesn't recognise leads to the neutral **Claude Code settings** summary (AC-BILL-02 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md`), never to **Claude subscription**. The version number alone never causes that fallback (PUB-003).
- [ ] **AC-AGENT-03 — Live messaging and takeover work on current Claude Code.** **Message Claude**, `kiln message`, **Pause & take over** and `kiln take-over` are available on every supported Claude Code version on macOS, not only on 2.1.311. Kiln still asks Claude Code to take each message as plain text, but it can't guarantee how a newer Claude Code handles a message. That risk is accepted (PUB-004).
  - Replaces in part: AC-MSG-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a message reaching Claude literally is best effort above the tested version, not a guarantee)
- [ ] **AC-AGENT-04 — A real incompatibility is reported, not hidden.** When a feature finds the agent information it needs missing or in a form Kiln doesn't recognise, that feature is marked unavailable. The browser view and `kiln status` name the feature and the agent version, and the rest of the run keeps working. Billing is the exception that stays as it is: unrecognised billing information follows AC-BILL-02, as in AC-AGENT-02.
- [ ] **AC-AGENT-05 — Minimums are chosen, enforced and stated.** Each minimum is the oldest version on which every Kiln feature has been proven. Today that is Claude Code 2.1.311, where live control was proven (the technical design confirms billing details there too), Codex 0.162.1, Node.js 22.15 and Git 2.29. `kiln run`'s start checks report any of these below its minimum, naming the minimum and how to update. The README's requirements state the same minimums.
- **AC-AGENT-06 — Retired 2026-11-03.** Release testing on the newest agents is not an acceptance criterion. Doug tests the published release himself before announcing it (PUB-001; see Out of Scope).

### `kiln --help` works for people and for bots

People who type `kiln --help` want to know how to start. Bots such as a phone assistant need the complete reference. Both come from the same help. The bot control requirements in `kiln-bot-control` still hold, except that top-level text help no longer lists every helper.

- [ ] **AC-HELP-01 — Top-level help is a short guide.** `kiln --help` fits on one terminal screen of 40 lines or fewer. It opens with how to start (`kiln run <PRD-path>`) and how to see what's running (`kiln status`). It groups the remaining commands by what a person wants to do, such as answering a stopped phase or pausing. Helpers that Kiln's own sessions call are collapsed under one line saying they are used by Kiln's sessions.
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (top-level text help only; `kiln --help --json` and per-command help keep the full list)
- [ ] **AC-HELP-02 — Bots lose nothing.** `kiln --help --json` and `kiln <command> --help` keep their complete metadata, examples and error meanings, listing every command including the helpers. The top-level text help points bots at `kiln --help --json` in one sentence, replacing the current bot guidance paragraph.
- [ ] **AC-HELP-03 — `kiln --version` prints the version.** `kiln --version` and `kiln -v` print the installed package version and exit successfully, with no controller, Git repository or sign-in required.
- [ ] **AC-HELP-04 — Usage errors show only what's relevant.** `kiln run` without a path prints the usage of `kiln run` alone, not of other commands.

### The npm package is complete and lean

The package page on npm is the first thing many people see, and the install should carry only what runs.

- [ ] **AC-PKG-01 — The package page links home.** The packed package lists Kiln's website (`https://ensomethod.org/kiln/`) as its homepage, the GitHub issues page as where to report bugs, Enso Dynamics with doug@ensodynamics.com as author, matching the license holder, and keywords that let people find it searching for Claude Code, Codex, AI agents and the Enso Method.
- [ ] **AC-PKG-02 — The package ships no source maps.** The package contains no `.map` files, and its JavaScript carries no references to source maps.
- [ ] **AC-PKG-03 — A local build packs only current files.** Building Kiln removes output left over from earlier builds, so a package packed on a developer's machine contains exactly what a clean CI build would.

### The repository is ready to be public

Someone landing on the GitHub repository should see how to use Kiln, how to report problems, and what kind of contributions to expect. Nothing in the current files should expose how release credentials are handled.

- [ ] **AC-REPO-01 — Contribution expectations are clear.** The repository has a CONTRIBUTING file with the same position as the Enso Method's: forks are welcome, issues and feedback are welcome, and pull requests are generally not accepted, with the reason. The README links to it.
- [ ] **AC-REPO-02 — Security issues have a private route.** The repository has a SECURITY file directing suspected vulnerabilities to doug@ensodynamics.com rather than a public issue, saying what to include, and stating that the latest published version is the supported one, with no guaranteed response time.
- [ ] **AC-REPO-03 — Issues arrive with what's needed.** New issues offer a bug report form, asking for the Kiln version, agent and version, operating system, what happened and what was expected, and a feedback or question form. Opening a pull request shows a note that pull requests are generally not accepted and links CONTRIBUTING.
- [ ] **AC-REPO-04 — The GitHub page describes Kiln.** The repository's description, website link and topics describe Kiln and link to `https://ensomethod.org/kiln/`.
- [ ] **AC-REPO-05 — Only live branches remain.** Every branch on GitHub other than `main` and `develop` that is already merged, equivalent to work on `develop`, or abandoned is deleted. `feature/ui-clarity` and the unmerged `wt/completiona-kiln-design` fix are abandoned. `develop` already solves the latter's problem with `kiln:reference` links, and the former is too far behind to merge with confidence. Their local branches and worktrees are removed once no session is using them.
- [ ] **AC-REPO-06 — The release guide describes the process, not the credentials.** The release guide and readiness review say that publication uses a scoped npm token kept in the maintainer's password manager until trusted publishing replaces it. They don't describe the token's two-factor setting, expiry date, or the name or location of its vault record. Quoted chat authorizations and chat identifiers elsewhere in the documents may stay.
- [ ] **AC-REPO-07 — The candidate's files and package are checked before release.** On the release candidate, a secret scan and a scan for client names, personal paths and private credentials cover every tracked file and the full git history. The packed package's file list is inspected. Findings are fixed or accepted by Doug, and the results are recorded in this change's directory.

### Every public description matches the code

People decide whether Kiln will work for them from the README and the website. Version numbers and requirements there must be the ones the code enforces.

- [ ] **AC-SYNC-01 — Stated requirements match enforced requirements.** The README and the source of the Kiln page on ensomethod.org (in the `enso-method-website` repository) state the same minimum Node.js, Git, Claude Code and Codex versions that Kiln's start checks enforce, and describe the same platform support (macOS validated, Linux and Windows best effort). Each version requirement, including those in the README's development instructions, is worded as a minimum ("or later"), never as an exact version.
- [ ] **AC-SYNC-02 — Feature claims match supported versions.** The website's description of answering Kiln from a phone, and the README's description of live messaging, are true for every Claude Code version at or above the stated minimum on macOS.

### A green candidate, without a CI rewrite

The release needs a candidate whose checks pass. Making the whole test suite immune to timing on shared CI runners isn't part of this release, and a test that fails once and passes on rerun doesn't block it.

- [ ] **AC-CI-01 — Only low-risk test fixes.** Tests that listen on fixed network ports use ports the operating system assigns, so two tests can't collide. Other intermittent failures are fixed in this change only when the cause is understood and the fix is confined to test code. Product timeouts and deadlines don't change to make a test pass.
- [ ] **AC-CI-02 — The candidate's CI is green.** The release candidate's development CI ends green: every job and test passes. A failed job may be rerun, and the candidate counts as green once a run ends with everything passing (validated 2026-11-03). Every test that needed a rerun is listed with its failure in this change's directory.
- [ ] **AC-CI-03 — The expensive checks run once, last.** After every other criterion here is met, the candidate checks run once on the release candidate, started deliberately rather than on every push, and end green under the same rule as AC-CI-02. Opening the release pull request into `main` only at this point counts as starting them deliberately.

### Release notes are ready

The first GitHub Release will be many people's introduction to Kiln, and automatically generated notes would be nearly empty.

- [ ] **AC-NOTES-01 — 1.0.0 has written release notes.** Release notes for 1.0.0 say what Kiln is, how to install it, what it requires and where to report problems. The release workflow is set up to publish them on the GitHub Release instead of generating notes, shown by the workflow definition and by the release pull request's checks, which find the notes and stop before publishing.
- [ ] **AC-NOTES-02 — No release goes out without notes.** Every release version needs written notes. The release preflight rejects a version that has none, before the expensive platform checks start, and the release guide says where the notes go.

## Out of Scope

- **The release act:** merging to `main`, enabling publication, publishing to npm, creating the version tag, making the repository public, turning on branch protection, and deploying and listing the website page. Each needs Doug's explicit approval at release time, under `AGENTS.md` and the release guide.
- **Testing the published release.** Once CI is green, the release goes to `main` and npm without being announced. Doug tests that published version himself, and anything wrong is fixed in a patch release before anyone is told Kiln is live (decided 2026-11-03).
- **Rewriting git history** or moving to a new repository.
- **Making the full test suite reliable on shared runners**, beyond AC-CI-01.
- **The `feature/ui-clarity` interface ideas** (check explanations, bounded messages). Any that still matter come back as new feedback once Kiln is in use.
- **Native Linux and Windows validation**, which stays best effort under AC-INSTALL-03 in `docs/prds/kiln-v1/kiln-v1-prd.md`.
