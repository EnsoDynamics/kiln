# Technical Design: Slugify

## Overview

`kiln-proof-api` is a Node.js 22 ES-module package with no dependencies, tested with `node --test`; it gets a `package.json` with `"type": "module"` and `"scripts": { "test": "node --test" }` if it doesn't have one.

## Design Decisions

- **Slugs** (AC-SLUG-01) are `slug.js` in `kiln-proof-api`, exporting `slugify(title)`.
- **Folding accents** is `fold-accents.js` in **`kiln-proof-shared`**, the shared library, exporting `foldAccents(text)`: `text.normalize("NFD")` with combining marks removed, plus the letters that don't decompose (`ß`, `æ`, `ø`, `œ`, `ł` and their capitals). It goes in the shared library, not in `kiln-proof-api`, because other services will fold accents too. `slugify` imports it by relative path, `../kiln-proof-shared/fold-accents.js`: the repositories always sit side by side.
- **Merge order:** `kiln-proof-shared` before `kiln-proof-api`.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-SLUG-01 | Slugs; Folding accents |
