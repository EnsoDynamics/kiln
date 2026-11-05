// The session's final message drawn as CommonMark (paragraphs, emphasis, code, lists, links), as
// the Needs you mockup draws it, with raw HTML escaped and shown as text: the words are the
// session's own, unchanged, and only their Markdown is drawn (PRD AC-STOP-02, AC-STOP-04;
// technical design, "How a session ended").

import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt("commonmark", { html: false, linkify: false });

/**
 *   finalMessageHtml("**Done.** See `x`")  // "<p><strong>Done.</strong> See <code>x</code></p>\n"
 *   finalMessageHtml("<b>hi</b>")          // "<p>&lt;b&gt;hi&lt;/b&gt;</p>\n"
 */
export function finalMessageHtml(text: string): string {
  return markdown.render(text);
}
