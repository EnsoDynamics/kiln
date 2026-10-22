// The pull-request check across repositories (multi-repo PRD AC-PRS-05), against the stand-in
// gh: each repository asked with its own --repo, head and base, and the facts naming the
// repository that has no pull request open.

import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { readJsonLines } from "../state/state-files.js";
import type { StayedOutcome } from "../session/outside-workspace.js";
import { runPullRequestChecks } from "./checks.js";

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

const pull = (repo: string, number: number, base: string, extra: Record<string, unknown> = {}) => ({
  repo,
  number,
  title: `Customer returns in ${repo}`,
  url: `https://github.com/${repo}/pull/${number}`,
  isDraft: false,
  isCrossRepository: false,
  headRefName: "feature/customer-returns",
  baseRefName: base,
  additions: 5,
  deletions: 1,
  commits: [{ oid: "a" }],
  ...extra,
});

/** Stayed in the workspace, passed: the pull-request session changed nothing outside it. */
const STAYED: StayedOutcome = { passed: true, changes: [], transcripts: [], check: { name: "Stayed in the workspace", passed: true, facts: [] } };

describe("the pull-request check across repositories", () => {
  it("passes only when every repository that changed has its pull request open, and names the one missing", async () => {
    sandbox = createSandbox();
    const { gh } = installStandIns(join(sandbox.root, "bin"));
    const state = join(sandbox.root, "gh-state.json");
    const env = { ...sandbox.env, KILN_STANDIN_GH_STATE: state };
    const input = (repository: string, base: string) => ({ gh, env, mainCheckoutPath: sandbox!.root, github: `acme/${repository}`, branch: "feature/customer-returns", baseBranch: base, repository });
    const inputs = [input("product", "develop"), input("returns-api", "develop"), input("notifications", "main")];

    // notifications' pull request went into the wrong base; returns-api's is a draft.
    writeFileSync(state, JSON.stringify({ pulls: [pull("acme/product", 12, "develop"), pull("acme/returns-api", 57, "develop", { isDraft: true }), pull("acme/notifications", 9, "develop")] }));
    const failing = await runPullRequestChecks(inputs, STAYED);
    const check = {
      name: "Pull request open",
      passed: false,
      facts: ["product: #12 open", "returns-api: #57 is a draft", "notifications: No open pull request from feature/customer-returns into main"],
    };
    expect(failing).toEqual({ passed: false, check, checks: [check], stayed: STAYED });
    // Asked in parallel, so in no fixed order.
    const asked = readJsonLines<string[]>(`${state}.calls.jsonl`).map((args) => `${args[args.indexOf("--repo") + 1]} into ${args[args.indexOf("--base") + 1]}`);
    expect(asked.sort()).toEqual(["github.com/acme/notifications into main", "github.com/acme/product into develop", "github.com/acme/returns-api into develop"]);

    writeFileSync(state, JSON.stringify({ pulls: [pull("acme/product", 12, "develop"), pull("acme/returns-api", 57, "develop"), pull("acme/notifications", 9, "main")] }));
    const passing = await runPullRequestChecks(inputs, STAYED);
    expect(passing.passed).toBe(true);
    expect(passing.pullRequests!.map((one) => [one.repository, one.number, one.base, one.url])).toEqual([
      ["product", 12, "develop", "https://github.com/acme/product/pull/12"],
      ["returns-api", 57, "develop", "https://github.com/acme/returns-api/pull/57"],
      ["notifications", 9, "main", "https://github.com/acme/notifications/pull/9"],
    ]);

    // Multi-repo AC-PRS-06: every pull request open, but the session worked outside the workspace.
    const outside: StayedOutcome = {
      passed: false,
      changes: [{ at: "2026-10-17T19:00:00Z", fact: "Pushed from ~/devel/acme/design-system" }],
      transcripts: [],
      check: { name: "Stayed in the workspace", passed: false, facts: ["Pushed from ~/devel/acme/design-system", "Kiln changed nothing in that checkout, since it may hold other work too."] },
    };
    const stopped = await runPullRequestChecks(inputs, outside);
    expect(stopped.passed).toBe(false);
    expect(stopped.pullRequests).toBeUndefined();
    expect(stopped.checks).toEqual([{ ...passing.check }, outside.check]);
  });
});
