# Technical Design: Word tally

## Overview

One ES module, `tally.js`, at the repository root, run with Node.js 22 or later. No dependencies. Tests use Node's built-in test runner: `node --test` runs `tally.test.js`, which calls the counting function directly and runs `tally.js` as a child process for the command-line behavior.

## Design Decisions

- **Counting** (AC-TALLY-01) is one pure function, `count(text)`, returning `{ lines, words, characters }`: `lines` counts `\n`; `words` is the number of matches of `/\S+/gu`; `characters` is `[...text].length`, so a code point outside the Basic Multilingual Plane counts once.
- **Files are read whole** as UTF-8 (`readFileSync`). A file that can't be read (missing, a directory, no permission) is reported as AC-TALLY-02 says, with the wording `no such file` for every such case.
- **Arguments** (AC-TALLY-06): `--json` and `--help` are the only options, in any position; any other argument starting with `-` is unknown. Everything else is a file name.
- **Output** (AC-TALLY-03, AC-TALLY-05): lines are joined with `\n` and end with one; the JSON form is `JSON.stringify(array)` on one line. The total, when there is one, sums only the files that were read.
- **Standard input** (AC-TALLY-04) is read whole with `readFileSync(0, "utf8")`.

## Package

`package.json` declares `"type": "module"`, `"bin": { "tally": "tally.js" }` and `"scripts": { "test": "node --test" }`. `README.md` shows each form of the command with its output.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-TALLY-01, 02 | Counting; Files are read whole |
| AC-TALLY-03, 04 | Output; Standard input |
| AC-TALLY-05 | Output |
| AC-TALLY-06 | Arguments |
