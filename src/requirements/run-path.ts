import type { PrdRecord } from "../state/records.js";

type Location = Pick<PrdRecord, "origin" | "prdDirectory">;

export function startPath(record: Location): string {
  return record.origin?.path ?? writtenDirectory(record);
}

export function writtenDirectory(record: Pick<PrdRecord, "prdDirectory">): string {
  if (!record.prdDirectory) throw new Error("This run has no written PRD yet.");
  return record.prdDirectory;
}
