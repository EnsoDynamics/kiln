// A pressed button whose action takes a while (starting an agent session, running the checks)
// shows it is under way: the button is marked busy, so it keeps full contrast with a spinner, and
// a line beneath it says what Kiln is doing. Before the press, neither shows.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import StartAgainCard from "./StartAgainCard.svelte";
import CarryOnCard from "./CarryOnCard.svelte";

const html = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const button = (markup: string, label: string) => [...markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => text(b).includes(label))!;
const work = { unknown: "Reading…" } as never;

describe("busy feedback on slow buttons", () => {
  it("marks Start again busy and says Kiln is launching the session while it waits", () => {
    const page = html(render(StartAgainCard, { props: { activity: "Phase 3", work, control: { available: true }, pending: true, disabled: true, onpress: () => {} } }).body);
    const pressed = button(page, "Starting…");
    expect(pressed).toMatch(/class="[^"]*\bbusy\b/);
    expect(pressed).toContain('aria-busy="true"');
    expect(text(page)).toContain("Launching Phase 3's first session again.");
    expect(page).toMatch(/<p[^>]*role="status"[^>]*>Launching Phase 3/);
  });

  it("shows neither the busy mark nor the line before Start again is pressed", () => {
    const page = html(render(StartAgainCard, { props: { activity: "Phase 3", work, control: { available: true }, pending: false, disabled: false, onpress: () => {} } }).body);
    expect(button(page, "Start Phase 3 again")).not.toMatch(/class="[^"]*\bbusy\b/);
    expect(text(page)).not.toContain("Launching");
  });

  it("names the agent being launched when the person sends a reply and continues", () => {
    const page = html(render(CarryOnCard, { props: { agent: "Codex", activity: "Phase 2", work, reopen: { state: "unavailable", reason: "missing" }, control: { available: true }, pending: true, checking: false, disabled: true, onpress: () => {}, oncheck: () => {} } }).body);
    expect(button(page, "Starting…")).toContain('aria-busy="true"');
    expect(button(page, "Check again")).toContain('aria-busy="false"');
    expect(text(page)).toContain("Launching a new Codex session for Phase 2.");
  });
});
