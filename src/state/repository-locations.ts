// Where the person told Kiln a repository is on this computer (find repositories anywhere
// AC-ASK-04; technical design, "Data Models"): one small file per repository in the state root,
// outside every repository and every PRD's record, so every PRD on the computer reads it.

import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { wholePathForm } from "../plan/repository-names.js";
import { readJson, stateRoot, writeJsonAtomically } from "./state-files.js";

export const LOCATIONS_SCHEMA_VERSION = 1;

export interface RememberedLocation {
  schemaVersion: number;
  addressPath: string;
  /** The checkout's real path. */
  folder: string;
  /** UTC. */
  answeredAt: string;
}

export type RememberedRead =
  | { kind: "none" }
  | { kind: "remembered"; location: RememberedLocation }
  /** Written by a newer Kiln: left in place unused. */
  | { kind: "newer" }
  /** Couldn't be parsed: deleted, with the parse error for the terminal line. */
  | { kind: "unreadable"; error: string; kept?: true };

export function repositoryLocationsFolder(env: NodeJS.ProcessEnv): string {
  return join(stateRoot(env), "repository-locations");
}

function locationFile(env: NodeJS.ProcessEnv, addressPath: string): string {
  return join(repositoryLocationsFolder(env), `${wholePathForm(addressPath.toLowerCase())}.json`);
}

/**
 * The answer remembered for an address path, any spelling.
 *
 *   readRememberedLocation(env, "Acme-Labs/Storefront")
 *   // { kind: "remembered", location: { schemaVersion: 1, addressPath: "acme-labs/storefront", folder: "/Volumes/work/storefront", answeredAt: "…" } }
 */
export function readRememberedLocation(env: NodeJS.ProcessEnv, addressPath: string): RememberedRead {
  const file = locationFile(env, addressPath);
  let value: RememberedLocation | undefined;
  try {
    value = readJson<RememberedLocation>(file);
  } catch (error) {
    // A file Kiln can't read for another reason (permissions) is left alone and searched past.
    if (!(error instanceof SyntaxError)) return { kind: "unreadable", error: (error as Error).message, kept: true };
    rmSync(file, { force: true });
    return { kind: "unreadable", error: (error as Error).message };
  }
  if (value === undefined) return { kind: "none" };
  if (typeof value !== "object" || value === null || typeof value.schemaVersion !== "number") {
    rmSync(file, { force: true });
    return { kind: "unreadable", error: "it isn’t a record Kiln wrote" };
  }
  if (value.schemaVersion > LOCATIONS_SCHEMA_VERSION) return { kind: "newer" };
  if (typeof value.folder !== "string" || typeof value.addressPath !== "string" || typeof value.answeredAt !== "string") {
    rmSync(file, { force: true });
    return { kind: "unreadable", error: "a field is missing" };
  }
  return { kind: "remembered", location: value };
}

/** Writes an accepted answer whole and renames it into place, replacing any earlier one. */
export function rememberLocation(env: NodeJS.ProcessEnv, addressPath: string, folder: string, at: Date): RememberedLocation {
  const location: RememberedLocation = { schemaVersion: LOCATIONS_SCHEMA_VERSION, addressPath: addressPath.toLowerCase(), folder, answeredAt: at.toISOString() };
  writeJsonAtomically(locationFile(env, addressPath), location);
  return location;
}

export function forgetLocation(env: NodeJS.ProcessEnv, addressPath: string): void {
  rmSync(locationFile(env, addressPath), { force: true });
}

/** Every remembered file's name, for tests and support. */
export function rememberedFiles(env: NodeJS.ProcessEnv): string[] {
  try { return readdirSync(repositoryLocationsFolder(env)).filter((name) => name.endsWith(".json")); } catch { return []; }
}
