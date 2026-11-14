// The top bar every screen carries (PRD AC-LOOK-05): the Kiln mark and the running version on the left; on the right,
// the connection status and the Enso Method mark.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TopBar from "./TopBar.svelte";
import { version } from "../../../package.json";

const html = (props: { connected: boolean; lastEventAt: number | undefined; now: number; latest?: string; open?: boolean }) => render(TopBar, { props }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the top bar", () => {
  it("carries the Kiln mark first, then the connection status, then the Enso Method mark", () => {
    const page = html({ connected: true, lastEventAt: 10_000, now: 12_000 });
    expect(text(page)).toBe(`kiln v${version} Connected to Kiln · updated 2s ago The Enso Method`);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(page).toMatch(/<div class="left[^"]*">[\s\S]*<\/a> <span class="version[^"]*"[^>]*>v[^<]+<\/span>[\s\S]*<div class="right/);
    expect(page).toMatch(/<div class="left[^"]*">[\s\S]*<span class="word[^"]*">kiln<\/span>[\s\S]*<div class="right/);
    expect(page).toMatch(/<a class="enso[^"]*" href="https:\/\/ensomethod\.org"><img src="[^"]*enso-method-mark[^"]*"/);
    // Green means connected (AC-LOOK-04).
    expect(page).toMatch(/<span class="dot [^"]*\bconnected\b[^"]*">/);
  });

  it("says plainly when the view isn't connected to Kiln, and when it last saw Kiln (AC-VIEW-07)", () => {
    process.env.TZ = "America/New_York";
    const lastSeen = Date.parse("2026-10-17T15:47:00Z");
    const page = html({ connected: false, lastEventAt: lastSeen, now: lastSeen + 20_000 });
    expect(text(page)).toBe(`kiln v${version} Disconnected from Kiln · last seen 11:47 AM The Enso Method`);
    // Amber marks a disconnected Kiln (AC-LOOK-04).
    expect(page).toMatch(/<span class="lost[^"]*">Disconnected from Kiln<\/span>/);
    expect(page).not.toMatch(/\bconnected"/);
  });

  it("shows no newer-version pill unless npm has a newer Kiln (AC-NEWER-02)", () => {
    expect(html({ connected: true, lastEventAt: 10_000, now: 12_000 })).not.toContain("available");
  });

  it("shows the newer version as a pill beside the running one, with the command only once opened (AC-NEWER-03)", () => {
    const closed = html({ connected: true, lastEventAt: 10_000, now: 12_000, latest: "99.0.0" });
    expect(text(closed)).toBe(`kiln v${version} v99.0.0 available Connected to Kiln · updated 2s ago The Enso Method`);
    expect(closed).toMatch(/<span class="version[^"]*"[^>]*>v[^<]+<\/span> <div class="newer[^"]*"><button type="button" class="pill[^"]*" aria-expanded="false"/);
    expect(closed).not.toContain("npm install");

    const open = html({ connected: true, lastEventAt: 10_000, now: 12_000, latest: "99.0.0", open: true });
    expect(open).toMatch(/aria-expanded="true"/);
    const panel = text(open.slice(open.indexOf('data-testid="newer-kiln"')));
    expect(panel).toContain(`Kiln v99.0.0 is out · you're on v${version}`);
    expect(panel).toContain("npm install -g @ensodynamics/kiln Copy");
    expect(panel).toContain(`This Kiln stays on v${version} until you start it again. What changed`);
    expect(open).toContain('href="https://github.com/EnsoDynamics/kiln/blob/main/CHANGELOG.md"');
  });
});
