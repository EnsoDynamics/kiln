# Kiln 1.2.0

The header shows what a whole PRD has cost so far, and the top bar says when npm has a newer
Kiln.

## Changed

- **The header shows the PRD's total time.** Once a PRD has started, every progress screen
  adds a **PRD total** line under the state: the running time and waiting time of the whole
  PRD so far, and when it started. Running time covers every session the PRD has run, its
  phases, audits, repairs and pull-request session; waiting time is the rest, including
  Needs you stops, usage-limit waits and pauses. The moving total goes up each minute, and
  the totals keep accumulating when added phases are continued or a run starts again after a
  missing folder. On Complete the line gives the span the PRD ran.
- **The top bar says when a newer Kiln is on npm.** Kiln asks the npm registry once when it
  starts, without holding up the page. When npm's latest release is newer than the running
  Kiln, an amber **v<version> available** pill appears beside the version. It opens the
  install command with a Copy button and a link to that release's notes. A development build
  never asks, and a Kiln newer than npm's shows nothing. The request names only Kiln's own
  package, and if npm can't be reached nothing is shown.

## Upgrade

A run keeps the Kiln it started with until it is started again.

```sh
npm install -g @ensodynamics/kiln@1.2.0
```
