# PRD: Slugify

## Summary

`slugify(title)` in `kiln-proof-api` turns a title into the slug used in links: `"Crème Brûlée, Twice!"` becomes `"creme-brulee-twice"`.

## Business Context

Links built from titles break or look garbled when the title has accents, punctuation or spaces. One function makes them the same way every time.

## Acceptance Criteria

- [ ] **AC-SLUG-01 — A title becomes a slug.** `slugify(title)` returns the title in lower case, with accented Latin letters folded to plain ones (`é` to `e`, `ß` to `ss`, `æ` to `ae`, `ø` to `o`, `œ` to `oe`, `ł` to `l`), each run of anything other than `a`–`z` and `0`–`9` replaced by one hyphen, and no hyphen at either end. An empty title, or one with nothing left, gives `""`.

## Out of Scope

Scripts other than Latin, length limits, and making slugs unique.
