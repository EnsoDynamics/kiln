// A stand-in for `gh pr merge` in Kiln's tests, not part of the main program: marks a pull request
// merged in the gh stand-in's state (KILN_STANDIN_GH_STATE) with the given merge commit, in the
// shape `gh pr view` records for a merged pull request. A merge session's scripted step runs it
// after pushing that commit to the base branch, as GitHub would have.
//
//   node gh-mark-merged.mjs acme/acme-shop#218 <merge commit>

import { readFileSync, writeFileSync } from "node:fs";

const [key, mergeCommit] = process.argv.slice(2);
const path = process.env.KILN_STANDIN_GH_STATE;
const state = JSON.parse(readFileSync(path, "utf8"));
const view = state.views?.[key];
if (!view) { process.stderr.write(`gh-mark-merged: no pull request ${key}\n`); process.exit(1); }
state.views[key] = { ...view, state: "MERGED", mergedAt: new Date().toISOString(), mergeCommit: { oid: mergeCommit }, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", closed: true };
writeFileSync(path, JSON.stringify(state));
