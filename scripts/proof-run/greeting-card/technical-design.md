# Technical Design: Greeting card

## Overview

Three code repositories, checked out side by side (in a person's folder and in Kiln's workspace alike), each a Node.js 22 ES-module package with no dependencies, tested with Node's built-in runner (`node --test`). Each gets a `package.json` with `"type": "module"` and `"scripts": { "test": "node --test" }` the first time it is changed.

## Design Decisions

- **The greeting** (AC-GREET-01) is `greeting.js` in `kiln-proof-api`, exporting `greeting(name)`.
- **Tidying names** (AC-GREET-02) is `normalize-name.js` in **`kiln-proof-shared`**, the shared library, exporting `normalizeName(name)`; it lives there because more than one service uses it. `greeting` calls it first. No other repository has its own copy.
- **Using another repository's code:** the repositories always sit side by side, so a module imports another repository's by relative path from its own repository's root: `../kiln-proof-shared/normalize-name.js` from `kiln-proof-api`, `../kiln-proof-api/greeting.js` from `kiln-proof-web`.
- **The card** (AC-GREET-03) is `greeting-card.js` in `kiln-proof-web`, exporting `renderGreetingCard(name)`, which escapes the API's message and wraps it in the `<h1>`.
- **Merge order:** `kiln-proof-shared` first, then `kiln-proof-api`, then `kiln-proof-web`, since each imports the one before.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-GREET-01 | The greeting |
| AC-GREET-02 | Tidying names |
| AC-GREET-03 | The card |
