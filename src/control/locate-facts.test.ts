// `kiln status`'s projection of a stop's questions about where a repository is, when the
// locate-repository command is and isn't available (find repositories anywhere AC-ASK-06).
import { describe, expect, it } from "vitest";
import type { PrdRecord } from "../state/records.js";
import { locateFacts } from "./projection.js";
import { locateText } from "./waiver-facts.js";

const CANONICAL = "/home/a/code/acme/product/docs/prds/customer-returns";
const BUSY = "Kiln is checking, dispatching or reconciling an instruction.";
const record = {
  repository: { name: "product", github: "acme/product", mainCheckoutPath: "/home/a/code/acme/product" },
  repositories: [],
  plan: [],
  phases: { "1": { stop: { kind: "done_check", locate: [{ kind: "which", repository: "acme-labs/ledger", searchedFrom: "/home/a/code/acme", found: 2, checkouts: [
    { folder: "/home/a/code/acme-labs/ledger", remote: "git@github.com:acme-labs/ledger.git", pickable: true },
    { folder: "/home/a/archive/ledger", remote: "git@git.example.com:acme-labs/ledger.git", pickable: false },
  ] }] } } },
} as unknown as PrdRecord;
const control = (available: boolean) => ({ token: "exec:tok", controls: [{ name: "locate-repository", available, reason: available ? null : BUSY }] });

describe("a stop's questions in kiln status (find repositories anywhere AC-ASK-06)", () => {
  it("gives the command for the question and for each checkout it can pick, while the command is available", () => {
    const [question] = locateFacts(record, CANONICAL, control(true));
    expect(question).toMatchObject({ kind: "which", address_path: "acme-labs/ledger", label: "ledger", available: true, reason: null,
      next_argv: ["kiln", "locate-repository", CANONICAL, "acme-labs/ledger", "<folder>", "--only-if-status-matches", "exec:tok", "--command-id", "<new-command-id>"] });
    expect(question!.checkouts).toEqual([
      { folder: "/home/a/code/acme-labs/ledger", remote: "git@github.com:acme-labs/ledger.git", pickable: true, remembered: false, next_argv: ["kiln", "locate-repository", CANONICAL, "acme-labs/ledger", "/home/a/code/acme-labs/ledger", "--only-if-status-matches", "exec:tok", "--command-id", "<new-command-id>"] },
      { folder: "/home/a/archive/ledger", remote: "git@git.example.com:acme-labs/ledger.git", pickable: false, remembered: false },
    ]);
  });

  it("says the command isn't available, with the engine's reason, and offers no command line while Kiln is busy", () => {
    const [question] = locateFacts(record, CANONICAL, control(false));
    expect(question).toMatchObject({ available: false, reason: BUSY, next_argv: null, next_command: null });
    expect((question!.checkouts as Record<string, unknown>[]).every((checkout) => !("next_argv" in checkout))).toBe(true);
    expect(locateText({ locate: [question] }).at(-1)).toBe(`Controls: locate-repository (${BUSY})`);
  });
});
