# Kiln 1.1.4

A clean audit no longer stops a run on a question that is already waiting for you.

## Fixed

- **Open questions ride along instead of stopping the run.** When an audit leaves you
  something to decide, for example test rows that stayed below Adequate, every later audit
  must list that item again until it is settled. A delivery audit that found nothing left to
  build had no way to do that and still pass, so Kiln stopped at Needs you on the earlier
  question even though the test audit that comes next did not depend on it. A passing audit
  can now list an outstanding item again by its id, and Kiln goes on to the next audit with
  the item still shown as waiting for you. A passing audit still cannot add a new item.
- **Delivery still waits for every answer.** A test audit that changed only tests leads to
  final delivery, so it passes only once every item is settled; otherwise it stops at Needs
  you as before. A test audit that changed implementation goes back to a delivery audit and
  can carry open items with it.
- **`kiln help` matches.** The audit submission contract it shows, the audit session's
  instructions and Kiln's requirements now state the same rule.

## Upgrade

A run already stopped at Needs you this way stays stopped until you answer, because a result
Kiln recorded doesn't change. Runs started on 1.1.4 or later get the new behavior.

```sh
npm install -g @ensodynamics/kiln@1.1.4
```
