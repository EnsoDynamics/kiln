# Kiln 1.0.3

Fixes for runs with early merges and development deployments turned on, where phases stopped
again and again on development evidence they could not or no longer needed to provide.

## Fixed

- **Phases already Closed before a run starts no longer stop it.** With early merges on, a fresh
  run stopped on every phase that was Closed before Start with "Phase N needs a current
  development-delivery assessment", and each had to be marked complete by hand. Only a Kiln
  session writes that assessment, so such a phase could never pass. A phase Closed before the
  run, that the run never touched, now owes no development evidence, as with early merges off.
- **Marking a phase complete now lasts past later commits.** A waived "needs a current
  development-delivery assessment" item stopped matching as soon as any repository got a new
  commit, so the waived phase stopped the run again when the next phase pushed its work, and
  again at final delivery. The waiver now holds until that phase's own documents change.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.3
```

Waivers saved by earlier versions were recorded against the repositories' commits, so a phase
waived before upgrading may stop once more; marking it complete again records a waiver that
lasts.
