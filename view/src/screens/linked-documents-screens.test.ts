// Documents found's Linked documents item (Kiln Linked Documents AC-LINK-04).
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const body = (snapshot: ReturnType<typeof documentsFoundSnapshot>) => render(DocumentsFound, { props: { snapshot, config: { token: "t", base: "/customer-returns" }, connected: true } }).body;
const words = (snapshot: ReturnType<typeof documentsFoundSnapshot>) => text(render(DocumentsFound, { props: { snapshot, config: { token: "t", base: "/customer-returns" }, connected: true } }).body);

describe("Documents found and links Kiln won't follow", () => {
  it("lists each link after the phase plan, with the document that links to it, and keeps it out of the checks", () => {
    const shown = words(documentsFoundSnapshot({ documents: { unfollowedLinks: [{ target: "billing-service/docs/event-history.md", from: "docs/prds/customer-returns/technical-design.md", reason: "not in this repository" }] } }));
    expect(shown).toContain("Linked documents 1 not followed. Kiln starts anyway and tells the agent. billing-service/docs/event-history.md linked from docs/prds/customer-returns/technical-design.md · not in this repository");
    expect(shown.indexOf("Linked documents")).toBeGreaterThan(shown.indexOf("Phase plan"));
    expect(shown.indexOf("Linked documents")).toBeLessThan(shown.indexOf("Every phase cites its criteria"));
  });

  it("marks the item as neither passed nor failed, and leaves Start as it is", () => {
    const link = { target: "billing-service/docs/event-history.md", from: "docs/prds/customer-returns/technical-design.md", reason: "not in this repository" };
    const withLink = body(documentsFoundSnapshot({ documents: { unfollowedLinks: [link] } }));
    const mark = /<li class="linked[^"]*">(<svg[\s\S]*?<\/svg>)/.exec(withLink)![1]!;
    expect(mark).toContain('stroke="var(--dim)"');
    expect(mark).toContain("<circle");
    expect(mark).not.toContain("#9cc49a");
    const start = (markup: string) => /<button[^>]*>[^<]*(?:<[^>]+>[^<]*)*?Start[^<]*<\/button>/.exec(markup)?.[0];
    expect(start(withLink)).toBeDefined();
    expect(start(withLink)).toBe(start(body(documentsFoundSnapshot())));
  });

  it("lists every link it is given, each once", () => {
    const link = { target: "billing-service/docs/event-history.md", from: "docs/prds/customer-returns/technical-design.md", reason: "not in this repository" };
    const snapshot = documentsFoundSnapshot({ documents: { unfollowedLinks: [link, { ...link, target: "docs/prds/customer-returns/notes.md", reason: "not a file" }] } });
    const shown = words(snapshot);
    expect(shown).toContain("2 not followed.");
    expect(shown.split("billing-service/docs/event-history.md").length).toBe(2);
    expect(shown).toContain("docs/prds/customer-returns/notes.md linked from docs/prds/customer-returns/technical-design.md · not a file");
  });

  it("shows no item when every link was followed", () => {
    expect(words(documentsFoundSnapshot())).not.toContain("Linked documents");
  });
});
