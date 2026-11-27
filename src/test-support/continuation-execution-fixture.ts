/**
 * The Comet Library continuation the continuation-execution integration files share, with the
 * engine reopened on its saved record. Each file owns its harness variable, because some of its
 * tests set it themselves, so `fixture` hands the new harness to `keep` and `request` reads the
 * current one through `current`.
 */
import { Engine } from "../engine/engine.js";
import { readPrdRecord } from "../state/records.js";
import { createCometContinuation } from "./comet-continuation-fixture.js";
import { waitFor, type Harness } from "./engine-harness.js";

export function continuationFixture(current: () => Harness, keep: (h: Harness) => void) {
  async function fixture(integrate = true) {
    const f = await createCometContinuation(); keep(f.h); const h = current(); if (integrate) f.integrate();
    h.engine.close();
    const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
    h.engine = make();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    return { ...f, make };
  }
  function request(proposalId: string, commandId: string) { const h = current(); return { proposalId, commandId, executionId: h.engine.record.executionId!, statusToken: h.engine.controlView().token }; }
  return { fixture, request };
}
