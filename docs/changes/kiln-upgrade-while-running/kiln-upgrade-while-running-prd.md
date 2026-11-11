# PRD: Kiln Upgrade While Running

**Source:** Doug's report on 2026-11-10 of a run that crashed at the start of its fourth delivery audit round with `Prompt placeholder {{outstanding}} has no value.` Kiln 1.1.1 had been installed over 1.1.0 at 11:57 AM EST, while that run was still going on 1.1.0.

**Follow-on to:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Changes:** none of Kiln v1's criteria. Kiln v1 says how Kiln is installed. It never says what happens to a run when a newer Kiln is installed while that run is still going.

## Summary

A run can last many hours, and several can run on one computer at once. Installing a new Kiln today changes the files under every run that is still going. Each run keeps the code it started with, but reads its prompts, helper scripts and browser view from the installed package as it needs them. It then mixes two versions and can crash. After this change, each installed version of Kiln runs from its own private copy. Installing a new version leaves every run that is still going on the version it started with. The new version is used by whatever starts after the install.

## Business Context

Kiln is installed with `npm install -g`. npm replaces the whole package folder with the new version. Nothing in Kiln today protects a run from that, so the only safe time to upgrade is when no run is going anywhere on the computer. With several long runs on one development box, that time may never come.

In the run that prompted this change, Kiln 1.1.0's code read Kiln 1.1.1's audit prompt. The newer prompt asked for a value the older code did not supply, and the run crashed between phases. Starting it again on 1.1.1 carried on correctly, but it could just as well have crashed partway through an agent's session. Any file Kiln reads after it starts can cause the same crash: prompt templates, the checkpoint hook, the helper scripts it starts, the browser view's files, its dependencies and the `kiln` command it gives agents to call.

## Acceptance Criteria

- [ ] **AC-UPG-01 — A run keeps its version when a new Kiln is installed.** When a newer Kiln is installed with `npm install -g` while a run is still going, that run carries on to the end on the version it started with. Its prompts, hooks, helper scripts, browser view and the `kiln` command its agents call all come from that version, apart from the Windows case in Out of Scope. The newly installed version is used by every `kiln` command started after the install.
- [ ] **AC-UPG-02 — A copy is only used when it is complete.** Kiln runs from a private copy of an installed version only when the copy is complete and matches what npm installed. When npm is installing or upgrading Kiln at the moment a `kiln` command starts, so that a complete copy can't be made, the command stops with a message saying Kiln is being installed or upgraded and to run the command again once that finishes. It never runs from a partial copy.
- [ ] **AC-UPG-03 — Old copies are cleaned up, never from under a run.** Kiln removes the private copy of a version once no Kiln process is using it and it hasn't been used for seven days, so copies don't pile up across upgrades. The version currently installed is never removed, and neither is a copy a run is still going on.
- [ ] **AC-UPG-04 — Nothing changes for a person typing commands.** `kiln` commands take the same arguments, print the same output and exit with the same codes as before. The first command after installing a new version takes a few seconds longer while Kiln makes that version's copy. Every later command starts as quickly as it did before.

## Out of Scope

- A Kiln built from a local checkout and linked with `npm link`, and a Kiln installed into a project rather than globally, run from their installed files as they do today. Rebuilding a linked checkout while one of its runs is still going can still mix versions.
- Commands of the new version run against a run still going on the old one, such as `kiln status` for that run, behave as they do today.
- On Windows, Kiln leaves a session's PATH alone, as it does today, so a bare `kiln add-repository` an agent types reaches the newly installed version. Everything else a run uses stays on its own version.
