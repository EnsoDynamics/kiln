// The top bar every screen carries (PRD AC-LOOK-05): the Kiln mark on the left; on the right,
// the connection status and the Enso Method mark.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TopBar from "./TopBar.svelte";

const html = (props: { connected: boolean; lastEventAt: number | undefined; now: number }) => render(TopBar, { props }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the top bar", () => {
  it("carries the Kiln mark first, then the connection status, then the Enso Method mark", () => {
    const page = html({ connected: true, lastEventAt: 10_000, now: 12_000 });
    expect(text(page)).toBe("kiln Connected to Kiln · updated 2s ago The Enso Method");
    expect(page).toMatch(/<div class="left[^"]*">[\s\S]*<span class="word[^"]*">kiln<\/span>[\s\S]*<div class="right/);
    expect(page).toMatch(/<a class="enso[^"]*" href="https:\/\/ensomethod\.org"><img src="[^"]*enso-method-mark[^"]*"/);
    // Green means connected (AC-LOOK-04).
    expect(page).toMatch(/<span class="dot [^"]*\bconnected\b[^"]*">/);
  });

  it("says plainly when the view isn't connected to Kiln", () => {
    const page = html({ connected: false, lastEventAt: 10_000, now: 30_000 });
    expect(text(page)).toBe("kiln Disconnected from Kiln The Enso Method");
    expect(page).not.toMatch(/\bconnected"/);
  });
});
