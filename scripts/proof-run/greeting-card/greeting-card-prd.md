# PRD: Greeting card

## Summary

A greeting for a person's name, from the API service (`kiln-proof-api`), shown as a card by the web front end (`kiln-proof-web`). Names are tidied the same way everywhere, by one helper in the shared library (`kiln-proof-shared`). This PRD lives in `kiln-proof-plans`, which holds no code.

## Business Context

People type their names carelessly: extra spaces, all capitals, all lower case. The greeting should read the same whichever service shows it, so the tidying lives in one place that every service uses.

## Acceptance Criteria

- [ ] **AC-GREET-01 — The API greets a name.** `greeting(name)` in `kiln-proof-api` returns `{ message: "Hello, <name>!" }`. A missing name, or one that is empty once tidied, gives `{ message: "Hello, friend!" }`.
- [ ] **AC-GREET-02 — Names are tidied the same way everywhere.** Before greeting, a name loses its surrounding whitespace, each run of whitespace inside it becomes one space, and each word gets an upper-case first letter and lower-case rest: `"  ada   LOVELACE "` becomes `"Ada Lovelace"`. The API and the web front end use one implementation of this.
- [ ] **AC-GREET-03 — The web front end shows the greeting as a card.** `renderGreetingCard(name)` in `kiln-proof-web` returns `<h1 class="greeting">Hello, Ada Lovelace!</h1>` for `"ada lovelace"`, using the API's greeting, with `&`, `<`, `>`, `"` and `'` in the name escaped as HTML.

## Out of Scope

A server, network calls, and names in scripts other than Latin.
