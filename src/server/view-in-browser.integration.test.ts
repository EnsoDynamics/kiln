// The browser view in a real browser (technical design, Testing Approach, "The view"): each
// mockup screen rendered by headless Chrome from a fixture Snapshot carrying that mockup's
// sample data, v1's and the multi-repo delivery change's (multi-repo AC-SHOW-01), under Kiln's own Content Security Policy, with its copy checked against the
// mockup's; the Disconnected and reconnect behavior against a server that stops and returns;
// and a final message holding raw HTML shown as text (PRD AC-STOP-02).
//
// Set KILN_SCREENSHOTS=<folder> to also write each screen and its mockup as PNGs side by side,
// for comparing them by eye (AC-LOOK-01).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import type { OutputLine } from "../session/session-output.js";
import { isPortFree } from "../state/instance-lock.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { createHarness, landingSession, waitFor } from "../test-support/engine-harness.js";
import { startLocalServer } from "./local-server.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import {
  completeRepositoriesSnapshot,
  completeSnapshot,
  documentsFoundRepositoriesSnapshot,
  documentsFoundSnapshot,
  needsYouCrashedSnapshot,
  needsYouMessageSnapshot,
  pausedSnapshot,
  needsYouOutsideWorkspaceSnapshot,
  needsYouRepositoriesSnapshot,
  PHASE_DETAIL_LINES,
  RUNNING_NOW,
  runningRepositoriesSnapshot,
  runningSnapshot,
} from "../test-support/sample-snapshots.js";

const MOCKUPS = new URL("../../docs/design/mockups/", import.meta.url);
/** The multi-repo delivery change's mockups, from MOCKUPS. */
const REPOSITORIES_MOCKUPS = "../../changes/kiln-multi-repo-delivery/mockups/";
/** The usage-limit recovery change's mockups, from MOCKUPS. */
const RECOVERY_MOCKUPS = "../../changes/kiln-usage-limit-recovery/mockups/";
/**
 * Resume's card as kiln-screen-needs-you-resume.html draws it (usage-limit recovery AC-RESUME-01),
 * with no example note, since the view's note starts empty and shows only its placeholder.
 */
const RESUME_CARD = (() => {
  const html = readFileSync(new URL(`${RECOVERY_MOCKUPS}kiln-screen-needs-you-resume.html`, MOCKUPS), "utf8");
  const card = html.slice(html.lastIndexOf("<section", html.indexOf("Let Kiln carry on")));
  return card.slice(0, card.indexOf("</section>") + "</section>".length).replace(/(<textarea[^>]*>)[^<]*(<\/textarea>)/, "$1$2");
})();
/** Empties the Resume mockup's example note, as the view's note starts. */
const EMPTY_NOTE = `(() => { document.querySelector("textarea").textContent = ""; return true; })()`;
/**
 * Adds Resume's card, for `phase`, to a Needs you mockup drawn before it: above the steps, which
 * become the other way, where the Resume mockup puts it (AC-RESUME-01; multi-repo AC-SHOW-01).
 */
const withResumeCard = (phase: string) => `(() => {
  const eyebrow = [...document.querySelectorAll("span")].find((e) => e.textContent === "Pick it up yourself");
  const holder = document.createElement("div");
  holder.innerHTML = ${JSON.stringify(RESUME_CARD)};
  const card = holder.firstElementChild;
  const text = [...card.querySelectorAll("p")].find((e) => e.textContent.includes("carry on with Phase 2b"));
  text.textContent = text.textContent.replace("Phase 2b", ${JSON.stringify(phase)});
  eyebrow.closest("section").before(card);
  eyebrow.textContent = "Or pick it up yourself";
  return true;
})()`;
/** Documents found's line on what sessions may do in a repository they add (multi-repo AC-SPACE-03, AC-PRS-04). */
const SESSIONS_ADD = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";
const AMBER = "rgb(230, 180, 80)";
const GREEN = "rgb(156, 196, 154)";
const TIME_ZONE = "America/New_York";
let port = 41200;
let chrome: HeadlessChrome;

/** The next free port in this file's range, 41200 to 41299. */
async function nextPort(): Promise<number> {
  while (port < 41300) {
    const candidate = port++;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error("No free port for the browser tests in 41200-41299.");
}

beforeAll(async () => {
  chrome = await launchChrome();
});
afterAll(async () => {
  await chrome?.close();
});

async function waitUntil(condition: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Clicks the first button or link whose text is exactly `label`. */
const click = (page: BrowserPage, label: string) => page.evaluate(`[...document.querySelectorAll("button, a")].find((e) => e.textContent.trim() === ${JSON.stringify(label)}).click()`);

/** Replaces the clipboard with a recorder, so a test can read what each Copy button copied. */
const recordClipboard = (page: BrowserPage) => page.evaluate(`window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied.push(text); } } }); true`);
/** The text of the element with the largest font on the screen (AC-LOOK-02). */
const largestText = (page: BrowserPage) =>
  page.evaluate<string>(`[...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0].textContent.trim()`);
const copied = (page: BrowserPage) => page.evaluate<string[]>("window.__copied");

/** The page's words, one space between them, the way a person reads them; eyebrows' capitals aside. */
const words = async (page: BrowserPage) => flat(await page.evaluate<string>("document.body.innerText"));
const flat = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

async function openScreen(snapshot: Snapshot, path = "", clock = RUNNING_NOW, output = PHASE_DETAIL_LINES, refuse?: Record<string, string>) {
  const server = await serveViewFixture({ port: await nextPort(), folder: "customer-returns", snapshot, output, ...(refuse ? { refuse } : {}) });
  const page = await chrome.open(`${server.address}${path}`, { clock, timeZone: TIME_ZONE });
  await page.waitFor(`document.querySelector("h1")`);
  return { server, page };
}

async function saveScreenshots(name: string, page: BrowserPage, mockup: string, clock: number) {
  const folder = process.env.KILN_SCREENSHOTS;
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}-view.png`), await page.screenshot());
  const drawn = await chrome.open(new URL(mockup, MOCKUPS).href, { clock, timeZone: TIME_ZONE });
  await drawn.waitFor(`document.fonts.status === "loaded"`, 15_000).catch(() => undefined);
  writeFileSync(join(folder, `${name}-mockup.png`), await drawn.screenshot());
  await drawn.close();
}

/** A piece of text as a page draws it, and the panel behind it. */
interface TextBox {
  text: string;
  box: number[];
  color: string;
  font: string;
  panel: string;
}

/**
 * Every element with text of its own: the text, its box on the page, its color and type, and the
 * background and border of the nearest element behind it that has a background (its panel).
 */
const TEXT_LAYOUT = `[...document.querySelectorAll("body *")]
  .filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
  .map((e) => {
    const style = getComputedStyle(e);
    let panel = e;
    while (panel.parentElement && getComputedStyle(panel).backgroundColor === "rgba(0, 0, 0, 0)") panel = panel.parentElement;
    const behind = getComputedStyle(panel);
    const { x, y, width, height } = e.getBoundingClientRect();
    return {
      // How long ago the last update came is live, not drawn: the view's reads 0s.
      text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\\s+/g, " ").trim().replace(/^· updated \\d+s ago$/, "· updated Ns ago"),
      box: [x, y + scrollY, width, height].map(Math.round),
      color: style.color,
      font: [style.fontFamily.split(",")[0].replace(/["']/g, "").trim(), style.fontSize, style.fontWeight, style.fontStyle, style.textTransform, style.letterSpacing].join(" "),
      // A border in the panel's own color doesn't show.
      panel: behind.borderTopWidth === "0px" || behind.borderTopColor === behind.backgroundColor ? behind.backgroundColor : [behind.backgroundColor, behind.borderTopColor, behind.borderTopWidth].join(" "),
    };
  })`;

/** Resolves once every font face the page declares has loaded. */
const FONTS_LOADED = `Promise.all([...document.fonts].map((face) => face.load())).then(() => document.fonts.ready).then(() => true)`;

/**
 * Swaps a mockup's Google Fonts stylesheet for the font files the view bundles (view/src/main.ts),
 * so the comparison measures layout and type, not two builds of the same fonts, and needs no network.
 */
const VIEW_FONTS = ["instrument-serif/latin-400", "instrument-serif/latin-ext-400", "inter/latin-400", "inter/latin-ext-400", "inter/latin-500", "inter/latin-ext-500", "inter/latin-600", "inter/latin-ext-600", "jetbrains-mono/latin-400", "jetbrains-mono/latin-ext-400"]
  .map((name) => new URL(`../../node_modules/@fontsource/${name}.css`, import.meta.url).href);
const USE_VIEW_FONTS = `(async () => {
  document.querySelector('link[href^="https://fonts.googleapis.com/"]').remove();
  await Promise.all(${JSON.stringify(VIEW_FONTS)}.map((href) => new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href, onload: resolve, onerror: () => reject(new Error(href)) });
    document.head.append(link);
  })));
  await ${FONTS_LOADED};
  // With subset fonts a ch falls back to 0.5em; the mockup's reference PNG measures it by the font's "0".
  for (const element of document.querySelectorAll('[style*="ch"]')) {
    const match = /max-width: ([\\d.]+)ch/.exec(element.getAttribute("style"));
    if (!match) continue;
    const zero = element.appendChild(Object.assign(document.createElement("span"), { textContent: "0", style: "position: absolute" }));
    element.style.maxWidth = match[1] * zero.getBoundingClientRect().width + "px";
    zero.remove();
  }
  return true;
})()`;

/** The text layout of a mockup, drawn with the view's fonts, after any `addition` to it runs. */
async function mockupLayout(mockup: string, clock: number, addition?: string): Promise<TextBox[]> {
  const drawn = await chrome.open(new URL(mockup, MOCKUPS).href, { clock, timeZone: TIME_ZONE });
  try {
    await drawn.waitFor(`document.readyState === "complete"`);
    if (addition) await drawn.evaluate(addition);
    await drawn.evaluate(USE_VIEW_FONTS);
    return await drawn.evaluate<TextBox[]>(TEXT_LAYOUT);
  } finally {
    await drawn.close();
  }
}

/** How far, in pixels, a text's box may sit from the mockup's: font rendering, not layout. */
const LAYOUT_TOLERANCE = 3;

/**
 * Each mockup text the view draws somewhere else, or in another color, type or panel, or not at
 * all; the nth occurrence of a text is matched with the nth in the view.
 */
function layoutDifferences(mockup: TextBox[], view: TextBox[]): string[] {
  const unmatched = [...view];
  const differences: string[] = [];
  for (const drawn of mockup) {
    const index = unmatched.findIndex((box) => box.text === drawn.text);
    if (index === -1) {
      differences.push(`"${drawn.text}" isn't drawn`);
      continue;
    }
    const [shown] = unmatched.splice(index, 1);
    const off = drawn.box.some((value, i) => Math.abs(value - shown!.box[i]!) > LAYOUT_TOLERANCE);
    if (off) differences.push(`"${drawn.text}" at ${shown!.box.join(",")}, drawn at ${drawn.box.join(",")}`);
    for (const key of ["color", "font", "panel"] as const) {
      if (shown![key] !== drawn[key]) differences.push(`"${drawn.text}" ${key} ${shown![key]}, drawn ${drawn[key]}`);
    }
  }
  return differences;
}

