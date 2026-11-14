// The reset line at the bottom of every screen of a started PRD (run restart AC-RESET-01, AC-RESET-02): while Kiln is
// working the button is unavailable and the line gives the reason in place of the usual sentence.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import ResetFooter from "./ResetFooter.svelte";
import { RESET_LINE } from "../lib/reset.js";

const config = { token: "t", base: "/customer-returns" };
const html = (control: { available: boolean; reason?: string }, connected = true) => render(ResetFooter, { props: { control, config, connected } }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const resetButton = (markup: string) => /<button[^>]*class="[^"]*open-reset[^"]*"[^>]*>/.exec(markup)![0];

describe("the reset line", () => {
  it("is unavailable while Kiln is working, saying how to stop the session first", () => {
    const reason = "Reset isn't available while a session is working. Stop it now with Pause & take over above, or pause after the current phase or audit and reset once it ends.";
    const page = html({ available: false, reason });
    expect(text(page)).toBe(`${reason} Reset Kiln for this PRD`);
    expect(text(page)).not.toContain(RESET_LINE);
    expect(resetButton(page)).toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("gives the usual sentence, with the button available, once Kiln has stopped working", () => {
    const page = html({ available: true });
    expect(text(page)).toBe(`${RESET_LINE} Reset Kiln for this PRD`);
    expect(resetButton(page)).not.toMatch(/\sdisabled/);
  });
});
