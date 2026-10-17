import { describe, expect, it } from "vitest";
import { browserCommand } from "./open-browser.js";

describe("opening the browser view (AC-START-03)", () => {
  const address = "http://127.0.0.1:4700/customer-returns";
  it("uses open on macOS and cmd's start on Windows, with an empty window title", () => {
    expect(browserCommand("darwin", address, { PATH: "" })).toEqual({ command: "/usr/bin/open", args: [address] });
    expect(browserCommand("win32", address, { ComSpec: "C:\\Windows\\system32\\cmd.exe" })).toEqual({ command: "C:\\Windows\\system32\\cmd.exe", args: ["/c", "start", "", address] });
  });

  it("names xdg-open when Linux has none", () => {
    expect(browserCommand("linux", address, { PATH: "" })).toEqual({ missing: "xdg-open" });
  });
});
