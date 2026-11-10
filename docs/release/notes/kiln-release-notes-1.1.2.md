# Kiln 1.1.2

A link in the requirements that Kiln can't follow no longer stops a run.

## Fixed

- **Broken links don't block a run.** A local Markdown link to a file that isn't in the
  repository, is outside it, is reached through a symbolic link or isn't a file used to stop
  Kiln before a phase started, with a message about the phase plan. Kiln now starts the work
  anyway. A run already stopped on such a link continues on its next Check again.
- **The agent is told.** Each phase session's prompt names the links Kiln couldn't follow and
  asks the agent to find the document if the phase needs it.
- **Documents found lists them once.** A neutral **Linked documents** item shows each link Kiln
  didn't follow and the document that holds it. It isn't a failed check, and Start stays
  available.

The PRD's own documents (the PRD, technical design, assumptions and phase documents) and the
`Superseded by:` / `Replaces:` pointers written in them still stop a run when missing, as before.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.2
```
