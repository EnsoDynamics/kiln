// The home screen's words that depend on the list (Kiln Requirements Stages AC-HOME-05, AC-HOME-06,
// AC-HOME-09): the prompt to paste into the person's own session, each line's state and button,
// and the repository filters.

import type { HomeList } from "../../../src/home/home.js";
import type { HomeItem } from "../../../src/home/scan.js";

/** The prompt the panel offers (AC-HOME-06), with the shared branch's name when the scope has one. */
export function bringInPrompt(list: Pick<HomeList, "scope">): string {
  const branch = list.scope.sharedBranch ?? "the shared branch";
  return `Use the Enso Method. I have source material for something new to build in this repository. Help me bring it into source-material/ the way the method describes, commit it on ${branch}, and stop there. Kiln will take it from the PRD on.`;
}

export const STATE_WORDS = { working: "Working", waiting_for_you: "Waiting for you", paused: "Paused", not_running: "Not running", unreadable: "State not read" } as const;

/** The button on a line: Review and start, Review and continue, or Open (AC-HOME-05). */
export function buttonFor(item: HomeItem, section: "underWay" | "ready" | "notReady" | "folded"): string | undefined {
  if (section === "notReady") return undefined;
  if (section === "ready") return "Review and start";
  if (section === "underWay" && item.startedByHand && item.state === "not_running") return "Review and continue";
  return "Open";
}

export const KIND_WORDS = { brief: "Brief", intake: "Intake record", planned_prd: "Planned PRD" } as const;

/** Each repository with the number of lines it holds, and the repositories with nothing found (AC-HOME-09). */
export function repositoryFilters(list: HomeList): { name: string; count: number }[] {
  const items = [...list.underWay, ...list.ready, ...list.notReady, ...list.folded];
  return list.scope.repositories.map(name => ({ name, count: items.filter(item => item.repository === name).length })).filter(one => one.count > 0);
}
