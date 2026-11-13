# PRD: Kiln Newer Version Notice

**Source:** Doug's request on 2026-11-13: the browser view shows the running version, so it should also say when a newer Kiln is on npm and give the command to install it.

**Follow-on to:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Changes:** part of AC-INSTALL-02 in Kiln v1, which lists everything Kiln sends off the machine. Kiln now also asks npm for its own latest version.

## Summary

The top bar shows the version of Kiln that is running (Kiln v1, AC-LOOK-05). Nothing tells the person when that version is out of date, so someone who installed Kiln once can go on running an old version for months. After this change, Kiln asks npm for its latest published version each time it starts. When npm has a newer one, the top bar says so beside the running version and offers the command that installs it.

## Business Context

Kiln is installed once with `npm install -g` and never updates itself. Fixes ship often, and a person on an old version keeps running into problems that are already fixed. The version in the top bar only helps someone who already knows what the latest version is.

The notice has to stay out of the way. The top bar is on every screen, and Kiln's real warnings, such as Needs you, must stay louder than a reminder to upgrade. The notice also has to be right about what an upgrade does. Each run keeps the version it started with until it finishes (Kiln Upgrade While Running, AC-UPG-01), so installing doesn't change the run on screen.

A development build, such as Doug's own build from `develop`, is often newer than npm and never needs the notice.

The design reference is [the top bar mockup](mockups/kiln-newer-version-notice-top-bar.html).

## Acceptance Criteria

- [ ] **AC-NEWER-01 — Kiln checks npm once each time it starts, without slowing anything down.** Each time a `kiln` command starts the browser view, Kiln asks npm once for the latest published version of `@ensodynamics/kiln`. The view and every Kiln command go on as they do today without waiting for the answer. The notice appears whenever the answer arrives. Kiln asks again only the next time it starts.
- [ ] **AC-NEWER-02 — The notice appears only when npm has a newer release.** The top bar shows the notice only when the running Kiln is a release build and the latest version on npm is strictly newer than it. A development build never asks npm and never shows the notice, whatever the versions. When npm can't be reached, takes more than a few seconds to answer or answers with something Kiln can't read, the top bar is as it is today, with no error.
- [ ] **AC-NEWER-03 — The notice is small, and the command shows only when asked for.** Beside the running version, as in `v1.1.6`, the top bar shows a small amber pill reading `v<latest> available`, such as `v1.2.0 available`. Selecting the pill opens a panel under it that names both versions (`Kiln v1.2.0 is out · you're on v1.1.6`) and shows the command `npm install -g @ensodynamics/kiln` with a button that copies it. Below the command, the panel says `This run keeps v1.1.6 until it finishes. The next run you start uses v1.2.0.` and links `What changed` to that version's release notes on GitHub, `https://github.com/EnsoDynamics/kiln/releases/tag/v1.2.0`. Selecting the pill again, pressing Escape, or selecting anywhere outside the panel closes it. The pill and panel follow the mockup.
- [ ] **AC-NEWER-04 — The check sends nothing of the person's.** The request to npm names only Kiln's package. It carries nothing Kiln handles: no repository, PRD, path, account or version of the person's.
  - Replaces in part: AC-INSTALL-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln's read of its own latest version from npm joins Kiln's reads from GitHub as the one other thing Kiln asks of a service).

## Out of Scope

- Updating Kiln automatically, or offering a button that installs it.
- Checking again while Kiln is running. A Kiln that stays up across a release shows the notice the next time it starts.
- A notice in the terminal.
- A setting that turns the check off.
- Prerelease versions. Only the version npm marks as latest counts.
- Installs from another package manager or another registry. The command shown is always the npm one.