/** Opens the Details under a phase plan row, as a mockup draws them open. */
const openDetails = (page: BrowserPage, phaseId: string) => page.evaluate(`document.querySelector('li[data-phase="${phaseId}"] summary').click()`);

/** Each screen with the mockup it is drawn from, and lines of its copy that must read as drawn. */
const SCREENS: {
  name: string;
  mockup: string;
  snapshot: () => Snapshot;
  path?: string;
  clock?: number;
  copy: string[];
  /** Phases whose Details the mockup draws open. */
  open?: string[];
  /** Live text the current session is writing, sent once the screen is drawn. */
  partial?: { source: OutputLine["source"]; text: string };
  /** Mockup text the view draws differently on purpose, with what it draws instead. */
  decided?: Record<string, string>;
  /** A script that adds to the mockup what a later change decided and nobody drew, before it is measured. */
  addition?: string;
}[] = [
  {
    // The view's own choice of screen: a feature not started, with what Kiln found, opens on Documents found (AC-START-03).
    name: "documents-found",
    mockup: "kiln-screen-documents-found.html",
    snapshot: documentsFoundSnapshot,
    // Multi-repo AC-SPACE-03: v1's screen plus one line, under the worktree fields, in the
    // multi-repository screen's words; the v1 mockup gets the line where the view draws it.
    addition: `(() => {
      const pair = document.querySelector("#branch").closest('div[style*="grid"]');
      const field = Object.assign(document.createElement("div"), { style: "display: flex; flex-direction: column; gap: 6px" });
      pair.replaceWith(field);
      field.append(pair, Object.assign(document.createElement("span"), { style: "font-size: 12.5px; color: #8c8577", textContent: ${JSON.stringify(SESSIONS_ADD)} }));
      return true;
    })()`,
    copy: [
      "Repository acme-shop PRD folder docs/prds/customer-returns/ Customer returns Not started Review what Kiln found and how it will deliver, then start.",
      "PRD customer-returns-prd.md 14 acceptance criteria, AC-RET-01 to AC-RET-14 Technical design technical-design.md Cites all 14 criteria",
      "Every phase cites its criteria Dependencies point backward Working tree is clean",
      `${SESSIONS_ADD} Agent Claude Code`,
      "Keep this computer awake while a session works Stops idle sleep only.",
      "Starting lets Kiln Commit and push to feature/customer-returns Open one pull request into develop once every phase closes Never merge, deploy, or touch other branches Start",
    ],
  },
  {
    name: "documents-found-repositories",
    mockup: `${REPOSITORIES_MOCKUPS}kiln-screen-documents-found-repositories.html`,
    snapshot: documentsFoundRepositoriesSnapshot,
    copy: [
      "Repository product PRD folder docs/prds/customer-returns/ Customer returns Not started Review what Kiln found and how it will deliver, then start.",
      "Phase plan 6 phase docs 5 phases to implement, in this order 1 Return intake returns-api 2 Refund routing split into 2a and 2b returns-api 2a Card refunds returns-api 2b Store credit returns-api · storefront 3 Returns dashboard storefront 4 Restock check-in returns-api",
      "Every phase cites its criteria Dependencies point backward Named repositories found beside product Working tree of product is clean",
      "Holds a worktree of each repository below, all on the feature branch. Every phase works here in turn.",
      "Used in every repository. Repositories Branch from, and PR into product PRD’s repository",
      `${SESSIONS_ADD} Sessions follow each repository’s CLAUDE.md, but not its .claude/settings.json or hooks. Agent Claude Code`,
      "Pushes After every phase Ends at One PR in each repository that changed, ready for review. Kiln won’t merge.",
      "Starting lets Kiln In each repository, commit and push to feature/customer-returns In each repository, open one pull request into its base branch once every phase closes Never merge, deploy, or touch other branches Start",
    ],
  },
  {
    name: "running",
    mockup: "kiln-screen-running.html",
    // The mockup draws phase 2a's Details open.
    open: ["2a"],
    snapshot: runningSnapshot,
    copy: [
      "Repository acme-shop PRD folder docs/prds/customer-returns/ Customer returns Implementing phase 2b 2 of 5 phases done",
      "2b Now implementing · phase 2b of 5 Store credit Claude Code · Opus 5.5 · high effort Started 10:58 AM · 49 min",
      "Build Deliverable review Test hardening Commit Refactor pass Push",
      "Seen in the session: deliverable-review skill started · 2 min ago Watch live",
      "11:46:58 reviewer The credit multiplier is applied before rounding; checking that against… Details",
      "Phase plan 2 of 5 done 1 Return intake phase-1-return-intake.md 52m · pushed a1c4e09 Done Details 2 Refund routing phase-2-refund-routing.md Split into 2a, 2b 2a Card refunds phase-2a-card-refunds.md 48m · pushed 5d81b37 Done Details 2b Store credit phase-2b-store-credit.md 49m Implementing 3 Returns dashboard phase-3-returns-dashboard.md Planned 4 Restock check-in phase-4-restock-check-in.md Planned",
      "Claude account alex@acme-shop.dev Max plan · usage updated 2 min ago 5-hour window 82% Resets in 1h 12m Close to the limit. Pause after this phase to switch accounts. Weekly 41% Resets in 4d Weekly · Fable 6% Resets in 4d",
      "Settings for this PRD Model and effort changes apply from the next phase; phase 2b keeps what it started with. Model and effort Opus 5.5 · high effort Claude Code Change Keep awake While a session works Closing the lid can still put the computer to sleep. On The same for every phase Worktree, feature branch, and one PR into develop, set before the first phase. Each phase builds on the one before, so they can’t change.",
      "Pause Kiln Phase 2b, Store credit, finishes first, including its commit and push. Then Kiln starts no new phase until you press Start. Pause after this phase",
      "Kiln Connected Kiln is running in your terminal. Keep it open: Ctrl+C there interrupts the current phase, and kiln run picks up where it left off.",
    ],
  },
  {
    name: "phase-detail-live",
    mockup: "kiln-screen-phase-detail-live.html",
    snapshot: runningSnapshot,
    path: "/phase/2b",
    // The mockup's last line is the reviewer's text as it is being written.
    partial: { source: "reviewer", text: "The credit multiplier is applied before rounding; checking that against " },
    // Assumptions, item 11: Kiln can't see what the reviewer is reading, only that it works.
    // Live text is stamped with the page's clock, 11:47:00, where the mockup's sample reads 11:46:58.
    decided: { "deliverable-review skill started; its reviewer subagent is reading the changed files": "deliverable-review skill started; its reviewer subagent is working", "11:46:58": "11:47:00" },
    copy: [
      "All phases 2b Store credit Implementing Phase 2b of 5 · Claude Code · Started 10:58 AM · 49 min",
      "Session output LIVE Latest of 1,284 lines Load earlier",
      "11:44:02 tool Bash pytest tests/returns -k store_credit -q 11:44:09 out 23 passed in 4.81s 11:44:15 claude AC-RET-08 to AC-RET-10 have passing tests. Running deliverable review now. 11:44:16 skill Skill deliverable-review",
      "Progress Read from the session’s tool calls and Git Build implement-from-requirements skill started 10:58 skill call Deliverable review deliverable-review skill started; its reviewer subagent is working 11:44 skill call Test hardening Starts when the session calls the test-hardening skill Commit Kiln sees the session’s first git commit",
      "Pause after this phase Phase 2b still finishes its commit and push. Nothing is cut off mid-step.",
      "Session Session ID 7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04 Model and effort Opus 5.5 · high effort Started 10:58 AM · 49 min If the phase stops before it’s done, Kiln hands you the command that opens this exact session.",
      "Commits None for this phase yet. The feature commit comes after test hardening.",
    ],
  },
  {
    name: "paused",
    mockup: "kiln-screen-paused.html",
    // The mockup draws phase 2a's Details open.
    open: ["2a"],
    snapshot: pausedSnapshot,
    copy: [
      "Customer returns Paused 2 of 5 phases done",
      "Paused after phase 2a Next: phase 2b, Store credit Phase 2a, Card refunds, finished with its commit and push at 10:57 AM. Nothing is running. Change the model or effort first if you want; they apply to phase 2b. Start phase 2b",
      "2b Store credit phase-2b-store-credit.md Next",
      "Close to the limit. Switch accounts before you start the next phase.",
      "To switch accounts, run claude auth login in another terminal, then press Start. The next phase uses whichever account is signed in.",
      "Settings for this PRD Model and effort changes apply from the next phase you start.",
      "Kiln Connected Kiln is waiting in your terminal. Keep it open; Ctrl+C there closes Kiln, and kiln run picks up where it left off.",
    ],
  },
  {
    // v1's ended-with-message screen, with Resume, as usage-limit recovery redrew it (AC-RESUME-01 to 03).
    name: "needs-you-resume",
    mockup: `${RECOVERY_MOCKUPS}kiln-screen-needs-you-resume.html`,
    snapshot: needsYouMessageSnapshot,
    clock: Date.parse("2026-10-17T15:53:00Z"),
    addition: EMPTY_NOTE,
    copy: [
      "Customer returns Needs you Phase 2b · Store credit · Stopped 11:52 AM",
      "Phase 2b ended before it was done. Kiln doesn’t try to interpret why. This is how the session ended. exit 0 11:52 AM last skill seen: deliverable-review, 8 min earlier",
      "Last message from Claude Code Critical finding, stopping to surface: the reviewer found that develop has since added its own migration 0042 (gift cards), so this branch’s 0042_store_credits clashes with it.",
      "Full session output · 612 lines",
      "Let Kiln carry on Resume this session in Kiln Kiln checks Git first. If the phase isn’t done, it picks up the same session, with its full history, and tells it to carry on with Phase 2b. Then the plan continues as usual. Anything to tell the session first? Optional Resume Uses whichever Claude account is signed in now. Close the session first if you opened it in a terminal.",
      "Or pick it up yourself 1 Open the same Claude Code session in a terminal cd ~/devel/acme-shop-kiln/customer-returns claude --resume 7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04 Copy command Full history, right where it stopped. Kiln stays out of it.",
      "2 Finish the phase with Claude, the way you normally would Finish it however you like. Kiln only looks at the three checks on the right, so it doesn’t matter how the phase gets closed, committed and pushed.",
      "3 Come back and check again Kiln re-checks Git. If the phase is done, it starts the next one, or pauses first if you pressed Pause after this phase. Session can’t be opened? Copy a prompt for a fresh session instead",
      "Kiln continues when Phase doc closed Not yet No Closed line in phase-2b-store-credit.md Everything committed Not yet 12 files changed, not committed Pushed Yes Matches origin at 5d81b37 Check again Checked 11:52 AM. This is the same check Kiln runs after every phase. Later phases wait until it passes.",
    ],
  },
  {
    name: "needs-you-crashed",
    mockup: "kiln-screen-needs-you-crashed.html",
    snapshot: needsYouCrashedSnapshot,
    clock: Date.parse("2026-10-17T17:22:00Z"),
    addition: withResumeCard("Phase 3"),
    copy: [
      "Needs you Phase 3 · Returns dashboard · Stopped 1:21 PM",
      "Phase 3 ended before it was done. The session exited with an error and no final message. These are the last lines it wrote. exit 1 1:21 PM last skill seen: test-hardening, 6 min earlier",
      "13:20:51 claude Running the dashboard Playwright suite. It needs the dev server on 5173; starting it. 13:20:52 tool Bash npm run dev & 13:20:55 stderr Error: listen EADDRINUSE: address already in use :::5173 13:21:03 exit Process exited with code 1",
      "Full session output · 2,031 lines",
      "Phase doc closed Not yet No Closed line in phase-3-returns-dashboard.md Everything committed Yes Latest commit a41c9e2, tree clean Pushed Not yet a41c9e2 isn’t on origin yet Check again Checked 1:21 PM.",
    ],
  },
  {
    name: "needs-you-outside-workspace",
    mockup: `${REPOSITORIES_MOCKUPS}kiln-screen-needs-you-outside-workspace.html`,
    snapshot: needsYouOutsideWorkspaceSnapshot,
    clock: Date.parse("2026-10-17T17:21:00Z"),
    addition: withResumeCard("Phase 3"),
    copy: [
      "Customer returns Needs you Phase 3 · Returns dashboard · Stopped 1:20 PM",
      "Phase 3 ended before it was done. Kiln doesn’t try to interpret why. This is how the session ended. exit 0 1:20 PM last skill seen: refactor-pass, 2 min earlier",
      "Full session output · 1,148 lines",
      "1 Open the same Claude Code session in a terminal cd ~/devel/acme/.worktrees/customer-returns claude --resume 4d9a2c7e-1f53-4b8e-9a06-3c5e7b1d2f88 Copy command",
      "2 Ask it to bring its design-system work into the workspace While working on phase 3, you changed a checkout outside the Kiln workspace, the worktrees listed in your instructions: - Edited src/tokens/colors.ts in ~/devel/acme/design-system - Committed 6b0d2fa to main in ~/devel/acme/design-system",
      "Copy prompt Or deal with it however you like.",
      "3 Come back, confirm and check again Once what’s left in design-system’s own checkout is put back, tick the confirmation on the right and press Check again. If the phase is done, Kiln starts the next one, or pauses first if you pressed Pause after this phase.",
      "Stayed in the workspace No Edited src/tokens/colors.ts in ~/devel/acme/design-system Committed 6b0d2fa to main in ~/devel/acme/design-system Kiln changed nothing in that checkout, since it may hold other work too.",
      "The changes outside the workspace have been dealt with Covers every change outside the workspace up to when you tick it. Any later one fails the check again. Check again Checked 1:20 PM.",
    ],
  },
  {
    name: "complete",
    mockup: "kiln-screen-complete.html",
    snapshot: completeSnapshot,
    clock: Date.parse("2026-10-17T19:00:00Z"),
    copy: [
      "Customer returns PR ready for review 5 of 5 phases done · 5h 38m · Finished 2:55 PM",
      "Pull request #218 · feature/customer-returns → develop Customer returns: intake, refund routing, dashboard and restock 17 commits · +2,184 −312 Open on GitHub Human review is next. Kiln stops at “PR ready” and doesn’t merge.",
      "2b Store credit phase-2b-store-credit.md 1h 19m · finished by you · pushed 7f3a91c Done",
      "4 Restock check-in phase-4-restock-check-in.md 58m · pushed 0c4d8a2 Done Details PR Final pull request pull request session 9m Opened #218",
      "Settings for this PRD Set before the first phase. Agent Claude Code Each phase’s Details show the model and effort it ran with. Worktree ~/devel/acme-shop-kiln/customer-returns Kiln keeps it until you remove it.",
      "Kiln Connected Every phase is done. Ctrl+C in the terminal closes Kiln; the pull request and worktree stay.",
    ],
  },
  {
    name: "complete-repositories",
    mockup: `${REPOSITORIES_MOCKUPS}kiln-screen-complete-repositories.html`,
    snapshot: completeRepositoriesSnapshot,
    clock: Date.parse("2026-10-17T19:00:00Z"),
    // The mockup draws phase 2b's Details open.
    open: ["2b"],
    copy: [
      "Customer returns PR ready for review 5 of 5 phases done · 5h 38m · Finished 2:55 PM",
      "4 pull requests · feature/customer-returns One in each repository that changed product #12 PRD’s repository Customer returns: phase documents feature/customer-returns → main · 5 commits · +5 −0 Open on GitHub returns-api #57",
      "notifications #9 added in phase 2b Customer returns: store credit emails feature/customer-returns → main · 2 commits · +88 −8 Open on GitHub Human review is next. The pull requests say which to merge first. Kiln stops at “PR ready” and doesn’t merge.",
      "1 Return intake phase-1-return-intake.md 52m · pushed to 2 repositories Done",
      "2b Store credit phase-2b-store-credit.md 1h 19m · finished by you · pushed to 4 repositories Done",
      "PR Final pull request pull request session 9m Opened 4 pull requests",
      "Settings for this PRD Set before the first phase. Agent Claude Code Each phase’s Details show the model and effort it ran with. Workspace folder ~/devel/acme/.worktrees/customer-returns/ 4 repositories, one added in phase 2b Kiln keeps the folder and its worktrees until you remove them.",
      "Kiln Connected Every phase is done. Ctrl+C in the terminal closes Kiln; the pull requests and workspace stay.",
    ],
  },
];

