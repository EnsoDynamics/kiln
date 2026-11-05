# PRD: Word tally

## Summary

`tally` is a small command-line tool that counts the lines, words and characters in text files, the way `wc` does, but with the same output on macOS, Linux and Windows and an optional JSON form for scripts. It is a Node.js script with no dependencies.

## Business Context

Notes and documentation are often checked for length in scripts that run on every operating system. `wc` differs between them (padding, character counting, and it isn't on Windows), so a script can't rely on its output. `tally` gives one output everywhere.

## Acceptance Criteria

### Counting

- [ ] **AC-TALLY-01 — Counts one file.** `node tally.js notes.txt` prints one line, `<lines> <words> <characters> notes.txt`, separated by single spaces, and exits 0. Lines are the number of newline characters (a Windows line ending counts once); words are runs of characters that aren't whitespace; characters are Unicode code points, so `é` and `😀` count as one each.
- [ ] **AC-TALLY-02 — A missing file is reported, and the rest still counted.** For a file that can't be read, `tally` prints `tally: <name>: no such file` to standard error, carries on with the other files, and exits 1 at the end.
- [ ] **AC-TALLY-03 — Several files, then a total.** Given several files, `tally` prints one line per file in the order given, then a last line `<lines> <words> <characters> total` summing the files it could read. With one file there is no total line.
- [ ] **AC-TALLY-04 — Standard input.** With no file names, `tally` counts standard input and prints `<lines> <words> <characters>` with no name.

### Output for scripts

- [ ] **AC-TALLY-05 — JSON output.** With `--json`, `tally` prints one JSON array instead of the lines: one object per input, `{ "name", "lines", "words", "characters" }`, with `name` set to `null` for standard input, followed by an object named `"total"` when there was more than one file. Errors still go to standard error.
- [ ] **AC-TALLY-06 — Usage.** `--help` prints how to use `tally` and exits 0. An option it doesn't know prints the same usage to standard error and exits 2.

## Out of Scope

Byte counts, the longest line, reading directories, and any options beyond `--json` and `--help`.
