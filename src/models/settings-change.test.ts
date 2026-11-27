// The page's draft and the changes a save sends (Kiln Model Modes AC-SAVE-01, AC-SAVE-03;
// technical design "The page holds a draft"): only what the person changed, over what was last
// read, or over Kiln's choices while Restore is pending.

import { describe, expect, it } from "vitest";
import { carried, differing, draftState, withEdits, type DraftBase, type SettingsValues } from "./settings-change.js";

const opus = (effort: string) => ({ agentId: "claude_code" as const, family: "opus", effort });
const sol = (effort: string) => ({ agentId: "codex" as const, family: "sol", effort });
const kiln = (): SettingsValues => ({
  mode: "recommended", oneModel: opus("high"),
  rows: { demanding: { first: opus("high"), fallback: sol("high") }, standard: { first: opus("medium"), fallback: sol("high") }, mechanical: { first: opus("low"), fallback: sol("high") }, audits: { first: opus("high"), fallback: sol("xhigh") }, preflight_pr: { first: opus("medium"), fallback: sol("medium") } },
  fallback: { use: "never", threshold: 95 },
});
/** A person who chose the threshold at 90 and their own Standard first choice. */
const loaded = (): SettingsValues => ({ ...kiln(), rows: { ...kiln().rows, standard: { first: opus("xhigh"), fallback: sol("high") } }, fallback: { use: "threshold", threshold: 90 } });
const base = (holdsSettings = true): DraftBase => ({ loaded: loaded(), kilnChoices: kiln(), holdsSettings });

describe("the page's draft", () => {
  it("has nothing to save until something differs from what was read", () => {
    expect(draftState({ restore: false, edits: {} }, base())).toEqual({ shown: loaded(), changes: {}, dirty: false });
    // Picking what is already saved, or an edit the same value was saved under from elsewhere, isn't a change.
    expect(draftState({ restore: false, edits: { mode: "recommended", fallback: { use: "threshold", threshold: 90 }, rows: { standard: { first: opus("xhigh") } } } }, base())).toMatchObject({ changes: {}, dirty: false });
  });

  it("sends only the fields the person changed", () => {
    const state = draftState({ restore: false, edits: { rows: { demanding: { first: opus("xhigh") }, standard: { first: opus("xhigh") } }, fallback: { use: "everything" } } }, base());
    expect(state.changes).toEqual({ rows: { demanding: { first: opus("xhigh") } }, fallback: { use: "everything" } });
    expect(state.dirty).toBe(true);
    expect(state.shown.rows.demanding).toEqual({ first: opus("xhigh"), fallback: sol("high") });
    expect(state.shown.fallback).toEqual({ use: "everything", threshold: 90 });
  });

  it("sends a choice with what the page shows under it: one model with its one model, the threshold setting with its threshold (AC-SAVE-03)", () => {
    // The one model nobody picked is saved with the mode, never by itself.
    expect(draftState({ restore: false, edits: { mode: "one_model" } }, base()).changes).toEqual({ mode: "one_model", oneModel: opus("high") });
    expect(draftState({ restore: false, edits: { mode: "one_model", oneModel: sol("low") } }, base()).changes).toEqual({ mode: "one_model", oneModel: sol("low") });
    const never = { ...base(), loaded: { ...loaded(), fallback: { use: "never" as const, threshold: 90 } } };
    expect(draftState({ restore: false, edits: { fallback: { use: "threshold" } } }, never).changes).toEqual({ fallback: { use: "threshold", threshold: 90 } });
    expect(draftState({ restore: false, edits: { fallback: { use: "threshold", threshold: 80 } } }, never).changes).toEqual({ fallback: { use: "threshold", threshold: 80 } });
    // Never and For everything go alone, and so does a threshold changed under a setting left as it was.
    expect(draftState({ restore: false, edits: { fallback: { use: "everything" } } }, never).changes).toEqual({ fallback: { use: "everything" } });
    expect(draftState({ restore: false, edits: { fallback: { threshold: 80 } } }, base()).changes).toEqual({ fallback: { threshold: 80 } });
  });

  it("shows Kiln's choices while Restore is pending, and counts a later edit against them", () => {
    const restored = draftState({ restore: true, edits: {} }, base());
    expect(restored).toEqual({ shown: kiln(), changes: { restore: true }, dirty: true });
    // What was saved before Restore is no longer the base: its value is now a change, and Kiln's own is not.
    expect(draftState({ restore: true, edits: { fallback: { use: "threshold", threshold: 90 }, rows: { standard: { first: opus("medium") } } } }, base()).changes).toEqual({ restore: true, fallback: { use: "threshold", threshold: 90 } });
  });

  it("leaves Save unavailable for Restore alone while no file holds a field, and available once something else changed", () => {
    const empty: DraftBase = { loaded: kiln(), kilnChoices: kiln(), holdsSettings: false };
    expect(draftState({ restore: true, edits: {} }, empty)).toEqual({ shown: kiln(), changes: {}, dirty: false });
    expect(draftState({ restore: true, edits: { mode: "one_model" } }, empty)).toMatchObject({ changes: { restore: true, mode: "one_model", oneModel: opus("high") }, dirty: true });
  });
});

describe("the draft's parts", () => {
  it("keeps the edits that still differ after the settings are read again", () => {
    const edits = { mode: "one_model" as const, oneModel: opus("high"), rows: { demanding: { first: opus("xhigh"), fallback: sol("high") } }, fallback: { use: "everything" as const, threshold: 90 } };
    expect(differing(loaded(), edits)).toEqual({ mode: "one_model", rows: { demanding: { first: opus("xhigh") } }, fallback: { use: "everything" } });
    expect(differing(withEdits(loaded(), edits), edits)).toEqual({});
  });

  it("adds the one model or the threshold only to a change that selects their choice and names none", () => {
    const shown = { oneModel: sol("high"), fallback: { use: "never" as const, threshold: 70 } };
    expect(carried({ mode: "recommended" }, shown)).toEqual({ mode: "recommended" });
    expect(carried({ mode: "one_model" }, shown)).toEqual({ mode: "one_model", oneModel: sol("high") });
    expect(carried({ fallback: { use: "threshold" } }, shown)).toEqual({ fallback: { use: "threshold", threshold: 70 } });
    expect(carried({ fallback: { use: "threshold", threshold: 50 } }, shown)).toEqual({ fallback: { use: "threshold", threshold: 50 } });
    expect(carried({ fallback: { use: "never" } }, shown)).toEqual({ fallback: { use: "never" } });
  });
});