describe("each screen in a real browser, from its mockup's sample data", () => {
  for (const screen of SCREENS) {
    it(`renders ${screen.name} as drawn, under Kiln's Content Security Policy (AC-LOOK-01)`, async () => {
      const clock = screen.clock ?? RUNNING_NOW;
      const { server, page } = await openScreen(screen.snapshot(), screen.path ?? "", clock);
      try {
        await page.waitFor(`document.body.innerText.includes(${JSON.stringify(screen.copy[0]!.split(" ").slice(-3).join(" "))})`);
        const text = await words(page);
        for (const line of screen.copy) expect(text).toContain(flat(line));
        // The feature name is the largest text on the screen (AC-LOOK-02).
        expect(await largestText(page)).toBe("Customer returns");
        expect(page.problems).toEqual([]);
        await saveScreenshots(screen.name, page, screen.mockup, clock);
      } finally {
        await page.close();
        await server.close();
      }
    });
  }

  for (const screen of SCREENS) {
    it(`lays out ${screen.name} as drawn: each text where the mockup puts it, in its color, type and panel (AC-LOOK-01)`, async () => {
      const clock = screen.clock ?? RUNNING_NOW;
      const mockup = await mockupLayout(screen.mockup, clock, screen.addition);
      const { server, page } = await openScreen(screen.snapshot(), screen.path ?? "", clock);
      try {
        await page.waitFor(`document.body.innerText.includes(${JSON.stringify(screen.copy[0]!.split(" ").slice(-3).join(" "))})`);
        for (const phaseId of screen.open ?? []) await openDetails(page, phaseId);
        if (screen.partial) {
          await page.waitFor(`document.body.innerText.includes(${JSON.stringify(PHASE_DETAIL_LINES.at(-1)!.text)})`);
          server.send("partial", { sessionId: screen.snapshot().current!.sessionId, ...screen.partial });
          await page.waitFor(`document.body.innerText.includes(${JSON.stringify(screen.partial.text.trim())})`);
        }
        await page.evaluate(FONTS_LOADED);
        const decided = mockup.map((box) => ({ ...box, text: screen.decided?.[box.text] ?? box.text }));
        expect(layoutDifferences(decided, await page.evaluate<TextBox[]>(TEXT_LAYOUT))).toEqual([]);
      } finally {
        await page.close();
        await server.close();
      }
    });
  }

  it("lays out disconnected as drawn, once Kiln stops while a phase works (AC-LOOK-01)", async () => {
    const mockup = await mockupLayout("kiln-screen-disconnected.html", RUNNING_NOW);
    const server = await serveViewFixture({ port: await nextPort(), folder: "customer-returns", snapshot: runningSnapshot(), heartbeatMs: 500 });
    const page = await chrome.open(server.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`);
      await server.close();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 20_000);
      // The mockup draws phase 2a's Details open.
      await openDetails(page, "2a");
      await page.evaluate(FONTS_LOADED);
      expect(layoutDifferences(mockup, await page.evaluate<TextBox[]>(TEXT_LAYOUT))).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("draws the Kiln panel's tick at the size the mockup renders it (AC-LOOK-01)", async () => {
    const tickSize = `(({ width, height }) => [width, height])(TICK.getBoundingClientRect())`;
    const drawn = await chrome.open(new URL("kiln-screen-running.html", MOCKUPS).href, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    await drawn.waitFor(`document.readyState === "complete"`);
    const mockupSize = await drawn.evaluate<number[]>(tickSize.replace("TICK", `[...document.querySelectorAll("span")].find((e) => e.getAttribute("style")?.includes("background: rgba(156, 196, 154, 0.12)"))`));
    await drawn.close();
    const { server, page } = await openScreen(runningSnapshot());
    try {
      await page.waitFor(`document.querySelector(".tick")`);
      expect(mockupSize).toEqual([24, 24]);
      expect(await page.evaluate<number[]>(tickSize.replace("TICK", `document.querySelector(".tick")`))).toEqual(mockupSize);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("draws a usage meter's width without an inline style, which the policy would block (AC-WATCH-08)", async () => {
    const { server, page } = await openScreen(runningSnapshot());
    try {
      await page.waitFor(`document.querySelector('[role="meter"]')`);
      const widths = await page.evaluate<string[]>(`[...document.querySelectorAll('[role="meter"] > div')].map((fill) => (fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width).toFixed(2))`);
      expect(widths).toEqual(["0.82", "0.41", "0.06"]);
      // The near limit is amber; the others are drawn in the muted tone (UI-001).
      const colors = await page.evaluate<string[]>(`[...document.querySelectorAll('[role="meter"] > div')].map((fill) => getComputedStyle(fill).backgroundColor)`);
      expect(colors).toEqual(["rgb(230, 180, 80)", "rgb(189, 182, 168)", "rgb(189, 182, 168)"]);
      expect(page.problems).toEqual([]);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("shows a final message's raw HTML as text, never as markup (AC-STOP-02)", async () => {
    const snapshot = needsYouMessageSnapshot();
    snapshot.needsYou!.finalMessage = 'Stopping here. <img src=x onerror="document.title=\'pwned\'"><script>document.title="pwned"</script> **Done**';
    const { server, page } = await openScreen(snapshot);
    try {
      await page.waitFor(`document.body.innerText.includes("Stopping here.")`);
      const text = await words(page);
      expect(text).toContain(flat(`Stopping here. <img src=x onerror="document.title='pwned'"><script>document.title="pwned"</script> Done`));
      expect(await page.evaluate<number>(`document.querySelectorAll("main img, main script").length`)).toBe(0);
      expect(await page.evaluate<string>("document.title")).toBe("Customer returns · Kiln");
    } finally {
      await page.close();
      await server.close();
    }
  });
});

describe("a Kiln that stops and comes back (AC-VIEW-04, AC-VIEW-07)", () => {
  it("says plainly it is disconnected, keeps the last snapshot with the phase shown as Interrupted, and restores the live view when Kiln returns", async () => {
    const thePort = await nextPort();
    let server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: runningSnapshot(), heartbeatMs: 500 });
    const page = await chrome.open(server.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`);
      expect(await words(page)).toMatch(/Connected to Kiln · updated \ds ago/i);

      await server.close();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 20_000);
      const lost = await words(page);
      expect(lost).toMatch(/Disconnected from Kiln · last seen 11:4\d AM/i);
      expect(lost).toContain(flat("Interrupted in phase 2b 2 of 5 phases done"));
      expect(lost).toMatch(/Kiln isn’t running Nothing is being worked on\. This page shows what Kiln last saw, at 11:4\d AM, in phase 2b\. Its work is kept\. To pick up where it left off, run this in a terminal: kiln run docs\/prds\/customer-returns\/ Copy command/i);
      expect(lost).toContain(flat("Last seen · phase 2b of 5 Store credit"));
      expect(lost).toContain(flat("2b Store credit phase-2b-store-credit.md 49m Interrupted"));
      expect(lost).toContain(flat("Settings for this PRD Settings can be changed again once Kiln is running."));
      expect(lost).toContain(flat("Kiln Disconnected The terminal running Kiln was closed or stopped. Controls come back when Kiln is running again."));
      expect(await largestText(page)).toBe("Customer returns");
      // Panels that are only a control or live data are hidden; controls that inform are disabled in place.
      expect(lost).not.toContain(flat("Pause Kiln"));
      expect(lost).not.toContain(flat("Claude account"));
      expect(lost).not.toContain(flat("Watch live"));
      expect(await page.evaluate<boolean[]>(`[...document.querySelectorAll("button")].filter((b) => ["Change"].includes(b.textContent.trim())).map((b) => b.disabled)`)).toEqual([true]);
      expect(await page.evaluate<boolean>(`document.querySelector('input[type="checkbox"]').disabled`)).toBe(true);

      server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: runningSnapshot(), heartbeatMs: 500 });
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`, 20_000);
      const back = await words(page);
      expect(back).toContain(flat("Implementing phase 2b"));
      expect(back).toContain(flat("Pause Kiln"));
      expect(back).not.toContain(flat("Kiln isn’t running"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("turns Needs you into the Disconnected layout, with no Check again, and back when Kiln returns (UI-006)", async () => {
    const thePort = await nextPort();
    const clock = Date.parse("2026-10-17T15:53:00Z");
    let server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: needsYouMessageSnapshot(), heartbeatMs: 500 });
    const page = await chrome.open(server.address, { clock, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Check again")`);
      await server.close();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 20_000);
      const lost = await words(page);
      expect(lost).toContain(flat("Kiln isn’t running Nothing is being worked on."));
      expect(lost).toContain(flat("2b Store credit phase-2b-store-credit.md Needs you"));
      expect(lost).not.toContain(flat("Check again"));
      expect(lost).not.toContain(flat("Pick it up yourself"));

      server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: needsYouMessageSnapshot(), heartbeatMs: 500 });
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`, 20_000);
      const back = await words(page);
      expect(back).toContain(flat("Check again"));
      expect(back).not.toContain(flat("Kiln isn’t running"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("keeps a live Phase detail on screen once disconnected, with its controls gone", async () => {
    const thePort = await nextPort();
    const server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: runningSnapshot(), output: PHASE_DETAIL_LINES, heartbeatMs: 500 });
    const page = await chrome.open(`${server.address}/phase/2b`, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("LIVE")`);
      await server.close();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 20_000);
      const text = await words(page);
      expect(text).toContain(flat("All phases 2b Store credit Interrupted"));
      expect(text).toContain(flat("23 passed in 4.81s"));
      expect(await page.evaluate<boolean>(`document.body.innerText.includes("LIVE")`)).toBe(false);
      expect(text).not.toContain(flat("Load earlier"));
      expect(text).not.toContain(flat("Pause after this phase"));
      expect(await page.evaluate<string>("location.pathname")).toBe("/customer-returns/phase/2b");
    } finally {
      await page.close();
    }
  });
});

