# Kiln public release readiness — implementation phase plan

**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [Kiln public release readiness technical design](kiln-public-release-readiness-technical-design.md)
**Business assumptions:** [Kiln public release readiness assumptions](kiln-public-release-readiness-assumptions.md)

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Version minimums and tolerant readers](phase-1-version-minimums.md) | Replace exact agent version gates outside live control with stated minimums, keep billing approvals across updates, read newer Codex histories, and report incompatibilities as compatibility notices. | None |
| [2 — Live control on newer Claude Code](phase-2-live-control-newer-claude.md) | Offer Message Claude and Pause & take over on every supported Claude Code on macOS, turning each off with a notice when Kiln stops recognising what it reads, and guard against new exact pins. | 1 (the minimums module, version comparison and compatibility notices) |
| [3 — Public surface](phase-3-public-surface.md) | Give people a short `kiln --help` and `kiln --version`, ship a lean package with full metadata, add the public repository files, align the README and website with the code, and require written release notes. | 1 (the minimums the README and website state); 2 (live messaging true on every supported version) |
| [4 — Green release candidate](phase-4-green-release-candidate.md) | Fix the fixed-port test collisions, get the candidate's CI green, scan it, and run the macOS and Windows candidate checks once on the release pull request. | 1, 2 and 3 (every other criterion met before the candidate checks start) |
| [5 — Complete billing recognition, compatibility notices and test ports](phase-5-complete-recognition-notices-and-test-ports.md) | Added by delivery audit: billing settings Kiln doesn't recognise never show a subscription, live control turned off by an unreadable Claude Code version or by a hook problem seen after a restart gets its compatibility notice, and the last fixed-port tests get ports from the operating system. | 1, 2 and 4 (billing inventory, notices, live control, test ports) |
