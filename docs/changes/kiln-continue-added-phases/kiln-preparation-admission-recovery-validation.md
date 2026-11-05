# Kiln preparation admission and grant recovery validation

**Scope:** Phase 6 of Kiln Continue Added Phases, completing AC-CONTINUE-07/09 with AC-CONTINUE-08 and AC-OFFER-03 applying.
**Validation date:** 2026-10-30 UTC.
**Gate state:** Complete. Full repository verification and installed-package gates passed.

## Admission and authority boundaries

Claude preparation settlement and the final implementation admission hook require release of every retained preparation attempt's PID/start identities, tracked owners, pending process observations and operations. Scanner shutdown alone is insufficient. Existing gate paths, attempt/execution/session identities, profile, transcript evidence and terminal ownership remain required. Unknown identity/inventory and surviving work hold verification; recovery retains the same conversation and earlier attempt evidence. Codex retains its existing cleanup/provenance controls at the same boundary. No unrelated process is signalled.

Discovery now reports positively read candidate, repository identity/base, preparation source and settings/permission inputs to the existing engine owner before later reads can fail. A differing input durably supersedes pending authority immediately. The original immutable proposal and approval receipt remain available; older pending records recover the offer through their original durable journal receipt. Grant-only changes preserve scope. Unknown reads supply no fabricated comparison.

Provider permission reads retain component digests for partial observations without adding them to the authority-neutral scope digest. Complete passive permission evidence remains comparable to legacy aggregate-only offers even when known policy denies verification; incomplete reads supply no complete digest. Runtime verification still refuses restrictions immediately. Codex observations use the existing stable permission fields rather than incidental metadata.

## Boundary evidence

The preparation-execution integration suite uses generated fictional Git repositories and local origins, actual native project checks, OS PID/start reads, durable records, HTTP and Chrome. New cases cover surviving tracked owners, unavailable inventory, ambiguous identity, unsettled operations, takeover, restart/explicit Resume and an owner arriving after successful native verification. Earlier preparation attempts remain part of release checks. Codex's recorded verified peer separately covers unknown background inventory before native verification, restart and same-thread recovery; actual-provider proof supplies its successful native sandbox/check/implementation boundary.

Incomplete discovery tests observe changed candidate documents, delivery base, source branch, execution settings and provider settings before a later injected failure. Delivery-base observations are published immediately after the positive origin read, before object fetching; a subsequent fetch failure cannot erase that observed change. Restoring inputs, restarting and replaying the original approval cannot revive superseded authority. Unchanged read/permission failures retain pending authority. A genuinely hashed older proposal without component permission evidence, and older authority without a proposal pointer, exercise legacy aggregate comparison and journal recovery. Supersession-write failures prove mutation faults before publication and irreversible recovery after publication; a pre-publication failure has no durable acknowledgement and restart rechecks the actual source before another effect.

Narrow spies schedule otherwise difficult inventory/identity failures, late observations, incomplete discovery and lost write acknowledgements. They do not supply successful provider, Git or native-check evidence. Existing browser scenarios cover failed checks, disabled offers, exact grants, preparation and earlier history at desktop and narrow widths.

## Actual providers

`scripts/proof-run/preparation-provider-proof.mjs` with `reconciliation` creates only fictional disposable repositories and local origins. Both providers integrate the pinned source, submit typed references and append split work during preparation. Kiln reconciles the revised plan, observes provider release, runs one independent native check and admits one implementation turn in the same conversation. Acceptance replay launches no extra turn; earlier delivery remains intact. This proof stops at implementation admission; the integration workflow owns completion, current audits and new delivery.

The final-build runs passed with Claude Code 2.1.311 / Opus high, conversation `b0a2e67c-839e-4768-84c0-b1b1b07eef22`, and Codex 0.162.1 / GPT 6.1 Sol high, conversation `01a18e31-8b22-7982-b7f8-c82ecd9b6089`. Claude's actual live adapter retained tracked process identities and settled them before its native check and implementation turn. Generated roots retain `proof-result.json`; no client repository, remote delivery or production resource was used. Final logs are `/private/tmp/kiln-ph6-claude-final-proof.log` and `/private/tmp/kiln-ph6-codex-final2-proof.log`.

The isolated Claude profile is `/private/tmp/kiln-ph6-claude311/node_modules/.bin`; prepend it to the qualified tool PATH for the supported live-adapter proof. The subsequent fetch/origin changes affect read-only discovery observations; provider preparation, verification and dispatch code remains the same.

## Review and repository gates

Independent deliverable review found and drove the legacy aggregate-permission fix; its final full review found no remaining scoped issue. Independent test hardening drove explicit supersession-publication and Codex preparation cleanup tests. Earlier diagnostic failures exposed an unstable Codex metadata digest and recovery-fixture assumptions; these were corrected without weakening runtime controls or assertions.

`npm run verify` exited zero in 1,826.47 seconds: dependency audit had zero blocking high/critical findings; lint and TypeScript/Svelte checks passed with zero errors/warnings; 690 unit tests, 14 release checks, 18 Codex contract checks and all 107 integration files passed (1,265 passing cases, three inherited/platform skips). Integration took 1,799.78 seconds. `npm run test:package` then passed all eight cases in 32.41 seconds.

All 526 source and 266 build hashes stayed unchanged throughout full verification. Package prepack ran afterward, and source hashes still matched. Logs and exact exit/time records are `/private/tmp/kiln-ph6-verify.log`, `kiln-ph6-verify-result.json`, `kiln-ph6-test-package.log` and `kiln-ph6-test-package-result.json`, alongside source/build freeze manifests. Two preliminary verification runs were intentionally interrupted to complete pre-fetch and invalid-origin observation boundaries; only the final uninterrupted gate establishes closure.

## Delivery and successor

Work remains in the retained continuation worktree named in the successor prompt. Authorized delivery is a normal safe fast-forward push `HEAD:develop` and a clean shared-checkout fast-forward. Preserve every history and unrelated change; never publish the worktree branch, force-push, reset, stash, rebase or delete. No main merge/release or production changes are authorized.

After Phase 6 closes and development-base delivery completes, directly launch a fresh whole-PRD delivery audit. A current clean delivery audit then launches whole-PRD test audit and any required completion/re-audit chain. One implementation leaf per chat; every successor uses GPT 6.1 Sol / high effort. Historical audit conclusions do not establish current completion.

Continuing authorization is Doug's user turn `01a18b02-2107-70b2-8d9e-45124526afc8` in source chat `01a18a26-f6dd-7ab2-88de-6523bc42f0fa`: “When you are done with this, go ahead and commit and push, and then launch a new chat with whatever the next phase is. So, if there's another phase to implement, then launch a new chat for implement from requirements. Again, using GPT 6.1 Sol high effort. So, if need be, continue on to implement the next phase. Or if this is the final phase, then continue on to do a A delivery audit in a new chat. Ideally, after that, we would continue on to just launch additional chats to implement whatever the delivery audit found missing, and then just continue with the rest of the Enso Method through to test audit until everything is implemented.” Scoped commits, development-base pushes after gates and direct successor launches remain authorized. This does not authorize destructive operations or messages to others.
