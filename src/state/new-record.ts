import { newBillingState } from "../billing/authority.js";
import { emptyDevelopmentLedger, restrictedAuthorization } from "./development-delivery.js";
// A PRD's record as Kiln first writes it, before Start.

import { SCHEMA_VERSION, agentSettings, type AgentSettings, type PrdRecord, type Settings } from "./records.js";
import { newToken } from "./state-files.js";
import { randomUUID } from "node:crypto";

export interface NewRecordInput {
  mainCheckoutPath: string;
  repositoryName: string;
  /** `<owner>/<name>`, parsed from origin's URL. */
  github: string;
  prdDirectoryFromRoot: string;
  featureName: string;
  settings: Settings | AgentSettings;
}

export function newPrdRecord(input: NewRecordInput): PrdRecord {
  const executionId = randomUUID();
  return {
    executionId,
    billing: newBillingState(executionId),
    completionAudits: { revision: 0, policy: "required", activities: [], evidence: [] },
    schemaVersion: SCHEMA_VERSION,
    developmentAuthorization: restrictedAuthorization(),
    developmentDelivery: emptyDevelopmentLedger(),
    repository: { mainCheckoutPath: input.mainCheckoutPath, name: input.repositoryName, github: input.github },
    prdDirectory: input.prdDirectoryFromRoot,
    featureName: input.featureName,
    token: newToken(),
    settings: { ...agentSettings(input.settings), developmentDeployments: input.settings.developmentDeployments ?? { enabled: false, targets: [] } },
    repositories: [],
    phases: {},
    pause: {},
  };
}
