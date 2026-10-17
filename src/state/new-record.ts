// A PRD's record as Kiln first writes it, before Start.

import { SCHEMA_VERSION, type PrdRecord, type Settings } from "./records.js";
import { newToken } from "./state-files.js";

export interface NewRecordInput {
  mainCheckoutPath: string;
  repositoryName: string;
  /** `<owner>/<name>`, parsed from origin's URL. */
  github: string;
  prdDirectoryFromRoot: string;
  featureName: string;
  settings: Settings;
}

export function newPrdRecord(input: NewRecordInput): PrdRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    repository: { mainCheckoutPath: input.mainCheckoutPath, name: input.repositoryName, github: input.github },
    prdDirectory: input.prdDirectoryFromRoot,
    featureName: input.featureName,
    token: newToken(),
    settings: input.settings,
    phases: {},
    pause: {},
  };
}