describe("live output and the phase route", () => {
  it("shows Claude's text as it is written, then its finished line in its place (AC-WATCH-05)", async () => {
    const { server, page } = await openScreen(runningSnapshot(), "/phase/2b");
    try {
      await page.waitFor(`document.body.innerText.includes("Read src/returns/models.py")`);
      const sessionId = runningSnapshot().current!.sessionId;
      server.send("partial", { sessionId, source: "reviewer", text: "The credit multiplier " });
      server.send("partial", { sessionId, source: "reviewer", text: "is applied before rounding" });
      await page.waitFor(`document.body.innerText.includes("The credit multiplier is applied before rounding")`);
      server.send("output", { sessionId, lines: [{ line: 1284, at: "2026-10-17T15:46:58Z", source: "reviewer", text: "The credit multiplier is applied before rounding; checking that against the spec." }] });
      await page.waitFor(`document.body.innerText.includes("checking that against the spec.")`);
      const text = await words(page);
      expect(text.match(/the credit multiplier is applied before rounding/g)).toHaveLength(1);
      expect(text).toContain(flat("11:46:58 reviewer The credit multiplier is applied before rounding; checking that against the spec."));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("shows a stopped phase's Full session output: no LIVE badge, live text or pause, its time stopped at the session's end, and a way back to Needs you (AC-WATCH-10, UI-010 item 2)", async () => {
    const stopped = PHASE_DETAIL_LINES.map((line) => ({ ...line, line: line.line - 680 }));
    const { server, page } = await openScreen(needsYouMessageSnapshot(), "/phase/2b", Date.parse("2026-10-17T16:30:00Z"), stopped);
    try {
      await page.waitFor(`document.body.innerText.includes("23 passed in 4.81s")`);
      const text = await words(page);
      expect(text).toContain(flat("Needs you 2b Store credit Needs you Phase 2b of 5 · Claude Code · Started 10:58 AM · 54 min"));
      expect(text).toContain(flat("Session output Latest of 612 lines Load earlier"));
      expect(text).toContain(flat("Progress Read from the session’s tool calls and Git Build implement-from-requirements skill started 10:58 skill call Deliverable review deliverable-review skill started 11:44 skill call"));
      expect(text).toContain(flat("Session Session ID 7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04 Model and effort Opus 5.5 · high effort Started 10:58 AM · 54 min Commits None for this phase."));
      expect(await page.evaluate<boolean>(`document.body.innerText.includes("LIVE")`)).toBe(false);
      expect(text).not.toContain(flat("Pause after this phase"));
      expect(text).not.toContain(flat("its reviewer subagent is working"));
      // The stopped step keeps the current-step drawing, without the spinner.
      expect(await page.evaluate<number>(`document.querySelectorAll(".progress .spin").length`)).toBe(0);
      await page.evaluate(`[...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Needs you").click()`);
      await page.waitFor(`location.pathname === "/customer-returns" && document.body.innerText.includes("Phase 2b ended before it was done.")`);
      expect(page.problems).toEqual([]);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("keeps the lines already loaded when the live Phase detail turns into Full session output", async () => {
    const { server, page } = await openScreen(runningSnapshot(), "/phase/2b");
    try {
      await page.waitFor(`document.body.innerText.includes("23 passed in 4.81s")`);
      server.send("snapshot", needsYouMessageSnapshot());
      await page.waitFor(`document.querySelector("main a")?.textContent.trim() === "Needs you"`);
      expect(await page.evaluate<string>("location.pathname")).toBe("/customer-returns/phase/2b");
      expect(await words(page)).toContain(flat("11:44:09 out 23 passed in 4.81s"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("fetches the lines it missed while the event stream was down, once Kiln is back (AC-WATCH-05)", async () => {
    const thePort = await nextPort();
    let server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: runningSnapshot(), output: PHASE_DETAIL_LINES, heartbeatMs: 500 });
    const page = await chrome.open(`${server.address}/phase/2b`, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Read src/returns/models.py")`);
      await server.close();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 20_000);
      const missed = [
        { line: 1284, at: "2026-10-17T15:46:58Z", source: "reviewer" as const, text: "The credit multiplier is applied before rounding." },
        { line: 1285, at: "2026-10-17T15:47:30Z", source: "claude" as const, text: "Fixing the rounding order." },
      ];
      server = await serveViewFixture({ port: thePort, folder: "customer-returns", snapshot: runningSnapshot(), output: [...PHASE_DETAIL_LINES, ...missed], heartbeatMs: 500 });
      await page.waitFor(`document.body.innerText.includes("Fixing the rounding order.")`, 20_000);
      const text = await words(page);
      expect(text).toContain(flat("11:46:22 reviewer Read src/returns/models.py 11:46:58 reviewer The credit multiplier is applied before rounding. 11:47:30 claude Fixing the rounding order."));
      expect(text.match(/read src\/returns\/models\.py/g)).toHaveLength(1);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("turns a phase route that no longer applies into the progress view", async () => {
    const { server, page } = await openScreen(pausedSnapshot(), "/phase/2b");
    try {
      await page.waitFor(`location.pathname === "/customer-returns"`);
      expect(await words(page)).toContain(flat("Next: phase 2b, Store credit"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends Pause after this phase, then Keep going, to Kiln (AC-VIEW-02, AC-VIEW-03)", async () => {
    const { server, page } = await openScreen(runningSnapshot());
    try {
      await page.waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Pause after this phase"))`);
      await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Pause after this phase")).click()`);
      await waitUntil(() => server.commands.length === 1);
      const pending = runningSnapshot();
      pending.pause = { pending: true, active: false };
      server.send("snapshot", pending);
      await page.waitFor(`document.body.innerText.includes("Keep going cancels the pause.")`);
      expect(await words(page)).toContain(flat("Pause Kiln Kiln pauses once phase 2b, Store credit, is done, including its commit and push. Keep going cancels the pause. Keep going"));
      // The header doesn't change until the pause takes effect (UI-002).
      expect(await words(page)).toContain(flat("Implementing phase 2b"));
      await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Keep going")).click()`);
      await waitUntil(() => server.commands.length === 2);
      expect(server.commands).toEqual(["POST /api/pause", "DELETE /api/pause"]);
    } finally {
      await page.close();
      await server.close();
    }
  });
});

describe("the controls, in a real browser", () => {
  it("copies the resume command, and reveals and copies the fresh-session prompt (AC-STOP-05, AC-STOP-06)", async () => {
    const snapshot = needsYouMessageSnapshot();
    const { server, page } = await openScreen(snapshot, "", Date.parse("2026-10-17T15:53:00Z"));
    try {
      await page.waitFor(`document.body.innerText.includes("Copy command")`);
      await recordClipboard(page);
      await click(page, "Copy command");
      await page.waitFor(`window.__copied.length === 1`);
      expect(await copied(page)).toEqual([snapshot.needsYou!.resumeCommand]);
      await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Copy a prompt for a fresh session instead")).click()`);
      await page.waitFor(`window.__copied.length === 2`);
      expect((await copied(page))[1]).toBe(snapshot.needsYou!.freshSessionPrompt);
      // The prompt is shown too, with its own Copy prompt.
      expect(await words(page)).toContain(flat(`Prompt copied ${snapshot.needsYou!.freshSessionPrompt} Copy prompt`));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends Check again, and shows Kiln's reason when it refuses (AC-STOP-07, AC-VIEW-02)", async () => {
    const { server, page } = await openScreen(needsYouMessageSnapshot(), "", Date.parse("2026-10-17T15:53:00Z"), PHASE_DETAIL_LINES, { "POST /api/check-again": "Kiln is already checking." });
    try {
      await page.waitFor(`document.body.innerText.includes("Check again")`);
      await click(page, "Check again");
      await page.waitFor(`document.body.innerText.includes("Kiln is already checking.")`);
      expect(server.commands).toEqual(["POST /api/check-again"]);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends Resume with the note typed beside it, and shows Kiln's reason when it refuses (usage-limit recovery AC-RESUME-02, 03)", async () => {
    const { server, page } = await openScreen(needsYouMessageSnapshot(), "", Date.parse("2026-10-17T15:53:00Z"), PHASE_DETAIL_LINES, { "POST /api/resume": "Kiln is already checking." });
    try {
      await page.waitFor(`document.querySelector("textarea")`);
      await page.evaluate(`(() => { const box = document.querySelector("textarea"); box.value = "Renumber the migration to 0043, then carry on."; box.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await click(page, "Resume");
      await page.waitFor(`document.body.innerText.includes("Kiln is already checking.")`);
      expect(server.commands).toEqual([`POST /api/resume ${JSON.stringify({ note: "Renumber the migration to 0043, then carry on." })}`]);
      // While Kiln holds the stop for a check or a resume, neither button can be pressed.
      const held = needsYouMessageSnapshot();
      held.needsYou!.checking = true;
      server.send("snapshot", held);
      await page.waitFor(`[...document.querySelectorAll("button")].filter((e) => ["Resume", "Check again"].includes(e.textContent.trim())).every((e) => e.disabled)`);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends the confirmation that the changes outside the workspace were dealt with, and takes it back (multi-repo AC-OUTSIDE-03)", async () => {
    const { server, page } = await openScreen(needsYouOutsideWorkspaceSnapshot(), "", Date.parse("2026-10-17T17:21:00Z"));
    try {
      await page.waitFor(`document.querySelector("#outside-dealt-with")`);
      await page.evaluate(`document.querySelector("#outside-dealt-with").click()`);
      await waitUntil(() => server.commands.length === 1);
      await page.evaluate(`document.querySelector("#outside-dealt-with").click()`);
      await waitUntil(() => server.commands.length === 2);
      expect(server.commands).toEqual(["POST /api/outside-confirmation", "DELETE /api/outside-confirmation"]);
      // Ticked in Kiln's record, the snapshot shows it ticked.
      const ticked = needsYouOutsideWorkspaceSnapshot();
      ticked.needsYou!.outside!.confirmation.ticked = true;
      server.send("snapshot", ticked);
      await page.waitFor(`document.querySelector("#outside-dealt-with").checked`);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends Start from Paused (AC-VIEW-02, AC-VIEW-03)", async () => {
    const { server, page } = await openScreen(pausedSnapshot());
    try {
      await page.waitFor(`document.body.innerText.includes("Start phase 2b")`);
      await click(page, "Start phase 2b");
      await waitUntil(() => server.commands.length === 1);
      expect(server.commands).toEqual(["POST /api/start {}"]);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("saves each Documents found setting as it changes, and sends Start only once refinement is confirmed (AC-START-05, AC-START-06, AC-VIEW-02)", async () => {
    const { server, page } = await openScreen(documentsFoundSnapshot());
    try {
      await page.waitFor(`document.querySelector("#refined")`);
      const type = (id: string, value: string) =>
        page.evaluate(`(() => { const input = document.querySelector("#${id}"); input.focus(); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("input", { bubbles: true })); input.blur(); return true; })()`);
      const choose = (id: string, value: string) =>
        page.evaluate(`(() => { const select = document.querySelector("#${id}"); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
      await type("worktree", "~/elsewhere/returns");
      await type("branch", "feature/returns-v2");
      await choose("base", "main");
      await choose("model", "sonnet");
      await click(page, "Max");
      await page.evaluate(`document.querySelector("#awake").click()`);
      await waitUntil(() => server.commands.length >= 6);
      expect(server.commands).toEqual([
        'POST /api/settings {"worktreePath":"~/elsewhere/returns"}',
        'POST /api/settings {"featureBranch":"feature/returns-v2"}',
        'POST /api/settings {"baseBranch":"main"}',
        'POST /api/settings {"model":"sonnet"}',
        'POST /api/settings {"effort":"max"}',
        'POST /api/settings {"keepAwake":false}',
      ]);

      // Start stays unavailable until the person confirms the documents were refined.
      expect(await page.evaluate<boolean>(`document.querySelector("button.start").disabled`)).toBe(true);
      await page.evaluate(`document.querySelector("#refined").click()`);
      await page.waitFor(`!document.querySelector("button.start").disabled`);
      await click(page, "Start");
      await waitUntil(() => server.commands.length === 7);
      expect(server.commands.at(-1)).toBe('POST /api/start {"refinementConfirmed":true}');
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("saves the workspace folder, and each repository's base under its own name, from the multi-repository Documents found (multi-repo AC-REPO-03, AC-SPACE-01)", async () => {
    const { server, page } = await openScreen(documentsFoundRepositoriesSnapshot());
    try {
      await page.waitFor(`document.querySelector("#workspace")`);
      await page.evaluate(`(() => { const input = document.querySelector("#workspace"); input.focus(); input.value = "~/devel/acme/returns-work"; input.dispatchEvent(new Event("input", { bubbles: true })); input.blur(); return true; })()`);
      const choose = (id: string, value: string) =>
        page.evaluate(`(() => { const select = document.getElementById(${JSON.stringify(id)}); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
      await choose("base-returns-api", "main");
      await choose("base-product", "main");
      await waitUntil(() => server.commands.length >= 3);
      expect(server.commands).toEqual([
        'POST /api/settings {"workspaceFolder":"~/devel/acme/returns-work"}',
        'POST /api/settings {"bases":{"returns-api":"main"}}',
        'POST /api/settings {"baseBranch":"main"}',
      ]);
      // There is no worktree field: each worktree is <workspace folder>/<name>.
      expect(await page.evaluate<boolean>(`document.querySelector("#worktree") === null`)).toBe(true);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("shows the fields a partly failed Start set up as fixed, leaving the rest editable (multi-repo AC-SPACE-01)", async () => {
    const snapshot = documentsFoundRepositoriesSnapshot();
    snapshot.settings.fixed = { workspaceFolder: true, featureBranch: true, worktreePath: true };
    snapshot.repositories = snapshot.repositories.map((row) => (row.name === "storefront" ? row : { ...row, fixed: true }));
    snapshot.documents!.startError = "Couldn’t set up storefront’s worktree: fatal: could not create work tree dir";
    const { server, page } = await openScreen(snapshot);
    try {
      await page.waitFor(`document.querySelector("#workspace")`);
      const disabled = await page.evaluate<boolean[]>(`["workspace", "branch", "base-product", "base-returns-api", "base-storefront"].map((id) => document.getElementById(id).disabled)`);
      expect(disabled).toEqual([true, true, true, true, false]);
      expect(await words(page)).toContain(flat("Couldn’t set up storefront’s worktree: fatal: could not create work tree dir"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("sends Pause after this phase from the live Phase detail too (AC-VIEW-02)", async () => {
    const { server, page } = await openScreen(runningSnapshot(), "/phase/2b");
    try {
      await page.waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Pause after this phase"))`);
      await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Pause after this phase")).click()`);
      await waitUntil(() => server.commands.length === 1);
      expect(server.commands).toEqual(["POST /api/pause"]);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("changes the model and effort in place with Change, and keep-awake with its checkbox, each saved at once (AC-VIEW-08, UI-009)", async () => {
    const { server, page } = await openScreen(runningSnapshot());
    try {
      await page.waitFor(`document.body.innerText.includes("Change")`);
      await click(page, "Change");
      await page.waitFor(`document.querySelector("#change-model")`);
      expect(await words(page)).toContain(flat("Model and effort Opus 5.5 · high effort Claude Code Done Model Opus 5.5 Fable 5.1 Sonnet 5.5 Effort Low Medium High Extra high Max"));
      await page.evaluate(`const select = document.querySelector("#change-model"); select.value = "fable"; select.dispatchEvent(new Event("change", { bubbles: true })); true`);
      await click(page, "Max");
      await page.evaluate(`document.querySelector('input[type="checkbox"]').click()`);
      await waitUntil(() => server.commands.length === 3);
      expect(server.commands).toEqual(['POST /api/settings {"model":"fable"}', 'POST /api/settings {"effort":"max"}', 'POST /api/settings {"keepAwake":false}']);
      await click(page, "Done");
      await page.waitFor(`!document.querySelector("#change-model")`);
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("loads earlier output on request, before the lines already shown (AC-WATCH-05)", async () => {
    const many = Array.from({ length: 250 }, (_, index) => ({ line: index + 1, at: "2026-10-17T15:40:00Z", source: "out" as const, text: `output line ${index + 1}.` }));
    const snapshot = runningSnapshot();
    snapshot.current!.latestLine = many.at(-1)!;
    const { server, page } = await openScreen(snapshot, "/phase/2b", RUNNING_NOW, many);
    try {
      await page.waitFor(`document.body.innerText.includes("output line 250.")`);
      expect(await words(page)).toContain(flat("Latest of 250 lines Load earlier"));
      expect(await words(page)).not.toContain(flat("output line 50."));
      await click(page, "Load earlier");
      await page.waitFor(`document.body.innerText.includes("output line 1.")`);
      const text = await words(page);
      expect(text.indexOf(flat("output line 1."))).toBeLessThan(text.indexOf(flat("output line 51.")));
      // Every line is there now, so nothing earlier is offered.
      expect(text).not.toContain(flat("Load earlier"));
    } finally {
      await page.close();
      await server.close();
    }
  });

  it("links to the live output, the full output and the pull request (AC-WATCH-03, AC-WATCH-10, AC-PR-04)", async () => {
    const hrefOf = (page: BrowserPage, label: string) => page.evaluate<string>(`[...document.querySelectorAll("a")].find((a) => a.textContent.trim().startsWith(${JSON.stringify(label)})).getAttribute("href")`);
    for (const [snapshot, label, href] of [
      [runningSnapshot(), "Watch live", "/customer-returns/phase/2b"],
      [needsYouMessageSnapshot(), "Full session output", "/customer-returns/phase/2b"],
      [completeSnapshot(), "Open on GitHub", "https://github.com/acme/acme-shop/pull/218"],
    ] as const) {
      const { server, page } = await openScreen(snapshot);
      try {
        await page.waitFor(`document.body.innerText.includes(${JSON.stringify(label)})`);
        expect(await hrefOf(page, label)).toBe(href);
      } finally {
        await page.close();
        await server.close();
      }
    }
  });

  it("lists the commits made for a stopped phase on its Full session output (AC-WATCH-06)", async () => {
    const { server, page } = await openScreen(needsYouCrashedSnapshot(), "/phase/3", Date.parse("2026-10-17T17:22:00Z"), []);
    try {
      await page.waitFor(`document.body.innerText.includes("Returns dashboard")`);
      const text = await words(page);
      expect(text).toContain(flat("Commits a41c9e2 feat(returns): returns dashboard (phase 3)"));
      expect(text).toContain(flat("Test hardening test-hardening skill started 13:15 skill call"));
    } finally {
      await page.close();
      await server.close();
    }
  });
});

describe("what the screens never claim (AC-WATCH-11)", () => {
  it("shows an acceptance criterion's label only inside the session's own words", async () => {
    const complete = completeSnapshot();
    complete.pullRequests![0]!.title = "Customer returns (AC-RET-01 to AC-RET-14)";
    const completeAcross = completeRepositoriesSnapshot();
    completeAcross.pullRequests![1]!.title = "Customer returns: intake (AC-RET-01 to AC-RET-04)";
    // Every screen that shows a session or its outcome, connected and not.
    for (const [snapshot, path, connected] of [
      [runningSnapshot(), "", true],
      [runningSnapshot(), "", false],
      [runningSnapshot(), "/phase/2b", true],
      [pausedSnapshot(), "", true],
      [needsYouMessageSnapshot(), "", true],
      [needsYouCrashedSnapshot(), "", true],
      [needsYouCrashedSnapshot(), "/phase/3", true],
      [complete, "", true],
      [completeAcross, "", true],
      [runningRepositoriesSnapshot(), "", true],
      [needsYouRepositoriesSnapshot(), "/phase/3", true],
    ] as const) {
      const { server, page } = await openScreen(snapshot, path);
      try {
        await page.waitFor(`document.querySelector("h1")`);
        await page.waitFor(`document.body.innerText.includes("Customer returns")`);
        if (!connected) {
          await server.close();
          await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`);
        }
        // A criterion's label, or a claim that criteria are met or tested, only inside the session's own words.
        const outside = await page.evaluate<string[]>(`(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const found = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const claim = /AC-[A-Z]+-\\d+/.test(node.textContent) || /\\bcriteri(on|a)\\b.*\\b(met|tested|pass(ed|es|ing)?|covered|proven)\\b/i.test(node.textContent);
            if (claim && !node.parentElement.closest(".lines, .latest, .final, .pr h2, .pr-title")) found.push(node.textContent.trim());
          }
          return found;
        })()`);
        expect(outside, `${snapshot.feature.state} ${path}`).toEqual([]);
      } finally {
        await page.close();
        await server.close();
      }
    }
  });
});

describe("the look (AC-LOOK-04)", () => {
  it("gives each color one role and draws the Enso Method's type", async () => {
    const { server, page } = await openScreen(runningSnapshot(), "/phase/2b");
    try {
      await page.waitFor(`document.body.innerText.includes("23 passed in 4.81s")`);
      const style = (selector: string, property: string) => page.evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`);
      expect(await style("h1", "fontFamily")).toMatch(/^"Instrument Serif"/);
      expect(await style("body", "fontFamily")).toMatch(/^Inter/);
      expect(await style(".lines", "fontFamily")).toMatch(/^"JetBrains Mono"/);
      // Red: the phase in progress and links.
      expect(await style(".circle", "backgroundColor")).toBe("rgb(226, 105, 79)");
      expect(await style(".pill", "backgroundColor")).toBe("rgb(226, 105, 79)");
      // Session output labels as the mockups color them (UI-010 item 1: subagent like tool).
      const labels = await page.evaluate<Record<string, string>>(`Object.fromEntries([...document.querySelectorAll(".lines .source")].map((label) => [label.textContent, getComputedStyle(label).color]))`);
      expect(labels).toEqual({ tool: "rgb(140, 133, 119)", out: "rgb(156, 196, 154)", claude: "rgb(226, 105, 79)", skill: "rgb(237, 232, 221)", reviewer: "rgb(230, 180, 80)" });
    } finally {
      await page.close();
      await server.close();
    }
    const running = await openScreen(runningSnapshot());
    try {
      await running.page.waitFor(`document.querySelector(".watch")`);
      const style = (selector: string, property: string) => running.page.evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`);
      expect(await style(".watch", "color")).toBe("rgb(226, 105, 79)");
      expect(await style('input[type="checkbox"]', "accentColor")).toBe("rgb(226, 105, 79)");
      // Green: done and connected.
      expect(await style("[data-phase='1'] .pill", "color")).toBe("rgb(156, 196, 154)");
      expect(await style(".dot.connected", "backgroundColor")).toBe("rgb(156, 196, 154)");
      // Amber, once Kiln is gone: the disconnected Kiln and the phase it was working on, now Interrupted.
      await running.server.close();
      await running.page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`);
      expect(await style(".lost", "color")).toBe(AMBER);
      expect(await style("[data-phase='2b'] .pill", "color")).toBe(AMBER);
    } finally {
      await running.page.close();
      await running.server.close();
    }

    // Amber what needs the person, green what passed: Needs you and its checks.
    const stopped = await openScreen(needsYouMessageSnapshot(), "", Date.parse("2026-10-17T15:53:00Z"));
    try {
      await stopped.page.waitFor(`document.querySelector(".verdict")`);
      const verdicts = await stopped.page.evaluate<[string, string][]>(`[...document.querySelectorAll(".verdict")].map((v) => [v.textContent, getComputedStyle(v).color])`);
      expect(verdicts).toEqual([["Not yet", AMBER], ["Not yet", AMBER], ["Yes", GREEN]]);
      expect(await stopped.page.evaluate<string>(`getComputedStyle(document.querySelector("main .pill")).backgroundColor`)).toBe(AMBER);
    } finally {
      await stopped.page.close();
      await stopped.server.close();
    }

    // The crashed session's stderr and exit labels, as the crashed mockup colors them.
    const crashed = await openScreen(needsYouCrashedSnapshot(), "", Date.parse("2026-10-17T17:22:00Z"));
    try {
      await crashed.page.waitFor(`document.querySelector(".lines .source")`);
      const labels = await crashed.page.evaluate<Record<string, string>>(`Object.fromEntries([...document.querySelectorAll(".lines .source")].map((label) => [label.textContent, getComputedStyle(label).color]))`);
      expect(labels).toMatchObject({ stderr: AMBER, exit: "rgb(237, 232, 221)" });
    } finally {
      await crashed.page.close();
      await crashed.server.close();
    }

    // Amber the confirmation still to give, green the checks that passed: Documents found.
    const found = await openScreen(documentsFoundSnapshot());
    try {
      await found.page.waitFor(`document.querySelector("#refined")`);
      expect(await found.page.evaluate<string>(`getComputedStyle(document.querySelector("#refined")).accentColor`)).toBe(AMBER);
      const marks = await found.page.evaluate<string[]>(`[...document.querySelectorAll(".checks svg")].map((mark) => getComputedStyle(mark).stroke)`);
      expect(marks.length).toBe(3);
      for (const mark of marks) expect(mark).toBe(GREEN);
    } finally {
      await found.page.close();
      await found.server.close();
    }
  });
});

describe("a Kiln that hangs with the stream open (AC-VIEW-07)", () => {
  it("shows Disconnected once no heartbeat has come for 15 seconds", async () => {
    const server = await serveViewFixture({ port: await nextPort(), folder: "customer-returns", snapshot: runningSnapshot(), heartbeatMs: 0 });
    const page = await chrome.open(server.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`);
      const connectedAt = Date.now();
      await page.waitFor(`document.body.innerText.includes("Disconnected from Kiln")`, 25_000);
      expect(Date.now() - connectedAt).toBeGreaterThan(12_000);
      expect(await words(page)).toContain(flat("Interrupted in phase 2b"));
    } finally {
      await page.close();
      await server.close();
    }
  }, 60_000);
});

describe("the view against Kiln's own server and engine (AC-VIEW-04, AC-VIEW-06)", () => {
  it("connects with the page's token and Origin, its controls reach the engine, and the engine's changes reach it without a reload", async () => {
    const harness = await createHarness({ sessions: [] });
    const release = join(harness.sandbox.root, "release");
    writeFileSync(harness.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }] }));
    await harness.engine.start({ refinementConfirmed: true });
    await waitFor(() => harness.claudeCalls().length === 1);
    const server = await startLocalServer({ engine: harness.engine, port: await nextPort(), folderName: "customer-returns", featureName: "Customer returns", token: harness.engine.record.token });
    const page = await chrome.open(server.address, { timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.body.innerText.includes("Connected to Kiln")`);
      await page.waitFor(`document.body.innerText.includes("Implementing phase 1")`);
      // The person's click reaches the engine through the real API, with the page's own token and Origin.
      await page.evaluate(`document.querySelector('input[type="checkbox"]').click()`);
      await waitFor(() => harness.engine.record.settings.keepAwake === false);
      await page.waitFor(`document.body.innerText.includes("to sleep.\\nOff")`);
      // A change the engine makes reaches the open page.
      await harness.engine.changeSettings({ keepAwake: true });
      await page.waitFor(`document.querySelector('input[type="checkbox"]').checked === true`);
      expect(page.problems).toEqual([]);
      // Closing the browser mid-phase has no effect on Kiln: the phase still lands (AC-KEEP-01).
      await page.close();
      writeFileSync(release, "");
      await harness.engine.settled();
      expect(harness.engine.record.phases["1"]?.doneAt).toBeDefined();
    } finally {
      await page.close().catch(() => undefined);
      await server.close();
      writeFileSync(release, "");
      await harness.engine.settled();
      await harness.cleanup();
    }
  });
});

describe("the progress screen's layout (AC-WATCH-01, AC-WATCH-03)", () => {
  it("lists every phase at one level, a split phase's children included, under a current-phase panel as wide as the page's content", async () => {
    const { server, page } = await openScreen(runningSnapshot());
    try {
      await page.waitFor(`document.querySelector("[data-phase='2b']")`);
      const rows = await page.evaluate<[string, number][]>(`[...document.querySelectorAll("[data-phase]")].map((row) => [row.dataset.phase, Math.round(row.getBoundingClientRect().left)])`);
      expect(rows.map(([id]) => id)).toEqual(["1", "2", "2a", "2b", "3", "4"]);
      expect(new Set(rows.map(([, left]) => left)).size).toBe(1);
      const widths = await page.evaluate<{ now: number; content: number; nowBottom: number; planTop: number }>(`(() => {
        const main = document.querySelector("main");
        const style = getComputedStyle(main);
        const now = document.querySelector("section.now").getBoundingClientRect();
        return { now: Math.round(now.width), content: Math.round(main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)), nowBottom: now.bottom, planTop: document.querySelector("section.plan").getBoundingClientRect().top };
      })()`);
      expect(widths.now).toBe(widths.content);
      expect(widths.nowBottom).toBeLessThanOrEqual(widths.planTop);
    } finally {
      await page.close();
      await server.close();
    }
  });
});

describe("the look, beyond the progress screen (AC-LOOK-04)", () => {
  it("draws the dark theme, an error in amber, and a subagent's label in the tool's grey", async () => {
    const found = await openScreen(documentsFoundSnapshot({ settings: { fieldErrors: { featureBranch: "That branch already exists." } } }));
    try {
      await found.page.waitFor(`document.body.innerText.includes("That branch already exists.")`);
      const style = (selector: string, property: string) => found.page.evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`);
      expect(await style("body", "backgroundColor")).toBe("rgb(18, 17, 14)");
      expect(await found.page.evaluate<string>(`getComputedStyle([...document.querySelectorAll(".message")].find((m) => m.textContent.includes("That branch already exists."))).color`)).toBe(AMBER);
    } finally {
      await found.page.close();
      await found.server.close();
    }
    const lines = [...PHASE_DETAIL_LINES, { line: PHASE_DETAIL_LINES.length + 1, at: "2026-10-17T15:46:59Z", source: "subagent" as const, text: "Reading the store-credit tests." }];
    const detail = await openScreen(runningSnapshot(), "/phase/2b", RUNNING_NOW, lines);
    try {
      await detail.page.waitFor(`document.body.innerText.includes("Reading the store-credit tests.")`);
      const labels = await detail.page.evaluate<Record<string, string>>(`Object.fromEntries([...document.querySelectorAll(".lines .source")].map((label) => [label.textContent, getComputedStyle(label).color]))`);
      expect(labels.subagent).toBe(labels.tool);
      expect(labels.tool).toBe("rgb(140, 133, 119)");
    } finally {
      await detail.page.close();
      await detail.server.close();
    }
  });
});
