# Kiln 1.1.1

A delivery or test audit that adds completion phases no longer stops the whole run over a
question those phases don't depend on.

## Fixed

- **Added phases get built while a person answers.** An audit that appends completion phases
  can now also list items for a person. When the added work doesn't depend on them, Kiln builds
  it; when it does, the audit stops at Needs you as before.
- **Nothing left for a person goes missing.** Kiln keeps each open item and lists it in every
  later audit's prompt. Each later audit must settle it, saying how, or list it again, and Kiln
  refuses a report that leaves one out. Open items show on the audit's row and detail page, and
  settled ones appear once on the settling audit's page and in the final pull request.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.1
```
